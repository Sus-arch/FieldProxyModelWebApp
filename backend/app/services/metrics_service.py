# backend/app/services/metrics_service.py
import logging
from datetime import datetime

import numpy as np
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy import select

from app.config import settings
from app.models import PredictionResult, PredictionMetrics, ConnectionUnsumry
from app.services.metrics_utils import build_metrics_id

logger = logging.getLogger(__name__)


def _fmt_metric(value: float | None, precision: int = 4) -> str:
    """Безопасное форматирование метрик."""
    if value is None:
        return "N/A"
    try:
        v = float(value)
        if np.isnan(v) or np.isinf(v):
            return "N/A"
        return f"{v:.{precision}f}"
    except (TypeError, ValueError):
        return "N/A"


async def compute_and_save_metrics(
    model_name: str,
    train_scenarios: list[str],
    test_scenarios_composed: list[str],
) -> list[dict]:
    """
    Для каждого тестового сценария:
    1. Берёт предсказания из predictions.results
    2. Берёт реальные значения из unsumry.connection
    3. Вычисляет MAE, RMSE, R²
    4. Сохраняет/перезаписывает в predictions.metrics
    """
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    results: list[dict] = []

    async with async_session() as session:
        for test_scenario in test_scenarios_composed:
            # 1. Предсказания
            pred_stmt = select(
                PredictionResult.dt,
                PredictionResult.conn_id,
                PredictionResult.cbp,
            ).where(
                PredictionResult.model_name == model_name,
                PredictionResult.test_id == test_scenario,
            )
            pred_rows = (await session.execute(pred_stmt)).all()

            if not pred_rows:
                logger.warning(
                    f"Нет предсказаний для model_name='{model_name}', test_scenario='{test_scenario}'"
                )
                continue

            # 2. Реальные значения
            real_stmt = select(
                ConnectionUnsumry.dt,
                ConnectionUnsumry.conn_id,
                ConnectionUnsumry.cbp,
            ).where(
                ConnectionUnsumry.test_id == test_scenario,
            )
            real_rows = (await session.execute(real_stmt)).all()

            real_map = {(r.dt, r.conn_id): r.cbp for r in real_rows}

            # 3. Сопоставление predicted vs actual
            predicted: list[float] = []
            actual: list[float] = []

            for p in pred_rows:
                key = (p.dt, p.conn_id)
                real_val = real_map.get(key)

                if p.cbp is None or real_val is None:
                    continue

                try:
                    pred_val = float(p.cbp)
                    act_val = float(real_val)
                except (TypeError, ValueError):
                    continue

                if np.isnan(pred_val) or np.isnan(act_val):
                    continue

                predicted.append(pred_val)
                actual.append(act_val)

            if len(predicted) < 2:
                logger.warning(
                    f"Недостаточно данных для расчёта метрик: "
                    f"model_name='{model_name}', test_scenario='{test_scenario}', points={len(predicted)}"
                )
                continue

            pred_arr = np.array(predicted, dtype=float)
            actual_arr = np.array(actual, dtype=float)

            mae = float(np.mean(np.abs(pred_arr - actual_arr)))
            rmse = float(np.sqrt(np.mean((pred_arr - actual_arr) ** 2)))

            ss_res = float(np.sum((actual_arr - pred_arr) ** 2))
            ss_tot = float(np.sum((actual_arr - np.mean(actual_arr)) ** 2))
            r2 = float(1 - ss_res / ss_tot) if ss_tot > 0 else None

            # 4. Формируем id
            metrics_id = build_metrics_id(model_name, train_scenarios, test_scenario)

            # 5. Upsert в predictions.metrics
            stmt = (
                pg_insert(PredictionMetrics)
                .values(
                    id=metrics_id,
                    model_name=model_name,
                    train_scenarios=",".join(sorted(train_scenarios)),
                    test_scenario=test_scenario,
                    mae=round(mae, 6),
                    rmse=round(rmse, 6),
                    r2=round(r2, 6) if r2 is not None else None,
                    created_at=datetime.utcnow(),
                )
                .on_conflict_do_update(
                    index_elements=["id"],
                    set_={
                        "model_name": model_name,
                        "train_scenarios": ",".join(sorted(train_scenarios)),
                        "test_scenario": test_scenario,
                        "mae": round(mae, 6),
                        "rmse": round(rmse, 6),
                        "r2": round(r2, 6) if r2 is not None else None,
                        "created_at": datetime.utcnow(),
                    },
                )
            )

            await session.execute(stmt)

            entry = {
                "id": metrics_id,
                "model_name": model_name,
                "train_scenarios": train_scenarios,
                "test_scenario": test_scenario,
                "mae": round(mae, 6),
                "rmse": round(rmse, 6),
                "r2": round(r2, 6) if r2 is not None else None,
                "n_points": len(predicted),
            }
            results.append(entry)

            logger.info(
                f"Метрики {metrics_id}: "
                f"MAE={_fmt_metric(mae)}, "
                f"RMSE={_fmt_metric(rmse)}, "
                f"R²={_fmt_metric(r2)}, "
                f"points={len(predicted)}"
            )

        await session.commit()

    await engine.dispose()
    return results
