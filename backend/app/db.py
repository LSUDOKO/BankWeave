"""FalkorDB connection and graph helpers.

All product queries go through `q()` / `ro()` so parameters are always bound,
never interpolated.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any

from falkordb import FalkorDB, Graph

from app.config import get_settings

CONSORTIUM = "consortium"
PROCEDURES = "procedures"
TYPOLOGY_KB = "typology_kb"


def bank_graph(bank_id: str) -> str:
    return f"bank_{bank_id}"


def case_graph(case_id: str) -> str:
    return f"case_{case_id}"


@lru_cache
def get_db() -> FalkorDB:
    s = get_settings()
    return FalkorDB(
        host=s.falkordb_host,
        port=s.falkordb_port,
        username=s.falkordb_username or None,
        password=s.falkordb_password or None,
    )


def graph(name: str) -> Graph:
    return get_db().select_graph(name)


def _rows(res) -> list[dict[str, Any]]:
    cols = [h[1] if isinstance(h, (list, tuple)) else h for h in res.header]
    return [dict(zip(cols, [_plain(v) for v in row])) for row in res.result_set]


def _plain(v: Any) -> Any:
    """Convert FalkorDB Node/Edge/Path objects into JSON-friendly values."""
    if hasattr(v, "properties") and hasattr(v, "labels"):
        return {"_labels": list(v.labels), **v.properties}
    if hasattr(v, "properties") and hasattr(v, "relation"):
        return {"_type": v.relation, **v.properties}
    if hasattr(v, "nodes") and callable(getattr(v, "nodes")):
        return {"nodes": [_plain(n) for n in v.nodes()], "edges": [_plain(e) for e in v.edges()]}
    if isinstance(v, list):
        return [_plain(x) for x in v]
    return v


def q(graph_name: str, cypher: str, params: dict | None = None) -> list[dict[str, Any]]:
    return _rows(graph(graph_name).query(cypher, params or {}))


def ro(graph_name: str, cypher: str, params: dict | None = None) -> list[dict[str, Any]]:
    return _rows(graph(graph_name).ro_query(cypher, params or {}))


def list_graphs() -> list[str]:
    return list(get_db().list_graphs())


def drop_graph(name: str) -> None:
    if name in list_graphs():
        graph(name).delete()


def try_query(graph_name: str, cypher: str, params: dict | None = None) -> None:
    """Run DDL that may already exist (indexes)."""
    try:
        graph(graph_name).query(cypher, params or {})
    except Exception as exc:  # noqa: BLE001
        if "already" not in str(exc).lower():
            raise
