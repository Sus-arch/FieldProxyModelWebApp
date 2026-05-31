# backend/app/minio_client.py
import io
import json
import logging
from datetime import datetime

from minio import Minio
from minio.error import S3Error

from app.config import settings

logger = logging.getLogger(__name__)


def get_minio_client() -> Minio:
    """Создаёт и возвращает MinIO-клиент."""
    return Minio(
        endpoint=settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )


def ensure_bucket(client: Minio, bucket: str) -> None:
    """Создаёт бакет, если его нет."""
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
        logger.info(f"Создан бакет: {bucket}")


def upload_bytes(
    client: Minio,
    bucket: str,
    object_name: str,
    data: bytes,
    content_type: str = "application/octet-stream",
) -> str:
    """Загружает bytes в MinIO, возвращает путь."""
    ensure_bucket(client, bucket)
    client.put_object(
        bucket_name=bucket,
        object_name=object_name,
        data=io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    logger.info(f"Загружен объект: {bucket}/{object_name} ({len(data)} bytes)")
    return f"{bucket}/{object_name}"


def upload_json(
    client: Minio,
    bucket: str,
    object_name: str,
    payload: dict,
) -> str:
    """Загружает JSON-словарь в MinIO."""
    data = json.dumps(payload, indent=2, default=str, ensure_ascii=False).encode(
        "utf-8"
    )
    return upload_bytes(client, bucket, object_name, data, "application/json")


def download_bytes(client: Minio, bucket: str, object_name: str) -> bytes:
    """Скачивает объект из MinIO."""
    response = client.get_object(bucket, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def download_json(client: Minio, bucket: str, object_name: str) -> dict:
    """Скачивает JSON из MinIO."""
    data = download_bytes(client, bucket, object_name)
    return json.loads(data.decode("utf-8"))


def list_objects(client: Minio, bucket: str, prefix: str = "") -> list[dict]:
    """Список объектов в бакете с заданным префиксом."""
    ensure_bucket(client, bucket)
    objects = client.list_objects(bucket, prefix=prefix, recursive=True)
    result = []
    for obj in objects:
        result.append(
            {
                "name": obj.object_name,
                "size": obj.size,
                "last_modified": (
                    obj.last_modified.isoformat() if obj.last_modified else None
                ),
            }
        )
    return result


def delete_object(client: Minio, bucket: str, object_name: str) -> None:
    """Удаляет объект из MinIO."""
    client.remove_object(bucket, object_name)
    logger.info(f"Удалён объект: {bucket}/{object_name}")
