from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

import redis.asyncio as aioredis
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError, TimeoutError as SQLAlchemyTimeoutError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.limiter import limiter
from app.services.resilience import (
    CircuitOpenError,
    DATABASE_BREAKER,
    circuit_statuses,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    import sys

    secret = settings.jwt_secret.get_secret_value()
    if len(secret) < 32:
        print("FATAL: JWT_SECRET must be at least 32 characters", file=sys.stderr)
        sys.exit(1)

    # T021: Pre-warm one connection so first request avoids cold-start
    from sqlalchemy import text

    from app.database import async_session_factory, engine

    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        import logging

        logging.getLogger(__name__).warning(
            "Database pre-warm failed; API will start in degraded mode",
            exc_info=True,
        )

    # Initialize Redis client for entitlement caching
    redis_client = aioredis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=5,
    )
    _app.state.redis = redis_client

    # Feature 016: Attempt to restore SimLive channels on startup (non-blocking)
    try:
        from app.services.simlive_manager import SimLiveManager

        await SimLiveManager.restore_running_channels()
    except ImportError:
        print("  [TSTV] SimLiveManager not yet implemented, skipping restore.")
    except Exception as e:
        print(f"  [TSTV] Warning: SimLive restore failed: {e}")

    # Feature 016 T052: Hourly catch-up expiry notification checker
    import asyncio
    import logging

    _notification_logger = logging.getLogger("app.notifications")

    async def _expiry_check_loop() -> None:
        """Run check_expiring_catchup() every hour."""
        while True:
            try:
                await asyncio.sleep(3600)  # 1 hour
                from app.services.notification_service import check_expiring_catchup

                async with async_session_factory() as session:
                    count = await check_expiring_catchup(session)
                    _notification_logger.info("Expiry check: %d notifications created", count)
            except asyncio.CancelledError:
                break
            except Exception:
                _notification_logger.exception("Expiry check failed")

    expiry_task = asyncio.create_task(_expiry_check_loop())

    # Feature 016 T056: Hourly segment cleanup
    _cleanup_logger = logging.getLogger("app.simlive.cleanup")

    async def _segment_cleanup_loop() -> None:
        """Run cleanup_old_segments for all channels every hour."""
        while True:
            try:
                await asyncio.sleep(3600)
                from app.services.simlive_manager import SimLiveManager

                result = SimLiveManager.cleanup_all()
                _cleanup_logger.info(
                    "Segment cleanup: %d channels, %d segments deleted, %d bytes freed",
                    result["channels_processed"],
                    result["total_segments_deleted"],
                    result["total_bytes_freed"],
                )
            except asyncio.CancelledError:
                break
            except Exception:
                _cleanup_logger.exception("Segment cleanup failed")

    cleanup_task = asyncio.create_task(_segment_cleanup_loop())

    # The TMDB compatibility proxy shares the same strict UTC-day feed window
    # as the mobile home screen. Revalidation is deliberately background-only:
    # no request can reshuffle a live feed before its 24-hour window expires.
    from app.services.feed_cache import daily_feed_cache

    feed_revalidation_task = asyncio.create_task(
        daily_feed_cache.revalidation_loop()
    )

    yield

    # Shutdown: cancel background tasks, close Redis, dispose engine
    for task in (expiry_task, cleanup_task, feed_revalidation_task):
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    await redis_client.aclose()
    await engine.dispose()


app = FastAPI(
    title="OTT Platform PoC",
    description="AI-Native OTT Streaming Platform - Proof of Concept",
    version="0.1.0",
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=settings.cors_origin_list != ["*"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-TMDB-API-Key"],
)

# Import and mount routers
from app.routers import (
    admin,
    analytics,
    auth,
    catalog,
    content_analytics,
    drm,
    epg,
    identity,
    offers,
    parental_controls,
    recommendations,
    tstv,
    viewing,
    viewing_time,
)
from app.routers import compatibility

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(identity.router, prefix="/api", tags=["S-Movie Identity"])
app.include_router(catalog.router, prefix="/api/v1/catalog", tags=["Catalog"])
app.include_router(offers.router, prefix="/api/v1/catalog", tags=["Offers"])
app.include_router(epg.router, prefix="/api/v1/epg", tags=["EPG"])
app.include_router(recommendations.router, prefix="/api/v1/recommendations", tags=["Recommendations"])
app.include_router(viewing.router, prefix="/api/v1/viewing", tags=["Viewing"])
app.include_router(parental_controls.router, prefix="/api/v1/parental-controls", tags=["Parental Controls"])
app.include_router(viewing_time.router, prefix="/api/v1/viewing-time", tags=["Viewing Time"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
# Feature 001: Content Analytics Agent
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])
app.include_router(content_analytics.router, prefix="/api/v1/content-analytics", tags=["Content Analytics"])
# Feature 016: TSTV — DRM ClearKey KMS + Time-Shifted TV
app.include_router(drm.router, prefix="/api/v1/drm", tags=["DRM"])
app.include_router(tstv.router, prefix="/api/v1/tstv", tags=["TSTV"])
# Feature 016: In-app notifications (catch-up expiry alerts)
from app.routers import notifications
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"])
# Feature 018: CDN Observability & Cache Management Dashboard
from app.routers import cdn
app.include_router(cdn.router, prefix="/api/v1/cdn", tags=["CDN"])
app.include_router(compatibility.router, prefix="/api", tags=["S MOVIE compatibility"])


@app.get("/health/live")
async def health_live():
    return {"status": "ok", "services": circuit_statuses()}


@app.get("/api/healthz")
async def artifact_health():
    """Always remain HTTP 200 while reporting downstream degradation."""
    services = circuit_statuses()
    degraded = any(item["state"] == "open" for item in services.values())
    return {
        "status": "degraded" if degraded else "ok",
        "services": services,
    }


async def _check_readiness():
    import asyncio

    from fastapi.responses import JSONResponse
    from sqlalchemy import text

    from app.database import async_session_factory

    try:
        async with async_session_factory() as session:
            await asyncio.wait_for(
                session.execute(text("SELECT 1")),
                timeout=5.0,
            )
        database_status = "ok"
    except Exception:
        database_status = "unreachable"

    services = circuit_statuses()
    checks = {
        "database": database_status,
        **{name: detail["state"] for name, detail in services.items()},
    }
    degraded = database_status != "ok" or any(
        state == "open" for name, state in checks.items() if name != "database"
    )
    response_status = 503 if database_status != "ok" else 200
    return JSONResponse(
        {
            "status": "degraded" if degraded else "ok",
            "checks": checks,
            "services": services,
        },
        status_code=response_status,
    )


@app.get("/health/ready")
async def health_ready():
    return await _check_readiness()


@app.get("/health")
async def health():
    return await _check_readiness()


@app.exception_handler(CircuitOpenError)
async def circuit_open_exception_handler(_request: Request, exc: CircuitOpenError):
    return JSONResponse(
        status_code=503,
        content={
            "detail": f"{exc.service} is temporarily unavailable",
            "retry_after_seconds": round(exc.retry_after_seconds, 2),
        },
        headers={"Retry-After": str(max(1, int(exc.retry_after_seconds)))},
    )


async def database_unavailable_exception_handler(_request: Request, _exc: Exception):
    """Expose transient database outages as 503 rather than server errors."""
    return JSONResponse(
        status_code=503,
        content={"detail": "Database is temporarily unavailable"},
    )


async def invalidated_database_connection_handler(_request: Request, exc: DBAPIError):
    if not exc.connection_invalidated:
        return JSONResponse(
            status_code=500,
            content={"detail": "Database operation failed"},
        )
    return JSONResponse(
        status_code=503,
        content={"detail": "Database is temporarily unavailable"},
    )


for _database_error_type in (
    OperationalError,
    InterfaceError,
    SQLAlchemyTimeoutError,
):
    app.add_exception_handler(
        _database_error_type,
        database_unavailable_exception_handler,
    )
app.add_exception_handler(DBAPIError, invalidated_database_connection_handler)
