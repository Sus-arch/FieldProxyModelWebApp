# backend/app/scripts/seed_data.py
"""
Скрипт для заполнения БД тестовыми данными.
Запуск:
  docker compose run --rm backend python -m app.scripts.seed_data
"""
import asyncio
import random
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.db import AsyncSessionLocal
from app.models import ConnectionData, WellData, GroupData, ConnectionUnsumry


async def seed_data():
    async with AsyncSessionLocal() as session:
        # 🔹 Очистка (опционально, для повторных запусков)
        await session.execute(
            text("TRUNCATE TABLE unsumry.connection RESTART IDENTITY CASCADE")
        )
        await session.execute(
            text("TRUNCATE TABLE data.connection RESTART IDENTITY CASCADE")
        )
        await session.execute(text("TRUNCATE TABLE data.well RESTART IDENTITY CASCADE"))
        await session.execute(
            text('TRUNCATE TABLE data."group" RESTART IDENTITY CASCADE')
        )
        await session.commit()

        base_time = datetime(2026, 4, 1, 8, 0, 0)
        test_id = "TEST_001"

        # 🔹 Данные для data.well
        wells = [
            WellData(
                dt=base_time + timedelta(hours=i),
                well_id=f"WELL_{j:02d}",
                test_id=test_id,
                weff=round(random.uniform(0.7, 0.99), 3),  # ✅ snake_case
            )
            for j in range(1, 4)  # 3 скважины
            for i in range(5)  # 5 замеров каждая
        ]
        session.add_all(wells)

        # 🔹 Данные для data.group
        groups = [
            GroupData(
                dt=base_time + timedelta(hours=i),
                group_id=f"GRP_{j:02d}",
                test_id=test_id,
                geff=round(random.uniform(0.6, 0.95), 3),  # ✅ snake_case
            )
            for j in range(1, 3)  # 2 группы
            for i in range(5)
        ]
        session.add_all(groups)

        # 🔹 Данные для data.connection
        connections = [
            ConnectionData(
                dt=base_time + timedelta(hours=h),
                well_id=f"WELL_{w:02d}",
                perf_i=random.randint(1, 100),  # ✅ snake_case
                perf_j=random.randint(1, 50),  # ✅ snake_case
                perf_k=random.randint(1, 20),  # ✅ snake_case
                test_id=test_id,
                swl=round(random.uniform(0.1, 0.4), 3),  # ✅ snake_case
                swu=round(random.uniform(0.5, 0.9), 3),  # ✅ snake_case
            )
            for w in range(1, 4)
            for h in range(5)
        ]
        session.add_all(connections)

        # 🔹 Данные для unsumry.connection (результаты обработки)
        results = [
            ConnectionUnsumry(
                dt=base_time + timedelta(hours=h),
                well_id=f"WELL_{w:02d}",
                perf_i=c.perf_i,  # ✅ snake_case
                perf_j=c.perf_j,  # ✅ snake_case
                perf_k=c.perf_k,  # ✅ snake_case
                test_id=test_id,
                cgpr=round(random.uniform(100, 5000), 2),  # ✅ snake_case
                cgpt=round(random.uniform(1000, 50000), 2),  # ✅ snake_case
                cwpr=round(random.uniform(10, 500), 2),  # ✅ snake_case
                cwpt=round(random.uniform(100, 5000), 2),  # ✅ snake_case
            )
            for w in range(1, 4)
            for h in range(5)
            for c in [
                conn
                for conn in connections
                if conn.well_id == f"WELL_{w:02d}"
                and conn.dt == base_time + timedelta(hours=h)
            ]
        ]
        session.add_all(results)

        await session.commit()
        print(
            f"✅ Загружено тестовых данных: {len(wells)} wells, {len(groups)} groups, {len(connections)} connections, {len(results)} results"
        )


if __name__ == "__main__":
    asyncio.run(seed_data())
