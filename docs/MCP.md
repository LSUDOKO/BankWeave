# Use BankWeave from Claude (MCP)

BankWeave runs a hosted, **read-only** MCP server on the same service as the API:

```
https://bankweave-api.onrender.com/mcp
```

No key, no install. Any MCP client that speaks Streamable HTTP (Claude Code, Claude Desktop,
Cursor, the MCP Inspector) can point at it and investigate the live consortium graph on
FalkorDB Cloud: cases, echo-proof claims, cross-bank money paths, rings, triage decisions.

> The service is on Render's free plan and sleeps when idle. The first request after a quiet
> spell can take ~50 s while it wakes; after that, calls take 0.1 to 2 s.

## Install

**Claude Code**

```bash
claude mcp add --transport http bankweave https://bankweave-api.onrender.com/mcp
```

Then ask, for example: *"Use the bankweave tools to investigate case C-44c08392."*

**Claude Desktop** (Settings > Connectors > Add custom connector, URL
`https://bankweave-api.onrender.com/mcp`), or in `claude_desktop_config.json` through the
`mcp-remote` stdio bridge:

```json
{
  "mcpServers": {
    "bankweave": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://bankweave-api.onrender.com/mcp"]
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json` or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "bankweave": { "url": "https://bankweave-api.onrender.com/mcp" }
  }
}
```

**MCP Inspector**

```bash
npx @modelcontextprotocol/inspector   # transport: Streamable HTTP, URL as above
```

**Local stdio (no Node).** `backend/mcp_stdio.py` either bridges to the hosted endpoint or runs
the same tools directly against your own FalkorDB:

```bash
# bridge to the hosted server (needs nothing but the backend venv)
claude mcp add bankweave-local -- uv run --directory backend python mcp_stdio.py --remote

# run the tools in-process against FalkorDB (FALKORDB_HOST/PORT/USERNAME/PASSWORD in env or .env)
claude mcp add bankweave-direct -- uv run --directory backend python mcp_stdio.py
```

`python -m app.mcp_server --http 8765` (from `backend/`) serves the read-only server on its own.

## Guarantees

- **Read-only, twice.** Every tool reads through `GRAPH.RO_QUERY` (`db.ro`), so FalkorDB refuses
  any write. No tool calls a writing function: `explain_claim` recomputes the echo-proof score in
  memory instead of storing it. `run_readonly_cypher` also runs a guard first (below).
- **Provenance on every result.** Each tool returns `graph` (which FalkorDB graph it read),
  `cypher` (the exact query text, or a dict of them), `params` and `ms`.
- **Same queries as the product.** The tools import the queries the API routers, agents and
  detection modules already run (`app/routers/cases.py`, `detection/algorithms.py`,
  `trust/echo.py`, ...). Nothing is re-implemented for the MCP.
- **Bounded.** Row caps on every list (200 max), `trace_money_path` max 8 hops, graph names on an
  allowlist (`consortium`, `bank_<id>`, `case_<id>`, `typology_kb`).
- **Annotated.** Every tool carries `readOnlyHint: true`, `destructiveHint: false`.

The richer agent toolset, including tools that record evidence into a case, stays local:
`python -m mcp_server.server` (see the README). It is not hosted.

## Tools

| tool | what it answers | FalkorDB feature |
|---|---|---|
| `engine_overview` | FalkorDB version and memory, graphs by kind, consortium size, alert queue by status | `INFO memory`, `GRAPH.LIST`, aggregations |
| `list_graphs` | consortium, per-bank, per-case and KB graphs | `GRAPH.LIST` |
| `graph_schema(graph)` | labels, relationship types, property keys, indexes (RANGE / FULLTEXT / VECTOR) | `db.labels`, `db.relationshipTypes`, `db.propertyKeys`, `db.indexes` |
| `list_cases(limit)` | cases with status, seed, alert/account counts, banks, whether the case graph is loaded | `GRAPH.RO_QUERY` |
| `get_case(case_id)` | header, claims with naive vs echo-proof confidence, evidence with origin and state, actions with justifying claims, SAR status | one graph per case |
| `explain_claim(case_id, claim_id)` | paths vs **independent origins**, origin groups with multiplicity, unexplored origin kinds, the derived-claim/evidence chain with each item's Cypher | variable-length `DERIVED_FROM*0..5` traversal |
| `account_network(account_id, depth)` | scores (pagerank, motif, community, component size), shared device/IP/address, cases and alerts, counterparties at other banks, 1-2 hop neighbourhood and the banks it spans | bounded expansion over the consortium |
| `trace_money_path(src, dst, max_len, path_count, case_id?)` | shortest money paths with txn ids, amounts, the bank of every hop and the number of bank crossings | `algo.SPpaths` |
| `find_rings(account_id?, min_size, max_size, limit, graph)` | candidate rings, cross-bank first; or the ring containing one account | `algo.labelPropagation` |
| `top_hubs(top_k, graph)` | where money pools | `algo.pageRank` |
| `connected_components(limit, graph)` | largest components, banks per component, how many are tiny islands | `algo.wcc` |
| `similar_accounts(account_id, k)` | accounts that behave alike (cosine distance), with banks | HNSW vector index, `db.idx.vector.queryNodes` |
| `search_customers(name, label, k)` | fuzzy Person/Company name search with accounts and banks owned | full-text index, `db.idx.fulltext.queryNodes` |
| `list_alerts(status, limit)` | alert queue with counts by status | range index on `Alert.status` |
| `triage_alert(alert_id)` | why an alert was cleared or escalated: decision, recorded signals, and a live re-check of the account's component size and motif score against the triage thresholds | `algo.wcc` |
| `typology_guidance(question)` | laundering typology guidance with citations; abstains when nothing matches | full-text index on `typology_kb` |
| `run_readonly_cypher(cypher, graph, limit)` | last resort: your own read-only Cypher | `GRAPH.RO_QUERY`, 10 s timeout |

**The `run_readonly_cypher` guard**, on the query with string literals masked: one statement; no
comments and no `GRAPH.*`; no `CREATE`/`MERGE`/`SET`/`DELETE`/`DETACH`/`REMOVE`/`DROP`/`FOREACH`/
`LOAD CSV`; `CALL` only for `algo.*` and the `db.*` read and index-query procedures; `LIMIT`
appended when a `RETURN` has none; at most 200 rows returned. Then FalkorDB's own read-only
mode is the second wall.

## Resources and prompts

| resource | content |
|---|---|
| `bankweave://queries` | every named Cypher query the product runs (name, purpose, module, text) |
| `bankweave://schema/{graph}` | the live schema of one graph (same as `graph_schema`) |

| prompt | argument | steers to |
|---|---|---|
| `investigate_case` | `case_id` | `get_case` > `explain_claim` per claim behind an action > `account_network` + `trace_money_path` > `find_rings` / `similar_accounts` |
| `explain_ring` | `account_id` | `account_network` > `find_rings` > `trace_money_path` both ways > `typology_guidance`; what each bank alone would see |
| `review_triage` | `alert_id` | `triage_alert` > `account_network` > agree or disagree, with the numbers |

Rule baked into the server instructions and prompts: **a claim is not proven unless it has at
least two independent sources.** Many paths back to one origin count once.

## Example prompts

- *"Give me an overview of the BankWeave engine, then list the 5 newest cases."*
- *"Investigate case C-44c08392. Which claims behind the proposed action are independently corroborated?"*
- *"Explain claim CL-237a5887 in case C-64cbd23a: why is its confidence lower than its path count suggests?"*
- *"Is account 88c75b1808a4c341 in a cross-bank ring? Trace the money to e7237778524ec33a."*
- *"Why was alert AL-1A9F6E3D cleared? Do you agree?"*
- *"Find customers named Liam Khan and the banks they hold accounts at."*

## Transcript (real local run)

The backend ran locally with uvicorn against the FalkorDB Cloud instance (worker off), and the
`mcp` Python client SDK connected to `http://127.0.0.1:8791/mcp`. Output trimmed.

```text
initialize              -> server "bankweave" 1.0.0; 17 tools, 3 prompts,
                           resources bankweave://queries, bankweave://schema/{graph}

engine_overview         -> falkordb 4.22.0, memory 81.5/100 MB (noeviction)
                           graphs 36: 6 banks, 27 cases, consortium, procedures, typology_kb
                           consortium: 3024 accounts, 6 banks, 24990 transfers
                           alerts: 1208 (95 case, 1113 cleared)

get_case("C-44c08392")  -> "Large transfer by 88c75b, 10 accounts across 4 banks"
                           status awaiting_approval, banks 001/010/012/020
                           7 claims, 1 with >= 2 independent sources, 19 evidence (all active),
                           1 action, SAR published

explain_claim("C-64cbd23a", "CL-237a5887")
                        -> "Account e215eb is where funds in the structure pool (collection hub)"
                           paths 3, independent_sources 1
                           naive_confidence 0.593, echo_proof_confidence 0.259
                           verdict: NOT independently corroborated: all support traces to 1 origin(s)
                           origin algo:pagerank:C-64cbd23a:e215eb3d53820ba0 x3
                             (E-72328f91, E-2cb2d207, E-7f09cff6)

trace_money_path("88c75b1808a4c341", "e7237778524ec33a", case_id="C-44c08392")
                        -> 1 path: 88c75b1808a4c341 -> e7237778524ec33a, txn t4126, 5851.21,
                           banks 010 -> 012, bank_crossings 1
                           cypher: MATCH (s:Account {id:$src}), (d:Account {id:$dst})
                                   CALL algo.SPpaths({sourceNode:s, targetNode:d, ...})

find_rings(account_id="88c75b1808a4c341")
                        -> community 63: 11 accounts across banks 010, 012, 020, 001

triage_alert("AL-1A9F6E3D")
                        -> cleared: "no strong laundering structure (score 0.962,
                           alert-budget cutoff 0.995)"
                           live algo.wcc: component 120, size 6, 3 banks
                           island rule: size 6 >= 3, connected, needs graph evidence

run_readonly_cypher("MATCH (a:Account) RETURN a.bank_id AS bank, count(a) AS n ORDER BY n DESC", limit=5)
                        -> 012: 760, 010: 687, 001: 634, 003: 507, 020: 432
                           ran: ... ORDER BY n DESC LIMIT 5   (185 ms)

run_readonly_cypher("MATCH (a:Account) SET a.x = 1 RETURN a")
                        -> is_error: read-only: write clauses are not allowed
```

All 17 tools answered in 0.1 to 1.5 s from a laptop in India to FalkorDB Cloud (ap-south-1);
FalkorDB memory was the same before and after the run (nothing written).

## How it is wired

- `backend/app/mcp_server.py`: the `MCPServer` (official `mcp` Python SDK v2, the successor of
  FastMCP), tools, resources and prompts.
- `backend/app/main.py`: the server's Streamable HTTP route is added to the FastAPI app at
  `/mcp` (stateless, JSON responses) and its session manager runs inside the FastAPI lifespan.
  CORS and `/health` are unchanged.
- `backend/mcp_stdio.py`: stdio entry, direct or `--remote` bridge.
