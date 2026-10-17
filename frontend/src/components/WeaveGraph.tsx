"use client";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { useEffect, useMemo, useRef, useState } from "react";
import { bankHex, bankIndex } from "@/lib/banks";

export type GNode = { id: string; bank: string; kind?: string; pagerank?: number; motif?: number; cases?: string[] };
export type GEdge = { source: string; target: string; amount?: number; n?: number };
type SimNode = GNode & SimulationNodeDatum;

const pos = new Map<string, { x: number; y: number }>(); // survives view switches: the reveal

/** Banks are vertical lanes. Edges that cross lanes are the threads only the consortium sees. */
export default function WeaveGraph({
  nodes, edges, banks, highlight, onSelect, height = 560,
}: {
  nodes: GNode[]; edges: GEdge[]; banks: string[]; highlight?: Set<string>;
  onSelect?: (id: string | null) => void; height?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<string | null>(null);
  const sim = useRef<{ nodes: SimNode[]; links: { source: SimNode; target: SimNode; amount?: number }[] } | null>(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, e.contentRect.width)));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const lane = useMemo(() => {
    const n = Math.max(1, banks.length);
    return (b: string) => {
      const i = bankIndex(b);
      const k = i < 0 || i >= n ? n : i; // banks outside the selection share an edge lane
      return ((k + 0.5) / (n + (bankIndex(b) >= n || i < 0 ? 1 : 0))) * width;
    };
  }, [banks, width]);

  useEffect(() => {
    const sn: SimNode[] = nodes.map((n) => {
      const p = pos.get(n.id);
      return { ...n, x: p?.x ?? lane(n.bank) + (Math.random() - 0.5) * 40, y: p?.y ?? height / 2 + (Math.random() - 0.5) * height * 0.6 };
    });
    const byId = new Map(sn.map((n) => [n.id, n]));
    const links = edges.filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((e) => ({ source: byId.get(e.source)!, target: byId.get(e.target)!, amount: e.amount }));
    sim.current = { nodes: sn, links };
    const s = forceSimulation(sn)
      // lanes dominate: x is owned by the bank, y is free for the structure
      .force("x", forceX<SimNode>((d) => lane(d.bank)).strength(1))
      .force("y", forceY(height / 2).strength(0.03))
      .force("charge", forceManyBody().strength(-22))
      .force("collide", forceCollide(7))
      .force("link", forceLink(links).distance(60).strength(0.02))
      .alpha(pos.size ? 0.4 : 1)
      .on("tick", () => {
        const band = Math.min(70, width / Math.max(2, banks.length + 1) / 3);
        for (const n of sn) {
          n.y = Math.max(28, Math.min(height - 12, n.y!));
          const lx = lane(n.bank);
          n.x = Math.max(lx - band, Math.min(lx + band, n.x!));
          pos.set(n.id, { x: n.x!, y: n.y! });
        }
        draw();
      });
    return () => { s.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, lane, height]);

  useEffect(() => { draw(); });

  function draw() {
    const c = canvas.current;
    const g = sim.current;
    if (!c || !g) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr; c.height = height * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    // lanes
    banks.forEach((b) => {
      const x = lane(b);
      ctx.strokeStyle = bankHex(b) + "26"; ctx.lineWidth = Math.min(140, width / Math.max(2, banks.length + 1) * 0.66);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      ctx.fillStyle = "#e9e4d4"; ctx.font = "600 13px sans-serif";
      ctx.textAlign = "center"; ctx.fillText(`Bank ${b}`, x, 18);
      ctx.fillStyle = bankHex(b); ctx.fillRect(x - 18, 24, 36, 2);
    });
    // edges: same-lane quiet, cross-lane threads red when both ends are in a case
    for (const l of g.links) {
      const cross = l.source.bank !== l.target.bank;
      const inCase = (l.source.cases?.length ?? 0) > 0 && (l.target.cases?.length ?? 0) > 0;
      const hot = highlight && highlight.has(l.source.id) && highlight.has(l.target.id);
      ctx.strokeStyle = hot ? "#e5484d" : cross ? (inCase ? "rgba(229,72,77,.75)" : "rgba(233,228,212,.28)") : "rgba(154,167,184,.35)";
      ctx.lineWidth = hot ? 2.4 : cross ? 1.4 : 0.8;
      ctx.beginPath();
      const mx = (l.source.x! + l.target.x!) / 2, my = (l.source.y! + l.target.y!) / 2 - (cross ? 18 : 0);
      ctx.moveTo(l.source.x!, l.source.y!);
      ctx.quadraticCurveTo(mx, my, l.target.x!, l.target.y!);
      ctx.stroke();
    }
    // nodes
    for (const n of g.nodes) {
      const r = n.kind === "external" ? 3 : 4 + Math.min(8, Math.sqrt((n.pagerank ?? 0) * 4000));
      ctx.beginPath(); ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
      if (n.kind === "external") {
        ctx.strokeStyle = bankHex(n.bank); ctx.lineWidth = 1.2; ctx.stroke();
      } else {
        ctx.fillStyle = bankHex(n.bank); ctx.fill();
        if (highlight?.has(n.id) || hover === n.id) { ctx.strokeStyle = "#e9e4d4"; ctx.lineWidth = 2; ctx.stroke(); }
      }
    }
  }

  function pick(ev: React.MouseEvent) {
    const g = sim.current;
    if (!g) return null;
    const rect = canvas.current!.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    let best: SimNode | null = null, bd = 100;
    for (const n of g.nodes) {
      const d = (n.x! - x) ** 2 + (n.y! - y) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  return (
    <div ref={wrap} className="relative w-full">
      <canvas
        ref={canvas}
        style={{ width, height }}
        className="block rounded-md bg-panel/40 cursor-crosshair"
        role="img"
        aria-label={`Money network: ${nodes.length} accounts, ${edges.length} links across ${banks.length} banks`}
        onMouseMove={(e) => setHover(pick(e)?.id ?? null)}
        onClick={(e) => onSelect?.(pick(e)?.id ?? null)}
      />
    </div>
  );
}
