"use client";
import { Background, Controls, Edge, MarkerType, Node, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";

export type DagNode = { type: string; id: string; label: string | null; kind?: string; state: string;
  confidence?: number | null; origin?: string | null; status?: string | null; supported?: boolean | null; ts?: number | null };
export type DagEdge = { source: string; type: string; target: string };

// x of each layer; Evidence and Sentence wrap into two sub-columns so long cases stay readable
const COLUMN: Record<string, number> = { Evidence: 0, Claim: 680, Action: 1020, SAR: 1020, Sentence: 1360 };
const WRAP: Record<string, number> = { Evidence: 2, Sentence: 2 };
const W = 280, GAP = 20, ROW = 78;
const STATE_COLOR: Record<string, string> = { active: "#0c9466", needs_verification: "#c97a06", historical_only: "#5b6b80", superseded: "#d93a3f" };
const EDGE_STYLE: Record<string, { stroke: string; dash?: string; label?: string }> = {
  SUPPORTED_BY: { stroke: "#0c946699", label: "supports" },
  CHALLENGED_BY: { stroke: "#c97a06", dash: "6 4", label: "challenges" },
  DERIVED_FROM: { stroke: "#087cf8", label: "derived" },
  JUSTIFIED_BY: { stroke: "#7a5ad8", label: "justified by" },
  SUPERSEDES: { stroke: "#d93a3f", dash: "2 3", label: "supersedes" },
  CITES: { stroke: "#5b6b8055" },
  CONTAINS: { stroke: "#5b6b8033" },
};

export default function ProvenanceDag({ nodes, edges, upTo, focus, height = 680, onPick }: {
  nodes: DagNode[]; edges: DagEdge[]; upTo?: number | null; focus?: Set<string>; height?: number;
  onPick?: (n: DagNode) => void;
}) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const byType: Record<string, DagNode[]> = {};
    for (const n of nodes) (byType[n.type] ??= []).push(n);
    // evidence sorted by origin so paths that share an origin stack together: the echo is visible
    byType.Evidence?.sort((a, b) => (a.origin ?? "").localeCompare(b.origin ?? ""));
    byType.Claim?.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    const visible = (n: DagNode) => upTo == null || n.ts == null || n.ts <= upTo;
    const rfNodes: Node[] = [];
    for (const [type, list] of Object.entries(byType)) {
      const offset = type === "SAR" ? (byType.Action?.length ?? 0) * ROW + 40 : 0;
      const cols = WRAP[type] ?? 1;
      const perCol = Math.ceil(list.length / cols);
      list.forEach((n, i) => {
        const color = STATE_COLOR[n.state] ?? STATE_COLOR.active;
        const dim = !visible(n) || (focus && focus.size > 0 && !focus.has(n.id));
        rfNodes.push({
          id: n.id, position: { x: (COLUMN[type] ?? 0) + Math.floor(i / perCol) * (W + GAP), y: offset + (i % perCol) * ROW },
          data: { label: <Card n={n} color={color} /> , raw: n },
          style: { width: W, padding: 0, border: `1px solid ${color}`, borderRadius: 10,
            background: "#ffffff", color: "#0c1a2e", opacity: dim ? 0.12 : 1, transition: "opacity .4s, border-color .4s",
            boxShadow: n.state === "needs_verification" ? "0 0 0 3px #c97a0633" : n.state === "superseded" ? "0 0 0 3px #d93a3f33" : "none" },
        });
      });
    }
    const shown = new Set(rfNodes.filter((n) => Number(n.style?.opacity ?? 1) > 0.5).map((n) => n.id));
    const rfEdges: Edge[] = edges.filter((e) => e.type !== "CONTAINS").map((e, i) => {
      const s = EDGE_STYLE[e.type] ?? { stroke: "#5b6b80" };
      const on = shown.has(e.source) && shown.has(e.target);
      return {
        id: `${e.source}-${e.type}-${e.target}-${i}`, source: e.source, target: e.target,
        label: on && s.label && e.type !== "SUPPORTED_BY" ? s.label : undefined,
        labelStyle: { fill: "#5b6b80", fontSize: 10 }, labelBgStyle: { fill: "#f5f8fc" },
        style: { stroke: s.stroke, strokeDasharray: s.dash, opacity: on ? 1 : 0.06 },
        markerEnd: { type: MarkerType.ArrowClosed, color: s.stroke },
        animated: on && e.type === "CHALLENGED_BY",
      };
    });
    return { rfNodes, rfEdges };
  }, [nodes, edges, upTo, focus]);

  return (
    <div style={{ height }} className="rounded-xl border border-line bg-ink/60">
      <ReactFlow nodes={rfNodes} edges={rfEdges} fitView minZoom={0.15} proOptions={{ hideAttribution: true }}
        nodesConnectable={false} onNodeClick={(_, n) => onPick?.((n.data as any).raw)} colorMode="light"
        style={{ background: "transparent" }}>
        <Background color="#dde6f0" gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function Card({ n, color }: { n: DagNode; color: string }) {
  const tag = n.type === "Evidence" ? n.kind : n.type === "Claim" ? `${n.kind} claim` : n.type === "Action" ? n.kind?.replace("_", " ") : n.type;
  return (
    <div className="px-2.5 py-1.5 text-left">
      <div className="flex items-center justify-between gap-2 text-[10px] font-medium" style={{ color }}>
        <span>{tag}</span>
        <span className="mono normal-case text-muted">{n.id}</span>
      </div>
      <p className={`mt-0.5 text-[11px] leading-snug line-clamp-2 ${n.state === "superseded" ? "line-through text-muted" : ""}`}>{n.label}</p>
      {n.type === "Evidence" && n.origin && <p className="mono text-[9px] text-muted truncate">origin {n.origin}</p>}
      {n.type === "Claim" && n.confidence != null && <p className="text-[10px] text-muted">confidence {Math.round(n.confidence * 100)}%</p>}
    </div>
  );
}
