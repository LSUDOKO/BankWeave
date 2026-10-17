from functools import lru_cache
from pathlib import Path

import yaml


@lru_cache
def cfg() -> dict:
    return yaml.safe_load((Path(__file__).parent / "config.yaml").read_text())
