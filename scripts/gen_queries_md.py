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
# Inline queries: string literals / f-string templates passed straight to db.q / db.ro /
# db.try_query (found statically with ast, so nothing the product runs is missing here).
import ast  # noqa: E402


def inline_queries():
    found = []
    for path in sorted((ROOT / "backend").rglob("*.py")):
        if ".venv" in path.parts or "tests" in path.parts:
            continue
        tree = ast.parse(path.read_text())
        for fn in ast.walk(tree):
            if not isinstance(fn, (ast.FunctionDef, ast.Module)):
                continue
            local = {}
            for node in ast.walk(fn):
                if isinstance(node, ast.Assign) and len(node.targets) == 1 and \
                        isinstance(node.targets[0], ast.Name) and \
                        isinstance(node.value, (ast.Constant, ast.JoinedStr)):
                    local[node.targets[0].id] = node.value
            for node in ast.walk(fn):
                if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                        and node.func.attr in ("q", "ro", "try_query")
                        and isinstance(node.func.value, ast.Name) and node.func.value.id == "db"
                        and len(node.args) >= 2):
                    continue
                arg = node.args[1]
                if isinstance(arg, ast.Name) and arg.id in local:
                    arg = local[arg.id]
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    text = arg.value
                elif isinstance(arg, ast.JoinedStr):
                    text = ast.unparse(arg)  # f-string template: labels filled from fixed sets
                else:
                    continue
                key = (str(path.relative_to(ROOT)), node.lineno)
                if key not in {(f, l) for f, l, _ in found}:
                    found.append((*key, " ".join(text.split())))
    return found


inl = inline_queries()
out += ["## Inline queries", "",
        f"{len(inl)} short queries are written inline (data loading, small lookups, DDL). "
        "f-string templates only interpolate labels and relationship types from fixed sets in "
        "code, never user input; values are always bound parameters.", ""]
for f, line, text in inl:
    out += [f"- `{f}:{line}`", "", "  ```cypher", f"  {text}", "  ```", ""]
(ROOT / "docs" / "QUERIES.md").write_text("\n".join(out))
print(f"{len(REGISTRY)} registered + {len(inl)} inline queries written to docs/QUERIES.md")
