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

import logging

import litellm  # imported eagerly: lazy imports from several agent threads race

from app import events
from app.config import get_settings

log = logging.getLogger("bankweave.llm")
litellm.suppress_debug_info = True  # one clear log line per failure instead of a banner
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


_AFFORD = re.compile(r"can only afford (\d+)")
_RETRYABLE = ("RateLimit", "ServiceUnavailable", "APIError", "Timeout", "InternalServer")


def _chain(role: str) -> list[str]:
    s = get_settings()
    extra = s.llm_auditor_fallbacks if role == "auditor" else s.llm_writer_fallbacks
    return [model_for(role)] + [m.strip() for m in extra.split(",") if m.strip()]


def _call(model: str, msgs: list[dict], budget: int) -> str | None:
    resp = litellm.completion(model=model, max_tokens=budget, temperature=0.1, messages=msgs,
                              response_format={"type": "json_object"}, timeout=90)
    text = resp.choices[0].message.content
    if not text:  # some providers return empty content in JSON mode: retry once plain
        resp = litellm.completion(model=model, max_tokens=budget, temperature=0.1,
                                  messages=msgs, timeout=90)
        text = resp.choices[0].message.content
    return text


def complete_json(role: str, system: str, user: str, max_tokens: int = 1500,
                  agent: str | None = None, case_graph: str = "llm"):
    """Return parsed JSON from the model, or None (disabled / all models failed / unparseable).

    Degrades in order: primary model -> same model with the affordable token budget (credit
    errors) -> fallback models -> None (the caller's deterministic policy). The auditor's
    fallbacks never include the writer's models, so audits stay with a different model.
    """
    if not enabled():
        return None
    allowed = {a.strip() for a in get_settings().llm_agents.split(",") if a.strip()}
    if allowed and "*" not in allowed and (agent or role) not in allowed:
        return None  # this agent runs its deterministic graph policy
    st = get_settings()
    for env, val in (("OPENROUTER_API_KEY", st.openrouter_api_key), ("GROQ_API_KEY", st.groq_api_key)):
        if val:
            os.environ.setdefault(env, val)
    msgs = [{"role": "system", "content": system + "\nRespond with JSON only."},
            {"role": "user", "content": user}]
    # reasoning models spend completion tokens before answering; keep headroom for the answer
    budget = max(max_tokens, 1500) + 1500
    t0 = time.time()
    text, used, errors = None, None, []
    for model in _chain(role):
        tries = [budget]
        while tries:
            b = tries.pop(0)
            try:
                text = _call(model, msgs, b)
                used = model
                break
            except Exception as exc:  # noqa: BLE001
                msg = str(exc)
                m = _AFFORD.search(msg)
                if m and int(m.group(1)) > 600 and not tries and b > int(m.group(1)):
                    tries.append(int(m.group(1)) - 50)  # credit cap: retry within budget
                    continue
                errors.append(f"{model}: {type(exc).__name__}")
                log.warning("llm %s %s failed: %s: %s", role, model, type(exc).__name__, msg[:200])
        if used:
            break
    if not used:
        events.publish("agent_step", case_graph, "llm", {"error": "; ".join(errors)[:300],
                                                         "role": role}, agent=agent)
        return None
    out = _parse(text)
    events.publish("agent_step", case_graph, "llm",
                   {"model": used, "role": role, "ms": int((time.time() - t0) * 1000),
                    "ok": out is not None, "fallback": used != model_for(role)}, agent=agent)
    return out
