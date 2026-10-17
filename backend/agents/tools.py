"""Tool registry shared by the agents and the MCP server.

Every tool: typed params, parameterized Cypher only, returns JSON including the Cypher used.
When called with a case_id and record=True, results become Evidence nodes with an origin,
and an episodic Event is appended to the case timeline.
"""
from __future__ import annotations

import inspect
import json
from dataclasses import dataclass, field
from typing import Any, Callable

from app import db
from detection import algorithms as al
from detection import clue_expand, identity, motif_seeds, passthrough, spnsa
from detection import typologies as ty
from knowledge import kyc
from trust import echo, store, validity


@dataclass
class Tool:
    name: str
    description: str
    fn: Callable[..., dict]
    agents: tuple[str, ...]
    records: bool = False
    params: dict = field(default_factory=dict)


REGISTRY: dict[str, Tool] = {}


def tool(name: str, description: str, agents: tuple[str, ...], records: bool = False):
    def deco(fn):
        sig = inspect.signature(fn)
        params = {p: (str(v.annotation.__name__ if hasattr(v.annotation, "__name__")
                          else v.annotation), v.default is inspect._empty)
                  for p, v in sig.parameters.items() if p not in ("ctx",)}
        REGISTRY[name] = Tool(name, description, fn, agents, records, params)
        return fn
    return deco


@dataclass
class Ctx:
    """Execution context: which graph to read, which case to record into, who is calling."""
    graph: str = field(default_factory=lambda: db.CONSORTIUM)
    case_id: str | None = None
    agent: str = "analyst"
    record: bool = True

    @property
    def case_graph(self) -> str | None:
        return db.case_graph(self.case_id) if self.case_id else None


def _ev(ctx: Ctx, kind: str, origin: str, summary: str, payload: Any, cypher: str | None,
        accounts: list[str]) -> str | None:
    if not (ctx.case_id and ctx.record):
        return None
    return store.add_evidence(ctx.case_id, kind, origin, summary, payload, cypher, ctx.agent,
                              accounts)


def short(a: str | None) -> str:
    return (a or "?")[:6]


# ------------------------------------------------------------------ alerts & triage
@tool("list_open_alerts", "List open alerts in the queue", ("orchestrator", "analyst"))
def list_open_alerts(ctx: Ctx, limit: int = 50) -> dict:
    q = ("MATCH (al:Alert {status:'open'}) RETURN al.id AS id, al.account_id AS account, "
         "al.bank_id AS bank, al.rule AS rule, al.reason AS reason, al.ts AS ts "
         "ORDER BY al.ts LIMIT $limit")
    return {"result": db.ro(ctx.graph, q, {"limit": limit}), "cypher": q}


@tool("expand_neighborhood", "Bounded 2-hop neighbourhood of an account", ("triage", "investigator"))
def expand_neighborhood(ctx: Ctx, account_id: str, depth: int = 2) -> dict:
    return al.expand_neighborhood(ctx.graph, account_id, depth)


@tool("find_islands", "Connected component of an account (islands clear instantly)",
      ("triage",))
def find_islands(ctx: Ctx, account_id: str) -> dict:
    return al.component_of(ctx.graph, account_id)


@tool("motif_score", "Precomputed motif suspicion score and components", ("triage", "investigator"))
def motif_score(ctx: Ctx, account_id: str) -> dict:
    return motif_seeds.motif_score(ctx.graph, account_id)


@tool("cross_bank_links", "Counterparties at other banks (consortium only)",
      ("triage", "investigator"), records=True)
def cross_bank_links(ctx: Ctx, account_id: str) -> dict:
    r = identity.cross_bank_links(ctx.graph, account_id)
    ids = []
    for row in r["result"][:5]:
        ids.append(_ev(ctx, "path", store.origin_for("path", src=account_id, dst=row["account"]),
                       f"{short(account_id)} exchanged {row['transfers']} transfer(s) worth "
                       f"{row['volume']:,.2f} with {short(row['account'])} at bank {row['bank']}",
                       row, r["cypher"], [account_id, row["account"]]))
    r["evidence_ids"] = [i for i in ids if i]
    return r


@tool("shared_identity", "Accounts sharing a device, IP or address", ("triage", "investigator",
                                                                       "skeptic"), records=True)
def shared_identity(ctx: Ctx, account_id: str) -> dict:
    r = ty.shared_identity(ctx.graph, account_id)
    ids = []
    for m in r["matches"]:
        ids.append(_ev(ctx, "shared_attr", store.origin_for("shared_attr", attr=m["attr"]),
                       f"{short(account_id)} shares {m['kind']} {m['attr']} with "
                       f"{len(m['others'])} other account(s) (shared_count {m['shared']}, "
                       f"units {m['units']})", m, r["cypher"], [account_id] + m["others"]))
    r["evidence_ids"] = [i for i in ids if i]
    return r


@tool("recall_similar_cases", "Past cases that involved this account (cross-case memory)",
      ("triage", "archivist", "investigator"))
def recall_similar_cases(ctx: Ctx, account_id: str) -> dict:
    q = ("MATCH (a:Account {id:$id})<-[:ABOUT]-(c:Claim)<-[:HAS_CLAIM]-(k:Case) "
         "RETURN k.id AS case_id, k.status AS status, k.title AS title, "
         "collect(DISTINCT c.text)[0..3] AS prior_claims")
    rows = [r for r in db.ro(db.CONSORTIUM, q, {"id": account_id})
            if r["case_id"] != ctx.case_id]
    return {"result": rows, "cypher": q}


# ------------------------------------------------------------------ investigator
@tool("typology_patterns", "Run laundering typology patterns on an account",
      ("investigator",), records=True)
def typology_patterns(ctx: Ctx, account_id: str, which: list[str] | None = None) -> dict:
    res = ty.run_all(ctx.graph, account_id, which)
    ids = []
    for name, r in res.items():
        if not r["found"]:
            continue
        m = r["matches"][0]
        if name == "circular_flow":
            summ = (f"{short(account_id)} is in a time-ordered cycle of {len(m['txn_ids'])} "
                    f"transfers returning to it ({', '.join(m['txn_ids'])})")
        elif name in ("fan_out", "fan_in"):
            summ = (f"{short(account_id)} {name.replace('_', '-')} burst: {m['fan']} "
                    f"counterparties within 24h")
        elif name == "structuring":
            summ = (f"{short(account_id)} made {m['near_threshold']} transfers just under the "
                    f"reporting threshold totalling {m['total']:,.2f}")
        else:
            summ = (f"{short(account_id)} passed {len(r['matches'])} amount(s) straight through "
                    f"(e.g. {m['amount_in']:,.2f} in, {m['amount_out']:,.2f} out)")
        ids.append(_ev(ctx, "typology_match", store.origin_for("typology_match", pattern=name,
                                                               account=account_id),
                       summ, {"pattern": name, "match": m}, r["cypher"], [account_id]))
    return {"result": {k: {"found": v["found"], "matches": v["matches"][:3]}
                       for k, v in res.items()},
            "cypher": {k: v["cypher"] for k, v in res.items()},
            "evidence_ids": [i for i in ids if i]}


@tool("trace_flow", "Shortest money paths between two accounts (primary evidence)",
      ("investigator",), records=True)
def trace_flow(ctx: Ctx, src: str, dst: str, max_len: int = 6, path_count: int = 3,
               direction: str = "outgoing") -> dict:
    r = al.trace_flow(ctx.graph, src, dst, max_len, path_count, direction)
    ids = []
    for p in r["result"]:
        hops = " -> ".join(short(a) for a in p["accounts"])
        ids.append(_ev(ctx, "path", store.origin_for("path", src=src, dst=dst),
                       f"money path {hops} ({len(p['txn_ids'])} transfer(s): "
                       f"{', '.join(p['txn_ids'])})", p, r["cypher"], p["accounts"]))
    r["evidence_ids"] = [i for i in ids if i]
    return r


def _case_algo(ctx: Ctx, name: str, fn, label: str, top_k: int) -> dict:
    g = ctx.case_graph or ctx.graph
    r = fn(g, top_k)
    ids = []
    if r["result"]:
        top = r["result"][0]
        ids.append(_ev(ctx, "algo_score", store.origin_for("algo_score", algo=name,
                                                           case=ctx.case_id, account=top["account"]),
                       f"{short(top['account'])} has the highest {label} in the case graph "
                       f"(score {top['score']:.4f})", r["result"][:top_k], r["cypher"],
                       [top["account"]]))
    r["evidence_ids"] = [i for i in ids if i]
    r["graph"] = g
    return r


@tool("find_hub", "PageRank on the case graph: where money pools", ("investigator",), records=True)
def find_hub(ctx: Ctx, top_k: int = 5) -> dict:
    return _case_algo(ctx, "pagerank", al.find_hub, "PageRank", top_k)


@tool("find_bridges", "Betweenness on the case graph: mule bridges", ("investigator",),
      records=True)
def find_bridges(ctx: Ctx, top_k: int = 5) -> dict:
    return _case_algo(ctx, "betweenness", al.find_bridges, "betweenness", top_k)


@tool("find_orchestrator", "Harmonic centrality on the case graph", ("investigator",),
      records=True)
def find_orchestrator(ctx: Ctx, top_k: int = 5) -> dict:
    return _case_algo(ctx, "harmonic", al.find_orchestrator, "harmonic centrality", top_k)


@tool("find_rings", "Label propagation communities (candidate rings)", ("investigator",))
def find_rings(ctx: Ctx, max_iter: int = 10) -> dict:
    return al.find_rings(ctx.case_graph or ctx.graph, max_iter)


@tool("money_at_risk", "Max flow from flagged accounts to a hub", ("investigator", "reporter"),
      records=True)
def money_at_risk(ctx: Ctx, sources: list[str], targets: list[str]) -> dict:
    r = al.money_at_risk(ctx.case_graph or ctx.graph, sources, targets)
    mf = r["result"]["maxFlow"] or 0
    ids = []
    if mf:
        ids.append(_ev(ctx, "algo_score", store.origin_for("algo_score", algo="maxflow",
                                                           case=ctx.case_id,
                                                           account=",".join(targets)),
                       f"up to {mf:,.2f} could move from {len(sources)} flagged account(s) to "
                       f"{', '.join(short(t) for t in targets)} (max flow)",
                       {"maxFlow": mf, **r["result"]}, r["cypher"], sources + targets))
    r["evidence_ids"] = [i for i in ids if i]
    return r


@tool("passthrough_check", "Exact pass-through matching on an account", ("investigator",),
      records=True)
def passthrough_check(ctx: Ctx, account_id: str) -> dict:
    r = passthrough.check(ctx.graph, account_id)
    res = r["result"]
    ids = []
    if res["flagged"]:
        ids.append(_ev(ctx, "passthrough", store.origin_for("passthrough", account=account_id),
                       f"{short(account_id)} relayed {res['n_pairs']} matched in/out transfer "
                       f"pair(s) worth {res['value']:,.2f}", res, r["cypher"], [account_id]))
    r["evidence_ids"] = [i for i in ids if i]
    return r


@tool("behavior_neighbors", "Accounts that behave alike (vector index)", ("investigator",),
      records=True)
def behavior_neighbors(ctx: Ctx, account_id: str, k: int = 5) -> dict:
    r = identity.behavior_neighbors(ctx.graph, account_id, k)
    ids = []
    if r["result"] and ctx.case_id:
        in_case = {x["id"] for x in db.ro(ctx.case_graph, "MATCH (a:Account) RETURN a.id AS id")}
        for n in r["result"]:
            if n["account"] in in_case:
                ids.append(_ev(ctx, "behavior_similarity",
                               store.origin_for("behavior_similarity", account=account_id,
                                                other=n["account"]),
                               f"{short(account_id)} behaves like case member "
                               f"{short(n['account'])} (cosine distance {n['score']:.3f})",
                               n, r["cypher"], [account_id, n["account"]]))
    r["evidence_ids"] = [i for i in ids if i]
    return r


@tool("clue_expand", "Grow a ring from clue accounts", ("investigator",))
def clue_expand_tool(ctx: Ctx, clue_ids: list[str], negatives: list[str] | None = None) -> dict:
    return clue_expand.expand(ctx.graph, clue_ids, negatives)


@tool("hunt_regions", "Motif-coherent seeds + SPNSA investigation subgraph", ("investigator",
                                                                             "orchestrator"))
def hunt_regions(ctx: Ctx, k: int = 20, r: int = 1) -> dict:
    seeds = motif_seeds.seeds_from_graph(ctx.graph, k, "motif")
    return {"result": {"seeds": seeds, **spnsa.subgraph(ctx.graph, seeds, r)}}


@tool("resolve_entity", "Phonetic name candidates across banks", ("investigator", "skeptic"))
def resolve_entity(ctx: Ctx, name: str) -> dict:
    return identity.resolve_entity(ctx.graph, name)


# ------------------------------------------------------------------ skeptic
@tool("shared_attr_context", "How widely shared each identity attribute is", ("skeptic",))
def shared_attr_context(ctx: Ctx, account_id: str) -> dict:
    return identity.shared_attr_context(ctx.graph, account_id)


@tool("kyc_lookup", "KYC record of an account (Postgres)", ("skeptic", "investigator"),
      records=True)
def kyc_lookup(ctx: Ctx, account_id: str) -> dict:
    r = kyc.kyc_by_account(account_id)
    ids = []
    for row in r["result"]:
        if "error" in row:
            continue
        ids.append(_ev(ctx, "kyc_fact", store.origin_for("kyc_fact", row=row["customer_id"]),
                       f"KYC {row['customer_id']}: {row['customer_type']} '{row['name']}', "
                       f"occupation {row['occupation']}, onboarded {row['onboarding_date']}, "
                       f"address {row['address_id']} ({row['address_units']} units), "
                       f"risk {row['risk_rating']}", row, r["sql"], [account_id]))
    r["evidence_ids"] = [i for i in ids if i]
    return r


@tool("address_occupancy", "How many customers are registered at an address (Postgres)",
      ("skeptic",), records=True)
def address_occupancy(ctx: Ctx, address_id: str) -> dict:
    r = kyc.address_occupancy(address_id)
    ids = []
    for row in r["result"]:
        if "error" in row:
            continue
        ids.append(_ev(ctx, "kyc_fact", store.origin_for("kyc_fact", row=f"addr:{address_id}"),
                       f"address {address_id} ({row['address_text']}) has {row['units']} units "
                       f"and {row['registered_customers']} registered customers at "
                       f"{row['banks']} bank(s)", row, r["sql"], []))
    r["evidence_ids"] = [i for i in ids if i]
    return r


# ------------------------------------------------------------------ trust & memory
@tool("echo_check", "Paths vs independent sources for a claim", ("skeptic", "investigator",
                                                                 "reporter"))
def echo_check(ctx: Ctx, claim_id: str) -> dict:
    return echo.echo_check(ctx.case_id, claim_id)


@tool("invalidate_evidence", "Supersede evidence and cascade to dependents", ("analyst",))
def invalidate_evidence(ctx: Ctx, evidence_id: str, reason: str) -> dict:
    return validity.invalidate_evidence(ctx.case_id, evidence_id, reason)


@tool("premise_check", "Check whether an action/claim rests on superseded evidence",
      ("analyst", "reporter"))
def premise_check(ctx: Ctx, action_id: str | None = None, claim_id: str | None = None) -> dict:
    return validity.premise_check(ctx.case_id, action_id, claim_id)


@tool("case_status", "Summary of a case from the graph", ("orchestrator", "analyst"))
def case_status(ctx: Ctx) -> dict:
    g = ctx.case_graph
    q = ("MATCH (c:Case) OPTIONAL MATCH (cl:Claim) WITH c, collect(cl) AS cls "
         "OPTIONAL MATCH (e:Evidence) WITH c, cls, collect(e) AS evs "
         "OPTIONAL MATCH (a:Action) RETURN c.id AS id, c.status AS status, c.title AS title, "
         "size(cls) AS claims, size(evs) AS evidence, collect(a.kind) AS actions")
    return {"result": db.ro(g, q)[0], "cypher": q}


@tool("get_case_bundle", "Closed-world bundle of a case, evidence grouped by origin",
      ("reporter", "skeptic"))
def get_case_bundle(ctx: Ctx) -> dict:
    from trust import gate
    return {"result": gate.get_case_bundle(ctx.case_id)}


def call(name: str, ctx: Ctx, **params) -> dict:
    """Run a tool, log it to the case timeline, return its JSON-able result."""
    t = REGISTRY[name]
    out = t.fn(ctx, **params)
    if ctx.case_id:
        cy = out.get("cypher")
        store.log_event(ctx.case_id, ctx.agent, f"tool:{name}",
                        {"params": params, "evidence_ids": out.get("evidence_ids", []),
                         "summary": _summarize(out)},
                        cy if isinstance(cy, str) else json.dumps(cy)[:4000] if cy else None)
    return out


def _summarize(out: dict) -> str:
    r = out.get("result")
    if isinstance(r, list):
        return f"{len(r)} row(s)"
    if isinstance(r, dict):
        return ", ".join(f"{k}={v}" for k, v in list(r.items())[:4] if not isinstance(v, (list,
                                                                                         dict)))[:200]
    return str(r)[:200]


def describe(agent: str) -> list[dict]:
    return [{"name": t.name, "description": t.description, "params": t.params}
            for t in REGISTRY.values() if agent in t.agents]
