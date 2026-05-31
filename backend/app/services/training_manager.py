# app/services/training_manager.py
import asyncio
import logging
from datetime import datetime, timezone
from enum import Enum
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


class TrainStage(str, Enum):
    QUEUED = "queued"
    LOADING_DATA = "loading_data"
    PREPARING_FEATURES = "preparing_features"
    TRAINING = "training"
    EVALUATING = "evaluating"
    SAVING = "saving"
    COMPLETED = "completed"
    FAILED = "failed"


STAGE_LABELS = {
    TrainStage.QUEUED: "В очереди",
    TrainStage.LOADING_DATA: "Загрузка данных из БД",
    TrainStage.PREPARING_FEATURES: "Подготовка фичей",
    TrainStage.TRAINING: "Обучение модели",
    TrainStage.EVALUATING: "Оценка метрик",
    TrainStage.SAVING: "Сохранение в MinIO",
    TrainStage.COMPLETED: "Завершено",
    TrainStage.FAILED: "Ошибка",
}

STAGE_WEIGHTS = {
    TrainStage.QUEUED: 0,
    TrainStage.LOADING_DATA: 10,
    TrainStage.PREPARING_FEATURES: 25,
    TrainStage.TRAINING: 70,
    TrainStage.EVALUATING: 85,
    TrainStage.SAVING: 95,
    TrainStage.COMPLETED: 100,
    TrainStage.FAILED: 0,
}


@dataclass
class LogEntry:
    timestamp: str
    level: str
    message: str
    stage: str


@dataclass
class TrainingJob:
    job_id: str
    test_id: str
    model_type: str
    target: str
    stage: TrainStage = TrainStage.QUEUED
    progress: int = 0
    stage_progress: int = 0
    logs: list[LogEntry] = field(default_factory=list)
    error: str | None = None
    result: dict | None = None
    created_at: str = ""
    updated_at: str = ""

    def __post_init__(self):
        now = datetime.now(timezone.utc).isoformat()
        if not self.created_at:
            self.created_at = now
        self.updated_at = now

    def to_dict(self) -> dict:
        return {
            "job_id": self.job_id,
            "test_id": self.test_id,
            "model_type": self.model_type,
            "target": self.target,
            "stage": self.stage.value,
            "stage_label": STAGE_LABELS.get(self.stage, self.stage.value),
            "progress": self.progress,
            "stage_progress": self.stage_progress,
            "logs": [
                {
                    "timestamp": log.timestamp,
                    "level": log.level,
                    "message": log.message,
                    "stage": log.stage,
                }
                for log in self.logs
            ],
            "error": self.error,
            "result": self.result,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class TrainingManager:
    def __init__(self):
        self._jobs: dict[str, TrainingJob] = {}
        self._events: dict[str, asyncio.Event] = {}

    def create_job(
        self, job_id: str, test_id: str, model_type: str, target: str
    ) -> TrainingJob:
        job = TrainingJob(
            job_id=job_id,
            test_id=test_id,
            model_type=model_type,
            target=target,
        )
        self._jobs[job_id] = job
        self._events[job_id] = asyncio.Event()
        self._log(job_id, "info", f"Задача создана: {model_type} → {target}")
        self._notify(job_id)
        return job

    def set_stage(self, job_id: str, stage: TrainStage, message: str = ""):
        job = self._jobs.get(job_id)
        if not job:
            return

        job.stage = stage
        job.stage_progress = 0
        job.progress = STAGE_WEIGHTS.get(stage, 0)
        job.updated_at = datetime.now(timezone.utc).isoformat()

        msg = message or STAGE_LABELS.get(stage, stage.value)
        self._log(job_id, "info", msg)
        self._notify(job_id)

    def update_stage_progress(
        self, job_id: str, stage_progress: int, message: str = ""
    ):
        job = self._jobs.get(job_id)
        if not job:
            return

        job.stage_progress = max(0, min(stage_progress, 100))

        ordered_stages = [
            TrainStage.QUEUED,
            TrainStage.LOADING_DATA,
            TrainStage.PREPARING_FEATURES,
            TrainStage.TRAINING,
            TrainStage.EVALUATING,
            TrainStage.SAVING,
            TrainStage.COMPLETED,
        ]

        if job.stage in ordered_stages:
            idx = ordered_stages.index(job.stage)
            base = STAGE_WEIGHTS[job.stage]
            next_base = STAGE_WEIGHTS[
                ordered_stages[min(idx + 1, len(ordered_stages) - 1)]
            ]
            job.progress = min(
                100,
                base + int((next_base - base) * job.stage_progress / 100),
            )

        job.updated_at = datetime.now(timezone.utc).isoformat()

        if message:
            self._log(job_id, "info", message)

        self._notify(job_id)

    def set_completed(self, job_id: str, result: dict):
        job = self._jobs.get(job_id)
        if not job:
            return

        job.stage = TrainStage.COMPLETED
        job.progress = 100
        job.stage_progress = 100
        job.result = result
        job.updated_at = datetime.now(timezone.utc).isoformat()
        self._log(job_id, "info", "Обучение завершено успешно")
        self._notify(job_id)

    def set_failed(self, job_id: str, error: str):
        job = self._jobs.get(job_id)
        if not job:
            return

        job.stage = TrainStage.FAILED
        job.error = error
        job.updated_at = datetime.now(timezone.utc).isoformat()
        self._log(job_id, "error", error)
        self._notify(job_id)

    def get_job(self, job_id: str) -> TrainingJob | None:
        return self._jobs.get(job_id)

    def get_all_jobs(self) -> list[dict]:
        return [job.to_dict() for job in self._jobs.values()]

    def _log(self, job_id: str, level: str, message: str):
        job = self._jobs.get(job_id)
        if not job:
            return

        entry = LogEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            level=level,
            message=message,
            stage=job.stage.value,
        )
        job.logs.append(entry)
        logger.info(f"[{job_id}] [{job.stage.value}] {message}")

    def _notify(self, job_id: str):
        event = self._events.get(job_id)
        if event:
            event.set()

    async def wait_for_update(self, job_id: str, timeout: float = 30.0) -> bool:
        event = self._events.get(job_id)
        if not event:
            return False

        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
            event.clear()
            return True
        except asyncio.TimeoutError:
            return False


training_manager = TrainingManager()
