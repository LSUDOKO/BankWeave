"use client";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { bankHex } from "@/lib/banks";

export type Layers = {
  banks: string[];
  accounts: { id: string; bank: string; pagerank: number; cases: string[] }[];
  consortium_edges: { source: string; target: string; amount: number; n: number }[];
  bank_edges: { source: string; target: string; amount: number; bank: string }[];
  externals: { id: string; seen_by: string; bank: string }[];
  cases: { id: string; title: string; status: string; accounts: string[]; claims: { id: string; kind: string; state: string }[] }[];
};
export type View = { bank: boolean; consortium: boolean; cases: boolean };
export type Handle = { flyThrough: () => void; focusHub: () => void; shockwave: (caseId: string) => Promise<void> };

const Y = { bank: -170, consortium: 0, case: 170, claim: 235 };
const STATE: Record<string, string> = { active: "#10b981", needs_verification: "#f59e0b", superseded: "#ef4444", historical_only: "#94a3b8" };

type N = { id: string; layer: string; hub?: boolean; label: string; color: string; val: number; fx?: number; fy: number; fz?: number; x?: number; y?: number; z?: number };
type L = { source: string; target: string; kind: string; color: string; amount?: number };

const Consortium3D = forwardRef<Handle, { data: Layers; view: View; height: number }>(function Consortium3D({ data, view, height }, ref) {
  const fg = useRef<any>(null);
  const [width, setWidth] = useState(900);
  const wrap = useRef<HTMLDivElement>(null);
  const [override, setOverride] = useState<Record<string, string>>({});
  const fitted = useRef(false);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const hub = useMemo(() => data.accounts.reduce((a, b) => (b.pagerank > (a?.pagerank ?? -1) ? b : a), data.accounts[0]), [data]);

  const graph = useMemo(() => {
    const nodes: N[] = [];
    const links: L[] = [];
    const n = Math.max(1, data.banks.length);
    const center = (b: string) => {
      const i = Math.max(0, data.banks.indexOf(b));
      const a = (i / n) * Math.PI * 2;
      return { x: Math.cos(a) * 230, z: Math.sin(a) * 230 };
    };
    const maxPr = Math.max(...data.accounts.map((a) => a.pagerank), 1e-9);
    if (view.bank) {
      for (const a of data.accounts) {
        const c = center(a.bank);
        nodes.push({ id: "b:" + a.id, layer: "bank", label: `Bank ${a.bank} customer ${a.id.slice(0, 8)}`, color: bankHex(a.bank), val: 1.2,
          fy: Y.bank, x: c.x + (Math.random() - 0.5) * 60, z: c.z + (Math.random() - 0.5) * 60 });
      }
      const ext = new Map<string, number>();
      for (const x of data.externals) {
        const c = center(x.seen_by);
        const k = (ext.get(x.seen_by) ?? 0) + 1;
        ext.set(x.seen_by, k);
        const ang = k * 0.55;
        nodes.push({ id: `x:${x.seen_by}:${x.id}`, layer: "external", label: `External stub (bank ${x.bank}) seen by bank ${x.seen_by}`,
          color: "#475569", val: 0.4, fy: Y.bank, fx: c.x + Math.cos(ang) * 75, fz: c.z + Math.sin(ang) * 75 });
      }
      for (const e of data.bank_edges) links.push({ source: "b:" + e.source, target: "b:" + e.target, kind: "bank", color: bankHex(e.bank), amount: e.amount });
    }
    if (view.consortium) {
      for (const a of data.accounts) {
        const isHub = a.id === hub?.id;
        nodes.push({ id: "c:" + a.id, layer: "consortium", hub: isHub, label: `${isHub ? "PageRank hub · " : ""}${a.id.slice(0, 10)} (bank ${a.bank}) · PR ${a.pagerank.toFixed(4)}`,
          color: isHub ? "#8ad8fc" : bankHex(a.bank), val: 1 + 9 * (a.pagerank / maxPr), fy: Y.consortium });
        if (view.bank) links.push({ source: "b:" + a.id, target: "c:" + a.id, kind: "thread", color: "#06b6d4" });
      }
      for (const e of data.consortium_edges) links.push({ source: "c:" + e.source, target: "c:" + e.target, kind: "flow", color: "#94a3b8", amount: e.amount });
    }
    if (view.cases) {
      for (const k of data.cases) {
        const color = k.status === "closed" ? "#10b981" : k.status === "awaiting_approval" ? "#f59e0b" : "#ef4444";
        nodes.push({ id: "k:" + k.id, layer: "case", label: `${k.id} · ${k.title}`, color, val: 3, fy: Y.case });
        if (view.consortium) for (const a of k.accounts) links.push({ source: "k:" + k.id, target: "c:" + a, kind: "concerns", color: "#f59e0b" });
        for (const c of k.claims) {
          nodes.push({ id: "l:" + c.id, layer: "claim", label: `${c.kind} claim ${c.id} (${c.state})`, color: STATE[c.state] ?? STATE.active, val: 0.8, fy: Y.claim });
          links.push({ source: "l:" + c.id, target: "k:" + k.id, kind: "claim", color: "#64748b" });
        }
      }
    }
    return { nodes, links };
  }, [data, view, hub]);

  useImperativeHandle(ref, () => ({
    flyThrough: () => {
      const g = fg.current;
      if (!g) return;
      const steps: [number, number, number, number][] = [[0, -420, 380, 0], [0, -170, 520, 2600], [380, 40, 380, 5200], [0, 420, 360, 7800], [0, 120, 720, 10400]];
      for (const [x, y, z, at] of steps) setTimeout(() => g.cameraPosition({ x, y, z }, { x: 0, y: y > 300 ? Y.case : y < -200 ? Y.bank : 0, z: 0 }, 2400), at);
    },
    focusHub: () => {
      const g = fg.current;
      const n: any = graph.nodes.find((x) => x.id === "c:" + hub?.id);
      if (g && n) g.cameraPosition({ x: (n.x ?? 0) + 60, y: (n.y ?? 0) + 40, z: (n.z ?? 0) + 60 }, n, 2200);
    },
    shockwave: async (caseId: string) => {
      const k = data.cases.find((c) => c.id === caseId);
      if (!k) return;
      const ids = ["k:" + k.id, ...k.claims.map((c) => "l:" + c.id), ...k.accounts.map((a) => "c:" + a)];
      for (const [color, wait] of [["#10b981", 0], ["#f59e0b", 700], ["#ef4444", 1500]] as const) {
        await new Promise((r) => setTimeout(r, wait ? 700 : 0));
        setOverride(Object.fromEntries(ids.map((i) => [i, color])));
      }
    },
  }), [graph, hub, data]);

  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    g.d3Force("charge")?.strength(-18);
    g.d3Force("link")?.distance((l: any) => (l.kind === "thread" || l.kind === "concerns" ? 160 : 30)).strength((l: any) => (l.kind === "thread" ? 0.05 : l.kind === "concerns" ? 0.02 : 0.4));
  }, [graph]);

  // the stage: translucent glass planes for the three layers, labels and soft lighting
  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    const scene: THREE.Scene = g.scene();
    const group = new THREE.Group();
    group.name = "bw-stage";
    const planes: [number, string][] = [[Y.bank, "Bank slices: what each bank sees"], [Y.consortium, "Consortium graph: where the slices join"], [Y.case, "Cases and claims"]];
    for (const [y, text] of planes) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(760, 760),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.055, side: THREE.DoubleSide, depthWrite: false }));
      plane.rotation.x = -Math.PI / 2; plane.position.y = y - 6;
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(plane.geometry),
        new THREE.LineBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.35 }));
      edge.rotation.x = -Math.PI / 2; edge.position.y = y - 6;
      const grid = new THREE.GridHelper(760, 16, 0x8ad8fc, 0x8ad8fc);
      (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.07;
      grid.position.y = y - 6;
      group.add(plane, edge, grid, label(text, -380, y + 4, -380));
    }
    const amb = new THREE.AmbientLight(0xffffff, 1.25);
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(300, 500, 400);
    const rim = new THREE.DirectionalLight(0x8ad8fc, 1.0); rim.position.set(-400, -200, -300);
    group.add(amb, key, rim);
    scene.add(group);
    return () => { scene.remove(group); };
  }, []);

  const meshFor = useMemo(() => {
    const cache = new Map<string, THREE.Object3D>();
    return (n: any) => {
      const color = new THREE.Color(override[n.id] ?? n.color);
      if (n.layer !== "external") color.lerp(new THREE.Color(0xffffff), 0.18);
      const r = Math.cbrt(n.val) * 3.6;
      const key = `${n.id}|${color.getHexString()}`;
      if (cache.has(key)) return cache.get(key)!;
      const obj = new THREE.Group();
      obj.add(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), n.layer === "external"
        ? new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 })
        : new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.15 })));
      if (n.hub || override[n.id]) obj.add(halo(override[n.id] ?? "#8ad8fc", r * (n.hub ? 6 : 4)));
      cache.set(key, obj);
      return obj;
    };
  }, [override]);

  return (
    <div ref={wrap} className="relative overflow-hidden rounded-[20px] border border-white/40 shadow-[0_40px_80px_-30px_rgba(4,38,84,.55)]"
      style={{ background: "radial-gradient(900px 500px at 50% 0%, #2c8ffa 0%, transparent 65%), linear-gradient(180deg, #0a63cf 0%, #0a508f 55%, #062f57 100%)" }}>
      <ForceGraph3D
        ref={fg}
        width={width}
        height={height}
        graphData={graph}
        backgroundColor="rgba(0,0,0,0)"
        nodeLabel={(n: any) => n.label}
        nodeThreeObject={meshFor}
        nodeVal={(n: any) => n.val}
        linkColor={(l: any) => (l.kind === "flow" ? "#bfe8ff" : l.kind === "thread" ? "#8ad8fc" : l.kind === "concerns" ? "#ffd27a" : l.kind === "bank" ? "#ffffff" : "#d6e6f5")}
        linkOpacity={0.35}
        linkWidth={(l: any) => (l.kind === "flow" ? 0.7 : 0)}
        linkDirectionalParticles={(l: any) => (l.kind === "flow" ? 3 : 0)}
        linkDirectionalParticleSpeed={(l: any) => 0.002 + Math.min(0.01, Math.log10(1 + (l.amount ?? 0)) / 900)}
        linkDirectionalParticleWidth={2.2}
        linkDirectionalParticleColor={() => "#ffffff"}
        cooldownTicks={180}
        onEngineStop={() => { if (!fitted.current) { fitted.current = true; fg.current?.cameraPosition({ x: 520, y: 380, z: 620 }, { x: 0, y: 0, z: 0 }, 1200); } }}
        showNavInfo={false}
      />
      <div className="pointer-events-none absolute bottom-3 left-4 flex flex-wrap gap-3 text-[12px] text-white/85">
        <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full bg-white/40" />external stub</span>
        <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full" style={{ background: "#8ad8fc" }} />PageRank hub</span>
        <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full" style={{ background: "#ffd27a" }} />case covers account</span>
        <span>drag to orbit · scroll to zoom</span>
      </div>
    </div>
  );
});

/** Text sprite drawn on a canvas, laid flat at the corner of a layer plane. */
function label(text: string, x: number, y: number, z: number) {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.font = "600 44px Inter, system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.fillText(text, 8, 62);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sprite.scale.set(560, 52, 1);
  sprite.position.set(x + 280, y + 30, z);
  return sprite;
}

/** Soft radial glow around a node. */
function halo(color: string, size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.globalAlpha = 0.6; ctx.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}

export default Consortium3D;
