# 08 — Trust Layer (the differentiator)

Three 2026 research results, each turned into graph operations on FalkorDB.
Together: **agents that can't fool themselves.**

| Feature | Failure it prevents | Paper |
|---|---|---|
| Echo-proof confidence | Counting one fact many times because many paths lead to it | GraphEcho (arXiv 2609.17695) |
| Cascading invalidation + premise check | Acting on beliefs whose evidence has been overturned | PACMI (arXiv 2610.05732) |
| Provenance gate + divergence report | A fluent report inventing agreement the evidence doesn't support | Active Provenance Gate (arXiv 2609.31422) |

---

## 8.1 Echo-proof confidence (GraphEcho)

### What the paper found
- A graph agent can reach the **same evidential origin through many paths**. Counting paths as
  independent corroboration distorts judgment.
- Adding redundant supporting paths **raised the rate of repeated evidence visits in all four
  agents tested** (Qwen3 1.7B/4B/8B, GPT-5-mini).
- A deterministic fix — **group equivalent paths by origin before reasoning** ("provenance
  collapse") — took Qwen3-4B accuracy from ~43% (metadata or instructions alone) to ~83% in the
  agentic test. Simply labeling sources or instructing the model to count them barely helped.
- Their trained policy (PAPT) reduced repeats further but **lost source recall** — it stopped
  too early. Lesson: collapse duplicates *and* keep searching for distinct origins.

### BankWeave implementation
Every `Evidence` has an `origin` — the atomic independent fact it rests on:

| Evidence kind | origin |
|---|---|
| Shared device/IP/address | `attr:<attr_id>` |
| Transaction-based path | `txnset:<sorted txn_ids hash>` (or per key txn) |
| Algorithm score | `algo:<name>:<case_id>:<account>` |
| Typology match | `typ:<pattern>:<account>:<window>` |
| KYC fact | `kyc:<row_id>` |
| Document citation | `doc:<chunk_id>` |

Confidence uses **distinct origins**, not path count:
```cypher
MATCH (c:Claim {id:$id})-[:SUPPORTED_BY]->(e:Evidence)
WHERE e.state IN ['active','needs_verification']
RETURN count(e) AS paths, count(DISTINCT e.origin) AS independent_sources,
       collect(DISTINCT e.kind) AS kinds
```
```cypher
MATCH (c:Claim {id:$id})-[:CHALLENGED_BY]->(e:Evidence) WHERE e.state = 'active'
RETURN count(DISTINCT e.origin) AS independent_challenges
```

Confidence formula (documented, simple): weight each distinct origin by kind
(e.g. typology 1.0, path 1.0, algo 0.6, shared_attr 0.8 scaled down by `log(shared_count)`),
sum supports minus challenges, squash to [0,1]. Store `paths`, `independent_sources`,
`confidence` on the `Claim`.

**Grouping before the LLM sees it:** `get_case_bundle` returns evidence **grouped by origin**
with a multiplicity count, so the LLM can't be fooled by repetition.

**Coverage:** Triage/Investigator get a nudge: "independent sources: 1 of N reachable origin
kinds explored — consider checking KYC/typology/flow." (Avoid PAPT's early-stopping trap.)

### Demo moment
Toggle "naive mode": confidence = path count → "6 supporting paths, high confidence".
BankWeave mode → "6 paths, **2 independent sources** — confidence lowered". Show the 6 paths
collapsing into 2 bubbles in the UI.

### Metrics
- Echo rate: repeated-origin evidence / total evidence writes per case.
- Confidence calibration: confidence vs. truth on eval cases (naive vs. echo-proof).

---

## 8.2 Cascading invalidation (PACMI)

### What the paper does
- Memory as a **provenance graph with typed dependency edges**.
- New evidence → classify its relation to existing memories (duplicate / refine / update /
  contradict / temporally-compatible / unrelated) → mark direct targets stale →
  **propagate** along dependency edges with a **four-state validity lattice**:
  `active` → `needs_verification` → `historical_only` → `superseded`.
- **Non-destructive:** old records are kept for history.
- **Premise check** before answering: detect questions/actions assuming an outdated fact.
- Results on their benchmark (100 cases, 300 queries): **99%** final accuracy vs **90%** for the
  best baseline (significant). Destructive in-place rewriting collapsed historical-question
  accuracy to **42%**. Honest caveats: cascading mainly improved memory-state correctness; its
  answer-level effect was not significant at their scale; dependency edges were given, not induced.

### BankWeave implementation

Validity states on `Evidence`, `Claim`, `Action`, `SAR`:
`active | needs_verification | historical_only | superseded` (strength order for "stronger wins").

Edge → downstream state map:
| Edge (downstream → upstream) | Upstream becomes superseded ⇒ downstream becomes |
|---|---|
| `Claim -SUPPORTED_BY-> Evidence` | `needs_verification` |
| `Claim -DERIVED_FROM-> Claim` | `needs_verification` |
| `Action -JUSTIFIED_BY-> Claim` | `needs_verification` (action flagged for human review) |
| `Sentence -CITES-> Evidence/Claim` | `needs_verification`; SAR → `needs_verification` |
| `Claim -CHALLENGED_BY-> Evidence` | no change to claim state; recompute confidence |

Supersede + cascade (single-hop types shown; run up to depth 5):
```cypher
MATCH (e:Evidence {id:$id})
SET e.state = 'superseded', e.superseded_at = timestamp(), e.superseded_reason = $reason
WITH e
OPTIONAL MATCH (c:Claim)-[:SUPPORTED_BY|DERIVED_FROM*1..5]->(e)
SET c.state = CASE WHEN c.state = 'superseded' THEN c.state ELSE 'needs_verification' END
WITH e, collect(DISTINCT c) AS claims
UNWIND claims AS c
OPTIONAL MATCH (a:Action)-[:JUSTIFIED_BY]->(c)
SET a.state = 'needs_verification'
WITH claims, collect(DISTINCT a) AS actions
RETURN [x IN claims | x.id] AS affected_claims, [x IN actions | x.id] AS affected_actions
```
(Implement in Python as BFS over typed edges if variable-length mixed-type patterns misbehave;
VERIFY performance.)

Add the new fact as its own evidence and link: `(new:Evidence)-[:SUPERSEDES {reason}]->(old)`.

Relation classification (LLM, constrained): when new KYC/identity facts arrive, compare to
existing evidence on the same subject; only `update`/`contradict` create direct targets.

**Premise check** (before any answer or action):
```cypher
MATCH (a:Action {id:$id})-[:JUSTIFIED_BY]->(c:Claim)
OPTIONAL MATCH (c)-[:SUPPORTED_BY|DERIVED_FROM*1..5]->(e:Evidence {state:'superseded'})
RETURN c.id, collect(e.id) AS stale_support
```
If stale support exists, the agent says so: "This freeze rests on evidence superseded at <ts>
(<reason>). Re-verify before acting."

**History preserved:** queries asking "what did we believe on <date>" filter by timestamps, not
by current state.

### Demo moment
Live push of a KYC update: "Address A-77 is a 200-unit residential building." → the shared-address
evidence is superseded → 3 claims, 1 freeze recommendation and the SAR draft turn **amber**
(`needs_verification`) in the UI; an analyst asks "why is this account still frozen?" → premise check answers.

### Metrics
- Affected-node recall on scripted invalidation scenarios (should be 1.0 — verifies correctness).
- Stale-action rate: actions approved while resting on superseded evidence (should be 0).

---

## 8.3 Provenance gate on the SAR (Active Provenance Gate)

### What the paper found
- When several agents debate and one model summarizes, the summary often **fabricates consensus**.
- APG: closed evidence corpus → proposer writes → **auditor checks each sentence (NLI entailment)** →
  publish only if **provenance fidelity PF ≥ 0.95** (PF = supported sentences / total) →
  else up to **3 repair** rounds → else output a **divergence report** listing unresolved claims
  and conflicting sources.
- Baseline PF was very low (0.18–0.29) in their conflict scenarios; repair raised it to ~0.59–0.62;
  many runs still correctly ended in divergence reports.
- **Same model as writer and auditor wrongly approved unsafe summaries 85.6% of the time**;
  a stronger, different auditor fixed much of this.
- User study (N=33): 75.8% judged the divergence output more faithful; trust was significantly
  higher for the honest divergence report in the hard scenario. Caveat: synthetic testbed, small N.

### BankWeave implementation
1. **Bundle (closed world):** `get_case_bundle(case_id)` → active claims, evidence grouped by
   origin, paths, typology citations, money-at-risk figure, Skeptic objections. Each item has an id.
2. **Reporter** (writer model) drafts the SAR as JSON sentences:
   `[{text, cites:[ids]}]`. Sections: subject summary, activity summary, typologies matched,
   money flow, cross-bank links, evidence list, unresolved points, recommended actions.
3. **Auditor** (different, stronger model): for each sentence, given only its cited items,
   judge `supported | unsupported` (entailment). Code-level checks first: every cite id exists,
   is `active`, and belongs to this case — missing → unsupported without calling the LLM.
4. `pf = supported / total`. If `pf ≥ 0.95` → publish (`SAR.status='published'`).
5. Else send `unsupported_sentences` back to Reporter as a correction hint; max 3 iterations.
6. Still failing → `SAR.status='divergent'` + **divergence report**: unresolved claims, Investigator
   vs Skeptic positions, each with evidence paths.

Graph write:
```cypher
CREATE (s:SAR {id:$sar, case_id:$case, status:$status, pf_score:$pf, version:$v, created_at:timestamp()})
WITH s
UNWIND $sentences AS x
CREATE (s)-[:CONTAINS]->(t:Sentence {id:x.id, text:x.text, supported:x.supported, order:x.order})
WITH t, x
UNWIND x.cites AS cid
MATCH (n) WHERE (n:Evidence OR n:Claim) AND n.id = cid
CREATE (t)-[:CITES]->(n)
```

### UI
Click any SAR sentence → its cited evidence and paths highlight on the graph. Divergence report
shows two columns (Investigator / Skeptic) with evidence trails.

### Metrics
- PF of first draft vs final; repair count; divergence rate.
- Writer-as-auditor vs separate auditor approval rate on seeded bad drafts (small ablation —
  great blog material).

---

## 8.4 Action safety
- Actions are `proposed` by agents; only a human click sets `approved`.
- Approval UI shows the action's justification chain, confidence, independent-source count and
  any `needs_verification` warnings. Approving with stale support requires an explicit override note.

## 8.5 Export
`GET /claims/{id}/evidence_chain` → JSON of the full chain (claim → derived claims → evidence →
paths → transactions → Cypher used). "This is what an auditor would review."
