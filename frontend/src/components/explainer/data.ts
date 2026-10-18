"use client";
// Everything the explainer shows comes from these API responses (live, or the bundled snapshot
// captured from the same API when the free-tier server sleeps). Nothing here is hand-typed.
import { useEffect, useState } from "react";
import { live } from "@/lib/snapshot";

export type Account = { id: string; bank: string; pagerank: number; cases?: string[] };
export type Flow = { source: string; target: string; amount: number; n?: number; bank?: string };
export type Layers = {
  banks: string[];
  accounts: Account[];
  consortium_edges: Flow[];
  bank_edges: Flow[];
  externals: { id: string; seen_by: string; bank: string }[];
  cases: { id: string; title: string; status: string; accounts: string[]; claims: { id: string; kind: string; state: string }[] }[];
  cypher?: string[];
};

type ViewNode = { id: string; bank: string; kind: string; pagerank?: number };
type View = { view: string; nodes: ViewNode[]; edges: Flow[]; cypher?: string[]; stats: { nodes: number; edges: number; isolated: number } };
export type Group = { origin: string; kind: string; multiplicity: number; evidence_ids: string[]; summary: string; weight: number };
export type IndClaim = { id: string; text: string; kind: string; state: string; confidence: number; naive: number; paths: number; origins: number; groups: Group[]; challenge_groups: Group[] };
export type DagNode = { type: string; id: string; label: string; kind: string | null; state: string; status?: string | null; origin?: string | null };

export type Scenarios = {
  A: {
    alert: { id: string; rule: string; reason: string; cleared: string; account: string; bank: string; component_size: number; signals?: Record<string, unknown> };
    wcc: { componentId: number; size: number; n_banks: number } | null;
    wcc_ms: number;
    cypher: string[];
  };
  B: {
    case: { id: string; title: string; banks: string[] };
    accounts: number;
    banks: { bank: string; holds: number; links: number; holds_pct: number; ms: number }[];
    best_bank: { bank: string; holds: number; links: number; holds_pct: number; ms: number };
    consortium_links: number;
    consortium_ms: number;
    views: { consortium: View; bank: View };
    e2?: {
      dataset: string; attempts: number; mean_banks_per_attempt: number;
      best_single_bank: { mean_accounts_held: number; attempts_fully_held: number; mean_transfers_visible: number };
      consortium: { mean_accounts_held: number };
    };
    cypher: string[];
  };
  C: {
    case_id: string;
    title: string;
    building: string;
    evidence: { id: string; origin: string; summary: string; state: string;
      claims: { claim: string; confidence: number; rel: string; text: string }[];
      reach: { claims: string[]; derived: string[]; actions: string[]; sentences: string[] } }[];
    dag: { nodes: DagNode[]; edges: { source: string; type: string; target: string }[] };
    independence: { case_id: string; paths: number; origins: number; claims: IndClaim[]; mean_confidence: number; mean_naive: number; cypher?: string };
    cypher: string[];
  };
};

export type Overview = {
  alerts: { total: number; open?: number; cleared?: number; case?: number };
  cases: { total: number; open: number; pending_actions: number };
  claims: { claims: number; independent: number; flagged: number; paths: number; origins: number };
  falkordb: { region: string; graphs: number; case_graphs: number; version: string | null };
};
export type GraphInfo = { name: string; kind: string; nodes: number; edges: number };
export type Merkle = { case_id: string; root: string; count: number; algorithm?: string; leaves?: { type: string; id: string; state: string; hash: string }[] | number };

export type ExplainerData = {
  layers: Layers;
  scenarios: Scenarios;
  overview: Overview | null;
  graphs: GraphInfo[] | null;
  replay: boolean;
};

export type Loaded =
  | { state: "loading" }
  | { state: "error"; error: string }
  | { state: "ok"; data: ExplainerData };

const optional = <T,>(p: Promise<{ data: T; replay: boolean }>) => p.then((r) => r, () => null);

export function useExplainerData(): Loaded {
  const [s, setS] = useState<Loaded>({ state: "loading" });
  useEffect(() => {
    let alive = true;
    Promise.all([
      live<Layers>("/network/layers", 12000),
      live<Scenarios>("/scenarios", 12000),
      optional(live<Overview>("/overview", 12000)),
      optional(live<{ graphs: GraphInfo[] }>("/lab/graphs", 12000)),
    ]).then(([l, sc, ov, g]) => {
      if (!alive) return;
      setS({ state: "ok", data: {
        layers: l.data, scenarios: sc.data, overview: ov?.data ?? null, graphs: g?.data.graphs ?? null,
        replay: l.replay || sc.replay,
      } });
    }).catch(() => { if (alive) setS({ state: "error", error: "The API is unreachable and no snapshot is bundled." }); });
    return () => { alive = false; };
  }, []);
  return s;
}

/** The Merkle root is only served live (it is recomputed from the case graph on every read). */
export function useMerkle(caseId: string | undefined): Merkle | null {
  const [m, setM] = useState<Merkle | null>(null);
  useEffect(() => {
    if (!caseId) return;
    let alive = true;
    live<Merkle>(`/cases/${caseId}/merkle`, 15000).then(({ data }) => { if (alive) setM(data); }, () => {});
    return () => { alive = false; };
  }, [caseId]);
  return m;
}

/** Formatting helpers: a missing value renders as an en dash, never as a guess. */
export const num = (x?: number | null) => (x == null || Number.isNaN(x) ? "–" : Math.round(x).toLocaleString("en-US"));
export const pct1 = (x?: number | null) => (x == null ? "–" : `${(Math.round(x * 1000) / 10).toLocaleString("en-US")}%`);
export const dec = (x?: number | null, d = 3) => (x == null ? "–" : x.toFixed(d));
export const short = (id?: string | null, n = 6) => (id ? id.slice(0, n) : "–");
