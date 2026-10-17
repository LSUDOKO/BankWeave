"""SIMULATED card terminals: a digital twin of a POS and an ATM that speak ISO 8583-style
messages with real EMV TLV encoding, write card transactions into the consortium graph and
raise alerts the agents triage like any other.

The TLV bytes are standard BER-TLV (decode them at emvlab.org/tlvutils). The application
cryptogram (9F26) is an HMAC of the transaction data under a per-card key: real cards use
3DES/AES MACs inside the chip, so treat 9F26 as simulated. PANs are test numbers.
"""
from __future__ import annotations

import hashlib
import hmac
import math
import secrets
import threading
import time
from datetime import datetime, timezone

from app import db, events
from app.cypher import cy
from app.services.baseline import _id as alert_id

TERMINALS = {
    "POS-MUM-D00063": {"kind": "POS", "city": "Mumbai", "lat": 19.0760, "lon": 72.8777,
                       "device": "D00063", "ifd": "D0006301", "merchant": "M-MUM-4471",
                       "name": "BankWeave POS Mumbai IN", "txn_type": "00"},
    "ATM-DEL-A00091": {"kind": "ATM", "city": "Delhi", "lat": 28.6139, "lon": 77.2090,
                       "device": "A00091", "ifd": "A0009101", "merchant": "ATM-DEL-0091",
                       "name": "BankWeave ATM New Delhi IN", "txn_type": "01"},
}
TEST_PANS = ["4761730000000011", "5413330000000019", "6521600000000017"]
CARD_IDS = ["CARD-A", "CARD-B", "CARD-C"]
MAX_KMH = 900  # faster than a commercial flight: the same card cannot be in both places

CARD_ACCOUNTS = cy("pos_card_accounts", "Accounts that hold the three demo cards", """
MATCH (c:Case)-[:CONCERNS]->(a:Account)
WITH c, collect(DISTINCT a) AS accts, collect(DISTINCT a.bank_id) AS banks
WHERE size(accts) >= 3
WITH accts ORDER BY size(banks) DESC, size(accts) DESC LIMIT 1
UNWIND accts[0..3] AS a
RETURN a.id AS id, a.bank_id AS bank
""")

FALLBACK_ACCOUNTS = cy("pos_card_accounts_fallback", "Any three accounts for the demo cards", """
MATCH (a:Account) RETURN a.id AS id, a.bank_id AS bank ORDER BY coalesce(a.pagerank, 0) DESC LIMIT 3
""")

WRITE_TAP = cy("pos_write_card_txn", "Write a card transaction at a terminal into the consortium", """
MATCH (a:Account {id:$account})
MERGE (t:Terminal {id:$terminal})
ON CREATE SET t.kind = $kind, t.city = $city, t.lat = $lat, t.lon = $lon, t.merchant = $merchant
MERGE (d:Device {id:$device})
ON CREATE SET d.kind = 'device', d.units = 1, d.text = $terminal
MERGE (a)-[:USES_DEVICE {first_seen:$ts}]->(d)
CREATE (a)-[:CARD_TXN {stan:$stan, ts:$ts, amount:$amount, currency:'INR', card:$card,
                       atc:$atc, cryptogram:$ac, mti:'0200'}]->(t)
WITH d
MATCH (x:Account)-[:USES_DEVICE]->(d)
WITH d, count(DISTINCT x) AS n
SET d.shared_count = n
""")

RECENT_AT = cy("pos_recent_at_terminal", "Distinct cards at a terminal in the last window", """
MATCH (a:Account)-[t:CARD_TXN]->(:Terminal {id:$terminal})
WHERE t.ts >= $since AND t.ts <= $until
RETURN a.id AS account, a.bank_id AS bank, t.card AS card, t.amount AS amount, t.ts AS ts
""")

LAST_OF_CARD = cy("pos_last_txn_of_card", "Previous transaction of the same card", """
MATCH (a:Account)-[t:CARD_TXN {card:$card}]->(term:Terminal)
WHERE t.ts < $ts
RETURN t.ts AS ts, t.atc AS atc, term.id AS terminal, term.lat AS lat, term.lon AS lon,
       term.city AS city ORDER BY ts DESC LIMIT 1
""")

RAISE = cy("pos_raise_alert", "Raise a hardware-twin alert on an account", """
MATCH (a:Account {id:$account})
MERGE (al:Alert {id:$id})
ON CREATE SET al.account_id = $account, al.bank_id = a.bank_id, al.rule = $rule, al.ts = $ts,
              al.status = 'open', al.reason = $reason, al.hits = 1, al.source = 'hardware_twin'
MERGE (al)-[:RAISED_FOR]->(a)
RETURN al.id AS id, al.status AS status
""")


def bcd(digits: str) -> str:
    return digits if len(digits) % 2 == 0 else digits + "F"


def tlv(tag: str, value_hex: str) -> str:
    n = len(value_hex) // 2
    return tag + (f"{n:02X}" if n < 128 else f"81{n:02X}") + value_hex.upper()


def parse_tlv(hexstr: str) -> list[dict]:
    """Minimal BER-TLV parser for the tags we emit (two-byte tags start with 0x1F mask)."""
    out, i, b = [], 0, bytes.fromhex(hexstr)
    while i < len(b):
        tag = b[i:i + 1]
        if b[i] & 0x1F == 0x1F:
            tag = b[i:i + 2]
        i += len(tag)
        n = b[i]
        i += 1
        if n == 0x81:
            n = b[i]
            i += 1
        out.append({"tag": tag.hex().upper(), "len": n, "value": b[i:i + n].hex().upper()})
        i += n
    return out


TAG_NAMES = {"9F02": "Amount, authorised", "5F2A": "Transaction currency code", "9A": "Transaction date",
             "9C": "Transaction type", "9F1A": "Terminal country code", "9F1E": "IFD serial number",
             "9F36": "Application transaction counter (ATC)", "9F27": "Cryptogram information data",
             "9F26": "Application cryptogram (simulated)", "5A": "Application PAN (test)",
             "9F37": "Unpredictable number", "82": "Application interchange profile",
             "95": "Terminal verification results"}


class Twin:
    def __init__(self):
        self.lock = threading.Lock()
        self.atc = {c: 0x0010 for c in CARD_IDS}
        self.keys = {c: hashlib.sha256(f"card-key:{c}".encode()).digest() for c in CARD_IDS}
        self.log: list[dict] = []
        self._cards: list[dict] | None = None

    def cards(self) -> list[dict]:
        if self._cards is None:
            rows = db.ro(db.CONSORTIUM, CARD_ACCOUNTS) or db.ro(db.CONSORTIUM, FALLBACK_ACCOUNTS)
            self._cards = [{"card": CARD_IDS[i], "pan": TEST_PANS[i],
                            "pan_masked": TEST_PANS[i][:6] + "******" + TEST_PANS[i][-4:],
                            "account": r["id"], "bank": r["bank"]} for i, r in enumerate(rows[:3])]
        return self._cards

    def tap(self, terminal: str, card: str, amount: float, ts: int | None = None,
            clone: bool = False) -> dict:
        term = TERMINALS[terminal]
        c = next(x for x in self.cards() if x["card"] == card)
        ts = ts or int(time.time())
        with self.lock:
            if not clone:  # a cloned card replays the counter it was copied with
                self.atc[card] += 1
            atc = self.atc[card]
            stan = f"{secrets.randbelow(10**6):06d}"
        when = datetime.fromtimestamp(ts, timezone.utc)
        minor = f"{round(amount * 100):012d}"
        un = secrets.token_hex(4).upper()
        mac_input = f"{minor}0356{when:%y%m%d}{term['txn_type']}{atc:04X}{un}".encode()
        ac = hmac.new(self.keys[card], mac_input, hashlib.sha256).hexdigest()[:16].upper()
        tags = [("9F02", minor), ("5F2A", "0356"), ("9A", f"{when:%y%m%d}"),
                ("9C", term["txn_type"]), ("9F1A", "0356"), ("9F1E", term["ifd"].encode().hex()),
                ("9F36", f"{atc:04X}"), ("9F27", "80"), ("9F26", ac), ("5A", bcd(c["pan"])),
                ("9F37", un), ("82", "1980"), ("95", "0000008000" if clone else "0000000000")]
        field55 = "".join(tlv(t, v) for t, v in tags)
        msg = {"mti": "0200", "fields": {
            "2": c["pan_masked"], "3": "010000" if term["kind"] == "ATM" else "000000",
            "4": minor, "7": f"{when:%m%d%H%M%S}", "11": stan, "12": f"{when:%H%M%S}",
            "13": f"{when:%m%d}", "22": "071", "41": terminal, "42": term["merchant"],
            "43": term["name"], "49": "356", "55": field55}}
        decoded = [{**t, "name": TAG_NAMES.get(t["tag"], "")} for t in parse_tlv(field55)]
        db.q(db.CONSORTIUM, WRITE_TAP, {
            "account": c["account"], "terminal": terminal, "kind": term["kind"],
            "city": term["city"], "lat": term["lat"], "lon": term["lon"],
            "merchant": term["merchant"], "device": term["device"], "ts": ts, "stan": stan,
            "amount": float(amount), "card": card, "atc": atc, "ac": ac})
        alerts = self._detect(terminal, c, ts, atc)
        entry = {"ts": ts, "terminal": terminal, "city": term["city"], "card": card,
                 "account": c["account"], "amount": amount, "atc": atc, "clone": clone,
                 "iso8583": msg, "emv": decoded, "alerts": alerts,
                 "response": "05 DECLINE / REFER" if alerts else "00 APPROVED",
                 "emvlab": "https://emvlab.org/tlvutils/?data=" + field55}
        with self.lock:
            self.log.insert(0, entry)
            del self.log[50:]
        events.publish("hardware", db.CONSORTIUM, terminal,
                       {"card": card, "amount": amount, "alerts": len(alerts)})
        return entry

    def _raise(self, account: str, rule: str, reason: str, ts: int) -> dict:
        r = db.q(db.CONSORTIUM, RAISE, {"account": account, "id": alert_id(account, rule),
                                         "rule": rule, "reason": reason, "ts": ts})
        events.publish("alert", db.CONSORTIUM, alert_id(account, rule),
                       {"status": "open", "rule": rule, "source": "hardware_twin"})
        return {"id": r[0]["id"] if r else alert_id(account, rule), "rule": rule,
                "account": account, "reason": reason}

    def _detect(self, terminal: str, c: dict, ts: int, atc: int) -> list[dict]:
        out = []
        recent = db.ro(db.CONSORTIUM, RECENT_AT, {"terminal": terminal, "since": ts - 900,
                                                   "until": ts})
        cards = {r["card"] for r in recent}
        before = {r["card"] for r in recent if r["ts"] < ts}
        # three different cards on one terminal inside 15 minutes; fire on the tap that crosses it
        if len(cards) >= 3 and len(before) < 3 and c["card"] not in before:
            total = sum(r["amount"] for r in recent)
            for acct in {r["account"] for r in recent}:
                out.append(self._raise(acct, "pos_shared_terminal",
                                       f"{len(cards)} cards swiped at {terminal} within 15 min "
                                       f"(INR {total:,.0f}); terminal device {TERMINALS[terminal]['device']} "
                                       f"now shared by their accounts", ts))
        prev = db.ro(db.CONSORTIUM, LAST_OF_CARD, {"card": c["card"], "ts": ts})
        if prev and prev[0]["terminal"] != terminal:
            p, t = prev[0], TERMINALS[terminal]
            km = _km(p["lat"], p["lon"], t["lat"], t["lon"])
            hours = max((ts - p["ts"]) / 3600, 1e-6)
            if km / hours > MAX_KMH or atc <= (p["atc"] or 0):
                why = (f"card used in {p['city']} then {t['city']} {km:,.0f} km apart in "
                       f"{(ts - p['ts']) / 60:.0f} min ({km / hours:,.0f} km/h)")
                if atc <= (p["atc"] or 0):
                    why += f"; ATC did not advance ({p['atc']} then {atc}): cloned chip data"
                out.append(self._raise(c["account"], "impossible_travel", why, ts))
        return out


def _km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


TWIN = Twin()


def preset(name: str) -> dict:
    # start an hour after the latest tap so repeated demo runs never share a detection window
    last = db.ro(db.CONSORTIUM, "MATCH ()-[t:CARD_TXN]->() RETURN max(t.ts) AS ts")
    now = max(int(time.time()), (last[0]["ts"] or 0) + 3600 if last else 0)
    cards = [c["card"] for c in TWIN.cards()]
    if name == "mule_ring":
        steps = [TWIN.tap("POS-MUM-D00063", cards[i], amt, now + 60 * i)
                 for i, amt in enumerate([9400.0, 9650.0, 9820.0])]
        title = "Mule card-swiping ring on shared POS D00063"
    elif name == "impossible_travel":
        steps = [TWIN.tap("POS-MUM-D00063", cards[0], 2450.0, now),
                 TWIN.tap("ATM-DEL-A00091", cards[0], 20000.0, now + 25 * 60, clone=True)]
        title = "Cloned EMV card: Mumbai then Delhi in 25 minutes"
    else:
        raise ValueError("unknown preset")
    return {"preset": name, "title": title, "steps": steps,
            "alerts": [a for s in steps for a in s["alerts"]]}
