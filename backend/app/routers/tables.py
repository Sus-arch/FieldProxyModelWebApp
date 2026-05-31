# app/routers/tables.py
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal, Any

from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, String as SAString, delete
import sqlalchemy.types as sa_types

from app.db import get_db
from app.models import (
    ConnectionData,
    WellData,
    GroupData,
    ConnectionUnsumry,
    FieldTestsMeta,
    PredictionResult,
    PredictionMetrics,
)
from app.schemas.tables import (
    ConnectionDataSchema,
    WellDataSchema,
    GroupDataSchema,
    ConnectionUnsumrySchema,
    FieldTestsMetaSchema,
    PredictionResultSchema,
    PredictionMetricsSchema,
)

router = APIRouter(prefix="/api/tables", tags=["tables"])

TableName = Literal[
    "data_connection",
    "data_well",
    "data_group",
    "meta_field_tests",
    "unsumry_connection",
    "predictions_results",
    "predictions_metrics",
]

TABLE_META = {
    "data_connection": {
        "label": "Connection (data)",
        "schema": "data",
        "table": "connection",
        "columns": [
            "id",
            "conn_id",
            "dt",
            "well_id",
            "i",
            "j",
            "k",
            "test_id",
            "swl",
            "swu",
        ],
    },
    "data_well": {
        "label": "Well (data)",
        "schema": "data",
        "table": "well",
        "columns": ["dt", "well_id", "test_id", "weff"],
    },
    "data_group": {
        "label": "Group (data)",
        "schema": "data",
        "table": "group",
        "columns": ["dt", "group_id", "test_id", "geff"],
    },
    "meta_field_tests": {
        "label": "Field_Tests (meta)",
        "schema": "data",
        "table": "field_tests",
        "columns": ["field_name", "test_id"],
    },
    "unsumry_connection": {
        "label": "Connection (unsumry)",
        "schema": "unsumry",
        "table": "connection",
        "columns": [
            "id",
            "conn_id",
            "dt",
            "well_id",
            "i",
            "j",
            "k",
            "test_id",
            "cgpr",
            "cgpt",
            "cwpr",
            "cwpt",
            "cbp",
        ],
    },
    "predictions_results": {
        "label": "Predictions",
        "schema": "predictions",
        "table": "results",
        "columns": ["model_name", "dt", "conn_id", "test_id", "cbp"],
    },
    "predictions_metrics": {
        "label": "Metrics (predictions)",
        "schema": "predictions",
        "table": "metrics",
        "columns": [
            "id",
            "model_name",
            "train_scenarios",
            "test_scenario",
            "mae",
            "rmse",
            "r2",
            "created_at",
        ],
    },
}

MODEL_MAP = {
    "data_connection": (ConnectionData, ConnectionDataSchema),
    "data_well": (WellData, WellDataSchema),
    "data_group": (GroupData, GroupDataSchema),
    "meta_field_tests": (FieldTestsMeta, FieldTestsMetaSchema),
    "unsumry_connection": (ConnectionUnsumry, ConnectionUnsumrySchema),
    "predictions_results": (PredictionResult, PredictionResultSchema),
    "predictions_metrics": (PredictionMetrics, PredictionMetricsSchema),
}


def has_model_column(model_cls: Any, col_name: str) -> bool:
    return col_name in model_cls.__table__.columns


def get_column_sa_type(model_cls: Any, col_name: str) -> Any:
    return model_cls.__table__.columns[col_name].type


def serialize_filter_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    if isinstance(value, date):
        return value.isoformat()
    return value


def parse_datetime_value(raw: str) -> datetime:
    raw = raw.strip().replace("Z", "+00:00")
    value = datetime.fromisoformat(raw)
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def build_filter_expression(col: Any, sa_type: Any, raw_value: str):
    raw = str(raw_value).strip()
    if not raw:
        return None, None

    try:
        if isinstance(
            sa_type,
            (sa_types.Integer, sa_types.SmallInteger, sa_types.BigInteger),
        ):
            value = int(raw)
            return col == value, value

        if isinstance(sa_type, (sa_types.Float, sa_types.Numeric, sa_types.DECIMAL)):
            value = float(raw.replace(",", "."))
            return col == value, value

        if isinstance(sa_type, sa_types.Boolean):
            lowered = raw.lower()
            if lowered in ("true", "1", "yes", "y"):
                return col.is_(True), True
            if lowered in ("false", "0", "no", "n"):
                return col.is_(False), False
            return None, None

        if isinstance(sa_type, sa_types.DateTime):
            if len(raw) == 10:
                start = datetime.fromisoformat(raw)
                end = start + timedelta(days=1)
                return (col >= start) & (col < end), raw
            dt_value = parse_datetime_value(raw)
            return col == dt_value, raw

        if isinstance(sa_type, sa_types.Date):
            value = date.fromisoformat(raw)
            return col == value, value.isoformat()

        if isinstance(sa_type, (sa_types.String, sa_types.Text, sa_types.Unicode)):
            return col.ilike(f"%{raw}%"), raw

        return col == raw, raw

    except (ValueError, TypeError):
        return None, None


@router.get("/meta")
async def get_tables_meta():
    return [{"key": key, **meta} for key, meta in TABLE_META.items()]


@router.get("/{table_name}/filters/{column_name}")
async def get_column_filter_values(
    table_name: TableName,
    column_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(500, ge=1, le=5000),
    search: str | None = Query(None),
):
    if table_name not in MODEL_MAP:
        raise HTTPException(
            status_code=404, detail=f"Таблица '{table_name}' не найдена"
        )

    model_cls, _ = MODEL_MAP[table_name]
    meta = TABLE_META[table_name]

    if not has_model_column(model_cls, column_name):
        raise HTTPException(
            status_code=400,
            detail=f"Колонка '{column_name}' не найдена. Доступные: {meta['columns']}",
        )

    col = getattr(model_cls, column_name)
    base_stmt = select(col).where(col.isnot(None)).distinct()

    if search and search.strip():
        base_stmt = base_stmt.where(cast(col, SAString).ilike(f"%{search.strip()}%"))

    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total_count = (await db.execute(count_stmt)).scalar_one()

    stmt = base_stmt.order_by(col).limit(limit)
    result = await db.execute(stmt)
    raw_values = result.scalars().all()

    values = [serialize_filter_value(v) for v in raw_values]

    return {
        "column": column_name,
        "values": values,
        "total_count": total_count,
        "truncated": total_count > limit,
        "table": f"{meta['schema']}.{meta['table']}",
    }


@router.get("/{table_name}")
async def get_table_data(
    table_name: TableName,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    sort_by: str | None = Query(None),
    sort_dir: Literal["asc", "desc"] | None = Query("asc"),
):
    if table_name not in MODEL_MAP:
        raise HTTPException(
            status_code=404, detail=f"Таблица '{table_name}' не найдена"
        )

    model_cls, schema_cls = MODEL_MAP[table_name]
    meta = TABLE_META[table_name]

    stmt = select(model_cls)
    applied_filters: dict[str, Any] = {}

    known_params = {"page", "page_size", "sort_by", "sort_dir"}

    for col_name, raw_value in request.query_params.items():
        if col_name in known_params:
            continue
        if raw_value is None or not raw_value.strip():
            continue
        if not has_model_column(model_cls, col_name):
            continue

        col = getattr(model_cls, col_name)
        sa_type = get_column_sa_type(model_cls, col_name)
        expr, applied_value = build_filter_expression(col, sa_type, raw_value)

        if expr is None:
            continue

        stmt = stmt.where(expr)
        applied_filters[col_name] = applied_value

    # Сортировка
    if sort_by and has_model_column(model_cls, sort_by):
        sort_col = getattr(model_cls, sort_by)
        stmt = stmt.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
    else:
        pk_cols = [
            getattr(model_cls, c.name) for c in model_cls.__table__.primary_key.columns
        ]
        if pk_cols:
            stmt = stmt.order_by(*pk_cols)

    # Count
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    # Pagination
    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    return {
        "table": f"{meta['schema']}.{meta['table']}",
        "columns": meta["columns"],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
        "data": [schema_cls.model_validate(r).model_dump() for r in rows],
        "applied_filters": applied_filters,
        "applied_sort": (
            {"by": sort_by, "dir": sort_dir}
            if sort_by and sort_dir in ("asc", "desc")
            else None
        ),
    }


@router.delete("/{table_name}/rows")
async def delete_rows(
    table_name: TableName,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Удаление строк по фильтрам.
    Без фильтров — ошибка (защита от случайного удаления всего).
    С параметром ?confirm_delete_all=true — удалит все строки.
    """
    if table_name not in MODEL_MAP:
        raise HTTPException(
            status_code=404, detail=f"Таблица '{table_name}' не найдена"
        )

    model_cls, _ = MODEL_MAP[table_name]
    meta = TABLE_META[table_name]

    known_params = {"confirm_delete_all"}
    confirm_all = request.query_params.get("confirm_delete_all", "").lower() == "true"

    stmt = delete(model_cls)
    applied_filters: dict[str, Any] = {}

    for col_name, raw_value in request.query_params.items():
        if col_name in known_params:
            continue
        if raw_value is None or not raw_value.strip():
            continue
        if not has_model_column(model_cls, col_name):
            continue

        col = getattr(model_cls, col_name)
        sa_type = get_column_sa_type(model_cls, col_name)
        expr, applied_value = build_filter_expression(col, sa_type, raw_value)

        if expr is None:
            continue

        stmt = stmt.where(expr)
        applied_filters[col_name] = applied_value

    if not applied_filters and not confirm_all:
        raise HTTPException(
            status_code=400,
            detail="Нет фильтров. Для удаления всех строк добавьте ?confirm_delete_all=true",
        )

    # Считаем сколько будет удалено
    count_stmt = (
        select(func.count()).select_from(
            select(model_cls)
            .where(*[stmt.whereclause] if stmt.whereclause is not None else [])
            .subquery()
        )
        if stmt.whereclause is not None
        else select(func.count()).select_from(model_cls)
    )

    # Простой подсчёт
    if applied_filters:
        count_q = select(func.count()).select_from(model_cls)
        for col_name, raw_value in applied_filters.items():
            col = getattr(model_cls, col_name)
            sa_type = get_column_sa_type(model_cls, col_name)
            expr, _ = build_filter_expression(col, sa_type, str(raw_value))
            if expr is not None:
                count_q = count_q.where(expr)
        total = (await db.execute(count_q)).scalar_one()
    else:
        total = (
            await db.execute(select(func.count()).select_from(model_cls))
        ).scalar_one()

    result = await db.execute(stmt)
    await db.commit()

    return {
        "status": "success",
        "table": f"{meta['schema']}.{meta['table']}",
        "deleted": total,
        "filters": applied_filters,
    }


@router.post("/{table_name}/delete-by-pks")
async def delete_by_primary_keys(
    table_name: TableName,
    pks: list[dict[str, Any]],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Удаление конкретных строк по их первичным ключам.
    Тело запроса: список объектов с полями PK.

    Пример:
    [
      {"dt": "2024-01-01T00:00:00", "well_id": "WELL_001", "i": 10, "j": 20, "k": 5, "test_id": "dep1_v1"},
      ...
    ]
    """
    if table_name not in MODEL_MAP:
        raise HTTPException(
            status_code=404, detail=f"Таблица '{table_name}' не найдена"
        )

    model_cls, _ = MODEL_MAP[table_name]
    meta = TABLE_META[table_name]

    pk_columns = [c.name for c in model_cls.__table__.primary_key.columns]

    if not pks:
        raise HTTPException(status_code=400, detail="Пустой список строк")

    deleted = 0

    for pk_values in pks:
        # Проверяем что все PK-поля переданы
        missing = [c for c in pk_columns if c not in pk_values]
        if missing:
            continue

        stmt = delete(model_cls)
        for col_name in pk_columns:
            col = getattr(model_cls, col_name)
            sa_type = get_column_sa_type(model_cls, col_name)

            raw = str(pk_values[col_name])

            # Парсим datetime
            if isinstance(sa_type, sa_types.DateTime):
                try:
                    val = parse_datetime_value(raw)
                except Exception:
                    val = raw
                stmt = stmt.where(col == val)
            elif isinstance(
                sa_type, (sa_types.Integer, sa_types.SmallInteger, sa_types.BigInteger)
            ):
                stmt = stmt.where(col == int(raw))
            else:
                stmt = stmt.where(col == raw)

        await db.execute(stmt)
        deleted += 1

    await db.commit()

    return {
        "status": "success",
        "table": f"{meta['schema']}.{meta['table']}",
        "deleted": deleted,
    }
