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
        if p.stem.endswith("_scores"):  # raw score dumps are served by /eval/curve
            continue
        try:
            d = json.loads(p.read_text())
        except ValueError:
            continue
        d["_file"] = f"eval/results/{p.name}"
        prev = out.get(d.get("experiment"))
        if not prev or d.get("generated_at", "") >= prev.get("generated_at", ""):
            out[d.get("experiment", p.stem)] = d
    return {"experiments": out}


@router.get("/curve")
def curve():
    """E1 test-split scores: [calibrated probability, hand score, rules fired, illicit]."""
    p = RESULTS / "E1_test_scores.json"
    if not p.exists():
        raise HTTPException(404, "run eval/e1_alert_triage.py to produce E1_test_scores.json")
    return json.loads(p.read_text())


@router.get("/{name}")
def one(name: str):
    p = RESULTS / f"{name}.json"
    if not p.exists():
        raise HTTPException(404, "no such result")
    return json.loads(p.read_text())
