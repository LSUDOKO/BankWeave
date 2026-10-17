"""Seeded synthetic identity layer (our own data; no real people).

Documented generation rule (reported in README so judges can audit leakage):
  * every Account gets an owner Person/Company; 12% of owners hold a second account at
    another bank, recorded under a spelling variant of the same name
  * P(member of a laundering attempt shares a device with another member) = 0.40
  * P(innocent account shares a device with a random other account)       = 0.03
  * families: 6% of innocent accounts share an address + IP with 1-3 others
  * one large residential building (address A-77, 200 units) houses ~15 accounts,
    including some attempt members -> realistic innocent explanation for the Skeptic
Shared attributes are therefore evidence, not labels.
"""
from __future__ import annotations

import json
import random
from datetime import date, timedelta

import psycopg

from app import db
from app.config import ROOT, get_settings

FIRST = ["John", "Maria", "Wei", "Aisha", "Carlos", "Olga", "Raj", "Fatima", "Liam", "Sofia",
         "Kenji", "Amara", "Pierre", "Ana", "Mohammed", "Elena", "David", "Priya", "Tomas",
         "Grace", "Ivan", "Lucia", "Omar", "Chen", "Hannah"]
LAST = ["Smith", "Lopez", "Zhang", "Khan", "Garcia", "Ivanova", "Patel", "Hassan", "Murphy",
        "Rossi", "Tanaka", "Okafor", "Dubois", "Silva", "Ali", "Petrova", "Cohen", "Sharma",
        "Novak", "Kim", "Brown", "Moreno", "Haddad", "Wong", "Fischer"]
VARIANTS = {"John": "Jon", "Smith": "Smyth", "Maria": "Mariya", "Mohammed": "Muhammad",
            "Lopez": "Lopes", "Zhang": "Chang", "Ivanova": "Ivanowa", "Chen": "Chan",
            "Hannah": "Hana", "Garcia": "Garsia", "Khan": "Kahn", "Murphy": "Murphey"}
OCCUPATIONS = ["Engineer", "Teacher", "Retail", "Nurse", "Consultant", "Student", "Driver",
               "Import/Export", "Restaurant owner", "Self-employed", "Accountant", "Unemployed"]
BUILDING_ID = "A-77"


def _variant(name: str) -> str:
    parts = name.split()
    return " ".join(VARIANTS.get(p, p) for p in parts)


def build(consortium: str, banks: list[str], attempts: list[dict], seed: int) -> dict:
    r = random.Random(seed)
    accts = db.q(consortium, "MATCH (a:Account) RETURN a.id AS id, a.bank_id AS bank")
    by_id = {a["id"]: a for a in accts}
    ids = [a["id"] for a in accts]
    members: set[str] = {m for a in attempts for m in a["members"] if m in by_id}

    persons, owns = [], []
    unowned = ids[:]
    r.shuffle(unowned)
    pid = 0
    while unowned:
        acct = unowned.pop()
        pid += 1
        company = r.random() < 0.15
        name = (f"{r.choice(LAST)} {r.choice(['Trading', 'Holdings', 'Logistics', 'Imports'])} Ltd"
                if company else f"{r.choice(FIRST)} {r.choice(LAST)}")
        p = {"id": f"P{pid:05d}", "name": name, "kind": "Company" if company else "Person",
             "accounts": [acct]}
        owns.append((p["id"], acct, name))
        if r.random() < 0.12:
            other = next((x for x in unowned if by_id[x]["bank"] != by_id[acct]["bank"]), None)
            if other:
                unowned.remove(other)
                p["accounts"].append(other)
                owns.append((p["id"], other, _variant(name)))
        persons.append(p)

    attrs: dict[str, dict] = {}
    links: list[tuple[str, str, str]] = []  # (account, rel, attr_id)

    def attach(acct: str, kind: str, aid: str, extra: dict | None = None):
        attrs.setdefault(aid, {"id": aid, "kind": kind, **(extra or {})})
        rel = {"device": "USES_DEVICE", "ip": "USES_IP", "address": "REGISTERED_AT"}[kind]
        links.append((acct, rel, aid))

    for i, a in enumerate(ids):  # everyone gets their own device, ip, address
        attach(a, "device", f"D{i:05d}")
        attach(a, "ip", f"IP{i:05d}")
        attach(a, "address", f"AD{i:05d}", {"units": 1, "text": f"{r.randrange(1, 300)} "
                                            f"{r.choice(LAST)} Street"})
    for att in attempts:  # mules sharing a device
        mem = [m for m in att["members"] if m in by_id]
        for m in mem:
            if r.random() < 0.40 and len(mem) > 1:
                peer = r.choice([x for x in mem if x != m])
                attach(m, "device", f"D{ids.index(peer):05d}")
    for a in ids:  # innocent device sharing
        if a not in members and r.random() < 0.03:
            attach(a, "device", f"D{r.randrange(len(ids)):05d}")
    for a in ids:  # families
        if a not in members and r.random() < 0.06:
            for f in r.sample(ids, r.randrange(1, 4)):
                attach(f, "address", f"AD{ids.index(a):05d}")
                attach(f, "ip", f"IP{ids.index(a):05d}")
    building = r.sample([m for m in members], min(5, len(members))) + r.sample(ids, 10)
    for a in building:
        attach(a, "address", BUILDING_ID, {"units": 200, "text": "77 Harbour View Towers"})

    shared: dict[str, int] = {}
    for _, _, aid in set(links):
        shared[aid] = shared.get(aid, 0) + 1
    return {"persons": persons, "owns": owns, "attrs": attrs, "links": sorted(set(links)),
            "shared": shared, "by_id": by_id}


def write_graph(name: str, data: dict, bank: str | None) -> None:
    def keep(acct: str) -> bool:
        return bank is None or data["by_id"][acct]["bank"] == bank

    base = {p["id"]: p["name"] for p in data["persons"]}
    kinds = {}
    owns = []
    for p, a, n in data["owns"]:
        if not keep(a):
            continue
        # a name variant is recorded as its own identity; SAME_AS must be discovered
        node_id = p if n == base[p] else p + "v"
        kinds[node_id] = next(x["kind"] for x in data["persons"] if x["id"] == p)
        owns.append({"p": node_id, "a": a, "n": n})
    persons = {o["p"]: o["n"] for o in owns}
    for label in ("Person", "Company"):
        rows = [{"id": pid, "name": n, "norm": n.lower()} for pid, n in persons.items()
                if kinds[pid] == label]
        db.q(name, f"UNWIND $rows AS r CREATE (:{label} {{id:r.id, name:r.name, "
                   f"name_norm:r.norm, kyc_id:r.id}})", {"rows": rows})
    # one name per (person, account) so variants exist across banks
    db.q(name, """UNWIND $rows AS r MATCH (a:Account {id:r.a})
        MATCH (p {id:r.p}) WHERE p:Person OR p:Company
        CREATE (p)-[:OWNS {valid_from:0, name_on_account:r.n}]->(a)""", {"rows": owns})
    links = [{"a": a, "rel": rel, "x": x} for a, rel, x in data["links"] if keep(a)]
    used = {link["x"] for link in links}
    label_of = {"device": "Device", "ip": "IP", "address": "Address"}
    for kind, label in label_of.items():
        rows = [{**v, "shared": data["shared"][k]} for k, v in data["attrs"].items()
                if v["kind"] == kind and k in used]
        db.q(name, f"""UNWIND $rows AS r CREATE (x:{label} {{id:r.id, kind:r.kind,
                     shared_count:r.shared, units:coalesce(r.units, 1),
                     text:coalesce(r.text, '')}})""", {"rows": rows})
        db.try_query(name, f"CREATE INDEX FOR (x:{label}) ON (x.id)")
    for rel in ("USES_DEVICE", "USES_IP", "REGISTERED_AT"):
        rows = [link for link in links if link["rel"] == rel]
        db.q(name, f"""UNWIND $rows AS r MATCH (a:Account {{id:r.a}})
            MATCH (x {{id:r.x}}) WHERE x:Device OR x:IP OR x:Address
            CREATE (a)-[:{rel} {{first_seen:0}}]->(x)""", {"rows": rows})
    for label in ("Person", "Company"):
        db.try_query(name, f"CALL db.idx.fulltext.createNodeIndex('{label}', "
                           f"{{field:'name', phonetic:'dm:en'}})")
        db.try_query(name, f"CREATE INDEX FOR (p:{label}) ON (p.id)")


def write_postgres(data: dict, seed: int) -> int:
    r = random.Random(seed + 1)
    rows = []
    addr_of: dict[str, str] = {}
    for a, rel, x in data["links"]:
        if rel == "REGISTERED_AT" and (a not in addr_of or x == BUILDING_ID):
            addr_of[a] = x
    for p in data["persons"]:
        for i, acct in enumerate(p["accounts"]):
            aid = addr_of.get(acct, "")
            ad = data["attrs"].get(aid, {})
            rows.append((f"C-{p['id'][1:]}-{i}", p["name"] if i == 0 else _variant(p["name"]),
                         date(1950, 1, 1) + timedelta(days=r.randrange(365 * 50)),
                         aid, ad.get("text", ""), ad.get("units", 1),
                         date(2015, 1, 1) + timedelta(days=r.randrange(365 * 7)),
                         r.choice(OCCUPATIONS), r.choice(["low", "low", "medium", "high"]),
                         data["by_id"][acct]["bank"], acct, p["kind"]))
    with psycopg.connect(get_settings().postgres_url, autocommit=True) as conn:
        conn.execute("DROP TABLE IF EXISTS kyc_customers")
        conn.execute("""CREATE TABLE kyc_customers (
            customer_id TEXT PRIMARY KEY, name TEXT, dob DATE, address_id TEXT,
            address_text TEXT, address_units INT, onboarding_date DATE, occupation TEXT,
            risk_rating TEXT, bank_id TEXT, account_id TEXT, customer_type TEXT)""")
        with conn.cursor() as cur:
            cur.executemany("INSERT INTO kyc_customers VALUES "
                            "(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", rows)
        conn.execute("CREATE INDEX ON kyc_customers (account_id)")
        conn.execute("CREATE INDEX ON kyc_customers (address_id)")
    return len(rows)


def run(prefix: str = "", with_postgres: bool = True) -> dict:
    s = get_settings()
    gt_file = ROOT / "eval" / (f"{prefix}ground_truth.json" if prefix else "ground_truth.json")
    gt = json.loads(gt_file.read_text())
    data = build(prefix + db.CONSORTIUM, gt["banks"], gt["attempts"], s.synth_seed)
    write_graph(prefix + db.CONSORTIUM, data, None)
    for b in gt["banks"]:
        write_graph(prefix + db.bank_graph(b), data, b)
    n = write_postgres(data, s.synth_seed) if with_postgres else 0
    return {"persons": len(data["persons"]), "attributes": len(data["attrs"]),
            "links": len(data["links"]), "kyc_rows": n}


if __name__ == "__main__":
    print(run())
