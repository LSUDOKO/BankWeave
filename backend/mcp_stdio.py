"""BankWeave MCP over stdio, for clients that only launch local commands.

Two modes:

  python mcp_stdio.py                 run the read-only tools directly against FalkorDB
                                      (FALKORDB_HOST/PORT/USERNAME/PASSWORD from env or ../.env)
  python mcp_stdio.py --remote [URL]  no database needed: forward every tools/prompts call to
                                      the hosted server (default https://bankweave-api.onrender.com/mcp)

Claude Code, from the repo root:
  claude mcp add bankweave-local -- uv run --directory backend python mcp_stdio.py --remote
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

HOSTED = "https://bankweave-api.onrender.com/mcp"
sys.path.insert(0, str(Path(__file__).resolve().parent))  # run from any cwd


def run_direct() -> None:
    from app.mcp_server import mcp
    mcp.run("stdio")


async def run_remote(url: str) -> None:
    """A thin stdio <-> streamable-HTTP bridge: list/call tools, list/get prompts."""
    from mcp import Client
    from mcp.server.lowlevel import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import ListPromptsResult, ListToolsResult

    async with Client(url, read_timeout_seconds=120) as remote:
        async def list_tools(ctx, params):
            return ListToolsResult(tools=(await remote.list_tools()).tools)

        async def call_tool(ctx, params):
            return await remote.call_tool(params.name, params.arguments or {})

        async def list_prompts(ctx, params):
            return ListPromptsResult(prompts=(await remote.list_prompts()).prompts)

        async def get_prompt(ctx, params):
            return await remote.get_prompt(params.name, params.arguments or {})

        init = getattr(remote, "initialize_result", None)
        server = Server(name="bankweave", instructions=getattr(init, "instructions", None),
                        on_list_tools=list_tools, on_call_tool=call_tool,
                        on_list_prompts=list_prompts, on_get_prompt=get_prompt)
        async with stdio_server() as (read, write):
            await server.run(read, write, server.create_initialization_options())


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--remote", nargs="?", const=HOSTED, default=None, metavar="URL",
                    help=f"proxy to a hosted BankWeave MCP endpoint (default {HOSTED})")
    a = ap.parse_args()
    if a.remote:
        asyncio.run(run_remote(a.remote))
    else:
        run_direct()
