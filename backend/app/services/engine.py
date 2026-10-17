"""Engine X-Ray: GRAPH.EXPLAIN / GRAPH.PROFILE plans and GRAPH.MEMORY USAGE, read-only.

A query is only profiled after FalkorDB itself accepts it as read-only (GRAPH.RO_QUERY with
a timeout), so the inspector can never write to the graph or run unbounded.
"""
from __future__ import annotations

import re
import time

from app import db

STAT = re.compile(r"Records produced: (\d+), Execution time: ([\d.]+) ms")


class NotReadOnly(ValueError):
    pass


def _s(x):
    return x.decode() if isinstance(x, bytes) else x


def parse_plan(lines: list) -> list[dict]:
    """Operator tree as a flat list with depth (FalkorDB indents children by 4 spaces)."""
    out = []
    for raw in lines:
        line = _s(raw)
        depth = (len(line) - len(line.lstrip(" "))) // 4
        parts = [p.strip() for p in line.strip().split(" | ")]
        op, rest = parts[0], parts[1:]
        node = {"depth": depth, "op": op, "detail": "", "records": None, "ms": None}
        details = []
        for p in rest:
            m = STAT.search(p)
            if m:
                node["records"], node["ms"] = int(m.group(1)), float(m.group(2))
            else:
                details.append(p)
        node["detail"] = " | ".join(details)
        out.append(node)
    return out


def check_read_only(graph: str, cypher: str, params: dict | None = None,
                    timeout: int = 5000) -> tuple[int, float]:
    """Run once through GRAPH.RO_QUERY; FalkorDB rejects any write clause there."""
    t = time.perf_counter()
    try:
        rows = db.ro(graph, cypher, params, timeout=timeout)
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        if "read-only" in msg.lower() or "read only" in msg.lower():
            raise NotReadOnly("only read-only queries can be inspected") from exc
        raise
    return len(rows), round((time.perf_counter() - t) * 1000, 2)


def _inline(cypher: str, params: dict | None) -> str:
    """EXPLAIN/PROFILE take parameters through a CYPHER prefix, like GRAPH.QUERY does."""
    if not params:
        return cypher
    from falkordb.helpers import stringify_param_value
    return "CYPHER " + " ".join(f"{k}={stringify_param_value(v)}" for k, v in params.items()) \
        + " " + cypher


def explain(graph: str, cypher: str, params: dict | None = None) -> list[dict]:
    raw = db.get_db().connection.execute_command("GRAPH.EXPLAIN", graph, _inline(cypher, params))
    return parse_plan(raw)


def memory(graph: str) -> dict:
    try:
        u = db.get_db().connection.execute_command("GRAPH.MEMORY", "USAGE", graph)
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)[:160]}
    if isinstance(u, list):
        u = dict(zip(u[::2], u[1::2]))
    return {_s(k): (v if not isinstance(v, dict) else {_s(a): b for a, b in v.items()})
            for k, v in u.items()}


def xray(graph: str, cypher: str, params: dict | None = None, mode: str = "profile") -> dict:
    rows, ms = check_read_only(graph, cypher, params)
    out = {"graph": graph, "cypher": cypher, "params": params or {}, "rows": rows,
           "ro_query_ms": ms, "explain": explain(graph, cypher, params),
           "memory": memory(graph)}
    if mode == "profile":
        raw = db.get_db().connection.execute_command("GRAPH.PROFILE", graph,
                                                     _inline(cypher, params))
        out["profile"] = parse_plan(raw)
    return out
