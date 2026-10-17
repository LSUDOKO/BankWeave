"""Render docs/QUERIES.md from the Cypher registry (every query the product runs)."""
import importlib
import pkgutil
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

for pkg in ("app", "agents", "detection", "trust", "memory", "knowledge"):
    mod = importlib.import_module(pkg)
    for m in pkgutil.walk_packages(mod.__path__, pkg + "."):
        if m.name.endswith("__main__"):
            continue
        importlib.import_module(m.name)

from app.cypher import REGISTRY  # noqa: E402

by_mod = defaultdict(list)
for q in REGISTRY.values():
    by_mod[q.module].append(q)

out = ["# Cypher queries used by BankWeave", "",
       "Generated from the query registry (`backend/app/cypher.py`) by "
       "`scripts/gen_queries_md.py`. Every query the product runs is declared with "
       "`cy(name, purpose, text)`, so this file matches the code.", "",
       f"**{len(REGISTRY)} queries** across {len(by_mod)} modules. Native algorithms used: "
       "`algo.wcc`, `algo.labelPropagation`, `algo.pageRank`, `algo.betweenness`, "
       "`algo.HarmonicCentrality`, `algo.SPpaths`, `algo.SSpaths`, `algo.maxFlow`, `algo.bfs`, "
       "`algo.MSF`; indexes: range, full-text (Double Metaphone phonetic, English stemming), "
       "vector (HNSW, cosine).", "",
       "Not native in FalkorDB, done in plain Cypher instead: degree (precomputed), cycles "
       "(time-respecting iterative expansion), triangles / 3-cycles (motif score).", ""]
for mod in sorted(by_mod):
    out += [f"## `{mod}`", ""]
    for q in sorted(by_mod[mod], key=lambda x: x.name):
        out += [f"### {q.name}", "", q.purpose, "", "```cypher", q.text, "```", ""]
(ROOT / "docs" / "QUERIES.md").write_text("\n".join(out))
print(f"{len(REGISTRY)} queries written to docs/QUERIES.md")
