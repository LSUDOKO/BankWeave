# 02 — Product Vision

## The real-world problem

1. **Alert fatigue.** Rule-based transaction monitoring flags single suspicious signals with no
   context. Industry sources and a 2024 academic study put AML false-positive rates around
   **85–95%**. Analysts spend most of their time clearing innocent customers.
2. **Fragmented visibility.** A bank only sees transactions that touch it. Laundering schemes
   deliberately spread across institutions, so each bank's slice looks innocent. IBM's dataset
   documentation makes exactly this point: a real institution sees only a portion of the
   laundering transactions.
3. **Explainability burden.** A suspicious activity report (SAR) must justify its conclusion.
   Today that justification is assembled by hand from screenshots and memory.
4. **Lost institutional memory.** When an analyst leaves, their case reasoning leaves with them.

## The product

**BankWeave** — a team of AI agents that works an AML alert queue across multiple banks,
using FalkorDB as its shared brain.

**What a user sees:**
- An alert queue. Most alerts get cleared in seconds with a one-line reason ("isolated cluster,
  no laundering motifs, no cross-bank links").
- Suspicious alerts become **cases**. Agents expand the case, run graph algorithms, form
  **claims**, attach **evidence**, and the Skeptic argues the innocent explanation.
- A toggle between **per-bank view** (nothing visible) and **consortium view** (the ring
  appears across banks).
- A **SAR** where every sentence is a link into the graph path that proves it.
- A **trust panel** showing independent-source counts, validity states, and what's unresolved.
- A **scoreboard** with measured precision/recall against IBM's labels.

## Why FalkorDB is the right database (the pitch)

| AML need | FalkorDB strength |
|----------|-------------------|
| Laundering = paths through accounts | Sparse-matrix (GraphBLAS) storage; multi-hop traversals are matrix ops; 8-hop money trace is one query |
| Agents query the graph on every step | Low-latency traversals (FalkorDB's own benchmark claims P99 83 ms vs ~41 s for a competitor — cite as a **vendor** benchmark) |
| Banks legally see only their own data | **Multigraph**: 10,000+ isolated graphs in one instance → per-bank graphs, consortium graph, per-case graphs |
| Ring detection needs network science | Native `algo.*` procedures: PageRank, betweenness, harmonic centrality, label propagation, WCC, MaxFlow, shortest paths, BFS, MSF, A* |
| Entity resolution across banks | Full-text index with phonetic matching + vector (HNSW) index + graph in **one engine** |
| Agent tooling | Official MCP server, GraphRAG-SDK, Graphiti driver, Browser for live inspection |
| Live UI | Redis protocol → pub/sub streaming to the website |

**Killer line:** *Remove FalkorDB and BankWeave can't see the ring at all — the ring only exists
as a path between banks.*

## What makes BankWeave different from other entries

1. **The consortium reveal** — a real constraint (banks' partial visibility) mapped directly onto
   FalkorDB multigraph.
2. **Measured, not claimed** — public labeled dataset → precision/recall scoreboard.
3. **Research-grade trust layer** — three 2026 papers turned into Cypher:
   echo-proof confidence (GraphEcho), cascading invalidation (PACMI), provenance gate (APG).
4. **Reproduced a 2026 AML paper inside FalkorDB** — motif-scored seeds + shortest-path
   investigation subgraphs on IBM HI-Small (paper reports ~9× illicit enrichment over random).
5. **Agents act, humans approve** — freeze/escalate/file actions with evidence links.

## The pitch, one paragraph

> Most AI agents remember things. BankWeave knows how many independent reasons it has for each
> belief, notices when one of those reasons dies, and refuses to file a report it can't prove.
> It runs across many banks at once — each in its own isolated FalkorDB graph — and finds the
> laundering rings that no single bank can see. Every claim is a path you can click.

## Taglines

- Primary: **"Many banks, one ring, every claim proven."**
- Alt: "Every suspicion is a path you can walk."
- Blog title: "Five paths, one fact: why AI investigators overcount evidence."
- Alt blog title: "No bank can see a laundering ring alone."

## Name notes

- "Weave" is used by Weights & Biases (Weave) and FalkorDB's own QueryWeaver. State in the README
  that BankWeave is an independent hackathon project, not a FalkorDB product.
