"use client";
import { API } from "@/lib/api";
import SNAP from "@/snapshots/index.json";

/** Real API responses captured by scripts/capture_snapshots.py, bundled so pages render
 *  instantly when the free-tier API is cold. Keyed by API path. */
const snapshots = SNAP as Record<string, unknown>;

export function snapshot<T = any>(path: string): T | undefined {
  return snapshots[path] as T | undefined;
}

export const capturedAt = (snapshots["_meta"] as { captured_at?: string } | undefined)?.captured_at;

/** Live first with a short timeout; on failure fall back to the bundled snapshot. */
export async function live<T = any>(path: string, timeoutMs = 15000): Promise<{ data: T; replay: boolean }> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(API + path, { cache: "no-store", signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(String(r.status));
    return { data: (await r.json()) as T, replay: false };
  } catch (err) {
    const s = snapshot<T>(path);
    if (s !== undefined) return { data: s, replay: true };
    throw err;
  }
}
