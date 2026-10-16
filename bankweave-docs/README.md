# BankWeave — Project Knowledge Pack

> **Many banks, one ring, every claim proven.**

BankWeave is a multi-agent anti-money-laundering (AML) investigation system built on **FalkorDB**
for the **Graph Hacks: Context for AI Agents** hackathon (WeMakeDevs × FalkorDB, Oct 15–18 2026).

This folder is the complete design spec. It is written so a coding agent (Claude) or a teammate
can build the whole project from it without the original chat.

---

## The 60-second version

**Problem.** Banks drown in AML alerts: industry sources put 85–95% of transaction-monitoring
alerts as false positives. Meanwhile real laundering rings stay hidden because each bank only
sees its own slice of the money flow.

**What BankWeave does.**
1. Loads IBM's public synthetic AML dataset into **one isolated FalkorDB graph per bank** plus a
   **consortium graph** that links them.
2. A team of agents (Triage, Investigator, Skeptic, Archivist, Reporter, Orchestrator)
   investigates alerts using **native FalkorDB graph algorithms as MCP tools**.
3. Innocent alerts are cleared fast; laundering rings that are invisible inside one bank
   **light up in the consortium view**.
4. A **trust layer**, built from three 2026 research papers, makes the agents' conclusions
   trustworthy:
   - **Echo-proof confidence:** counts independent sources, not paths.
   - **Cascading invalidation:** when evidence is overturned, every belief and action resting
     on it is flagged automatically, with history preserved.
   - **Provenance gate:** a suspicious activity report (SAR) cannot publish unless every
     sentence is backed by a graph path; otherwise a divergence report shows the disagreement.
5. Everything is measured against IBM's labels on a live **scoreboard**.

**Why FalkorDB is essential.** The ring only exists as a path *between* banks. Remove the graph
and BankWeave can't see it at all.

---

## File index

| File | Contents |
|------|----------|
| `CLAUDE.md` | Instructions and ground rules for the coding agent |
| `docs/01_hackathon_rules.md` | Official rules, tracks, prizes, submission checklist |
| `docs/02_product_vision.md` | Problem, pitch, why FalkorDB, track strategy, competitive positioning |
| `docs/03_architecture.md` | Components, data flow, repo layout, stack, Docker Compose |
| `docs/04_data_and_graph_model.md` | IBM dataset, multigraph layout, node/edge schema, indexes, loader |
| `docs/05_falkordb_reference.md` | Verified FalkorDB algorithm & index syntax + gotchas |
| `docs/06_detection_engine.md` | Typology Cypher, algorithm tools, motif seeds, pass-through, clue-guided recovery |
| `docs/07_agents_and_mcp.md` | Agents, blackboard protocol, LangGraph flow, MCP tools |
| `docs/08_trust_layer.md` | Echo-proof confidence, cascading invalidation, provenance gate, SAR |
| `docs/09_memory.md` | Memory types, Graphiti, resume-from-graph, per-case graphs |
| `docs/10_knowledge_layer.md` | GraphRAG-SDK, QueryWeaver, entity resolution |
| `docs/11_frontend.md` | Website screens, live streaming, demo modes |
| `docs/12_evaluation.md` | Metrics, baselines, scoreboard |
| `docs/13_demo_video_blog.md` | 3-minute demo script, video plan, blog post outline |
| `docs/14_build_plan.md` | Phased build plan with priorities and cut list |
| `docs/15_research_references.md` | All papers and sources with what we took from each |

---

## Feature map (everything decided so far)

| Area | Features |
|------|----------|
| **Data** | IBM AML HI-Small; per-bank graphs; consortium graph; synthetic KYC (Postgres), devices, IPs, addresses |
| **Detection** | Cypher typologies (cycles, fan-in/out, structuring, pass-through, shell chains, shared identity); native algorithms (WCC, label propagation, PageRank, betweenness, harmonic centrality, MaxFlow, SPpaths/SSpaths, BFS, MSF, A*); motif-scored seeds + shortest-path investigation subgraphs; pass-through matching; clue-guided ring recovery |
| **Agents** | Orchestrator, Triage, Investigator, Skeptic, Archivist, Reporter; graph blackboard coordination; concurrent writes |
| **Tools** | MCP server exposing every graph tool; FalkorDB MCP server for raw read-only Cypher |
| **Trust layer** | Echo-proof confidence; 4-state validity lattice with cascading invalidation; premise check; provenance gate (≥95% supported sentences, ≤3 repairs, divergence report); asymmetric auditor model |
| **Memory** | Episodic events; semantic facts; procedural strategies; Graphiti temporal facts; per-case graphs; kill-and-resume |
| **Knowledge** | GraphRAG-SDK over public FATF/FinCEN typology guidance; QueryWeaver over KYC Postgres; vector behavior profiles; phonetic full-text name matching |
| **Actions** | Freeze recommendation, escalate, open case, file SAR — all human-approved, all linked to evidence |
| **UI** | Live streaming graph; per-bank vs consortium toggle; case workspace; clickable SAR; trust panel; scoreboard; simulation, counterfactual and red-team modes |
| **Eval** | Precision/recall/alert reduction vs rule-based baseline; illicit ratio of investigation subgraphs; trust-layer metrics |
| **Delivery** | Public repo, README with graph model + queries, demo video, live link (FalkorDB Cloud), blog post, AI-use disclosure |
