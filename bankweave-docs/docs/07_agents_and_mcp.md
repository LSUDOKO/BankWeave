# 07 — Agents & MCP

## 7.1 Principles

1. **The graph is the blackboard.** Agents never pass large state in chat. They read tasks and
   facts from FalkorDB and write results back. Any agent (or a restarted process) can continue.
2. **Agents call tools; the graph computes.** LLMs plan, choose tools, interpret results and write
   prose. Cypher and `algo.*` do the computation.
3. **Every write is evidence-linked.** No `Claim` without `SUPPORTED_BY` evidence; no `Action`
   without `JUSTIFIED_BY` claims.
4. **Humans approve actions.**

## 7.2 The agents

| Agent | Reads | Writes | Tools it may call |
|---|---|---|---|
| **Orchestrator** | open `Alert`s, `Task`s, case states | `Task` nodes (`triage`, `investigate`, `challenge`, `report`, `archive`) | `list_open_alerts`, `create_task`, `case_status` |
| **Triage** | alert + 2-hop neighborhood | `Decision {cleared, reason}` or `Case` + seed claims | `expand_neighborhood`, `find_islands`, `motif_score`, `shared_identity`, `cross_bank_links`, `recall_similar_cases` |
| **Investigator** | case graph | `Claim`, `Evidence`, `DERIVED_FROM` | `find_rings`, `find_hub`, `find_bridges`, `find_orchestrator`, `trace_flow`, `money_at_risk`, `typology_patterns`, `passthrough_check`, `clue_expand`, `behavior_neighbors`, `kb_query` |
| **Skeptic** | claims + evidence | `CHALLENGED_BY` evidence, `innocent` claims, objection notes | `shared_attr_context` (shared_count), `kyc_lookup` (QueryWeaver), `echo_check`, `kb_query`, `alt_explanations` |
| **Archivist** | closed cases, new alerts | links new alerts to past cases; procedural memory; Graphiti facts | `recall_similar_cases`, `save_procedure`, `graphiti_add`, `graphiti_search` |
| **Reporter** | case claims (active state only) | `SAR` draft, `Sentence`s with `CITES` | `get_case_bundle`, `money_at_risk`, `kb_query` |
| **Auditor** (provenance gate) | SAR + cited evidence | `supported` flags, `pf_score`, divergence report | `audit_sentence` (uses the **stronger, different** LLM) |

The Auditor is a separate model on purpose — see `08_trust_layer.md` (same-model auditing failed
badly in the APG paper).

## 7.3 Blackboard protocol (Tasks in the graph)

```cypher
// create
CREATE (t:Task {id:$id, type:$type, case_id:$case, status:'todo', created_at:timestamp(), payload:$json})

// claim atomically (one agent wins)
MATCH (t:Task {status:'todo', type:$type})
WITH t ORDER BY t.created_at LIMIT 1
SET t.status = 'claimed', t.assignee = $agent, t.claimed_at = timestamp()
RETURN t
```
VERIFY that this pattern is safe under concurrency in FalkorDB (writes are serialized per graph,
so a single query's MATCH+SET should be atomic; still re-check `t.assignee = $agent` after the write).

Done: `SET t.status='done', t.result_ref=$ref`. Stale claims (claimed > N s ago, no heartbeat)
are reset by the Orchestrator → this is what makes **kill-and-resume** work.

## 7.4 LangGraph flow

```
            ┌────────────┐
 alert ───► │ Orchestr.  │◄───────────────────────────┐
            └─────┬──────┘                            │
                  ▼                                   │
            ┌────────────┐  cleared                   │
            │  Triage    ├──────────► Decision (end)  │
            └─────┬──────┘                            │
                  │ case                              │
                  ▼                                   │
            ┌────────────┐                            │
            │Investigator├───► claims ──┐             │
            └────────────┘              ▼             │
                  ▲              ┌────────────┐       │
                  │ rebuttal     │  Skeptic   │       │
                  └──────────────┤ (≤2 rounds)│       │
                                 └─────┬──────┘       │
                                       ▼              │
                                 echo_check +         │
                                 validity check       │
                                       ▼              │
                                 ┌────────────┐       │
                                 │  Reporter  │       │
                                 └─────┬──────┘       │
                                       ▼              │
                                 ┌────────────┐ fail ≤3 repairs
                                 │  Auditor   ├───────┘ (back to Reporter)
                                 └─────┬──────┘
                       publish ◄───────┴──────► divergence report
                                       ▼
                         human approval of actions (UI)
                                       ▼
                                 Archivist (memory)
```

LangGraph state holds only ids (`case_id`, `task_id`, `round`); all content is fetched from
FalkorDB. Use a LangGraph checkpointer only for convenience — the **graph is the source of truth**.

Debate bound: max 2 Skeptic ↔ Investigator rounds per claim.

## 7.5 MCP server (BankWeave tools)

Implement with the official `mcp` Python SDK (FastMCP). Every tool:
- takes `graph` (bank/consortium/case) + typed params,
- runs parameterized Cypher only (no free-form strings into queries),
- writes an `Evidence` node when called with `record=true`, returning its id,
- returns JSON including the `cypher` used (shown in UI "why" panels).

| Tool | Params | Returns |
|---|---|---|
| `list_open_alerts` | limit | alerts |
| `expand_neighborhood` | account_id, depth≤3 | nodes, edges |
| `find_islands` | graph | components summary |
| `find_rings` | graph, max_iter | communities |
| `find_hub` | graph, top_k | accounts + pagerank |
| `find_bridges` | graph, top_k, seed | accounts + betweenness |
| `find_orchestrator` | graph, top_k | accounts + harmonic |
| `trace_flow` | src, dst, max_len, path_count | paths |
| `money_at_risk` | sources[], targets[] | maxFlow, edges |
| `typology_patterns` | account_id, which[] | matches |
| `motif_score` | account_id | score + components |
| `hunt_regions` | k, r | seeds + SPNSA subgraph |
| `passthrough_check` | account_id, params | matched pairs, value |
| `clue_expand` | clue_ids[], negatives[] | proposed members + gains |
| `shared_identity` | account_id | shared attrs + shared_count |
| `cross_bank_links` | account_id | links in consortium |
| `behavior_neighbors` | account_id, k | similar accounts |
| `resolve_entity` | name | phonetic candidates |
| `kyc_lookup` | question (English) | rows via QueryWeaver |
| `kb_query` | question | grounded answer + citations (GraphRAG-SDK) |
| `add_claim` / `add_evidence` / `link` | … | ids |
| `echo_check` | claim_id | paths vs independent sources |
| `invalidate_evidence` | evidence_id, reason | affected claims/actions |
| `premise_check` | statement or action_id | stale premises |
| `recall_similar_cases` | account_id or case_id | past cases |
| `save_procedure` / `get_procedure` | … | procedural memory |
| `case_status` / `get_case_bundle` | case_id | summary |

Also run the official **FalkorDB MCP Server** in read-only mode for ad-hoc Cypher (useful in
Claude Desktop demos: "ask the bank graph anything").

## 7.6 Concurrency demo

Run 3+ investigations at once (different cases, different agents) writing to their own case
graphs and to the shared consortium graph. Show the event stream rate in the UI. This covers
Track 02's "high-concurrency reads and writes".

## 7.7 Prompts (guidelines)

- System prompt for each agent states: role, allowed tools, "never assert without evidence ids",
  "prefer independent sources", output JSON schema.
- Claims must include `evidence_ids`. The tool layer rejects claims without them.
- Skeptic prompt: "Find the most plausible innocent explanation. Cite evidence. If none, say so."
- Reporter prompt: closed-world — "Only use facts from this bundle; each sentence must cite ids."
