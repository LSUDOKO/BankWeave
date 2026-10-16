# CLAUDE.md — Instructions for the coding agent building BankWeave

You are helping build **BankWeave** for the **Graph Hacks: Context for AI Agents** hackathon
(WeMakeDevs × FalkorDB, Oct 15–18 2026, submissions close **Oct 18, 11:59 PM IST**).

**One line:** BankWeave is a team of AI agents that investigates money-laundering alerts across
several banks. It clears innocent alerts fast, exposes laundering rings no single bank can see,
and backs every conclusion with a graph path you can click through — and it knows how many
*independent* reasons it has for each belief, notices when one of them dies, and refuses to file
a report it can't prove.

**Tagline:** *Many banks, one ring, every claim proven.*

---

## Read these docs in order

| # | File | What it gives you |
|---|------|-------------------|
| 1 | `README.md` | Index and 2-minute overview |
| 2 | `docs/01_hackathon_rules.md` | Hard rules and the submission checklist. **Non-negotiable.** |
| 3 | `docs/02_product_vision.md` | The problem, the pitch, why FalkorDB, tracks |
| 4 | `docs/03_architecture.md` | System components, repo layout, stack, docker-compose |
| 5 | `docs/04_data_and_graph_model.md` | IBM dataset, multigraph layout, full schema, indexes, loader |
| 6 | `docs/05_falkordb_reference.md` | **Verified** FalkorDB procedure syntax. Use this, not memory. |
| 7 | `docs/06_detection_engine.md` | Laundering typologies in Cypher, algorithm tools, research-based detectors |
| 8 | `docs/07_agents_and_mcp.md` | The 6 agents, blackboard coordination, MCP tool list |
| 9 | `docs/08_trust_layer.md` | Echo-proof confidence, cascading invalidation, provenance gate, SAR |
| 10 | `docs/09_memory.md` | Episodic / semantic / procedural / temporal memory, resume-from-graph |
| 11 | `docs/10_knowledge_layer.md` | GraphRAG-SDK, QueryWeaver, vector + full-text entity resolution |
| 12 | `docs/11_frontend.md` | Live website, views, streaming, demo modes |
| 13 | `docs/12_evaluation.md` | Scoreboard, metrics, baselines |
| 14 | `docs/13_demo_video_blog.md` | Demo script, video, blog post, README requirements |
| 15 | `docs/14_build_plan.md` | Phased build order, priorities, cut list |
| 16 | `docs/15_research_references.md` | Every paper and source, what we took from each |

---

## Ground rules for you (the coding agent)

1. **FalkorDB must do real work.** If a feature would still work with FalkorDB removed, it does
   not count toward the hackathon. Detection, evidence, memory and agent coordination all live
   in the graph.
2. **Use the verified syntax in `docs/05_falkordb_reference.md`.** Procedure names are
   case-sensitive and some differ from what you may remember (e.g. `algo.wcc`, `algo.bfs`,
   `algo.HarmonicCentrality`, `algo.maxFlow`). If something is marked **VERIFY**, check the
   official docs (https://docs.falkordb.com) or run it against a live instance before relying on it.
3. **Never claim a FalkorDB feature that doesn't exist.** There is no native closeness, degree,
   strongly-connected-components or triangle-count procedure. Do those in plain Cypher and say so.
4. **QueryWeaver is Text-to-SQL, not Text-to-Cypher.** Only use it against the Postgres KYC table.
5. **Data rule:** only public, synthetic or self-owned data. We use IBM's synthetic AML dataset
   plus our own synthetic KYC/device data. Never real personal data.
6. **Never hardcode the answer.** Agents must discover rings from the data. Labels are used
   *only* for evaluation, never as an input to detection or agents.
7. **Measure, don't claim.** Every number in the README, demo or blog must come from
   `eval/` scripts run on our data. No invented percentages.
8. **Build the critical path first** (see `docs/14_build_plan.md`). A working end-to-end slice
   beats ten half-built features. One broken demo feature hurts more than ten missing ones help.
9. **Human approval for actions.** Freezes, escalations and SAR filing require an explicit
   approval step in the UI. Agents recommend; humans approve.
10. **Disclose AI tool use** in the README (required by the rules).
11. **Keep LLM calls out of the hot path where Cypher can answer.** Agents call graph tools;
    the graph computes. The LLM plans, explains and writes.
12. **Every Cypher query used by the product goes in `docs/QUERIES.md` in the repo**
    (required by the submission: README must document the graph model and queries).

## Default tech choices (change only with good reason)

- Backend: **Python 3.12, FastAPI**, `falkordb` Python client, `redis` client for pub/sub
- Agents: **LangGraph** state machine; tools exposed over **MCP** (FastMCP / `mcp` Python SDK)
- LLM: any provider via LiteLLM (writer model + a *different, stronger* auditor model)
- Frontend: **Next.js + TypeScript**, **Sigma.js** (graphology) or `react-force-graph` for the live graph
- Infra: **Docker Compose** (FalkorDB, Postgres, backend, MCP server, frontend); FalkorDB Cloud for the live link
- Eval: Python scripts + notebook, results written to `eval/results/*.json` and shown on the scoreboard

## Definition of done (MVP)

- [ ] IBM HI-Small loaded into per-bank graphs + consortium graph
- [ ] Triage → Investigator → Skeptic → Reporter runs end-to-end on one alert queue
- [ ] Consortium reveal works live in the UI
- [ ] Echo-proof confidence + cascading invalidation demoable live
- [ ] SAR with clickable evidence and provenance gate
- [ ] Kill-and-resume works
- [ ] Scoreboard with measured numbers vs. rule-based baseline
- [ ] Public repo, README with graph model + queries, demo video, live link, AI disclosure
