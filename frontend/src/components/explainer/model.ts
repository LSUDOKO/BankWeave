// The 3D storyboard as data: where every node lives, and how each scene styles it.
// Layout is computed once from the real API payloads (accounts, flows, scenarios, provenance DAG);
// a scene is just a different look over the same objects, so the stage can ease between them.
import { forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { bankHex, setBankOrder } from "@/lib/banks";
import type { ExplainerData } from "./data";

export type V3 = [number, number, number];
export const LAYER = { bank: 0, cons: 22, case: 46 };

export const C = {
  bg: "#eef5ff",
  blue: "#087cf8",
  sky: "#8ad8fc",
  deep: "#0b2a5b",
  ghost: "#a9b6c8",
  stub: "#7f90a6",
  ok: "#0c9466",
  warn: "#c97a06",
  ring: "#d93a3f",
  line: "#9fb3cc",
  thread: "#7cc4f0",
};

type Group = "bank" | "ext" | "cons" | "alert" | "echoClaim" | "echoEv" | "echoCh" | "dag" | "leaf" | "mnode" | "key";
export type NodeSpec = { key: string; group: Group; home: V3; color: string; size: number; tag?: string; title: string };
type EdgeKind = "bank" | "thread" | "cons" | "ring" | "bv" | "alert" | "echo" | "echoCh" | "dag" | "cascade" | "merkle" | "sign";
export type EdgeSpec = { a: string; b: string; kind: EdgeKind; bold: boolean; color: string; flow?: boolean };
export type PlaneSpec = { key: string; center: V3; w: number; d: number; bank?: string };
export type Tone = "plain" | "blue" | "ok" | "warn" | "ring" | "deep";
export type LabelSpec = { key: string; anchor: string | V3; title: string; sub?: string; tone: Tone; below?: boolean };
export type Look = { p: V3; c: string; s: number; v: number };
export type Frame = {
  nodes: Look[];
  edges: { c: string; v: number }[];
  planes: number[];
  labels: number[];
  markers: { key: string; color: string }[];
  cam: { pos: V3; target: V3 };
};
export type Model = {
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  planes: PlaneSpec[];
  labels: LabelSpec[];
  frame: (scene: number, step: number) => Frame;
};

const TILE = 16;
const RING_R = 24;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

type SimNode = SimulationNodeDatum & { id: string; ring: boolean };

export function buildModel(d: ExplainerData): Model {
  const { layers: L, scenarios: S } = d;
  const banks = [...L.banks].sort();
  setBankOrder(banks);

  // accounts: the layer payload, plus any scenario-B ring member it does not already carry
  const acc = new Map(L.accounts.map((a) => [a.id, { id: a.id, bank: a.bank, pagerank: a.pagerank ?? 0 }]));
  for (const n of S.B.views.consortium.nodes) if (!acc.has(n.id)) acc.set(n.id, { id: n.id, bank: n.bank, pagerank: n.pagerank ?? 0 });
  const accounts = [...acc.values()];
  const maxPr = Math.max(1e-12, ...accounts.map((a) => a.pagerank));

  const ringIds = S.B.views.consortium.nodes.map((n) => n.id);
  const ring = new Set(ringIds);
  const ringEdges = S.B.views.consortium.edges.filter((e) => acc.has(e.source) && acc.has(e.target));
  const best = S.B.best_bank.bank;

  // ---- bank layer: one glass tile per bank, own accounts in a sunflower, external stubs around it
  const tileCenter = new Map<string, V3>();
  banks.forEach((b, i) => {
    const a = -Math.PI / 2 + (i / banks.length) * Math.PI * 2;
    tileCenter.set(b, [Math.cos(a) * RING_R, LAYER.bank, Math.sin(a) * RING_R]);
  });
  const centerOf = (b: string): V3 => tileCenter.get(b) ?? [0, LAYER.bank, 0];
  const bankPos = new Map<string, V3>();
  for (const b of banks) {
    const mine = accounts.filter((a) => a.bank === b).sort((x, y) => y.pagerank - x.pagerank);
    const c = centerOf(b);
    mine.forEach((a, k) => {
      const r = 5.4 * Math.sqrt((k + 0.5) / Math.max(1, mine.length));
      const t = k * 2.39996;
      bankPos.set(a.id, [c[0] + Math.cos(t) * r, c[1] + 0.55, c[2] + Math.sin(t) * r]);
    });
  }
  // stubs: what each bank holds for a counterparty at another bank (plus the ring stubs of the best bank's view)
  const ext = new Map<string, { id: string; seen: string; bank: string }>();
  for (const x of L.externals) ext.set(`${x.seen_by}:${x.id}`, { id: x.id, seen: x.seen_by, bank: x.bank });
  const bankView = S.B.views.bank;
  for (const n of bankView.nodes) if (n.kind !== "account" && !ext.has(`${best}:${n.id}`)) ext.set(`${best}:${n.id}`, { id: n.id, seen: best, bank: n.bank });
  const extPos = new Map<string, V3>();
  for (const b of banks) {
    const mine = [...ext.values()].filter((x) => x.seen === b);
    const c = centerOf(b);
    mine.forEach((x, k) => {
      const t = (k / Math.max(1, mine.length)) * Math.PI * 2;
      extPos.set(`${b}:${x.id}`, [c[0] + Math.cos(t) * 6.9, c[1] + 0.45, c[2] + Math.sin(t) * 6.9]);
    });
  }

  // ---- consortium plane: the ring laid out first at the centre, every other account forced around it
  const ringSim: SimNode[] = ringIds.map((id) => ({ id, ring: true }));
  forceSimulation(ringSim)
    .force("charge", forceManyBody().strength(-40))
    .force("link", forceLink<SimNode, { source: string; target: string }>(ringEdges.map((e) => ({ source: e.source, target: e.target }))).id((n) => n.id).distance(6))
    .force("x", forceX(0).strength(0.08)).force("y", forceY(0).strength(0.08))
    .stop().tick(240);
  const rMax = Math.max(1e-6, ...ringSim.map((n) => Math.hypot(n.x ?? 0, n.y ?? 0)));
  const consPos = new Map<string, V3>();
  for (const n of ringSim) consPos.set(n.id, [((n.x ?? 0) / rMax) * 5.6, LAYER.cons + 0.55, ((n.y ?? 0) / rMax) * 5.6]);

  const sim: SimNode[] = accounts.map((a) => {
    const p = consPos.get(a.id);
    return p ? { id: a.id, ring: true, fx: p[0], fy: p[2] } : { id: a.id, ring: false };
  });
  const links = L.consortium_edges.filter((e) => acc.has(e.source) && acc.has(e.target)).map((e) => ({ source: e.source, target: e.target }));
  forceSimulation(sim)
    .force("charge", forceManyBody().strength(-7))
    .force("link", forceLink<SimNode, { source: string; target: string }>(links).id((n) => n.id).distance(2.4).strength(0.35))
    .force("radial", forceRadial<SimNode>(15, 0, 0).strength((n) => (n.ring ? 0 : 0.06)))
    .force("collide", forceCollide(1.1))
    .stop().tick(320);
  const free = sim.filter((n) => !n.ring);
  const rs = free.map((n) => Math.hypot(n.x ?? 0, n.y ?? 0));
  const lo = Math.min(...rs, 0), hi = Math.max(...rs, 1);
  for (const n of free) {
    const r = Math.hypot(n.x ?? 0, n.y ?? 0) || 1e-6;
    const k = (9 + ((r - lo) / Math.max(1e-6, hi - lo)) * 12.5) / r;
    consPos.set(n.id, [(n.x ?? 0) * k, LAYER.cons + 0.55, (n.y ?? 0) * k]);
  }

  // ---- nodes
  const nodes: NodeSpec[] = [];
  for (const a of accounts) {
    const pr = Math.sqrt(a.pagerank / maxPr);
    nodes.push({ key: "b:" + a.id, group: "bank", home: bankPos.get(a.id) ?? centerOf(a.bank), color: bankHex(a.bank), size: 0.42 + 0.22 * pr, title: a.id, tag: a.bank });
  }
  for (const [k, x] of ext) {
    nodes.push({ key: "x:" + k, group: "ext", home: extPos.get(k) ?? centerOf(x.seen), color: C.ghost, size: 0.3, title: x.id, tag: x.seen });
  }
  for (const a of accounts) {
    const pr = Math.sqrt(a.pagerank / maxPr);
    nodes.push({ key: "c:" + a.id, group: "cons", home: consPos.get(a.id) ?? [0, LAYER.cons, 0], color: bankHex(a.bank), size: 0.34 + 0.8 * pr, title: a.id, tag: a.bank });
  }
  // scenario A: the alerted account's weakly connected component (its real size), off on its own
  const A = S.A;
  const compSize = Math.max(1, Math.min(24, A.wcc?.size ?? A.alert.component_size ?? 1));
  const alertCenter: V3 = [-21, LAYER.cons + 0.6, 20];
  for (let i = 0; i < compSize; i++) {
    const t = (i / compSize) * Math.PI * 2;
    const r = compSize === 1 ? 0 : 1.6;
    nodes.push({ key: "a:" + i, group: "alert", home: add(alertCenter, [Math.cos(t) * r, 0, Math.sin(t) * r]), color: C.ok, size: 0.75, title: i === 0 ? A.alert.account : "component member" });
  }

  // scenario C, claim with the most supporting paths: paths spread out, then collapse onto origins
  const ind = [...S.C.independence.claims].sort((x, y) => y.paths - x.paths)[0];
  const caseC: V3 = [0, LAYER.case + 0.9, 0];
  const echoPos0 = new Map<string, V3>(), echoPos1 = new Map<string, V3>();
  if (ind) {
    nodes.push({ key: "e:claim", group: "echoClaim", home: caseC, color: C.deep, size: 1.35, title: ind.id });
    const items = ind.groups.flatMap((g, gi) => g.evidence_ids.map((id) => ({ id, gi })));
    const ng = Math.max(1, ind.groups.length);
    items.forEach((it, k) => {
      const t0 = -Math.PI / 2 + (k / Math.max(1, items.length)) * Math.PI * 2;
      const t1 = -Math.PI / 2 + ((it.gi + 0.5) / ng) * Math.PI * 2;
      const key = `e:ev:${k}`;
      echoPos0.set(key, add(caseC, [Math.cos(t0) * 8.5, 0, Math.sin(t0) * 8.5]));
      echoPos1.set(key, add(caseC, [Math.cos(t1) * 8.5, 0, Math.sin(t1) * 8.5]));
      nodes.push({ key, group: "echoEv", home: echoPos0.get(key)!, color: C.blue, size: 0.72, title: it.id, tag: String(it.gi) });
    });
    ind.challenge_groups.forEach((g, k) => {
      nodes.push({ key: `e:ch:${k}`, group: "echoCh", home: add(caseC, [-11, 0, 2 + k * 2.8]), color: C.ring, size: 0.8, title: g.origin });
    });
  }

  // scenario C provenance DAG: claims | evidence | report sentences, actions and the SAR at the edges
  const dag = S.C.dag;
  const cols: Record<string, number[]> = { Action: [-14], Claim: [-9], Evidence: [-3, 0.5], Sentence: [6.5, 10], SAR: [15] };
  const byType = new Map<string, typeof dag.nodes>();
  for (const n of dag.nodes) {
    if (!cols[n.type]) continue;
    byType.set(n.type, [...(byType.get(n.type) ?? []), n]);
  }
  const dagPos = new Map<string, V3>();
  for (const [type, list] of byType) {
    const xs = cols[type];
    const per = Math.ceil(list.length / xs.length);
    list.forEach((n, i) => {
      const col = Math.floor(i / per), row = i % per;
      const span = Math.min(24, (per - 1) * 2.2);
      const z = per <= 1 ? 0 : -span / 2 + (row / (per - 1)) * span;
      dagPos.set(n.id, [xs[col], LAYER.case + 0.55, z]);
    });
  }
  const DAGC: Record<string, string> = { Evidence: "#5aa9e6", Claim: C.blue, Sentence: "#9db4cf", SAR: C.deep, Action: C.deep };
  const DAGS: Record<string, number> = { Evidence: 0.5, Claim: 0.9, Sentence: 0.45, SAR: 1, Action: 1 };
  for (const n of dag.nodes) {
    const p = dagPos.get(n.id);
    if (p) nodes.push({ key: "d:" + n.id, group: "dag", home: p, color: DAGC[n.type] ?? C.ghost, size: DAGS[n.type] ?? 0.5, title: n.id, tag: n.type });
  }
  // the building's shared-attribute evidence and everything that depends on it
  const sup = S.C.evidence.find((e) => e.origin === `attr:${S.C.building}`) ?? S.C.evidence[0];
  const reach = new Set<string>(sup ? [...sup.reach.claims, ...sup.reach.derived, ...sup.reach.actions, ...sup.reach.sentences] : []);
  const cascadeSet = new Set<string>([...(sup ? [sup.id] : []), ...reach]);

  // Merkle tree over the case graph's Claim, Evidence and Sentence records, sorted like the backend does
  const leaves = dag.nodes.filter((n) => n.type === "Claim" || n.type === "Evidence" || n.type === "Sentence")
    .sort((x, y) => (x.type === y.type ? (x.id < y.id ? -1 : 1) : x.type < y.type ? -1 : 1));
  const span = 34;
  let level = leaves.map((n, i) => {
    const key = "m:0:" + i;
    const x = leaves.length <= 1 ? 0 : -span / 2 + (i / (leaves.length - 1)) * span;
    nodes.push({ key, group: "leaf", home: [x, LAYER.case + 3.5, 0], color: DAGC[n.type] ?? C.ghost, size: 0.36, title: n.id, tag: "d:" + n.id });
    return { key, x };
  });
  const medges: EdgeSpec[] = [];
  let depth = 0;
  while (level.length > 1) {
    depth++;
    const next: { key: string; x: number }[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const pair = level.slice(i, i + 2);
      const x = pair.reduce((s, p) => s + p.x, 0) / pair.length;
      const key = `m:${depth}:${next.length}`;
      next.push({ key, x });
      nodes.push({ key, group: "mnode", home: [x, LAYER.case + 3.5 + depth * 2.8, 0], color: "#9fc6ef", size: 0.3, title: key });
      for (const p of pair) medges.push({ a: p.key, b: key, kind: "merkle", bold: false, color: "#87b6e8" });
    }
    level = next;
  }
  const rootKey = level[0]?.key;
  if (rootKey) {
    const r = nodes.find((n) => n.key === rootKey)!;
    r.group = "mnode"; r.color = C.blue; r.size = 0.95; r.title = "root";
    nodes.push({ key: "m:key", group: "key", home: [r.home[0] + 9, r.home[1] + 2.4, 0], color: C.deep, size: 0.85, title: "hardware key" });
  }

  // ---- edges
  const edges: EdgeSpec[] = [];
  for (const e of L.bank_edges) if (acc.has(e.source) && acc.has(e.target)) edges.push({ a: "b:" + e.source, b: "b:" + e.target, kind: "bank", bold: false, color: bankHex(e.bank ?? acc.get(e.source)!.bank) });
  for (const a of accounts) edges.push({ a: "b:" + a.id, b: "c:" + a.id, kind: "thread", bold: false, color: C.thread });
  for (const e of L.consortium_edges) if (acc.has(e.source) && acc.has(e.target)) edges.push({ a: "c:" + e.source, b: "c:" + e.target, kind: "cons", bold: false, color: C.line });
  const crossBank = new Set<number>();
  for (const e of ringEdges) {
    const cross = acc.get(e.source)!.bank !== acc.get(e.target)!.bank;
    if (cross) crossBank.add(edges.length);
    edges.push({ a: "c:" + e.source, b: "c:" + e.target, kind: "ring", bold: true, color: cross ? C.blue : C.line, flow: cross });
  }
  const bvKey = (id: string) => (acc.get(id)?.bank === best && bankView.nodes.find((n) => n.id === id)?.kind === "account" ? "b:" + id : "x:" + best + ":" + id);
  for (const e of bankView.edges) edges.push({ a: bvKey(e.source), b: bvKey(e.target), kind: "bv", bold: true, color: bankHex(best) });
  for (let i = 1; i < compSize; i++) edges.push({ a: "a:0", b: "a:" + i, kind: "alert", bold: true, color: C.ok });
  if (ind) {
    let k = 0;
    for (const g of ind.groups) for (let j = 0; j < g.evidence_ids.length; j++) edges.push({ a: `e:ev:${k++}`, b: "e:claim", kind: "echo", bold: true, color: C.blue });
    ind.challenge_groups.forEach((_, j) => edges.push({ a: `e:ch:${j}`, b: "e:claim", kind: "echoCh", bold: true, color: C.ring }));
  }
  const DE: Record<string, string> = { SUPPORTED_BY: C.blue, DERIVED_FROM: C.blue, JUSTIFIED_BY: C.deep, CHALLENGED_BY: C.ring, SUPERSEDES: C.ring, CITES: "#b7c7da", CONTAINS: "#c9d6e6" };
  for (const e of dag.edges) {
    if (!dagPos.has(e.source) || !dagPos.has(e.target)) continue;
    const casc = cascadeSet.has(e.source) && cascadeSet.has(e.target);
    edges.push({ a: "d:" + e.source, b: "d:" + e.target, kind: casc ? "cascade" : "dag", bold: casc, color: casc ? C.warn : DE[e.type] ?? C.line });
  }
  edges.push(...medges);
  if (rootKey) edges.push({ a: "m:key", b: rootKey, kind: "sign", bold: true, color: C.deep });

  // ---- planes and labels
  const planes: PlaneSpec[] = [
    ...banks.map((b) => ({ key: "tile:" + b, center: centerOf(b), w: TILE, d: TILE, bank: b })),
    { key: "cons", center: [0, LAYER.cons, 0], w: 56, d: 56 },
    { key: "case", center: [0, LAYER.case, 0], w: 54, d: 38 },
  ];
  const gi = (name: string) => d.graphs?.find((g) => g.name === name);
  const hub = [...ringIds].sort((x, y) => (acc.get(y)?.pagerank ?? 0) - (acc.get(x)?.pagerank ?? 0))[0];
  const hubAcc = hub ? acc.get(hub) : undefined;
  const labels: LabelSpec[] = [
    ...banks.map((b): LabelSpec => {
      const g = gi(`bank_${b}`);
      return { key: "tile:" + b, anchor: add(centerOf(b), [0, 0.3, TILE / 2 + 0.4]), title: `Bank ${b}`, sub: g ? `bank_${b} · ${g.nodes.toLocaleString("en-US")} nodes` : `bank_${b}`, tone: "plain", below: true };
    }),
    { key: "cons", anchor: [4, LAYER.cons + 0.6, 28.4], title: "consortium", sub: gi("consortium") ? `${gi("consortium")!.nodes.toLocaleString("en-US")} nodes · ${gi("consortium")!.edges.toLocaleString("en-US")} edges` : "hashed ids, one graph", tone: "blue" },
    { key: "alert", anchor: "a:0", title: A.alert.id, sub: A.wcc ? `component ${A.wcc.componentId} · ${A.wcc.size} accounts · ${A.wcc.n_banks} bank${A.wcc.n_banks === 1 ? "" : "s"} · cleared` : A.alert.cleared, tone: "ok" },
    { key: "bankview", anchor: add(centerOf(best), [0, 0.6, -TILE / 2]), title: `Bank ${best} alone`, sub: `${S.B.best_bank.holds} of ${S.B.accounts} ring accounts · ${S.B.best_bank.holds_pct}%`, tone: "warn" },
    { key: "ringview", anchor: [0, LAYER.cons + 0.6, -7.5], title: "Consortium", sub: `${S.B.accounts} accounts · ${S.B.case.banks.length} banks · ${S.B.consortium_links} links`, tone: "ok" },
    { key: "hub", anchor: hub ? "c:" + hub : [0, LAYER.cons, 0], title: `hub ${hub?.slice(0, 6) ?? "–"}`, sub: hubAcc ? `bank ${hubAcc.bank} · PageRank ${hubAcc.pagerank.toFixed(5)}` : undefined, tone: "blue" },
    { key: "echo0", anchor: "e:claim", title: ind ? `${ind.paths} paths` : "–", sub: ind ? `path counting: ${ind.naive.toFixed(3)}` : undefined, tone: "warn" },
    { key: "echo1", anchor: "e:claim", title: ind ? `${ind.origins} independent origins` : "–", sub: ind ? `echo-proof: ${ind.confidence.toFixed(3)}` : undefined, tone: "ok" },
    ...(ind ? ind.groups.map((g, gi2): LabelSpec => {
      const first = ind.groups.slice(0, gi2).reduce((s, x) => s + x.evidence_ids.length, 0);
      return { key: "grp:" + gi2, anchor: `e:ev:${first}`, title: g.kind.replace(/_/g, " "), sub: `×${g.multiplicity} · ${g.origin.length > 26 ? g.origin.slice(0, 26) + "…" : g.origin}`, tone: "plain" };
    }) : []),
    ...(ind ? ind.challenge_groups.map((g, k): LabelSpec => ({ key: "ch:" + k, anchor: `e:ch:${k}`, title: `${g.kind.replace(/_/g, " ")} challenges`, sub: g.origin, tone: "ring" })) : []),
    { key: "colC", anchor: [-9, LAYER.case + 0.6, -14.5], title: "Claims", tone: "plain" },
    { key: "colE", anchor: [-1.25, LAYER.case + 0.6, -14.5], title: "Evidence", tone: "plain" },
    { key: "colS", anchor: [8.25, LAYER.case + 0.6, -14.5], title: "Report sentences", tone: "plain" },
    ...(sup ? [{ key: "sup", anchor: "d:" + sup.id, title: sup.id, sub: `${sup.origin} · superseded`, tone: "ring" as Tone }] : []),
    ...(sup ? sup.reach.actions.slice(0, 1).map((a): LabelSpec => ({ key: "act", anchor: "d:" + a, title: a, sub: "approval locked: needs verification", tone: "warn", below: true })) : []),
    ...(sup ? sup.reach.claims.slice(0, 1).map((c): LabelSpec => ({ key: "clm", anchor: "d:" + c, title: c, sub: "needs verification", tone: "warn" })) : []),
    ...(rootKey ? [{ key: "root", anchor: rootKey, title: "Merkle root", sub: "computed live from the case graph", tone: "blue" as Tone }] : []),
    ...(rootKey ? [{ key: "key", anchor: "m:key", title: "Hardware key", sub: "WebAuthn signature over the root", tone: "deep" as Tone }] : []),
    { key: "casegraph", anchor: [-19, LAYER.case + 0.6, 19], title: `case_${S.C.case_id}`, sub: gi(`case_${S.C.case_id}`) ? `${gi(`case_${S.C.case_id}`)!.nodes} nodes · ${gi(`case_${S.C.case_id}`)!.edges} edges` : "one graph per case", tone: "blue" },
  ];

  // ---- the frame function: one look per (scene, step)
  const heldInView = new Set(bankView.nodes.filter((n) => n.kind === "account").map((n) => n.id));
  const stubInView = new Set(bankView.nodes.filter((n) => n.kind !== "account").map((n) => `${best}:${n.id}`));
  const accIds = new Set(acc.keys());
  const supState = (id: string) => (sup && id === sup.id ? "superseded" : reach.has(id) ? "needs" : "");
  const nodeIndex = new Map(nodes.map((n, i) => [n.key, i]));
  const homeOf = (key: string) => nodes[nodeIndex.get(key) ?? -1]?.home;
  const ringCenter: V3 = [0, LAYER.cons, 0];
  const hubHome = hub ? homeOf("c:" + hub) ?? ringCenter : ringCenter;

  const frame = (s: number, step: number): Frame => {
    const look = (n: NodeSpec): Look => {
      const L0: Look = { p: n.home, c: n.color, s: n.size, v: 0 };
      switch (n.group) {
        case "bank": {
          const inRing = ring.has(n.title);
          if (s <= 1) return { ...L0, v: s === 1 ? 0.75 : 1 };
          if (s === 3 && step === 0) return { ...L0, v: n.tag === best ? (heldInView.has(n.title) ? 1 : 0.35) : 0.12, s: heldInView.has(n.title) && n.tag === best ? n.size * 1.6 : n.size };
          if (s <= 4) return { ...L0, v: inRing ? 0.3 : 0.14 };
          return { ...L0, v: 0.08 };
        }
        case "ext": {
          const k = n.key.slice(2);
          const twin = homeOf("c:" + n.title);
          if (s === 0) return { ...L0, v: 0.95 };
          if (s === 3 && step === 0) return stubInView.has(k) ? { ...L0, c: C.stub, s: 0.55, v: 1 } : { ...L0, v: n.tag === best ? 0.3 : 0.06 };
          if (accIds.has(n.title) && twin) return { ...L0, p: twin, v: s === 1 ? 0.9 : 0, s: 0.28 };
          return { ...L0, v: s === 1 ? 0.55 : s <= 4 ? 0.1 : 0 };
        }
        case "cons": {
          const from = homeOf("b:" + n.title) ?? n.home;
          if (s === 0) return { ...L0, p: from, v: 0, s: n.size * 0.6 };
          if (s === 1) return { ...L0, v: 1 };
          if (s === 2) return { ...L0, v: 0.3 };
          if (s === 3) return step === 0 ? { ...L0, v: 0.18 } : { ...L0, v: ring.has(n.title) ? 1 : 0.16, s: ring.has(n.title) ? n.size * 1.35 + 0.25 : n.size };
          if (s === 4) {
            if (n.title === hub) return { ...L0, c: C.blue, s: n.size * 1.2 + 0.35, v: 1 };
            return { ...L0, v: ring.has(n.title) ? 1 : 0.42, s: ring.has(n.title) ? n.size * 1.35 + 0.25 : n.size };
          }
          return { ...L0, v: s === 5 ? 0.2 : 0.12 };
        }
        case "alert":
          return { ...L0, v: s === 2 ? 1 : s === 3 || s === 4 ? 0.22 : 0 };
        case "echoClaim":
          return { ...L0, v: s === 5 ? 1 : 0 };
        case "echoEv":
          return { ...L0, p: s === 5 && step === 1 ? echoPos1.get(n.key) ?? n.home : n.home, c: s === 5 && step === 1 ? C.ok : C.blue, v: s === 5 ? 1 : 0, s: s === 5 && step === 1 ? 0.95 : n.size };
        case "echoCh":
          return { ...L0, v: s === 5 ? 1 : 0 };
        case "dag": {
          if (s < 6) return { ...L0, v: 0, s: n.size * 0.5 };
          const st = supState(n.title);
          if (s === 6 && step === 1 && st) return { ...L0, c: st === "superseded" ? C.ring : C.warn, s: n.size * 1.35, v: 1 };
          return { ...L0, v: s === 6 ? (step === 1 ? 0.55 : 1) : 0.22 };
        }
        case "leaf": {
          const from = homeOf(n.tag ?? "") ?? n.home;
          if (s < 7) return { ...L0, p: from, v: 0, s: 0.2 };
          const st = supState(n.title);
          return { ...L0, c: st === "superseded" ? C.ring : st === "needs" ? C.warn : n.color, v: 1 };
        }
        case "mnode":
          return { ...L0, v: s === 7 ? 1 : 0, s: s === 7 ? n.size : 0.1 };
        case "key":
          return { ...L0, v: s === 7 ? 1 : 0 };
      }
      return L0;
    };

    const edgeLook = (e: EdgeSpec, i: number): { c: string; v: number } => {
      const E = (v: number, c = e.color) => ({ c, v });
      switch (e.kind) {
        case "bank": return E(s === 0 ? 0.85 : s === 1 ? 0.45 : s === 3 && step === 0 ? 0.08 : s <= 4 ? 0.1 : 0);
        case "thread": return E(s === 1 ? 0.5 : 0);
        case "cons": return E(s === 0 ? 0 : s === 1 ? 0.85 : s === 2 ? 0.3 : s === 3 ? (step === 0 ? 0.15 : 0.2) : s === 4 ? 0.35 : s === 5 ? 0.08 : 0.05);
        case "ring": return s === 3 && step === 1 ? E(1, C.blue) : s === 4 ? E(crossBank.has(i) ? 1 : 0.6) : E(0);
        case "bv": return E(s === 3 && step === 0 ? 1 : 0);
        case "alert": return E(s === 2 ? 1 : s === 3 || s === 4 ? 0.2 : 0);
        case "echo": return E(s === 5 ? 1 : 0, s === 5 && step === 1 ? C.ok : C.blue);
        case "echoCh": return E(s === 5 ? 0.9 : 0);
        case "dag": return E(s === 6 ? (step === 1 ? 0.4 : 0.8) : s === 7 ? 0.15 : 0);
        case "cascade": return s === 6 ? (step === 1 ? E(1) : E(0.8, C.blue)) : E(s === 7 ? 0.15 : 0);
        case "merkle": return E(s === 7 ? 0.9 : 0);
        case "sign": return E(s === 7 ? 1 : 0);
      }
      return E(0);
    };

    const planes2 = planes.map((p) => {
      if (p.bank) {
        if (s <= 1) return 1;
        if (s === 3 && step === 0) return p.bank === best ? 1 : 0.3;
        return s <= 4 ? 0.32 : 0.12;
      }
      if (p.key === "cons") return s === 0 ? 0 : s === 3 && step === 0 ? 0.4 : s <= 4 ? 1 : 0.35;
      return s >= 5 ? 1 : 0;
    });

    const labelVis = labels.map((l) => {
      const k = l.key;
      if (k.startsWith("tile:")) return s <= 1 ? 1 : 0;
      if (k === "cons") return s === 1 ? 1 : 0;
      if (k === "alert") return s === 2 ? 1 : 0;
      if (k === "bankview") return s === 3 && step === 0 ? 1 : 0;
      if (k === "ringview") return s === 3 && step === 1 ? 1 : 0;
      if (k === "hub") return s === 4 ? 1 : 0;
      if (k === "echo0") return s === 5 && step === 0 ? 1 : 0;
      if (k === "echo1") return s === 5 && step === 1 ? 1 : 0;
      if (k.startsWith("grp:")) return s === 5 && step === 1 ? 1 : 0;
      if (k.startsWith("ch:")) return s === 5 ? 1 : 0;
      if (k.startsWith("col")) return s === 6 && step === 0 ? 1 : 0;
      if (k === "sup" || k === "act" || k === "clm") return s === 6 && step === 1 ? 1 : 0;
      if (k === "root" || k === "key") return s === 7 ? 1 : 0;
      if (k === "casegraph") return s === 6 && step === 0 ? 1 : 0;
      return 0;
    });

    const markers: { key: string; color: string }[] = [];
    if (s === 2) markers.push({ key: "a:0", color: C.ok });
    if (s === 4 && hub) markers.push({ key: "c:" + hub, color: C.blue });
    if (s === 6 && step === 1 && sup) {
      markers.push({ key: "d:" + sup.id, color: C.ring });
      for (const a of sup.reach.actions.slice(0, 2)) markers.push({ key: "d:" + a, color: C.warn });
    }
    if (s === 7 && rootKey) markers.push({ key: rootKey, color: C.blue });

    const bc = centerOf(best);
    const cams: { pos: V3; target: V3 }[] = [
      { pos: [0, 50, 70], target: [0, -3, 5] },
      { pos: [60, 56, 76], target: [0, 9, 0] },
      { pos: add(alertCenter, [11, 15, 18]), target: add(alertCenter, [2, 0, -1]) },
      step === 0 ? { pos: add(bc, [0, 21, 21]), target: add(bc, [0, 0, 0.5]) } : { pos: [0, LAYER.cons + 22, 21], target: add(ringCenter, [0, 0, 0.5]) },
      { pos: [hubHome[0] * 0.4 + 7, LAYER.cons + 19, hubHome[2] * 0.4 + 19], target: [hubHome[0] * 0.4, LAYER.cons, hubHome[2] * 0.4] },
      { pos: [0, LAYER.case + 25, 27], target: [0, LAYER.case, 1.5] },
      { pos: [0.5, LAYER.case + 46, 31], target: [0.5, LAYER.case, 2] },
      { pos: [0, LAYER.case + 15, 52], target: [0, LAYER.case + 10, 0] },
    ];

    return { nodes: nodes.map(look), edges: edges.map(edgeLook), planes: planes2, labels: labelVis, markers, cam: cams[Math.max(0, Math.min(cams.length - 1, s))] };
  };

  return { nodes, edges, planes, labels, frame };
}

/** Facts the panels quote, derived once from the same payloads as the 3D model. */
export function facts(d: ExplainerData) {
  const { layers: L, scenarios: S } = d;
  const acc = new Map(L.accounts.map((a) => [a.id, a]));
  for (const n of S.B.views.consortium.nodes) if (!acc.has(n.id)) acc.set(n.id, { id: n.id, bank: n.bank, pagerank: n.pagerank ?? 0 });
  const extJoined = L.externals.filter((x) => acc.has(x.id)).length;
  const ringIds = S.B.views.consortium.nodes.map((n) => n.id);
  const hub = [...ringIds].sort((x, y) => (acc.get(y)?.pagerank ?? 0) - (acc.get(x)?.pagerank ?? 0))[0];
  const hubAcc = hub ? acc.get(hub) : undefined;
  const ranked = [...acc.values()].sort((x, y) => (y.pagerank ?? 0) - (x.pagerank ?? 0));
  const hubRank = hub ? ranked.findIndex((a) => a.id === hub) + 1 : 0;
  const ringEdges = S.B.views.consortium.edges;
  const crossRing = ringEdges.filter((e) => acc.get(e.source) && acc.get(e.target) && acc.get(e.source)!.bank !== acc.get(e.target)!.bank).length;
  const ind = [...S.C.independence.claims].sort((x, y) => y.paths - x.paths)[0];
  const sup = S.C.evidence.find((e) => e.origin === `attr:${S.C.building}`) ?? S.C.evidence[0];
  const bankGraphs = (d.graphs ?? []).filter((g) => g.kind === "bank");
  return {
    banks: [...L.banks].sort(),
    bankGraphs,
    consGraph: d.graphs?.find((g) => g.kind === "consortium"),
    caseGraph: d.graphs?.find((g) => g.name === `case_${S.C.case_id}`),
    extTotal: L.externals.length,
    extJoined,
    accountsInView: acc.size,
    consEdges: L.consortium_edges.length,
    crossCons: L.consortium_edges.filter((e) => acc.get(e.source) && acc.get(e.target) && acc.get(e.source)!.bank !== acc.get(e.target)!.bank).length,
    hub, hubAcc, hubRank,
    ringEdges: ringEdges.length,
    crossRing,
    ind,
    sup,
  };
}
export type Facts = ReturnType<typeof facts>;
