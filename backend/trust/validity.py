"""Cascading invalidation + premise check (PACMI, arXiv 2610.05732).

Validity lattice on Evidence / Claim / Action / SAR / Sentence:
    active < needs_verification < historical_only < superseded   (stronger state wins)

When evidence is superseded, the change propagates along typed dependency edges:
    Claim -SUPPORTED_BY-> Evidence      => claim needs_verification
    Claim -DERIVED_FROM-> Claim         => claim needs_verification
    Action -JUSTIFIED_BY-> Claim        => action needs_verification (human review)
    Sentence -CITES-> Evidence|Claim    => sentence + its SAR needs_verification
    Claim -CHALLENGED_BY-> Evidence     => no state change; confidence is recomputed
Nothing is deleted: superseded items stay, linked by SUPERSEDES, with timestamps.
"""
from __future__ import annotations

from app import db, events
from app.cypher import cy
from trust import echo, store

ORDER = {s: i for i, s in enumerate(store.VALID_STATES)}

SUPERSEDE = cy("validity_supersede_evidence", "Mark evidence superseded (non-destructive)", """
MATCH (e:Evidence {id:$id})
SET e.state = 'superseded', e.superseded_at = timestamp(), e.superseded_reason = $reason
RETURN e.id AS id
""")

LINK_SUPERSEDES = cy("validity_link_supersedes", "New evidence supersedes old evidence", """
MATCH (n:Evidence {id:$new}), (o:Evidence {id:$old})
MERGE (n)-[:SUPERSEDES {reason:$reason, ts:timestamp()}]->(o)
""")

DEPENDENTS = cy("validity_direct_dependents", "Nodes that depend directly on a node", """
MATCH (x {id:$id})
OPTIONAL MATCH (d)-[r:SUPPORTED_BY|DERIVED_FROM|JUSTIFIED_BY|CITES]->(x)
RETURN collect(DISTINCT {id:d.id, label:labels(d)[0], rel:type(r), state:d.state}) AS deps
""")

SET_STATE = cy("validity_set_state", "Raise a node's validity state (stronger wins)", """
MATCH (n {id:$id}) SET n.state = $state, n.state_changed_at = timestamp(), n.state_reason = $reason
""")

SAR_OF_SENTENCE = cy("validity_sar_of_sentence", "SAR containing a sentence", """
MATCH (s:SAR)-[:CONTAINS]->(t:Sentence {id:$id}) RETURN s.id AS id, s.state AS state
""")

CHALLENGED_CLAIMS = cy("validity_challenged_claims", "Claims challenged by an evidence item", """
MATCH (c:Claim)-[:CHALLENGED_BY]->(e:Evidence {id:$id}) RETURN c.id AS id
""")

PREMISE_ACTION = cy("validity_premise_check_action", "Stale premises behind an action", """
MATCH (a:Action {id:$id})-[:JUSTIFIED_BY]->(c:Claim)
OPTIONAL MATCH (c)-[:SUPPORTED_BY|DERIVED_FROM*1..5]->(e:Evidence {state:'superseded'})
RETURN a.kind AS kind, a.state AS state, c.id AS claim, c.text AS claim_text,
       c.state AS claim_state,
       collect(DISTINCT {id:e.id, reason:e.superseded_reason, at:e.superseded_at,
                         summary:e.summary}) AS stale
""")

PREMISE_CLAIM = cy("validity_premise_check_claim", "Stale premises behind a claim", """
MATCH (c:Claim {id:$id})
OPTIONAL MATCH (c)-[:SUPPORTED_BY|DERIVED_FROM*1..5]->(e:Evidence {state:'superseded'})
RETURN c.text AS claim_text, c.state AS claim_state,
       collect(DISTINCT {id:e.id, reason:e.superseded_reason, at:e.superseded_at,
                         summary:e.summary}) AS stale
""")

AS_OF = cy("validity_beliefs_as_of", "What the case believed at a past time (history kept)", """
MATCH (c:Claim) WHERE c.created_at <= $ts
OPTIONAL MATCH (c)-[:SUPPORTED_BY]->(e:Evidence)
WHERE e.created_at <= $ts AND (e.superseded_at IS NULL OR e.superseded_at > $ts)
RETURN c.id AS claim, c.text AS text, count(e) AS support_then,
       CASE WHEN c.state_changed_at IS NULL OR c.state_changed_at > $ts
            THEN 'active' ELSE c.state END AS state_then
""")

FIND_BY_ORIGIN = cy("validity_find_evidence_by_origin", "Active evidence resting on an origin", """
MATCH (e:Evidence {origin:$origin}) WHERE e.state <> 'superseded'
RETURN e.id AS id
""")


def _raise(graph: str, node_id: str, current: str | None, new: str, reason: str) -> bool:
    if ORDER.get(current or "active", 0) >= ORDER[new]:
        return False
    db.q(graph, SET_STATE, {"id": node_id, "state": new, "reason": reason})
    events.publish("state_change", graph, node_id, {"state": new, "reason": reason})
    return True


def cascade(graph: str, start_id: str, reason: str, max_depth: int = 5) -> dict:
    affected = {"claims": [], "actions": [], "sentences": [], "sars": []}
    frontier, seen = [start_id], {start_id}
    for _ in range(max_depth):
        nxt = []
        for nid in frontier:
            deps = db.q(graph, DEPENDENTS, {"id": nid})[0]["deps"]
            for d in deps:
                if not d or d.get("id") is None or d["id"] in seen:
                    continue
                seen.add(d["id"])
                _raise(graph, d["id"], d.get("state"), "needs_verification", reason)
                key = {"Claim": "claims", "Action": "actions",
                       "Sentence": "sentences"}.get(d["label"])
                if key:  # reported even if already flagged: it rests on this evidence
                    affected[key].append(d["id"])
                if d["label"] == "Sentence":
                    for s in db.q(graph, SAR_OF_SENTENCE, {"id": d["id"]}):
                        if s["id"] not in affected["sars"]:
                            _raise(graph, s["id"], s.get("state"), "needs_verification", reason)
                            affected["sars"].append(s["id"])
                if d["label"] == "Claim":
                    nxt.append(d["id"])
        frontier = nxt
        if not frontier:
            break
    return affected


def invalidate_evidence(case_id: str, evidence_id: str, reason: str,
                        new_evidence_id: str | None = None) -> dict:
    g = db.case_graph(case_id)
    if not db.q(g, SUPERSEDE, {"id": evidence_id, "reason": reason}):
        raise ValueError(f"evidence {evidence_id} not found in case {case_id}")
    events.publish("state_change", g, evidence_id, {"state": "superseded", "reason": reason})
    if new_evidence_id:
        db.q(g, LINK_SUPERSEDES, {"new": new_evidence_id, "old": evidence_id, "reason": reason})
    affected = cascade(g, evidence_id, reason)
    # challenged claims keep their state but their confidence changes
    touched = set(affected["claims"]) | {r["id"] for r in db.q(g, CHALLENGED_CLAIMS,
                                                                {"id": evidence_id})}
    for cid in touched:
        echo.echo_check(case_id, cid)
    store.log_event(case_id, "trust", "invalidate_evidence",
                    {"evidence": evidence_id, "reason": reason, **affected}, SUPERSEDE)
    return {"evidence": evidence_id, "reason": reason, **affected}


def invalidate_origin(origin: str, reason: str, new_fact: dict | None = None) -> list[dict]:
    """A new fact about an origin (e.g. KYC update about an address) hits every case."""
    results = []
    for g in db.case_graphs():
        case_id = db.case_id_of(g)
        for row in db.q(g, FIND_BY_ORIGIN, {"origin": origin}):
            new_id = None
            if new_fact:
                new_id = store.add_evidence(case_id, "kyc_fact", new_fact["origin"],
                                            new_fact["summary"], new_fact.get("payload", {}),
                                            new_fact.get("cypher"), "kyc_update")
            results.append({"case": case_id, **invalidate_evidence(case_id, row["id"], reason,
                                                                   new_id)})
    return results


def premise_check(case_id: str, action_id: str | None = None,
                  claim_id: str | None = None) -> dict:
    g = db.case_graph(case_id)
    if action_id:
        rows = db.ro(g, PREMISE_ACTION, {"id": action_id})
    elif claim_id:
        rows = db.ro(g, PREMISE_CLAIM, {"id": claim_id})
    else:
        raise ValueError("pass action_id or claim_id")
    stale = [s for r in rows for s in r["stale"] if s.get("id")]
    if stale:
        s = stale[0]
        msg = (f"This rests on evidence superseded ({s['reason']}): '{s['summary']}'. "
               f"Re-verify before acting.")
    else:
        msg = "All premises are current."
    return {"ok": not stale, "stale": stale, "message": msg, "rows": rows,
            "cypher": PREMISE_ACTION if action_id else PREMISE_CLAIM}


def beliefs_as_of(case_id: str, ts_ms: int) -> list[dict]:
    return db.ro(db.case_graph(case_id), AS_OF, {"ts": ts_ms})
