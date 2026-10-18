"use client";
// Obsidian-style force graph on <canvas>: soft circles sized by degree (or a size prop), labels
// with halos that thin out when zoomed out, hover focus on a node and its neighbours, click to
// inspect, drag, wheel zoom, pan, fit. d3-force only; tuned for up to ~800 nodes.
import {
  forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY,
  type Simulation, type SimulationLinkDatum, type SimulationNodeDatum,
} from "d3-force";
import { useEffect, useMemo, useRef, useState } from "react";

export type GraphNode = {
  id: string;
  label?: string;
  /** colour + legend bucket, e.g. a bank id or a node label */
  group?: string;
  /** optional weight (PageRank, score...); nodes without it are sized by degree */
  size?: number;
  /** explicit colour, overrides the group colour */
  color?: string;
  props?: Record<string, unknown>;
};
export type GraphEdge = { id?: string; source: string; target: string; type?: string; props?: Record<string, unknown> };
export type GraphGroup = { key: string; label?: string; color: string };

export type GraphCanvasProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** canvas height in px (default 560); width follows the container */
  height?: number;
  /** colour per group key, in legend order; unknown groups get palette colours */
  groups?: GraphGroup[];
  /** legend heading, e.g. "Bank" or "Label" */
  colorBy?: string;
  /** show the legend (default true) */
  legend?: boolean;
  /** show the built-in property panel on click (default true) */
  panel?: boolean;
  onSelect?: (node: GraphNode | null) => void;
  emptyText?: string;
  className?: string;
};

/** Signal blue, bank colours, then status colours: the app palette. */
export const GRAPH_PALETTE = [
  "#087cf8", "#0e8c95", "#7a5ad8", "#c2418f", "#a8792a", "#3d55c4",
  "#0c9466", "#c97a06", "#d93a3f", "#0b2a5b", "#5f6f84", "#2aa7c9",
];

type N = SimulationNodeDatum & {
  id: string; data: GraphNode; r: number; color: string; label: string; group: string;
  deg: number; rank: number; nb: Set<N>; links: L[];
};
type L = SimulationLinkDatum<N> & {
  source: N; target: N; type: string; count: number; curve: number; edges: GraphEdge[];
};
type Focus = { nodes: Set<N>; links: Set<L> } | null;
type Cam = { k: number; x: number; y: number };

const INK = "#0c1a2e";
const EDGE = "#9aa9bb";
const HILITE = "#087cf8";
const DEEP = "#0b2a5b";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function topoKey(nodes: GraphNode[], edges: GraphEdge[]) {
  let h = nodes.length * 31 + edges.length;
  for (const n of nodes) for (let i = 0; i < n.id.length; i++) h = (h * 33 + n.id.charCodeAt(i)) | 0;
  for (const e of edges) {
    const s = `${e.source}>${e.target}:${e.type ?? ""}`;
    for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0;
  }
  return `${nodes.length}:${edges.length}:${h}`;
}

function colourer(groups?: GraphGroup[]) {
  const fixed = new Map(groups?.map((g) => [g.key, g.color]));
  const auto = new Map<string, string>();
  return (g: string) => {
    const c = fixed.get(g);
    if (c) return c;
    if (!auto.has(g)) auto.set(g, GRAPH_PALETTE[(fixed.size + auto.size) % GRAPH_PALETTE.length]);
    return auto.get(g)!;
  };
}

function radii(list: N[]) {
  const sized = list.filter((n) => typeof n.data.size === "number" && Number.isFinite(n.data.size));
  const lo = Math.min(...sized.map((n) => n.data.size!));
  const hi = Math.max(...sized.map((n) => n.data.size!));
  for (const n of list) {
    const s = n.data.size;
    n.r = typeof s === "number" && Number.isFinite(s)
      ? (hi > lo ? 6 + 15 * Math.sqrt((s - lo) / (hi - lo)) : 12)
      : clamp(3.6 + 1.7 * Math.sqrt(n.deg), 3.6, 17);
  }
  [...list].sort((a, b) => b.r - a.r || b.deg - a.deg).forEach((n, i) => { n.rank = i; });
}

export default function GraphCanvas({
  nodes, edges, height = 560, groups, colorBy, legend = true, panel = true, onSelect,
  emptyText = "No nodes to draw.", className = "",
}: GraphCanvasProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [selDeg, setSelDeg] = useState(0);
  const [legendFocus, setLegendFocus] = useState<string | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // all mutable render state lives here so the animation loop never re-subscribes
  const S = useRef({
    key: "", list: [] as N[], links: [] as L[], byId: new Map<string, N>(),
    sim: null as Simulation<N, L> | null,
    cam: { k: 1, x: 0, y: 0 } as Cam, fitK: 1, autoFit: true,
    camAnim: null as null | { from: Cam; to: Cam; t: number },
    hover: null as N | null, hoverEdge: null as L | null, groupFocus: null as string | null,
    focus: null as Focus, fade: 0, selected: null as N | null,
    dirty: true, W: 0, H: height, dpr: 1, font: "Inter, ui-sans-serif, system-ui, sans-serif",
  });

  // container width
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // canvas backing store (retina)
  useEffect(() => {
    const c = cv.current;
    if (!c || !width) return;
    const s = S.current;
    s.dpr = Math.min(3, window.devicePixelRatio || 1);
    s.W = width; s.H = height;
    c.width = Math.round(width * s.dpr); c.height = Math.round(height * s.dpr);
    c.style.width = `${width}px`; c.style.height = `${height}px`;
    const ff = getComputedStyle(c).fontFamily;
    if (ff) s.font = ff;
    if (s.autoFit) fit(false); else s.dirty = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // (re)build the simulation when the topology changes; recolour in place otherwise
  useEffect(() => {
    const s = S.current;
    const key = topoKey(nodes, edges);
    const colour = colourer(groups);
    if (key === s.key) {
      for (const d of nodes) {
        const n = s.byId.get(d.id);
        if (!n) continue;
        n.data = d; n.color = d.color ?? colour(d.group ?? ""); n.label = d.label ?? d.id; n.group = d.group ?? "";
      }
      radii(s.list);
      s.dirty = true;
      return;
    }
    s.key = key;
    const prev = new Map(s.list.map((n) => [n.id, n]));
    const byId = new Map<string, N>();
    for (const d of nodes) {
      if (byId.has(d.id)) continue;
      const p = prev.get(d.id);
      byId.set(d.id, {
        id: d.id, data: d, r: 4, color: d.color ?? colour(d.group ?? ""), label: d.label ?? d.id,
        group: d.group ?? "", deg: 0, rank: 0, nb: new Set(), links: [],
        x: p?.x, y: p?.y, vx: 0, vy: 0,
      });
    }
    const agg = new Map<string, L>();
    for (const e of edges) {
      const a = byId.get(e.source), b = byId.get(e.target);
      if (!a || !b) continue;
      const type = e.type ?? "";
      const k = `${e.source}\u0001${e.target}\u0001${type}`;
      let l = agg.get(k);
      if (!l) {
        l = { source: a, target: b, type, count: 0, curve: 0, edges: [] };
        agg.set(k, l);
        a.links.push(l); if (b !== a) b.links.push(l);
        if (b !== a) { a.nb.add(b); b.nb.add(a); }
      }
      l.count++; l.edges.push(e);
    }
    const list = [...byId.values()];
    const links = [...agg.values()];
    for (const n of list) n.deg = n.nb.size;
    // links joining the same pair (both directions or several types) fan out as arcs
    const pairs = new Map<string, L[]>();
    for (const l of links) {
      if (l.source === l.target) continue;
      const a = l.source.id, b = l.target.id;
      const k = a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`;
      const arr = pairs.get(k);
      if (arr) arr.push(l); else pairs.set(k, [l]);
    }
    for (const ls of pairs.values()) {
      if (ls.length < 2) continue;
      ls.forEach((l, i) => {
        const off = (i - (ls.length - 1) / 2) * 0.32;
        l.curve = l.source.id < l.target.id ? off : -off;
      });
    }
    radii(list);

    s.sim?.stop();
    const n = list.length;
    // gravity is stretched to the canvas aspect so loose components fill a wide card
    const aspect = clamp(s.W && s.H ? s.W / s.H : 1.6, 0.6, 2.4);
    const g = n > 300 ? 0.06 : 0.045;
    const sim = forceSimulation<N, L>(list)
      .force("link", forceLink<N, L>(links).distance((l) => 22 + l.source.r + l.target.r + Math.min(36, Math.sqrt(l.source.deg + l.target.deg) * 4)))
      .force("charge", forceManyBody<N>().strength((d) => -(n > 400 ? 38 : 70) - d.r * 5).distanceMax(520).theta(0.9))
      .force("collide", forceCollide<N>((d) => d.r + 3).iterations(1))
      .force("x", forceX<N>(0).strength(g / Math.sqrt(aspect)))
      .force("y", forceY<N>(0).strength(g * Math.sqrt(aspect)))
      .velocityDecay(0.36)
      .alphaDecay(0.024)
      .stop();
    const fresh = list.filter((d) => d.x === undefined).length / Math.max(1, n);
    sim.alpha(fresh > 0.5 ? 1 : 0.5);
    // a few silent ticks so the first frame is already untangled, then it settles on screen
    for (let i = 0; i < (n > 300 ? 40 : 15); i++) sim.tick();
    Object.assign(s, { list, links, byId, sim, hover: null, hoverEdge: null, focus: null, fade: 0, selected: null, autoFit: true, camAnim: null });
    setSelected(null);
    fit(false);
    s.dirty = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, groups]);

  // legend hover focuses a group
  useEffect(() => {
    const s = S.current;
    s.groupFocus = legendFocus;
    refocus();
  }, [legendFocus]);

  function bounds() {
    const s = S.current;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of s.list) {
      x0 = Math.min(x0, n.x! - n.r); y0 = Math.min(y0, n.y! - n.r - 4);
      x1 = Math.max(x1, n.x! + n.r); y1 = Math.max(y1, n.y! + n.r + 16);
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
  }

  function fitCam(): Cam | null {
    const s = S.current, b = bounds();
    if (!b || !s.W) return null;
    const pad = 36;
    const k = clamp(Math.min((s.W - pad * 2) / Math.max(1, b.x1 - b.x0), (s.H - pad * 2) / Math.max(1, b.y1 - b.y0)), 0.08, 2.2);
    return { k, x: s.W / 2 - ((b.x0 + b.x1) / 2) * k, y: s.H / 2 - ((b.y0 + b.y1) / 2) * k };
  }

  function fit(animate = true) {
    const s = S.current, to = fitCam();
    if (!to) return;
    s.fitK = to.k;
    if (animate) s.camAnim = { from: { ...s.cam }, to, t: 0 };
    else s.cam = to;
    s.dirty = true;
  }

  function zoomBy(f: number, cx?: number, cy?: number) {
    const s = S.current;
    const px = cx ?? s.W / 2, py = cy ?? s.H / 2;
    const k = clamp(s.cam.k * f, 0.05, 10);
    const r = k / s.cam.k;
    s.cam = { k, x: px - (px - s.cam.x) * r, y: py - (py - s.cam.y) * r };
    s.autoFit = false; s.camAnim = null; s.dirty = true;
  }

  function refocus() {
    const s = S.current;
    let f: Focus = null;
    if (s.hover) {
      f = { nodes: new Set([s.hover, ...s.hover.nb]), links: new Set(s.hover.links) };
    } else if (s.hoverEdge) {
      f = { nodes: new Set([s.hoverEdge.source, s.hoverEdge.target]), links: new Set([s.hoverEdge]) };
    } else if (s.groupFocus != null) {
      const ns = new Set(s.list.filter((n) => n.group === s.groupFocus));
      f = { nodes: ns, links: new Set(s.links.filter((l) => ns.has(l.source) && ns.has(l.target))) };
    }
    if (f) s.focus = f; // keep the old focus while fading out
    s.dirty = true;
  }

  // animation + render loop
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const s = S.current;
      let active = false;
      const sim = s.sim;
      if (sim && (sim.alpha() > sim.alphaMin() || sim.alphaTarget() > 0)) {
        sim.tick();
        active = true;
        if (s.autoFit && !s.camAnim) {
          const to = fitCam();
          if (to) {
            s.fitK = to.k;
            const e = 0.12;
            s.cam = { k: s.cam.k + (to.k - s.cam.k) * e, x: s.cam.x + (to.x - s.cam.x) * e, y: s.cam.y + (to.y - s.cam.y) * e };
          }
        }
      }
      if (s.camAnim) {
        const a = s.camAnim;
        a.t = Math.min(1, a.t + 1 / 22);
        const e = 1 - Math.pow(1 - a.t, 3);
        s.cam = { k: a.from.k + (a.to.k - a.from.k) * e, x: a.from.x + (a.to.x - a.from.x) * e, y: a.from.y + (a.to.y - a.from.y) * e };
        if (a.t >= 1) s.camAnim = null;
        active = true;
      }
      const want = s.hover || s.hoverEdge || s.groupFocus != null ? 1 : 0;
      if (Math.abs(s.fade - want) > 0.004) {
        s.fade += (want - s.fade) * 0.2;
        active = true;
      } else if (s.fade !== want) {
        s.fade = want; active = true;
      }
      if (s.fade === 0 && !want) s.focus = null;
      if (active || s.dirty) { draw(); s.dirty = false; }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function curvePoint(l: L) {
    const sx = l.source.x!, sy = l.source.y!, tx = l.target.x!, ty = l.target.y!;
    const mx = (sx + tx) / 2, my = (sy + ty) / 2;
    if (!l.curve) return { cx: mx, cy: my, mx, my };
    const dx = tx - sx, dy = ty - sy;
    const cx = mx - dy * l.curve, cy = my + dx * l.curve;
    return { cx, cy, mx: (mx + cx) / 2, my: (my + cy) / 2 };
  }

  function draw() {
    const c = cv.current, s = S.current;
    if (!c || !s.W) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const { k, x: ox, y: oy } = s.cam;
    const dpr = s.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (!s.list.length) return;
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);

    const focus = s.fade > 0 ? s.focus : null;
    const dim = 1 - 0.86 * s.fade;
    const showArrows = k >= 0.32 || s.list.length < 120;
    const aLen = 6 / Math.max(k, 0.75), aW = aLen * 0.42;

    // ---- edges: one batched path for the base layer, then the focused ones on top
    const path = (l: L, line: Path2D, heads: Path2D) => {
      const a = l.source, b = l.target;
      if (a === b) {
        const rr = a.r * 0.7 + 3 / k, lx = a.x! + a.r * 0.75, ly = a.y! - a.r * 0.75;
        line.moveTo(lx + rr, ly);
        line.arc(lx, ly, rr, 0, Math.PI * 2);
        return;
      }
      const { cx, cy } = curvePoint(l);
      // direction into the target (tangent of the arc at its end)
      let dx = b.x! - (l.curve ? cx : a.x!), dy = b.y! - (l.curve ? cy : a.y!);
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const gap = b.r + 1.5 / k;
      const ex = b.x! - dx * gap, ey = b.y! - dy * gap;
      const bx = ex - dx * (showArrows ? aLen * 0.85 : 0), by = ey - dy * (showArrows ? aLen * 0.85 : 0);
      line.moveTo(a.x!, a.y!);
      if (l.curve) line.quadraticCurveTo(cx, cy, bx, by); else line.lineTo(bx, by);
      if (showArrows) {
        heads.moveTo(ex, ey);
        heads.lineTo(ex - dx * aLen - dy * aW, ey - dy * aLen + dx * aW);
        heads.lineTo(ex - dx * aLen + dy * aW, ey - dy * aLen - dx * aW);
        heads.closePath();
      }
    };
    const baseLine = new Path2D(), baseHeads = new Path2D();
    const hotLine = new Path2D(), hotHeads = new Path2D();
    let hot = 0;
    for (const l of s.links) {
      if (focus?.links.has(l)) { path(l, hotLine, hotHeads); hot++; } else path(l, baseLine, baseHeads);
    }
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.6 * dim;
    ctx.strokeStyle = EDGE; ctx.fillStyle = EDGE;
    ctx.lineWidth = 1 / k;
    ctx.stroke(baseLine); ctx.fill(baseHeads);
    if (hot) {
      ctx.globalAlpha = 0.35 + 0.6 * s.fade;
      ctx.strokeStyle = HILITE; ctx.fillStyle = HILITE;
      ctx.lineWidth = 1.6 / k;
      ctx.stroke(hotLine); ctx.fill(hotHeads);
    }

    // ---- nodes
    const sel = s.selected;
    for (const n of s.list) {
      const on = !focus || focus.nodes.has(n);
      ctx.globalAlpha = on ? 1 : dim;
      if (n === s.hover || n === sel) {
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, n.r + 6 / k, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.globalAlpha = 0.16;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, n.r, 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.fill();
      ctx.lineWidth = 1.4 / k;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      if (n === sel) {
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, n.r + 3 / k, 0, Math.PI * 2);
        ctx.lineWidth = 2 / k;
        ctx.strokeStyle = DEEP;
        ctx.stroke();
      }
    }

    // ---- labels (screen space, halo, collision-culled)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fs = clamp(10.5 + 1.6 * Math.log2(Math.max(k, 0.25)), 10, 13.5);
    ctx.font = `500 ${fs}px ${s.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    const z = k / (s.fitK || 1);
    const frac = s.list.length <= 36 ? 1 : clamp(0.15 + (z - 1) * 0.45, 0.06, 1);
    const cutoff = Math.ceil(s.list.length * frac);
    const priority = (n: N) => (n === s.hover ? -3 : n === sel ? -2 : focus?.nodes.has(n) ? -1 : n.rank);
    const cand = s.list.filter((n) => n.rank < cutoff || n === s.hover || n === sel || (focus?.nodes.has(n) && (focus.nodes.size < 60 || n.rank < cutoff * 2)));
    cand.sort((a, b) => priority(a) - priority(b));
    const cell = 48, grid = new Map<number, { x0: number; y0: number; x1: number; y1: number }[]>();
    const W = s.W, H = s.H;
    for (const n of cand) {
      const sx = n.x! * k + ox, sy = n.y! * k + oy + n.r * k + 3;
      if (sx < -80 || sx > W + 80 || sy < -20 || sy > H + 20) continue;
      const text = trunc(n.label, n === s.hover || n === sel ? 48 : 26);
      const w = ctx.measureText(text).width;
      const box = { x0: sx - w / 2 - 2, y0: sy - 1, x1: sx + w / 2 + 2, y1: sy + fs + 1 };
      const forced = n === s.hover || n === sel;
      let clash = false;
      const gx0 = Math.floor(box.x0 / cell), gx1 = Math.floor(box.x1 / cell), gy0 = Math.floor(box.y0 / cell), gy1 = Math.floor(box.y1 / cell);
      if (!forced) {
        outer: for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
          for (const o of grid.get(gx * 100003 + gy) ?? []) {
            if (box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0) { clash = true; break outer; }
          }
        }
      }
      if (clash) continue;
      for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
        const key = gx * 100003 + gy;
        const arr = grid.get(key);
        if (arr) arr.push(box); else grid.set(key, [box]);
      }
      const on = !focus || focus.nodes.has(n);
      const fadeIn = n.rank < cutoff || forced || on ? 1 : 0.6;
      ctx.globalAlpha = (on ? 1 : dim) * fadeIn;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "rgba(255,255,255,0.94)";
      ctx.strokeText(text, sx, sy);
      ctx.fillStyle = forced ? DEEP : on && focus ? INK : "#2b3a4f";
      ctx.fillText(text, sx, sy);
    }

    // ---- relationship labels on hovered edges
    const edgeLabels: L[] = s.hoverEdge ? [s.hoverEdge] : s.hover && s.fade > 0.3 ? s.hover.links.slice(0, 40) : [];
    if (edgeLabels.length) {
      ctx.font = `600 ${Math.max(9.5, fs - 1)}px ${s.font}`;
      ctx.textBaseline = "middle";
      ctx.globalAlpha = s.hoverEdge ? 1 : clamp((s.fade - 0.3) / 0.5, 0, 1);
      for (const l of edgeLabels) {
        if (l.source === l.target || !l.type) continue;
        const { mx, my } = curvePoint(l);
        const sx = mx * k + ox, sy = my * k + oy;
        let ang = Math.atan2((l.target.y! - l.source.y!), (l.target.x! - l.source.x!));
        if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
        const text = l.count > 1 ? `${l.type} ×${l.count}` : l.type;
        // only where the label fits on the visible stretch of the link (never over the nodes)
        const room = Math.hypot(l.target.x! - l.source.x!, l.target.y! - l.source.y!) * k - (l.source.r + l.target.r) * k - 10;
        if (l !== s.hoverEdge && ctx.measureText(text).width > room) continue;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(ang);
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(255,255,255,0.96)";
        ctx.strokeText(text, 0, -1);
        ctx.fillStyle = HILITE;
        ctx.fillText(text, 0, -1);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- pointer interaction
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const s = S.current;
    let mode: null | { kind: "drag"; n: N; x0: number; y0: number; moved: boolean } | { kind: "pan"; x0: number; y0: number; cx: number; cy: number; moved: boolean } = null;

    const local = (e: PointerEvent | WheelEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const nodeAt = (px: number, py: number) => {
      const { k, x, y } = s.cam;
      const wx = (px - x) / k, wy = (py - y) / k;
      let best: N | null = null, bd = Infinity;
      for (const n of s.list) {
        const dx = n.x! - wx, dy = n.y! - wy, d = dx * dx + dy * dy, rr = n.r + 4 / k;
        if (d < rr * rr && d < bd) { bd = d; best = n; }
      }
      return best;
    };
    const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      const t = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };
    const edgeAt = (px: number, py: number) => {
      const { k, x, y } = s.cam;
      const wx = (px - x) / k, wy = (py - y) / k, tol = 4 / k;
      let best: L | null = null, bd = tol;
      for (const l of s.links) {
        if (l.source === l.target) continue;
        const a = l.source, b = l.target;
        let d: number;
        if (l.curve) {
          const { mx, my } = curvePoint(l);
          d = Math.min(segDist(wx, wy, a.x!, a.y!, mx, my), segDist(wx, wy, mx, my, b.x!, b.y!));
        } else d = segDist(wx, wy, a.x!, a.y!, b.x!, b.y!);
        if (d < bd) { bd = d; best = l; }
      }
      return best;
    };
    const select = (n: N | null) => {
      s.selected = n;
      s.dirty = true;
      setSelected(n ? n.data : null);
      setSelDeg(n ? n.deg : 0);
      onSelectRef.current?.(n ? n.data : null);
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const p = local(e);
      const n = nodeAt(p.x, p.y);
      c.setPointerCapture(e.pointerId);
      if (n) {
        mode = { kind: "drag", n, x0: p.x, y0: p.y, moved: false };
        n.fx = n.x; n.fy = n.y;
      } else {
        mode = { kind: "pan", x0: p.x, y0: p.y, cx: s.cam.x, cy: s.cam.y, moved: false };
        c.style.cursor = "grabbing";
      }
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      if (mode?.kind === "drag") {
        if (!mode.moved && Math.hypot(p.x - mode.x0, p.y - mode.y0) > 3) {
          mode.moved = true;
          s.autoFit = false;
          s.sim?.alphaTarget(0.22).alpha(Math.max(s.sim.alpha(), 0.25));
        }
        if (mode.moved) {
          mode.n.fx = (p.x - s.cam.x) / s.cam.k;
          mode.n.fy = (p.y - s.cam.y) / s.cam.k;
        }
        s.dirty = true;
        return;
      }
      if (mode?.kind === "pan") {
        if (Math.hypot(p.x - mode.x0, p.y - mode.y0) > 3) mode.moved = true;
        if (mode.moved) {
          s.cam = { ...s.cam, x: mode.cx + p.x - mode.x0, y: mode.cy + p.y - mode.y0 };
          s.autoFit = false; s.camAnim = null; s.dirty = true;
        }
        return;
      }
      const n = nodeAt(p.x, p.y);
      const l = n ? null : edgeAt(p.x, p.y);
      if (n !== s.hover || l !== s.hoverEdge) {
        s.hover = n; s.hoverEdge = l;
        refocus();
      }
      c.style.cursor = n ? "pointer" : l ? "help" : "grab";
    };
    const up = (e: PointerEvent) => {
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      if (mode?.kind === "drag") {
        const n = mode.n;
        n.fx = null; n.fy = null;
        s.sim?.alphaTarget(0);
        if (!mode.moved) select(s.selected === n ? null : n);
      } else if (mode?.kind === "pan") {
        if (!mode.moved) select(null);
        c.style.cursor = "grab";
      }
      mode = null;
    };
    const leave = () => {
      if (mode) return;
      if (s.hover || s.hoverEdge) { s.hover = null; s.hoverEdge = null; refocus(); }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomBy(Math.exp(-dy * 0.0016), p.x, p.y);
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("pointerleave", leave);
    c.addEventListener("wheel", wheel, { passive: false });
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("pointerleave", leave);
      c.removeEventListener("wheel", wheel);
    };
  }, []);

  useEffect(() => () => { S.current.sim?.stop(); }, []);

  // legend entries: groups actually present, in the given order, then the rest by count
  const legendItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of nodes) counts.set(n.group ?? "", (counts.get(n.group ?? "") ?? 0) + 1);
    const colour = colourer(groups);
    const order = groups?.map((g) => g.key) ?? [];
    const keys = [...counts.keys()].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
      return counts.get(b)! - counts.get(a)!;
    });
    return keys.map((k) => ({
      key: k, n: counts.get(k)!, color: colour(k),
      label: groups?.find((g) => g.key === k)?.label ?? (k || "other"),
    }));
  }, [nodes, groups]);

  const selColor = selected ? (selected.color ?? legendItems.find((g) => g.key === (selected.group ?? ""))?.color ?? GRAPH_PALETTE[0]) : "";

  return (
    <div ref={wrap} className={`relative w-full overflow-hidden rounded-2xl border border-line bg-[radial-gradient(circle_at_50%_40%,#ffffff_0%,#f7f9fc_70%,#f1f4f9_100%)] ${className}`} style={{ height }}>
      <canvas ref={cv} role="img" aria-label={`Graph of ${nodes.length} nodes and ${edges.length} relationships`}
        className="block touch-none select-none" style={{ cursor: "grab", width: "100%", height }} />

      {!nodes.length && (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted">{emptyText}</div>
      )}

      {legend && legendItems.length > 0 && (
        <div className="absolute left-3 top-3 max-h-[60%] max-w-[46%] overflow-auto rounded-xl border border-line bg-white/90 px-3 py-2 text-xs shadow-[var(--shadow)] backdrop-blur">
          {colorBy && <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">{colorBy}</p>}
          <ul className="space-y-0.5">
            {legendItems.slice(0, 14).map((g) => (
              <li key={g.key}>
                <button type="button" onMouseEnter={() => setLegendFocus(g.key)} onMouseLeave={() => setLegendFocus(null)}
                  onFocus={() => setLegendFocus(g.key)} onBlur={() => setLegendFocus(null)}
                  className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-panel-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
                  <span className="truncate text-paper">{g.label}</span>
                  <span className="ml-auto pl-2 tabular-nums text-muted">{g.n}</span>
                </button>
              </li>
            ))}
            {legendItems.length > 14 && <li className="px-1 text-muted">+{legendItems.length - 14} more</li>}
          </ul>
        </div>
      )}

      <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-xl border border-line bg-white/95 shadow-[var(--shadow)]">
        <CtlButton title="Zoom in" onClick={() => zoomBy(1.3)}><path d="M12 5v14M5 12h14" /></CtlButton>
        <CtlButton title="Zoom out" onClick={() => zoomBy(1 / 1.3)}><path d="M5 12h14" /></CtlButton>
        <CtlButton title="Fit to view" onClick={() => { S.current.autoFit = false; fit(true); }}>
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </CtlButton>
      </div>

      {panel && selected && (
        <aside className="absolute right-3 top-3 flex w-[300px] max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-2xl border border-line bg-white/97 shadow-[0_18px_40px_-20px_rgba(12,26,46,.35)]"
          style={{ maxHeight: height - 76 }}>
          <div className="flex items-start gap-2 border-b border-line px-4 py-3">
            <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: selColor }} />
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">{selected.group || "node"} · {selDeg} neighbour{selDeg === 1 ? "" : "s"}</p>
              <p className="break-words text-[15px] font-semibold leading-snug text-paper">{selected.label ?? selected.id}</p>
            </div>
            <button type="button" aria-label="Close" onClick={() => { S.current.selected = null; S.current.dirty = true; setSelected(null); onSelectRef.current?.(null); }}
              className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2 hover:text-paper">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <dl className="min-h-0 flex-1 overflow-auto px-4 py-2 text-[12.5px]">
            {Object.entries(selected.props ?? {}).map(([key, v]) => (
              <div key={key} className="grid grid-cols-[minmax(0,38%)_minmax(0,1fr)] gap-2 border-b border-line/70 py-1.5 last:border-0">
                <dt className="truncate text-muted" title={key}>{key}</dt>
                <dd className="mono break-words text-paper">{fmt(v)}</dd>
              </div>
            ))}
            {!Object.keys(selected.props ?? {}).length && <p className="py-2 text-muted">No properties.</p>}
          </dl>
        </aside>
      )}
    </div>
  );
}

function CtlButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      className="grid size-8 place-items-center border-b border-line text-paper last:border-0 hover:bg-panel-2 hover:text-cyan">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  );
}

function fmt(v: unknown): string {
  if (v == null) return "null";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("en-US") : String(Math.round(v * 1e6) / 1e6);
  if (typeof v === "string") return v.length > 220 ? v.slice(0, 219) + "…" : v;
  if (Array.isArray(v)) {
    const s = v.slice(0, 8).map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
    return `[${s}${v.length > 8 ? `, … ${v.length - 8} more` : ""}]`;
  }
  const s = JSON.stringify(v);
  return s.length > 220 ? s.slice(0, 219) + "…" : s;
}
