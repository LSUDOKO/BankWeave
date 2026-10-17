"""Typology knowledge graph in FalkorDB (graph `typology_kb`) with cited answers.

(:Typology {id,name})-[:DESCRIBED_IN]->(:Chunk {id,text,source})  + (:Indicator) nodes.
kb_query = full-text retrieval over chunks; it abstains when no chunk scores high enough,
so agents never get an uncited answer. GraphRAG-SDK can replace ingestion when an LLM key
is configured; the query contract (answer + chunk ids) stays the same.
"""
from __future__ import annotations

import re

from app import db
from app.config import ROOT
from app.cypher import cy

G = db.TYPOLOGY_KB
DETECTOR_TO_TYPOLOGY = {"circular_flow": "cycle", "fan_out": "fan-out", "fan_in": "fan-in",
                        "structuring": "structuring", "rapid_passthrough": "pass-through",
                        "passthrough": "pass-through", "shared_attr": "shared-identity"}

WRITE = cy("kb_write_typology", "Write a typology, its source chunk and indicators", """
MERGE (t:Typology {id:$id}) SET t.name = $name
MERGE (c:Chunk {id:$chunk}) SET c.text = $text, c.sources = $sources, c.title = $name
MERGE (t)-[:DESCRIBED_IN]->(c)
WITH t
UNWIND $indicators AS ind
MERGE (i:Indicator {text:ind})
MERGE (t)-[:HAS_INDICATOR]->(i)
""")

SEARCH = cy("kb_search_chunks", "Full-text search over typology guidance", """
CALL db.idx.fulltext.queryNodes('Chunk', $q) YIELD node, score
MATCH (t:Typology)-[:DESCRIBED_IN]->(node)
RETURN t.id AS typology, t.name AS name, node.id AS chunk, node.text AS text,
       node.sources AS sources, score
ORDER BY score DESC LIMIT $k
""")

GET = cy("kb_get_typology", "One typology with its chunk and indicators", """
MATCH (t:Typology {id:$id})-[:DESCRIBED_IN]->(c:Chunk)
OPTIONAL MATCH (t)-[:HAS_INDICATOR]->(i:Indicator)
RETURN t.id AS id, t.name AS name, c.id AS chunk, c.text AS text, c.sources AS sources,
       collect(i.text) AS indicators
""")


def build() -> dict:
    db.drop_graph(G)
    text = (ROOT / "data" / "kb" / "typologies.md").read_text()
    n = 0
    for block in re.split(r"\n## ", "\n" + text)[1:]:
        head, *body = block.strip().splitlines()
        tid, name = [x.strip() for x in head.split("|", 1)]
        src = next((line[len("Sources:"):].strip() for line in body if line.startswith("Sources:")), "")
        prose = " ".join(line.strip() for line in body if not line.startswith("Sources:"))
        ind = re.search(r"Indicators?:(.*)", prose)
        indicators = [x.strip(" .") for x in ind.group(1).split(";")] if ind else []
        db.q(G, WRITE, {"id": tid, "name": name, "chunk": f"doc:{tid}:0", "text": prose,
                        "sources": src, "indicators": indicators})
        n += 1
    # English stemming so "returns"/"returning" match "return"
    db.try_query(G, "CALL db.idx.fulltext.createNodeIndex({label:'Chunk', language:'English'}, "
                    "'text', 'title')")
    db.try_query(G, "CREATE INDEX FOR (t:Typology) ON (t.id)")
    return {"typologies": n}


STOP = {"the", "and", "for", "with", "that", "this", "what", "which", "into", "from", "are",
        "was", "were", "has", "have", "does", "how", "who", "when", "where", "why", "its",
        "account", "accounts", "money", "funds", "transfer", "transfers"}


def _terms(question: str) -> list[str]:
    return sorted({t for t in re.split(r"[^\w]+", question.lower())
                   if len(t) > 2 and t not in STOP})


def kb_query(question: str, k: int = 3, min_score: float = 1.5) -> dict:
    """Grounded retrieval: cited chunks, or an explicit abstention.

    Each term is searched separately and scores are summed per chunk (FalkorDB full-text,
    English stemming). Generic words are dropped so they can't produce a confident match.
    """
    if G not in db.list_graphs():
        build()
    agg: dict[str, dict] = {}
    for term in _terms(question):
        for r in db.ro(G, SEARCH, {"q": term, "k": 10}):
            a = agg.setdefault(r["chunk"], {**r, "score": 0.0, "terms": []})
            a["score"] += r["score"]
            a["terms"].append(term)
    hits = sorted((h for h in agg.values() if h["score"] >= min_score),
                  key=lambda h: -h["score"])[:k]
    if not hits:
        return {"answer": None, "abstained": True, "citations": [], "cypher": SEARCH}
    return {"answer": hits[0]["text"], "abstained": False, "cypher": SEARCH,
            "citations": [{"chunk": h["chunk"], "typology": h["typology"], "name": h["name"],
                           "sources": h["sources"], "score": round(h["score"], 3),
                           "matched": h["terms"]} for h in hits]}


def typology(tid: str) -> dict | None:
    if G not in db.list_graphs():
        build()
    rows = db.ro(G, GET, {"id": tid})
    return rows[0] if rows else None


if __name__ == "__main__":
    print(build())
    print(kb_query("money returns to the origin account through a loop"))
