from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://databuilder:localdev@localhost:5432/databuilder"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "change-me-in-production"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]
    LOG_LEVEL: str = "DEBUG"
    WEBHOOK_URL: str = ""  # Optional: URL to POST notifications on run/CDC failure
    WEBHOOK_SECRET: str = ""  # Optional: shared secret for webhook HMAC signing

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
