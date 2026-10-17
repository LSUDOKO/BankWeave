"""Cut a live-demo slice of IBM HI-Small that fits a small FalkorDB Cloud instance.

Real IBM transactions only. The slice keeps:
  * K cross-bank laundering groups whose members all bank at the top-B banks
    (groups = connected components of laundering transfers), with EVERY transfer touching
    their members - so their ordinary, innocent activity is there too
  * a random sample of background accounts at the same banks, with all their transfers
Labels are used only to choose the slice. Detection never sees them, and all published
numbers come from the full top-20-bank evaluation load, not from this slice.

Output: data/slice/IBM_SLICE_Trans.csv (IBM format; not committed - regenerate with this script)
"""
from __future__ import annotations

import argparse
import random
from pathlib import Path

import networkx as nx
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
COLS = ["Timestamp", "From Bank", "Account", "To Bank", "Account.1", "Amount Received",
        "Receiving Currency", "Amount Paid", "Payment Currency", "Payment Format", "Is Laundering"]


def main(src: Path, banks_n: int, groups: int, background: int, seed: int, max_rows: int) -> None:
    df = pd.read_csv(src, dtype=str)
    df.columns = COLS
    vol = pd.concat([df["From Bank"], df["To Bank"]]).value_counts()
    banks = set(vol.head(banks_n).index)
    inside = df["From Bank"].isin(banks) & df["To Bank"].isin(banks)
    df["s"] = df["From Bank"] + "|" + df["Account"]
    df["d"] = df["To Bank"] + "|" + df["Account.1"]
    lab = df[inside & (df["Is Laundering"] == "1")]
    g = nx.Graph()
    g.add_edges_from(zip(lab["s"], lab["d"]))
    comps = [c for c in nx.connected_components(g)
             if len({a.split("|")[0] for a in c}) >= 2 and 3 <= len(c) <= 40]
    rng = random.Random(seed)
    rng.shuffle(comps)
    members = set()
    for c in comps[:groups]:
        members |= c
    acct_bank = pd.concat([df.loc[inside, "s"], df.loc[inside, "d"]]).unique().tolist()
    bg = set(rng.sample([a for a in acct_bank if a not in members],
                        min(background, len(acct_bank))))
    keep_accts = members | bg
    sel = df[inside & (df["s"].isin(keep_accts) | df["d"].isin(keep_accts))]
    # very high-volume accounts would swamp a 100 MB instance: cap rows per account pair set
    if len(sel) > max_rows:
        must = sel[sel["s"].isin(members) | sel["d"].isin(members)]
        rest = sel.drop(must.index).sample(max(0, max_rows - len(must)), random_state=seed)
        sel = pd.concat([must, rest]).sort_index()
    out = ROOT / "data" / "slice"
    out.mkdir(parents=True, exist_ok=True)
    path = out / "IBM_SLICE_Trans.csv"
    sel[COLS].rename(columns={"Account.1": "Account"}).to_csv(path, index=False)
    print({"banks": sorted(banks), "groups": min(groups, len(comps)), "group_accounts": len(members),
           "background_accounts": len(bg), "transactions": len(sel),
           "laundering_transactions": int((sel["Is Laundering"] == "1").sum()), "file": str(path)})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(ROOT / "data/raw/HI-Small_Trans.csv"))
    ap.add_argument("--banks", type=int, default=6)
    ap.add_argument("--groups", type=int, default=30)
    ap.add_argument("--background", type=int, default=1500)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--max-rows", type=int, default=60000)
    a = ap.parse_args()
    main(Path(a.src), a.banks, a.groups, a.background, a.seed, a.max_rows)
