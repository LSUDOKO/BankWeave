export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const WS = process.env.NEXT_PUBLIC_WS_URL ?? API.replace(/^http/, "ws") + "/ws";

export async function get<T = any>(path: string): Promise<T> {
  const r = await fetch(API + path, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export async function post<T = any>(path: string, body: unknown = {}): Promise<T> {
  const r = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data?.detail?.message ?? r.statusText), { data, status: r.status });
  return data;
}

export const short = (id?: string | null, n = 6) => (id ? id.slice(0, n) : "—");
export const money = (x?: number | null) =>
  x == null ? "—" : x.toLocaleString("en-US", { maximumFractionDigits: 0 });
export const pct = (x?: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
