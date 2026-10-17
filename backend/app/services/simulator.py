"""Live simulation: red-team injection of an evasive ring, and hunt mode.

inject_evasive_ring: writes a new cross-bank cycle into the consortium and the affected bank
graphs. Amounts stay below every baseline rule (no transfer > threshold, no near-threshold
burst, no cash/crypto), so rule-based monitoring raises nothing.

hunt: motif-coherent seeds + SPNSA subgraph pick a region with no alert at all; the top
uncovered seed gets a `hunt` alert so the normal agent pipeline investigates it.
"""
from __future__ import annotations

import hashlib
import random
import time

from app import db, events
from app.cypher import cy
from detection import motif_seeds, spnsa

PICK = cy("sim_pick_accounts", "Quiet accounts at different banks for a red-team ring", """
MATCH (a:Account) WHERE a.bank_id IN $banks AND a.out_deg < 20 AND a.in_deg < 20
RETURN a.id AS id, a.bank_id AS bank
""")

WRITE = cy("sim_write_transfers", "Insert simulated transfers (consortium)", """
UNWIND $rows AS r
MATCH (s:Account {id:r.s}), (d:Account {id:r.d})
CREATE (s)-[:TRANSFERS {txn_id:r.id, ts:r.ts, amount:r.amt, amount_recv:r.amt, cur:'US Dollar',
        cur_recv:'US Dollar', format:'ACH', capacity:r.amt, simulated:true}]->(d)
MERGE (s)-[f:FLOWS]->(d)
ON CREATE SET f.capacity = r.amt, f.n_txn = 1
ON MATCH SET f.capacity = f.capacity + r.amt, f.n_txn = f.n_txn + 1
SET s.out_deg = s.out_deg + 1, d.in_deg = d.in_deg + 1
""")

WRITE_BANK = cy("sim_write_transfers_bank", "Insert simulated transfers into one bank's view", """
UNWIND $rows AS r
MERGE (s:Account {id:r.s}) ON CREATE SET s.bank_id = r.sb
MERGE (d:Account {id:r.d}) ON CREATE SET d.bank_id = r.db
CREATE (s)-[:TRANSFERS {txn_id:r.id, ts:r.ts, amount:r.amt, amount_recv:r.amt, cur:'US Dollar',
        cur_recv:'US Dollar', format:'ACH', capacity:r.amt, simulated:true}]->(d)
""")

HUNT_ALERT = cy("sim_hunt_alert", "Raise a hunt-mode alert on an uncovered suspicious account", """
MATCH (a:Account {id:$id})
MERGE (al:Alert {id:$aid})
ON CREATE SET al.account_id = $id, al.bank_id = a.bank_id, al.rule = 'hunt', al.ts = $ts,
              al.status = 'open', al.reason = $reason, al.hits = 1
MERGE (al)-[:RAISED_FOR]->(a)
""")

COVERED = cy("sim_covered_accounts", "Accounts already alerted or in a case", """
MATCH (a:Account) WHERE a.id IN $ids
OPTIONAL MATCH (al:Alert)-[:RAISED_FOR]->(a)
OPTIONAL MATCH (c:Case)-[:CONCERNS]->(a)
RETURN a.id AS id, count(al) + count(c) AS covered
""")


def inject_evasive_ring(size: int = 5, seed: int | None = None) -> dict:
    meta = db.ro(db.CONSORTIUM, "MATCH (m:Meta {id:'dataset'}) RETURN m.json AS j")
    import json
    banks = json.loads(meta[0]["j"])["banks"] if meta else []
    r = random.Random(seed if seed is not None else time.time())
    pool = db.ro(db.CONSORTIUM, PICK, {"banks": banks})
    by_bank: dict[str, list[str]] = {}
    for p in pool:
        by_bank.setdefault(p["bank"], []).append(p["id"])
    use_banks = r.sample(sorted(by_bank), min(len(by_bank), 3))
    ring = []
    for i in range(size):
        ring.append((r.choice(by_bank[use_banks[i % len(use_banks)]]), use_banks[i % len(use_banks)]))
    ts = int(time.time()) - 6 * 3600
    amt = r.uniform(3000, 6000)  # under every rule: < threshold, not near it, not cash
    rows = []
    for i, (acct, bank) in enumerate(ring):
        nxt, nbank = ring[(i + 1) % len(ring)]
        ts += r.randrange(900, 3600)
        amt *= 0.99
        tid = "sim-" + hashlib.sha1(f"{acct}{nxt}{ts}".encode()).hexdigest()[:10]
        rows.append({"s": acct, "d": nxt, "id": tid, "ts": ts, "amt": round(amt, 2),
                     "sb": bank, "db": nbank})
    db.q(db.CONSORTIUM, WRITE, {"rows": rows})
    for b in use_banks:  # each bank sees only transfers touching it
        mine = [x for x in rows if x["sb"] == b or x["db"] == b]
        db.q(db.bank_graph(b), WRITE_BANK, {"rows": mine})
    motif_seeds.compute_and_store(db.CONSORTIUM)
    events.publish("txn", db.CONSORTIUM, "red_team", {"accounts": [a for a, _ in ring],
                                                      "banks": use_banks, "transfers": len(rows)})
    return {"accounts": [a for a, _ in ring], "banks": use_banks, "transfers": rows,
            "note": "amounts stay under every baseline rule, so no alert is raised"}


def hunt(k: int = 30, r: int = 1, alerts: int = 3) -> dict:
    seeds = motif_seeds.seeds_from_graph(db.CONSORTIUM, k, "motif")
    sub = spnsa.subgraph(db.CONSORTIUM, seeds, r)
    covered = {x["id"]: x["covered"] for x in db.ro(db.CONSORTIUM, COVERED, {"ids": seeds})}
    fresh = [s for s in seeds if not covered.get(s)][:alerts]
    raised = []
    for s in fresh:
        aid = "AL-H" + hashlib.sha1(s.encode()).hexdigest()[:7].upper()
        db.q(db.CONSORTIUM, HUNT_ALERT, {"id": s, "aid": aid, "ts": int(time.time()),
                                         "reason": "hunt mode: top motif seed with no alert"})
        raised.append(aid)
    events.publish("alert", db.CONSORTIUM, "hunt", {"count": len(raised), "seeds": len(seeds)})
    return {"seeds": seeds, "subgraph_nodes": len(sub["nodes"]), "alerts_raised": raised}
