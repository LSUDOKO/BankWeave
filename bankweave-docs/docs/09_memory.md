# 09 — Memory (Track 02)

Track 02 asks for: episodic, semantic and procedural memory; persistent history; shared state and
handoffs; high-concurrency reads/writes; separate memory per user or tenant. BankWeave covers
each with something that does real work.

| Requirement | BankWeave feature |
|---|---|
| Episodic | `Event` timeline per case (`(:Case)-[:HAD_EVENT]->(:Event)-[:NEXT]->(:Event)`); full replay |
| Semantic | `Claim`/`Evidence` with validity states; Graphiti facts about entities over time |
| Procedural | `procedures` graph: successful investigation strategies, reused on similar cases |
| Persistent history | Everything in FalkorDB; nothing important lives in process memory |
| Shared state & handoffs | Task blackboard; any agent picks up any task |
| High concurrency | Several cases investigated in parallel, all writing to FalkorDB |
| Separate memory per tenant | `bank_<id>` graphs, `case_<id>` graphs |
| Memory that updates | Cascading invalidation (see `08_trust_layer.md`) |

## 9.1 Episodic memory

Every agent step appends an `Event`:
```cypher
MATCH (c:Case {id:$case})
OPTIONAL MATCH (c)-[:HAD_EVENT]->(last:Event) WHERE NOT (last)-[:NEXT]->()
CREATE (e:Event {id:$id, ts:timestamp(), agent:$agent, action:$action, payload:$json})
CREATE (c)-[:HAD_EVENT]->(e)
FOREACH (_ IN CASE WHEN last IS NULL THEN [] ELSE [1] END | CREATE (last)-[:NEXT]->(e))
```
UI: case timeline with replay (step through events; graph highlights what each step touched).

## 9.2 Kill-and-resume ("the agent lives in the graph")

1. Agents hold only ids in memory.
2. Tasks claimed but not finished have `claimed_at`; agents write a heartbeat (`t.hb = timestamp()`).
3. On startup (or when the Orchestrator sees a stale heartbeat), reset `claimed` → `todo`.
4. The new agent reads the case bundle + last events and continues.

Demo: during an investigation, kill the agent container (`docker kill`) → restart → say
"resume case 2847" → the agent summarizes from the graph ("3 claims, 1 open challenge; next step:
trace flow from A to hub") and continues.

## 9.3 Procedural memory

When a case closes with a confirmed outcome (analyst approves SAR or clears), the Archivist saves
the **tool sequence that worked**:
```
(:Procedure {id, name, typology, success_count, fail_count})
  -[:STEP {order}]->(:Step {tool, params_template, why})
(:Step)-[:FAILED_BEFORE]->(:Pitfall {note})       // e.g. "betweenness on full graph timed out; run on case graph"
(:Procedure)-[:LEARNED_FROM]->(case ids as property)
```
On a new case, `get_procedure(typology_guess)` returns the best procedure; the Investigator
follows it (and the UI shows "using procedure P-3, learned from cases 112, 140").

## 9.4 Graphiti temporal facts

Use Graphiti (FalkorDB driver, separate graph `graphiti_mem`) for **facts that change over time**
about people/accounts/addresses — e.g. ownership changes, address changes, analyst decisions.
- Add episodes from KYC updates and case closures.
- Query before investigations: "what do we know about this person, as of now and historically?"
- Graphiti's bi-temporal model + automatic invalidation complements our own validity lattice
  (Graphiti for entity facts; our lattice for investigation claims/actions).

Keep Graphiti optional behind a flag; if it slows us down, our own `OWNS {valid_from, valid_to}`
edges already demonstrate temporal facts.

## 9.5 Cross-case memory (Archivist)

When a new alert arrives:
```cypher
MATCH (a:Account {id:$acc})<-[:ABOUT]-(c:Claim)<-[:HAS_CLAIM]-(k:Case)
RETURN k.id, k.status, collect(c.text)[0..3] AS prior_claims
```
(mirror case summaries + `ABOUT` links into `consortium` so this works across case graphs).
UI: "This account appeared in Case 112 (closed, SAR filed)."

## 9.6 Isolation demo
Open two bank sessions side by side: Bank A's analyst sees only `bank_A`; Bank B's only `bank_B`;
the consortium analyst sees hashed cross-bank structure. One FalkorDB instance.
