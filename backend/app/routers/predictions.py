# backend/app/routers/predictions.py
import json
import uuid

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.scripts.predict import run_prediction
from app.services.training_manager import training_manager
from app.minio_client import get_minio_client, list_objects, download_json
from app.config import settings

from typing import Annotated
from fastapi import Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db import get_db
from app.models import PredictionResult, ConnectionUnsumry
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db import get_db
from app.models import PredictionResult, ConnectionUnsumry, PredictionMetrics

router = APIRouter(prefix="/api/predictions", tags=["predictions"])


class PredictRequest(BaseModel):
    model_name: str
    model_path: str
    field_name: str
    predict_test_ids: list[str]


class PredictResponse(BaseModel):
    status: str
    job_id: str
    message: str


@router.post("/run", response_model=PredictResponse)
async def start_prediction(req: PredictRequest, background_tasks: BackgroundTasks):
    if not req.predict_test_ids:
        raise HTTPException(status_code=400, detail="Выберите хотя бы один сценарий")

    job_id = str(uuid.uuid4())[:8]

    training_manager.create_job(
        job_id=job_id,
        test_id=req.model_name,
        model_type="prediction",
        target="cbp",
    )

    background_tasks.add_task(
        run_prediction,
        model_name=req.model_name,
        model_path=req.model_path,
        predict_test_ids=req.predict_test_ids,
        field_name=req.field_name,
        job_id=job_id,
    )

    return PredictResponse(
        status="started",
        job_id=job_id,
        message=f"Предсказание запущено. ID: {job_id}",
    )


@router.get("/run/{job_id}/stream")
async def stream_prediction_progress(job_id: str):
    job = training_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    async def event_generator():
        last_sent = -1
        while True:
            cj = training_manager.get_job(job_id)
            if not cj:
                break
            data = cj.to_dict()
            cl = len(cj.logs)
            if cl != last_sent or cj.stage.value in ("completed", "failed"):
                payload = json.dumps(data, default=str, ensure_ascii=False)
                yield f"data: {payload}\n\n"
                last_sent = cl
            if cj.stage.value in ("completed", "failed"):
                yield f"event: done\ndata: {json.dumps(data, default=str, ensure_ascii=False)}\n\n"
                break
            await training_manager.wait_for_update(job_id, timeout=2.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/models")
async def get_available_models():
    client = get_minio_client()
    bucket = settings.MINIO_BUCKET
    try:
        objects = list_objects(client, bucket, prefix="models/")
    except Exception:
        return {"models": []}

    metadata_files = [o for o in objects if o["name"].endswith("metadata.json")]
    models = []
    for mf in metadata_files:
        try:
            m = download_json(client, bucket, mf["name"])
            models.append(
                {
                    "path": mf["name"],
                    "model_name": m.get("model_name"),
                    "field_name": m.get("field_name"),
                    "model_type": m.get("model_type"),
                    "target": m.get("target"),
                    "created_at": m.get("created_at"),
                    "train_scenarios": m.get("train_scenarios", []),
                    "test_scenarios": m.get("test_scenarios", []),
                    "metrics_test": m.get("metrics", {}).get("test"),
                    "feature_names": m.get("feature_names", []),
                }
            )
        except Exception:
            continue

    models.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"models": models}


@router.get("/compare/{model_name}")
async def compare_predictions(
    model_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    test_id: str | None = Query(None),
):
    """
    Сравнение предсказаний модели с реальными значениями из unsumry.connection.
    Группировка по dt и test_id.
    """
    # Предсказания
    pred_stmt = select(
        PredictionResult.dt,
        PredictionResult.test_id,
        PredictionResult.conn_id,
        PredictionResult.cbp.label("cbp_predicted"),
    ).where(PredictionResult.model_name == model_name)

    if test_id:
        pred_stmt = pred_stmt.where(PredictionResult.test_id == test_id)

    pred_result = await db.execute(pred_stmt)
    pred_rows = pred_result.all()

    if not pred_rows:
        raise HTTPException(
            status_code=404,
            detail=f"Нет предсказаний для модели '{model_name}'",
        )

    # Собираем уникальные test_id и conn_id
    test_ids = list({r.test_id for r in pred_rows})
    conn_ids = list({r.conn_id for r in pred_rows})

    # Реальные значения
    real_stmt = select(
        ConnectionUnsumry.dt,
        ConnectionUnsumry.test_id,
        ConnectionUnsumry.conn_id,
        ConnectionUnsumry.cbp.label("cbp_actual"),
    ).where(
        ConnectionUnsumry.test_id.in_(test_ids),
        ConnectionUnsumry.conn_id.in_(conn_ids),
    )

    real_result = await db.execute(real_stmt)
    real_rows = real_result.all()

    # Индексируем реальные значения
    real_map: dict[tuple, float | None] = {}
    for r in real_rows:
        key = (str(r.dt), r.test_id, r.conn_id)
        real_map[key] = r.cbp_actual

    # Собираем данные по сценариям
    scenarios: dict[str, list[dict]] = {}

    for p in pred_rows:
        tid = p.test_id
        if tid not in scenarios:
            scenarios[tid] = []

        key = (str(p.dt), p.test_id, p.conn_id)
        actual = real_map.get(key)

        scenarios[tid].append(
            {
                "dt": str(p.dt),
                "conn_id": p.conn_id,
                "cbp_predicted": p.cbp_predicted,
                "cbp_actual": actual,
            }
        )

    # Агрегация по dt для каждого сценария (среднее по conn_id)
    aggregated: dict[str, list[dict]] = {}

    for tid, points in scenarios.items():
        by_dt: dict[str, dict] = {}
        for pt in points:
            dt_key = pt["dt"]
            if dt_key not in by_dt:
                by_dt[dt_key] = {
                    "dt": dt_key,
                    "pred_values": [],
                    "actual_values": [],
                }
            if pt["cbp_predicted"] is not None:
                by_dt[dt_key]["pred_values"].append(pt["cbp_predicted"])
            if pt["cbp_actual"] is not None:
                by_dt[dt_key]["actual_values"].append(pt["cbp_actual"])

        agg_points = []
        for dt_key in sorted(by_dt.keys()):
            entry = by_dt[dt_key]
            pred_vals = entry["pred_values"]
            actual_vals = entry["actual_values"]

            agg_points.append(
                {
                    "dt": dt_key,
                    "cbp_predicted": (
                        round(sum(pred_vals) / len(pred_vals), 4) if pred_vals else None
                    ),
                    "cbp_actual": (
                        round(sum(actual_vals) / len(actual_vals), 4)
                        if actual_vals
                        else None
                    ),
                    "n_connections": len(pred_vals),
                }
            )

        aggregated[tid] = agg_points

    # Общая статистика
    all_pred = [p.cbp_predicted for p in pred_rows if p.cbp_predicted is not None]
    all_actual = [real_map.get((str(p.dt), p.test_id, p.conn_id)) for p in pred_rows]
    all_actual = [a for a in all_actual if a is not None]

    stats = {
        "model_name": model_name,
        "total_predictions": len(pred_rows),
        "scenarios": test_ids,
        "n_scenarios": len(test_ids),
    }

    if all_pred and all_actual and len(all_pred) == len(all_actual):
        import numpy as np

        pred_arr = np.array(all_pred[: len(all_actual)])
        actual_arr = np.array(all_actual[: len(all_pred)])
        mask = ~np.isnan(pred_arr) & ~np.isnan(actual_arr)
        if mask.sum() > 0:
            p = pred_arr[mask]
            a = actual_arr[mask]
            stats["mae"] = round(float(np.mean(np.abs(p - a))), 4)
            stats["rmse"] = round(float(np.sqrt(np.mean((p - a) ** 2))), 4)
            ss_res = np.sum((a - p) ** 2)
            ss_tot = np.sum((a - np.mean(a)) ** 2)
            stats["r2"] = round(float(1 - ss_res / ss_tot), 4) if ss_tot > 0 else None

    return {
        "stats": stats,
        "scenarios": aggregated,
    }


@router.get("/models-with-predictions")
async def get_models_with_predictions(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Список моделей, для которых есть предсказания."""
    stmt = select(
        PredictionResult.model_name,
        func.count().label("count"),
        func.min(PredictionResult.dt).label("dt_min"),
        func.max(PredictionResult.dt).label("dt_max"),
    ).group_by(PredictionResult.model_name)

    result = await db.execute(stmt)
    rows = result.all()

    return {
        "models": [
            {
                "model_name": r.model_name,
                "predictions_count": r.count,
                "dt_min": str(r.dt_min) if r.dt_min else None,
                "dt_max": str(r.dt_max) if r.dt_max else None,
            }
            for r in rows
        ]
    }


@router.get("/metrics/{model_name}")
async def get_model_metrics(
    model_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Метрики модели по всем сценариям."""
    stmt = (
        select(PredictionMetrics)
        .where(PredictionMetrics.model_name == model_name)
        .order_by(PredictionMetrics.test_scenario)
    )

    result = await db.execute(stmt)
    rows = result.scalars().all()

    return {
        "model_name": model_name,
        "metrics": [
            {
                "id": r.id,
                "model_name": r.model_name,
                "train_scenarios": (
                    r.train_scenarios.split(",") if r.train_scenarios else []
                ),
                "test_scenario": r.test_scenario,
                "mae": r.mae,
                "rmse": r.rmse,
                "r2": r.r2,
                "created_at": str(r.created_at) if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.get("/metrics")
async def get_all_metrics(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Все метрики."""
    stmt = select(PredictionMetrics).order_by(
        PredictionMetrics.model_name, PredictionMetrics.test_scenario
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    return {
        "metrics": [
            {
                "id": r.id,
                "model_name": r.model_name,
                "train_scenarios": (
                    r.train_scenarios.split(",") if r.train_scenarios else []
                ),
                "test_scenario": r.test_scenario,
                "mae": r.mae,
                "rmse": r.rmse,
                "r2": r.r2,
                "created_at": str(r.created_at) if r.created_at else None,
            }
            for r in rows
        ],
    }
