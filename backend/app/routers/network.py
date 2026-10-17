"""Network view: the same accounts seen by one bank vs by the consortium.

In bank_<id>, other banks' accounts are ExternalAccount stubs and transfers between two
outside accounts are invisible - the ring falls apart. In the consortium it is one structure.
"""
from fastapi import APIRouter, HTTPException

from app import db
from app.cypher import cy

router = APIRouter(prefix="/network", tags=["network"])

FOCUS_CASES = cy("network_focus_cases", "Accounts covered by cases (the interesting region)", """
MATCH (c:Case)-[:CONCERNS]->(a:Account)
WHERE $case IS NULL OR c.id = $case
RETURN DISTINCT a.id AS id LIMIT $limit
""")

FOCUS_TOP = cy("network_focus_top", "Highest motif-score accounts when no case exists yet", """
MATCH (a:Account) RETURN a.id AS id ORDER BY coalesce(a.motif_score, 0.0) DESC LIMIT $limit
""")

CONS_NODES = cy("network_consortium_nodes", "Focus accounts in the consortium view", """
MATCH (a:Account) WHERE a.id IN $ids
OPTIONAL MATCH (c:Case)-[:CONCERNS]->(a)
RETURN a.id AS id, a.bank_id AS bank, 'account' AS kind,
       coalesce(a.pagerank, 0.0) AS pagerank, coalesce(a.motif_score, 0.0) AS motif,
       a.community AS community, collect(DISTINCT c.id) AS cases
""")

CONS_EDGES = cy("network_consortium_edges", "Transfers among focus accounts (consortium)", """
MATCH (s:Account)-[f:FLOWS]->(d:Account)
WHERE s.id IN $ids AND d.id IN $ids
RETURN s.id AS source, d.id AS target, f.capacity AS amount, f.n_txn AS n
""")

BANK_NODES = cy("network_bank_nodes", "Focus accounts as one bank sees them", """
MATCH (a) WHERE (a:Account OR a:ExternalAccount) AND a.id IN $ids
RETURN a.id AS id, a.bank_id AS bank,
       CASE WHEN a:Account THEN 'account' ELSE 'external' END AS kind
""")

BANK_EDGES = cy("network_bank_edges", "Transfers among focus accounts visible to one bank", """
MATCH (s)-[t:TRANSFERS]->(d)
WHERE s.id IN $ids AND d.id IN $ids
RETURN s.id AS source, d.id AS target, sum(t.amount) AS amount, count(t) AS n
""")

ACCOUNT = cy("network_account_detail", "Side panel: scores, identity, cases for one account", """
MATCH (a:Account {id:$id})
OPTIONAL MATCH (a)-[:USES_DEVICE|USES_IP|REGISTERED_AT]->(x)
OPTIONAL MATCH (c:Case)-[:CONCERNS]->(a)
OPTIONAL MATCH (al:Alert)-[:RAISED_FOR]->(a)
RETURN a.id AS id, a.bank_id AS bank, a.in_deg AS in_deg, a.out_deg AS out_deg,
       a.pagerank AS pagerank, a.motif_score AS motif, a.community AS community,
       a.component_size AS component_size, a.passthrough_pairs AS passthrough_pairs,
       collect(DISTINCT {kind:labels(x)[0], id:x.id, shared:x.shared_count, units:x.units}) AS identity,
       collect(DISTINCT c.id) AS cases, collect(DISTINCT {id:al.id, rule:al.rule, status:al.status}) AS alerts
""")


@router.get("/banks")
def banks():
    meta = db.ro(db.CONSORTIUM, "MATCH (m:Meta {id:'dataset'}) RETURN m.json AS j")
    import json
    return json.loads(meta[0]["j"]) if meta else {"banks": []}


@router.get("")
def network(view: str = "consortium", case: str | None = None, limit: int = 250):
    ids = [r["id"] for r in db.ro(db.CONSORTIUM, FOCUS_CASES, {"case": case, "limit": limit})]
    if not ids:
        ids = [r["id"] for r in db.ro(db.CONSORTIUM, FOCUS_TOP, {"limit": min(limit, 80)})]
    if view == "consortium":
        nodes = db.ro(db.CONSORTIUM, CONS_NODES, {"ids": ids})
        edges = db.ro(db.CONSORTIUM, CONS_EDGES, {"ids": ids})
        cypher = [CONS_NODES, CONS_EDGES]
    elif view.startswith("bank_"):
        view_graph = db.PREFIX + view
        if view_graph not in db.list_graphs():
            raise HTTPException(404, "unknown bank graph")
        nodes = db.ro(view_graph, BANK_NODES, {"ids": ids})
        edges = db.ro(view_graph, BANK_EDGES, {"ids": ids})
        cypher = [BANK_NODES, BANK_EDGES]
    else:
        raise HTTPException(400, "view must be consortium or bank_<id>")
    deg: dict[str, int] = {}
    for e in edges:
        deg[e["source"]] = deg.get(e["source"], 0) + 1
        deg[e["target"]] = deg.get(e["target"], 0) + 1
    isolated = sum(1 for n in nodes if not deg.get(n["id"]))
    return {"view": view, "nodes": nodes, "edges": edges, "cypher": cypher,
            "stats": {"nodes": len(nodes), "edges": len(edges), "isolated": isolated,
                      "focus": len(ids)}}


@router.get("/account/{account_id}")
def account(account_id: str):
    rows = db.ro(db.CONSORTIUM, ACCOUNT, {"id": account_id})
    if not rows or not rows[0]["id"]:
        raise HTTPException(404, "account not found")
    r = rows[0]
    r["identity"] = [x for x in r["identity"] if x.get("id")]
    r["alerts"] = [x for x in r["alerts"] if x.get("id")]
    return r


LAYER_EXTERNAL = cy("network_layer_external", "External stubs a bank sees around focus accounts", """
MATCH (a:Account)-[:TRANSFERS]-(x:ExternalAccount) WHERE a.id IN $ids
RETURN DISTINCT x.id AS id, x.bank_id AS bank LIMIT $limit
""")

LAYER_CASES = cy("network_layer_cases", "Cases and their claim summaries over focus accounts", """
MATCH (c:Case)-[:CONCERNS]->(a:Account) WHERE a.id IN $ids
WITH c, collect(DISTINCT a.id) AS accounts
OPTIONAL MATCH (c)-[:HAS_CLAIM]->(cl:Claim)
RETURN c.id AS id, c.title AS title, c.status AS status, accounts,
       collect(DISTINCT {id:cl.id, kind:cl.kind, state:cl.state}) AS claims
""")


@router.get("/layers")
def layers(limit: int = 220):
    """Three planes for the 3D view: each bank's own slice (with the external stubs that wall
    it in), the consortium where the slices join, and the cases and claims on top."""
    ids = [r["id"] for r in db.ro(db.CONSORTIUM, FOCUS_CASES, {"case": None, "limit": limit})]
    if len(ids) < 40:
        ids += [r["id"] for r in db.ro(db.CONSORTIUM, FOCUS_TOP, {"limit": 80})
                if r["id"] not in ids]
    cons_nodes = db.ro(db.CONSORTIUM, CONS_NODES, {"ids": ids})
    cons_edges = db.ro(db.CONSORTIUM, CONS_EDGES, {"ids": ids})
    banks = sorted({n["bank"] for n in cons_nodes if n["bank"]})
    bank_edges, externals = [], []
    for b in banks:
        g = db.bank_graph(b)
        if g not in db.list_graphs():
            continue
        own = [n["id"] for n in cons_nodes if n["bank"] == b]
        for e in db.ro(g, BANK_EDGES, {"ids": own}):
            bank_edges.append({**e, "bank": b})
        for x in db.ro(g, LAYER_EXTERNAL, {"ids": own, "limit": 40}):
            externals.append({"id": x["id"], "seen_by": b, "bank": x["bank"]})
    cases = db.ro(db.CONSORTIUM, LAYER_CASES, {"ids": ids})
    for c in cases:
        c["claims"] = [x for x in c["claims"] if x.get("id")]
    return {"banks": banks, "accounts": cons_nodes, "consortium_edges": cons_edges,
            "bank_edges": bank_edges, "externals": externals, "cases": cases,
            "cypher": [FOCUS_CASES, CONS_NODES, CONS_EDGES, BANK_EDGES, LAYER_EXTERNAL, LAYER_CASES]}
