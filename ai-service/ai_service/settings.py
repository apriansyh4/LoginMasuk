from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AILOKAL_", env_file=None, extra="ignore")

    service_secret: str = ""  # shared secret with the Next.js server layer (required)
    models_dir: str = "models"
    preload_models: bool = False
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
