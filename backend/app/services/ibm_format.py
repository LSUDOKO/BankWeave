"""Parsing helpers for IBM's AMLworld CSV and Patterns files.

CSV header (verified against the published dataset):
Timestamp,From Bank,Account,To Bank,Account,Amount Received,Receiving Currency,
Amount Paid,Payment Currency,Payment Format,Is Laundering
"""
from __future__ import annotations

import calendar
import re
import time
from pathlib import Path

_BEGIN = re.compile(r"BEGIN LAUNDERING ATTEMPT - ([A-Z\- ]+?)(?::|$)")


def to_epoch(ts: str) -> int:
    return calendar.timegm(time.strptime(ts.strip(), "%Y/%m/%d %H:%M"))


def account_key(bank: str, acct: str) -> str:
    return f"{bank}|{acct}"


def parse_row(cols: list[str], idx: int) -> dict:
    return {
        "txn_id": f"t{idx}",
        "ts": to_epoch(cols[0]),
        "src_bank": cols[1].strip(),
        "src_acct": cols[2].strip(),
        "dst_bank": cols[3].strip(),
        "dst_acct": cols[4].strip(),
        "amount_recv": float(cols[5]),
        "cur_recv": cols[6].strip(),
        "amount_paid": float(cols[7]),
        "cur_paid": cols[8].strip(),
        "format": cols[9].strip(),
        "label": int(cols[10]),
    }


def parse_patterns(path: Path) -> list[dict]:
    """Parse laundering attempts. Evaluation ground truth only."""
    attempts: list[dict] = []
    cur: dict | None = None
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        m = _BEGIN.match(line)
        if m:
            cur = {"id": f"la{len(attempts)}", "pattern": m.group(1).strip(), "rows": []}
            continue
        if line.startswith("END LAUNDERING ATTEMPT"):
            if cur is not None:
                accts = set()
                for r in cur["rows"]:
                    accts.add(account_key(r["src_bank"], r["src_acct"]))
                    accts.add(account_key(r["dst_bank"], r["dst_acct"]))
                cur["accounts"] = sorted(accts)
                attempts.append(cur)
            cur = None
            continue
        if cur is not None:
            cur["rows"].append(parse_row(line.split(","), len(cur["rows"])))
    return attempts
