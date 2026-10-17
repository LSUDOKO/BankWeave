"""Runtime settings loaded from environment / .env."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    falkordb_host: str = "localhost"
    falkordb_port: int = 6390
    falkordb_username: str | None = None
    falkordb_password: str | None = None

    redis_url: str = "redis://localhost:6391/0"
    postgres_url: str = "postgresql://postgres:bankweave@localhost:5440/kyc"

    openrouter_api_key: str | None = None
    llm_writer_model: str = "openrouter/anthropic/claude-haiku-5-5"
    llm_auditor_model: str = "openrouter/openai/gpt-5"

    dataset: str = "HI-Small"
    data_dir: Path = ROOT / "data" / "raw"
    top_n_banks: int = 4
    hash_salt: str = "bankweave-demo-salt"
    synth_seed: int = 42

    # agent runtime
    task_stale_seconds: int = 30
    worker_concurrency: int = 3

    @property
    def llm_enabled(self) -> bool:
        return bool(self.openrouter_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
