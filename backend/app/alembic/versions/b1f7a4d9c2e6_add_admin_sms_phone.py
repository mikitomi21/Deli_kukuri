"""Add admin SMS recipient number.

Revision ID: b1f7a4d9c2e6
Revises: 7a3e8f9b1c2d
Create Date: 2026-10-04
"""

from alembic import op
import sqlalchemy as sa


revision = "b1f7a4d9c2e6"
down_revision = "7a3e8f9b1c2d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column("admin_phone_number", sa.String(length=16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user", "admin_phone_number")
