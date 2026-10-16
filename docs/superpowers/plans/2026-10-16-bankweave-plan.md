# BankWeave — Implementation Plan

Follows `bankweave-docs/docs/14_build_plan.md`. Each task is one or more small commits.

## Phase 0 — Foundations
- [ ] Root scaffold: .gitignore, .env.example, docker-compose.yml
- [ ] backend/pyproject.toml, config, db, events modules
- [ ] scripts/download_ibm.sh (Kaggle)
- [ ] Loader: CSV → consortium (hashed) + top-N bank graphs, degrees, indexes
- [ ] Ground truth parser → eval/ground_truth.json
- [ ] Synthetic KYC/devices/addresses + Postgres table
- [ ] Synthetic mini dataset generator for tests/demo when IBM data absent

## Phase 1 — Detection + tools
- [ ] detection/config.yaml + typologies.py
- [ ] algorithms.py wrappers (wcc, labelPropagation, pageRank, betweenness, harmonic, SPpaths, SSpaths, maxFlow, bfs, MSF)
- [ ] case graph copy helper
- [ ] baseline.py alert rules
- [ ] motif_seeds.py + spnsa.py, passthrough.py, clue_expand.py
- [ ] identity: phonetic full-text + vector behavior neighbors
- [ ] MCP server exposing tools

## Phase 2 — Agents
- [ ] Blackboard (tasks, heartbeats, stale reset)
- [ ] Claims/Evidence store with origin; episodic events
- [ ] LLM client (LiteLLM/OpenRouter) + deterministic fallback
- [ ] Orchestrator, Triage, Investigator, Skeptic, Reporter, Auditor, Archivist
- [ ] LangGraph flow + worker process

## Phase 3 — API + UI
- [ ] FastAPI routers: alerts, cases, claims, sar, approve, eval, demo, graph, ws
- [ ] Next.js app: queue, network (bank/consortium toggle), case workspace, SAR, trust, approvals, scoreboard, demo

## Phase 4 — Trust layer
- [ ] echo.py, validity.py (cascade + premise check), gate.py (PF, repairs, divergence)

## Phase 5 — Memory
- [ ] kill-and-resume, cross-case recall, procedural memory, (P2) Graphiti

## Phase 6 — Evaluation
- [ ] E1–E7 scripts → eval/results; scoreboard

## Phase 7 — Knowledge
- [ ] typology KB (GraphRAG-SDK, fallback own graph), KYC SQL tools / QueryWeaver (P2)

## Phase 8 — Ship
- [ ] README, docs/QUERIES.md, docs/GRAPH_MODEL.md, blog draft, deploy configs (render.yaml, vercel)
