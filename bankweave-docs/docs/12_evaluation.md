# 12 — Evaluation & Scoreboard

Rule: **every number shown anywhere comes from these scripts.** Results saved to
`eval/results/<name>_<commit>.json` and displayed on the scoreboard.

## 12.1 Ground truth
- Transaction-level `Is Laundering` labels from the IBM CSV.
- Account is **illicit** if it's an endpoint of ≥1 laundering transaction (same as SPNSA paper).
- Ring/group truth: laundering attempts from `HI-Small_Patterns.txt` (pattern type + members).
- Ground truth lives in `eval/ground_truth.json` — never loaded into agent-visible graphs.

## 12.2 Splits
- Time-based split: earlier period = dev (tune thresholds), later period = test.
- For the live demo, a smaller connected slice; report which slice.

## 12.3 Experiments

### E1 — Alert triage (main result)
- Alerts from `baseline.py` rules.
- Baseline: escalate every alert.
- BankWeave: escalate only alerts Triage/Investigator turn into cases with confidence ≥ θ.
- Metrics: precision, recall (of illicit accounts among alerted accounts), F1,
  **alert reduction** = 1 − escalated/total, analyst-time proxy (escalations × assumed minutes —
  label as assumption).
- Also run a **no-graph LLM baseline** (LLM sees only the alert row + account's own transactions)
  to show the graph's contribution.

### E2 — Consortium vs single-bank
- Same detectors run on each `bank_<id>` graph vs `consortium`.
- Metric: fraction of laundering attempts spanning ≥2 banks that are detected
  (≥ X% of members flagged) in single-bank vs consortium.
- This is the numerical proof of the "no bank can see the ring alone" thesis.

### E3 — Hunt mode / SPNSA reproduction
- Motif-coherent seeds vs random (mean of 100) vs degree-imbalance, k ∈ {200, 500}, r ∈ {1, 2}.
- Metrics: subgraph size |V|, illicit ratio IR.
- Compare to the paper's HI-Small numbers (random ~2.4%, degree imbalance 13.7%, motif 22.6% at
  k=200, r=1). Report ours honestly, including if different (we use FalkorDB PageRank in place of
  eigenvector centrality).

### E4 — Pass-through matcher
- Precision of flagged accounts being illicit; number of matches; chain-deduplicated value.
- Breakdown by IBM pattern type (should catch stack/chain-like layering better than fan patterns).

### E5 — Clue-guided recovery
- Start from 1–3 clue members of a laundering attempt; measure precision/recall/F1 of recovered
  group per round (1–10), excluding clue nodes. Expect a peak then decline (paper saw rounds 4–6).

### E6 — Trust layer
- **Echo:** seeded cases with redundant paths; naive confidence vs echo-proof; echo rate.
- **Invalidation:** scripted KYC updates; affected-node recall (should be 1.0); stale-action rate (0).
- **Gate:** PF first draft vs final; repairs; divergence rate; small ablation: writer-model-as-auditor
  vs separate auditor on 20 seeded flawed drafts (count wrongly approved).

### E7 — Performance
- Median/P95 latency of each MCP tool on HI-Small consortium and on case graphs.
- Throughput of concurrent case investigations.
- Report hardware. No comparisons to other databases unless we actually ran them.

## 12.4 Scoreboard JSON shape
```json
{ "experiment": "E1_alert_triage", "commit": "abc123", "dataset": "HI-Small", "split": "test",
  "params": {...},
  "results": { "baseline": {"precision":..,"recall":..,"escalated":..},
               "bankweave": {...}, "llm_only": {...} },
  "generated_at": "2026-10-17T..." }
```

## 12.5 Honesty checklist
- State dataset is synthetic.
- State thresholds were tuned on dev split only.
- State where we diverge from papers (e.g. no GNN in clue-guided recovery).
- No "% better" claims without the table that supports them.
