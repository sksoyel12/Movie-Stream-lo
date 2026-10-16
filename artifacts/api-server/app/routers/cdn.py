"""CDN observability and cache management router.

Feature 018: GET /stats, GET /cache/keys, POST /cache/purge (admin-only).
"""

import re

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.dependencies import AdminUser
from app.services import cdn_service

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────


class PurgeRequest(BaseModel):
    key: str = Field(..., min_length=1, max_length=2048)


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/stats")
async def get_cdn_stats(_admin: AdminUser):
    """Return current CDN performance metrics from Prometheus."""
    try:
        return await cdn_service.get_cdn_stats()
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        )


@router.get("/cache/keys")
async def list_cache_keys(
    _admin: AdminUser,
    search: str | None = Query(None, max_length=256),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """List cached entries, optionally filtered by content ID or URI pattern."""
    if search and not re.match(r"^[a-zA-Z0-9/_.\-:]+$", search):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid search pattern",
        )
    return await cdn_service.list_cache_keys(search=search, limit=limit, offset=offset)


@router.post("/cache/purge")
async def purge_cache_key(_admin: AdminUser, body: PurgeRequest):
    """Purge a specific cache entry by its cache key."""
    try:
        return await cdn_service.purge_cache_key(body.key)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
