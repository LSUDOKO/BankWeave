"""Load an IBM AMLworld CSV into FalkorDB.

Graphs written:
  consortium   - every account at the selected banks, hashed ids, full transfers
  bank_<id>    - one bank's partial view: own accounts + ExternalAccount stubs
Accounts at banks outside the selection collapse into one OtherBank sink per bank.

Labels never enter a graph: they go to eval/ground_truth.json only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

from app import db
from app.config import ROOT, get_settings
from app.services.ibm_format import parse_patterns

COLS = ["ts", "src_bank", "src_acct", "dst_bank", "dst_acct", "amount_recv", "cur_recv",
        "amount_paid", "cur_paid", "format", "label"]
BATCH = 5000
NEAR_THR = (8500.0, 10000.0)


def hash_id(bank: str, acct: str, salt: str) -> str:
    return hashlib.sha256(f"{bank}|{acct}|{salt}".encode()).hexdigest()[:16]


def read_transactions(path: Path, limit: int | None = None) -> pd.DataFrame:
    df = pd.read_csv(path, header=0, names=COLS, nrows=limit,
                     dtype={"src_bank": str, "src_acct": str, "dst_bank": str, "dst_acct": str,
                            "cur_recv": str, "cur_paid": str, "format": str})
    df["ts"] = (pd.to_datetime(df["ts"], format="%Y/%m/%d %H:%M").astype("int64") // 10**9)
    df["txn_id"] = "t" + df.index.astype(str)
    return df


def select_banks(df: pd.DataFrame, n: int) -> list[str]:
    vol = pd.concat([df["src_bank"], df["dst_bank"]]).value_counts()
    return sorted(vol.head(n).index.tolist())


def prepare(df: pd.DataFrame, banks: list[str], salt: str) -> pd.DataFrame:
    """Keep transactions touching a selected bank; assign hashed / sink ids."""
    sel = set(banks)
    df = df[df["src_bank"].isin(sel) | df["dst_bank"].isin(sel)].copy()
    for side in ("src", "dst"):
        inside = df[f"{side}_bank"].isin(sel)
        df[side] = np.where(
            inside,
            [hash_id(b, a, salt) for b, a in zip(df[f"{side}_bank"], df[f"{side}_acct"])],
            "other_" + df[f"{side}_bank"],
        )
        df[f"{side}_inside"] = inside
    return df


def behavior_vectors(df: pd.DataFrame) -> dict[str, list[float]]:
    """16 behaviour features per account, z-scored. Uses no labels."""
    out = df.rename(columns={"src": "acct", "dst": "cp"}).assign(dir="out")
    inn = df.rename(columns={"dst": "acct", "src": "cp"}).assign(dir="in")
    t = pd.concat([out, inn])[["acct", "cp", "dir", "amount_paid", "ts", "format"]]
    t = t[~t["acct"].str.startswith("other_")]
    amt = t["amount_paid"]
    t = t.assign(
        round_=(amt % 100 == 0).astype(float),
        near=((amt >= NEAR_THR[0]) & (amt < NEAR_THR[1])).astype(float),
        wire=(t["format"] == "Wire").astype(float),
        cash=t["format"].isin(["Cash", "Cheque"]).astype(float),
        ach=(t["format"] == "ACH").astype(float),
        night=((t["ts"] // 3600) % 24 < 6).astype(float),
    )
    g = t.groupby("acct")
    o, i = t[t["dir"] == "out"].groupby("acct"), t[t["dir"] == "in"].groupby("acct")
    gap = g["ts"].apply(lambda s: np.diff(np.sort(s.values)).mean() if len(s) > 1 else 0.0)
    out_cp = o["cp"].apply(set)
    in_cp = i["cp"].apply(set)
    recip = pd.Series({a: len(out_cp.get(a, set()) & in_cp.get(a, set()))
                       / max(1, len(out_cp.get(a, set()) | in_cp.get(a, set())))
                       for a in g.groups})
    feats = pd.DataFrame({
        "in_n": np.log1p(i.size()), "out_n": np.log1p(o.size()),
        "in_sum": np.log1p(i["amount_paid"].sum()), "out_sum": np.log1p(o["amount_paid"].sum()),
        "mean": np.log1p(g["amount_paid"].mean()), "std": np.log1p(g["amount_paid"].std()),
        "round": g["round_"].mean(), "near": g["near"].mean(),
        "in_cp": np.log1p(i["cp"].nunique()), "out_cp": np.log1p(o["cp"].nunique()),
        "gap": np.log1p(gap), "wire": g["wire"].mean(), "cash": g["cash"].mean(),
        "ach": g["ach"].mean(), "recip": recip, "night": g["night"].mean(),
    }).fillna(0.0)
    z = (feats - feats.mean()) / feats.std().replace(0, 1)
    return {a: [round(float(x), 5) for x in row] for a, row in zip(z.index, z.values)}


def _batches(rows: list[dict]):
    for k in range(0, len(rows), BATCH):
        yield rows[k:k + BATCH]


def _create_indexes(name: str, bank_graph: bool) -> None:
    for cypher in [
        "CREATE INDEX FOR (a:Account) ON (a.id)",
        "CREATE INDEX FOR (a:OtherBank) ON (a.id)",
        "CREATE INDEX FOR (b:Bank) ON (b.id)",
        "CREATE INDEX FOR ()-[t:TRANSFERS]-() ON (t.ts)",
        "CREATE INDEX FOR ()-[t:TRANSFERS]-() ON (t.txn_id)",
    ] + (["CREATE INDEX FOR (a:ExternalAccount) ON (a.id)"] if bank_graph else []):
        db.try_query(name, cypher)
    if not bank_graph:
        db.try_query(name, "CREATE VECTOR INDEX FOR (a:Account) ON (a.behavior_vec) "
                           "OPTIONS {dimension:16, similarityFunction:'cosine'}")


def write_graph(name: str, df: pd.DataFrame, bank: str | None,
                vectors: dict[str, list[float]]) -> dict:
    """Write one graph. bank=None means consortium (full view)."""
    db.drop_graph(name)
    _create_indexes(name, bank is not None)
    accts: dict[str, dict] = {}
    for side in ("src", "dst"):
        for nid, b, inside in zip(df[side], df[f"{side}_bank"], df[f"{side}_inside"]):
            if nid in accts:
                continue
            if not inside:
                accts[nid] = {"id": nid, "bank_id": b, "label": "OtherBank"}
            elif bank is None or b == bank:
                accts[nid] = {"id": nid, "bank_id": b, "label": "Account"}
            else:
                accts[nid] = {"id": nid, "bank_id": b, "label": "ExternalAccount"}

    if bank is not None:  # a bank only sees edges touching itself
        df = df[(df["src_bank"] == bank) | (df["dst_bank"] == bank)]
    out_deg = df.groupby("src").size().to_dict()
    in_deg = df.groupby("dst").size().to_dict()
    first = pd.concat([df[["src", "ts"]].rename(columns={"src": "a"}),
                       df[["dst", "ts"]].rename(columns={"dst": "a"})]).groupby("a")["ts"]
    first_seen, last_seen = first.min().to_dict(), first.max().to_dict()

    banks = sorted({a["bank_id"] for a in accts.values()})
    db.q(name, "UNWIND $b AS b MERGE (:Bank {id:b, name:'Bank '+b})", {"b": banks})
    for label in ("Account", "ExternalAccount", "OtherBank"):
        rows = [{**a, "in_deg": in_deg.get(a["id"], 0), "out_deg": out_deg.get(a["id"], 0),
                 "first_seen": int(first_seen.get(a["id"], 0)),
                 "last_seen": int(last_seen.get(a["id"], 0))}
                for a in accts.values() if a["label"] == label and
                (a["id"] in in_deg or a["id"] in out_deg)]
        for chunk in _batches(rows):
            db.q(name, f"""UNWIND $rows AS r
                CREATE (a:{label} {{id:r.id, bank_id:r.bank_id, in_deg:r.in_deg, out_deg:r.out_deg,
                                   first_seen:r.first_seen, last_seen:r.last_seen}})
                WITH a, r MATCH (b:Bank {{id:r.bank_id}}) CREATE (a)-[:HELD_AT]->(b)""",
                 {"rows": chunk})
    if bank is None and vectors:
        vrows = [{"id": k, "v": v} for k, v in vectors.items()]
        for chunk in _batches(vrows):
            db.q(name, "UNWIND $rows AS r MATCH (a:Account {id:r.id}) "
                       "SET a.behavior_vec = vecf32(r.v)", {"rows": chunk})

    erows = [{"s": s, "d": d, "id": t, "ts": int(ts), "amt": float(ap), "recv": float(ar),
              "cur": cp, "cur_recv": cr, "fmt": f}
             for s, d, t, ts, ap, ar, cp, cr, f in zip(
                 df["src"], df["dst"], df["txn_id"], df["ts"], df["amount_paid"],
                 df["amount_recv"], df["cur_paid"], df["cur_recv"], df["format"])]
    for chunk in _batches(erows):
        db.q(name, """UNWIND $rows AS r
            MATCH (s {id:r.s}) WHERE s:Account OR s:ExternalAccount OR s:OtherBank
            MATCH (d {id:r.d}) WHERE d:Account OR d:ExternalAccount OR d:OtherBank
            CREATE (s)-[:TRANSFERS {txn_id:r.id, ts:r.ts, amount:r.amt, amount_recv:r.recv,
                    cur:r.cur, cur_recv:r.cur_recv, format:r.fmt, capacity:r.amt}]->(d)""",
             {"rows": chunk})
    # FLOWS: one edge per ordered account pair (simple digraph). algo.maxFlow rejects
    # multi-edge relationship types, and the motif score is defined on a simple digraph.
    agg = (df[df["src_inside"] & df["dst_inside"] & (df["src"] != df["dst"])]
           .groupby(["src", "dst"]).agg(cap=("amount_paid", "sum"), n=("txn_id", "size"))
           .reset_index())
    frows = [{"s": s_, "d": d_, "cap": float(c), "n": int(k)}
             for s_, d_, c, k in zip(agg["src"], agg["dst"], agg["cap"], agg["n"])]
    for chunk in _batches(frows):
        db.q(name, """UNWIND $rows AS r
            MATCH (s:Account {id:r.s}), (d:Account {id:r.d})
            CREATE (s)-[:FLOWS {capacity:r.cap, n_txn:r.n}]->(d)""", {"rows": chunk})
    n = db.q(name, "MATCH (n) WHERE n:Account OR n:ExternalAccount OR n:OtherBank "
                   "RETURN count(n) AS c")[0]["c"]
    return {"graph": name, "nodes": n, "edges": len(erows)}


def ground_truth(df: pd.DataFrame, patterns_path: Path | None, banks: list[str],
                 salt: str) -> dict:
    """Evaluation-only labels. Never loaded into a graph."""
    lab = df[df["label"] == 1]
    illicit = sorted({x for x in pd.concat([lab["src"], lab["dst"]]) if not x.startswith("other_")})
    attempts = []
    if patterns_path and patterns_path.exists():
        sel = set(banks)
        for a in parse_patterns(patterns_path):
            members, abanks = set(), set()
            for k in a["accounts"]:
                b, acct = k.split("|", 1)
                if b in sel:
                    members.add(hash_id(b, acct, salt))
                    abanks.add(b)
            if members:
                attempts.append({"id": a["id"], "pattern": a["pattern"],
                                 "members": sorted(members), "banks": sorted(abanks),
                                 "cross_bank": len(abanks) >= 2})
    return {"banks": banks, "illicit_accounts": illicit,
            "laundering_txns": lab["txn_id"].tolist(), "attempts": attempts,
            "n_txn": int(len(df)), "n_laundering_txn": int(len(lab))}


def load(trans_path: Path, patterns_path: Path | None = None, top_n: int | None = None,
         limit: int | None = None, prefix: str = "") -> dict:
    s = get_settings()
    t0 = time.time()
    raw = read_transactions(trans_path, limit)
    banks = select_banks(raw, top_n or s.top_n_banks)
    df = prepare(raw, banks, s.hash_salt)
    vectors = behavior_vectors(df)
    stats = [write_graph(prefix + db.CONSORTIUM, df, None, vectors)]
    for b in banks:
        stats.append(write_graph(prefix + db.bank_graph(b), df, b, {}))
    gt = ground_truth(df, patterns_path, banks, s.hash_salt)
    gt_path = ROOT / "eval" / (f"{prefix}ground_truth.json" if prefix else "ground_truth.json")
    gt_path.parent.mkdir(parents=True, exist_ok=True)
    gt_path.write_text(json.dumps(gt))
    meta = {"source": trans_path.name, "banks": banks, "graphs": stats,
            "seconds": round(time.time() - t0, 1)}
    db.q(prefix + db.CONSORTIUM, "MERGE (m:Meta {id:'dataset'}) SET m.json = $j",
         {"j": json.dumps(meta)})
    return meta


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--trans", default=str(ROOT / "data/demo/DEMO_Trans.csv"))
    ap.add_argument("--patterns", default=None)
    ap.add_argument("--top-n", type=int, default=None)
    ap.add_argument("--limit", type=int, default=None)
    a = ap.parse_args()
    tp = Path(a.trans)
    pp = Path(a.patterns) if a.patterns else tp.with_name(tp.name.replace("_Trans.csv",
                                                                           "_Patterns.txt"))
    print(json.dumps(load(tp, pp, a.top_n, a.limit), indent=2))
