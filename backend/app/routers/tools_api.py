"""Analyst console: call any graph tool directly and see the Cypher it ran."""
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents import tools
from app import db
from app.cypher import REGISTRY

router = APIRouter(prefix="/tools", tags=["tools"])


class Call(BaseModel):
    name: str
    params: dict = {}
    graph: str = db.CONSORTIUM
    case_id: str | None = None
    record: bool = False


@router.get("")
def list_tools():
    return {"tools": [{"name": t.name, "description": t.description, "agents": t.agents,
                       "params": t.params} for t in tools.REGISTRY.values()]}


@router.post("/call")
def call(c: Call):
    if c.name not in tools.REGISTRY:
        raise HTTPException(404, "unknown tool")
    ctx = tools.Ctx(graph=c.graph, case_id=c.case_id, agent="analyst", record=c.record)
    try:
        return json.loads(json.dumps(tools.call(c.name, ctx, **c.params), default=str))
    except (TypeError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/queries")
def queries():
    return {"queries": [{"name": q.name, "purpose": q.purpose, "module": q.module,
                         "cypher": q.text} for q in REGISTRY.values()]}
