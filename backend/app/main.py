"""BankWeave API: REST for the UI, a WebSocket bridged from Redis pub/sub, demo controls."""
from __future__ import annotations

import asyncio
import json
import os
import queue
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app import db, events
from app.config import get_settings
from app.events import CHANNEL_PREFIX
from app.routers import (actions, alerts, cases, demo, evals, hardware, lab, network, overview, sar,
                         scenarios, tools_api, trust, workspace)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.worker = None
    if os.getenv("RUN_WORKER", "true").lower() == "true":
        from agents.worker import Worker
        app.state.worker = Worker()
        app.state.worker.start()
    yield
    if app.state.worker:
        app.state.worker.stop()


app = FastAPI(title="BankWeave", version="1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])
for r in (alerts, cases, sar, actions, network, trust, evals, demo, tools_api, overview, lab,
          workspace, scenarios, hardware):
    app.include_router(r.router)


@app.get("/health")
def health():
    from app.services import capacity
    s = get_settings()
    try:
        graphs = db.list_graphs()
        return {"ok": True, "falkordb": True, "graphs": len(graphs),
                "region": s.falkordb_region, "memory": capacity.memory(),
                "llm": s.llm_enabled, "worker": bool(app.state.worker)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "falkordb": False, "error": str(exc)[:200]}


@app.websocket("/ws")
async def ws(socket: WebSocket):
    """Every graph write publishes an event; the UI receives them live here."""
    await socket.accept()
    if not events.use_redis():
        q = events.LOCAL.subscribe()
        try:
            while True:
                try:
                    await socket.send_text(q.get_nowait())
                except queue.Empty:
                    await asyncio.sleep(0.1)
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            events.LOCAL.unsubscribe(q)
        return
    client = aioredis.from_url(get_settings().redis_url)
    pubsub = client.pubsub()
    await pubsub.psubscribe(CHANNEL_PREFIX + "*")
    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg and msg.get("type") == "pmessage":
                data = msg["data"].decode() if isinstance(msg["data"], bytes) else msg["data"]
                await socket.send_text(data)
            else:
                await asyncio.sleep(0.05)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        await pubsub.punsubscribe()
        await client.aclose()


@app.get("/")
def root():
    return {"name": "BankWeave", "tagline": "Many banks, one ring, every claim proven.",
            "docs": "/docs", "events": json.dumps("ws://<host>/ws")}
