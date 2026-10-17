"use client";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";

export type Health = {
  ok: boolean; graphs?: number; region?: string; llm?: boolean; worker?: boolean;
  memory?: { used_mb: number; max_mb: number | null; pct: number | null; policy?: string };
};
export type Mode = "live-llm" | "live-deterministic" | "replay" | "checking";

let cache: { at: number; h: Health | null } = { at: 0, h: null };

async function fetchHealth(): Promise<Health | null> {
  if (Date.now() - cache.at < 15000) return cache.h;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(API + "/health", { cache: "no-store", signal: ctl.signal });
    clearTimeout(t);
    cache = { at: Date.now(), h: r.ok ? await r.json() : null };
  } catch {
    cache = { at: Date.now(), h: null };
  }
  return cache.h;
}

export function modeOf(h: Health | null | undefined): Mode {
  if (h === undefined) return "checking";
  if (!h || !h.ok) return "replay";
  return h.llm ? "live-llm" : "live-deterministic";
}

export function useHealth(intervalMs = 20000) {
  const [h, setH] = useState<Health | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const tick = () => fetchHealth().then((x) => alive && setH(x));
    tick();
    const id = setInterval(tick, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [intervalMs]);
  return { health: h, mode: modeOf(h) };
}
