"""add routine tables

Revision ID: 4bca66fa5988
Revises: 77b7a1152d55
Create Date: 2026-10-03 21:20:11.309214

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '4bca66fa5988'
down_revision = '77b7a1152d55'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('routine',
    sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
    sa.Column('time_of_day', sa.Time(), nullable=False),
    sa.Column('days_mask', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
    sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=32), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('ward_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['ward_id'], ['ward.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_routine_ward_id'), 'routine', ['ward_id'], unique=False)
    op.create_table('routineitem',
    sa.Column('amount_label', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('routine_id', sa.Uuid(), nullable=False),
    sa.Column('medication_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['medication_id'], ['medication.id'], ),
    sa.ForeignKeyConstraint(['routine_id'], ['routine.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_routineitem_routine_id'), 'routineitem', ['routine_id'], unique=False)
    op.create_table('routinedependency',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('dependent_routine_id', sa.Uuid(), nullable=False),
    sa.Column('prerequisite_routine_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['dependent_routine_id'], ['routine.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['prerequisite_routine_id'], ['routine.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('dependent_routine_id', 'prerequisite_routine_id', name='uq_routine_dependency')
    )
    op.create_index(op.f('ix_routinedependency_dependent_routine_id'), 'routinedependency', ['dependent_routine_id'], unique=False)
    op.create_index(op.f('ix_routinedependency_prerequisite_routine_id'), 'routinedependency', ['prerequisite_routine_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_routinedependency_prerequisite_routine_id'), table_name='routinedependency')
    op.drop_index(op.f('ix_routinedependency_dependent_routine_id'), table_name='routinedependency')
    op.drop_table('routinedependency')
    op.drop_index(op.f('ix_routineitem_routine_id'), table_name='routineitem')
    op.drop_table('routineitem')
    op.drop_index(op.f('ix_routine_ward_id'), table_name='routine')
    op.drop_table('routine')
