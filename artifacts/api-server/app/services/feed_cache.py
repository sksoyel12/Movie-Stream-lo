"""Strict 24-hour feed cache shared by the TMDB compatibility proxy.

The home feed is intentionally frozen for a UTC calendar window.  Each
region/date gets a stable namespace such as ``feed_IN_2026-09-27`` and every
TMDB request made through the proxy is stored under that namespace.  This
keeps row ordering, IDs, and artwork paths stable for the entire window
instead of allowing independent mobile requests to reshuffle the home page.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

FEED_TTL_MS = 86_400_000
REVALIDATION_INTERVAL_SECONDS = 60

Loader = Callable[[], Awaitable[tuple[int, Any]]]


@dataclass
class _Entry:
    value: Any
    status_code: int
    saved_at_ms: int
    refreshing: bool = False


class DailyFeedCache:
    """In-process cache with date-scoped keys and serialized revalidation."""

    def __init__(self) -> None:
        self._entries: dict[str, _Entry] = {}
        self._loaders: dict[str, Loader] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def feed_key(region: str, now: datetime | None = None) -> str:
        current = now or datetime.now(UTC)
        return f"feed_{region.upper()}_{current.date().isoformat()}"

    @classmethod
    def request_key(
        cls,
        region: str,
        path: str,
        params: dict[str, str],
        now: datetime | None = None,
    ) -> str:
        feed_key = cls.feed_key(region, now)
        query = "&".join(f"{key}={params[key]}" for key in sorted(params))
        return f"{feed_key}:tmdb:{path.lstrip('/')}?{query}"

    @staticmethod
    def _now_ms() -> int:
        return time.time_ns() // 1_000_000

    def _is_fresh(self, entry: _Entry, now_ms: int) -> bool:
        return now_ms - entry.saved_at_ms < FEED_TTL_MS

    async def get_or_fetch(
        self,
        key: str,
        loader: Loader,
    ) -> tuple[int, Any, bool]:
        """Return a frozen value, fetching once on a cold/expired key.

        ``bool`` is true for a cache hit.  The lock only guards state
        transitions; the upstream request never blocks unrelated cache keys.
        """
        async with self._lock:
            self._loaders[key] = loader
            entry = self._entries.get(key)
            if entry and self._is_fresh(entry, self._now_ms()):
                return entry.status_code, entry.value, True
            if entry and entry.refreshing:
                return entry.status_code, entry.value, True
            if entry:
                entry.refreshing = True
            else:
                self._entries[key] = _Entry(
                    value=None,
                    status_code=200,
                    saved_at_ms=0,
                    refreshing=True,
                )

        try:
            status_code, value = await loader()
            if status_code < 400:
                async with self._lock:
                    self._entries[key] = _Entry(
                        value=value,
                        status_code=status_code,
                        saved_at_ms=self._now_ms(),
                    )
                return status_code, value, False
            return status_code, value, False
        except Exception:
            async with self._lock:
                stale = self._entries.get(key)
                if stale and stale.value is not None:
                    stale.refreshing = False
                    return stale.status_code, stale.value, True
            raise
        finally:
            async with self._lock:
                current = self._entries.get(key)
                if current:
                    current.refreshing = False

    async def revalidate_expired(self) -> int:
        """Refresh expired keys in the background, once per key."""
        async with self._lock:
            candidates = [
                (key, loader)
                for key, loader in self._loaders.items()
                if (entry := self._entries.get(key))
                and not self._is_fresh(entry, self._now_ms())
                and not entry.refreshing
                and loader is not None
            ]

        refreshed = 0
        for key, loader in candidates:
            async with self._lock:
                entry = self._entries.get(key)
                if not entry or entry.refreshing or self._is_fresh(entry, self._now_ms()):
                    continue
                entry.refreshing = True
            try:
                status_code, value = await loader()
                if status_code < 400:
                    async with self._lock:
                        self._entries[key] = _Entry(
                            value=value,
                            status_code=status_code,
                            saved_at_ms=self._now_ms(),
                        )
                        refreshed += 1
            except Exception:
                # Keep the expired snapshot available as a stale fallback.
                pass
            finally:
                async with self._lock:
                    entry = self._entries.get(key)
                    if entry:
                        entry.refreshing = False
        return refreshed

    async def revalidation_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(REVALIDATION_INTERVAL_SECONDS)
                await self.revalidate_expired()
            except asyncio.CancelledError:
                return


daily_feed_cache = DailyFeedCache()