"""add predictions schema and results table

Revision ID: add_predictions
Revises: <prev>
"""

from alembic import op
import sqlalchemy as sa

from typing import Sequence, Union

revision: str = "7333cb31c532"  # 🔥 ОБЯЗАТЕЛЬНО
down_revision: Union[str, None] = "1284c83e6fac"  # 🔥 ОБЯЗАТЕЛЬНО
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS predictions")

    op.create_table(
        "results",
        sa.Column("model_name", sa.String(200), nullable=False),
        sa.Column("dt", sa.DateTime(timezone=False), nullable=False),
        sa.Column("conn_id", sa.BigInteger, nullable=False),
        sa.Column("test_id", sa.String(100), nullable=False),
        sa.Column("cbp", sa.REAL, nullable=True),
        sa.PrimaryKeyConstraint("model_name", "dt", "conn_id", "test_id"),
        schema="predictions",
    )

    op.create_index("idx_pred_model", "results", ["model_name"], schema="predictions")
    op.create_index("idx_pred_test_id", "results", ["test_id"], schema="predictions")
    op.create_index("idx_pred_conn_id", "results", ["conn_id"], schema="predictions")


def downgrade() -> None:
    op.drop_table("results", schema="predictions")
    op.execute("DROP SCHEMA IF EXISTS predictions")
