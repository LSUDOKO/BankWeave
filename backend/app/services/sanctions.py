"""Sanctions / PEP screening with provenance.

With OPENSANCTIONS_API_KEY set, names are matched against OpenSanctions' `default` collection
through its /match API. Without a key (the default) they are matched against a bundled
SYNTHETIC watchlist slice, so the feature works offline and nobody real is ever "hit".
Every hit records where it came from: source, dataset, entity id, fetched-at time and URL.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from functools import lru_cache

from app import db
from app.config import ROOT
from app.cypher import cy

WATCHLIST = ROOT / "data" / "sanctions" / "synthetic_watchlist.json"
API = "https://api.opensanctions.org/match/default"
THRESHOLD = 0.88

OWNERS = cy("sanctions_account_owners", "Names on the accounts a case covers", """
MATCH (p)-[o:OWNS]->(a:Account) WHERE a.id IN $ids AND (p:Person OR p:Company)
RETURN DISTINCT p.id AS person, coalesce(o.name_on_account, p.name) AS name,
       labels(p)[0] AS schema, a.id AS account
""")


def _jw(a: str, b: str) -> float:
    """Jaro-Winkler similarity (same measure as FLEX's flex.text.jaroWinkler)."""
    a, b = a.lower(), b.lower()
    if a == b:
        return 1.0
    la, lb = len(a), len(b)
    if not la or not lb:
        return 0.0
    win = max(la, lb) // 2 - 1
    ma, mb = [False] * la, [False] * lb
    m = 0
    for i, ch in enumerate(a):
        for j in range(max(0, i - win), min(lb, i + win + 1)):
            if not mb[j] and b[j] == ch:
                ma[i] = mb[j] = True
                m += 1
                break
    if not m:
        return 0.0
    t, k = 0, 0
    for i in range(la):
        if ma[i]:
            while not mb[k]:
                k += 1
            t += a[i] != b[k]
            k += 1
    jaro = (m / la + m / lb + (m - t / 2) / m) / 3
    prefix = 0
    for x, y in zip(a[:4], b[:4]):
        if x != y:
            break
        prefix += 1
    return jaro + prefix * 0.1 * (1 - jaro)


def name_score(a: str, b: str) -> float:
    """Token-wise Jaro-Winkler: every name part must match (either order), so a shared first
    name alone never makes a hit."""
    ta, tb = a.lower().replace(",", " ").split(), b.lower().replace(",", " ").split()
    if not ta or len(ta) != len(tb):
        return 0.0
    best = 0.0
    for order in (tb, tb[::-1]):
        scores = [_jw(x, y) for x, y in zip(ta, order)]
        if min(scores) >= 0.85:
            best = max(best, sum(scores) / len(scores))
    return best


@lru_cache
def _bundled() -> dict:
    return json.loads(WATCHLIST.read_text())


def mode() -> str:
    return "opensanctions" if os.getenv("OPENSANCTIONS_API_KEY") else "bundled"


def _screen_bundled(name: str, schema: str) -> list[dict]:
    wl = _bundled()
    out = []
    for e in wl["entities"]:
        if schema and e["schema"] != schema:
            continue
        score = max(name_score(name, n) for n in [e["name"], *e["aliases"]])
        if score >= THRESHOLD:
            out.append({"entity_id": e["id"], "caption": e["name"], "score": round(score, 3),
                        "program": e["program"], "country": e["country"],
                        "provenance": {"source": "bundled synthetic slice",
                                       "dataset": wl["dataset"], "version": wl["version"],
                                       "file": "data/sanctions/synthetic_watchlist.json",
                                       "fetched_at": wl["version"], "synthetic": True}})
    return sorted(out, key=lambda h: -h["score"])


def _screen_api(name: str, schema: str) -> list[dict]:
    import httpx
    body = {"queries": {"q": {"schema": schema or "Person", "properties": {"name": [name]}}}}
    r = httpx.post(API, json=body, timeout=15,
                   headers={"Authorization": f"ApiKey {os.environ['OPENSANCTIONS_API_KEY']}"})
    r.raise_for_status()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return [{"entity_id": x["id"], "caption": x.get("caption"), "score": round(x["score"], 3),
             "program": ", ".join(x.get("datasets", [])[:3]), "country": ", ".join(
                 x.get("properties", {}).get("country", [])[:2]),
             "provenance": {"source": "OpenSanctions match API", "dataset": "default",
                            "url": f"https://www.opensanctions.org/entities/{x['id']}/",
                            "fetched_at": now, "synthetic": False}}
            for x in r.json()["responses"]["q"]["results"] if x.get("match")]


def screen(name: str, schema: str = "Person") -> dict:
    t = time.perf_counter()
    try:
        hits = _screen_api(name, schema) if mode() == "opensanctions" else _screen_bundled(name, schema)
        err = None
    except Exception as exc:  # noqa: BLE001  (API down: fall back to the bundled slice)
        hits, err = _screen_bundled(name, schema), f"API failed, used bundled slice: {exc}"[:200]
    return {"name": name, "mode": mode(), "hits": hits, "error": err,
            "ms": round((time.perf_counter() - t) * 1000, 1)}


def screen_accounts(graph: str, account_ids: list[str]) -> dict:
    owners = db.ro(graph, OWNERS, {"ids": account_ids})
    results = []
    for o in owners:
        s = screen(o["name"], o["schema"])
        if s["hits"]:
            results.append({**o, "hits": s["hits"]})
    return {"screened": len(owners), "hits": results, "mode": mode(), "cypher": OWNERS}
