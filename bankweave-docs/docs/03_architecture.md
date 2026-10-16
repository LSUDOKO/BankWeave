# 03 — Architecture

## Component diagram

```
                       ┌───────────────────────────────────────────────┐
                       │                 Next.js frontend              │
                       │ Alert queue · Live graph (Sigma.js) · Case    │
                       │ workspace · SAR viewer · Trust panel ·        │
                       │ Scoreboard · Demo modes                       │
                       └───────────────▲──────────────┬────────────────┘
                              WebSocket│              │REST
                       ┌───────────────┴──────────────▼────────────────┐
                       │               FastAPI backend                 │
                       │  /alerts /cases /claims /sar /approve /eval   │
                       │  WS bridge ◄── Redis pub/sub (bw:events:*)    │
                       │  Simulation engine · Loader · Eval runner     │
                       └──────┬──────────────────┬─────────────────────┘
                              │                  │
             ┌────────────────▼───┐      ┌───────▼─────────────────────┐
             │ LangGraph agent    │ MCP  │ BankWeave MCP server        │
             │ runtime            ├─────►│ (graph tools: find_rings,   │
             │ Orchestrator,      │      │  trace_flow, echo_check,    │
             │ Triage, Investig., │      │  invalidate, ... )          │
             │ Skeptic, Archivist,│      └───────┬─────────────────────┘
             │ Reporter, Auditor  │              │ Cypher / algo.*
             └────────┬───────────┘              │
                      │ LiteLLM          ┌───────▼─────────────────────┐
                      ▼                  │          FalkorDB           │
             writer LLM + stronger       │ bank_<id> graphs ×N         │
             auditor LLM                 │ consortium graph            │
                                         │ case_<id> graphs            │
                                         │ typology_kb (GraphRAG-SDK)  │
                                         │ graphiti memory graph       │
                                         │ Browser on :3000            │
                                         └─────────────────────────────┘
             ┌──────────────────────┐
             │ Postgres (KYC table) │◄── QueryWeaver (Text→SQL, MCP)
             └──────────────────────┘
```

## Data flow for one alert

1. Loader/simulator writes transactions → bank graph(s) + consortium graph; publishes `bw:events:txn`.
2. Rule-based alert generator (the *baseline*) creates `Alert` nodes → `bw:events:alert`.
3. Orchestrator writes a `Task {type:'triage'}` on the blackboard.
4. Triage calls `expand_neighborhood`, `find_islands`, motif score → clears (writes `Decision`)
   or opens a `Case` (new `case_<id>` graph, links in consortium).
5. Investigator calls algorithm tools → writes `Claim`, `Evidence`, `SUPPORTED_BY`, `DERIVED_FROM`.
6. Skeptic reads claims → writes `CHALLENGED_BY` evidence or innocent hypotheses.
7. `echo_check` recomputes confidence from distinct origins.
8. Reporter drafts SAR → Provenance gate audits → publish or divergence report.
9. Human approves actions in UI → `Action` nodes linked to justifying claims.
10. Every write publishes an event → UI updates live.

## Repo layout

```
bankweave/
├── README.md                   # graph model, queries, setup, AI disclosure (required)
├── docker-compose.yml
├── .env.example
├── docs/
│   ├── QUERIES.md              # every Cypher query the product uses (required)
│   ├── GRAPH_MODEL.md          # schema diagram + explanation (required)
│   └── (this knowledge pack)
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI app, routers, WS bridge
│   │   ├── config.py
│   │   ├── db.py               # FalkorDB client, graph handles, helpers
│   │   ├── events.py           # Redis pub/sub publish/subscribe
│   │   ├── routers/            # alerts, cases, claims, sar, approve, eval, demo
│   │   └── services/
│   │       ├── loader.py       # IBM CSV → graphs
│   │       ├── kyc_synth.py    # synthetic people/devices/IPs/addresses + Postgres KYC
│   │       ├── simulator.py    # live transaction stream, red-team injection
│   │       ├── baseline.py     # rule-based alert generator (baseline)
│   │       └── consortium.py   # hashing + cross-bank linking
│   ├── detection/
│   │   ├── typologies.py       # Cypher patterns
│   │   ├── algorithms.py       # wrappers around algo.*
│   │   ├── motif_seeds.py      # motif score + coherent seed selection (paper 2610.13280)
│   │   ├── spnsa.py            # shortest-path investigation subgraph
│   │   ├── passthrough.py      # pass-through matching (paper 2609.20737)
│   │   └── clue_expand.py      # clue-guided ring recovery (paper 2606.26189)
│   ├── trust/
│   │   ├── echo.py             # echo-proof confidence (paper 2609.17695)
│   │   ├── validity.py         # cascading invalidation + premise check (paper 2610.05732)
│   │   └── gate.py             # provenance gate + divergence report (paper 2609.31422)
│   ├── memory/
│   │   ├── episodic.py
│   │   ├── procedural.py
│   │   └── graphiti_mem.py
│   ├── knowledge/
│   │   ├── graphrag_kb.py      # GraphRAG-SDK over typology docs
│   │   └── queryweaver.py      # client for QueryWeaver MCP/REST
│   ├── agents/
│   │   ├── graph.py            # LangGraph state machine
│   │   ├── orchestrator.py triage.py investigator.py skeptic.py
│   │   ├── archivist.py reporter.py auditor.py
│   │   └── prompts/
│   ├── mcp_server/
│   │   └── server.py           # BankWeave MCP server exposing all tools
│   └── tests/
├── frontend/                   # Next.js app
├── eval/
│   ├── run_eval.py
│   ├── baselines.py
│   ├── metrics.py
│   └── results/                # JSON the scoreboard reads
├── data/
│   ├── raw/                    # IBM CSVs (gitignored; download script)
│   └── kb/                     # public typology docs (markdown) for GraphRAG
└── scripts/
    ├── download_ibm.sh
    ├── seed_all.sh
    └── reset_demo.sh
```

## Docker Compose (starting point)

```yaml
services:
  falkordb:
    image: falkordb/falkordb:latest
    ports: ["6379:6379", "3000:3000"]     # 3000 = FalkorDB Browser
    volumes: ["falkor_data:/data"]
  postgres:
    image: postgres:16
    environment: { POSTGRES_PASSWORD: bankweave, POSTGRES_DB: kyc }
    ports: ["5432:5432"]
  backend:
    build: ./backend
    env_file: .env
    depends_on: [falkordb, postgres]
    ports: ["8000:8000"]
  mcp:
    build: ./backend
    command: python -m mcp_server.server
    env_file: .env
    depends_on: [falkordb]
  frontend:
    build: ./frontend
    ports: ["3001:3000"]
    depends_on: [backend]
volumes: { falkor_data: {} }
```

VERIFY: confirm the Browser port mapping and persistence path against the current
`falkordb/falkordb` image docs. Add QueryWeaver as a service if used (see `10_knowledge_layer.md`).

## Environment variables

```
FALKORDB_HOST=falkordb
FALKORDB_PORT=6379
FALKORDB_PASSWORD=
POSTGRES_URL=postgresql://postgres:bankweave@postgres:5432/kyc
LLM_WRITER_MODEL=...          # cheaper/faster model for agents and SAR drafts
LLM_AUDITOR_MODEL=...         # different, stronger model for the provenance gate
EMBED_MODEL=...               # for vector behavior profiles + GraphRAG
DATASET=HI-Small
```

## Deployment for the live link

- FalkorDB Cloud instance for the database.
- Backend + MCP on Railway / Render / Fly (any container host).
- Frontend on Vercel.
- Preload a reduced graph (subset of HI-Small, e.g. one connected slice containing several
  laundering patterns) so the live demo is fast and cheap. Document the subset in README.
