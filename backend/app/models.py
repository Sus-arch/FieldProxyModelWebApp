# backend/app/models.py
from datetime import datetime
from sqlalchemy import (
    DateTime,
    String,
    Integer,
    BigInteger,
    CheckConstraint,
    Index,
    PrimaryKeyConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import REAL


class Base(DeclarativeBase):
    pass


# ========== SCHEMA: data ==========


# backend/app/models.py


class ConnectionData(Base):
    __tablename__ = "connection"
    __table_args__ = (
        PrimaryKeyConstraint("dt", "well_id", "i", "j", "k", "test_id"),
        CheckConstraint("i >= 0 AND i <= 65535", name="chk_conn_i"),
        CheckConstraint("j >= 0 AND j <= 65535", name="chk_conn_j"),
        CheckConstraint("k >= 0 AND k <= 65535", name="chk_conn_k"),
        Index("idx_data_conn_lookup", "dt", "well_id", "test_id"),
        Index("idx_data_id_conn", "conn_id"),
        Index("uq_data_connection_id", "id", unique=True),
        {"schema": "data"},
    )
    dt: Mapped[datetime] = mapped_column(DateTime(timezone=False), primary_key=True)
    well_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    i: Mapped[int] = mapped_column(Integer, primary_key=True)  # 🔥 lowercase
    j: Mapped[int] = mapped_column(Integer, primary_key=True)
    k: Mapped[int] = mapped_column(Integer, primary_key=True)
    test_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    swl: Mapped[float | None] = mapped_column(REAL, nullable=True)  # 🔥 lowercase
    swu: Mapped[float | None] = mapped_column(REAL, nullable=True)
    conn_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    id: Mapped[str | None] = mapped_column(String(200), nullable=True)


class WellData(Base):
    __tablename__ = "well"
    __table_args__ = (
        PrimaryKeyConstraint("dt", "well_id", "test_id"),
        Index("idx_data_well_lookup", "dt", "well_id", "test_id"),
        {"schema": "data"},
    )
    dt: Mapped[datetime] = mapped_column(DateTime(timezone=False), primary_key=True)
    well_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    test_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    weff: Mapped[float | None] = mapped_column(REAL, nullable=True)  # 🔥 lowercase


class GroupData(Base):
    __tablename__ = "group"
    __table_args__ = (
        PrimaryKeyConstraint("dt", "group_id", "test_id"),
        Index("idx_data_group_lookup", "dt", "group_id", "test_id"),
        {"schema": "data"},
    )
    dt: Mapped[datetime] = mapped_column(DateTime(timezone=False), primary_key=True)
    group_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    test_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    geff: Mapped[float | None] = mapped_column(REAL, nullable=True)  # 🔥 lowercase


class ConnectionUnsumry(Base):
    __tablename__ = "connection"
    __table_args__ = (
        PrimaryKeyConstraint("dt", "well_id", "i", "j", "k", "test_id"),
        CheckConstraint("i >= 0 AND i <= 65535", name="chk_unsumry_i"),
        CheckConstraint("j >= 0 AND j <= 65535", name="chk_unsumry_j"),
        CheckConstraint("k >= 0 AND k <= 65535", name="chk_unsumry_k"),
        Index("idx_unsumry_conn_lookup", "dt", "well_id", "test_id"),
        Index("idx_unsumry_id_conn_id", "conn_id"),
        Index("uq_unsumry_connection_id", "id", unique=True),
        {"schema": "unsumry"},
    )
    dt: Mapped[datetime] = mapped_column(DateTime(timezone=False), primary_key=True)
    well_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    i: Mapped[int] = mapped_column(Integer, primary_key=True)
    j: Mapped[int] = mapped_column(Integer, primary_key=True)
    k: Mapped[int] = mapped_column(Integer, primary_key=True)
    test_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    cgpr: Mapped[float | None] = mapped_column(REAL, nullable=True)
    cgpt: Mapped[float | None] = mapped_column(REAL, nullable=True)
    cwpr: Mapped[float | None] = mapped_column(REAL, nullable=True)
    cwpt: Mapped[float | None] = mapped_column(REAL, nullable=True)
    cbp: Mapped[float | None] = mapped_column(REAL, nullable=True)

    conn_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    id: Mapped[str | None] = mapped_column(String(200), nullable=True)


class FieldTestsMeta(Base):
    __tablename__ = "field_tests"
    __table_args__ = (
        PrimaryKeyConstraint("field_name", "test_id"),
        Index("field_name", "test_id"),
        {"schema": "data"},
    )
    field_name: Mapped[str] = mapped_column(String(100), primary_key=True)
    test_id: Mapped[str] = mapped_column(String(100), primary_key=True)


class PredictionResult(Base):
    __tablename__ = "results"
    __table_args__ = (
        Index("idx_pred_model", "model_name"),
        Index("idx_pred_test_id", "test_id"),
        Index("idx_pred_conn_id", "conn_id"),
        {"schema": "predictions"},
    )

    model_name: Mapped[str] = mapped_column(String(200), primary_key=True)
    dt: Mapped[datetime] = mapped_column(DateTime(timezone=False), primary_key=True)
    conn_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    test_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    cbp: Mapped[float | None] = mapped_column(REAL, nullable=True)


class PredictionMetrics(Base):
    __tablename__ = "metrics"
    __table_args__ = (
        Index("idx_pred_metrics_model", "model_name"),
        Index("idx_pred_metrics_test_scenario", "test_scenario"),
        {"schema": "predictions"},
    )

    id: Mapped[str] = mapped_column(String(500), primary_key=True)
    model_name: Mapped[str] = mapped_column(String(200), nullable=False)
    train_scenarios: Mapped[str] = mapped_column(String(1000), nullable=False)
    test_scenario: Mapped[str] = mapped_column(String(200), nullable=False)
    mae: Mapped[float | None] = mapped_column(REAL, nullable=True)
    rmse: Mapped[float | None] = mapped_column(REAL, nullable=True)
    r2: Mapped[float | None] = mapped_column(REAL, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, default=datetime.utcnow
    )
