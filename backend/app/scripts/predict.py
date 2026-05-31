# backend/app/scripts/predict.py
import io
import logging
import time

import joblib
import numpy as np
import pandas as pd

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import settings
from app.models import ConnectionUnsumry, PredictionResult
from app.minio_client import get_minio_client, download_bytes, download_json
from app.services.training_manager import training_manager, TrainStage
from app.services.metrics_service import compute_and_save_metrics

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TARGET = "cbp"


def _fmt(value: object, precision: int = 4) -> str:
    """Безопасное форматирование числа — возвращает 'N/A' при None/NaN."""
    if value is None:
        return "N/A"
    try:
        f = float(value)
        if np.isnan(f) or np.isinf(f):
            return "N/A"
        return f"{f:.{precision}f}"
    except (TypeError, ValueError):
        return "N/A"


async def load_prediction_data(
    test_ids: list[str],
    job_id: str | None = None,
) -> pd.DataFrame:
    mgr = training_manager

    if job_id:
        mgr.update_stage_progress(job_id, 10, f"Загрузка данных: {test_ids}")

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        stmt = select(ConnectionUnsumry).where(ConnectionUnsumry.test_id.in_(test_ids))
        result = await session.execute(stmt)
        rows = result.scalars().all()

    await engine.dispose()

    if not rows:
        raise ValueError(f"Нет данных для test_ids={test_ids} в unsumry.connection")

    records = [
        {
            col.name: getattr(row, col.name)
            for col in ConnectionUnsumry.__table__.columns
        }
        for row in rows
    ]
    df = pd.DataFrame(records)

    if job_id:
        mgr.update_stage_progress(job_id, 100, f"Загружено {len(df)} строк")

    return df


def prepare_features_for_prediction(df: pd.DataFrame, feature_names: list[str]):
    df = df.copy()

    if "dt" in df.columns:
        df["dt_parsed"] = pd.to_datetime(df["dt"])
        df["month"] = df["dt_parsed"].dt.month
        df["day_of_year"] = df["dt_parsed"].dt.dayofyear

    for col in df.select_dtypes(include=["object"]).columns:
        df[col] = df[col].astype("category").cat.codes

    drop_cols = [TARGET, "id"] + list(df.select_dtypes(include=["datetime64"]).columns)

    missing = [f for f in feature_names if f not in df.columns]
    for m in missing:
        df[m] = 0

    X = df[feature_names].values.astype(np.float64)
    X = np.nan_to_num(X, nan=0.0)

    return X


def load_model_from_minio(model_path: str):
    client = get_minio_client()
    bucket = settings.MINIO_BUCKET

    prefix = model_path.rsplit("/metadata.json", 1)[0]
    metadata = download_json(client, bucket, f"{prefix}/metadata.json")

    model_bytes = download_bytes(client, bucket, f"{prefix}/model.joblib")
    model = joblib.load(io.BytesIO(model_bytes))

    scaler_bytes = download_bytes(client, bucket, f"{prefix}/scaler.joblib")
    scaler = joblib.load(io.BytesIO(scaler_bytes))

    return model, scaler, metadata


async def save_predictions(
    model_name: str,
    df: pd.DataFrame,
    predictions: np.ndarray,
    job_id: str | None = None,
) -> int:
    mgr = training_manager
    if job_id:
        mgr.update_stage_progress(job_id, 10, "Запись предсказаний в БД...")

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    records = []
    for idx, row in df.iterrows():
        pred_val = predictions[idx]
        records.append(
            {
                "model_name": model_name,
                "dt": row["dt"],
                "conn_id": int(row["conn_id"]),
                "test_id": row["test_id"],
                "cbp": float(pred_val) if not np.isnan(pred_val) else None,
            }
        )

    async with async_session() as session:
        batch_size = 1000
        total = len(records)
        inserted = 0

        for start in range(0, total, batch_size):
            batch = records[start : start + batch_size]
            stmt = pg_insert(PredictionResult).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=["model_name", "dt", "conn_id", "test_id"],
                set_={"cbp": stmt.excluded.cbp},
            )
            await session.execute(stmt)
            inserted += len(batch)

            if job_id:
                pct = int(10 + 80 * inserted / total)
                mgr.update_stage_progress(job_id, pct, f"Записано {inserted}/{total}")

        await session.commit()

    await engine.dispose()

    if job_id:
        mgr.update_stage_progress(job_id, 100, f"Сохранено {total} предсказаний")

    return total


async def run_prediction(
    model_name: str,
    model_path: str,
    predict_test_ids: list[str],
    field_name: str,
    job_id: str | None = None,
) -> dict:
    mgr = training_manager

    try:
        # 1. Загрузка модели
        if job_id:
            mgr.set_stage(
                job_id, TrainStage.LOADING_DATA, "Загрузка модели из MinIO..."
            )

        model, scaler, metadata = load_model_from_minio(model_path)
        feature_names = metadata.get("feature_names", [])
        train_scenarios = metadata.get("train_scenarios", [])

        if job_id:
            mgr.update_stage_progress(
                job_id, 50, f"Модель загружена: {metadata.get('model_type')}"
            )

        # 2. Загрузка данных
        composed_ids = [f"{field_name}_{tid}" for tid in predict_test_ids]

        if job_id:
            mgr.set_stage(
                job_id, TrainStage.LOADING_DATA, "Загрузка данных для предсказания..."
            )

        df = await load_prediction_data(composed_ids, job_id)

        # 3. Подготовка фичей
        if job_id:
            mgr.set_stage(job_id, TrainStage.PREPARING_FEATURES, "Подготовка фичей...")

        X = prepare_features_for_prediction(df, feature_names)
        X_scaled = scaler.transform(X)

        if job_id:
            mgr.update_stage_progress(job_id, 100, f"Подготовлено {X.shape[0]} строк")

        # 4. Предсказание
        if job_id:
            mgr.set_stage(job_id, TrainStage.EVALUATING, "Выполнение предсказаний...")

        start = time.time()
        predictions = model.predict(X_scaled)
        pred_time = time.time() - start

        if job_id:
            mgr.update_stage_progress(
                job_id,
                100,
                f"Предсказано {len(predictions)} значений за {pred_time:.3f}с",
            )

        # 5. Сохранение предсказаний
        if job_id:
            mgr.set_stage(job_id, TrainStage.SAVING, "Сохранение предсказаний...")

        saved = await save_predictions(model_name, df, predictions, job_id)

        # 6. Метрики
        metrics_per_scenario: list[dict] = []

        if not train_scenarios:
            logger.warning(
                "train_scenarios не найдены в metadata — метрики не вычислены"
            )
            if job_id:
                mgr.update_stage_progress(
                    job_id, 90, "⚠️ train_scenarios не найдены в metadata модели"
                )
        else:
            if job_id:
                mgr.update_stage_progress(
                    job_id,
                    50,
                    f"Вычисление метрик для {len(composed_ids)} сценариев...",
                )
            try:
                metrics_per_scenario = await compute_and_save_metrics(
                    model_name=model_name,
                    train_scenarios=train_scenarios,
                    test_scenarios_composed=composed_ids,
                )

                if job_id:
                    mgr.update_stage_progress(
                        job_id,
                        90,
                        f"Метрики сохранены: {len(metrics_per_scenario)} записей",
                    )

                # Логируем каждую метрику с безопасным форматированием
                for m in metrics_per_scenario:
                    msg = (
                        f"  {m.get('id', '?')}: "
                        f"R²={_fmt(m.get('r2'))}, "
                        f"MAE={_fmt(m.get('mae'))}, "
                        f"RMSE={_fmt(m.get('rmse'))}"
                    )
                    logger.info(msg)
                    if job_id:
                        mgr.update_stage_progress(job_id, 90, msg)

            except Exception as exc:
                import traceback

                tb = traceback.format_exc()
                logger.error(f"Ошибка вычисления метрик:\n{tb}")
                if job_id:
                    mgr.update_stage_progress(
                        job_id,
                        90,
                        f"⚠️ Метрики не вычислены: {exc}",
                    )

        result = {
            "model_name": model_name,
            "model_type": metadata.get("model_type"),
            "field_name": field_name,
            "predict_scenarios": composed_ids,
            "rows_predicted": len(predictions),
            "rows_saved": saved,
            "prediction_time_seconds": round(pred_time, 3),
            "cbp_mean": _fmt(float(np.nanmean(predictions))),
            "cbp_std": _fmt(float(np.nanstd(predictions))),
            "cbp_min": _fmt(float(np.nanmin(predictions))),
            "cbp_max": _fmt(float(np.nanmax(predictions))),
            "metrics_per_scenario": metrics_per_scenario,
        }

        if job_id:
            mgr.set_completed(job_id, result)

        return result

    except Exception as e:
        if job_id:
            mgr.set_failed(job_id, str(e))
        raise
