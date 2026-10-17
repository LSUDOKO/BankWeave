"""Event bus (bw:events:<type>) feeding the UI WebSocket.

Redis pub/sub when REDIS_URL is set (separate processes: API, workers, MCP server).
Without it, an in-process bus: correct when the API and the agent worker share one process,
as on a single Render web service. Events are best-effort; the graph is the source of truth.
"""
from __future__ import annotations

import json
import queue
import threading
import time
from functools import lru_cache
from typing import Any

import redis

from app.config import get_settings

CHANNEL_PREFIX = "bw:events:"


class LocalBus:
    def __init__(self) -> None:
        self._subs: list[queue.Queue] = []
        self._lock = threading.Lock()

    def publish(self, message: str) -> None:
        with self._lock:
            subs = list(self._subs)
        for q in subs:
            try:
                q.put_nowait(message)
            except queue.Full:
                pass  # slow subscriber: drop rather than block an agent

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=2000)
        with self._lock:
            self._subs.append(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._lock:
            if q in self._subs:
                self._subs.remove(q)


LOCAL = LocalBus()


def use_redis() -> bool:
    return bool(get_settings().redis_url)


@lru_cache
def _client() -> redis.Redis:
    return redis.Redis.from_url(get_settings().redis_url)


def publish(type_: str, graph: str, id_: str, data: dict | None = None,
            agent: str | None = None, cypher: str | None = None) -> None:
    event: dict[str, Any] = {
        "type": type_, "graph": graph, "id": id_, "ts": time.time(),
        "agent": agent, "data": data or {}, "cypher": cypher,
    }
    message = json.dumps(event, default=str)
    if not use_redis():
        LOCAL.publish(message)
        return
    try:
        _client().publish(CHANNEL_PREFIX + type_, message)
    except redis.RedisError:
        LOCAL.publish(message)  # Redis down: still reach in-process subscribers
