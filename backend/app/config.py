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
    llm_writer_model: str = "openrouter/google/gemini-3.8-flash"
    llm_auditor_model: str = "openrouter/anthropic/claude-sonnet-5.5"
    # tried in order when the primary model is out of credits / rate limited / overloaded
    llm_writer_fallbacks: str = "openrouter/nvidia/nemotron-3-super-120b-a12b:free,openrouter/google/gemma-4-31b-it:free"
    llm_auditor_fallbacks: str = "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free"

    dataset: str = "HI-Small"
    data_dir: Path = ROOT / "data" / "raw"
    top_n_banks: int = 4
    hash_salt: str = "bankweave-demo-salt"
    synth_seed: int = 42

    # graph namespace: "" for the live demo, "ibm_" for the IBM HI-Small evaluation load
    graph_prefix: str = ""

    # agent runtime
    task_stale_seconds: int = 30
    worker_concurrency: int = 3

    @property
    def llm_enabled(self) -> bool:
        return bool(self.openrouter_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
