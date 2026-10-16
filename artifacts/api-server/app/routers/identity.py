"""Persistent S-Movie identity endpoints for authenticated Firebase accounts."""

import hashlib
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError

from app.dependencies import DB
from app.models.identity import IdentityAccount
from app.services.firebase_identity import get_firebase_identity

router = APIRouter()
FirebaseIdentity = Annotated[dict[str, Any], Depends(get_firebase_identity)]


class SyncIdentityRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    display_name: str | None = Field(default=None, alias="displayName", max_length=200)
    photo_url: str | None = Field(default=None, alias="photoUrl", max_length=2048)
    smo_id: str | None = Field(
        default=None,
        alias="smoId",
        min_length=12,
        max_length=12,
        pattern=r"^\d{12}$",
    )


def _response(identity: IdentityAccount) -> dict[str, Any]:
    return {
        "uniqueUserId": identity.unique_user_id,
        "email": identity.email,
        "displayName": identity.display_name,
        "photoUrl": identity.photo_url,
        "isSuspended": identity.is_suspended,
        "suspensionReason": identity.suspension_reason,
        "verificationStatus": identity.verification_status,
    }


def _new_unique_user_id(firebase_uid: str, offset: int = 0) -> str:
    digest = hashlib.sha256(firebase_uid.encode("utf-8")).hexdigest()
    numeric_id = int(digest, 16) % 1_000_000_000_000
    return f"{(numeric_id + offset) % 1_000_000_000_000:012d}"


@router.post("/identity/google-sync")
async def sync_identity(
    body: SyncIdentityRequest,
    firebase_user: FirebaseIdentity,
    db: DB,
) -> dict[str, Any]:
    """Create an identity once per Firebase UID and refresh only profile metadata."""
    uid = firebase_user["uid"]
    identity = None
    for attempt in range(5):
        requested_id = body.smo_id or _new_unique_user_id(uid, attempt)
        statement = (
            insert(IdentityAccount)
            .values(
                firebase_uid=uid,
                unique_user_id=requested_id,
                email=firebase_user.get("email"),
                display_name=body.display_name,
                photo_url=body.photo_url,
            )
            .on_conflict_do_nothing()
        )
        await db.execute(statement)

        result = await db.execute(
            select(IdentityAccount).where(IdentityAccount.firebase_uid == uid)
        )
        identity = result.scalar_one_or_none()
        if identity is not None:
            break
        if body.smo_id:
            break
    if identity is None:
        if body.smo_id:
            raise HTTPException(
                status_code=409,
                detail="S-Movie ID is already assigned to another account.",
            )
        raise HTTPException(status_code=503, detail="Could not create your account identity.")

    # The Firestore allocator is authoritative for the account-facing numeric
    # ID. Keep this authenticated API record in sync with it as well.
    if body.smo_id and identity.unique_user_id != body.smo_id:
        collision = await db.execute(
            select(IdentityAccount.firebase_uid).where(
                IdentityAccount.unique_user_id == body.smo_id,
                IdentityAccount.firebase_uid != uid,
            )
        )
        if collision.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="S-Movie ID is already assigned to another account.",
            )
        identity.unique_user_id = body.smo_id

    # Email can change; it is profile data, never the identity key.
    if firebase_user.get("email"):
        identity.email = firebase_user["email"]
    if body.display_name:
        identity.display_name = body.display_name
    if body.photo_url:
        identity.photo_url = body.photo_url

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="S-Movie ID is already assigned to another account.",
        ) from exc
    await db.refresh(identity)
    return _response(identity)


@router.get("/identity/me")
async def get_identity(
    firebase_user: FirebaseIdentity,
    db: DB,
) -> dict[str, Any]:
    result = await db.execute(
        select(IdentityAccount).where(
            IdentityAccount.firebase_uid == firebase_user["uid"]
        )
    )
    identity = result.scalar_one_or_none()
    if identity is None:
        raise HTTPException(status_code=404, detail="S-Movie identity not found.")
    return _response(identity)
