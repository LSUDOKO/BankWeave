# BankWeave — Implementation Design (2026-10-16)

The product design lives in `bankweave-docs/` (knowledge pack). This spec records the
implementation decisions layered on top of it.

## Goal
Ship every P0 and P1 feature of `bankweave-docs/docs/14_build_plan.md` fully working, then P2
items in cut-list order as time allows. Tracks: 01 (primary), 02 (secondary), blog side prize.

## Decisions
| Area | Decision |
|---|---|
| Python | 3.12 via `uv` (`backend/pyproject.toml`) |
| Backend | FastAPI + `falkordb` client + `redis` (pub/sub) + `psycopg` (KYC) |
| Agents | LangGraph state machine; state holds ids only; graph is the source of truth |
| LLM | OpenRouter through LiteLLM. `LLM_WRITER_MODEL` (cheap) and `LLM_AUDITOR_MODEL` (stronger, different vendor) |
| Tools | FastMCP server `backend/mcp_server/server.py`; agents call the same Python tool functions in-process |
| Events | Separate Redis (`bw:events:*`) → FastAPI WebSocket `/ws` |
| Frontend | Next.js App Router + TS + Tailwind + Sigma.js/graphology + Recharts |
| Data | Full HI-Small locally for eval; connected demo slice for FalkorDB Cloud |
| Deploy | FalkorDB Cloud (DB), Render (backend, MCP, Key Value Redis, Postgres), Vercel (frontend) |
| Local ports | FalkorDB 6390, Browser 3030, Postgres 5440, Redis 6391, API 8000, web 3001 |
| Tests | pytest against a real FalkorDB container (`tests/` uses graph names prefixed `test_`) |

## Non-negotiables (from the knowledge pack)
- Labels only in `eval/`; never in detectors or agent-visible graphs.
- Every product Cypher query listed in `docs/QUERIES.md`.
- Every displayed number comes from `eval/results/*.json`.
- Actions require human approval in the UI.
- AI-tool use disclosed in README.

## Graceful degradation
- No LLM key → agents fall back to a deterministic tool policy and template prose; the UI
  labels the run "deterministic mode". The provenance gate's code-level checks still run.
- No Graphiti / QueryWeaver → fixed parameterized SQL tools and our own temporal edges.
