"""Copy an investigation subgraph into its own case_<id> graph.

Algorithms then run on the case only: results are local, fast and isolated per case
(FalkorDB multigraph = per-case memory).
"""
from __future__ import annotations

from app import db
from app.cypher import cy

SUBGRAPH_NODES = cy("case_copy_nodes", "Read accounts for a case subgraph", """
MATCH (a:Account) WHERE a.id IN $ids
RETURN a.id AS id, a.bank_id AS bank_id, a.in_deg AS in_deg, a.out_deg AS out_deg,
       coalesce(a.motif_score, 0.0) AS motif_score, coalesce(a.pagerank, 0.0) AS pagerank
""")

SUBGRAPH_EDGES = cy("case_copy_edges", "Read transfers among case accounts", """
MATCH (s:Account)-[t:TRANSFERS]->(d:Account)
WHERE s.id IN $ids AND d.id IN $ids
RETURN s.id AS s, d.id AS d, t.txn_id AS txn_id, t.ts AS ts, t.amount AS amount,
       t.amount_recv AS amount_recv, t.cur AS cur, t.cur_recv AS cur_recv,
       t.format AS format
""")

SUBGRAPH_ATTRS = cy("case_copy_identity", "Read identity attributes of case accounts", """
MATCH (a:Account)-[r:USES_DEVICE|USES_IP|REGISTERED_AT]->(x)
WHERE a.id IN $ids
RETURN a.id AS a, type(r) AS rel, labels(x)[0] AS label, x.id AS id,
       x.shared_count AS shared_count, coalesce(x.units, 1) AS units
""")

WRITE_NODES = cy("case_write_nodes", "Write accounts into a case graph", """
UNWIND $rows AS r
MERGE (a:Account {id:r.id})
SET a.bank_id = r.bank_id, a.in_deg = r.in_deg, a.out_deg = r.out_deg,
    a.motif_score = r.motif_score, a.pagerank_global = r.pagerank
""")

WRITE_EDGES = cy("case_write_edges", "Write transfers into a case graph", """
UNWIND $rows AS r
MATCH (s:Account {id:r.s}), (d:Account {id:r.d})
MERGE (s)-[t:TRANSFERS {txn_id:r.txn_id}]->(d)
SET t.ts = r.ts, t.amount = r.amount, t.amount_recv = r.amount_recv, t.cur = r.cur,
    t.cur_recv = r.cur_recv, t.format = r.format, t.capacity = r.amount
""")

WRITE_FLOWS = cy("case_write_flows", "Collapse case transfers into one FLOWS edge per pair", """
MATCH (s:Account)-[t:TRANSFERS]->(d:Account) WHERE s <> d
WITH s, d, sum(t.amount) AS cap, count(t) AS n
MERGE (s)-[f:FLOWS]->(d)
SET f.capacity = cap, f.n_txn = n
""")


def copy_to_case(source: str, account_ids: list[str], case_graph_name: str) -> dict:
    ids = sorted(set(account_ids))
    nodes = db.ro(source, SUBGRAPH_NODES, {"ids": ids})
    edges = db.ro(source, SUBGRAPH_EDGES, {"ids": ids})
    attrs = db.ro(source, SUBGRAPH_ATTRS, {"ids": ids})
    db.try_query(case_graph_name, "CREATE INDEX FOR (a:Account) ON (a.id)")
    db.q(case_graph_name, WRITE_NODES, {"rows": nodes})
    db.q(case_graph_name, WRITE_EDGES, {"rows": edges})
    db.q(case_graph_name, WRITE_FLOWS)
    for label in ("Device", "IP", "Address"):
        rows = [a for a in attrs if a["label"] == label]
        db.q(case_graph_name, f"""UNWIND $rows AS r MATCH (a:Account {{id:r.a}})
            MERGE (x:{label} {{id:r.id}}) SET x.shared_count = r.shared_count, x.units = r.units
            MERGE (a)-[:{'USES_DEVICE' if label == 'Device' else
                         'USES_IP' if label == 'IP' else 'REGISTERED_AT'}]->(x)""",
             {"rows": rows})
    return {"case_graph": case_graph_name, "accounts": len(nodes), "transfers": len(edges),
            "attributes": len(attrs)}
