# 14 — Build Plan

Deadline: **Oct 18 2026, 11:59 PM IST.** Work in vertical slices: each phase ends with something
demoable. Priorities: **P0** = must ship, **P1** = should ship, **P2** = only if ahead.

## Phase 0 — Foundations (P0)
- [ ] Repo scaffold (layout in `03_architecture.md`), Docker Compose with FalkorDB + Postgres
- [ ] `scripts/download_ibm.sh` (HI-Small); inspect real CSV header + patterns format
- [ ] Loader → `consortium` graph (hashed ids) + top-N `bank_<id>` graphs; indexes
- [ ] Ground-truth extraction → `eval/ground_truth.json`
- [ ] Synthetic KYC/devices/addresses (seeded) + Postgres table
**Demo check:** FalkorDB Browser shows a cross-bank laundering attempt in `consortium`, fragmented in a bank graph.

## Phase 1 — Detection + tools (P0)
- [ ] Typology Cypher (cycle, fan-in/out, structuring, pass-through quick, shared identity)
- [ ] Algorithm wrappers (wcc, labelPropagation, pageRank, betweenness w/ seed, HarmonicCentrality, SPpaths, maxFlow, bfs)
- [ ] Copy-to-case-graph helper
- [ ] Baseline alert generator
- [ ] BankWeave MCP server with core tools
**Demo check:** call `find_rings`, `trace_flow`, `money_at_risk` from an MCP client (e.g. Claude Desktop).

## Phase 2 — Agents end-to-end (P0)
- [ ] Task blackboard + Orchestrator
- [ ] Triage → Investigator → Skeptic (1 round) → Reporter (no gate yet)
- [ ] Claims/Evidence with `origin` from day one
- [ ] Event log + pub/sub events
**Demo check:** one alert → case → claims → SAR draft, all in the graph.

## Phase 3 — UI core (P0)
- [ ] FastAPI REST + WS bridge
- [ ] Alert Queue, Network View with bank/consortium toggle, Case Workspace
- [ ] Approvals for actions
**Demo check:** the consortium reveal works live.

## Phase 4 — Trust layer (P0 for echo + cascade, P0 for gate-lite)
- [ ] Echo-proof confidence + grouped bundle + echo panel
- [ ] Validity lattice + `invalidate_evidence` cascade + premise check + "Push KYC update" demo
- [ ] Provenance gate: code checks + separate auditor model + 3 repairs + divergence report
- [ ] SAR viewer with clickable sentences
**Demo check:** amber cascade and clickable SAR.

## Phase 5 — Memory (P0 resume, P1 rest)
- [ ] Heartbeats + stale-task reset → kill-and-resume (P0)
- [ ] Archivist cross-case recall (P1)
- [ ] Procedural memory save/reuse (P1)
- [ ] Graphiti temporal facts (P2)

## Phase 6 — Evaluation (P0)
- [ ] E1 alert triage vs baseline (+ LLM-only baseline if time)
- [ ] E2 consortium vs single-bank
- [ ] E3 SPNSA reproduction (P1)
- [ ] Scoreboard page reading `eval/results/*.json`

## Phase 7 — Research detectors (P1)
- [ ] Motif score + coherent seeds + SPNSA hunt mode
- [ ] Pass-through matcher (NetworkX blossom) + chain value
- [ ] Clue-guided expansion with analyst feedback (P2)

## Phase 8 — Knowledge (P1/P2)
- [ ] GraphRAG-SDK typology KB + `MATCHES_TYPOLOGY` + SAR citations (P1)
- [ ] Phonetic + vector entity resolution (P1)
- [ ] QueryWeaver for KYC (P2; fallback to fixed SQL tools)

## Phase 9 — Ship (P0, reserve real time for this)
- [ ] Deploy: FalkorDB Cloud + backend host + Vercel frontend; preloaded demo slice
- [ ] README (graph model, queries, setup, AI disclosure), `docs/QUERIES.md`
- [ ] Demo video (+ backup recording)
- [ ] Blog post
- [ ] Submit, declare tracks

## Cut list (drop in this order if behind)
1. Graphiti (own temporal edges suffice)
2. QueryWeaver (fixed SQL tools)
3. Clue-guided expansion
4. Red-team and counterfactual modes
5. Procedural memory
6. Track 03 entry
7. Pass-through blossom matcher (keep Cypher quick version)
**Never cut:** consortium reveal, evidence-linked claims, echo + cascade, kill-and-resume,
scoreboard with real numbers, README/video/live link.

## Risks & mitigations
| Risk | Mitigation |
|---|---|
| HI-Small too big for fast demo | Load full for eval; demo on a connected slice with several cross-bank attempts |
| Algorithm runtime on big graph | Run on case graphs; precompute scores offline and store on nodes |
| LLM cost/latency | Cheap writer model; cache tool results; agents only on cases, not every alert |
| Pub/sub not allowed on Cloud | Separate small Redis for events |
| Synthetic identity leaks labels | Documented random rules incl. innocent sharing; report them |
| Overclaiming | Every number from `eval/`; vendor benchmarks labeled as such |
