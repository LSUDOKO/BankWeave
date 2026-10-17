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
    groq_api_key: str | None = None
    # free tiers only. Writer and auditor are different models from different vendors, and
    # the auditor is the larger one (the provenance gate needs a different, stronger auditor).
    llm_writer_model: str = "groq/qwen/qwen3.8-27b"
    llm_auditor_model: str = "groq/openai/gpt-oss-120b"
    # tried in order when the primary model is rate limited / overloaded
    llm_writer_fallbacks: str = ("openrouter/nvidia/nemotron-3-super-120b-a12b:free,"
                                 "openrouter/google/gemma-4-31b-it:free")
    llm_auditor_fallbacks: str = "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free"
    # which agents may call the LLM ("*" = all). Narrow it on a tight free quota.
    llm_agents: str = "*"

    dataset: str = "HI-Small"
    data_dir: Path = ROOT / "data" / "raw"
    top_n_banks: int = 4
    hash_salt: str = "bankweave-demo-salt"
    synth_seed: int = 42

    # graph namespace: "" for the live demo, "ibm_" for the IBM HI-Small evaluation load
    graph_prefix: str = ""

    # agent runtime
    task_stale_seconds: int = 30
    # case graphs the capacity guard never drops (comma separated case ids)
    pinned_cases: str = ""
    # dropping old case graphs deletes data, so the guard only prunes when this is switched on
    capacity_prune: bool = False
    falkordb_region: str = "local"
    worker_concurrency: int = 3

    @property
    def llm_enabled(self) -> bool:
        return bool(self.groq_api_key or self.openrouter_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
