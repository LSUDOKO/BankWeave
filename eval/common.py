"""Shared helpers for evaluation scripts. Labels are read here and only here."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
RESULTS = ROOT / "eval" / "results"


def commit() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT,
                                       text=True).strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def ground_truth(prefix: str) -> dict:
    name = f"{prefix}ground_truth.json" if prefix else "ground_truth.json"
    return json.loads((ROOT / "eval" / name).read_text())


def prf(tp: int, fp: int, fn: int) -> dict:
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return {"precision": round(p, 4), "recall": round(r, 4), "f1": round(f, 4),
            "tp": tp, "fp": fp, "fn": fn}


def write(experiment: str, dataset: str, params: dict, results: dict, notes: list[str]) -> Path:
    RESULTS.mkdir(parents=True, exist_ok=True)
    out = {"experiment": experiment, "commit": commit(), "dataset": dataset, "params": params,
           "results": results, "notes": notes,
           "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
           "graph_prefix": os.environ.get("GRAPH_PREFIX", "")}
    p = RESULTS / f"{experiment}.json"
    p.write_text(json.dumps(out, indent=2, default=str))
    print(f"wrote {p}")
    return p
