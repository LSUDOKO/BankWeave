"""Demo control: reset, alerts, agent worker start/stop/kill, live stream, resume."""
from __future__ import annotations

import threading
import time

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from agents.blackboard import Blackboard
from agents.worker import Worker
from app import db, events
from app.services import baseline

router = APIRouter(prefix="/demo", tags=["demo"])


def _worker(request: Request) -> Worker | None:
    return getattr(request.app.state, "worker", None)


@router.get("/status")
def status(request: Request):
    w = _worker(request)
    from agents import llm
    graphs = db.list_graphs()
    return {"worker": {"running": bool(w and w.running), "name": w.name if w else None,
                       "processed": w.processed if w else 0},
            "blackboard": Blackboard().stats(),
            "llm": {"enabled": llm.enabled(), "writer": llm.model_for("writer"),
                    "auditor": llm.model_for("auditor")},
            "graphs": {"total": len(graphs), "cases": sum(db.is_case_graph(g) for g in graphs),
                       "banks": sorted(g for g in graphs if g.startswith(db.PREFIX + "bank_"))}}


@router.post("/worker/start")
def start(request: Request):
    w = _worker(request)
    if w and w.running:
        return {"running": True, "name": w.name}
    w = Worker()
    w.start()
    request.app.state.worker = w
    return {"running": True, "name": w.name}


@router.post("/worker/kill")
def kill(request: Request):
    """Simulate a crash: stop agents without finishing or releasing their claimed tasks."""
    w = _worker(request)
    if w:
        w.stop()
    events.publish("worker", db.CONSORTIUM, w.name if w else "-", {"status": "killed"})
    return {"killed": bool(w)}


@router.post("/alerts/generate")
def generate_alerts():
    return baseline.generate()


@router.post("/reset")
def reset(request: Request):
    """Back to a known state: no cases, no tasks, fresh alerts. Data graphs stay."""
    w = _worker(request)
    if w:
        w.stop(wait=120)  # let in-flight tasks finish before dropping their graphs
    for g in db.case_graphs():
        db.drop_graph(g)
    db.q(db.CONSORTIUM, "MATCH (n) WHERE n:Task OR n:Case OR n:Claim OR n:Decision OR n:CaseLock "
                         "DETACH DELETE n")
    res = baseline.generate()
    events.publish("demo", db.CONSORTIUM, "reset", res)
    return res


class Stream(BaseModel):
    rate_per_sec: float = 2.0
    seconds: int = 30


@router.post("/stream")
def stream(body: Stream):
    """Replay alerts gradually so the queue visibly streams in (demo)."""
    rows = db.q(db.CONSORTIUM, "MATCH (al:Alert {status:'open'}) WHERE al.tasked IS NULL "
                               "SET al.tasked = -1 RETURN al.id AS id")

    def run():
        end = time.time() + body.seconds
        for r in rows:
            if time.time() > end:
                break
            db.q(db.CONSORTIUM, "MATCH (al:Alert {id:$id}) REMOVE al.tasked", {"id": r["id"]})
            events.publish("alert", db.CONSORTIUM, r["id"], {"status": "open", "streamed": True})
            time.sleep(1 / max(0.1, body.rate_per_sec))
    threading.Thread(target=run, daemon=True).start()
    return {"queued": len(rows)}


def _attested():
    """New transactions are blinded into the consortium by the enclave: refuse when quarantined."""
    from app.services.hardware_enclave import ENCLAVE
    try:
        ENCLAVE.require()
    except PermissionError as exc:
        raise HTTPException(423, str(exc)) from exc


class Inject(BaseModel):
    size: int = 5


@router.post("/red_team")
def red_team(body: Inject):
    """Inject an evasive cross-bank ring that rule-based monitoring cannot see."""
    from app.services import simulator
    _attested()
    return simulator.inject_evasive_ring(body.size)


@router.post("/red_team/smurf")
def red_team_smurf():
    """Inject a 25-transfer smurfing network (fan-out under the threshold, then fan-in)."""
    from app.services import simulator
    _attested()
    return simulator.inject_smurfing()


@router.post("/hunt")
def hunt():
    """Hunt mode: motif seeds + shortest-path subgraph raise alerts with no rule firing."""
    from app.services import simulator
    return simulator.hunt()
