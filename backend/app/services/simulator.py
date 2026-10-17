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


SMURF_ALERT = cy("sim_smurf_alert", "Raise the one alert rules would see for a smurfing source", """
MATCH (a:Account {id:$id})
MERGE (al:Alert {id:$aid})
ON CREATE SET al.account_id = $id, al.bank_id = a.bank_id, al.rule = 'near_threshold_burst',
              al.ts = $ts, al.status = 'open', al.reason = $reason, al.hits = $hits,
              al.source = 'red_team'
MERGE (al)-[:RAISED_FOR]->(a)
""")


def inject_smurfing(n_mules: int = 8, seed: int | None = None) -> dict:
    """Red-team smurfing in 25 transfers: one source splits funds under the reporting line to
    eight mules at three banks (8), the mules forward to four collectors (8), five mule-to-mule
    hops add layering (5), and the collectors pay one sink (4). Rule-based monitoring sees one
    near-threshold burst at the source; the consortium graph sees the whole fan-out/fan-in."""
    import json
    from app.services.baseline import _id as alert_id
    from detection.settings import cfg
    thr = float(cfg()["reporting_threshold"])
    meta = db.ro(db.CONSORTIUM, "MATCH (m:Meta {id:'dataset'}) RETURN m.json AS j")
    banks = json.loads(meta[0]["j"])["banks"] if meta else []
    r = random.Random(seed if seed is not None else time.time())
    pool: dict[str, list[str]] = {}
    for p in db.ro(db.CONSORTIUM, PICK, {"banks": banks}):
        pool.setdefault(p["bank"], []).append(p["id"])
    use = r.sample(sorted(pool), min(3, len(pool)))
    pick = lambda i: (r.choice(pool[use[i % len(use)]]), use[i % len(use)])  # noqa: E731
    source, mules = pick(0), [pick(i) for i in range(n_mules)]
    collectors, sink = [pick(i + 1) for i in range(4)], pick(2)
    ts = int(time.time()) - 20 * 3600
    rows = []

    def add(a, b, amt):
        nonlocal ts
        ts += r.randrange(300, 2400)
        tid = "smurf-" + hashlib.sha1(f"{a[0]}{b[0]}{ts}".encode()).hexdigest()[:10]
        rows.append({"s": a[0], "d": b[0], "id": tid, "ts": ts, "amt": round(amt, 2),
                     "sb": a[1], "db": b[1]})
    for m in mules:  # split just under the reporting line
        add(source, m, r.uniform(0.86, 0.99) * thr)
    for i, m in enumerate(mules):
        add(m, collectors[i % 4], r.uniform(0.80, 0.95) * thr)
    for i in range(5):
        add(mules[i], mules[(i + 3) % len(mules)], r.uniform(0.2, 0.5) * thr)
    for c in collectors:
        add(c, sink, r.uniform(1.6, 1.9) * thr)
    db.q(db.CONSORTIUM, WRITE, {"rows": rows})
    for b in use:
        mine = [x for x in rows if x["sb"] == b or x["db"] == b]
        db.q(db.bank_graph(b), WRITE_BANK, {"rows": mine})
    motif_seeds.compute_and_store(db.CONSORTIUM)
    aid = alert_id(source[0], "near_threshold_burst")
    db.q(db.CONSORTIUM, SMURF_ALERT, {"id": source[0], "aid": aid, "ts": ts, "hits": n_mules,
                                      "reason": f"{n_mules} transfers between 85% and 99% of "
                                                f"{thr:,.0f} within 24 h"})
    accounts = sorted({x["s"] for x in rows} | {x["d"] for x in rows})
    events.publish("txn", db.CONSORTIUM, "red_team_smurf",
                   {"accounts": len(accounts), "banks": use, "transfers": len(rows)})
    events.publish("alert", db.CONSORTIUM, aid, {"status": "open", "rule": "near_threshold_burst"})
    return {"transfers": rows, "accounts": accounts, "banks": use, "source": source[0],
            "sink": sink[0], "alert": aid,
            "note": f"{len(rows)} transfers across {len(use)} banks; rules flag only the source"}
