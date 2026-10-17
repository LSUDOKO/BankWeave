# Cypher queries used by BankWeave

Generated from the query registry (`backend/app/cypher.py`) by `scripts/gen_queries_md.py`. Every query the product runs is declared with `cy(name, purpose, text)`, so this file matches the code.

**144 queries** across 29 modules. Native algorithms used: `algo.wcc`, `algo.labelPropagation`, `algo.pageRank`, `algo.betweenness`, `algo.HarmonicCentrality`, `algo.SPpaths`, `algo.SSpaths`, `algo.maxFlow`, `algo.bfs`, `algo.MSF`; indexes: range, full-text (Double Metaphone phonetic, English stemming), vector (HNSW, cosine).

Not native in FalkorDB, done in plain Cypher instead: degree (precomputed), cycles (time-respecting iterative expansion), triangles / 3-cycles (motif score).

## `agents.archivist`

### archivist_actions

Decided actions of a case

```cypher
MATCH (a:Action) RETURN a.kind AS kind, a.status AS status
```

### archivist_typologies

Typologies matched in a case

```cypher
MATCH (e:Evidence {kind:'typology_match'}) WHERE e.state = 'active'
RETURN DISTINCT split(e.origin, ':')[1] AS typology
```

## `agents.blackboard`

### task_claim_atomic

Claim the oldest todo task of the given types (one winner)

```cypher
MATCH (t:Task {status:'todo'}) WHERE t.type IN $types
WITH t ORDER BY t.created_at LIMIT 1
SET t.status = 'claimed', t.assignee = $agent, t.claimed_at = timestamp(),
    t.hb = timestamp(), t.attempts = t.attempts + 1
RETURN t.id AS id, t.type AS type, t.case_id AS case_id, t.alert_id AS alert_id,
       t.payload AS payload, t.assignee AS assignee, t.round AS round
```

### task_create

Put a task on the blackboard

```cypher
CREATE (t:Task {id:$id, type:$type, case_id:$case, alert_id:$alert, status:'todo',
                created_at:timestamp(), payload:$payload, attempts:0, round:$round})
RETURN t.id AS id
```

### task_done

Mark a task done with a result reference

```cypher
MATCH (t:Task {id:$id}) SET t.status = 'done', t.done_at = timestamp(), t.result = $result
```

### task_fail

Return a failed task to the queue (or park it after 3 attempts)

```cypher
MATCH (t:Task {id:$id})
SET t.status = CASE WHEN t.attempts >= 3 THEN 'failed' ELSE 'todo' END,
    t.error = $error, t.assignee = null
```

### task_heartbeat

Worker heartbeat on a claimed task

```cypher
MATCH (t:Task {id:$id, assignee:$agent, status:'claimed'}) SET t.hb = timestamp()
RETURN t.id AS id
```

### task_pending_for_case

Open tasks of a case

```cypher
MATCH (t:Task) WHERE t.case_id = $case AND t.status IN ['todo', 'claimed']
RETURN t.id AS id, t.type AS type, t.status AS status, t.assignee AS assignee
```

### task_reset_stale

Reset tasks whose worker stopped heart-beating

```cypher
MATCH (t:Task {status:'claimed'}) WHERE t.hb < timestamp() - $stale_ms
SET t.status = 'todo', t.reset_from = t.assignee, t.assignee = null, t.resets = coalesce(t.resets, 0) + 1
RETURN t.id AS id, t.type AS type, t.case_id AS case_id, t.reset_from AS from_agent
```

### task_stats

Blackboard counts by type and status

```cypher
MATCH (t:Task) RETURN t.type AS type, t.status AS status, count(t) AS n
```

## `agents.investigator`

### case_claims_list

Claims of a case

```cypher
MATCH (c:Claim) RETURN c.id AS id, c.kind AS kind, c.text AS text, c.about AS about,
       c.confidence AS confidence, c.state AS state
```

### case_evidence_list

Evidence gathered so far in a case

```cypher
MATCH (e:Evidence) WHERE e.state <> 'superseded'
RETURN e.id AS id, e.kind AS kind, e.origin AS origin, e.summary AS summary,
       e.accounts AS accounts, e.author_agent AS author
```

### case_info

Seed account and title of a case

```cypher
MATCH (c:Case) RETURN c.id AS id, c.seed_account AS seed, c.title AS title
```

### case_members

Accounts in a case graph ranked by motif score

```cypher
MATCH (a:Account) WHERE a.bank_id IS NOT NULL
RETURN a.id AS id, a.bank_id AS bank, coalesce(a.motif_score, 0.0) AS motif
ORDER BY motif DESC
```

### claim_matches_typology

Link a claim to a named typology (mirrored)

```cypher
MATCH (c:Claim {id:$claim})
MERGE (t:Typology {id:$typology}) SET t.name = $name, t.source_doc = $chunk
MERGE (c)-[m:MATCHES_TYPOLOGY]->(t) SET m.score = $score
```

## `agents.orchestrator`

### orchestrator_untasked_alerts

Open alerts that have no triage task yet

```cypher
MATCH (al:Alert {status:'open'}) WHERE al.tasked IS NULL
WITH al ORDER BY al.ts LIMIT $limit
SET al.tasked = timestamp()
RETURN al.id AS id
```

## `agents.skeptic`

### skeptic_claims_support

Claims with their supporting evidence

```cypher
MATCH (c:Claim) WHERE c.kind <> 'innocent' AND c.state <> 'superseded'
OPTIONAL MATCH (c)-[:SUPPORTED_BY]->(e:Evidence)
RETURN c.id AS id, c.text AS text, c.kind AS kind, c.about AS about,
       collect({id:e.id, kind:e.kind, origin:e.origin, payload:e.payload,
                summary:e.summary}) AS support
```

## `agents.triage`

### alert_clear

Clear an alert with a reason (Decision node)

```cypher
MATCH (al:Alert {id:$id})
SET al.status = 'cleared', al.reason_cleared = $reason, al.cleared_by = $by,
    al.decided_at = timestamp(), al.signals = $signals
CREATE (d:Decision {id:'D-' + $id, outcome:'cleared', reason:$reason, ts:timestamp(),
                    agent:$by})
CREATE (al)-[:DECIDED]->(d)
```

### alert_existing_case

Open case already covering an account

```cypher
MATCH (a:Account {id:$id})<-[:CONCERNS]-(c:Case) WHERE c.status <> 'closed'
RETURN c.id AS id LIMIT 1
```

### alert_get

Read one alert

```cypher
MATCH (al:Alert {id:$id}) RETURN al.id AS id, al.account_id AS account, al.bank_id AS bank,
       al.rule AS rule, al.reason AS reason, al.status AS status
```

### alert_merge_into_case

Attach an alert to an existing case

```cypher
MATCH (al:Alert {id:$alert}), (c:Case {id:$case})
SET al.status = 'case', al.case_id = $case, al.reason_cleared = null
MERGE (c)-[:OPENED_FROM]->(al)
```

### case_concerns_accounts

Link a case to the accounts it covers

```cypher
MATCH (c:Case {id:$case})
UNWIND $ids AS aid
MATCH (a:Account {id:aid})
MERGE (c)-[:CONCERNS]->(a)
```

## `app.routers.actions`

### action_decide

Record a human decision on an action

```cypher
MATCH (a:Action {id:$id})
SET a.status = $status, a.approved_by = $by, a.decided_at = timestamp(), a.note = $note,
    a.override_stale = $override
RETURN a.id AS id, a.kind AS kind, a.status AS status
```

### api_actions_pending

Proposed actions across all cases

```cypher
MATCH (k:Case) WHERE k.status IN ['awaiting_approval', 'open']
RETURN k.id AS case_id, k.title AS title
```

### api_case_actions_for_approval

Actions with justification for approval UI

```cypher
MATCH (a:Action)
OPTIONAL MATCH (a)-[:JUSTIFIED_BY]->(c:Claim)
RETURN a.id AS id, a.kind AS kind, a.status AS status, a.state AS state, a.target AS target,
       a.rationale AS rationale, collect({id:c.id, text:c.text, confidence:c.confidence,
       sources:c.independent_sources, paths:c.paths, state:c.state}) AS claims
```

### api_case_open_actions

Undecided actions in a case

```cypher
MATCH (a:Action {status:'proposed'}) RETURN count(a) AS n
```

## `app.routers.alerts`

### api_alert_detail

One alert with triage signals

```cypher
MATCH (al:Alert {id:$id})
RETURN al.id AS id, al.account_id AS account, al.bank_id AS bank, al.rule AS rule,
       al.reason AS reason, al.status AS status, al.ts AS ts, al.case_id AS case_id,
       al.reason_cleared AS cleared_reason, al.signals AS signals
```

### api_alerts_counts

Alert counts by status

```cypher
MATCH (al:Alert) RETURN al.status AS status, count(al) AS n
```

### api_alerts_list

Alert queue with status and decision

```cypher
MATCH (al:Alert) WHERE $status IS NULL OR al.status = $status
OPTIONAL MATCH (al)-[:DECIDED]->(d:Decision)
RETURN al.id AS id, al.account_id AS account, al.bank_id AS bank, al.rule AS rule,
       al.reason AS reason, al.status AS status, al.ts AS ts, al.case_id AS case_id,
       al.reason_cleared AS cleared_reason, al.decided_at AS decided_at
ORDER BY coalesce(al.decided_at, 0) DESC, al.ts DESC
SKIP $skip LIMIT $limit
```

## `app.routers.cases`

### api_case_actions

Actions with justification

```cypher
MATCH (a:Action)
OPTIONAL MATCH (a)-[:JUSTIFIED_BY]->(c:Claim)
RETURN a.id AS id, a.kind AS kind, a.status AS status, a.state AS state, a.target AS target,
       a.rationale AS rationale, a.approved_by AS approved_by, a.note AS note,
       collect(c.id) AS claims, a.ts AS ts
ORDER BY ts
```

### api_case_claims

Claims with echo-proof numbers and state

```cypher
MATCH (c:Claim)
OPTIONAL MATCH (c)-[:SUPPORTED_BY]->(e:Evidence)
OPTIONAL MATCH (c)-[:CHALLENGED_BY]->(x:Evidence)
OPTIONAL MATCH (c)-[:DERIVED_FROM]->(p:Claim)
RETURN c.id AS id, c.text AS text, c.kind AS kind, c.state AS state, c.about AS about,
       c.confidence AS confidence, c.naive_confidence AS naive_confidence, c.paths AS paths,
       c.independent_sources AS independent_sources,
       c.independent_challenges AS independent_challenges, c.author_agent AS author,
       collect(DISTINCT e.id) AS evidence, collect(DISTINCT x.id) AS challenges,
       collect(DISTINCT p.id) AS derived_from, c.created_at AS created_at
ORDER BY created_at
```

### api_case_evidence

All evidence of a case including superseded history

```cypher
MATCH (e:Evidence)
OPTIONAL MATCH (n:Evidence)-[s:SUPERSEDES]->(e)
RETURN e.id AS id, e.kind AS kind, e.origin AS origin, e.summary AS summary, e.state AS state,
       e.accounts AS accounts, e.cypher AS cypher, e.author_agent AS author,
       e.created_at AS created_at, e.superseded_reason AS superseded_reason,
       e.superseded_at AS superseded_at, collect(n.id) AS superseded_by
ORDER BY created_at
```

### api_case_graph_edges

Transfers of a case graph for the UI

```cypher
MATCH (s:Account)-[t:TRANSFERS]->(d:Account)
RETURN s.id AS source, d.id AS target, t.txn_id AS txn_id, t.amount AS amount, t.ts AS ts
```

### api_case_graph_nodes

Accounts of a case graph for the UI

```cypher
MATCH (a:Account) WHERE a.bank_id IS NOT NULL
RETURN a.id AS id, a.bank_id AS bank, coalesce(a.motif_score, 0.0) AS motif,
       coalesce(a.pagerank_global, 0.0) AS pagerank
```

### api_cases_list

Cases with headline numbers

```cypher
MATCH (c:Case)
OPTIONAL MATCH (c)-[:OPENED_FROM]->(al:Alert)
OPTIONAL MATCH (c)-[:CONCERNS]->(a:Account)
RETURN c.id AS id, c.status AS status, c.title AS title, c.opened_at AS opened_at,
       c.seed_account AS seed, count(DISTINCT al) AS alerts, count(DISTINCT a) AS accounts,
       collect(DISTINCT a.bank_id) AS banks
ORDER BY opened_at DESC
```

### api_evidence_chain

Full chain behind a claim: claims, evidence, queries

```cypher
MATCH (c:Claim {id:$id})
OPTIONAL MATCH (c)-[:DERIVED_FROM*0..5]->(k:Claim)
OPTIONAL MATCH (k)-[r:SUPPORTED_BY|CHALLENGED_BY]->(e:Evidence)
RETURN collect(DISTINCT {id:k.id, text:k.text, state:k.state}) AS claims,
       collect(DISTINCT {id:e.id, rel:type(r), kind:e.kind, origin:e.origin, summary:e.summary,
                         state:e.state, cypher:e.cypher, payload:e.payload}) AS evidence
```

## `app.routers.network`

### network_account_detail

Side panel: scores, identity, cases for one account

```cypher
MATCH (a:Account {id:$id})
OPTIONAL MATCH (a)-[:USES_DEVICE|USES_IP|REGISTERED_AT]->(x)
OPTIONAL MATCH (c:Case)-[:CONCERNS]->(a)
OPTIONAL MATCH (al:Alert)-[:RAISED_FOR]->(a)
RETURN a.id AS id, a.bank_id AS bank, a.in_deg AS in_deg, a.out_deg AS out_deg,
       a.pagerank AS pagerank, a.motif_score AS motif, a.community AS community,
       a.component_size AS component_size, a.passthrough_pairs AS passthrough_pairs,
       collect(DISTINCT {kind:labels(x)[0], id:x.id, shared:x.shared_count, units:x.units}) AS identity,
       collect(DISTINCT c.id) AS cases, collect(DISTINCT {id:al.id, rule:al.rule, status:al.status}) AS alerts
```

### network_bank_edges

Transfers among focus accounts visible to one bank

```cypher
MATCH (s)-[t:TRANSFERS]->(d)
WHERE s.id IN $ids AND d.id IN $ids
RETURN s.id AS source, d.id AS target, sum(t.amount) AS amount, count(t) AS n
```

### network_bank_nodes

Focus accounts as one bank sees them

```cypher
MATCH (a) WHERE (a:Account OR a:ExternalAccount) AND a.id IN $ids
RETURN a.id AS id, a.bank_id AS bank,
       CASE WHEN a:Account THEN 'account' ELSE 'external' END AS kind
```

### network_consortium_edges

Transfers among focus accounts (consortium)

```cypher
MATCH (s:Account)-[f:FLOWS]->(d:Account)
WHERE s.id IN $ids AND d.id IN $ids
RETURN s.id AS source, d.id AS target, f.capacity AS amount, f.n_txn AS n
```

### network_consortium_nodes

Focus accounts in the consortium view

```cypher
MATCH (a:Account) WHERE a.id IN $ids
OPTIONAL MATCH (c:Case)-[:CONCERNS]->(a)
RETURN a.id AS id, a.bank_id AS bank, 'account' AS kind,
       coalesce(a.pagerank, 0.0) AS pagerank, coalesce(a.motif_score, 0.0) AS motif,
       a.community AS community, collect(DISTINCT c.id) AS cases
```

### network_focus_cases

Accounts covered by cases (the interesting region)

```cypher
MATCH (c:Case)-[:CONCERNS]->(a:Account)
WHERE $case IS NULL OR c.id = $case
RETURN DISTINCT a.id AS id LIMIT $limit
```

### network_focus_top

Highest motif-score accounts when no case exists yet

```cypher
MATCH (a:Account) RETURN a.id AS id ORDER BY coalesce(a.motif_score, 0.0) DESC LIMIT $limit
```

## `app.routers.sar`

### api_sar_latest

Latest SAR of a case with sentences and citations

```cypher
MATCH (s:SAR) WITH s ORDER BY s.version DESC LIMIT 1
MATCH (s)-[:CONTAINS]->(t:Sentence)
OPTIONAL MATCH (t)-[:CITES]->(x)
WITH s, t, collect({id:x.id, label:labels(x)[0], text:coalesce(x.summary, x.text),
                    state:x.state, accounts:x.accounts}) AS cites
ORDER BY t.order
RETURN s.id AS id, s.status AS status, s.pf_score AS pf, s.version AS version,
       s.repairs AS repairs, s.state AS state, s.divergence AS divergence, s.auditor AS auditor,
       s.created_at AS created_at,
       collect({id:t.id, text:t.text, supported:t.supported, section:t.section,
                verdict:t.verdict, state:t.state, cites:cites}) AS sentences
```

### api_sar_versions

All SAR versions of a case

```cypher
MATCH (s:SAR) RETURN s.id AS id, s.status AS status, s.pf_score AS pf, s.version AS version,
       s.state AS state, s.created_at AS created_at ORDER BY version
```

## `app.routers.trust`

### trust_echo_overview

Naive vs echo-proof confidence for every claim

```cypher
MATCH (c:Claim) WHERE c.paths IS NOT NULL
RETURN c.id AS id, c.text AS text, c.kind AS kind, c.state AS state, c.paths AS paths,
       c.independent_sources AS sources, c.confidence AS confidence,
       c.naive_confidence AS naive
```

### trust_state_counts

Validity states across a case graph

```cypher
MATCH (n) WHERE n.state IS NOT NULL AND (n:Claim OR n:Evidence OR n:Action OR n:SAR)
RETURN labels(n)[0] AS label, n.state AS state, count(n) AS n
```

## `app.services.baseline`

### alerts_clear_all

Remove all alerts (demo reset)

```cypher
MATCH (al:Alert) DETACH DELETE al
```

### alerts_write

Create Alert nodes linked to their account

```cypher
UNWIND $rows AS r
MATCH (a:Account {id:r.account})
MERGE (al:Alert {id:r.id})
ON CREATE SET al.account_id = r.account, al.bank_id = r.bank, al.rule = r.rule,
              al.ts = r.ts, al.status = 'open', al.reason = r.reason, al.hits = r.hits
MERGE (al)-[:RAISED_FOR]->(a)
```

### baseline_r1_large_transfer

Baseline rule: transfer above threshold

```cypher
MATCH (a:Account)-[t:TRANSFERS]->()
WHERE t.amount > $thr
RETURN a.id AS account, a.bank_id AS bank, min(t.ts) AS ts, count(t) AS hits
```

### baseline_r2_near_threshold

Baseline rule: bursts just under threshold

```cypher
MATCH (a:Account)-[t:TRANSFERS]->()
WHERE t.amount >= $thr * 0.85 AND t.amount < $thr
WITH a, t ORDER BY t.ts
WITH a, collect(t.ts) AS ts
WHERE size(ts) >= 3
RETURN a.id AS account, a.bank_id AS bank, ts
```

### baseline_r3_new_counterparty

Baseline rule: first transfer to a new counterparty, large

```cypher
MATCH (a:Account)-[f:FLOWS]->(b:Account)
WHERE f.n_txn = 1 AND f.capacity >= $thr * 0.5
MATCH (a)-[t:TRANSFERS]->(b)
RETURN a.id AS account, a.bank_id AS bank, min(t.ts) AS ts, count(DISTINCT b) AS hits
```

### baseline_r4_high_risk_format

Baseline rule: cash / crypto above 30% of threshold

```cypher
MATCH (a:Account)-[t:TRANSFERS]->()
WHERE t.format IN ['Cash', 'Bitcoin'] AND t.amount >= $thr * 0.3
RETURN a.id AS account, a.bank_id AS bank, min(t.ts) AS ts, count(t) AS hits
```

## `detection.algorithms`

### algo_betweenness_bridges

Betweenness: mule bridges between groups

```cypher
CALL algo.betweenness({nodeLabels:['Account'], relationshipTypes:['TRANSFERS'],
                       samplingSize:$samples, samplingSeed:$seed})
YIELD node, score
RETURN node.id AS account, node.bank_id AS bank, score
ORDER BY score DESC LIMIT $k
```

### algo_bfs_reach

BFS from an account along outgoing transfers

```cypher
MATCH (s:Account {id:$id})
CALL algo.bfs(s, $depth, 'TRANSFERS') YIELD nodes
RETURN [n IN nodes | n.id] AS reached
```

### algo_harmonic_orchestrator

Harmonic centrality: orchestrator candidates

```cypher
CALL algo.HarmonicCentrality({nodeLabels:['Account'], relationshipTypes:['TRANSFERS']})
YIELD node, score, reachable
RETURN node.id AS account, node.bank_id AS bank, score, reachable
ORDER BY score DESC LIMIT $k
```

### algo_label_propagation_rings

Community detection: candidate rings

```cypher
CALL algo.labelPropagation({nodeLabels:['Account'], relationshipTypes:['TRANSFERS'],
                            maxIterations:$iters})
YIELD node, communityId
WITH communityId, collect(node.id) AS members, collect(DISTINCT node.bank_id) AS banks
WHERE size(members) >= $min_size AND size(members) <= $max_size
RETURN communityId, members, banks, size(members) AS size
ORDER BY size DESC LIMIT $limit
```

### algo_maxflow_money_at_risk

Max flow: value movable from flagged accounts to hub

```cypher
MATCH (s:Account) WHERE s.id IN $sources
WITH collect(s) AS srcs
MATCH (t:Account) WHERE t.id IN $targets
WITH srcs, collect(t) AS tgts
CALL algo.maxFlow({sourceNodes:srcs, targetNodes:tgts, relationshipTypes:['FLOWS'],
                   capacityProperty:'capacity', nodeLabels:['Account']})
YIELD maxFlow, edges, edgeFlows
RETURN maxFlow, [e IN edges | [startNode(e).id, endNode(e).id]] AS flow_edges, edgeFlows
```

### algo_msf_backbone

Minimum spanning forest: simplified ring backbone for the UI

```cypher
CALL algo.MSF({nodeLabels:['Account'], relationshipTypes:['TRANSFERS'],
               weightAttribute:'amount'})
YIELD edges
UNWIND edges AS e
RETURN startNode(e).id AS src, endNode(e).id AS dst, e.txn_id AS txn_id, e.amount AS amount
```

### algo_pagerank_hub

PageRank: collection hub where money pools

```cypher
CALL algo.pageRank('Account', 'TRANSFERS') YIELD node, score
RETURN node.id AS account, node.bank_id AS bank, score
ORDER BY score DESC LIMIT $k
```

### algo_sppaths_trace_flow

Shortest money paths between two accounts (evidence)

```cypher
MATCH (s:Account {id:$src}), (d:Account {id:$dst})
CALL algo.SPpaths({sourceNode:s, targetNode:d, relTypes:['TRANSFERS'],
                   maxLen:$max_len, pathCount:$path_count, relDirection:$direction})
YIELD path, pathWeight
RETURN [n IN nodes(path) | n.id] AS accounts,
       [t IN relationships(path) | t.txn_id] AS txn_ids,
       [t IN relationships(path) | t.amount] AS amounts,
       pathWeight AS hops
```

### algo_sspaths_reach

Where money from one account can reach

```cypher
MATCH (s:Account {id:$src})
CALL algo.SSpaths({sourceNode:s, relTypes:['TRANSFERS'], maxLen:$max_len, pathCount:1})
YIELD path, pathWeight
WITH last(nodes(path)) AS n, pathWeight
RETURN n.id AS account, n.bank_id AS bank, min(pathWeight) AS hops
ORDER BY hops LIMIT $limit
```

### algo_wcc_component_of

Component id and size for one account

```cypher
CALL algo.wcc({nodeLabels:['Account'], relationshipTypes:['TRANSFERS']})
YIELD node, componentId
WITH componentId, collect(node.id) AS ids, collect(DISTINCT node.bank_id) AS banks
WHERE $id IN ids
RETURN componentId, size(ids) AS size, size(banks) AS n_banks
```

### algo_wcc_islands

Weakly connected components: islands clear instantly

```cypher
CALL algo.wcc({nodeLabels:['Account'], relationshipTypes:['TRANSFERS']})
YIELD node, componentId
WITH componentId, collect(node.id) AS ids, collect(DISTINCT node.bank_id) AS banks
RETURN componentId, size(ids) AS size, size(banks) AS n_banks, ids[0..50] AS sample
ORDER BY size DESC
```

### neighborhood_expand

Bounded undirected neighborhood (triage)

```cypher
MATCH (a:Account {id:$id})-[t:TRANSFERS]-(b)
WITH a, collect(DISTINCT b)[0..$limit] AS hop1
UNWIND hop1 AS b
OPTIONAL MATCH (b)-[:TRANSFERS]-(c:Account) WHERE $depth >= 2 AND c <> a
WITH a, hop1, collect(DISTINCT c)[0..$limit] AS hop2
RETURN a.id AS center, [x IN hop1 | x.id] AS hop1, [x IN hop2 | x.id] AS hop2,
       [x IN hop1 + hop2 | x.bank_id] AS banks
```

## `detection.casegraph`

### case_copy_edges

Read transfers among case accounts

```cypher
MATCH (s:Account)-[t:TRANSFERS]->(d:Account)
WHERE s.id IN $ids AND d.id IN $ids
RETURN s.id AS s, d.id AS d, t.txn_id AS txn_id, t.ts AS ts, t.amount AS amount,
       t.amount_recv AS amount_recv, t.cur AS cur, t.cur_recv AS cur_recv,
       t.format AS format
```

### case_copy_identity

Read identity attributes of case accounts

```cypher
MATCH (a:Account)-[r:USES_DEVICE|USES_IP|REGISTERED_AT]->(x)
WHERE a.id IN $ids
RETURN a.id AS a, type(r) AS rel, labels(x)[0] AS label, x.id AS id,
       x.shared_count AS shared_count, coalesce(x.units, 1) AS units
```

### case_copy_nodes

Read accounts for a case subgraph

```cypher
MATCH (a:Account) WHERE a.id IN $ids
RETURN a.id AS id, a.bank_id AS bank_id, a.in_deg AS in_deg, a.out_deg AS out_deg,
       coalesce(a.motif_score, 0.0) AS motif_score, coalesce(a.pagerank, 0.0) AS pagerank
```

### case_write_edges

Write transfers into a case graph

```cypher
UNWIND $rows AS r
MATCH (s:Account {id:r.s}), (d:Account {id:r.d})
MERGE (s)-[t:TRANSFERS {txn_id:r.txn_id}]->(d)
SET t.ts = r.ts, t.amount = r.amount, t.amount_recv = r.amount_recv, t.cur = r.cur,
    t.cur_recv = r.cur_recv, t.format = r.format, t.capacity = r.amount
```

### case_write_flows

Collapse case transfers into one FLOWS edge per pair

```cypher
MATCH (s:Account)-[t:TRANSFERS]->(d:Account) WHERE s <> d
WITH s, d, sum(t.amount) AS cap, count(t) AS n
MERGE (s)-[f:FLOWS]->(d)
SET f.capacity = cap, f.n_txn = n
```

### case_write_nodes

Write accounts into a case graph

```cypher
UNWIND $rows AS r
MERGE (a:Account {id:r.id})
SET a.bank_id = r.bank_id, a.in_deg = r.in_deg, a.out_deg = r.out_deg,
    a.motif_score = r.motif_score, a.pagerank_global = r.pagerank
```

## `detection.clue_expand`

### clue_behavior_similarity

Behaviour similarity of context accounts to a clue

```cypher
MATCH (c:Account {id:$clue})
CALL db.idx.vector.queryNodes('Account', 'behavior_vec', $k, c.behavior_vec)
YIELD node, score
RETURN node.id AS id, score
```

### clue_consistent_edges

Transfer pairs at a member that agree in time and amount

```cypher
MATCH (y:Account)-[a:TRANSFERS]-(g:Account)-[b:TRANSFERS]-(z:Account)
WHERE g.id IN $ids AND y <> z AND a.txn_id < b.txn_id AND abs(a.ts - b.ts) <= $win
  AND abs(a.amount - b.amount) <=
      $tol * (CASE WHEN a.amount > b.amount THEN a.amount ELSE b.amount END)
RETURN g.id AS g, y.id AS y, z.id AS z
LIMIT 20000
```

### clue_context

Two-hop context around clue accounts with risk signals

```cypher
MATCH (c:Account) WHERE c.id IN $clues
MATCH (c)-[:FLOWS*1..2]-(n:Account)
WITH DISTINCT n
RETURN n.id AS id, n.bank_id AS bank, coalesce(n.motif_score, 0.0) AS motif,
       coalesce(n.pagerank, 0.0) AS pagerank, coalesce(n.passthrough_pairs, 0) AS pt
LIMIT 3000
```

## `detection.identity`

### identity_behavior_neighbors

Accounts whose behaviour vector is closest (HNSW)

```cypher
MATCH (a:Account {id:$id})
CALL db.idx.vector.queryNodes('Account', 'behavior_vec', $k, a.behavior_vec)
YIELD node, score
WHERE node.id <> $id
RETURN node.id AS account, node.bank_id AS bank, score
ORDER BY score ASC
```

### identity_cross_bank_links

Counterparties of an account held at other banks

```cypher
MATCH (a:Account {id:$id})-[t:TRANSFERS]-(b:Account)
WHERE b.bank_id <> a.bank_id
RETURN b.id AS account, b.bank_id AS bank, count(t) AS transfers, sum(t.amount) AS volume
ORDER BY volume DESC LIMIT 25
```

### identity_owner_of

Owner identities of an account

```cypher
MATCH (p)-[o:OWNS]->(a:Account {id:$id})
RETURN p.id AS person, p.name AS name, labels(p)[0] AS kind
```

### identity_resolve_phonetic

Phonetic (Double Metaphone) name candidates

```cypher
CALL db.idx.fulltext.queryNodes($label, $query) YIELD node, score
OPTIONAL MATCH (node)-[:OWNS]->(a:Account)
RETURN node.id AS person, node.name AS name, score,
       collect(DISTINCT a.id) AS accounts, collect(DISTINCT a.bank_id) AS banks
ORDER BY score DESC LIMIT $k
```

### identity_shared_attr_context

How widely shared is each identity attribute

```cypher
MATCH (a:Account {id:$id})-[r:USES_DEVICE|USES_IP|REGISTERED_AT]->(x)
RETURN labels(x)[0] AS kind, x.id AS attr, x.shared_count AS shared,
       coalesce(x.units, 1) AS units, coalesce(x.text, '') AS text
ORDER BY shared DESC
```

## `detection.motif_seeds`

### motif_adjacency

Export the simple digraph for motif precompute

```cypher
MATCH (a:Account)-[:FLOWS]->(b:Account)
RETURN a.id AS s, b.id AS d
```

### motif_all_accounts

Accounts for motif precompute

```cypher
MATCH (a:Account) RETURN a.id AS id
```

### motif_read_score

Motif score components for one account

```cypher
MATCH (a:Account {id:$id})
RETURN a.motif_score AS score, a.motif_cycle3 AS cycle3, a.motif_recip AS recip,
       a.motif_relay AS relay, a.motif_fanin AS fanin, a.motif_fanout AS fanout,
       a.motif_leaf AS leaf
```

### motif_top

Highest motif scores

```cypher
MATCH (a:Account) WHERE a.motif_score IS NOT NULL
RETURN a.id AS id, a.motif_score AS score ORDER BY score DESC LIMIT $k
```

### motif_write_scores

Store motif score and its components on accounts

```cypher
UNWIND $rows AS r
MATCH (a:Account {id:r.id})
SET a.motif_score = r.score, a.motif_cycle3 = r.cycle3, a.motif_recip = r.recip,
    a.motif_relay = r.relay, a.motif_fanin = r.fanin, a.motif_fanout = r.fanout,
    a.motif_leaf = r.leaf
```

## `detection.passthrough`

### passthrough_candidates

Accounts with enough in and out transfers to scan

```cypher
MATCH (x:Account) WHERE x.in_deg >= $m AND x.out_deg >= $m
  AND x.in_deg <= $max_deg AND x.out_deg <= $max_deg
RETURN x.id AS id
```

### passthrough_edges

Incoming and outgoing transfers of one account

```cypher
MATCH (x:Account {id:$id})
OPTIONAL MATCH (s)-[i:TRANSFERS]->(x)
WITH x, collect({txn:i.txn_id, ts:i.ts, amt:i.amount_recv, cur:i.cur_recv, cp:s.id}) AS ins
OPTIONAL MATCH (x)-[o:TRANSFERS]->(d)
RETURN ins, collect({txn:o.txn_id, ts:o.ts, amt:o.amount, cur:o.cur, cp:d.id}) AS outs
```

### passthrough_write

Store pass-through results on the account

```cypher
MATCH (x:Account {id:$id})
SET x.passthrough_pairs = $pairs, x.passthrough_value = $value
```

## `detection.precompute`

### precompute_label_propagation

Store community id and size

```cypher
CALL algo.labelPropagation({nodeLabels:['Account'], relationshipTypes:['FLOWS'],
                            maxIterations:$iters})
YIELD node, communityId
WITH communityId, collect(node) AS ns
UNWIND ns AS n
SET n.community = communityId, n.community_size = size(ns)
RETURN count(n) AS n
```

### precompute_pagerank

Store global PageRank on every account

```cypher
CALL algo.pageRank('Account', 'TRANSFERS') YIELD node, score
SET node.pagerank = score
RETURN count(node) AS n
```

### precompute_wcc

Store component id and size on every account

```cypher
CALL algo.wcc({nodeLabels:['Account'], relationshipTypes:['TRANSFERS']})
YIELD node, componentId
WITH componentId, collect(node) AS ns
UNWIND ns AS n
SET n.component = componentId, n.component_size = size(ns)
RETURN count(n) AS n
```

## `detection.spnsa`

### spnsa_out_ego

Out-ego network of a seed (radius r, simple digraph)

```cypher
MATCH p = (s:Account {id:$id})-[:FLOWS*1..2]->(x:Account)
WHERE length(p) <= $r
UNWIND relationships(p) AS f
RETURN DISTINCT startNode(f).id AS s, endNode(f).id AS d
LIMIT $limit
```

### spnsa_scratch_betweenness

Most central bridge inside the ego network

```cypher
CALL algo.betweenness({nodeLabels:['Account'], relationshipTypes:['FLOWS']})
YIELD node, score RETURN node.id AS id, score ORDER BY score DESC LIMIT 1
```

### spnsa_scratch_pagerank

Most central sink inside the ego network

```cypher
CALL algo.pageRank('Account', 'FLOWS') YIELD node, score
RETURN node.id AS id, score ORDER BY score DESC LIMIT 1
```

### spnsa_scratch_sppaths

Shortest path seed -> target inside the ego network

```cypher
MATCH (s:Account {id:$s}), (t:Account {id:$t})
CALL algo.SPpaths({sourceNode:s, targetNode:t, relTypes:['FLOWS'], maxLen:$max_len,
                   pathCount:1})
YIELD path
RETURN [n IN nodes(path) | n.id] AS nodes
```

### spnsa_scratch_write

Write an ego network into the scratch graph

```cypher
UNWIND $rows AS r
MERGE (a:Account {id:r.s})
MERGE (b:Account {id:r.d})
MERGE (a)-[:FLOWS]->(b)
```

## `detection.typologies`

### typology_circular_start

Outgoing transfers that may open a cycle

```cypher
MATCH (a:Account {id:$id})-[t:TRANSFERS]->(b:Account)
WHERE b.id <> $id
RETURN b.id AS node, t.ts AS ts, t.txn_id AS txn, t.amount AS amount
ORDER BY t.ts LIMIT $cap
```

### typology_circular_step

One time-respecting hop of cycle search

```cypher
UNWIND $frontier AS f
MATCH (x:Account {id:f.node})-[t:TRANSFERS]->(y:Account)
WHERE t.ts > f.ts AND t.ts <= f.t0 + $window
RETURN f.pid AS pid, y.id AS node, t.ts AS ts, t.txn_id AS txn, t.amount AS amount
LIMIT $cap
```

### typology_fan_in_edges

Incoming transfers ordered by time (fan-in)

```cypher
MATCH (b)-[t:TRANSFERS]->(a:Account {id:$id})
RETURN t.ts AS ts, b.id AS cp, t.txn_id AS txn
ORDER BY ts
```

### typology_fan_out_edges

Outgoing transfers ordered by time (fan-out)

```cypher
MATCH (a:Account {id:$id})-[t:TRANSFERS]->(b)
RETURN t.ts AS ts, b.id AS cp, t.txn_id AS txn
ORDER BY ts
```

### typology_follow_money

Bounded money trail (k validated to 1..6)

```cypher
MATCH p = (a:Account {id:$id})-[:TRANSFERS*1..3]->(b:Account)
RETURN [t IN relationships(p) | t.txn_id] AS txn_ids,
       [t IN relationships(p) | endNode(t).id] AS hops,
       reduce(s = 0.0, t IN relationships(p) | s + t.amount) AS volume
LIMIT 50
```

### typology_rapid_passthrough

In-then-out of similar amount within a short gap

```cypher
MATCH (s)-[i:TRANSFERS]->(x:Account {id:$id})-[o:TRANSFERS]->(d)
WHERE o.ts > i.ts AND o.ts - i.ts <= $gap AND i.cur_recv = o.cur
  AND abs(o.amount - i.amount_recv) /
      CASE WHEN o.amount > i.amount_recv THEN o.amount ELSE i.amount_recv END <= $tol
RETURN i.txn_id AS in_txn, o.txn_id AS out_txn, i.amount_recv AS amount_in,
       o.amount AS amount_out, o.ts - i.ts AS gap, s.id AS src, d.id AS dst
ORDER BY gap LIMIT 50
```

### typology_shared_identity

Other accounts sharing a device, IP or address

```cypher
MATCH (a:Account {id:$id})-[:USES_DEVICE|USES_IP|REGISTERED_AT]->(x)
      <-[:USES_DEVICE|USES_IP|REGISTERED_AT]-(b:Account)
WHERE a <> b
RETURN labels(x)[0] AS kind, x.id AS attr, x.shared_count AS shared,
       coalesce(x.units, 1) AS units, collect(DISTINCT b.id) AS others
```

### typology_structuring

Repeated amounts just under the reporting threshold

```cypher
MATCH (a:Account {id:$id})-[t:TRANSFERS]->()
WHERE t.amount >= $thr * 0.85 AND t.amount < $thr
RETURN count(t) AS near_threshold, collect(t.txn_id)[0..20] AS txns,
       sum(t.amount) AS total
```

## `knowledge.typology_kb`

### kb_get_typology

One typology with its chunk and indicators

```cypher
MATCH (t:Typology {id:$id})-[:DESCRIBED_IN]->(c:Chunk)
OPTIONAL MATCH (t)-[:HAS_INDICATOR]->(i:Indicator)
RETURN t.id AS id, t.name AS name, c.id AS chunk, c.text AS text, c.sources AS sources,
       collect(i.text) AS indicators
```

### kb_search_chunks

Full-text search over typology guidance

```cypher
CALL db.idx.fulltext.queryNodes('Chunk', $q) YIELD node, score
MATCH (t:Typology)-[:DESCRIBED_IN]->(node)
RETURN t.id AS typology, t.name AS name, node.id AS chunk, node.text AS text,
       node.sources AS sources, score
ORDER BY score DESC LIMIT $k
```

### kb_write_typology

Write a typology, its source chunk and indicators

```cypher
MERGE (t:Typology {id:$id}) SET t.name = $name
MERGE (c:Chunk {id:$chunk}) SET c.text = $text, c.sources = $sources, c.title = $name
MERGE (t)-[:DESCRIBED_IN]->(c)
WITH t
UNWIND $indicators AS ind
MERGE (i:Indicator {text:ind})
MERGE (t)-[:HAS_INDICATOR]->(i)
```

## `memory.episodic`

### episodic_resume_state

What a resuming agent needs to know about a case

```cypher
MATCH (c:Case)
OPTIONAL MATCH (cl:Claim)
WITH c, collect(cl) AS claims
OPTIONAL MATCH (e:Evidence)
WITH c, claims, collect(e) AS evs
OPTIONAL MATCH (x:Claim)-[:CHALLENGED_BY]->(:Evidence {state:'active'})
WITH c, claims, evs, count(DISTINCT x) AS challenged
OPTIONAL MATCH (s:SAR)
RETURN c.id AS id, c.status AS status, c.title AS title, size(claims) AS claims,
       size(evs) AS evidence, challenged, count(s) AS sars,
       [cl IN claims | cl.text][0..5] AS claim_texts
```

### episodic_timeline

Case timeline in order (follows NEXT)

```cypher
MATCH (c:Case)-[:HAD_EVENT]->(e:Event)
RETURN e.id AS id, e.ts AS ts, e.agent AS agent, e.action AS action, e.payload AS payload,
       e.cypher AS cypher
ORDER BY e.ts, e.id
```

## `memory.procedural`

### procedure_best

Best procedure for a typology guess

```cypher
MATCH (p:Procedure) WHERE p.typology = $typology OR $typology IS NULL
WITH p ORDER BY p.success_count - p.fail_count DESC, p.success_count DESC LIMIT 1
MATCH (p)-[r:STEP]->(s:Step)
OPTIONAL MATCH (s)-[:FAILED_BEFORE]->(x:Pitfall)
RETURN p.id AS id, p.name AS name, p.typology AS typology, p.success_count AS success,
       p.learned_from AS learned_from,
       collect({order:r.order, tool:s.tool, params:s.params_template, why:s.why,
                pitfall:x.note}) AS steps
```

### procedure_list

All procedures

```cypher
MATCH (p:Procedure) RETURN p.id AS id, p.name AS name, p.typology AS typology,
       p.success_count AS success, p.fail_count AS fail, p.learned_from AS learned_from
ORDER BY success DESC
```

### procedure_pitfall

Record a pitfall on a procedure step

```cypher
MATCH (p:Procedure {id:$pid})-[:STEP]->(s:Step {tool:$tool})
CREATE (s)-[:FAILED_BEFORE]->(:Pitfall {note:$note, ts:timestamp()})
```

### procedure_upsert

Save or reinforce a successful tool sequence

```cypher
MERGE (p:Procedure {signature:$sig})
ON CREATE SET p.id = $id, p.name = $name, p.typology = $typology, p.success_count = 0,
              p.fail_count = 0, p.learned_from = [], p.created_at = timestamp()
SET p.success_count = p.success_count + CASE WHEN $ok THEN 1 ELSE 0 END,
    p.fail_count = p.fail_count + CASE WHEN $ok THEN 0 ELSE 1 END,
    p.learned_from = p.learned_from + [$case], p.updated_at = timestamp()
WITH p
OPTIONAL MATCH (p)-[:STEP]->(old:Step)
WITH p, count(old) AS n
FOREACH (s IN CASE WHEN n = 0 THEN $steps ELSE [] END |
  CREATE (p)-[:STEP {order:s.order}]->(:Step {tool:s.tool, params_template:s.params, why:s.why}))
RETURN p.id AS id, p.success_count AS success, p.fail_count AS fail
```

## `trust.echo`

### echo_case_claims

All claims in a case

```cypher
MATCH (c:Claim) RETURN c.id AS id
```

### echo_challenges

Active challenging evidence of a claim

```cypher
MATCH (c:Claim {id:$id})-[:CHALLENGED_BY]->(e:Evidence)
WHERE e.state = 'active'
RETURN e.id AS id, e.kind AS kind, e.origin AS origin, e.payload AS payload,
       e.summary AS summary
```

### echo_independent_sources

Paths vs independent sources for a claim

```cypher
MATCH (c:Claim {id:$id})-[:SUPPORTED_BY]->(e:Evidence)
WHERE e.state IN ['active', 'needs_verification']
RETURN count(e) AS paths, count(DISTINCT e.origin) AS independent_sources,
       collect(DISTINCT e.kind) AS kinds
```

### echo_store_confidence

Store echo-proof confidence on a claim

```cypher
MATCH (c:Claim {id:$id})
SET c.confidence = $confidence, c.naive_confidence = $naive, c.paths = $paths,
    c.independent_sources = $sources, c.independent_challenges = $challenges
```

### echo_supports

Supporting evidence of a claim (active or pending check)

```cypher
MATCH (c:Claim {id:$id})-[:SUPPORTED_BY]->(e:Evidence)
WHERE e.state IN ['active', 'needs_verification']
RETURN e.id AS id, e.kind AS kind, e.origin AS origin, e.payload AS payload,
       e.summary AS summary, e.state AS state
```

## `trust.gate`

### bundle_actions

Proposed and approved actions of a case

```cypher
MATCH (a:Action)-[:JUSTIFIED_BY]->(c:Claim)
RETURN a.id AS id, a.kind AS kind, a.status AS status, a.state AS state,
       a.target AS target, collect(c.id) AS claims
```

### bundle_claims

Active claims of a case with confidence

```cypher
MATCH (c:Claim) WHERE c.state IN ['active', 'needs_verification']
RETURN c.id AS id, c.text AS text, c.kind AS kind, c.state AS state,
       c.confidence AS confidence, c.paths AS paths,
       c.independent_sources AS independent_sources, c.author_agent AS author, c.about AS about
ORDER BY c.created_at
```

### bundle_evidence

Evidence of a case (closed corpus for the SAR)

```cypher
MATCH (e:Evidence) WHERE e.state <> 'superseded'
OPTIONAL MATCH (c:Claim)-[r:SUPPORTED_BY|CHALLENGED_BY]->(e)
RETURN e.id AS id, e.kind AS kind, e.origin AS origin, e.summary AS summary,
       e.payload AS payload, e.state AS state, e.author_agent AS author,
       collect(DISTINCT {claim:c.id, rel:type(r)}) AS links
```

### gate_cite_check

Code-level check: cited items exist and are active

```cypher
MATCH (n) WHERE (n:Evidence OR n:Claim) AND n.id IN $ids
RETURN n.id AS id, n.state AS state, labels(n)[0] AS label,
       coalesce(n.summary, n.text) AS text, n.payload AS payload, n.confidence AS confidence
```

### sar_write

Write a SAR with sentences citing evidence and claims

```cypher
MATCH (k:Case)
CREATE (s:SAR {id:$sar, case_id:k.id, status:$status, pf_score:$pf, version:$v,
               repairs:$repairs, created_at:timestamp(), state:'active',
               divergence:$divergence, auditor:$auditor})
CREATE (k)-[:HAS_SAR]->(s)
WITH s
UNWIND $sentences AS x
CREATE (s)-[:CONTAINS]->(t:Sentence {id:x.id, text:x.text, supported:x.supported,
                                     order:x.order, state:'active', verdict:x.verdict,
                                     section:x.section})
WITH t, x
UNWIND x.cites AS cid
MATCH (n) WHERE (n:Evidence OR n:Claim) AND n.id = cid
CREATE (t)-[:CITES]->(n)
```

## `trust.store`

### action_propose

Propose a human-approved action justified by claims

```cypher
CREATE (a:Action {id:$id, kind:$kind, status:'proposed', state:'active', ts:timestamp(),
                  rationale:$rationale, target:$target})
WITH a
UNWIND $claims AS cid
MATCH (c:Claim {id:cid})
CREATE (a)-[:JUSTIFIED_BY]->(c)
RETURN a.id AS id
```

### case_create

Open a case in its own graph

```cypher
CREATE (c:Case {id:$id, status:'open', opened_at:timestamp(), seed_alert:$alert,
                seed_account:$account, bank_scope:$banks, title:$title})
```

### case_mirror_consortium

Mirror a case in the consortium for recall

```cypher
MATCH (al:Alert {id:$alert})
MERGE (c:Case {id:$id})
SET c.status = 'open', c.opened_at = timestamp(), c.seed_account = $account, c.title = $title
MERGE (c)-[:OPENED_FROM]->(al)
SET al.status = 'case', al.case_id = $id
```

### case_set_status

Update case status

```cypher
MATCH (c:Case {id:$id}) SET c.status = $status, c.updated_at = timestamp()
```

### claim_about_accounts

Attach a claim to the accounts it is about

```cypher
MATCH (c:Claim {id:$claim})
UNWIND $accounts AS aid
MERGE (a:Account {id:aid})
MERGE (c)-[:ABOUT]->(a)
```

### claim_add

Create a claim supported by existing evidence

```cypher
CREATE (c:Claim {id:$id, text:$text, kind:$kind, about:$about, author_agent:$agent,
                 state:'active', created_at:timestamp(), confidence:0.0,
                 independent_sources:0, paths:0})
WITH c
UNWIND $evidence AS eid
MATCH (e:Evidence {id:eid})
CREATE (c)-[:SUPPORTED_BY {weight:1.0}]->(e)
RETURN c.id AS id, count(e) AS linked
```

### claim_challenge

Attach challenging evidence to a claim

```cypher
MATCH (c:Claim {id:$claim}), (e:Evidence {id:$evidence})
MERGE (c)-[:CHALLENGED_BY]->(e)
```

### claim_derive

Record that a claim is derived from another claim

```cypher
MATCH (a:Claim {id:$child}), (b:Claim {id:$parent})
MERGE (a)-[:DERIVED_FROM]->(b)
```

### claim_mirror_consortium

Mirror a claim summary for cross-case recall

```cypher
MATCH (k:Case {id:$case})
MERGE (c:Claim {id:$id})
SET c.text = $text, c.kind = $kind, c.state = 'active', c.case_id = $case
MERGE (k)-[:HAS_CLAIM]->(c)
WITH c
UNWIND $accounts AS aid
MATCH (a:Account {id:aid})
MERGE (c)-[:ABOUT]->(a)
```

### claim_support

Add supporting evidence to a claim

```cypher
MATCH (c:Claim {id:$claim}), (e:Evidence {id:$evidence})
MERGE (c)-[:SUPPORTED_BY {weight:1.0}]->(e)
```

### event_append

Append an episodic event to the case timeline

```cypher
MATCH (c:Case {id:$case})
OPTIONAL MATCH (c)-[:HAD_EVENT]->(last:Event) WHERE NOT (last)-[:NEXT]->()
CREATE (e:Event {id:$id, ts:timestamp(), agent:$agent, action:$action, payload:$payload,
                 cypher:$cypher})
CREATE (c)-[:HAD_EVENT]->(e)
FOREACH (_ IN CASE WHEN last IS NULL THEN [] ELSE [1] END | CREATE (last)-[:NEXT]->(e))
RETURN e.id AS id
```

### evidence_add

Record evidence with its origin and producing query

```cypher
MERGE (e:Evidence {id:$id})
ON CREATE SET e.kind = $kind, e.origin = $origin, e.summary = $summary, e.payload = $payload,
              e.cypher = $cypher, e.state = 'active', e.created_at = timestamp(),
              e.author_agent = $agent, e.accounts = $accounts
RETURN e.id AS id
```

## `trust.validity`

### validity_beliefs_as_of

What the case believed at a past time (history kept)

```cypher
MATCH (c:Claim) WHERE c.created_at <= $ts
OPTIONAL MATCH (c)-[:SUPPORTED_BY]->(e:Evidence)
WHERE e.created_at <= $ts AND (e.superseded_at IS NULL OR e.superseded_at > $ts)
RETURN c.id AS claim, c.text AS text, count(e) AS support_then,
       CASE WHEN c.state_changed_at IS NULL OR c.state_changed_at > $ts
            THEN 'active' ELSE c.state END AS state_then
```

### validity_challenged_claims

Claims challenged by an evidence item

```cypher
MATCH (c:Claim)-[:CHALLENGED_BY]->(e:Evidence {id:$id}) RETURN c.id AS id
```

### validity_direct_dependents

Nodes that depend directly on a node

```cypher
MATCH (x {id:$id})
OPTIONAL MATCH (d)-[r:SUPPORTED_BY|DERIVED_FROM|JUSTIFIED_BY|CITES]->(x)
RETURN collect(DISTINCT {id:d.id, label:labels(d)[0], rel:type(r), state:d.state}) AS deps
```

### validity_find_evidence_by_origin

Active evidence resting on an origin

```cypher
MATCH (e:Evidence {origin:$origin}) WHERE e.state <> 'superseded'
RETURN e.id AS id
```

### validity_link_supersedes

New evidence supersedes old evidence

```cypher
MATCH (n:Evidence {id:$new}), (o:Evidence {id:$old})
MERGE (n)-[:SUPERSEDES {reason:$reason, ts:timestamp()}]->(o)
```

### validity_premise_check_action

Stale premises behind an action

```cypher
MATCH (a:Action {id:$id})-[:JUSTIFIED_BY]->(c:Claim)
OPTIONAL MATCH (c)-[:SUPPORTED_BY|DERIVED_FROM*1..5]->(e:Evidence {state:'superseded'})
RETURN a.kind AS kind, a.state AS state, c.id AS claim, c.text AS claim_text,
       c.state AS claim_state,
       collect(DISTINCT {id:e.id, reason:e.superseded_reason, at:e.superseded_at,
                         summary:e.summary}) AS stale
```

### validity_premise_check_claim

Stale premises behind a claim

```cypher
MATCH (c:Claim {id:$id})
OPTIONAL MATCH (c)-[:SUPPORTED_BY|DERIVED_FROM*1..5]->(e:Evidence {state:'superseded'})
RETURN c.text AS claim_text, c.state AS claim_state,
       collect(DISTINCT {id:e.id, reason:e.superseded_reason, at:e.superseded_at,
                         summary:e.summary}) AS stale
```

### validity_sar_of_sentence

SAR containing a sentence

```cypher
MATCH (s:SAR)-[:CONTAINS]->(t:Sentence {id:$id}) RETURN s.id AS id, s.state AS state
```

### validity_set_state

Raise a node's validity state (stronger wins)

```cypher
MATCH (n {id:$id}) SET n.state = $state, n.state_changed_at = timestamp(), n.state_reason = $reason
```

### validity_supersede_evidence

Mark evidence superseded (non-destructive)

```cypher
MATCH (e:Evidence {id:$id})
SET e.state = 'superseded', e.superseded_at = timestamp(), e.superseded_reason = $reason
RETURN e.id AS id
```

## Inline queries

46 short queries are written inline (data loading, small lookups, DDL). f-string templates only interpolate labels and relationship types from fixed sets in code, never user input; values are always bound parameters.

- `backend/agents/archivist.py:33`

  ```cypher
  MATCH (c:Case) RETURN c.seed_account AS s
  ```

- `backend/agents/blackboard.py:65`

  ```cypher
  CREATE INDEX FOR (t:Task) ON (t.status)
  ```

- `backend/agents/blackboard.py:66`

  ```cypher
  CREATE INDEX FOR (t:Task) ON (t.id)
  ```

- `backend/agents/investigator.py:211`

  ```cypher
  MATCH (c:Claim {kind:'ring'}) RETURN c.id AS id LIMIT 1
  ```

- `backend/agents/investigator.py:214`

  ```cypher
  MATCH (e:Evidence {kind:'typology_match'}) RETURN split(e.origin, ':')[1] AS p
  ```

- `backend/agents/tools.py:77`

  ```cypher
  MATCH (c:Case) OPTIONAL MATCH (cl:Claim) WITH c, collect(cl) AS cls OPTIONAL MATCH (e:Evidence) WITH c, cls, collect(e) AS evs OPTIONAL MATCH (a:Action) RETURN c.id AS id, c.status AS status, c.title AS title, size(cls) AS claims, size(evs) AS evidence, collect(a.kind) AS actions
  ```

- `backend/agents/tools.py:130`

  ```cypher
  MATCH (c:Case) OPTIONAL MATCH (cl:Claim) WITH c, collect(cl) AS cls OPTIONAL MATCH (e:Evidence) WITH c, cls, collect(e) AS evs OPTIONAL MATCH (a:Action) RETURN c.id AS id, c.status AS status, c.title AS title, size(cls) AS claims, size(evs) AS evidence, collect(a.kind) AS actions
  ```

- `backend/agents/tools.py:350`

  ```cypher
  MATCH (c:Case) OPTIONAL MATCH (cl:Claim) WITH c, collect(cl) AS cls OPTIONAL MATCH (e:Evidence) WITH c, cls, collect(e) AS evs OPTIONAL MATCH (a:Action) RETURN c.id AS id, c.status AS status, c.title AS title, size(cls) AS claims, size(evs) AS evidence, collect(a.kind) AS actions
  ```

- `backend/agents/tools.py:256`

  ```cypher
  MATCH (a:Account) RETURN a.id AS id
  ```

- `backend/agents/triage.py:54`

  ```cypher
  MATCH (a:Account {id:$id}) RETURN a.component_size AS size
  ```

- `backend/agents/triage.py:65`

  ```cypher
  MATCH (a:Account {id:$id}) RETURN coalesce(a.passthrough_pairs,0) AS pt, a.community_size AS community
  ```

- `backend/agents/triage.py:143`

  ```cypher
  MATCH (a:Account) WHERE a.id IN $ids RETURN DISTINCT a.bank_id AS bank
  ```

- `backend/app/routers/cases.py:93`

  ```cypher
  MATCH (c:Case) RETURN c.id AS id, c.status AS status, c.title AS title, c.seed_account AS seed, c.seed_alert AS alert, c.bank_scope AS banks, c.opened_at AS opened_at
  ```

- `backend/app/routers/demo.py:71`

  ```cypher
  MATCH (n) WHERE n:Task OR n:Case OR n:Claim OR n:Decision DETACH DELETE n
  ```

- `backend/app/routers/demo.py:85`

  ```cypher
  MATCH (al:Alert {status:'open'}) WHERE al.tasked IS NULL SET al.tasked = -1 RETURN al.id AS id
  ```

- `backend/app/routers/demo.py:93`

  ```cypher
  MATCH (al:Alert {id:$id}) REMOVE al.tasked
  ```

- `backend/app/routers/network.py:64`

  ```cypher
  MATCH (m:Meta {id:'dataset'}) RETURN m.json AS j
  ```

- `backend/app/routers/trust.py:70`

  ```cypher
  MATCH (e:Evidence {kind:'shared_attr'}) WHERE e.state <> 'superseded' AND e.origin STARTS WITH 'attr:A' RETURN e.origin AS o
  ```

- `backend/app/services/baseline.py:68`

  ```cypher
  CREATE INDEX FOR (al:Alert) ON (al.id)
  ```

- `backend/app/services/baseline.py:69`

  ```cypher
  CREATE INDEX FOR (al:Alert) ON (al.status)
  ```

- `backend/app/services/kyc_synth.py:45`

  ```cypher
  MATCH (a:Account) RETURN a.id AS id, a.bank_id AS bank
  ```

- `backend/app/services/kyc_synth.py:113`

  ```cypher
  MATCH (n) WHERE n:Person OR n:Company OR n:Device OR n:IP OR n:Address DETACH DELETE n
  ```

- `backend/app/services/kyc_synth.py:132`

  ```cypher
  UNWIND $rows AS r MATCH (a:Account {id:r.a}) MATCH (p {id:r.p}) WHERE p:Person OR p:Company CREATE (p)-[:OWNS {valid_from:0, name_on_account:r.n}]->(a)
  ```

- `backend/app/services/kyc_synth.py:129`

  ```cypher
  f'UNWIND $rows AS r CREATE (:{label} {{id:r.id, name:r.name, name_norm:r.norm, kyc_id:r.id}})'
  ```

- `backend/app/services/kyc_synth.py:141`

  ```cypher
  f"UNWIND $rows AS r CREATE (x:{label} {{id:r.id, kind:r.kind,\n shared_count:r.shared, units:coalesce(r.units, 1),\n text:coalesce(r.text, '')}})"
  ```

- `backend/app/services/kyc_synth.py:144`

  ```cypher
  f'CREATE INDEX FOR (x:{label}) ON (x.id)'
  ```

- `backend/app/services/kyc_synth.py:147`

  ```cypher
  f'UNWIND $rows AS r MATCH (a:Account {{id:r.a}})\n MATCH (x {{id:r.x}}) WHERE x:Device OR x:IP OR x:Address\n CREATE (a)-[:{rel} {{first_seen:0}}]->(x)'
  ```

- `backend/app/services/kyc_synth.py:151`

  ```cypher
  f"CALL db.idx.fulltext.createNodeIndex('{label}', {{field:'name', phonetic:'dm:en'}})"
  ```

- `backend/app/services/kyc_synth.py:153`

  ```cypher
  f'CREATE INDEX FOR (p:{label}) ON (p.id)'
  ```

- `backend/app/services/loader.py:146`

  ```cypher
  UNWIND $b AS b MERGE (:Bank {id:b, name:'Bank '+b})
  ```

- `backend/app/services/loader.py:264`

  ```cypher
  MERGE (m:Meta {id:'dataset'}) SET m.json = $j
  ```

- `backend/app/services/loader.py:116`

  ```cypher
  CREATE VECTOR INDEX FOR (a:Account) ON (a.behavior_vec) OPTIONS {dimension:16, similarityFunction:'cosine'}
  ```

- `backend/app/services/loader.py:190`

  ```cypher
  UNWIND $rows AS r MATCH (s:Account {id:r.s}), (d:Account {id:r.d}) CREATE (s)-[:FLOWS {capacity:r.cap, n_txn:r.n}]->(d)
  ```

- `backend/app/services/loader.py:154`

  ```cypher
  f'UNWIND $rows AS r\n CREATE (a:{label} {{id:r.id, bank_id:r.bank_id, in_deg:r.in_deg, out_deg:r.out_deg,\n first_seen:r.first_seen, last_seen:r.last_seen}})\n WITH a, r MATCH (b:Bank {{id:r.bank_id}}) CREATE (a)-[:HELD_AT]->(b)'
  ```

- `backend/app/services/loader.py:162`

  ```cypher
  UNWIND $rows AS r MATCH (a:Account {id:r.id}) SET a.behavior_vec = vecf32(r.v)
  ```

- `backend/app/services/loader.py:176`

  ```cypher
  f'UNWIND $rows AS r\n MATCH (s:{ls} {{id:r.s}}) MATCH (d:{ld} {{id:r.d}})\n CREATE (s)-[:TRANSFERS {{txn_id:r.id, ts:r.ts, amount:r.amt, amount_recv:r.recv,\n cur:r.cur, cur_recv:r.cur_recv, format:r.fmt, capacity:r.amt}}]->(d)'
  ```

- `backend/app/services/loader.py:193`

  ```cypher
  MATCH (n) WHERE n:Account OR n:ExternalAccount OR n:OtherBank RETURN count(n) AS c
  ```

- `backend/detection/casegraph.py:60`

  ```cypher
  CREATE INDEX FOR (a:Account) ON (a.id)
  ```

- `backend/detection/casegraph.py:66`

  ```cypher
  f"UNWIND $rows AS r MATCH (a:Account {{id:r.a}})\n MERGE (x:{label} {{id:r.id}}) SET x.shared_count = r.shared_count, x.units = r.units\n MERGE (a)-[:{('USES_DEVICE' if label == 'Device' else 'USES_IP' if label == 'IP' else 'REGISTERED_AT')}]->(x)"
  ```

- `backend/detection/precompute.py:53`

  ```cypher
  MERGE (m:Meta {id:'precompute'}) SET m.json = $j
  ```

- `backend/knowledge/typology_kb.py:62`

  ```cypher
  CALL db.idx.fulltext.createNodeIndex({label:'Chunk', language:'English'}, 'text', 'title')
  ```

- `backend/knowledge/typology_kb.py:64`

  ```cypher
  CREATE INDEX FOR (t:Typology) ON (t.id)
  ```

- `backend/trust/gate.py:87`

  ```cypher
  MATCH (c:Case) RETURN c.id AS id, c.title AS title, c.seed_account AS seed, c.bank_scope AS banks
  ```

- `backend/trust/gate.py:213`

  ```cypher
  MATCH (s:SAR) RETURN count(s) AS c
  ```

- `backend/trust/store.py:149`

  ```cypher
  f'CREATE INDEX FOR (n:{label}) ON (n.id)'
  ```

- `backend/trust/store.py:178`

  ```cypher
  MATCH (e:Evidence) WHERE e.id IN $ids RETURN count(e) AS c
  ```
