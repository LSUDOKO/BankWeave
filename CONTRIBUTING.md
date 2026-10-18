# Contributing to BankWeave

Thanks for helping. BankWeave is a FalkorDB-backed, multi-agent AML investigation system; the
README explains the architecture and `docs/GRAPH_MODEL.md` the graph model.

## Setup

```bash
docker compose up -d          # FalkorDB, Redis, Postgres
cp .env.example .env
cd backend && uv sync && cd ..
scripts/seed_all.sh           # load the sample dataset into the bank, consortium and identity graphs
cd backend && uv run uvicorn app.main:app --port 8000
cd frontend && pnpm install && pnpm dev -p 3001
```

## Before opening a pull request

- Backend: `cd backend && uv run ruff check . && uv run pytest`
- Frontend: `cd frontend && pnpm exec tsc --noEmit -p . && pnpm lint && pnpm build`
- New Cypher goes through `cy(name, purpose, text)` in `backend/app/cypher.py` so it appears in
  `docs/QUERIES.md` (`python scripts/gen_queries_md.py`).
- Anything exposed to agents or MCP must be read-only (`GRAPH.RO_QUERY`) unless it is an explicit,
  human-approved action.
- Every number shown in the UI must come from the API or `eval/results`, never be hard-coded.

## Commits

Short, imperative, one change per commit (for example "Explorer: add vector KNN preset").
