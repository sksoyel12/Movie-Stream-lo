import asyncio
import unittest

from app.services.resilience import CircuitBreaker, CircuitOpenError, CircuitState


class CircuitBreakerTests(unittest.IsolatedAsyncioTestCase):
    async def test_opens_after_threshold_and_recovers_after_successful_probe(self) -> None:
        now = [100.0]
        breaker = CircuitBreaker(
            "test",
            failure_threshold=2,
            recovery_timeout_seconds=30,
            clock=lambda: now[0],
        )

        async def fail() -> None:
            raise OSError("downstream unavailable")

        for _ in range(2):
            with self.assertRaises(OSError):
                await breaker.call(fail)

        self.assertEqual(breaker.status()["state"], CircuitState.OPEN.value)
        with self.assertRaises(CircuitOpenError):
            await breaker.call(lambda: asyncio.sleep(0, result="unexpected"))

        now[0] += 30
        self.assertEqual(await breaker.call(lambda: "healthy"), "healthy")
        self.assertEqual(breaker.status()["state"], CircuitState.CLOSED.value)
        self.assertEqual(breaker.status()["consecutive_failures"], 0)

    async def test_open_circuit_uses_fallback_without_calling_operation(self) -> None:
        breaker = CircuitBreaker("test", failure_threshold=1)

        async def fail() -> None:
            raise OSError("downstream unavailable")

        with self.assertRaises(OSError):
            await breaker.call(fail)

        called = False

        async def operation() -> str:
            nonlocal called
            called = True
            return "live"

        self.assertEqual(await breaker.call(operation, fallback="cached"), "cached")
        self.assertFalse(called)

    async def test_only_matching_failures_open_circuit(self) -> None:
        breaker = CircuitBreaker("test", failure_threshold=1)

        async def invalid_request() -> None:
            raise ValueError("bad query")

        with self.assertRaises(ValueError):
            await breaker.call(invalid_request, failure_filter=lambda exc: isinstance(exc, OSError))

        self.assertEqual(breaker.status()["state"], CircuitState.CLOSED.value)


if __name__ == "__main__":
    unittest.main()
