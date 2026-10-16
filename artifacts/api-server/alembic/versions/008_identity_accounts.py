"""Persist stable S-Movie identities by Firebase UID.

Revision ID: 008
Revises: 007
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "identity_accounts",
        sa.Column("firebase_uid", sa.String(length=128), primary_key=True),
        sa.Column("unique_user_id", sa.String(length=40), nullable=False, unique=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("display_name", sa.String(length=200), nullable=True),
        sa.Column("photo_url", sa.String(length=2048), nullable=True),
        sa.Column(
            "verification_status",
            sa.String(length=20),
            nullable=False,
            server_default="unverified",
        ),
        sa.Column(
            "is_suspended",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("suspension_reason", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "verification_status IN ('unverified', 'pending', 'verified', 'rejected')",
            name="ck_identity_accounts_verification_status",
        ),
    )


def downgrade() -> None:
    op.drop_table("identity_accounts")
