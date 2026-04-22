"""cdc v2 foundation

Revision ID: 48eac71e7c56
Revises: 201bedf4e8a5
Create Date: 2026-04-19 11:58:03.140204
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '48eac71e7c56'
down_revision: Union[str, None] = '201bedf4e8a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    cdc_kind = sa.Enum(
        "POLL", "PG_WAL", "MONGO_CHANGE_STREAM", name="cdckind"
    )
    cdc_kind.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "cdc_jobs",
        sa.Column("cdc_kind", cdc_kind, nullable=False, server_default="POLL"),
    )
    op.add_column(
        "cdc_jobs",
        sa.Column("resume_token", sa.Text(), nullable=True),
    )
    op.add_column(
        "cdc_jobs",
        sa.Column("operation_filter", sa.JSON(), nullable=True),
    )
    op.add_column(
        "cdc_jobs",
        sa.Column(
            "checkpoint_interval_seconds",
            sa.Integer(),
            nullable=False,
            server_default="10",
        ),
    )
    op.add_column(
        "cdc_jobs",
        sa.Column("celery_task_id", sa.String(length=100), nullable=True),
    )
    op.alter_column("cdc_jobs", "tracking_column", nullable=True)


def downgrade() -> None:
    op.alter_column("cdc_jobs", "tracking_column", nullable=False)
    op.drop_column("cdc_jobs", "celery_task_id")
    op.drop_column("cdc_jobs", "checkpoint_interval_seconds")
    op.drop_column("cdc_jobs", "operation_filter")
    op.drop_column("cdc_jobs", "resume_token")
    op.drop_column("cdc_jobs", "cdc_kind")
    sa.Enum(name="cdckind").drop(op.get_bind(), checkfirst=True)
