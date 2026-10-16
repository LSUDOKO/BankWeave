# 15 — Research & References

## 15.1 Research papers used (all read Oct 16 2026)

### GraphEcho — Structural Redundancy and Evidence Provenance in LLM Graph Agents
- arXiv **2609.17695** (Sep 2026) · https://www.alphaxiv.org/abs/2609.17695
- Finding: agents treat many graph paths to one origin as extra corroboration; redundant paths
  raised repeated-evidence visits in all four agents tested. Deterministic "provenance collapse"
  raised Qwen3-4B agentic accuracy to ~83% vs ~43% with metadata/instruction controls. Trained
  policy (PAPT) cut repeats but lowered source recall.
- **Used for:** echo-proof confidence (distinct `origin` counting), origin-grouped bundles,
  coverage nudge. → `08_trust_layer.md §8.1`

### PACMI — Provenance-Aware Cascading Memory Invalidation for Long-Term LLM Agents
- arXiv **2610.05732** (Oct 2026) · https://www.alphaxiv.org/abs/2610.05732
- Method: provenance graph with typed dependency edges; four-state validity lattice
  (active / needs-verification / historical-only / superseded); cascading propagation;
  non-destructive repair; premise checking.
- Results: 99% vs 90% final accuracy over strongest baseline (300 queries, significant);
  destructive rewriting → 42% on historical queries. Cascade's answer-level effect not
  significant at their scale; edges were annotated.
- **Used for:** validity lattice, cascade, premise check, history preservation. → `§8.2`

### Active Provenance Gate for Multi-Agent Debate Synthesis
- arXiv **2609.31422** (ICTAI 2026) · https://www.alphaxiv.org/abs/2609.31422
- Method: closed evidentiary corpus; proposer/auditor split; NLI audit per sentence;
  publish only if PF ≥ 0.95; ≤3 bounded repairs; divergence report on failure.
- Results: symmetric (same model) auditing wrongly validated unsafe compromises 85.6% of the
  time; user study N=33 favored divergence reports on faithfulness (75.8%) and trust in the hard
  scenario. Synthetic testbed.
- **Used for:** SAR provenance gate, separate auditor model, divergence report. → `§8.3`

### Extracting Illicit-Rich Subgraphs from Transaction Networks via Feed-Guided Shortest Paths
- arXiv **2610.13280** (Oct 2026) · https://www.alphaxiv.org/abs/2610.13280
- Code: github.com/koshimbetovv/spnsa-feed-selection
- Method: motif suspicion score (3-cycles, reciprocity, relay, fan-in/out with ratio threshold,
  leaf-star, degree penalty) + coherent multi-center seed selection + SPNSA shortest-path aggregation.
- Results on IBM HI-Small (k=200, r=1): illicit ratio 22.6% (motif) vs ~2.4% random vs 13.7%
  degree-imbalance; LI-Small favored degree imbalance.
- **Used for:** hunt mode, `motif_score`, `hunt_regions`, E3 reproduction. → `06 §6.3`

### An Interpretable Approach to Money Laundering Detection in Transaction Graphs using Pass-Through Templates
- arXiv **2609.20737** (Sep 2026) · https://www.alphaxiv.org/abs/2609.20737
- Method: per-node max-cardinality max-weight matching (Edmonds' blossom via NetworkX) of in/out
  transfers by asset, time gap, amount similarity, min value; chain de-duplication.
- Results: Ethereum case study — 283 pass-through nodes, one 1,690-address network, six
  OFAC-sanctioned addresses, >$260M moved, <2 s runtime.
- **Used for:** `passthrough_check`, value-laundered figure. → `06 §6.5`

### Clue-Guided Money Laundering Group Discovery (Clue2Group)
- arXiv **2606.26189** (Jun 2026) · https://www.alphaxiv.org/abs/2606.26189
- Method: clue-conditioned local context (k-hop + amount-consistent chains/cycles), risk field
  (GNN in paper), evidence-driven greedy group assembly, analyst feedback rounds.
- Results: on two AML benchmarks incl. IBM HI-Small, recovery improves then declines; peak
  around rounds 4–6.
- **Used for:** `clue_expand` with analyst feedback and a stopping rule (graph signals instead
  of GNN). → `06 §6.6`

### Also seen (not used directly)
- TransXion benchmark (2604.17420), BlazingAML (2604.12241), SALT-GNN (2607.10131),
  LineMVGNN (2603.23584), Explainable hybrid AML framework (2609.37155), MAP-Graph (2608.10509),
  MACE (2609.21533), EXG experience graphs (2605.17721) — possible related-work citations for the blog.

## 15.2 Dataset
- IBM Transactions for Anti Money Laundering (Kaggle `ealtman2019/ibm-transactions-for-anti-money-laundering-aml`);
  github.com/IBM/AML-Data. Synthetic, from AMLworld; 8 laundering patterns from AMLSim.
- Underlying paper: Altman et al., "Realistic synthetic financial transactions for anti-money
  laundering models", NeurIPS 2023 (Datasets & Benchmarks).

## 15.3 Problem-size sources
- AML false-positive rates ~85–95%: Flagright, Unit21 and Facctum industry write-ups (citing a BPI
  report), and a 2024 qualitative study in *Future Generation Computer Systems* (Oztas et al.)
  reporting ~90–95% from practitioners. Cite as industry estimates.

## 15.4 FalkorDB documentation (verified Oct 16 2026)
- Algorithms overview: https://docs.falkordb.com/algorithms
- PageRank: https://docs.falkordb.com/algorithms/pagerank
- BFS: https://docs.falkordb.com/algorithms/bfs
- SPpaths: https://docs.falkordb.com/algorithms/sppath · SSpaths: …/sspath · A*: …/astar · MSF: …/msf
- Betweenness: https://docs.falkordb.com/algorithms/betweenness-centrality
- Harmonic centrality: https://docs.falkordb.com/algorithms/harmonic-centrality
- WCC: https://docs.falkordb.com/algorithms/wcc · CDLP: https://docs.falkordb.com/algorithms/cdlp
- MaxFlow: https://docs.falkordb.com/algorithms/maxflow
- Procedures: https://docs.falkordb.com/cypher/procedures
- Indexing: https://docs.falkordb.com/cypher/indexing (vector, full-text sub-pages)
- MCP server: https://docs.falkordb.com/genai-tools/mcpserver · github.com/FalkorDB/FalkorDB-MCPServer
- GraphRAG-SDK: https://docs.falkordb.com/genai-tools/graphrag-sdk · github.com/FalkorDB/GraphRAG-SDK
- QueryWeaver: https://docs.falkordb.com/genai-tools/queryweaver · github.com/FalkorDB/QueryWeaver
- Graphiti: github.com/getzep/graphiti (FalkorDriver)
- Benchmarks (vendor): https://www.falkordb.com/ · https://benchmark.falkordb.com/
- Shortest-path blog (Oct 12 2026): https://www.falkordb.com/blog/shortest-path-dijkstra-a-star-cch/

## 15.5 Hackathon
- Event page: https://www.wemakedevs.org/hackathons/falkordb
- Rules post: https://x.com/WeMakeDevs/status/2109956066121257042

## 15.6 Ideas considered and why not chosen (history)
| Idea | Why not |
|---|---|
| ChronosOps / TraceRoot (incident triage) | Crowded AIOps space; no labeled ground truth |
| PatchPath (vulnerability prioritization) | Real data, but weak visuals and Track 01 only |
| CaseFile / Ghost (agent state) | Technically neat, weak real-world problem — absorbed as features (blackboard, kill-and-resume) |
| Patient Zero (cascade forensics) | Absorbed: algorithms-as-tools |
| Pathogen Zero (outbreak map) | Great visuals, but synthetic-only, heavy build — absorbed: live streaming visualization |
| FinTrace / RingBreaker | Became BankWeave |
