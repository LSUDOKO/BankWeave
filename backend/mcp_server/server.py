"""BankWeave MCP server: every investigation tool, served to any MCP client.

Each registry tool is exposed with its real typed parameters plus:
  graph    - which FalkorDB graph to read (consortium, bank_<id>, case_<id>)
  case_id  - record results as Evidence in this case (optional)
  record   - set false for a dry run
Plus `cypher_readonly` (ro_query: writes are rejected by FalkorDB) and `list_graphs`.

Run:  python -m mcp_server.server                 (stdio, e.g. Claude Desktop)
      python -m mcp_server.server --http 8765     (streamable HTTP)
"""
from __future__ import annotations

import argparse
import inspect
import json

from mcp.server.mcpserver import MCPServer

from agents import tools
from app import db

server = MCPServer(
    name="bankweave",
    instructions=("Graph tools for cross-bank AML investigation over FalkorDB. Graphs: "
                  "'consortium' (hashed cross-bank view), 'bank_<id>' (one bank's view), "
                  "'case_<id>' (an investigation). Results include the Cypher used."),
)


def _jsonable(x):
    return json.loads(json.dumps(x, default=str))


def _wrap(t: tools.Tool):
    sig = inspect.signature(t.fn)
    params = [p for name, p in sig.parameters.items() if name != "ctx"]
    extra = [
        inspect.Parameter("graph", inspect.Parameter.KEYWORD_ONLY, default=db.CONSORTIUM,
                          annotation=str),
        inspect.Parameter("case_id", inspect.Parameter.KEYWORD_ONLY, default=None,
                          annotation=str | None),
        inspect.Parameter("record", inspect.Parameter.KEYWORD_ONLY, default=True,
                          annotation=bool),
    ]
    params = [p.replace(kind=inspect.Parameter.KEYWORD_ONLY) for p in params]

    def fn(**kw):
        ctx = tools.Ctx(graph=kw.pop("graph"), case_id=kw.pop("case_id"), agent="mcp",
                        record=kw.pop("record"))
        return _jsonable(tools.call(t.name, ctx, **kw))

    fn.__name__ = t.name
    fn.__doc__ = t.description
    fn.__signature__ = inspect.Signature(params + extra, return_annotation=dict)
    fn.__annotations__ = {p.name: p.annotation for p in params + extra} | {"return": dict}
    return fn


for _t in tools.REGISTRY.values():
    server.add_tool(_wrap(_t), name=_t.name, description=_t.description)


@server.tool()
def cypher_readonly(graph: str, query: str) -> dict:
    """Run a read-only Cypher query (FalkorDB rejects writes on ro_query)."""
    return {"rows": _jsonable(db.ro(graph, query)[:500])}


@server.tool()
def list_graphs() -> list[str]:
    """List FalkorDB graphs: consortium, bank_<id>, case_<id>, procedures..."""
    return sorted(db.list_graphs())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--http", type=int, default=None, help="serve streamable HTTP on this port")
    a = ap.parse_args()
    if a.http:
        server.run("streamable-http", port=a.http, host="0.0.0.0")
    else:
        server.run("stdio")
