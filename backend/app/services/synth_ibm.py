"""Seeded generator that writes a small dataset in IBM AMLworld format.

Used for tests, offline development and a reproducible demo slice. It mixes
innocent background activity (payroll fan-outs, bills, peer payments) with
cross-bank laundering attempts in the same 8 shapes IBM documents. Like the
IBM data, every row carries a label and attempts are listed in a Patterns file.
"""
from __future__ import annotations

import argparse
import random
import time
from pathlib import Path

HEADER = ("Timestamp,From Bank,Account,To Bank,Account,Amount Received,Receiving Currency,"
          "Amount Paid,Payment Currency,Payment Format,Is Laundering")
MAIN_BANKS = ["001", "002", "003", "004"]
OTHER_BANKS = ["070", "071", "072"]
FORMATS = ["ACH", "Wire", "Cheque", "Credit Card", "Cash", "Reinvestment"]
START = 1661990400  # 2022-09-01 00:00 UTC, same period as IBM HI-Small


class Gen:
    def __init__(self, seed: int, n_accounts: int, days: int):
        self.r = random.Random(seed)
        self.days = days
        self.rows: list[tuple] = []
        self.attempts: list[tuple[str, str, list[tuple]]] = []
        self.accounts = [(self._bank(), f"{8000 + i:X}{self.r.randrange(16**4):04X}")
                         for i in range(n_accounts)]
        self.mule_pool = list(self.accounts)
        self.r.shuffle(self.mule_pool)

    def _bank(self) -> str:
        return self.r.choices(MAIN_BANKS + OTHER_BANKS, weights=[30, 25, 20, 15, 4, 3, 3])[0]

    def _ts(self, base: int | None = None, spread: int | None = None) -> int:
        if base is None:
            return START + self.r.randrange(self.days * 86400)
        return base + self.r.randrange(max(1, spread or 3600))

    def row(self, ts, src, dst, amount, fmt=None, label=0, cur="US Dollar"):
        r = (ts, src[0], src[1], dst[0], dst[1], round(amount, 2), cur, round(amount, 2), cur,
             fmt or self.r.choice(FORMATS), label)
        self.rows.append(r)
        return r

    def take_mules(self, k: int, min_banks: int = 2) -> list[tuple[str, str]]:
        while True:
            picked = [self.mule_pool.pop() for _ in range(k)]
            if len({b for b, _ in picked if b in MAIN_BANKS}) >= min_banks:
                return picked
            self.mule_pool[:0] = picked
            self.r.shuffle(self.mule_pool)

    # ---------------- innocent background ----------------
    def background(self, n_txn: int) -> None:
        accts = self.accounts
        employers = self.r.sample(accts, 12)
        for e in employers:  # payroll: innocent fan-out, monthly-ish, round-ish amounts
            staff = self.r.sample(accts, self.r.randrange(15, 40))
            for day in range(0, self.days, 7):
                base = START + day * 86400 + 9 * 3600
                for s in staff:
                    self.row(self._ts(base, 1800), e, s, self.r.uniform(1500, 4200), "ACH")
        merchants = self.r.sample(accts, 20)
        hubs = merchants[:5]
        for _ in range(n_txn):
            src = self.r.choice(accts)
            if self.r.random() < 0.35:
                dst = self.r.choice(hubs if self.r.random() < 0.4 else merchants)
                amt = self.r.lognormvariate(4.0, 0.9)
            else:
                dst = self.r.choice(accts)
                amt = self.r.lognormvariate(5.5, 1.3)
            if dst != src:
                self.row(self._ts(), src, dst, amt)
        for _ in range(n_txn // 40):  # innocent large one-offs that trip naive rules
            src, dst = self.r.sample(accts, 2)
            self.row(self._ts(), src, dst, self.r.uniform(10500, 60000), "Wire")

    # ---------------- laundering attempts ----------------
    def _attempt(self, pattern: str, detail: str, rows: list[tuple]) -> None:
        self.attempts.append((pattern, detail, rows))

    def fan_out(self):
        src, *dsts = self.take_mules(self.r.randrange(6, 11))
        t0 = self._ts()
        rows = [self.row(self._ts(t0, 6 * 3600), src, d, self.r.uniform(8000, 9900), label=1)
                for d in dsts]
        self._attempt("FAN-OUT", f"Max {len(dsts)}-degree Fan-Out", rows)

    def fan_in(self):
        dst, *srcs = self.take_mules(self.r.randrange(6, 11))
        t0 = self._ts()
        rows = [self.row(self._ts(t0, 6 * 3600), s, dst, self.r.uniform(8000, 9900), label=1)
                for s in srcs]
        self._attempt("FAN-IN", f"Max {len(srcs)}-degree Fan-In", rows)

    def cycle(self):
        ring = self.take_mules(self.r.randrange(4, 8), min_banks=3)
        t, amt, rows = self._ts(), self.r.uniform(20000, 90000), []
        for i, a in enumerate(ring):
            t += self.r.randrange(1800, 4 * 3600)
            amt *= self.r.uniform(0.97, 0.995)  # fee skimmed at each hop
            rows.append(self.row(t, a, ring[(i + 1) % len(ring)], amt, "Wire", 1))
        self._attempt("CYCLE", f"Max {len(ring)} hops", rows)

    def scatter_gather(self):
        src, dst, *mid = self.take_mules(self.r.randrange(5, 9), min_banks=3)
        t0, rows = self._ts(), []
        for m in mid:
            amt = self.r.uniform(5000, 9800)
            t1 = self._ts(t0, 3 * 3600)
            rows.append(self.row(t1, src, m, amt, label=1))
            rows.append(self.row(t1 + self.r.randrange(600, 7200), m, dst, amt * 0.99, label=1))
        self._attempt("SCATTER-GATHER", f"Max {len(mid)}-degree", rows)

    def gather_scatter(self):
        hub, *rest = self.take_mules(self.r.randrange(7, 11), min_banks=3)
        ins, outs = rest[: len(rest) // 2], rest[len(rest) // 2:]
        t0, rows, total = self._ts(), [], 0.0
        for s in ins:
            amt = self.r.uniform(6000, 9800)
            total += amt
            rows.append(self.row(self._ts(t0, 4 * 3600), s, hub, amt, label=1))
        t1 = t0 + 5 * 3600
        for d in outs:
            rows.append(self.row(self._ts(t1, 3 * 3600), hub, d, total / len(outs) * 0.98, label=1))
        self._attempt("GATHER-SCATTER", f"Max {len(rest)}-degree", rows)

    def stack(self):
        layers = [self.take_mules(3, min_banks=1) for _ in range(3)]
        t0, rows = self._ts(), []
        for li in range(2):
            for a in layers[li]:
                for b in layers[li + 1]:
                    t0 += self.r.randrange(300, 2400)
                    rows.append(self.row(t0, a, b, self.r.uniform(3000, 7000), label=1))
        self._attempt("STACK", "3 layers", rows)

    def bipartite(self):
        group = self.take_mules(8, min_banks=3)
        a, b = group[:4], group[4:]
        t0, rows = self._ts(), []
        for x in a:
            for y in self.r.sample(b, 2):
                rows.append(self.row(self._ts(t0, 8 * 3600), x, y, self.r.uniform(4000, 9900),
                                     label=1))
        self._attempt("BIPARTITE", "4x4", rows)

    def random_walk(self):
        chain = self.take_mules(self.r.randrange(4, 7), min_banks=2)
        t, amt, rows = self._ts(), self.r.uniform(15000, 50000), []
        for x, y in zip(chain, chain[1:]):
            t += self.r.randrange(1800, 6 * 3600)
            amt *= 0.99
            rows.append(self.row(t, x, y, amt, "Wire", 1))
        self._attempt("RANDOM", f"Max {len(chain) - 1} hops", rows)

    def write(self, out_dir: Path, name: str) -> tuple[Path, Path]:
        out_dir.mkdir(parents=True, exist_ok=True)
        fmt = lambda r: ",".join([time.strftime("%Y/%m/%d %H:%M", time.gmtime(r[0]))]
                                 + [str(x) if not isinstance(x, float) else f"{x:.2f}" for x in r[1:]])
        trans = out_dir / f"{name}_Trans.csv"
        trans.write_text(HEADER + "\n" + "\n".join(fmt(r) for r in sorted(self.rows)) + "\n")
        pats = out_dir / f"{name}_Patterns.txt"
        blocks = []
        for pattern, detail, rows in self.attempts:
            blocks.append(f"BEGIN LAUNDERING ATTEMPT - {pattern}:  {detail}\n"
                          + "\n".join(fmt(r) for r in rows)
                          + f"\nEND LAUNDERING ATTEMPT - {pattern}\n")
        pats.write_text("\n".join(blocks))
        return trans, pats


def generate(out_dir: Path, name: str = "DEMO", seed: int = 42, n_accounts: int = 600,
             days: int = 14, n_txn: int = 5000, attempts_per_pattern: int = 2) -> tuple[Path, Path]:
    g = Gen(seed, n_accounts, days)
    g.background(n_txn)
    makers = [g.fan_out, g.fan_in, g.cycle, g.scatter_gather, g.gather_scatter, g.stack,
              g.bipartite, g.random_walk]
    for _ in range(attempts_per_pattern):
        for m in makers:
            m()
    return g.write(out_dir, name)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/demo")
    ap.add_argument("--name", default="DEMO")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--accounts", type=int, default=600)
    ap.add_argument("--txn", type=int, default=5000)
    a = ap.parse_args()
    print(generate(Path(a.out), a.name, a.seed, a.accounts, n_txn=a.txn))
