"""Runtime configuration, read once from the environment."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    app_name: str = "MIRAGE"
    version: str = "1.0.0"
    database_url: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'var' / 'mirage.db'}")
    storage_dir: Path = Path(os.getenv("MIRAGE_STORAGE", BASE_DIR / "var" / "evidence"))
    models_dir: Path = BASE_DIR / "models_store"
    corpus_dir: Path = BASE_DIR / "app" / "rag" / "corpus"
    jwt_secret: str = os.getenv("MIRAGE_JWT_SECRET", "mirage-dev-secret-change-me-in-production-please")
    jwt_ttl_hours: int = 12
    max_upload_mb: int = int(os.getenv("MIRAGE_MAX_UPLOAD_MB", "200"))
    cors_origins: list[str] = field(
        default_factory=lambda: os.getenv(
            "MIRAGE_CORS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"
        ).split(",")
    )
    # Optional LLM narration. Without these the Tribunal uses deterministic, evidence-cited templates.
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY")
    anthropic_model: str = os.getenv("MIRAGE_LLM_MODEL", "claude-sonnet-5-5")
    ollama_url: str | None = os.getenv("OLLAMA_URL")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
    model_version: str = "mirage-witnesses@1.0"
    policy_version: str = "risk-policy@1.0"


settings = Settings()
settings.storage_dir.mkdir(parents=True, exist_ok=True)
(BASE_DIR / "var").mkdir(parents=True, exist_ok=True)
