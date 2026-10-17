"""LangGraph state machine for one blackboard task.

State holds ids only; all content lives in FalkorDB. The router sends a task to its agent
node; the agent returns the next tasks; `schedule` writes them back to the blackboard, so the
flow can stop after any node (crash, kill) and another worker continues from the graph.

  triage --case--> investigate --> challenge --(objection, round<2)--> investigate
                                       \\--> report --(gate: publish|divergent)--> [human]
  [human approval] --> archive
"""
from __future__ import annotations

from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from agents import archivist, investigator, reporter, skeptic, triage
from agents.blackboard import Blackboard


class TaskState(TypedDict, total=False):
    task_type: str
    task_id: str
    case_id: str | None
    alert_id: str | None
    round: int
    result: dict
    scheduled: list[str]


def _triage(s: TaskState) -> TaskState:
    return {"result": triage.run(s["alert_id"])}


def _investigate(s: TaskState) -> TaskState:
    return {"result": investigator.run(s["case_id"], s.get("round") or 0)}


def _challenge(s: TaskState) -> TaskState:
    return {"result": skeptic.run(s["case_id"], s.get("round") or 0)}


def _report(s: TaskState) -> TaskState:
    return {"result": reporter.run(s["case_id"], s.get("round") or 0)}


def _archive(s: TaskState) -> TaskState:
    return {"result": archivist.run(s["case_id"])}


def build(bb: Blackboard):
    def schedule(s: TaskState) -> TaskState:
        ids = [bb.create(t, case_id=c, round_=r) for t, c, r in s["result"].get("next", [])]
        return {"scheduled": ids}

    g = StateGraph(TaskState)
    nodes = {"triage": _triage, "investigate": _investigate, "challenge": _challenge,
             "report": _report, "archive": _archive}
    for name, fn in nodes.items():
        g.add_node(name, fn)
        g.add_edge(name, "schedule")
    g.add_node("schedule", schedule)
    g.add_conditional_edges(START, lambda s: s["task_type"], {n: n for n in nodes})
    g.add_edge("schedule", END)
    return g.compile()
