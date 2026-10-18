"""FalkorDB Lab: inspect every graph, run every algorithm and index, profile any read query,
explore the MCP tools, and try the advanced engine features (UDFs, tri-modal query, ACLs)."""
from __future__ import annotations

import json
import secrets
import time

import redis
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents import tools
from app import db
from app.config import get_settings
from app.cypher import cy
from app.services import engine, udf
from detection import algorithms as A

router = APIRouter(prefix="/lab", tags=["lab"])

PHONETIC = cy("lab_fulltext_phonetic", "Double Metaphone full-text name search", """
CALL db.idx.fulltext.queryNodes('Person', $q) YIELD node, score
RETURN node.name AS name, node.id AS person, score ORDER BY score DESC LIMIT 10
""")

STEMMED = cy("lab_fulltext_stemmed", "English-stemmed full-text search over typology knowledge", """
CALL db.idx.fulltext.queryNodes('Chunk', $q) YIELD node, score
RETURN node.id AS chunk, substring(node.text, 0, 160) AS text, node.sources AS sources, score
ORDER BY score DESC LIMIT 5
""")

VECTOR = cy("lab_vector_knn", "HNSW vector KNN over 16-dim behaviour profiles", """
MATCH (a:Account {id:$id})
CALL db.idx.vector.queryNodes('Account', 'behavior_vec', $k, a.behavior_vec) YIELD node, score
RETURN node.id AS account, node.bank_id AS bank, score ORDER BY score
""")

UDF_REACH = cy("lab_udf_time_respecting_reach", "JS UDF: time-respecting reach from an account", """
MATCH (a:Account {id:$id})
WITH a, aml_temporal.timeRespectingReach(a, $hops, $window) AS reach
UNWIND reach AS r
RETURN r.account AS account, r.bank AS bank, r.hops AS hops, r.arrived AS arrived,
       r.amount AS amount, r.back_to_start AS back_to_start
ORDER BY hops, arrived LIMIT 50
""")

FLEX_NAMES = cy("lab_flex_name_similarity", "FLEX: Levenshtein and Jaro-Winkler name similarity", """
MATCH (p:Person)
WITH p, flex.text.jaroWinkler(toLower(p.name), toLower($q)) AS jw
WHERE jw > 0.85
RETURN p.name AS name, jw, flex.text.levenshtein(toLower(p.name), toLower($q)) AS edits
ORDER BY jw DESC LIMIT 10
""")

FLEX_JACCARD = cy("lab_flex_attribute_jaccard", "FLEX: Jaccard overlap of two accounts' identity attributes", """
MATCH (a:Account)-[:USES_DEVICE|USES_IP|REGISTERED_AT]->(x)<-[:USES_DEVICE|USES_IP|REGISTERED_AT]-(b:Account)
WHERE a.id < b.id
WITH a, b, count(DISTINCT x) AS shared LIMIT 200
MATCH (a)-[:USES_DEVICE|USES_IP|REGISTERED_AT]->(xa)
WITH a, b, shared, collect(DISTINCT xa.id) AS sa
MATCH (b)-[:USES_DEVICE|USES_IP|REGISTERED_AT]->(xb)
WITH a, b, shared, sa, collect(DISTINCT xb.id) AS sb
RETURN a.id AS a, b.id AS b, shared, flex.sim.jaccard(sa, sb) AS jaccard
ORDER BY jaccard DESC, shared DESC LIMIT 10
""")

TRIMODAL = cy("lab_trimodal_single_pass", "One query: full-text name, vector twins, shortest path", """
CALL db.idx.fulltext.queryNodes('Person', $name) YIELD node AS p, score AS text_score
WITH p, text_score ORDER BY text_score DESC LIMIT 1
MATCH (p)-[:OWNS]->(seed:Account)
WITH p, text_score, seed LIMIT 1
CALL db.idx.vector.queryNodes('Account', 'behavior_vec', $k, seed.behavior_vec)
YIELD node AS twin, score AS vec_score
WITH p, text_score, seed, twin, vec_score WHERE twin <> seed
CALL algo.SPpaths({sourceNode:seed, targetNode:twin, relTypes:['FLOWS'],
                   maxLen:$flow_hops, pathCount:1, relDirection:'both'})
YIELD path, pathWeight
RETURN p.name AS matched_name, text_score, seed.id AS seed, seed.bank_id AS seed_bank,
       twin.id AS twin, twin.bank_id AS twin_bank, vec_score,
       [n IN nodes(path) | n.id] AS path, pathWeight AS hops
ORDER BY vec_score LIMIT 5
""")

TOP = cy("lab_top_accounts", "Top accounts by PageRank in a graph (default parameters)", """
CALL algo.pageRank('Account', 'TRANSFERS') YIELD node, score
RETURN node.id AS id ORDER BY score DESC LIMIT $n
""")


def _top(graph: str, n: int = 3) -> list[str]:
    return [r["id"] for r in db.ro(graph, TOP, {"n": n}, timeout=8000)]


SENDER = cy("lab_busiest_sender", "Account with the most outgoing transfers (default source)", """
MATCH (a:Account)-[t:TRANSFERS]->(:Account)
RETURN a.id AS id, count(t) AS n ORDER BY n DESC LIMIT 1
""")

FLOW_PAIR = cy("lab_flow_pair", "A source and sink joined by a multi-hop FLOWS chain", """
MATCH p = (s:Account)-[:FLOWS*2..3]->(t:Account) WHERE s <> t
RETURN s.id AS src, t.id AS dst, length(p) AS hops ORDER BY hops DESC LIMIT 1
""")


def _sender(graph: str) -> str:
    rows = db.ro(graph, SENDER, timeout=8000)
    return rows[0]["id"] if rows else _top(graph, 1)[0]


def _flow_pair(graph: str) -> dict:
    rows = db.ro(graph, FLOW_PAIR, timeout=8000)
    if not rows:
        t = _top(graph, 3)
        return {"sources": t[1:3], "targets": t[:1]}
    return {"sources": [rows[0]["src"]], "targets": [rows[0]["dst"]]}


# key -> (family, title, cypher, default-param builder, default graph)
ALGOS: dict[str, tuple] = {
    "wcc": ("algorithm", "Weakly connected components", A.WCC, lambda g: {}, "consortium"),
    "labelPropagation": ("algorithm", "Label propagation communities", A.LABEL_PROP,
                         lambda g: {"iters": 10, "min_size": 3, "max_size": 60, "limit": 10}, "consortium"),
    "pageRank": ("algorithm", "PageRank hubs", A.PAGERANK, lambda g: {"k": 10}, "consortium"),
    "betweenness": ("algorithm", "Betweenness bridges (sampled)", A.BETWEENNESS,
                    lambda g: {"samples": 64, "seed": 42, "k": 10}, "consortium"),
    "harmonic": ("algorithm", "Harmonic centrality", A.HARMONIC, lambda g: {"k": 10}, "case"),
    "SPpaths": ("algorithm", "Shortest money paths", A.SPPATHS,
                lambda g: dict(zip(("src", "dst"), _top(g, 2)), max_len=4, path_count=3,
                               direction="both"), "case"),
    "SSpaths": ("algorithm", "Single-source reach", A.SSPATHS,
                lambda g: {"src": _sender(g), "max_len": 3, "limit": 20}, "case"),
    "maxFlow": ("algorithm", "Max flow (money at risk)", A.MAXFLOW,
                _flow_pair, "case"),
    "bfs": ("algorithm", "Breadth-first reach", A.BFS,
            lambda g: {"id": _sender(g), "depth": 2}, "case"),
    "MSF": ("algorithm", "Minimum spanning forest backbone", A.MSF, lambda g: {}, "case"),
    "phonetic": ("index", "Full-text, Double Metaphone", PHONETIC, lambda g: {"q": "Hana Sharma"}, "consortium"),
    "stemming": ("index", "Full-text, English stemming", STEMMED,
                 lambda g: {"q": "splits amount thresholds"}, "typology_kb"),
    "vector": ("index", "Vector KNN (HNSW, cosine)", VECTOR,
               lambda g: {"id": _top(g, 1)[0], "k": 6}, "consortium"),
    "udf_reach": ("udf", "JS UDF aml_temporal.timeRespectingReach", UDF_REACH,
                  lambda g: {"id": _sender(g), "hops": 4, "window": 7 * 86400}, "consortium"),
    "flex_names": ("udf", "FLEX jaroWinkler + levenshtein", FLEX_NAMES,
                   lambda g: {"q": "Jon Smyth"}, "consortium"),
    "flex_jaccard": ("udf", "FLEX sim.jaccard over identity attributes", FLEX_JACCARD,
                     lambda g: {}, "consortium"),
    "trimodal": ("query", "Tri-modal: full-text + vector + SPpaths in one query", TRIMODAL,
                 lambda g: {"name": "Lucia Okafor", "k": 25, "flow_hops": 4}, "consortium"),
}


def _clamp(params: dict, graph: str) -> None:
    """algo.SPpaths/SSpaths/bfs are not interrupted by the query timeout, and undirected
    paths on the full consortium explode, so bound depth and direction server-side."""
    big = not db.is_case_graph(graph)
    # FLOWS has one edge per account pair, so undirected paths over it stay small
    for k, cap in (("max_len", 3 if big else 5), ("depth", 2 if big else 4), ("hops", 5),
                   ("flow_hops", 4),
                   ("path_count", 5), ("k", 25), ("limit", 50)):
        if k in params:
            params[k] = max(1, min(int(params[k]), cap))
    if big and params.get("direction") == "both":
        params["direction"] = "outgoing"


def _resolve_graph(kind: str, graph: str | None) -> str:
    if graph:
        if graph not in db.list_graphs():
            raise HTTPException(404, f"graph {graph} does not exist")
        return graph
    if kind == "case":
        cases = db.case_graphs()
        if not cases:
            return db.CONSORTIUM
        # prefer the case with the most accounts
        return max(cases, key=lambda g: db.ro(g, "MATCH (a:Account) RETURN count(a) AS n")[0]["n"])
    return db.TYPOLOGY_KB if kind == "typology_kb" else db.CONSORTIUM


def _counts(g: str) -> dict:
    try:
        n = db.ro(g, "MATCH (n) RETURN count(n) AS n", timeout=3000)[0]["n"]
        e = db.ro(g, "MATCH ()-[e]->() RETURN count(e) AS n", timeout=3000)[0]["n"]
        labels = [r["label"] for r in db.ro(g, "CALL db.labels() YIELD label RETURN label")]
        rels = [r["t"] for r in db.ro(g, "CALL db.relationshipTypes() YIELD relationshipType AS t RETURN t")]
        idx = db.ro(g, "CALL db.indexes() YIELD label, properties, types, entitytype "
                       "RETURN label, properties, types, entitytype")
        return {"nodes": n, "edges": e, "labels": labels, "relationships": rels, "indexes": idx}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)[:160]}


def _kind(g: str) -> str:
    if db.is_case_graph(g):
        return "case"
    if g == db.CONSORTIUM:
        return "consortium"
    if g.startswith(db.PREFIX + "bank_"):
        return "bank"
    return "system"


@router.get("/graphs")
def graphs(include_cases: bool = True):
    def one(g):
        mem = engine.memory(g)
        return {"name": g, "kind": _kind(g), **_counts(g),
                "memory_mb": mem.get("total_graph_sz_mb"), "index_mb": mem.get("indices_sz_mb")}
    from concurrent.futures import ThreadPoolExecutor
    names = [g for g in sorted(db.list_graphs()) if include_cases or not db.is_case_graph(g)]
    with ThreadPoolExecutor(8) as ex:
        out = list(ex.map(one, names))
    order = {"consortium": 0, "bank": 1, "system": 2, "case": 3}
    out.sort(key=lambda g: (order[g["kind"]], g["name"]))
    return {"graphs": out}


@router.get("/graphs/{name}/memory")
def graph_memory(name: str):
    return engine.memory(name)


@router.get("/algorithms")
def algorithms():
    return {"algorithms": [{"key": k, "family": f, "title": t, "cypher": c, "default_graph": dg}
                           for k, (f, t, c, _, dg) in ALGOS.items()]}


class Run(BaseModel):
    key: str
    graph: str | None = None
    params: dict | None = None


@router.post("/run")
def run(body: Run):
    if body.key not in ALGOS:
        raise HTTPException(404, "unknown algorithm")
    family, title, cypher, defaults, dg = ALGOS[body.key]
    g = _resolve_graph(dg, body.graph)
    if family == "udf":
        udf.ensure()
    try:
        params = {**defaults(g), **(body.params or {})}
    except (IndexError, KeyError) as exc:
        raise HTTPException(400, f"{g} has no accounts to use as defaults") from exc
    _clamp(params, g)
    t = time.perf_counter()
    try:
        rows = db.ro(g, cypher, params, timeout=10000)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"{title} failed on {g}: {str(exc)[:200]}") from exc
    ms = round((time.perf_counter() - t) * 1000, 2)
    return {"key": body.key, "title": title, "family": family, "graph": g, "cypher": cypher,
            "params": params, "rows": json.loads(json.dumps(rows[:50], default=str)),
            "row_count": len(rows), "ms": ms}


class Inspect(BaseModel):
    graph: str
    cypher: str
    params: dict | None = None
    mode: str = "profile"


@router.post("/inspect")
def inspect(body: Inspect):
    if body.graph not in db.list_graphs():
        raise HTTPException(404, "unknown graph")
    if len(body.cypher) > 4000:
        raise HTTPException(400, "query too long")
    try:
        return engine.xray(body.graph, body.cypher, body.params,
                           "explain" if body.mode == "explain" else "profile")
    except engine.NotReadOnly as exc:
        raise HTTPException(403, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, str(exc)[:300]) from exc


# tools that change graph state even without recording evidence
MUTATING = {"invalidate_evidence"}


def _schema(t) -> dict:
    py = {"str": "string", "int": "integer", "float": "number", "bool": "boolean",
          "list": "array", "dict": "object"}
    props, req = {}, []
    for p, (ann, required) in t.params.items():
        base = str(ann).split("[")[0].replace("typing.", "").split(" |")[0]
        props[p] = {"type": py.get(base, "string")}
        if required:
            req.append(p)
    return {"type": "object", "properties": props, "required": req}


@router.get("/tools")
def mcp_tools():
    out = []
    for t in tools.REGISTRY.values():
        mode = ("mutating" if t.name in MUTATING else
                "records evidence" if t.records else "read-only")
        out.append({"name": t.name, "description": t.description, "agents": list(t.agents),
                    "mode": mode, "input_schema": _schema(t)})
    out.append({"name": "cypher_readonly", "description": "Run a read-only Cypher query "
                "(FalkorDB rejects writes on ro_query)", "agents": ["mcp"], "mode": "read-only",
                "input_schema": {"type": "object", "properties": {"graph": {"type": "string"},
                                 "query": {"type": "string"}}, "required": ["graph", "query"]}})
    out.append({"name": "list_graphs", "description": "List FalkorDB graphs", "agents": ["mcp"],
                "mode": "read-only", "input_schema": {"type": "object", "properties": {}}})
    return {"count": len(out), "tools": out}


class ToolRun(BaseModel):
    name: str
    params: dict = {}
    graph: str | None = None
    case_id: str | None = None


@router.post("/tools/run")
def run_tool(body: ToolRun):
    """Runs a tool live without recording anything; mutating tools are refused here."""
    t0 = time.perf_counter()
    if body.name == "list_graphs":
        return {"result": sorted(db.list_graphs()), "cypher": "GRAPH.LIST", "ms": 0}
    if body.name == "cypher_readonly":
        g = body.params.get("graph", db.CONSORTIUM)
        rows = db.ro(g, body.params.get("query", "RETURN 1"), timeout=5000)
        return {"result": json.loads(json.dumps(rows[:200], default=str)),
                "cypher": body.params.get("query"), "ms": round((time.perf_counter() - t0) * 1000, 2)}
    if body.name not in tools.REGISTRY:
        raise HTTPException(404, "unknown tool")
    if body.name in MUTATING:
        raise HTTPException(403, f"{body.name} changes validity state; run it from a case page")
    ctx = tools.Ctx(graph=body.graph or db.CONSORTIUM, case_id=body.case_id, agent="analyst",
                    record=False)
    try:  # the tool function directly: nothing is logged to a case timeline
        res = tools.REGISTRY[body.name].fn(ctx, **body.params)
    except (TypeError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    return {**json.loads(json.dumps(res, default=str)),
            "ms": round((time.perf_counter() - t0) * 1000, 2)}


@router.get("/udf")
def udf_list():
    return {"libraries": udf.listing()}


@router.post("/udf/load")
def udf_load():
    return {"results": [udf.load(n) for n in udf.LIBRARIES], "libraries": udf.listing()}


class AclDemo(BaseModel):
    bank: str = "001"


@router.post("/acl-demo")
def acl_demo(body: AclDemo):
    """Create a bank-scoped user that may read only its own bank graph, prove the consortium
    and other banks are denied, show ACL LOG, then delete the user."""
    s = get_settings()
    admin = db.get_db().connection
    own = db.bank_graph(body.bank)
    if own not in db.list_graphs():
        raise HTTPException(404, f"no graph for bank {body.bank}")
    user, pw = f"bw_bank_{body.bank}", secrets.token_urlsafe(16)
    rule = ["reset", "on", f">{pw}", f"~{own}", "+GRAPH.RO_QUERY", "+PING"]
    try:
        admin.execute_command("ACL", "SETUSER", user, *rule)
    except Exception as exc:  # noqa: BLE001
        return {"supported": False, "reason": str(exc)[:200],
                "note": "this FalkorDB user cannot manage ACLs (managed cloud tier); "
                        "run the demo against the Docker instance"}
    conn = redis.Redis(host=s.falkordb_host, port=s.falkordb_port, username=user, password=pw,
                       socket_timeout=5)
    others = [g for g in db.list_graphs() if g.startswith(db.PREFIX + "bank_") and g != own][:1]
    attempts = []
    for g in [own, db.CONSORTIUM, *others]:
        try:
            r = conn.execute_command("GRAPH.RO_QUERY", g, "MATCH (a:Account) RETURN count(a)")
            attempts.append({"graph": g, "allowed": True, "accounts": r[1][0][0]})
        except Exception as exc:  # noqa: BLE001
            attempts.append({"graph": g, "allowed": False, "error": str(exc)[:120]})
    try:
        conn.execute_command("GRAPH.QUERY", own, "CREATE (:Probe)")
        attempts.append({"graph": own, "write": True, "allowed": True})
    except Exception as exc:  # noqa: BLE001
        attempts.append({"graph": own, "write": True, "allowed": False, "error": str(exc)[:120]})
    conn.close()
    log = []
    for e in admin.execute_command("ACL", "LOG", "10"):
        e = {engine._s(k): engine._s(v) for k, v in (e.items() if isinstance(e, dict) else
                                                      zip(e[::2], e[1::2]))}
        if e.get("username") == user:
            log.append({k: e.get(k) for k in ("reason", "object", "context", "age-seconds")})
    admin.execute_command("ACL", "DELUSER", user)
    return {"supported": True, "user": user, "rule": ["on", f"~{own}", "+GRAPH.RO_QUERY", "+PING"],
            "attempts": attempts, "acl_log": log}


MEMORY = cy("lab_procedural_memory", "Procedures the Archivist learned, with their ordered steps", """
MATCH (p:Procedure)
OPTIONAL MATCH (p)-[r:STEP]->(s:Step)
OPTIONAL MATCH (s)-[:FAILED_BEFORE]->(x:Pitfall)
WITH p, r, s, collect(x.note) AS pitfalls ORDER BY r.order
RETURN p.id AS id, p.name AS name, p.typology AS typology, p.success_count AS success,
       p.fail_count AS fail, p.learned_from AS learned_from,
       collect({order:r.order, tool:s.tool, params:s.params_template, why:s.why,
                pitfalls:pitfalls}) AS steps
""")


@router.get("/memory")
def memory():
    """Procedural memory (the `procedures` graph) and episodic memory sizes per case."""
    procs = db.ro(db.PROCEDURES, MEMORY) if db.PROCEDURES in db.list_graphs() else []
    episodic = []
    for g in db.case_graphs()[:40]:
        n = db.ro(g, "MATCH (e:Event) RETURN count(e) AS n")[0]["n"]
        episodic.append({"case_id": db.case_id_of(g), "events": n})
    return {"procedures": procs, "episodic": sorted(episodic, key=lambda x: -x["events"]),
            "cypher": MEMORY}
