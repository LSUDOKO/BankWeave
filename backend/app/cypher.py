"""Registry of every Cypher query the product runs.

Modules declare queries with `cy(name, purpose, text)`; `scripts/gen_queries_md.py`
renders the registry into docs/QUERIES.md, so the documentation can't drift from code.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Query:
    name: str
    purpose: str
    text: str
    module: str


REGISTRY: dict[str, Query] = {}


def cy(name: str, purpose: str, text: str) -> str:
    import inspect

    module = inspect.stack()[1].frame.f_globals.get("__name__", "?")
    text = "\n".join(line.rstrip() for line in text.strip("\n").splitlines())
    import textwrap

    text = textwrap.dedent(text)
    REGISTRY[name] = Query(name, purpose, text, module)
    return text
