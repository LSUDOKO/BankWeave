# 05 — FalkorDB Verified Reference

Everything here was checked against docs.falkordb.com on **Oct 16 2026**, except items marked
**VERIFY**. Procedure names are **case-sensitive** and inconsistent in style — copy them exactly.

## 5.1 Native graph algorithms

| Algorithm | Exact call | Yields | BankWeave job |
|---|---|---|---|
| BFS | `CALL algo.bfs(start_node, max_depth, relationship)` (relationship may be `null`) | `nodes, edges` | Triage neighborhood expansion |
| Shortest path (point-to-point) | `CALL algo.SPpaths({sourceNode, targetNode, relTypes, weightProp, costProp?, maxCost?, maxLen?, relDirection?, pathCount?})` | `path, pathWeight, pathCost` | Evidence path for each claim; `pathCount: 0` = all shortest |
| Shortest paths (single source) | `CALL algo.SSpaths({...same config, no targetNode})` | `path, pathWeight, pathCost` | "Where can money from X reach?" |
| A* | VERIFY (`docs.falkordb.com/algorithms/astar`) | | Optional: weighted route search |
| Min spanning forest | `CALL algo.MSF(config)` | `edges, nodes` (VERIFY exact yield names) | Simplify a big ring to its backbone for UI |
| PageRank | `CALL algo.pageRank(label, relationshipType)` (either may be `null`) | `node, score` | Collection hub where money pools |
| Betweenness | `CALL algo.betweenness({nodeLabels, relationshipTypes, samplingSize, samplingSeed})` | `node, score` | Mule bridges between groups. **Set `samplingSeed` for reproducible demos.** |
| Harmonic centrality | `CALL algo.HarmonicCentrality({nodeLabels, relationshipTypes})` | `node, score, reachable` | Orchestrator candidates (closeness substitute) |
| WCC | `CALL algo.wcc({nodeLabels, relationshipTypes})` | `node, componentId` | Islands → instant triage clears |
| Label propagation (CDLP) | `CALL algo.labelPropagation({nodeLabels, relationshipTypes, maxIterations})` | `node, communityId` | Candidate rings |
| Max flow | `CALL algo.maxFlow({sourceNodes, targetNodes, relationshipTypes, capacityProperty, nodeLabels})` | `nodes, edges, edgeFlows, maxFlow` | "Money at risk": max value movable source→hub. `capacityProperty` default `'capacity'` (we store `capacity` on `TRANSFERS`) |

### Notes and gotchas
- `algo.SPpaths` returns nothing (no error) if no path exists. `relDirection` defaults to
  `outgoing`; use `'both'` for undirected exploration.
- `weightProp` is minimized; `costProp` is a *constraint* (with `maxCost`).
- Most algorithms accept `nodeLabels` / `relationshipTypes` to restrict to a subgraph. Use this
  to run on `Account` + `TRANSFERS` only.
- Algorithms run on the **whole graph** (or label-filtered subset). For per-case scoring, run on
  the `case_<id>` graph after copying the case subgraph into it, or filter results afterwards.
- `maxFlow` yields an **Integer** total — amounts are floats, so scale (e.g. cents) into
  an integer `capacity` property if results look truncated. VERIFY behavior with floats.

### NOT native — do in Cypher, and say so honestly
| Want | Cypher approach |
|---|---|
| Degree | `MATCH (a:Account) RETURN a.id, size((a)-[:TRANSFERS]->()) AS out` or precompute `in_deg/out_deg` in the loader |
| Cycles (SCC-like) | `MATCH p=(a:Account)-[:TRANSFERS*2..6]->(a) RETURN p LIMIT 50` |
| Triangles / 3-cycles | `MATCH (u)-[:TRANSFERS]->(v)-[:TRANSFERS]->(w)-[:TRANSFERS]->(u) RETURN v, count(*)` |
| All paths | variable-length `MATCH p=(a)-[:TRANSFERS*1..k]->(b)` (bound `k`!) or `SPpaths` with `pathCount: 0` |
| Closeness | use `algo.HarmonicCentrality` instead |

## 5.2 Indexes

- Three index types: **range**, **full-text**, **vector** (HNSW, cosine or euclidean, 1–4096 dims).
- Full-text create (procedure syntax):
  `CALL db.idx.fulltext.createNodeIndex('Person', {field: 'name', phonetic: 'dm:en'})`
  Options include `language`, `stopwords`.
- Full-text query: `CALL db.idx.fulltext.queryNodes('Person', 'jon smyth') YIELD node, score`
- Vector query: `CALL db.idx.vector.queryNodes('Account', 'behavior_vec', 10, vecf32($vec)) YIELD node, score`
- Vector create DDL: VERIFY exact syntax in `docs.falkordb.com/cypher/indexing/vector-index`.
- Check index use: `graph.explain("...")` shows `ProcedureCall | db.idx...`.

## 5.3 Multigraph

- Each graph is addressed by name: `db.select_graph('bank_017')` in Python;
  `GRAPH.QUERY bank_017 "MATCH ..."` in raw Redis protocol.
- One instance can host thousands of isolated graphs. No cross-graph edges — link by id.
- List graphs: `db.list_graphs()` (Python client). VERIFY.

## 5.4 Python client basics

```python
from falkordb import FalkorDB
db = FalkorDB(host="localhost", port=6379)
g = db.select_graph("consortium")
res = g.query("MATCH (a:Account {id:$id}) RETURN a", {"id": acc_id})
for row in res.result_set: ...
ro = g.ro_query("MATCH ...")      # read-only query helper (VERIFY name in current client)
```

## 5.5 Pub/sub

FalkorDB speaks the Redis protocol. Use a standard `redis` client on the same host/port:
`PUBLISH bw:events:<topic> <json>` and subscribe in the FastAPI WS bridge. VERIFY that FalkorDB
Cloud permits PUBLISH/SUBSCRIBE; if not, run a small Redis container for events.

## 5.6 Ecosystem tools

| Tool | What it actually is | BankWeave use |
|---|---|---|
| FalkorDB MCP Server (`FalkorDB/FalkorDB-MCPServer`) | MCP server connecting LLM clients to FalkorDB (query, list graphs, etc.) | Read-only raw Cypher tool for agents + Claude Desktop demo. Our own MCP server exposes the curated tools. |
| GraphRAG-SDK (`pip install "graphrag-sdk[litellm,pdf]"`) | Ingests text/Markdown/PDF with schema-guided extraction; hybrid retrieval (vector + full-text + Cypher + relationship expansion); `MENTIONED_IN` provenance edges; supports grounded answers with abstention; incremental re-sync | Typology knowledge base with cited answers |
| Graphiti (`graphiti_core`, `FalkorDriver`) | Temporal knowledge graph for agent memory; bi-temporal facts with automatic invalidation | Ownership-over-time facts; case memory |
| QueryWeaver | **Text-to-SQL** (Postgres/MySQL/Snowflake) using a FalkorDB graph of the schema; REST + MCP tools (`list_databases`, `connect_database`, `database_schema`, `query_database`) | English questions over the KYC Postgres table |
| FalkorDB Browser | Web UI (port 3000 in the image) to run queries and visualize | Second screen in demo |
| Cognee | Alternative memory framework | **Not used** (redundant with Graphiti; would look like padding) |

Graphiti + FalkorDB driver snippet (from Graphiti README):

```python
from graphiti_core import Graphiti
from graphiti_core.driver.falkordb_driver import FalkorDriver
driver = FalkorDriver(host="localhost", port=6379, database="graphiti_mem")
graphiti = Graphiti(graph_driver=driver)
```

## 5.7 Claims we may and may not make

- ✅ "Multi-tenant: 10,000+ isolated graphs in one instance" (FalkorDB marketing/docs).
- ✅ "FalkorDB's published benchmark reports P99 latency of 83 ms vs ~41 s" — **label as vendor benchmark**.
- ✅ "Algorithms run inside the database via `CALL algo.*`."
- ❌ Do not claim native closeness/degree/SCC/triangle procedures.
- ❌ Do not claim QueryWeaver generates Cypher.
- ❌ Do not repeat unverified claims (e.g. "rewritten in Rust v6.0") seen in other notes.
