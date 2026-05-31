# backend/app/services/field_tests.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert
from app.models import FieldTestsMeta
import logging

logger = logging.getLogger(__name__)


def parse_folder_tag(folder_tag: str) -> tuple[str, str]:
    """
    Разбивает folder_tag на (field_name, test_id_part).

    Примеры:
        "project_alpha_wells" → ("project_alpha", "wells")
        "my_field_groups" → ("my_field", "groups")
        "single" → ("single", "default")

    Логика: разбиваем по ПОСЛЕДНЕМУ подчёркиванию,
    т.к. field_name может содержать подчёркивания.
    """
    if "_" not in folder_tag:
        return folder_tag, "default"

    idx = folder_tag.rfind("_")  # Последний символ "_"
    field_name = folder_tag[:idx]
    test_id_part = folder_tag[idx + 1 :]

    return field_name, test_id_part


async def upsert_field_test(db: AsyncSession, folder_tag: str) -> bool:
    """
    Добавляет запись в data.field_tests через UPSERT.

    Returns:
        True если запись добавлена/обновлена, False если уже существовала.
    """
    field_name, test_id_part = parse_folder_tag(folder_tag)

    # Подготавливаем UPSERT-запрос
    stmt = insert(FieldTestsMeta).values(field_name=field_name, test_id=test_id_part)

    # ON CONFLICT → ничего не делать (если запись уже есть)
    stmt = stmt.on_conflict_do_nothing(
        index_elements=["field_name", "test_id"]  # Составной PK из модели
    )

    result = await db.execute(stmt)

    # result.rowcount == 1 → запись вставлена, 0 → уже существовала
    if result.rowcount > 0:
        logger.info(
            f"✅ Добавлено в field_tests: field_name='{field_name}', test_id='{test_id_part}'"
        )
        return True
    else:
        logger.debug(
            f"⏭️ field_tests уже содержит: field_name='{field_name}', test_id='{test_id_part}'"
        )
        return False
