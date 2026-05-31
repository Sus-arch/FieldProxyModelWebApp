# backend/app/scripts/train_model.py
import asyncio
import io
import json
import logging
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import StandardScaler

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models import ConnectionUnsumry
from app.minio_client import get_minio_client, upload_bytes, upload_json
from app.services.training_manager import training_manager, TrainStage
from app.models import PredictionResult, PredictionMetrics

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

TARGET = "cbp"

MODEL_REGISTRY = {
    "linear": {
        "class": LinearRegression,
        "default_params": {},
    },
    "decision_tree": {
        "class": DecisionTreeRegressor,
        "default_params": {"max_depth": 5, "random_state": 42},
    },
    "random_forest": {
        "class": RandomForestRegressor,
        "default_params": {
            "n_estimators": 10,
            "max_depth": 5,
            "random_state": 42,
            "n_jobs": -1,
        },
    },
}


async def cleanup_existing_model(model_name: str, job_id: str | None = None):
    """Удаляет старую модель из MinIO, предсказания и метрики из БД."""
    from app.minio_client import (
        get_minio_client,
        list_objects,
        download_json,
        delete_object,
    )
    from app.config import settings

    mgr = training_manager

    if job_id:
        mgr.update_stage_progress(job_id, 5, f"Очистка старой модели '{model_name}'...")

    # 1. Удаляем из MinIO
    files_deleted = 0
    try:
        client = get_minio_client()
        bucket = settings.MINIO_BUCKET
        all_objects = list_objects(client, bucket, prefix="models/")

        for obj in all_objects:
            if not obj["name"].endswith("metadata.json"):
                continue
            try:
                meta = download_json(client, bucket, obj["name"])
                if meta.get("model_name") == model_name:
                    prefix = obj["name"].rsplit("/metadata.json", 1)[0]
                    for o in all_objects:
                        if o["name"].startswith(prefix + "/"):
                            delete_object(client, bucket, o["name"])
                            files_deleted += 1
            except Exception:
                continue
    except Exception as e:
        logger.warning(f"Ошибка очистки MinIO: {e}")

    # 2. Удаляем предсказания и метрики из БД
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        from sqlalchemy import delete as sa_delete

        pred_result = await session.execute(
            sa_delete(PredictionResult).where(PredictionResult.model_name == model_name)
        )
        metrics_result = await session.execute(
            sa_delete(PredictionMetrics).where(
                PredictionMetrics.model_name == model_name
            )
        )
        await session.commit()

        pred_deleted = pred_result.rowcount
        metrics_deleted = metrics_result.rowcount

    await engine.dispose()

    if job_id:
        mgr.update_stage_progress(
            job_id,
            10,
            f"Очищено: {files_deleted} файлов, {pred_deleted} предсказаний, {metrics_deleted} метрик",
        )

    logger.info(
        f"Очистка '{model_name}': {files_deleted} файлов, "
        f"{pred_deleted} предсказаний, {metrics_deleted} метрик"
    )


async def load_data(
    test_ids: list[str],
    label: str,
    job_id: str | None = None,
) -> pd.DataFrame:
    mgr = training_manager
    if job_id:
        mgr.update_stage_progress(job_id, 10, f"Загрузка {label}: {test_ids}")

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
        mgr.update_stage_progress(job_id, 100, f"{label}: {len(df)} строк")

    return df


def prepare_features(df: pd.DataFrame, job_id: str | None = None):
    mgr = training_manager
    if job_id:
        mgr.set_stage(job_id, TrainStage.PREPARING_FEATURES)

    df = df.copy().dropna(subset=[TARGET])
    if df.empty:
        raise ValueError(f"Нет строк с непустым '{TARGET}'")

    if job_id:
        mgr.update_stage_progress(job_id, 30, f"Строк: {len(df)}")

    if "dt" in df.columns:
        df["dt"] = pd.to_datetime(df["dt"])
        df["month"] = df["dt"].dt.month
        df["day_of_year"] = df["dt"].dt.dayofyear

    if job_id:
        mgr.update_stage_progress(job_id, 60, "Кодирование категорий...")

    for col in df.select_dtypes(include=["object"]).columns:
        df[col] = df[col].astype("category").cat.codes

    drop_cols = [TARGET] + list(df.select_dtypes(include=["datetime64"]).columns)
    y = df[TARGET].values.astype(np.float64)
    feature_cols = [c for c in df.columns if c not in drop_cols]
    X = np.nan_to_num(df[feature_cols].values.astype(np.float64), nan=0.0)

    if job_id:
        mgr.update_stage_progress(
            job_id, 100, f"Фичей: {len(feature_cols)}, X={X.shape}"
        )

    return X, y, feature_cols


def train_model(
    X_train,
    y_train,
    X_test,
    y_test,
    model_type: str,
    hyperparams: dict | None = None,
    job_id: str | None = None,
):
    mgr = training_manager
    config = MODEL_REGISTRY[model_type]
    params = {**config["default_params"], **(hyperparams or {})}

    if job_id:
        mgr.set_stage(job_id, TrainStage.TRAINING, f"Модель: {model_type}")
        mgr.update_stage_progress(
            job_id, 10, f"Train={len(y_train)}, Test={len(y_test)}"
        )

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    start = time.time()
    model = config["class"](**params)
    model.fit(X_train_s, y_train)
    train_time = time.time() - start

    if job_id:
        mgr.update_stage_progress(job_id, 70, f"Обучено за {train_time:.3f}с")

    # Оценка
    if job_id:
        mgr.set_stage(job_id, TrainStage.EVALUATING)

    y_pred_train = model.predict(X_train_s)
    y_pred_test = model.predict(X_test_s)

    # Среднее время предсказания
    n_repeats = 100
    pred_start = time.time()
    for _ in range(n_repeats):
        model.predict(X_test_s[:1])
    avg_pred_ms = (time.time() - pred_start) / n_repeats * 1000

    metrics = {
        "train": {
            "mae": round(float(mean_absolute_error(y_train, y_pred_train)), 6),
            "rmse": round(float(np.sqrt(mean_squared_error(y_train, y_pred_train))), 6),
            "r2": round(float(r2_score(y_train, y_pred_train)), 6),
        },
        "test": {
            "mae": round(float(mean_absolute_error(y_test, y_pred_test)), 6),
            "rmse": round(float(np.sqrt(mean_squared_error(y_test, y_pred_test))), 6),
            "r2": round(float(r2_score(y_test, y_pred_test)), 6),
        },
        "training_time_seconds": round(train_time, 3),
        "avg_prediction_time_ms": round(avg_pred_ms, 4),
        "n_samples_train": len(y_train),
        "n_samples_test": len(y_test),
    }

    if hasattr(model, "feature_importances_"):
        metrics["feature_importances"] = [
            round(float(v), 6) for v in model.feature_importances_
        ]

    if job_id:
        mgr.update_stage_progress(
            job_id,
            100,
            f"Test R²={metrics['test']['r2']:.4f}, MAE={metrics['test']['mae']:.4f}, "
            f"Pred={avg_pred_ms:.4f}мс",
        )

    return model, scaler, metrics


def save_to_minio(
    model,
    scaler,
    metrics,
    hyperparams,
    feature_names,
    model_name,
    field_name,
    model_type,
    train_scenarios,
    test_scenarios,
    job_id=None,
) -> dict:
    mgr = training_manager
    if job_id:
        mgr.set_stage(job_id, TrainStage.SAVING, "Подключение к MinIO...")

    client = get_minio_client()
    bucket = settings.MINIO_BUCKET
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    prefix = f"models/{field_name}/{model_name}/{ts}"

    if job_id:
        mgr.update_stage_progress(job_id, 30, "Сохранение модели...")
    buf = io.BytesIO()
    joblib.dump(model, buf)
    upload_bytes(client, bucket, f"{prefix}/model.joblib", buf.getvalue())

    if job_id:
        mgr.update_stage_progress(job_id, 60, "Сохранение scaler...")
    buf2 = io.BytesIO()
    joblib.dump(scaler, buf2)
    upload_bytes(client, bucket, f"{prefix}/scaler.joblib", buf2.getvalue())

    if job_id:
        mgr.update_stage_progress(job_id, 85, "Сохранение метаданных...")

    metadata = {
        "model_name": model_name,
        "field_name": field_name,
        "model_type": model_type,
        "target": TARGET,
        "timestamp": ts,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "train_scenarios": train_scenarios,
        "test_scenarios": test_scenarios,
        "hyperparameters": hyperparams,
        "feature_names": feature_names,
        "metrics": metrics,
        "artifacts": {
            "model": f"{prefix}/model.joblib",
            "scaler": f"{prefix}/scaler.joblib",
            "metadata": f"{prefix}/metadata.json",
        },
    }
    upload_json(client, bucket, f"{prefix}/metadata.json", metadata)

    if job_id:
        mgr.update_stage_progress(job_id, 100, f"Сохранено: {prefix}/")

    return metadata


async def run_training(
    model_name: str,
    field_name: str,
    train_test_ids: list[str],
    test_test_ids: list[str],
    model_type: str = "random_forest",
    hyperparams: dict | None = None,
    job_id: str | None = None,
    overwrite: bool = False,
) -> dict:
    mgr = training_manager

    try:
        if overwrite:
            await cleanup_existing_model(model_name, job_id)
        # Склеиваем: field_name + "_" + test_id
        train_composed = [f"{field_name}_{tid}" for tid in train_test_ids]
        test_composed = [f"{field_name}_{tid}" for tid in test_test_ids]

        if job_id:
            mgr.set_stage(job_id, TrainStage.LOADING_DATA, "Загрузка данных...")
            mgr.update_stage_progress(
                job_id, 5, f"Train: {train_composed}, Test: {test_composed}"
            )

        df_train = await load_data(train_composed, "Train", job_id)
        df_test = await load_data(test_composed, "Test", job_id)

        X_train, y_train, feature_names = prepare_features(df_train, job_id)
        X_test, y_test, _ = prepare_features(df_test, None)

        final_params = {
            **MODEL_REGISTRY[model_type]["default_params"],
            **(hyperparams or {}),
        }

        model, scaler, metrics = train_model(
            X_train,
            y_train,
            X_test,
            y_test,
            model_type,
            hyperparams,
            job_id,
        )

        metadata = save_to_minio(
            model,
            scaler,
            metrics,
            final_params,
            feature_names,
            model_name,
            field_name,
            model_type,
            train_composed,
            test_composed,
            job_id,
        )

        if job_id:
            mgr.set_completed(job_id, metadata)

        return metadata

    except Exception as e:
        if job_id:
            mgr.set_failed(job_id, str(e))
        raise
