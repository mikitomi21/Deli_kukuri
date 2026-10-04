"""Add ward SMS notification preference.

Revision ID: e5b3c1d8a7f2
Revises: b1f7a4d9c2e6
Create Date: 2026-10-04
"""

from alembic import op
import sqlalchemy as sa


revision = "e5b3c1d8a7f2"
down_revision = "b1f7a4d9c2e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ward",
        sa.Column(
            "sms_notification_preference",
            sa.String(length=20),
            server_default="issues_only",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("ward", "sms_notification_preference")
