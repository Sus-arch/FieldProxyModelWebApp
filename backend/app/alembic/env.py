# backend/app/alembic/env.py
import os
import sys
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool, text
from alembic import context

# Добавляем путь к проекту, чтобы работали импорты моделей
sys.path.insert(0, "/app")

from app.models import Base  # Убедитесь, что импорт верный!

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url():
    """
    Формирует URL из переменных окружения.
    Работает и в Docker, и локально.
    """
    user = os.getenv("POSTGRES_USER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD", "postgres")
    host = os.getenv("DB_HOST", "db")  # 'db' - имя сервиса в docker-compose
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "appdb")

    return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db}"


def run_migrations_offline() -> None:
    """Запуск миграций в offline-режиме"""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table_schema="public",
        include_schemas=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Запуск миграций в online-режиме"""
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()  # 🔥 Подставляем реальный URL

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table_schema="public",
            include_schemas=True,
            include_object=lambda object, name, type_, reflected, compare_to: (
                False if (type_ == "table" and name == "alembic_version") else True
            ),
        )
        with context.begin_transaction():
            # Создаём схемы, если их нет (идемпотентно)
            connection.execute(text("CREATE SCHEMA IF NOT EXISTS data"))
            connection.execute(text("CREATE SCHEMA IF NOT EXISTS unsumry"))
            connection.execute(text("CREATE SCHEMA IF NOT EXISTS predictions"))
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
