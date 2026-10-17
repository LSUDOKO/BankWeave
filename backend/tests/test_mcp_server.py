import asyncio

from mcp_server.server import server


def test_tools_listed_with_typed_params():
    tools = asyncio.run(server.list_tools())
    names = {t.name for t in tools}
    assert {"trace_flow", "find_hub", "echo_check", "cypher_readonly", "list_graphs"} <= names
    tf = next(t for t in tools if t.name == "trace_flow")
    props = tf.inputSchema["properties"] if hasattr(tf, "inputSchema") else tf.input_schema["properties"]
    assert {"src", "dst", "graph", "case_id"} <= set(props)


def test_call_tool_runs_cypher(loaded):
    res = asyncio.run(server.call_tool("list_graphs", {}))
    assert "test_consortium" in str(res)
    res = asyncio.run(server.call_tool("cypher_readonly", {
        "graph": loaded["consortium"], "query": "MATCH (a:Account) RETURN count(a) AS n"}))
    assert "n" in str(res)
