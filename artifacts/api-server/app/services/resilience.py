"""Small async circuit breakers and bounded stale-result cache.

This module provides the failure-isolation primitives used by HTTP and database
boundaries. It is intentionally dependency-free so it can also be exercised in
unit tests without starting the API server.
"""

from __future__ import annotations

import asyncio
import inspect
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import StrEnum
from threading import RLock
from typing import Any, TypeVar

T = TypeVar("T")
_MISSING = object()


class CircuitState(StrEnum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitOpenError(RuntimeError):
    """Raised when a request is rejected while a breaker is open."""

    def __init__(self, service: str, retry_after_seconds: float) -> None:
        self.service = service
        self.retry_after_seconds = max(0.0, retry_after_seconds)
        super().__init__(f"{service} circuit is open")


class CircuitBreaker:
    """Async circuit breaker with one half-open probe at a time."""

    def __init__(
        self,
        name: str,
        *,
        failure_threshold: int = 5,
        recovery_timeout_seconds: float = 30.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if failure_threshold < 1:
            raise ValueError("failure_threshold must be at least 1")
        if recovery_timeout_seconds <= 0:
            raise ValueError("recovery_timeout_seconds must be positive")

        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout_seconds = recovery_timeout_seconds
        self._clock = clock
        self._lock = asyncio.Lock()
        self._state = CircuitState.CLOSED
        self._consecutive_failures = 0
        self._total_failures = 0
        self._opened_at: float | None = None
        self._half_open_in_flight = False
        self._last_error: str | None = None

    async def call(
        self,
        operation: Callable[[], Awaitable[T] | T],
        *,
        fallback: Any = _MISSING,
        failure_filter: Callable[[Exception], bool] | None = None,
    ) -> T:
        """Run an operation, optionally returning a value/function on failure.

        ``failure_filter`` lets boundaries such as SQLAlchemy count only
        transient connectivity errors while allowing query/programming errors
        to propagate without opening the database circuit.
        """
        try:
            await self._acquire_permission()
        except CircuitOpenError as exc:
            if fallback is _MISSING:
                raise
            return await self._resolve_fallback(fallback, exc)

        try:
            result = operation()
            if inspect.isawaitable(result):
                result = await result
        except Exception as exc:
            should_count = failure_filter(exc) if failure_filter else True
            if should_count:
                await self._record_failure(exc)
            else:
                await self._record_success()
            if fallback is _MISSING:
                raise
            return await self._resolve_fallback(fallback, exc)

        await self._record_success()
        return result

    async def _acquire_permission(self) -> None:
        async with self._lock:
            now = self._clock()
            if self._state == CircuitState.OPEN:
                elapsed = now - (self._opened_at or now)
                if elapsed < self.recovery_timeout_seconds:
                    raise CircuitOpenError(
                        self.name,
                        self.recovery_timeout_seconds - elapsed,
                    )
                self._state = CircuitState.HALF_OPEN

            if self._state == CircuitState.HALF_OPEN:
                if self._half_open_in_flight:
                    raise CircuitOpenError(self.name, self.recovery_timeout_seconds)
                self._half_open_in_flight = True

    async def _record_failure(self, error: Exception) -> None:
        async with self._lock:
            self._total_failures += 1
            self._last_error = type(error).__name__
            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.OPEN
                self._opened_at = self._clock()
                self._half_open_in_flight = False
                return

            self._consecutive_failures += 1
            if self._consecutive_failures >= self.failure_threshold:
                self._state = CircuitState.OPEN
                self._opened_at = self._clock()

    async def _record_success(self) -> None:
        async with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.CLOSED
                self._opened_at = None
                self._half_open_in_flight = False
                self._consecutive_failures = 0
                self._last_error = None
            elif self._state == CircuitState.CLOSED:
                self._consecutive_failures = 0
                self._last_error = None

    async def _resolve_fallback(self, fallback: Any, error: Exception) -> Any:
        if callable(fallback):
            value = fallback(error)
            if inspect.isawaitable(value):
                return await value
            return value
        return fallback

    def status(self) -> dict[str, Any]:
        now = self._clock()
        retry_after = 0.0
        if self._state == CircuitState.OPEN and self._opened_at is not None:
            retry_after = max(
                0.0,
                self.recovery_timeout_seconds - (now - self._opened_at),
            )
        return {
            "state": self._state.value,
            "consecutive_failures": self._consecutive_failures,
            "failure_threshold": self.failure_threshold,
            "total_failures": self._total_failures,
            "retry_after_seconds": round(retry_after, 2),
            "half_open_probe_in_flight": self._half_open_in_flight,
            "last_error": self._last_error,
        }


@dataclass
class _CacheEntry:
    value: Any
    expires_at: float


class TTLResultCache:
    """Small bounded, process-local cache for stale response fallbacks."""

    def __init__(
        self,
        *,
        ttl_seconds: float = 60.0,
        max_entries: int = 512,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._clock = clock
        self._lock = RLock()
        self._entries: OrderedDict[str, _CacheEntry] = OrderedDict()

    def get(self, key: str, default: Any = None) -> Any:
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return default
            if entry.expires_at <= self._clock():
                self._entries.pop(key, None)
                return default
            self._entries.move_to_end(key)
            return entry.value

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._entries[key] = _CacheEntry(
                value=value,
                expires_at=self._clock() + self.ttl_seconds,
            )
            self._entries.move_to_end(key)
            while len(self._entries) > self.max_entries:
                self._entries.popitem(last=False)


DATABASE_BREAKER = CircuitBreaker("database")
TMDB_BREAKER = CircuitBreaker("tmdb_api")
TMDB_IMAGE_BREAKER = CircuitBreaker("tmdb_images")
RECOMMENDATIONS_BREAKER = CircuitBreaker("recommendations")
ANALYTICS_BREAKER = CircuitBreaker("analytics")
FIREBASE_BREAKER = CircuitBreaker("firebase_auth")

BREAKERS: dict[str, CircuitBreaker] = {
    breaker.name: breaker
    for breaker in (
        DATABASE_BREAKER,
        TMDB_BREAKER,
        TMDB_IMAGE_BREAKER,
        RECOMMENDATIONS_BREAKER,
        ANALYTICS_BREAKER,
        FIREBASE_BREAKER,
    )
}


def circuit_statuses() -> dict[str, dict[str, Any]]:
    """Return a health-safe snapshot of all downstream breakers."""
    return {name: breaker.status() for name, breaker in BREAKERS.items()}

