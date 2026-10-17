"""LLM access through LiteLLM -> OpenRouter.

Two roles on purpose: a cheap `writer` model for agents and SAR drafts, and a different,
stronger `auditor` model for the provenance gate (same-model auditing fails - APG paper).
If no key is configured every call returns None and agents use their deterministic policy.
"""
from __future__ import annotations

import json
import os
import re
import time

from app import events
from app.config import get_settings

_JSON = re.compile(r"\{.*\}|\[.*\]", re.S)


def enabled() -> bool:
    return get_settings().llm_enabled


def model_for(role: str) -> str:
    s = get_settings()
    return s.llm_auditor_model if role == "auditor" else s.llm_writer_model


def _parse(text: str):
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        m = _JSON.search(text or "")
        if m:
            try:
                return json.loads(m.group(0))
            except ValueError:
                return None
    return None


def complete_json(role: str, system: str, user: str, max_tokens: int = 1500,
                  agent: str | None = None, case_graph: str = "llm"):
    """Return parsed JSON from the model, or None (disabled / error / unparseable)."""
    if not enabled():
        return None
    import litellm

    os.environ.setdefault("OPENROUTER_API_KEY", get_settings().openrouter_api_key or "")
    model = model_for(role)
    t0 = time.time()
    try:
        resp = litellm.completion(
            model=model, max_tokens=max_tokens, temperature=0.1,
            messages=[{"role": "system", "content": system + "\nRespond with JSON only."},
                      {"role": "user", "content": user}],
            response_format={"type": "json_object"}, timeout=60)
        text = resp.choices[0].message.content
    except Exception as exc:  # noqa: BLE001 - provider errors fall back to deterministic mode
        events.publish("agent_step", case_graph, "llm", {"error": str(exc)[:300],
                                                         "model": model}, agent=agent)
        return None
    out = _parse(text)
    events.publish("agent_step", case_graph, "llm",
                   {"model": model, "role": role, "ms": int((time.time() - t0) * 1000),
                    "ok": out is not None}, agent=agent)
    return out
