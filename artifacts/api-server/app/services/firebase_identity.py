"""Verify Firebase ID tokens and return their immutable Firebase user ID."""

import asyncio
import re
import time
from typing import Annotated, Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings
from app.services.resilience import CircuitOpenError, FIREBASE_BREAKER

_CERTIFICATES_URL = (
    "https://www.googleapis.com/robot/v1/metadata/x509/"
    "securetoken@system.gserviceaccount.com"
)
_bearer = HTTPBearer(auto_error=False)
_certificates: dict[str, str] = {}
_certificates_expire_at = 0.0
_certificates_lock = asyncio.Lock()


async def _get_certificates() -> dict[str, str]:
    global _certificates, _certificates_expire_at

    if _certificates and time.monotonic() < _certificates_expire_at:
        return _certificates

    async with _certificates_lock:
        if _certificates and time.monotonic() < _certificates_expire_at:
            return _certificates

        async def fetch_certificates() -> tuple[httpx.Response, object]:
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.get(_CERTIFICATES_URL)
                response.raise_for_status()
                payload = response.json()
            return response, payload

        try:
            response, payload = await FIREBASE_BREAKER.call(fetch_certificates)
        except (CircuitOpenError, httpx.HTTPError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Sign-in verification is temporarily unavailable.",
            ) from exc

        if not isinstance(payload, dict) or not payload:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Sign-in verification is temporarily unavailable.",
            )

        cache_control = response.headers.get("cache-control", "")
        max_age = re.search(r"max-age=(\d+)", cache_control)
        ttl = min(int(max_age.group(1)), 3600) if max_age else 3600
        _certificates = {
            str(kid): str(certificate)
            for kid, certificate in payload.items()
            if isinstance(kid, str) and isinstance(certificate, str)
        }
        _certificates_expire_at = time.monotonic() + max(ttl, 60)
        return _certificates


async def get_firebase_identity(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> dict[str, Any]:
    """Authenticate a Firebase ID token; never trust client-supplied account IDs."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to access your S-Movie identity.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid sign-in token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    kid = header.get("kid")
    if not isinstance(kid, str):
        raise HTTPException(status_code=401, detail="Invalid sign-in token.")

    certificates = await _get_certificates()
    certificate = certificates.get(kid)
    if not certificate:
        raise HTTPException(status_code=401, detail="Invalid sign-in token.")

    project_id = settings.firebase_project_id
    try:
        claims = jwt.decode(
            token,
            certificate,
            algorithms=["RS256"],
            audience=project_id,
            issuer=f"https://securetoken.google.com/{project_id}",
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired sign-in token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    uid = claims.get("sub")
    if not isinstance(uid, str) or not uid or len(uid) > 128:
        raise HTTPException(status_code=401, detail="Invalid sign-in token.")

    return {
        "uid": uid,
        "email": claims.get("email") if isinstance(claims.get("email"), str) else None,
    }
