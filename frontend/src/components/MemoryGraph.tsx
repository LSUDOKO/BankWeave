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
      const y = row * 210;
      nodes.push({ id: p.id, position: { x: 0, y }, data: { label: (
        <div className="text-left px-2 py-1"><p className="text-[10px] font-medium text-ok">procedure</p>
          <p className="text-[11px] font-semibold">{p.typology}</p>
          <p className="text-[10px] text-muted">{p.success} success · {p.fail} fail · from {p.learned_from.join(", ")}</p></div>) },
        style: { width: 220, padding: 0, border: "1px solid #0c9466", borderRadius: 10, background: "#ffffff", color: "#0c1a2e" } });
      let prev = p.id;
      p.steps.filter((s) => s.tool).forEach((s, i) => {
        const id = `${p.id}-${i}`;
        nodes.push({ id, position: { x: 260 + (i % 6) * 190, y: y + Math.floor(i / 6) * 80 }, data: { label: (
          <div className="text-left px-2 py-1"><p className="mono text-[11px] text-cyan">{s.tool}</p>
            <p className="mono text-[9px] text-muted truncate">{s.params}</p>
            {s.pitfalls?.length > 0 && <p className="text-[9px] text-ring">pitfall: {s.pitfalls[0]}</p>}</div>) },
          style: { width: 170, padding: 0, border: "1px solid #dde6f0", borderRadius: 8, background: "#ffffff", color: "#0c1a2e" } });
        edges.push({ id: `${prev}->${id}`, source: prev, target: id, label: i === 0 ? "STEP 0" : String(i),
          labelStyle: { fill: "#5b6b80", fontSize: 9 }, labelBgStyle: { fill: "#f5f8fc" },
          style: { stroke: "#087cf888" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#087cf8" } });
        prev = id;
      });
    });
    return { nodes, edges };
  }, [procedures]);
  return (
    <div style={{ height: Math.max(260, procedures.length * 210 + 60) }} className="rounded-xl border border-line">
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }} nodesConnectable={false} colorMode="light" style={{ background: "transparent" }}>
        <Background color="#dde6f0" gap={24} />
      </ReactFlow>
    </div>
  );
}
