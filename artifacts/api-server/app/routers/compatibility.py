"""Compatibility endpoints used by the existing S MOVIE Expo client.

The imported OTT backend has its own /api/v1 API. These small first-party
routes preserve the artwork and catalog proxy contract that the existing mobile
app already uses, without exposing TMDB credentials in the client bundle.
"""

from __future__ import annotations

from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response

from app.config import settings
from app.services.feed_cache import daily_feed_cache
from app.services.resilience import (
    CircuitOpenError,
    TMDB_BREAKER,
    TMDB_IMAGE_BREAKER,
)

router = APIRouter()

TMDB_BASE = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p"
ALLOWED_IMAGE_HOSTS = {"image.tmdb.org", "www.image.tmdb.org"}


def _secret_value(secret: object) -> str:
    """Read a SecretStr defensively without leaking or calling it as a string."""
    getter = getattr(secret, "get_secret_value", None)
    if not callable(getter):
        return ""
    try:
        return str(getter()).strip()
    except Exception:
        return ""


def _tmdb_keys() -> list[str]:
    keys: list[str] = []
    for secret in (settings.tmdb_api_key, settings.tmdb_backup_api_key):
        value = _secret_value(secret)
        if value and value not in keys:
            keys.append(value)
    return keys


def _tmdb_key() -> str:
    keys = _tmdb_keys()
    if not keys:
        raise HTTPException(status_code=503, detail="TMDB proxy is not configured")
    return keys[0]


async def _tmdb_get_uncached(
    path: str,
    params: dict[str, str],
    client_api_key: str | None = None,
) -> httpx.Response:
    keys = _tmdb_keys()
    if not keys and client_api_key and client_api_key.strip():
        keys = [client_api_key.strip()]
    if not keys:
        raise HTTPException(status_code=503, detail="TMDB proxy is not configured")

    async def request() -> httpx.Response:
        async with httpx.AsyncClient(timeout=15.0) as client:
            for index, key in enumerate(keys):
                query = {"api_key": key, **params}
                response = await client.get(
                    f"{TMDB_BASE}/{path.lstrip('/')}",
                    params=query,
                )
                # If TMDB rejects the primary credential, retry once with the
                # configured backup before returning an auth failure.
                if response.status_code in {401, 403} and index < len(keys) - 1:
                    continue
                if response.status_code == 429 or response.status_code >= 500:
                    raise httpx.HTTPStatusError(
                        f"TMDB returned HTTP {response.status_code}",
                        request=response.request,
                        response=response,
                    )
                return response
        raise HTTPException(status_code=503, detail="TMDB proxy is not configured")

    try:
        return await TMDB_BREAKER.call(request)
    except CircuitOpenError as exc:
        raise HTTPException(
            status_code=503,
            detail="TMDB upstream is temporarily unavailable",
            headers={"Retry-After": str(max(1, int(exc.retry_after_seconds)))},
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="TMDB upstream is temporarily unavailable",
        ) from exc


async def _tmdb_get_cached(
    path: str,
    params: dict[str, str],
    region: str,
    client_api_key: str | None = None,
) -> tuple[int, dict]:
    cache_key = daily_feed_cache.request_key(region, path, params)

    async def loader() -> tuple[int, dict]:
        upstream = await _tmdb_get_uncached(path, params, client_api_key)
        try:
            payload = upstream.json()
        except ValueError:
            payload = {"detail": upstream.text}
        return upstream.status_code, payload

    status_code, payload, _ = await daily_feed_cache.get_or_fetch(cache_key, loader)
    return status_code, payload


@router.get("/tmdb/config")
async def tmdb_config() -> dict[str, bool]:
    return {"images": True, "api": bool(_tmdb_keys())}


@router.get("/version")
async def app_version() -> dict[str, str | int | bool | None]:
    """Public release policy used by the mobile client's update gate."""
    return {
        "version": settings.app_version,
        "versionCode": settings.app_version_code,
        "releaseNotes": settings.app_release_notes,
        "apkUrl": settings.app_apk_url,
        "forceUpdate": settings.app_force_update,
        "minSupportedVersion": settings.app_min_supported_version,
        "expiresAt": settings.app_update_expires_at,
    }


@router.get("/tmdb/{path:path}")
async def tmdb_proxy(path: str, request: Request) -> JSONResponse:
    """Proxy arbitrary GET requests to TMDB while preserving query parameters."""
    # ``region`` is also a legitimate TMDB parameter for trending/discover
    # requests, so preserve it upstream. A future client may provide the feed
    # namespace explicitly with ``feed_region`` or the request header.
    region = (
        request.headers.get("x-user-region")
        or request.query_params.get("feed_region")
        or request.query_params.get("region")
        or "IN"
    ).upper()[:8]
    params = {
        key: value
        for key, value in request.query_params.multi_items()
        if key not in {"api_key", "_", "feed_region"}
    }
    status_code, payload = await _tmdb_get_cached(
        path,
        params,
        region,
        request.headers.get("x-tmdb-api-key"),
    )
    return JSONResponse(
        content=payload,
        status_code=status_code,
        headers={
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
            "X-Feed-Cache-Key": daily_feed_cache.feed_key(region),
        },
    )


@router.get("/image")
async def image_proxy(url: str = Query(min_length=1, max_length=2048)) -> Response:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_IMAGE_HOSTS:
        raise HTTPException(status_code=400, detail="Only TMDB image URLs are allowed")

    async def request_image() -> httpx.Response:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
            upstream = await client.get(
                url,
                headers={"Accept": "image/avif,image/webp,image/*;q=0.8"},
            )
        if upstream.status_code == 429 or upstream.status_code >= 500:
            raise httpx.HTTPStatusError(
                f"TMDB image service returned HTTP {upstream.status_code}",
                request=upstream.request,
                response=upstream,
            )
        return upstream

    try:
        upstream = await TMDB_IMAGE_BREAKER.call(request_image)
    except CircuitOpenError as exc:
        raise HTTPException(
            status_code=503,
            detail="Image service is temporarily unavailable",
            headers={"Retry-After": str(max(1, int(exc.retry_after_seconds)))},
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Image service is temporarily unavailable") from exc

    if upstream.status_code >= 400:
        raise HTTPException(status_code=upstream.status_code, detail="Image upstream failed")

    media_type = upstream.headers.get("content-type", "image/jpeg").split(";")[0]
    return Response(
        content=upstream.content,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400, s-maxage=86400"},
    )


@router.get("/posters/resolve")
async def resolve_poster(
    title: str = Query(min_length=1, max_length=200),
    mediaType: str = Query(default="movie", pattern="^(movie|tv)$"),
    tmdbId: int | None = Query(default=None, ge=1),
) -> dict[str, str | int | None]:
    if tmdbId:
        upstream = await _tmdb_get_uncached(f"{mediaType}/{tmdbId}", {})
    else:
        upstream = await _tmdb_get_uncached("search/multi", {"query": title, "page": "1"})

    if upstream.status_code >= 400:
        raise HTTPException(status_code=upstream.status_code, detail="TMDB request failed")

    data = upstream.json()
    result = data
    if not tmdbId:
        matches = [
            item
            for item in data.get("results", [])
            if item.get("media_type") == mediaType and item.get("poster_path")
        ]
        if not matches:
            return {"posterUrl": None, "provider": "tmdb"}
        result = matches[0]

    poster_path = result.get("poster_path")
    if not poster_path:
        return {"posterUrl": None, "provider": "tmdb"}
    return {
        "posterUrl": f"{TMDB_IMAGE_BASE}/w500{poster_path}",
        "provider": "tmdb",
        "tmdbId": result.get("id"),
    }