# app/routers/upload.py
from fastapi import (
    APIRouter,
    Form,
    UploadFile,
    File,
    HTTPException,
    Depends,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import Table, MetaData, Column
from sqlalchemy.types import NullType
from sqlalchemy.dialects.postgresql import insert
from app.scripts.field_tests import upsert_field_test
import pandas as pd
import pyarrow.parquet as pq
import io
import logging

from app.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/upload", tags=["upload"])

TABLE_CONFIG = {
    "data_group": {
        "schema": "data",
        "table": "group",
        "columns": ["dt", "group_id", "test_id", "geff"],
        "pk": ["dt", "group_id", "test_id"],
    },
    "data_well": {
        "schema": "data",
        "table": "well",
        "columns": ["dt", "well_id", "test_id", "weff"],
        "pk": ["dt", "well_id", "test_id"],
    },
    "data_connection": {
        "schema": "data",
        "table": "connection",
        "columns": ["dt", "well_id", "i", "j", "k", "test_id", "swl", "swu"],
        "pk": ["dt", "well_id", "i", "j", "k", "test_id"],
    },
    "unsumry_connection": {
        "schema": "unsumry",
        "table": "connection",
        "columns": [
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
        "pk": ["dt", "well_id", "i", "j", "k", "test_id"],
    },
}


def _parse_parquet(content: bytes) -> pd.DataFrame:
    """Читает Parquet из bytes в DataFrame."""
    try:
        table = pq.read_table(io.BytesIO(content))
        df = table.to_pandas()
        for col in df.select_dtypes(include=["datetime"]):
            df[col] = pd.to_datetime(df[col], utc=False)
        return df
    except Exception as e:
        raise ValueError(f"Ошибка парсинга Parquet: {e}")


def _build_table_obj(
    schema: str,
    table_name: str,
    all_columns: list[str],
    pk_columns: list[str],
) -> Table:
    """
    Создаёт Table-объект с явным указанием Primary Key.
    Без этого ON CONFLICT не сможет найти constraint.
    """
    metadata = MetaData()
    cols = []
    for col in all_columns:
        # ✅ Помечаем PK-колонки — это нужно для корректной генерации SQL
        if col in pk_columns:
            cols.append(Column(col, NullType, primary_key=True))
        else:
            cols.append(Column(col, NullType))

    return Table(
        table_name,
        metadata,
        *cols,
        schema=schema,
        extend_existing=True,
    )


async def _insert_batch(
    db: AsyncSession,
    schema: str,
    table: str,
    df: pd.DataFrame,
    pk_columns: list[str],
    batch_size: int = 1000,
) -> int:
    """
    Вставляет DataFrame батчами через INSERT ... ON CONFLICT DO UPDATE.
    НЕ делает commit — это ответственность вызывающего кода.
    """
    total = len(df)
    inserted = 0
    all_columns = df.columns.tolist()

    # ✅ Строим Table с явным PK
    table_obj = _build_table_obj(schema, table, all_columns, pk_columns)

    for start in range(0, total, batch_size):
        chunk = df.iloc[start : start + batch_size].copy()
        # None вместо NaN для корректной передачи NULL в PostgreSQL
        chunk = chunk.where(pd.notna(chunk), None)

        records = chunk.to_dict(orient="records")
        if not records:
            continue

        stmt = insert(table_obj).values(records)

        # Колонки для обновления = все кроме PK
        update_cols = [col for col in all_columns if col not in pk_columns]

        if update_cols:
            # UPSERT: обновляем не-PK колонки
            update_dict = {col: stmt.excluded[col] for col in update_cols}
            stmt = stmt.on_conflict_do_update(
                index_elements=pk_columns,
                set_=update_dict,
            )
        else:
            # Если все колонки — PK, просто пропускаем конфликт
            stmt = stmt.on_conflict_do_nothing(
                index_elements=pk_columns,
            )

        await db.execute(stmt)
        inserted += len(records)
        logger.info(f"[{schema}.{table}] Вставлено {inserted}/{total} строк")

    return inserted  # ✅ Без commit здесь!


@router.post("/{table_key}")
async def upload_parquet(
    table_key: str,
    file: UploadFile = File(...),
    folder_tag: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    # 1. Валидация table_key
    config = TABLE_CONFIG.get(table_key)
    if not config:
        raise HTTPException(
            status_code=400,
            detail=f"Неизвестная таблица '{table_key}'. Доступные: {list(TABLE_CONFIG.keys())}",
        )

    # 2. Валидация файла
    if not file.filename.endswith(".parquet"):
        raise HTTPException(status_code=400, detail="Только файлы .parquet")

    # 3. Валидация folder_tag
    clean_tag = folder_tag.strip().replace(" ", "_")
    if not clean_tag:
        raise HTTPException(status_code=400, detail="folder_tag не может быть пустым")

    # 4. Чтение файла
    try:
        content = await file.read()
        df = _parse_parquet(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 5. Валидация колонок (test_id не в файле — добавим сами)
    required_cols = [c for c in config["columns"] if c != "test_id"]
    missing = set(required_cols) - set(df.columns)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"В файле отсутствуют колонки: {missing}",
        )

    # 6. Формируем итоговый DataFrame
    df = df[[c for c in config["columns"] if c != "test_id"]].copy()
    df["test_id"] = clean_tag

    # 7. Удаляем дубликаты внутри файла
    before = len(df)
    df = df.drop_duplicates(subset=config["pk"], keep="last")
    removed = before - len(df)
    if removed > 0:
        logger.warning(f"Удалено {removed} дубликатов по PK")

    # 8. ✅ Всё в одной транзакции: данные + field_tests
    try:
        inserted = await _insert_batch(
            db=db,
            schema=config["schema"],
            table=config["table"],
            df=df,
            pk_columns=config["pk"],
        )

        # ✅ field_tests регистрируем в той же транзакции
        field_test_added = await upsert_field_test(db, clean_tag)

        # ✅ Единственный commit — атомарно фиксируем всё
        await db.commit()

        return {
            "status": "success",
            "table": f"{config['schema']}.{config['table']}",
            "test_id_applied": clean_tag,
            "field_test_registered": field_test_added,
            "rows_received": len(df),
            "rows_inserted": inserted,
            "duplicates_removed": removed,
        }

    except Exception as e:
        await db.rollback()
        logger.exception("Ошибка вставки данных")
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка записи в БД: {str(e)}",
        )
