"""Scoreboard: serves eval/results/*.json exactly as the eval scripts wrote them."""
import json

from fastapi import APIRouter, HTTPException

from app.config import ROOT

router = APIRouter(prefix="/eval", tags=["eval"])
RESULTS = ROOT / "eval" / "results"


@router.get("")
def results():
    out = {}
    for p in sorted(RESULTS.glob("*.json")):
        try:
            d = json.loads(p.read_text())
        except ValueError:
            continue
        d["_file"] = f"eval/results/{p.name}"
        prev = out.get(d.get("experiment"))
        if not prev or d.get("generated_at", "") >= prev.get("generated_at", ""):
            out[d.get("experiment", p.stem)] = d
    return {"experiments": out}


@router.get("/{name}")
def one(name: str):
    p = RESULTS / f"{name}.json"
    if not p.exists():
        raise HTTPException(404, "no such result")
    return json.loads(p.read_text())
