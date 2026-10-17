"""Agent worker process: claims blackboard tasks and runs them through the LangGraph flow.

Kill it at any time (docker kill / Ctrl-C / API stop): claimed tasks stop heart-beating, the
orchestrator resets them, and any worker resumes the case from the graph.
"""
from __future__ import annotations

import argparse
import threading
import time
import traceback
import uuid

from agents import orchestrator
from agents.blackboard import Blackboard
from agents.flow import build
from app import events
from app.config import get_settings

TYPES = ["triage", "investigate", "challenge", "report", "archive"]


class Worker:
    def __init__(self, concurrency: int | None = None, name: str | None = None):
        self.bb = Blackboard()
        self.flow = build(self.bb)
        self.n = concurrency or get_settings().worker_concurrency
        self.name = name or f"worker-{uuid.uuid4().hex[:4]}"
        self.stop_evt = threading.Event()
        self.threads: list[threading.Thread] = []
        self.processed = 0

    def _heartbeat(self, task_id: str, agent: str, done: threading.Event) -> None:
        while not done.wait(5):
            self.bb.heartbeat(task_id, agent)

    def _loop(self, idx: int) -> None:
        agent = f"{self.name}-{idx}"
        while not self.stop_evt.is_set():
            t = self.bb.claim(agent, TYPES)
            if not t:
                self.stop_evt.wait(1.0)
                continue
            done = threading.Event()
            threading.Thread(target=self._heartbeat, args=(t["id"], agent, done),
                             daemon=True).start()
            try:
                self.flow.invoke({"task_type": t["type"], "task_id": t["id"],
                                  "case_id": t["case_id"], "alert_id": t["alert_id"],
                                  "round": t.get("round") or 0})
                self.bb.done(t["id"])
                self.processed += 1
            except Exception as exc:  # noqa: BLE001
                traceback.print_exc()
                self.bb.fail(t["id"], f"{type(exc).__name__}: {exc}")
            finally:
                done.set()

    def _orchestrate(self) -> None:
        while not self.stop_evt.is_set():
            try:
                orchestrator.tick(self.bb)
            except Exception:  # noqa: BLE001
                traceback.print_exc()
            self.stop_evt.wait(2.0)

    def start(self) -> None:
        self.stop_evt.clear()
        self.threads = [threading.Thread(target=self._loop, args=(i,), daemon=True)
                        for i in range(self.n)]
        self.threads.append(threading.Thread(target=self._orchestrate, daemon=True))
        for t in self.threads:
            t.start()
        events.publish("worker", "consortium", self.name, {"status": "started", "n": self.n})

    def stop(self, wait: float = 0.0) -> None:
        """Stop claiming new tasks. wait > 0 blocks until in-flight tasks finish (used by
        reset, so no task writes into a case graph that is being dropped)."""
        self.stop_evt.set()
        if wait:
            for t in self.threads:
                t.join(timeout=wait)
        events.publish("worker", "consortium", self.name, {"status": "stopped"})

    @property
    def running(self) -> bool:
        return any(t.is_alive() for t in self.threads) and not self.stop_evt.is_set()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--concurrency", type=int, default=None)
    a = ap.parse_args()
    w = Worker(a.concurrency)
    w.start()
    print(f"{w.name} running with {w.n} agent threads; Ctrl-C to stop")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        w.stop()
