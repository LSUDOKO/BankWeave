# 06 — Detection Engine

Detection has four layers. Each produces `Evidence` nodes with an `origin` (see
`08_trust_layer.md`) and the exact `cypher` that produced it.

1. **Typology patterns** — classic laundering shapes in Cypher.
2. **Native algorithms** — network science via `algo.*`.
3. **Research detectors** — motif-scored seeds + shortest-path investigation subgraphs;
   pass-through matching; clue-guided ring recovery.
4. **Identity & behavior** — shared attributes, phonetic name matching, vector behavior similarity.

All thresholds live in `detection/config.yaml` so they're tunable and documented.

---

## 6.1 Typology patterns (Cypher)

Parameters: `$id`, `$window` (seconds), `$thr` (reporting threshold, e.g. 10000), `$k` (hops).

**Circular flow (money returns to origin, time-ordered)**
```cypher
MATCH p = (a:Account {id:$id})-[ts:TRANSFERS*2..6]->(a)
WHERE all(i IN range(0, size(ts)-2) WHERE ts[i].ts < ts[i+1].ts)
  AND ts[-1].ts - ts[0].ts <= $window
RETURN p LIMIT 20
```

**Fan-out (one → many, short window)**
```cypher
MATCH (a:Account {id:$id})-[t:TRANSFERS]->(b:Account)
WITH a, t ORDER BY t.ts
WITH a, collect(t) AS ts
UNWIND range(0, size(ts)-1) AS i
WITH a, ts[i] AS t0, [x IN ts WHERE x.ts >= ts[i].ts AND x.ts <= ts[i].ts + $window] AS burst
WHERE size(burst) >= $min_fan
RETURN a.id, t0.ts AS start, size(burst) AS fan LIMIT 5
```
Fan-in: same with direction reversed.

**Structuring (repeated amounts just under threshold)**
```cypher
MATCH (a:Account {id:$id})-[t:TRANSFERS]->()
WHERE t.amount >= $thr * 0.85 AND t.amount < $thr
RETURN a.id, count(t) AS near_threshold, collect(t.txn_id)[0..20] AS txns
```

**Rapid pass-through (in then out, similar amount, short gap)** — quick Cypher version;
the exact matcher is in 6.5.
```cypher
MATCH (s)-[i:TRANSFERS]->(x:Account {id:$id})-[o:TRANSFERS]->(d)
WHERE o.ts > i.ts AND o.ts - i.ts <= $gap
  AND i.cur_recv = o.cur
  AND abs(o.amount - i.amount_recv) / CASE WHEN o.amount > i.amount_recv THEN o.amount ELSE i.amount_recv END <= 0.01
RETURN i.txn_id, o.txn_id, i.amount_recv, o.amount LIMIT 50
```

**Shared identity**
```cypher
MATCH (a:Account {id:$id})-[:USES_DEVICE|USES_IP|REGISTERED_AT]->(x)<-[:USES_DEVICE|USES_IP|REGISTERED_AT]-(b:Account)
WHERE a <> b
RETURN labels(x)[0] AS kind, x.id AS attr, x.shared_count AS shared, collect(DISTINCT b.id) AS others
```
`shared_count` matters: a 200-unit apartment address is weak evidence (Skeptic uses this).

**Follow the money (bounded)**
```cypher
MATCH p = (a:Account {id:$id})-[:TRANSFERS*1..$k]->(b:Account)
RETURN p LIMIT 50
```
(Variable-length bounds must be literals in many Cypher engines — build the string with a
validated integer, never interpolate user input.)

---

## 6.2 Native algorithms as tools

See exact syntax in `05_falkordb_reference.md`. Wrap each in `detection/algorithms.py`, run on
the **case graph** (copied subgraph) when possible so results are local and fast.

| Tool | Algorithm | Output written as Evidence |
|---|---|---|
| `find_islands` | `algo.wcc` | `{componentId, size, has_cross_bank}` — size-1/clean components → clear |
| `find_rings` | `algo.labelPropagation` | `{communityId, members, internal_flow}` |
| `find_hub` | `algo.pageRank('Account','TRANSFERS')` | top-k `{account, score}` |
| `find_bridges` | `algo.betweenness({..., samplingSeed: 42})` | top-k `{account, score}` |
| `find_orchestrator` | `algo.HarmonicCentrality` | top-k `{account, score, reachable}` |
| `money_at_risk` | `algo.maxFlow` source=flagged, target=hub | `{maxFlow, edges, edgeFlows}` → dollar figure for SAR |
| `trace_flow` | `algo.SPpaths` (weight = hop or `ts` gap) | the path — **primary evidence for claims** |
| `reach` | `algo.SSpaths` | reachable accounts within cost |
| `expand_neighborhood` | `algo.bfs(node, 2, 'TRANSFERS')` | neighborhood ids |
| `backbone` | `algo.MSF` | simplified ring for UI |

Copy-to-case-graph pattern (Python): query consortium for the case subgraph (nodes+edges),
then `UNWIND` into `case_<id>` with same ids. Algorithms then operate only on the case.

---

## 6.3 Motif score (paper 2610.13280, "Feed-Guided Shortest Paths")

Per-account suspicion score from local structure only (no labels):

```
recip(v)  = |In(v) ∩ Out(v)|                          reciprocal counterparties
relay(v)  = |In(v)| · |Out(v)|                        pass-through potential
cycle3(v) = Σ_{w∈Out(v)} |Out(w) ∩ In(v)|             directed 3-cycles through v
fanin(v)  = |In(v)|  if |In(v)|  ≥ τ·(|Out(v)|+1) else 0
fanout(v) = |Out(v)| if |Out(v)| ≥ τ·(|In(v)|+1)  else 0
leaf(v)   = #neighbors with total degree ≤ d_leaf
s(v) = log(1+cycle3) + α·log(1+recip) + β·log(1+relay)
     + s_in·log(1+fanin) + s_out·log(1+fanout) + s_leaf·log(1+leaf) − γ·log(1+deg)
```

Paper's parameters for IBM HI-Small/HI-Medium: α=0.2, β=0.3, γ=0.8, τ=15.0, s_in=0.3,
s_out=0.4, s_leaf=0.6, d_leaf=2, candidate pool C=300k (top by in_deg·out_deg),
d_max=2, centers m=5. (Elliptic: s_in=0.5, m=7; LI-Small: τ=27, s_in=0.2.)

Operate on a **simple directed graph** (collapse multi-edges) as the paper does.

Cypher pieces (compute on candidate pool, write `motif_score` to `Account`):
```cypher
// recip: counterparties that both send to and receive from v
MATCH (u:Account)-[:TRANSFERS]->(v:Account {id:$id})-[:TRANSFERS]->(u)
RETURN count(DISTINCT u) AS recip

// cycle3: directed 3-cycles through v  (v -> w -> u -> v)
MATCH (v:Account {id:$id})-[:TRANSFERS]->(w)-[:TRANSFERS]->(u)-[:TRANSFERS]->(v)
RETURN count(DISTINCT [w, u]) AS cycle3

// leaf: neighbors with tiny total degree
MATCH (v:Account {id:$id})-[:TRANSFERS]-(n:Account)
WHERE n.in_deg + n.out_deg <= 2
RETURN count(DISTINCT n) AS leaf
```
For the full pool, computing in Python over an exported adjacency list is fine (it's a
precompute), but **write the scores back to FalkorDB** and expose them as a tool.

### Coherent seed selection (Algorithm 2 in the paper)
1. Rank candidates by `s(v)`.
2. Take top `m` as centers.
3. For each center, add top-scoring nodes within undirected distance ≤ `d_max` until feed size `k`.
4. Fill remaining slots with top-ranked nodes.

### Shortest-path investigation subgraph (SPNSA)
For each seed `s`: take its out-ego network within radius `r`; pick intermediaries = max
betweenness and max eigenvector-like node (use PageRank as the in-DB substitute and say so);
add shortest paths `s → intermediaries` and `s → other seeds` inside the ego network; union all.

FalkorDB mapping: ego network via `algo.bfs`/bounded MATCH → copy to temp graph → `algo.betweenness`
+ `algo.pageRank` → `algo.SPpaths` for each pair.

### What the paper reported (IBM HI-Small, k=200, r=1)
| Feed | Subgraph nodes | Illicit ratio |
|---|---|---|
| Random (mean of 100) | ~368 | 2.4% |
| Degree imbalance | 255 | 13.7% |
| **Motif coherent** | 296 | **22.6%** |
| Label-informed upper bound | 423 | 72.6% |

Also: on **LI-Small** degree imbalance beat the motif score (11.4% vs 5.5%) — use HI-Small, and
report the LI result honestly if you run it. Most enrichment comes from the seed choice itself.
Paper code: github.com/koshimbetovv/spnsa-feed-selection.

**BankWeave use:** proactive "Hunt" mode — find suspicious regions without any alert, and give
Triage/Investigator a ranked, compact subgraph. Report our reproduced numbers on the scoreboard.

---

## 6.4 Proactive hunt vs alert-driven
- **Alert-driven:** baseline rules raise alerts → agents triage.
- **Hunt mode:** motif seeds + SPNSA produce candidate regions → agents open cases.
Show both; the scoreboard compares them.

---

## 6.5 Pass-through matching (paper 2609.20737)

Exact, auditable layering detector. For each account `x` with ≥ m_min in and out edges:

- Candidate pairs `(e_in, e_out)` qualify if:
  1. same asset (`e_in.cur_recv = e_out.cur`)
  2. `0 < e_out.ts − e_in.ts ≤ T̄`
  3. `sim = 1 − |p_out − p_in| / max(p_in, p_out) ≥ ε_sim`
  4. `min(p_in, p_out) ≥ p_min`
- Solve **maximum-cardinality, maximum-weight bipartite matching** (weights = sim) so each
  transaction is used once: `networkx.max_weight_matching(G, maxcardinality=True)`.
- Flag `x` if matched pairs ≥ `m_min`.

Paper's parameters (Ethereum): T̄ ≈ 3.3–3.6 h, ε_sim = 0.99, p_min = 5000, m_min = 3.
For IBM data, start with T̄ = 24 h, ε_sim = 0.98, p_min = 1000, m_min = 3 and tune on dev split.

Write back:
```cypher
MATCH (x:Account {id:$x})
SET x.passthrough_pairs = $m, x.passthrough_value = $value
```
plus an `Evidence {kind:'passthrough', payload: pairs-json, origin: 'pt:'+x}`.

**Chain de-duplication** (paper Appendix A): link matched pairs where one pair's outgoing edge is
the next pair's incoming edge; each chain contributes `min over chain of min(p_in,p_out)` once.
Use this for an honest "value laundered" figure.

Paper result: on public Ethereum data, 283 pass-through nodes forming one connected 1,690-address
network; six OFAC-sanctioned addresses inside; >$260M moved; runtime <2 s.

---

## 6.6 Clue-guided ring recovery (paper 2606.26189)

Investigation starts from a **clue** (flagged account/transaction) and grows the group.

BankWeave version (no GNN — use graph signals):
1. **Context:** k-hop neighborhood of clue nodes + chain/cycle paths whose amounts are
   consistent (coefficient of variation of amounts along the path ≤ ε_cv) — paper's
   structure-aware context construction.
2. **Risk field:** for each node in context, `risk = w1·norm(motif_score) + w2·norm(pagerank_in_case)
   + w3·norm(passthrough_pairs) + w4·behavior_similarity_to_clue`.
3. **Greedy assembly:** start with clue set; repeatedly add the 1-hop boundary node with highest
   marginal gain (risk + structural cohesion + prior-pattern match); stop when gain < θ.
4. **Analyst loop:** analyst clicks "in ring" / "innocent" → stored as `(:Analyst)-[:LABELED {as}]->(:Account)`
   in the case graph → re-run with negatives excluded and their neighbors down-weighted.
5. **Stopping rule:** paper found performance peaked around rounds 4–6 then precision fell as
   the candidate space grew. Cap rounds, and stop early when gain flattens.

---

## 6.7 Identity & behavior

- **Phonetic names:** `db.idx.fulltext.queryNodes('Person', $name)` → candidates → `SAME_AS {confidence, method:'phonetic'}`.
- **Vector behavior:** `db.idx.vector.queryNodes('Account','behavior_vec',10,vecf32($v))` →
  "accounts that behave like this mule". Evidence kind `behavior_similarity`.
- **Shared attributes** with `shared_count` weighting (Skeptic uses high counts as an innocent explanation).

---

## 6.8 Baseline alert rules (for comparison only)

Simple rules a legacy system would use, implemented in `services/baseline.py`:
- single transfer > threshold
- ≥ 3 transfers in 24 h near threshold
- new counterparty + large amount
- high-risk payment format (as configured)

These generate the alert queue and act as the **baseline** in evaluation.
