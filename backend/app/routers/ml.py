# backend/app/routers/ml.py
import json
import uuid

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.minio_client import (
    get_minio_client,
    list_objects,
    download_json,
    delete_object,
)
from app.config import settings
from app.scripts.train_model import run_training, MODEL_REGISTRY
from app.services.training_manager import training_manager

from typing import Annotated
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from app.db import get_db
from app.models import PredictionResult, PredictionMetrics

router = APIRouter(prefix="/api/ml", tags=["ml"])


class TrainRequest(BaseModel):
    model_name: str
    field_name: str
    train_test_ids: list[str]
    test_test_ids: list[str]
    model_type: str = Field(default="random_forest")
    hyperparams: dict | None = None
    overwrite: bool = Field(default=False)  # ← добавлено


class TrainResponse(BaseModel):
    status: str
    job_id: str
    message: str


@router.get("/models/{model_name}/exists")
async def check_model_exists(
    model_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Проверяет, существует ли модель с таким именем."""
    client = get_minio_client()
    bucket = settings.MINIO_BUCKET
    minio_exists = False

    try:
        objects = list_objects(client, bucket, prefix="models/")
        for obj in objects:
            if not obj["name"].endswith("metadata.json"):
                continue
            try:
                meta = download_json(client, bucket, obj["name"])
                if meta.get("model_name") == model_name:
                    minio_exists = True
                    break
            except Exception:
                continue
    except Exception:
        pass

    pred_count = (
        await db.execute(
            select(func.count())
            .select_from(PredictionResult)
            .where(PredictionResult.model_name == model_name)
        )
    ).scalar_one()

    metrics_count = (
        await db.execute(
            select(func.count())
            .select_from(PredictionMetrics)
            .where(PredictionMetrics.model_name == model_name)
        )
    ).scalar_one()

    exists = minio_exists or pred_count > 0 or metrics_count > 0

    return {
        "model_name": model_name,
        "exists": exists,
        "minio_exists": minio_exists,
        "predictions_count": pred_count,
        "metrics_count": metrics_count,
    }


@router.post("/train", response_model=TrainResponse)
async def start_training(req: TrainRequest, background_tasks: BackgroundTasks):
    if req.model_type not in MODEL_REGISTRY:
        raise HTTPException(
            status_code=400,
            detail=f"Неизвестная модель '{req.model_type}'. "
            f"Доступные: {list(MODEL_REGISTRY.keys())}",
        )
    if not req.train_test_ids:
        raise HTTPException(status_code=400, detail="Нужен хотя бы один Train-сценарий")
    if not req.test_test_ids:
        raise HTTPException(status_code=400, detail="Нужен хотя бы один Test-сценарий")

    job_id = str(uuid.uuid4())[:8]

    training_manager.create_job(
        job_id=job_id,
        test_id=req.model_name,
        model_type=req.model_type,
        target="cbp",
    )

    background_tasks.add_task(
        run_training,
        model_name=req.model_name,
        field_name=req.field_name,
        train_test_ids=req.train_test_ids,
        test_test_ids=req.test_test_ids,
        model_type=req.model_type,
        hyperparams=req.hyperparams,
        job_id=job_id,
        overwrite=req.overwrite,  # ← добавлено
    )

    return TrainResponse(
        status="started",
        job_id=job_id,
        message=f"Обучение '{req.model_name}' запущено",
    )


@router.get("/train/{job_id}/status")
async def get_status(job_id: str):
    job = training_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return job.to_dict()


@router.get("/train/{job_id}/stream")
async def stream_progress(job_id: str):
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


@router.get("/train/jobs")
async def list_jobs():
    return {"jobs": training_manager.get_all_jobs()}


@router.get("/models")
async def get_models():
    client = get_minio_client()
    bucket = settings.MINIO_BUCKET
    try:
        objects = list_objects(client, bucket, prefix="models/")
    except Exception:
        return {"models": [], "error": "MinIO недоступен"}

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
                    "created_at": m.get("created_at"),
                    "train_scenarios": m.get("train_scenarios", []),
                    "test_scenarios": m.get("test_scenarios", []),
                    "metrics_test": m.get("metrics", {}).get("test"),
                    "training_time_seconds": m.get("metrics", {}).get(
                        "training_time_seconds"
                    ),
                    "avg_prediction_time_ms": m.get("metrics", {}).get(
                        "avg_prediction_time_ms"
                    ),
                    "hyperparameters": m.get("hyperparameters", {}),
                }
            )
        except Exception:
            continue

    models.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"models": models, "total": len(models)}


@router.get("/model-types")
async def get_model_types():
    return {
        n: {"default_params": c["default_params"]} for n, c in MODEL_REGISTRY.items()
    }


def _delete_model_from_minio(model_name: str) -> int:
    client = get_minio_client()
    bucket = settings.MINIO_BUCKET
    files_deleted = 0

    try:
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
    except Exception:
        pass

    return files_deleted


@router.delete("/models/{model_name}")
async def delete_model(model_name: str):
    client = get_minio_client()
    bucket = settings.MINIO_BUCKET

    try:
        all_objects = list_objects(client, bucket, prefix="models/")
    except Exception:
        raise HTTPException(status_code=500, detail="MinIO недоступен")

    to_delete = []
    for obj in all_objects:
        if not obj["name"].endswith("metadata.json"):
            continue
        try:
            meta = download_json(client, bucket, obj["name"])
            if meta.get("model_name") == model_name:
                prefix = obj["name"].rsplit("/metadata.json", 1)[0]
                to_delete.extend(
                    o for o in all_objects if o["name"].startswith(prefix + "/")
                )
        except Exception:
            continue

    if not to_delete:
        raise HTTPException(
            status_code=404,
            detail=f"Модель '{model_name}' не найдена в MinIO",
        )

    deleted_count = 0
    for obj in to_delete:
        try:
            delete_object(client, bucket, obj["name"])
            deleted_count += 1
        except Exception:
            continue

    return {
        "status": "success",
        "model_name": model_name,
        "files_deleted": deleted_count,
    }


@router.delete("/models/{model_name}/predictions")
async def delete_model_predictions(
    model_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    count_stmt = (
        select(func.count())
        .select_from(PredictionResult)
        .where(PredictionResult.model_name == model_name)
    )
    total = (await db.execute(count_stmt)).scalar_one()

    await db.execute(
        delete(PredictionResult).where(PredictionResult.model_name == model_name)
    )
    await db.commit()

    return {"status": "success", "model_name": model_name, "predictions_deleted": total}


@router.delete("/models/{model_name}/all")
async def delete_model_and_predictions(
    model_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    pred_count_stmt = (
        select(func.count())
        .select_from(PredictionResult)
        .where(PredictionResult.model_name == model_name)
    )
    predictions_count = (await db.execute(pred_count_stmt)).scalar_one()

    metrics_count_stmt = (
        select(func.count())
        .select_from(PredictionMetrics)
        .where(PredictionMetrics.model_name == model_name)
    )
    metrics_count = (await db.execute(metrics_count_stmt)).scalar_one()

    await db.execute(
        delete(PredictionResult).where(PredictionResult.model_name == model_name)
    )
    await db.execute(
        delete(PredictionMetrics).where(PredictionMetrics.model_name == model_name)
    )
    await db.commit()

    files_deleted = _delete_model_from_minio(model_name)

    return {
        "status": "success",
        "model_name": model_name,
        "predictions_deleted": predictions_count,
        "metrics_deleted": metrics_count,
        "minio_files_deleted": files_deleted,
    }
