"""add conn_id and id to connection tables

Revision ID: 1284c83e6fac
Revises: ee2ecfc80076
Create Date: 2026-05-15 11:38:47.029352
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "1284c83e6fac"
down_revision: Union[str, None] = "ee2ecfc80076"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # =========================================================
    # data.connection
    # =========================================================
    op.add_column(
        "connection",
        sa.Column("conn_id", sa.BigInteger(), nullable=True),
        schema="data",
    )
    op.add_column(
        "connection",
        sa.Column("id", sa.String(length=200), nullable=True),
        schema="data",
    )

    op.execute("CREATE SEQUENCE IF NOT EXISTS data.connection_conn_id_seq")

    # Backfill conn_id для существующих данных:
    # одинаковый conn_id для одинаковых (well_id, i, j, k)
    op.execute("""
        WITH uniq AS (
            SELECT
                well_id,
                i,
                j,
                k,
                dense_rank() OVER (ORDER BY well_id, i, j, k) AS new_conn_id
            FROM (
                SELECT DISTINCT well_id, i, j, k
                FROM data.connection
            ) t
        )
        UPDATE data.connection c
        SET conn_id = u.new_conn_id
        FROM uniq u
        WHERE c.well_id = u.well_id
          AND c.i = u.i
          AND c.j = u.j
          AND c.k = u.k
    """)

    # Backfill id
    op.execute("""
        UPDATE data.connection
        SET id =
            to_char(dt, 'YYYY-MM-DD HH24:MI:SS') || '_' ||
            conn_id::text || '_' ||
            test_id
    """)

    # sequence -> max(conn_id)
    op.execute("""
        SELECT setval(
            'data.connection_conn_id_seq',
            COALESCE((SELECT MAX(conn_id) FROM data.connection), 1),
            true
        )
    """)

    op.create_index(
        "idx_data_id_conn",
        "connection",
        ["conn_id"],
        unique=False,
        schema="data",
    )
    op.create_index(
        "uq_data_connection_id",
        "connection",
        ["id"],
        unique=True,
        schema="data",
    )

    # Trigger function for data.connection
    op.execute("""
        CREATE OR REPLACE FUNCTION data.set_connection_ids()
        RETURNS trigger AS $$
        DECLARE
            existing_conn_id bigint;
        BEGIN
            SELECT c.conn_id
            INTO existing_conn_id
            FROM data.connection c
            WHERE c.well_id = NEW.well_id
              AND c.i = NEW.i
              AND c.j = NEW.j
              AND c.k = NEW.k
              AND c.conn_id IS NOT NULL
            LIMIT 1;

            IF existing_conn_id IS NOT NULL THEN
                NEW.conn_id := existing_conn_id;
            ELSE
                NEW.conn_id := nextval('data.connection_conn_id_seq');
            END IF;

            NEW.id :=
                to_char(NEW.dt, 'YYYY-MM-DD HH24:MI:SS') || '_' ||
                NEW.conn_id::text || '_' ||
                NEW.test_id;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER trg_data_connection_set_ids
        BEFORE INSERT OR UPDATE OF dt, test_id, well_id, i, j, k
        ON data.connection
        FOR EACH ROW
        EXECUTE FUNCTION data.set_connection_ids();
    """)

    op.alter_column("connection", "conn_id", nullable=False, schema="data")
    op.alter_column("connection", "id", nullable=False, schema="data")

    # =========================================================
    # unsumry.connection
    # =========================================================
    op.add_column(
        "connection",
        sa.Column("conn_id", sa.BigInteger(), nullable=True),
        schema="unsumry",
    )
    op.add_column(
        "connection",
        sa.Column("id", sa.String(length=200), nullable=True),
        schema="unsumry",
    )

    op.execute("CREATE SEQUENCE IF NOT EXISTS unsumry.connection_conn_id_seq")

    op.execute("""
        WITH uniq AS (
            SELECT
                well_id,
                i,
                j,
                k,
                dense_rank() OVER (ORDER BY well_id, i, j, k) AS new_conn_id
            FROM (
                SELECT DISTINCT well_id, i, j, k
                FROM unsumry.connection
            ) t
        )
        UPDATE unsumry.connection c
        SET conn_id = u.new_conn_id
        FROM uniq u
        WHERE c.well_id = u.well_id
          AND c.i = u.i
          AND c.j = u.j
          AND c.k = u.k
    """)

    op.execute("""
        UPDATE unsumry.connection
        SET id =
            to_char(dt, 'YYYY-MM-DD HH24:MI:SS') || '_' ||
            conn_id::text || '_' ||
            test_id
    """)

    op.execute("""
        SELECT setval(
            'unsumry.connection_conn_id_seq',
            COALESCE((SELECT MAX(conn_id) FROM unsumry.connection), 1),
            true
        )
    """)

    op.create_index(
        "idx_unsumry_id_conn_id",
        "connection",
        ["conn_id"],
        unique=False,
        schema="unsumry",
    )
    op.create_index(
        "uq_unsumry_connection_id",
        "connection",
        ["id"],
        unique=True,
        schema="unsumry",
    )

    op.execute("""
        CREATE OR REPLACE FUNCTION unsumry.set_connection_ids()
        RETURNS trigger AS $$
        DECLARE
            existing_conn_id bigint;
        BEGIN
            SELECT c.conn_id
            INTO existing_conn_id
            FROM unsumry.connection c
            WHERE c.well_id = NEW.well_id
              AND c.i = NEW.i
              AND c.j = NEW.j
              AND c.k = NEW.k
              AND c.conn_id IS NOT NULL
            LIMIT 1;

            IF existing_conn_id IS NOT NULL THEN
                NEW.conn_id := existing_conn_id;
            ELSE
                NEW.conn_id := nextval('unsumry.connection_conn_id_seq');
            END IF;

            NEW.id :=
                to_char(NEW.dt, 'YYYY-MM-DD HH24:MI:SS') || '_' ||
                NEW.conn_id::text || '_' ||
                NEW.test_id;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER trg_unsumry_connection_set_ids
        BEFORE INSERT OR UPDATE OF dt, test_id, well_id, i, j, k
        ON unsumry.connection
        FOR EACH ROW
        EXECUTE FUNCTION unsumry.set_connection_ids();
    """)

    op.alter_column("connection", "conn_id", nullable=False, schema="unsumry")
    op.alter_column("connection", "id", nullable=False, schema="unsumry")


def downgrade() -> None:
    # unsumry
    op.execute(
        "DROP TRIGGER IF EXISTS trg_unsumry_connection_set_ids ON unsumry.connection"
    )
    op.execute("DROP FUNCTION IF EXISTS unsumry.set_connection_ids()")
    op.drop_index("uq_unsumry_connection_id", table_name="connection", schema="unsumry")
    op.drop_index("idx_unsumry_id_conn_id", table_name="connection", schema="unsumry")
    op.drop_column("connection", "id", schema="unsumry")
    op.drop_column("connection", "conn_id", schema="unsumry")
    op.execute("DROP SEQUENCE IF EXISTS unsumry.connection_conn_id_seq")

    # data
    op.execute("DROP TRIGGER IF EXISTS trg_data_connection_set_ids ON data.connection")
    op.execute("DROP FUNCTION IF EXISTS data.set_connection_ids()")
    op.drop_index("uq_data_connection_id", table_name="connection", schema="data")
    op.drop_index("idx_data_id_conn", table_name="connection", schema="data")
    op.drop_column("connection", "id", schema="data")
    op.drop_column("connection", "conn_id", schema="data")
    op.execute("DROP SEQUENCE IF EXISTS data.connection_conn_id_seq")
