# 11 — Frontend (live website)

Goal: judges should **see** the graph working — rings lighting up, beliefs turning amber,
SAR sentences linking to paths — not read about it.

## 11.1 Stack
- Next.js (App Router) + TypeScript + Tailwind
- Graph rendering: **Sigma.js + graphology** (handles thousands of nodes, WebGL) — or
  `react-force-graph` if faster to build
- Live updates: WebSocket from FastAPI, which subscribes to Redis pub/sub `bw:events:*`
- Charts (scoreboard): Recharts or Vega-Lite

## 11.2 Screens

### A. Alert Queue
- Streaming list of alerts with status chips: `open`, `cleared`, `case`.
- Cleared alerts show a one-line reason + "why" popover (tools called, Cypher).
- Counter: "Rule-based would escalate N — BankWeave escalated M."

### B. Network View (the money shot)
- Toggle: **Bank A | Bank B | Bank C | Consortium**.
- Per-bank: sparse fragments, nothing conclusive.
- Consortium: the ring ignites — nodes colored by bank, ring edges animated, hub sized by PageRank,
  bridges outlined by betweenness.
- Side panel: selected node's scores, shared attributes, cases it appears in.

### C. Case Workspace
- Left: claims list with confidence bar, **"N paths · K independent sources"**, validity state badge.
- Center: case graph; clicking a claim highlights its evidence subgraph.
- Right: live agent log (event stream): which agent, which tool, which Cypher, result summary.
- Skeptic challenges shown inline as red callouts.
- Clue-guided expansion: buttons "in ring" / "innocent" on nodes.

### D. SAR Viewer
- Each sentence underlined; hover/click → cited evidence and paths highlight.
- Header: `PF 0.97 · published` or `divergent` badge.
- Divergence report: two columns (Investigator / Skeptic) with evidence trails.
- Export: PDF/Markdown + evidence-chain JSON.

### E. Trust Panel
- Echo view: naive vs echo-proof confidence; paths collapsing into origin bubbles.
- Validity view: nodes colored by state (green active, amber needs_verification,
  grey historical, struck-through superseded).
- Button "Push KYC update" (demo) → watch cascade.

### F. Approvals
- Proposed actions with justification chain; approve/reject; stale-support warning.

### G. Scoreboard
- Precision / recall / F1 / alert reduction: baseline vs BankWeave (alert mode) vs hunt mode.
- SPNSA reproduction table (illicit ratio vs random/degree baselines).
- Trust metrics (echo rate, PF first-draft vs final, divergence rate).
- Every number links to the `eval/results/*.json` file and commit hash that produced it.

### H. Demo Control (hidden route `/demo`)
- Reset to known state; start/stop transaction stream; inject laundering scenario;
- Red-team mode: inject evasive pattern; counterfactual: "Bank B shares data 6 months earlier";
- Kill-agent button (calls backend to stop the agent worker) and resume.

## 11.3 Event schema (pub/sub → WS)
```json
{ "type": "txn|alert|case|claim|evidence|state_change|sar|action|agent_step",
  "graph": "consortium|bank_017|case_2847",
  "id": "…", "ts": 1760600000, "agent": "investigator",
  "data": { … }, "cypher": "optional query string" }
```
Throttle on the client (batch render every 200 ms).

## 11.4 Design direction
- Dark "control-room" theme; bank colors distinct and colorblind-safe; red reserved for rings;
  amber for `needs_verification`.
- Always show "where did this come from?" affordances — it's the product's core value.
- Mobile isn't a priority; the demo is desktop.
