# 13 — Demo, Video, Blog & README

## 13.1 The 3-minute demo script

| Time | Beat | On screen |
|---|---|---|
| 0:00–0:15 | Hook | "Banks clear 85–95% of AML alerts as false positives. And the real rings hide *between* banks." |
| 0:15–0:40 | Alert flood | Alert Queue streaming. Baseline would escalate all 20; Triage clears most with one-line, clickable reasons. |
| 0:40–1:05 | **Consortium reveal** | Bank A view: nothing conclusive. Toggle → Consortium: ring of 7 accounts across 3 banks lights up; hub (PageRank) and mule bridges (betweenness) marked. "MaxFlow: up to $X could have moved." |
| 1:05–1:30 | Skeptic & echo | Skeptic: "shared device might be a family." Echo panel: "6 paths → 2 independent sources." Investigator answers with structuring + pass-through evidence (new independent origins). |
| 1:30–1:50 | **Cascade** | Push KYC update: "Address A-77 = 200-unit building." 3 claims + freeze rec + SAR turn amber. Analyst asks "why is this still frozen?" → premise check answers. |
| 1:50–2:10 | **Kill & resume** | `docker kill` the agent → restart → "resume case 2847" → agent continues from the graph. |
| 2:10–2:35 | SAR & gate | Generate SAR → PF 0.97 published, click sentence → path highlights. Show a second case that ends in a divergence report. |
| 2:35–2:55 | Scoreboard | Measured precision/recall vs baseline; consortium vs single-bank; SPNSA reproduction. |
| 2:55–3:00 | Close | FalkorDB Browser second screen + "Many banks, one ring, every claim proven." |

Rehearse with `scripts/reset_demo.sh` to a known state. Record a backup video in case live fails.

## 13.2 Video production
- 1080p screen recording, voice-over, captions.
- Split screen for FalkorDB Browser during the consortium reveal.
- Show one Cypher query on screen (the trace_flow or echo query) — judges from FalkorDB will like it.
- Under 3–4 minutes. Link in README top.

## 13.3 Blog post (Best Blog Post prize)

**Title options:**
- "Five paths, one fact: why AI investigators overcount evidence"
- "No bank can see a laundering ring alone — so we wove them together"

**Outline:**
1. The problem: alert fatigue and fragmented visibility (with sources).
2. Why a graph: laundering is a path; one query vs many joins. Multigraph = banks' real boundaries.
3. Building it on FalkorDB: data model diagram, per-bank vs consortium, algorithms as MCP tools.
4. The trust layer: three 2026 papers (GraphEcho, PACMI, APG) and how each became a Cypher query.
   Include the echo query and the cascade query.
5. Reproducing a 2026 AML paper inside FalkorDB (SPNSA motif seeds) — our numbers vs theirs.
6. Results: the scoreboard tables, honest limitations.
7. What we'd do next (real consortium privacy tech, GNN risk fields, human studies).
Include screenshots/GIFs of the consortium reveal and the amber cascade.

## 13.4 README requirements (repo)

Top of README:
- Name, tagline, 1-paragraph pitch, **demo video link**, **live link**, tracks entered (01, 02, [03]).

Sections:
1. Problem & solution
2. **Why FalkorDB is essential** (what breaks without it)
3. Architecture diagram
4. **Graph model** (diagram + tables of labels, relationships, multigraph layout)
5. **Cypher queries & algorithms used** (summary; full list in `docs/QUERIES.md`)
6. Agents & MCP tools
7. Trust layer (with paper citations)
8. Evaluation results (tables from `eval/results`)
9. Setup: `docker compose up`, data download script, seed script, env vars
10. Data: IBM synthetic AML (link), synthetic KYC generator (seeded), no real personal data
11. **AI tools disclosure** (e.g. "Built with help from Claude Code; all code reviewed and
    understood by the team")
12. Limitations & next steps
13. License; note that BankWeave is independent of FalkorDB/QueryWeaver and W&B Weave
