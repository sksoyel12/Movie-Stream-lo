from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class IdentityAccount(Base):
    """Stable S-Movie identity attached to an authenticated Firebase account."""

    __tablename__ = "identity_accounts"
    __table_args__ = (
        CheckConstraint(
            "verification_status IN ('unverified', 'pending', 'verified', 'rejected')",
            name="ck_identity_accounts_verification_status",
        ),
    )

    firebase_uid: Mapped[str] = mapped_column(String(128), primary_key=True)
    unique_user_id: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(320))
    display_name: Mapped[str | None] = mapped_column(String(200))
    photo_url: Mapped[str | None] = mapped_column(String(2048))
    verification_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unverified", server_default="unverified"
    )
    is_suspended: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    suspension_reason: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
