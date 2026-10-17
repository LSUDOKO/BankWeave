"""Redis pub/sub event bus (bw:events:<type>) feeding the UI WebSocket."""
from __future__ import annotations

import json
import time
from functools import lru_cache
from typing import Any

import redis

from app.config import get_settings

CHANNEL_PREFIX = "bw:events:"


@lru_cache
def _client() -> redis.Redis:
    return redis.Redis.from_url(get_settings().redis_url)


def publish(type_: str, graph: str, id_: str, data: dict | None = None,
            agent: str | None = None, cypher: str | None = None) -> None:
    event: dict[str, Any] = {
        "type": type_, "graph": graph, "id": id_, "ts": time.time(),
        "agent": agent, "data": data or {}, "cypher": cypher,
    }
    try:
        _client().publish(CHANNEL_PREFIX + type_, json.dumps(event, default=str))
    except redis.RedisError:
        pass  # events are best-effort; the graph is the source of truth
