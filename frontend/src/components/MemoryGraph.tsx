"use client";
import { Background, Edge, MarkerType, Node, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";

type Step = { order: number; tool: string; params: string; why?: string; pitfalls: string[] };
export type Procedure = { id: string; name: string; typology: string; success: number; fail: number; learned_from: string[]; steps: Step[] };

/** Procedural memory as a graph: (:Procedure)-[:STEP {order}]->(:Step), one row per procedure. */
export default function MemoryGraph({ procedures }: { procedures: Procedure[] }) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    procedures.forEach((p, row) => {
      const y = row * 150;
      nodes.push({ id: p.id, position: { x: 0, y }, data: { label: (
        <div className="text-left px-2 py-1"><p className="text-[10px] uppercase tracking-wider text-ok">procedure</p>
          <p className="text-[11px] font-semibold">{p.typology}</p>
          <p className="text-[10px] text-muted">{p.success} success · {p.fail} fail · from {p.learned_from.join(", ")}</p></div>) },
        style: { width: 220, padding: 0, border: "1px solid #10b981", borderRadius: 10, background: "#0f172aee", color: "#e2e8f0" } });
      let prev = p.id;
      p.steps.filter((s) => s.tool).forEach((s, i) => {
        const id = `${p.id}-${i}`;
        nodes.push({ id, position: { x: 260 + i * 190, y: y + (i % 2) * 36 }, data: { label: (
          <div className="text-left px-2 py-1"><p className="mono text-[11px] text-cyan">{s.tool}</p>
            <p className="mono text-[9px] text-muted truncate">{s.params}</p>
            {s.pitfalls?.length > 0 && <p className="text-[9px] text-ring">pitfall: {s.pitfalls[0]}</p>}</div>) },
          style: { width: 170, padding: 0, border: "1px solid #243247", borderRadius: 8, background: "#0f172aee", color: "#e2e8f0" } });
        edges.push({ id: `${prev}->${id}`, source: prev, target: id, label: i === 0 ? "STEP 0" : String(i),
          labelStyle: { fill: "#94a3b8", fontSize: 9 }, labelBgStyle: { fill: "#070b14" },
          style: { stroke: "#06b6d488" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#06b6d4" } });
        prev = id;
      });
    });
    return { nodes, edges };
  }, [procedures]);
  return (
    <div style={{ height: Math.max(240, procedures.length * 150 + 60) }} className="rounded-xl border border-line">
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }} nodesConnectable={false} colorMode="dark" style={{ background: "transparent" }}>
        <Background color="#1e293b" gap={24} />
      </ReactFlow>
    </div>
  );
}
