from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    DATABASE_URL: str = Field(..., description="Async SQLAlchemy URL")
    DB_USER: str = Field(..., alias="POSTGRES_USER")
    DB_PASSWORD: str = Field(..., alias="POSTGRES_PASSWORD")
    DB_NAME: str = Field(..., alias="POSTGRES_DB")

    # MinIO
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin123"
    MINIO_BUCKET: str = "ml-models"
    MINIO_SECURE: bool = False

    class Config:
        env_file = "../../.env"
        env_file_encoding = "utf-8"


settings = Settings()
