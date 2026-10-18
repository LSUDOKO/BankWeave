"""BankWeave MCP server: read-only investigation tools over FalkorDB for any MCP client.

Hosted:  mounted into the FastAPI app at /mcp (streamable HTTP, stateless), so it is live at
         https://bankweave-api.onrender.com/mcp
Local:   python -m app.mcp_server            (stdio, reads FALKORDB_* from env / repo .env)
         python -m app.mcp_server --http 8765

Every tool is READ-ONLY. Reads go through GRAPH.RO_QUERY (`db.ro`), so FalkorDB itself rejects
any write, and every result carries the graph it ran on, the exact Cypher, its parameters and
the wall time. The queries are the same ones the API and the agents use (imported from the
routers and detection modules), so what Claude sees is what the product computes.
"""
from __future__ import annotations

import itertools
import json
import re
import time
from typing import Any

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations

from app import db
from app.cypher import REGISTRY as QUERY_REGISTRY
from app.cypher import cy

INSTRUCTIONS = """\
BankWeave is a multi-agent cross-bank AML (anti-money-laundering) investigation system built on
FalkorDB. Several banks pool hashed transaction data into one consortium graph; agents triage
alerts, open cases, gather evidence and write claims whose confidence is echo-proof (computed
over DISTINCT evidential origins, not over the number of graph paths that reach them).

Graphs (all read-only here):
  consortium        hashed cross-bank view: Account, TRANSFERS, FLOWS, Person/Company (full-text
                    name index), Device/IP/Address, Alert, Decision, Case, Claim.
                    Account.behavior_vec has a vector index.
  bank_<id>         one bank's own view; other banks' accounts are ExternalAccount stubs.
  case_<id>         one investigation: Case, Claim, Evidence, Action, SAR, Event, Account.
  typology_kb       laundering typology guidance (full-text index over Chunk text).

Good starting points: engine_overview -> list_cases -> get_case -> explain_claim;
list_alerts -> triage_alert; account_network -> trace_money_path / find_rings.
Every result includes `graph`, `cypher` and `params`: quote the Cypher when you explain a finding.
Never present a claim as proven unless independent_sources >= 2; paths alone are not proof.
"""

mcp = MCPServer(
    name="bankweave",
    title="BankWeave AML graph",
    description="Read-only cross-bank AML investigation tools over FalkorDB",
    instructions=INSTRUCTIONS,
    website_url="https://bankweave-api.onrender.com",
    version="1.0.0",
)

RO = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True,
                     openWorldHint=False)
MAX_ROWS = 200


# ------------------------------------------------------------------ helpers
def _jsonable(x: Any) -> Any:
    return json.loads(json.dumps(x, default=str))


def _out(graph: str, cypher: Any, params: dict | None, result: Any, t0: float,
         **extra: Any) -> dict:
    """Uniform envelope: what ran, where, with which params, and what came back."""
    return _jsonable({"graph": graph, "result": result, "cypher": cypher, "params": params or {},
                      "ms": round((time.perf_counter() - t0) * 1000, 1), **extra})


def _graphs() -> list[str]:
    return db.list_graphs()


def _case_graph(case_id: str) -> str:
    case_id = case_id.strip()
    if case_id.startswith(db.PREFIX + "case_"):
        case_id = db.case_id_of(case_id)
    g = db.case_graph(case_id)
    if g not in _graphs():
        known = sorted(db.case_id_of(x) for x in db.case_graphs())
        raise ToolError(f"unknown case '{case_id}'. Known cases: {', '.join(known[:40])}")
    return g


def _allowed_graph(graph: str) -> str:
    """Graph allowlist for tools that take a graph name: consortium, bank_*, case_*, typology_kb."""
    graph = (graph or "consortium").strip()
    if graph == "consortium":
        graph = db.CONSORTIUM
    ok = (graph in (db.CONSORTIUM, db.TYPOLOGY_KB)
          or graph.startswith((db.PREFIX + "bank_", db.PREFIX + "case_")))
    if not ok:
        raise ToolError("graph must be 'consortium', 'typology_kb', 'bank_<id>' or 'case_<id>'")
    if graph not in _graphs():
        raise ToolError(f"graph '{graph}' does not exist; call list_graphs")
    return graph


def _loads(s: Any) -> Any:
    if isinstance(s, str):
        try:
            return json.loads(s)
        except ValueError:
            return s
    return s


def _cap(n: int, lo: int = 1, hi: int = MAX_ROWS) -> int:
    return max(lo, min(int(n), hi))


# ------------------------------------------------------------------ queries owned by the MCP
MCP_COUNTS = cy("mcp_consortium_counts", "Headline sizes of the consortium graph", """
MATCH (a:Account)
WITH count(a) AS accounts, count(DISTINCT a.bank_id) AS banks
MATCH ()-[t:TRANSFERS]->()
RETURN accounts, banks, count(t) AS transfers
""")

MCP_CASE_HEAD = cy("mcp_case_head", "Case header inside one case graph", """
MATCH (c:Case)
RETURN c.id AS id, c.status AS status, c.title AS title, c.seed_account AS seed,
       c.seed_alert AS alert, c.bank_scope AS banks, c.opened_at AS opened_at
""")

MCP_CASE_SAR = cy("mcp_case_sar", "SAR status and audit fields of a case", """
MATCH (s:SAR)
RETURN s.id AS id, s.status AS status, s.state AS state, s.version AS version,
       s.pf_score AS provenance_score, s.repairs AS repairs, s.auditor AS auditor,
       s.created_at AS created_at
ORDER BY s.version DESC
""")

MCP_CASE_ACCOUNTS = cy("mcp_case_accounts", "Accounts and banks inside a case graph", """
MATCH (a:Account)
RETURN count(a) AS accounts, collect(DISTINCT a.bank_id) AS banks
""")

MCP_BANKS_OF = cy("mcp_banks_of", "Bank of each account in a list (consortium)", """
MATCH (a:Account) WHERE a.id IN $ids
RETURN a.id AS id, a.bank_id AS bank
""")

MCP_ALERT_DECISION = cy("mcp_alert_decision", "Triage decision recorded for an alert", """
MATCH (al:Alert {id:$id})-[:DECIDED]->(d:Decision)
RETURN d.id AS id, d.outcome AS outcome, d.reason AS reason, d.agent AS agent, d.ts AS ts
""")


# ------------------------------------------------------------------ overview
@mcp.tool(annotations=RO)
def engine_overview() -> dict:
    """Health and size of the whole system: FalkorDB memory/version, graphs (banks, cases),
    consortium size (accounts, banks, transfers) and the alert queue by status (open / case /
    cleared). Call this first to orient yourself. FalkorDB features: INFO memory, GRAPH.LIST,
    GRAPH.RO_QUERY aggregations."""
    from app.routers import overview as ov
    t0 = time.perf_counter()
    graphs = _graphs()
    counts = db.ro(db.CONSORTIUM, MCP_COUNTS, timeout=10000)
    alerts = {r["status"]: r["n"] for r in db.ro(db.CONSORTIUM, ov.ALERTS)}
    kinds = {"bank": sorted(g for g in graphs if g.startswith(db.PREFIX + "bank_")),
             "case": len([g for g in graphs if db.is_case_graph(g)]),
             "other": sorted(g for g in graphs if not (g.startswith(db.PREFIX + "bank_")
                                                     or db.is_case_graph(g)))}
    return _out(db.CONSORTIUM, [MCP_COUNTS, ov.ALERTS], {}, {
        "falkordb": ov._engine(),
        "graphs": {"total": len(graphs), **kinds},
        "consortium": counts[0] if counts else {},
        "alerts": {"total": sum(alerts.values()), **alerts},
    }, t0)


@mcp.tool(annotations=RO)
def list_graphs() -> dict:
    """List every FalkorDB graph BankWeave keeps, grouped by kind: the consortium (cross-bank,
    hashed), one graph per bank (that bank's partial view), one graph per case, the typology
    knowledge base. Use graph_schema(graph) for labels, relationship types and indexes."""
    t0 = time.perf_counter()
    gs = sorted(_graphs())
    return _out("*", "GRAPH.LIST", {}, {
        "consortium": [g for g in gs if g == db.CONSORTIUM],
        "banks": [g for g in gs if g.startswith(db.PREFIX + "bank_")],
        "cases": [g for g in gs if db.is_case_graph(g)],
        "other": [g for g in gs if g != db.CONSORTIUM and not g.startswith(db.PREFIX + "bank_")
                  and not db.is_case_graph(g)],
    }, t0)


SCHEMA_INDEXES = ("CALL db.indexes() YIELD label, properties, types, entitytype "
                  "RETURN label, properties, types, entitytype")
SCHEMA_LABELS = "CALL db.labels() YIELD label RETURN label"
SCHEMA_RELS = "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType"
SCHEMA_PROPS = "CALL db.propertyKeys() YIELD propertyKey RETURN propertyKey"


def _schema(graph: str) -> dict:
    idx = db.ro(graph, SCHEMA_INDEXES)
    return {
        "labels": [r["label"] for r in db.ro(graph, SCHEMA_LABELS)],
        "relationship_types": [r["relationshipType"] for r in db.ro(graph, SCHEMA_RELS)],
        "property_keys": [r["propertyKey"] for r in db.ro(graph, SCHEMA_PROPS)],
        "indexes": [{"label": r["label"], "entity": r["entitytype"],
                     "fields": {k: v for k, v in dict(r["types"]).items()}} for r in idx],
    }


@mcp.tool(annotations=RO)
def graph_schema(graph: str = "consortium") -> dict:
    """Schema of one graph: node labels, relationship types, property keys and indexes with
    their kind (RANGE, FULLTEXT, VECTOR). graph: 'consortium', 'bank_<id>', 'case_<id>' or
    'typology_kb'. FalkorDB features: db.labels, db.relationshipTypes, db.propertyKeys,
    db.indexes."""
    t0 = time.perf_counter()
    g = _allowed_graph(graph)
    return _out(g, [SCHEMA_LABELS, SCHEMA_RELS, SCHEMA_PROPS, SCHEMA_INDEXES], {}, _schema(g), t0)


# ------------------------------------------------------------------ cases
@mcp.tool(annotations=RO)
def list_cases(limit: int = 30) -> dict:
    """List investigation cases (newest first) with status, title, seed account, number of
    alerts/accounts, the banks involved and whether its case graph is loaded. Use a case id
    with get_case. FalkorDB features: GRAPH.RO_QUERY over the consortium graph."""
    from app.routers import cases as rc
    t0 = time.perf_counter()
    rows = db.ro(db.CONSORTIUM, rc.LIST)
    loaded = {db.case_id_of(g) for g in db.case_graphs()}
    for r in rows:
        r["has_graph"] = r["id"] in loaded
    return _out(db.CONSORTIUM, rc.LIST, {}, {"total": len(rows), "cases": rows[:_cap(limit)]}, t0)


@mcp.tool(annotations=RO)
def get_case(case_id: str, max_evidence: int = 40) -> dict:
    """Everything about one case from its own case graph: header, claims (each with naive vs
    echo-proof confidence, paths vs independent_sources, state, supporting/challenging evidence
    ids), evidence (kind, origin, state active/needs_verification/superseded, summary), proposed
    and approved actions with the claims that justify them, and SAR status. case_id like
    'C-44c08392'. FalkorDB features: one graph per case, GRAPH.RO_QUERY."""
    from app.routers import cases as rc
    t0 = time.perf_counter()
    g = _case_graph(case_id)
    head = db.ro(g, MCP_CASE_HEAD)
    claims = db.ro(g, rc.CLAIMS)
    evidence = db.ro(g, rc.EVIDENCE)
    for e in evidence:
        e.pop("cypher", None)  # the query text per evidence item is in explain_claim
    actions = db.ro(g, rc.ACTIONS)
    sar = db.ro(g, MCP_CASE_SAR)
    acc = db.ro(g, MCP_CASE_ACCOUNTS)
    by_state: dict[str, int] = {}
    for e in evidence:
        by_state[e.get("state") or "?"] = by_state.get(e.get("state") or "?", 0) + 1
    proven = [c["id"] for c in claims
              if (c.get("independent_sources") or 0) >= 2 and c.get("state") == "active"]
    return _out(g, {"claims": rc.CLAIMS, "evidence": rc.EVIDENCE, "actions": rc.ACTIONS,
                    "sar": MCP_CASE_SAR}, {"case_id": case_id}, {
        "case": head[0] if head else None,
        "accounts": acc[0] if acc else {},
        "summary": {"claims": len(claims), "claims_with_2plus_independent_sources": len(proven),
                    "evidence": len(evidence), "evidence_by_state": by_state,
                    "actions": len(actions), "sar": sar[0]["status"] if sar else None},
        "claims": claims,
        "evidence": evidence[:_cap(max_evidence)],
        "actions": actions,
        "sar": sar,
    }, t0)


@mcp.tool(annotations=RO)
def explain_claim(case_id: str, claim_id: str) -> dict:
    """Why a claim has the confidence it has (GraphEcho echo-proof scoring). Groups supporting
    and challenging evidence by ORIGIN: many paths that lead back to the same origin count once.
    Returns paths vs independent origins, naive (path-counting) vs echo-proof confidence, each
    origin group with its multiplicity and weight, which origin kinds were never explored, and
    the derived-claim / evidence chain with the Cypher each evidence item ran. Pure read: the
    score is recomputed in memory, nothing is written. FalkorDB features: GRAPH.RO_QUERY,
    variable-length DERIVED_FROM traversal."""
    from app.routers import cases as rc
    from trust import echo
    t0 = time.perf_counter()
    g = _case_graph(case_id)
    p = {"id": claim_id}
    claim = db.ro(g, "MATCH (c:Claim {id:$id}) RETURN c.id AS id, c.text AS text, c.kind AS kind, "
                     "c.state AS state, c.about AS about, c.confidence AS stored_confidence", p)
    if not claim:
        ids = [r["id"] for r in db.ro(g, "MATCH (c:Claim) RETURN c.id AS id")]
        raise ToolError(f"claim '{claim_id}' not in {g}. Claims: {', '.join(ids[:40])}")
    sup = db.ro(g, echo.SUPPORTS, p)
    chal = db.ro(g, echo.CHALLENGES, p)
    s = echo.score(sup, chal)
    chain = db.ro(g, rc.CHAIN, p)
    chain = chain[0] if chain else {"claims": [], "evidence": []}
    for e in chain["evidence"]:
        e["payload"] = _loads(e.get("payload"))
    chain["evidence"] = [e for e in chain["evidence"] if e.get("id")]
    verdict = ("proven by independent sources" if s["independent_sources"] >= 2
               and s["confidence"] > 0 else
               "NOT independently corroborated: all support traces to "
               f"{s['independent_sources']} origin(s)")
    return _out(g, {"supports": echo.SUPPORTS, "challenges": echo.CHALLENGES,
                    "chain": rc.CHAIN}, p, {
        "claim": claim[0],
        "paths": s["paths"],
        "independent_sources": s["independent_sources"],
        "independent_challenges": s["independent_challenges"],
        "naive_confidence": s["naive_confidence"],
        "echo_proof_confidence": s["confidence"],
        "verdict": verdict,
        "origin_groups": s["groups"],
        "challenge_groups": s["challenge_groups"],
        "kinds_explored": s["kinds_explored"],
        "kinds_unexplored": s["kinds_unexplored"],
        "chain": chain,
        "method": "confidence = 1 - exp(-0.5 * (sum of strongest weight per distinct support "
                  "origin - same for challenges)); naive sums every path instead",
    }, t0)


# ------------------------------------------------------------------ accounts & money flow
@mcp.tool(annotations=RO)
def account_network(account_id: str, depth: int = 2) -> dict:
    """An account's cross-bank neighbourhood in the consortium graph: its scores (pagerank,
    motif score, community, WCC component size, pass-through pairs), shared identity (device,
    IP, address with how widely each is shared), cases and alerts on it, counterparties held at
    OTHER banks (count and volume) and its bounded 1-2 hop neighbourhood with the banks it
    spans. A bank alone only sees its own side of these links. FalkorDB features:
    GRAPH.RO_QUERY, bounded undirected expansion."""
    from app.routers import network as rn
    from detection import algorithms as al
    from detection import identity
    t0 = time.perf_counter()
    p = {"id": account_id}
    rows = db.ro(db.CONSORTIUM, rn.ACCOUNT, p)
    if not rows or not rows[0].get("id"):
        raise ToolError(f"account '{account_id}' not found in the consortium graph")
    acc = rows[0]
    acc["identity"] = [x for x in acc["identity"] if x.get("id")]
    acc["alerts"] = [x for x in acc["alerts"] if x.get("id")]
    xb = identity.cross_bank_links(db.CONSORTIUM, account_id)
    nb = al.expand_neighborhood(db.CONSORTIUM, account_id, depth)
    return _out(db.CONSORTIUM, {"account": rn.ACCOUNT, "cross_bank": xb["cypher"],
                                "neighborhood": nb["cypher"]},
                {"id": account_id, "depth": nb["params"]["depth"]}, {
        "account": acc,
        "cross_bank_counterparties": xb["result"],
        "neighborhood": {"hop1": nb["result"]["hop1"], "hop2": nb["result"]["hop2"],
                         "n_banks": nb["result"]["n_banks"],
                         "banks": sorted({b for b in nb["result"]["banks"] if b})},
    }, t0)


@mcp.tool(annotations=RO)
def trace_money_path(src: str, dst: str, max_len: int = 6, path_count: int = 3,
                     case_id: str | None = None) -> dict:
    """Shortest money paths from one account to another, hop by hop with transaction ids,
    amounts and the bank of every account on the path, so you can see the money cross banks.
    Without case_id it searches the consortium along outgoing transfers; with case_id it searches
    that case graph in both directions. No path = no claim. FalkorDB features: algo.SPpaths."""
    from detection import algorithms as al
    t0 = time.perf_counter()
    g = _case_graph(case_id) if case_id else db.CONSORTIUM
    r = al.trace_flow(g, src, dst, _cap(max_len, 1, 8), _cap(path_count, 1, 10),
                      "both" if case_id else "outgoing")
    ids = sorted({a for p in r["result"] for a in p["accounts"]})
    banks = {b["id"]: b["bank"] for b in db.ro(db.CONSORTIUM, MCP_BANKS_OF, {"ids": ids})}
    paths = []
    for p in r["result"]:
        hops = [banks.get(a) for a in p["accounts"]]
        paths.append({**p, "banks": hops, "bank_crossings": sum(
            1 for a, b in itertools.pairwise(hops) if a and b and a != b)})
    return _out(g, [r["cypher"], MCP_BANKS_OF], r["params"], {
        "found": bool(paths), "paths": paths,
        "note": None if paths else f"no transfer path of <= {r['params']['max_len']} hops",
    }, t0)


@mcp.tool(annotations=RO)
def find_rings(account_id: str | None = None, min_size: int = 3, max_size: int = 60,
               limit: int = 10, graph: str = "consortium") -> dict:
    """Candidate laundering rings: communities of accounts that trade mostly among themselves,
    found by label propagation on the transfer graph. Cross-bank rings (members at more than
    one bank) come first, since no single bank can see them whole. Pass account_id to return
    only the ring that contains that account. FalkorDB features: algo.labelPropagation."""
    from detection import algorithms as al
    t0 = time.perf_counter()
    g = _allowed_graph(graph)
    r = al.find_rings(g, None, _cap(min_size, 2, 500), _cap(max_size, 2, 5000),
                      1000 if account_id else _cap(limit, 1, 50))
    rings = r["result"]
    if account_id:
        rings = [x for x in rings if account_id in x["members"]]
    rings.sort(key=lambda x: (-len([b for b in x["banks"] if b]), -x["size"]))
    for x in rings:
        x["n_banks"] = len([b for b in x["banks"] if b])
        x["members"] = x["members"][:60]
    return _out(g, r["cypher"], r["params"], {
        "rings": rings[:_cap(limit, 1, 50)],
        "note": (f"{account_id} is in no community of size {min_size}..{max_size}"
                 if account_id and not rings else None),
    }, t0)


@mcp.tool(annotations=RO)
def top_hubs(top_k: int = 10, graph: str = "consortium") -> dict:
    """Accounts where money pools: PageRank over TRANSFERS, highest first, with bank ids.
    graph: 'consortium', 'bank_<id>' or 'case_<id>'. FalkorDB features: algo.pageRank."""
    from detection import algorithms as al
    t0 = time.perf_counter()
    g = _allowed_graph(graph)
    r = al.find_hub(g, _cap(top_k, 1, 100))
    return _out(g, r["cypher"], r["params"], r["result"], t0)


@mcp.tool(annotations=RO)
def connected_components(limit: int = 10, graph: str = "consortium") -> dict:
    """Weakly connected components of the transfer graph (largest first): size, number of
    banks, a sample of members, plus how many components are tiny 'islands' that triage clears
    instantly. graph: 'consortium', 'bank_<id>' or 'case_<id>'. FalkorDB features: algo.wcc."""
    from detection import algorithms as al
    t0 = time.perf_counter()
    g = _allowed_graph(graph)
    r = al.find_islands(g, _cap(limit, 1, 100))
    for c in r["result"]["components"]:
        c["sample"] = c["sample"][:15]
    return _out(g, r["cypher"], r["params"], r["result"], t0)


@mcp.tool(annotations=RO)
def similar_accounts(account_id: str, k: int = 5) -> dict:
    """Accounts whose behaviour (activity, amounts, timing, degree profile) is closest to this
    one, by cosine distance over Account.behavior_vec (lower = more alike), with their banks.
    Useful to find mule accounts that act like a known one at other banks. FalkorDB features:
    HNSW vector index, db.idx.vector.queryNodes."""
    from detection import identity
    t0 = time.perf_counter()
    r = identity.behavior_neighbors(db.CONSORTIUM, account_id, _cap(k, 1, 50) + 1)
    return _out(db.CONSORTIUM, r["cypher"], r["params"], r["result"][:_cap(k, 1, 50)], t0)


@mcp.tool(annotations=RO)
def search_customers(name: str, label: str = "Person", k: int = 10) -> dict:
    """Fuzzy name search over customers (Person) or businesses (Company) across all banks,
    with the accounts and banks each one owns. Tokens are OR-ed, so partial names work.
    FalkorDB features: full-text index, db.idx.fulltext.queryNodes."""
    from detection import identity
    t0 = time.perf_counter()
    r = identity.resolve_entity(db.CONSORTIUM, name, _cap(k, 1, 50), label)
    return _out(db.CONSORTIUM, r["cypher"], r["params"], r["result"], t0)


# ------------------------------------------------------------------ alerts & triage
@mcp.tool(annotations=RO)
def list_alerts(status: str | None = None, limit: int = 20) -> dict:
    """The alert queue with counts by status. status: 'open', 'case' (escalated into a case)
    or 'cleared'; omit for all. Each alert has its rule, reason, account, bank, case id and the
    recorded clearing reason. Use an alert id with triage_alert. FalkorDB features: range
    indexes on Alert.status, GRAPH.RO_QUERY."""
    from app.routers import alerts as ra
    t0 = time.perf_counter()
    p = {"status": status, "limit": _cap(limit), "skip": 0}
    rows = db.ro(db.CONSORTIUM, ra.LIST, p)
    counts = {r["status"]: r["n"] for r in db.ro(db.CONSORTIUM, ra.COUNTS)}
    return _out(db.CONSORTIUM, [ra.LIST, ra.COUNTS], p,
                {"counts": counts, "total": sum(counts.values()), "alerts": rows}, t0)


@mcp.tool(annotations=RO)
def triage_alert(alert_id: str) -> dict:
    """Why an alert was cleared or escalated into a case. Returns the alert, the triage
    decision and its reason, the graph signals the triage agent recorded (component size,
    motif score, cross-bank counterparties, typologies, shared identity, prior cases), and a
    LIVE re-check: the account's weakly connected component size (islands smaller than the
    configured threshold clear instantly) and its motif score components. FalkorDB features:
    algo.wcc, GRAPH.RO_QUERY."""
    from app.routers import alerts as ra
    from detection import algorithms as al
    from detection import motif_seeds
    from detection.settings import cfg
    t0 = time.perf_counter()
    p = {"id": alert_id}
    rows = db.ro(db.CONSORTIUM, ra.ONE, p)
    if not rows:
        raise ToolError(f"alert '{alert_id}' not found; call list_alerts")
    alert = rows[0]
    alert["signals"] = _loads(alert.get("signals"))
    decision = db.ro(db.CONSORTIUM, MCP_ALERT_DECISION, p)
    acct = alert.get("account")
    wcc = al.component_of(db.CONSORTIUM, acct) if acct else {"result": None, "cypher": None}
    motif = motif_seeds.motif_score(db.CONSORTIUM, acct) if acct else {"result": None,
                                                                         "cypher": None}
    t = cfg()["triage"]
    size = (wcc["result"] or {}).get("size")
    checks = {
        "component_size": size,
        "island_rule": (f"component size {size} < {t['clear_if_component_size_below']}: "
                        "an island, clears instantly" if size is not None
                        and size < t["clear_if_component_size_below"]
                        else f"component size {size} >= {t['clear_if_component_size_below']}: "
                             "connected, needs graph evidence"),
        "motif_rule": (f"motif score > {t['case_if_motif_score_above']} escalates to a case"),
    }
    return _out(db.CONSORTIUM, {"alert": ra.ONE, "decision": MCP_ALERT_DECISION,
                                "wcc": wcc["cypher"], "motif": motif["cypher"]}, p, {
        "alert": alert,
        "outcome": alert.get("status"),
        "decision": decision[0] if decision else None,
        "live_wcc_component": wcc["result"],
        "live_motif": motif["result"],
        "checks": checks,
        "thresholds": t,
    }, t0)


@mcp.tool(annotations=RO)
def typology_guidance(question: str) -> dict:
    """Laundering typology guidance (e.g. 'fan-out then fan-in through mules', 'structuring
    below reporting threshold') from BankWeave's typology knowledge graph, with citations.
    Abstains when nothing matches well. FalkorDB features: full-text index on the
    typology_kb graph."""
    from knowledge import typology_kb
    t0 = time.perf_counter()
    r = typology_kb.kb_query(question)
    return _out(db.TYPOLOGY_KB, r.get("cypher"), {"question": question},
                {k: v for k, v in r.items() if k != "cypher"}, t0)


# ------------------------------------------------------------------ raw read-only Cypher
_WRITE = re.compile(r"\b(CREATE|MERGE|SET|DELETE|DETACH|REMOVE|DROP|FOREACH|LOAD\s+CSV)\b", re.IGNORECASE)
_CALL = re.compile(r"\bCALL\s+([A-Za-z_][\w.]*)", re.IGNORECASE)
_CALL_OK = ("algo.", "db.labels", "db.relationshiptypes", "db.propertykeys", "db.indexes",
            "db.constraints", "db.meta.stats", "db.idx.fulltext.querynodes",
            "db.idx.fulltext.queryrelationships", "db.idx.vector.querynodes",
            "db.idx.vector.queryrelationships")


def _mask_strings(q: str) -> str:
    return re.sub(r"'(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\"|`[^`]*`", "''", q)


@mcp.tool(annotations=RO)
def run_readonly_cypher(cypher: str, graph: str = "consortium", limit: int = 50) -> dict:
    """Last resort: run your own read-only Cypher on one graph. Runs as GRAPH.RO_QUERY (the
    engine rejects writes) after a guard: one statement, no CREATE/MERGE/SET/DELETE/REMOVE/
    DROP/FOREACH/LOAD CSV, CALL only for algo.* and the db.* read/index-query procedures,
    LIMIT appended when missing, at most 200 rows, 10 s timeout. graph: 'consortium',
    'bank_<id>', 'case_<id>' or 'typology_kb' (see graph_schema for labels and properties)."""
    t0 = time.perf_counter()
    g = _allowed_graph(graph)
    q = cypher.strip().rstrip(";").strip()
    masked = _mask_strings(q)
    if ";" in masked:
        raise ToolError("one statement only")
    if "GRAPH." in masked.upper() or "//" in masked or "/*" in masked:
        raise ToolError("no GRAPH.* commands or comments")
    if _WRITE.search(masked):
        raise ToolError("read-only: write clauses are not allowed")
    for proc in _CALL.findall(masked):
        if not proc.lower().startswith(_CALL_OK):
            raise ToolError(f"procedure '{proc}' is not on the read-only allowlist")
    n = _cap(limit)
    if re.search(r"\bRETURN\b", masked, re.IGNORECASE) and not re.search(r"\bLIMIT\b", masked, re.IGNORECASE):
        q = f"{q} LIMIT {n}"
    try:
        rows = db.ro(g, q, timeout=10000)
    except Exception as exc:
        raise ToolError(f"FalkorDB rejected the query: {exc}") from exc
    return _out(g, q, {}, {"rows": rows[:n], "row_count": len(rows),
                           "truncated": len(rows) > n}, t0)


# ------------------------------------------------------------------ resources
@mcp.resource("bankweave://queries", name="query_catalogue", mime_type="application/json",
              description="Every named Cypher query the product runs, with its purpose")
def query_catalogue() -> str:
    return json.dumps([{"name": q.name, "purpose": q.purpose, "module": q.module, "cypher": q.text}
                       for q in sorted(QUERY_REGISTRY.values(), key=lambda q: q.name)], indent=1)


@mcp.resource("bankweave://schema/{graph}", name="graph_schema", mime_type="application/json",
              description="Labels, relationship types, property keys and indexes of one graph")
def schema_resource(graph: str) -> str:
    g = _allowed_graph(graph)
    return json.dumps(_jsonable({"graph": g, **_schema(g)}), indent=1)


# ------------------------------------------------------------------ prompts
@mcp.prompt(title="Investigate a case")
def investigate_case(case_id: str) -> str:
    """Walk a BankWeave case end to end and judge which claims actually hold."""
    return (
        f"Investigate BankWeave case {case_id} using the bankweave tools.\n"
        f"1. get_case('{case_id}'): summarise the case, accounts, banks, actions and SAR status.\n"
        "2. For every claim that justifies an action, call explain_claim and report paths vs "
        "independent origins and naive vs echo-proof confidence. Flag any claim whose support "
        "collapses to a single origin.\n"
        "3. For the seed account, call account_network and trace_money_path to the hub or "
        "other key accounts; say how many bank boundaries the money crosses.\n"
        "4. Check find_rings(account_id=<seed>) and similar_accounts for accounts the case may "
        "have missed.\n"
        "Rules: quote the Cypher behind each finding; never call a claim proven with fewer than "
        "two independent sources; say plainly when a tool returns no path.")


@mcp.prompt(title="Explain a ring around an account")
def explain_ring(account_id: str) -> str:
    """Explain the cross-bank structure around an account and whether it looks like a ring."""
    return (
        f"Explain whether account {account_id} sits in a cross-bank laundering ring.\n"
        f"1. account_network('{account_id}'): scores, shared identity, cross-bank counterparties.\n"
        f"2. find_rings(account_id='{account_id}'): its community, size and banks.\n"
        "3. trace_money_path between the account and its largest cross-bank counterparty, in "
        "both directions, to look for money returning (circular flow).\n"
        "4. top_hubs and similar_accounts for context; typology_guidance for the pattern you "
        "see (fan-in, fan-out, cycle, pass-through, structuring).\n"
        "Explain what each bank alone would have seen versus the consortium, and cite the "
        "Cypher of every result you rely on.")


@mcp.prompt(title="Review a triage decision")
def review_triage(alert_id: str) -> str:
    """Audit why an alert was cleared or escalated."""
    return (
        f"Audit the triage decision for alert {alert_id}.\n"
        f"1. triage_alert('{alert_id}'): outcome, reason, recorded signals, live WCC component "
        "size and motif score.\n"
        "2. account_network on its account; if it was cleared, check whether any cross-bank "
        "counterparty or shared identity contradicts the clearing reason.\n"
        "3. Conclude: agree or disagree with the decision, citing the Cypher and numbers.")


# ------------------------------------------------------------------ ASGI wiring
def http_app():
    """Streamable-HTTP Starlette app (stateless, JSON responses). Its route is /mcp; the session
    manager must be run inside the host app's lifespan (see app.main)."""
    return mcp.streamable_http_app(
        streamable_http_path="/mcp", stateless_http=True, json_response=True,
        # public, unauthenticated, read-only: Host/Origin pinning would only break the hosted URL
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="BankWeave MCP server")
    ap.add_argument("--http", type=int, default=None, help="serve streamable HTTP on this port")
    ap.add_argument("--stdio", action="store_true", help="serve over stdio (default)")
    a = ap.parse_args()
    if a.http:
        import uvicorn
        uvicorn.run(http_app(), host="0.0.0.0", port=a.http)
    else:
        mcp.run("stdio")
