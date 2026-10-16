"""CDN observability service — Prometheus queries, cache key listing, purge proxy.

Feature 018: CDN Observability & Cache Management Dashboard.
"""

import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

CACHE_DIR = Path("/var/cache/nginx")
HLS_DIR = Path(os.environ.get("HLS_SEGMENT_DIR", "/hls_data"))

# Shared httpx clients (created lazily, closed via shutdown())
_prom_client: httpx.AsyncClient | None = None
_cdn_client: httpx.AsyncClient | None = None


async def _get_prom_client() -> httpx.AsyncClient:
    global _prom_client
    if _prom_client is None or _prom_client.is_closed:
        _prom_client = httpx.AsyncClient(base_url=settings.prometheus_url, timeout=10.0)
    return _prom_client


async def _get_cdn_client() -> httpx.AsyncClient:
    global _cdn_client
    if _cdn_client is None or _cdn_client.is_closed:
        _cdn_client = httpx.AsyncClient(timeout=10.0)
    return _cdn_client


async def shutdown() -> None:
    """Close shared httpx clients. Call from app lifespan shutdown."""
    for client in (_prom_client, _cdn_client):
        if client and not client.is_closed:
            await client.aclose()


async def _prom_query(query: str) -> float:
    """Execute a Prometheus instant query and return the scalar value (or 0.0)."""
    client = await _get_prom_client()
    resp = await client.get("/api/v1/query", params={"query": query})
    resp.raise_for_status()
    data = resp.json()
    results = data.get("data", {}).get("result", [])
    if results and results[0].get("value"):
        return float(results[0]["value"][1])
    return 0.0


async def get_cdn_stats() -> dict:
    """Query Prometheus for CDN health metrics (queries run in parallel)."""
    hit_ratio, requests_per_sec, bandwidth_mbps, error_rate = await asyncio.gather(
        _prom_query(
            'sum(rate(nginx_vts_server_requests_total{code="2xx"}[5m])) / '
            "sum(rate(nginx_vts_server_requests_total[5m])) * 100"
        ),
        _prom_query("sum(rate(nginx_vts_server_requests_total[5m]))"),
        _prom_query('sum(rate(nginx_vts_server_bytes_total{direction="out"}[5m])) * 8 / 1000000'),
        _prom_query(
            'sum(rate(nginx_vts_server_requests_total{code="5xx"}[5m])) / '
            "sum(rate(nginx_vts_server_requests_total[5m])) * 100"
        ),
    )

    return {
        "hit_ratio": round(min(max(hit_ratio, 0), 100), 1),
        "requests_per_sec": round(max(requests_per_sec, 0), 1),
        "bandwidth_mbps": round(max(bandwidth_mbps, 0), 1),
        "error_rate": round(min(max(error_rate, 0), 100), 1),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ── Cache key listing (US3) ─────────────────────────────────────────────────

_KEY_LINE_RE = re.compile(r"^KEY:\s*(.+)$", re.MULTILINE)


def _extract_path(key: str) -> str:
    """Extract URI path from a cache key.

    Cache keys are just $request_uri (e.g., '/hls/ch1/seg.m4s').
    """
    return key if key.startswith("/") else "/" + key


def _read_cache_entry(filepath: Path) -> dict | None:
    """Read an NGINX cache file header and extract metadata."""
    try:
        with open(filepath, "rb") as f:
            header = f.read(2048).decode("utf-8", errors="replace")
            stat = os.fstat(f.fileno())

        match = _KEY_LINE_RE.search(header)
        if not match:
            return None

        key = match.group(1).strip()
        uri = _extract_path(key)

        # Determine content type from URI extension
        ext = Path(uri.split("?")[0]).suffix.lower()
        content_type_map = {
            ".m3u8": "application/vnd.apple.mpegurl",
            ".m4s": "video/mp4",
            ".mp4": "video/mp4",
            ".ts": "video/mp2t",
            ".key": "application/octet-stream",
        }

        return {
            "key": key,
            "uri": uri,
            "content_id": None,
            "content_type": content_type_map.get(ext, "application/octet-stream"),
            "size_bytes": stat.st_size,
            "created_at": datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc).isoformat(),
            "expires_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            "status": "VALID",
        }
    except OSError:
        return None


def _list_hls_files(search: str | None = None) -> list[dict]:
    """List HLS segment/manifest files served from the shared volume."""
    entries: list[dict] = []
    content_type_map = {
        ".m3u8": "application/vnd.apple.mpegurl",
        ".m4s": "video/mp4",
        ".mp4": "video/mp4",
        ".ts": "video/mp2t",
        ".key": "application/octet-stream",
    }

    try:
        for channel_dir in sorted(HLS_DIR.iterdir()):
            if not channel_dir.is_dir():
                continue
            for f in sorted(channel_dir.iterdir()):
                ext = f.suffix.lower()
                if ext not in content_type_map:
                    continue
                uri = f"/hls/{channel_dir.name}/{f.name}"
                if search and search not in uri:
                    continue
                stat = f.stat()
                entries.append({
                    "key": uri,
                    "uri": uri,
                    "content_id": channel_dir.name,
                    "content_type": content_type_map.get(ext, "application/octet-stream"),
                    "size_bytes": stat.st_size,
                    "created_at": datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc).isoformat(),
                    "expires_at": None,
                    "status": "DISK",
                })
    except OSError:
        pass

    return entries


def _list_cache_keys_sync(search: str | None = None, limit: int = 100, offset: int = 0) -> dict:
    """Walk NGINX cache directory + HLS disk files and return matching entries."""
    entries: list[dict] = []

    # Proxy cache entries
    try:
        for root, _dirs, files in os.walk(CACHE_DIR):
            for fname in files:
                entry = _read_cache_entry(Path(root) / fname)
                if entry is None:
                    continue
                if search and search not in entry["key"] and search not in entry["uri"]:
                    continue
                entries.append(entry)
    except OSError:
        pass

    # HLS files served from disk
    entries.extend(_list_hls_files(search))

    total = len(entries)
    return {
        "entries": entries[offset : offset + limit],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


async def list_cache_keys(search: str | None = None, limit: int = 100, offset: int = 0) -> dict:
    """Walk NGINX cache directory (offloaded to thread to avoid blocking event loop)."""
    return await asyncio.to_thread(_list_cache_keys_sync, search, limit, offset)


# ── Cache purge proxy (US3) ─────────────────────────────────────────────────

_INVALID_KEY_PATTERNS = re.compile(r"(\.\.|//|\x00)")


async def purge_cache_key(key: str) -> dict:
    """Purge a specific cache key via NGINX's purge endpoint."""
    if _INVALID_KEY_PATTERNS.search(key):
        raise ValueError("Invalid cache key: contains prohibited patterns")

    purge_path = _extract_path(key)

    try:
        client = await _get_cdn_client()
        resp = await client.get(f"http://cdn:80/purge{purge_path}")
        success = resp.status_code in (200, 404)  # 404 = already purged (idempotent)
        message = "Cache entry purged successfully" if success else f"Purge failed: {resp.status_code}"
    except httpx.HTTPError as e:
        success = False
        message = f"Purge request failed: {e}"

    return {
        "key": key,
        "success": success,
        "message": message,
        "purged_at": datetime.now(timezone.utc).isoformat(),
    }
