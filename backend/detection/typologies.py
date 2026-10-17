"""Classic laundering typologies as parameterized Cypher.

Every function returns {"found", "matches", "cypher", "params"} so callers can record the
exact query as evidence.
"""
from __future__ import annotations

from app import db
from app.cypher import cy
from detection.settings import cfg

CIRCULAR_START = cy("typology_circular_start", "Outgoing transfers that may open a cycle", """
MATCH (a:Account {id:$id})-[t:TRANSFERS]->(b:Account)
WHERE b.id <> $id
RETURN b.id AS node, t.ts AS ts, t.txn_id AS txn, t.amount AS amount
ORDER BY t.ts LIMIT $cap
""")

CIRCULAR_STEP = cy("typology_circular_step", "One time-respecting hop of cycle search", """
UNWIND $frontier AS f
MATCH (x:Account {id:f.node})-[t:TRANSFERS]->(y:Account)
WHERE t.ts > f.ts AND t.ts <= f.t0 + $window
RETURN f.pid AS pid, y.id AS node, t.ts AS ts, t.txn_id AS txn, t.amount AS amount
LIMIT $cap
""")

CIRCULAR = CIRCULAR_STEP

FAN_OUT_EDGES = cy("typology_fan_out_edges", "Outgoing transfers ordered by time (fan-out)", """
MATCH (a:Account {id:$id})-[t:TRANSFERS]->(b)
RETURN t.ts AS ts, b.id AS cp, t.txn_id AS txn
ORDER BY ts
""")

FAN_IN_EDGES = cy("typology_fan_in_edges", "Incoming transfers ordered by time (fan-in)", """
MATCH (b)-[t:TRANSFERS]->(a:Account {id:$id})
RETURN t.ts AS ts, b.id AS cp, t.txn_id AS txn
ORDER BY ts
""")

STRUCTURING = cy("typology_structuring", "Repeated amounts just under the reporting threshold", """
MATCH (a:Account {id:$id})-[t:TRANSFERS]->()
WHERE t.amount >= $thr * 0.85 AND t.amount < $thr
RETURN count(t) AS near_threshold, collect(t.txn_id)[0..20] AS txns,
       sum(t.amount) AS total
""")

PASSTHROUGH = cy("typology_rapid_passthrough", "In-then-out of similar amount within a short gap", """
MATCH (s)-[i:TRANSFERS]->(x:Account {id:$id})-[o:TRANSFERS]->(d)
WHERE o.ts > i.ts AND o.ts - i.ts <= $gap AND i.cur_recv = o.cur
  AND abs(o.amount - i.amount_recv) /
      CASE WHEN o.amount > i.amount_recv THEN o.amount ELSE i.amount_recv END <= $tol
RETURN i.txn_id AS in_txn, o.txn_id AS out_txn, i.amount_recv AS amount_in,
       o.amount AS amount_out, o.ts - i.ts AS gap, s.id AS src, d.id AS dst
ORDER BY gap LIMIT 50
""")

SHARED_IDENTITY = cy("typology_shared_identity", "Other accounts sharing a device, IP or address", """
MATCH (a:Account {id:$id})-[:USES_DEVICE|USES_IP|REGISTERED_AT]->(x)
      <-[:USES_DEVICE|USES_IP|REGISTERED_AT]-(b:Account)
WHERE a <> b
RETURN labels(x)[0] AS kind, x.id AS attr, x.shared_count AS shared,
       coalesce(x.units, 1) AS units, collect(DISTINCT b.id) AS others
""")


def _follow_money_query(k: int) -> str:
    # variable-length bounds must be literals: k is validated as an int in [1, 6]
    return f"""
MATCH p = (a:Account {{id:$id}})-[:TRANSFERS*1..{k}]->(b:Account)
RETURN [t IN relationships(p) | t.txn_id] AS txn_ids,
       [t IN relationships(p) | endNode(t).id] AS hops,
       reduce(s = 0.0, t IN relationships(p) | s + t.amount) AS volume
LIMIT 50"""


cy("typology_follow_money", "Bounded money trail (k validated to 1..6)", _follow_money_query(3))


def _out(found, matches, cypher, params):
    return {"found": bool(found), "matches": matches, "cypher": cypher, "params": params}


def circular_flow(graph: str, account_id: str, window: int | None = None,
                  max_hops: int | None = None, cap: int = 4000) -> dict:
    """Time-ordered cycles back to the account, found by iterative temporal expansion.

    Each hop is one Cypher query over the frontier, following only transfers later than the
    previous hop and inside the window - so the search stays small even at hub accounts.
    """
    window = window or cfg()["cycle_window_seconds"]
    max_hops = max_hops or cfg()["cycle_max_hops"]
    p = {"id": account_id, "window": window, "cap": cap}
    paths = {}
    frontier = []
    for i, r in enumerate(db.ro(graph, CIRCULAR_START, p)):
        pid = f"p{i}"
        paths[pid] = {"nodes": [account_id, r["node"]], "txns": [r["txn"]],
                      "amounts": [r["amount"]], "t0": r["ts"]}
        frontier.append({"pid": pid, "node": r["node"], "ts": r["ts"], "t0": r["ts"]})
    matches = []
    for _ in range(max_hops - 1):
        if not frontier:
            break
        nxt = []
        for r in db.ro(graph, CIRCULAR_STEP, {"frontier": frontier, "window": window,
                                              "cap": cap}):
            base = paths[r["pid"]]
            if r["node"] == account_id:
                matches.append({"accounts": base["nodes"] + [account_id],
                                "txn_ids": base["txns"] + [r["txn"]],
                                "amounts": base["amounts"] + [r["amount"]]})
                continue
            if r["node"] in base["nodes"]:
                continue  # simple cycles only
            pid = f"{r['pid']}.{len(paths)}"
            paths[pid] = {"nodes": base["nodes"] + [r["node"]], "txns": base["txns"] + [r["txn"]],
                          "amounts": base["amounts"] + [r["amount"]], "t0": base["t0"]}
            nxt.append({"pid": pid, "node": r["node"], "ts": r["ts"], "t0": base["t0"]})
        frontier = nxt[:cap]
        if len(matches) >= 20:
            break
    matches.sort(key=lambda m: len(m["txn_ids"]))
    return _out(matches, matches[:20], CIRCULAR_STEP, p)


def _burst(rows: list[dict], window: int, min_fan: int) -> list[dict]:
    best = None
    for i, r in enumerate(rows):
        burst = [x for x in rows[i:] if x["ts"] - r["ts"] <= window]
        cps = {x["cp"] for x in burst}
        if len(cps) >= min_fan and (best is None or len(cps) > best["fan"]):
            best = {"start": r["ts"], "fan": len(cps), "counterparties": sorted(cps),
                    "txn_ids": [x["txn"] for x in burst]}
    return [best] if best else []


def fan_out(graph: str, account_id: str) -> dict:
    p = {"id": account_id}
    m = _burst(db.ro(graph, FAN_OUT_EDGES, p), cfg()["fan_window_seconds"],
               cfg()["fan_min_degree"])
    return _out(m, m, FAN_OUT_EDGES, p)


def fan_in(graph: str, account_id: str) -> dict:
    p = {"id": account_id}
    m = _burst(db.ro(graph, FAN_IN_EDGES, p), cfg()["fan_window_seconds"],
               cfg()["fan_min_degree"])
    return _out(m, m, FAN_IN_EDGES, p)


def structuring(graph: str, account_id: str) -> dict:
    p = {"id": account_id, "thr": float(cfg()["reporting_threshold"])}
    r = db.ro(graph, STRUCTURING, p)[0]
    found = r["near_threshold"] >= cfg()["structuring_min_count"]
    return _out(found, [r] if found else [], STRUCTURING, p)


def rapid_passthrough(graph: str, account_id: str, tol: float = 0.01) -> dict:
    p = {"id": account_id, "gap": cfg()["passthrough"]["max_gap_seconds"], "tol": tol}
    rows = db.ro(graph, PASSTHROUGH, p)
    return _out(rows, rows, PASSTHROUGH, p)


def shared_identity(graph: str, account_id: str) -> dict:
    p = {"id": account_id}
    rows = db.ro(graph, SHARED_IDENTITY, p)
    return _out(rows, rows, SHARED_IDENTITY, p)


def follow_money(graph: str, account_id: str, k: int = 3) -> dict:
    if not isinstance(k, int) or not 1 <= k <= 6:
        raise ValueError("k must be an integer in 1..6")
    query = _follow_money_query(k)
    p = {"id": account_id}
    rows = db.ro(graph, query, p)
    return _out(rows, rows, query, p)


ALL = {"circular_flow": circular_flow, "fan_out": fan_out, "fan_in": fan_in,
       "structuring": structuring, "rapid_passthrough": rapid_passthrough}


def run_all(graph: str, account_id: str, which: list[str] | None = None) -> dict:
    return {k: f(graph, account_id) for k, f in ALL.items() if not which or k in which}
