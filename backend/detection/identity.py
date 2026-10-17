"""Identity & behaviour: phonetic names (full-text), behaviour vectors (HNSW), cross-bank links.

All three live in one FalkorDB engine next to the transaction graph.
"""
from __future__ import annotations

import re

from app import db
from app.cypher import cy

RESOLVE = cy("identity_resolve_phonetic", "Phonetic (Double Metaphone) name candidates", """
CALL db.idx.fulltext.queryNodes($label, $query) YIELD node, score
OPTIONAL MATCH (node)-[:OWNS]->(a:Account)
RETURN node.id AS person, node.name AS name, score,
       collect(DISTINCT a.id) AS accounts, collect(DISTINCT a.bank_id) AS banks
ORDER BY score DESC LIMIT $k
""")

BEHAVIOR = cy("identity_behavior_neighbors", "Accounts whose behaviour vector is closest (HNSW)", """
MATCH (a:Account {id:$id})
CALL db.idx.vector.queryNodes('Account', 'behavior_vec', $k, a.behavior_vec)
YIELD node, score
WHERE node.id <> $id
RETURN node.id AS account, node.bank_id AS bank, score
ORDER BY score ASC
""")

CROSS_BANK = cy("identity_cross_bank_links", "Counterparties of an account held at other banks", """
MATCH (a:Account {id:$id})-[t:TRANSFERS]-(b:Account)
WHERE b.bank_id <> a.bank_id
RETURN b.id AS account, b.bank_id AS bank, count(t) AS transfers, sum(t.amount) AS volume
ORDER BY volume DESC LIMIT 25
""")

SHARED_CONTEXT = cy("identity_shared_attr_context", "How widely shared is each identity attribute", """
MATCH (a:Account {id:$id})-[r:USES_DEVICE|USES_IP|REGISTERED_AT]->(x)
RETURN labels(x)[0] AS kind, x.id AS attr, x.shared_count AS shared,
       coalesce(x.units, 1) AS units, coalesce(x.text, '') AS text
ORDER BY shared DESC
""")

SAME_OWNER = cy("identity_owner_of", "Owner identities of an account", """
MATCH (p)-[o:OWNS]->(a:Account {id:$id})
RETURN p.id AS person, p.name AS name, labels(p)[0] AS kind
""")


def _ft_query(name: str) -> str:
    # OR the tokens so "Jon Smyth" matches "John Smith"; strip RediSearch syntax chars
    toks = [t for t in re.split(r"[^\w]+", name) if t]
    return "|".join(toks) if toks else "*"


def resolve_entity(graph: str, name: str, k: int = 10, label: str = "Person") -> dict:
    if label not in ("Person", "Company"):
        raise ValueError("label must be Person or Company")
    p = {"label": label, "query": _ft_query(name), "k": k}
    return {"result": db.ro(graph, RESOLVE, p), "cypher": RESOLVE, "params": p}


def behavior_neighbors(graph: str, account_id: str, k: int = 10) -> dict:
    p = {"id": account_id, "k": k + 1}
    return {"result": db.ro(graph, BEHAVIOR, p), "cypher": BEHAVIOR, "params": p}


def cross_bank_links(graph: str, account_id: str) -> dict:
    p = {"id": account_id}
    return {"result": db.ro(graph, CROSS_BANK, p), "cypher": CROSS_BANK, "params": p}


def shared_attr_context(graph: str, account_id: str) -> dict:
    p = {"id": account_id}
    return {"result": db.ro(graph, SHARED_CONTEXT, p), "cypher": SHARED_CONTEXT, "params": p}


def owners(graph: str, account_id: str) -> dict:
    p = {"id": account_id}
    return {"result": db.ro(graph, SAME_OWNER, p), "cypher": SAME_OWNER, "params": p}
