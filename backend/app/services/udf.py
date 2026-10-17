"""JavaScript UDF libraries: FalkorDB's FLEX plus BankWeave's aml_temporal."""
from __future__ import annotations

from pathlib import Path

from app import db

HERE = Path(__file__).resolve().parents[2] / "udf"
LIBRARIES = {"flex": HERE / "vendor" / "flex.js", "aml_temporal": HERE / "aml_temporal.js"}


def _conn():
    return db.get_db().connection


def listing() -> list[dict]:
    try:
        rows = _conn().execute_command("GRAPH.UDF", "LIST")
    except Exception as exc:  # noqa: BLE001
        return [{"error": str(exc)[:200]}]
    out = []
    for r in rows:
        r = {(k.decode() if isinstance(k, bytes) else k): v for k, v in r.items()}
        fns = [f.decode() if isinstance(f, bytes) else f for f in r.get("functions", [])]
        name = r["library_name"].decode() if isinstance(r["library_name"], bytes) else r["library_name"]
        out.append({"library": name, "functions": fns})
    return out


def load(name: str) -> dict:
    src = LIBRARIES[name].read_text()
    try:
        _conn().execute_command("GRAPH.UDF", "LOAD", "REPLACE", name, src)
        return {"library": name, "loaded": True}
    except Exception as exc:  # noqa: BLE001  (managed instances may forbid UDF LOAD)
        return {"library": name, "loaded": False, "error": str(exc)[:200]}


def ensure() -> list[dict]:
    have = {x.get("library") for x in listing()}
    return [load(n) if n not in have else {"library": n, "loaded": True, "cached": True}
            for n in LIBRARIES]
