"""add medication fda and ai fields

Revision ID: 7a3e8f9b1c2d
Revises: 62a457a0e2fd
Create Date: 2026-10-03 23:45:00.000000

"""

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

# revision identifiers, used by Alembic.
revision = "7a3e8f9b1c2d"
down_revision = "62a457a0e2fd"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "medication",
        sa.Column("generic_name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
    )
    op.add_column(
        "medication",
        sa.Column("fda_raw", sa.Text(), nullable=True),
    )
    op.add_column(
        "medication",
        sa.Column("ai_summary", sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_column("medication", "ai_summary")
    op.drop_column("medication", "fda_raw")
    op.drop_column("medication", "generic_name")
