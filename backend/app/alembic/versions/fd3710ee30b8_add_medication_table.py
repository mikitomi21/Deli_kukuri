"""add medication table

Revision ID: fd3710ee30b8
Revises: fe56fa70289e
Create Date: 2026-10-03 13:23:36.923266

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'fd3710ee30b8'
down_revision = 'fe56fa70289e'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'medication',
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('dosage', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('form', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.Column('instructions', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', 'dosage'),
    )
    op.create_index(op.f('ix_medication_name'), 'medication', ['name'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_medication_name'), table_name='medication')
    op.drop_table('medication')
