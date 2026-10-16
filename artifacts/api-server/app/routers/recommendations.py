"""Recommendations router -- home rails, similar titles, post-play."""

import logging
import uuid

from fastapi import APIRouter, Query

from app.dependencies import DB, OptionalVerifiedProfileId, VerifiedProfileId
from app.schemas.recommendation import ContentRail, ContentRailItem, HomeResponse
from app.services import recommendation_service
from app.services.rating_utils import resolve_profile_rating
from app.services.resilience import RECOMMENDATIONS_BREAKER, TTLResultCache

router = APIRouter()
logger = logging.getLogger(__name__)
_recommendation_cache = TTLResultCache(ttl_seconds=120, max_entries=512)
_MISSING = object()


async def _resilient_recommendation(key: str, operation, fallback):
    cached = _recommendation_cache.get(key, _MISSING)
    try:
        result = await RECOMMENDATIONS_BREAKER.call(operation)
    except Exception as exc:
        logger.warning(
            "Recommendation service degraded; using cached/default result (%s)",
            type(exc).__name__,
        )
        return cached if cached is not _MISSING else fallback
    _recommendation_cache.set(key, result)
    return result


@router.get("/home", response_model=HomeResponse)
async def home_rails(
    db: DB,
    profile_id: VerifiedProfileId,
):
    """Return assembled home-screen rails for a profile.

    Rails include: Continue Watching, For You, New Releases, Trending,
    and a top-genre rail (when viewing history exists).
    """
    async def load():
        allowed_ratings = await resolve_profile_rating(db, profile_id)
        raw_rails = await recommendation_service.get_home_rails(
            db,
            profile_id,
            allowed_ratings=allowed_ratings,
        )
        rails = [
            ContentRail(
                name=r["name"],
                rail_type=r["rail_type"],
                items=[ContentRailItem(**item) for item in r["items"]],
            )
            for r in raw_rails
        ]
        return HomeResponse(rails=rails)

    return await _resilient_recommendation(
        f"home:{profile_id}",
        load,
        HomeResponse(rails=[]),
    )


@router.get("/similar/{title_id}", response_model=list[ContentRailItem])
async def similar_titles(
    title_id: uuid.UUID,
    db: DB,
    limit: int = Query(12, ge=1, le=50),
    profile_id: OptionalVerifiedProfileId = None,
):
    """Return titles similar to the given title using embedding similarity."""
    async def load():
        allowed_ratings = None
        if profile_id is not None:
            allowed_ratings = await resolve_profile_rating(db, profile_id)
        items = await recommendation_service.get_similar_titles(
            db,
            title_id,
            limit=limit,
            allowed_ratings=allowed_ratings,
        )
        return [ContentRailItem(**item) for item in items]

    cache_scope = str(profile_id) if profile_id is not None else "public"
    return await _resilient_recommendation(
        f"similar:{cache_scope}:{title_id}:{limit}",
        load,
        [],
    )


@router.get("/post-play/{title_id}", response_model=list[ContentRailItem])
async def post_play(
    title_id: uuid.UUID,
    db: DB,
    profile_id: VerifiedProfileId,
    limit: int = Query(8, ge=1, le=20),
):
    """Post-play suggestions after finishing a title."""
    async def load():
        allowed_ratings = await resolve_profile_rating(db, profile_id)
        items = await recommendation_service.get_post_play(
            db,
            title_id,
            limit=limit,
            allowed_ratings=allowed_ratings,
        )
        return [ContentRailItem(**item) for item in items]

    return await _resilient_recommendation(
        f"post-play:{profile_id}:{title_id}:{limit}",
        load,
        [],
    )
