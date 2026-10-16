"""Analytics router — client-side event ingestion."""

from uuid import uuid4

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.dependencies import CurrentUser, DB
from app.schemas.analytics import AnalyticsEventCreate
from app.services import analytics_service
from app.services.resilience import ANALYTICS_BREAKER

router = APIRouter()


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def ingest_analytics_event(
    body: AnalyticsEventCreate,
    user: CurrentUser,
    db: DB,
) -> dict:
    """Record an analytics event emitted by the client.

    Any authenticated user can emit events. Analytics is best-effort, so a
    telemetry/database outage must not fail the associated client action.
    """
    event = await ANALYTICS_BREAKER.call(
        lambda: analytics_service.ingest_event(db, user.id, body),
        fallback=None,
    )
    if event is None:
        try:
            await db.rollback()
        except Exception:
            pass
        return JSONResponse(
            status_code=202,
            content={"recorded": False, "queued": False},
        )

    return {"id": str(event.id), "recorded": True}
