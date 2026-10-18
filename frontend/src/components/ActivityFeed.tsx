"use client";
import Link from "next/link";
import { useEvents, type BwEvent } from "@/lib/useEvents";

const AGENT_COLOR: Record<string, string> = {
  triage: "text-[var(--bank-1)]", investigator: "text-paper", skeptic: "text-verify",
  reporter: "text-ok", auditor: "text-ok", archivist: "text-muted", trust: "text-ring",
};

function describe(e: BwEvent): string {
  const d = e.data ?? {};
  switch (e.type) {
    case "agent_step":
      if (e.id === "llm") return d.error ? `LLM error, deterministic fallback` : `${d.role} model ${d.model?.split("/").pop()} answered in ${d.ms} ms`;
      return String(d.action ?? "").replace("tool:", "called ") + (d.summary ? ` (${d.summary})` : "");
    case "alert": return d.status === "cleared" ? `cleared alert: ${d.reason}` : d.count ? `${d.count} alerts raised by rules` : `alert ${d.status}`;
    case "case": return `case ${d.status}${d.title ? `: ${d.title}` : ""}`;
    case "claim": return d.text ? `claim: ${d.text}` : d.challenged_by ? "challenged a claim" : "updated a claim";
    case "evidence": return `evidence (${d.kind}): ${d.summary}`;
    case "state_change": return d.state ? `${e.id} is now ${d.state.replace("_", " ")}` : `confidence ${Math.round((d.confidence ?? 0) * 100)}% (${d.paths} paths, ${d.sources} sources)`;
    case "sar": return `SAR ${d.status}, provenance fidelity ${d.pf}`;
    case "action": return `action ${d.kind ?? ""} ${d.status}`;
    case "task": return `task ${d.type ?? ""} ${d.status}`;
    case "worker": return `worker ${d.status}`;
    case "kyc_update": return `KYC update: ${d.fact}`;
    default: return e.type;
  }
}

export default function ActivityFeed({ caseId, height = "h-[70vh]" }: { caseId?: string; height?: string }) {
  const { events, connected } = useEvents(250, (e) =>
    e.type !== "task" && (!caseId || e.graph === `case_${caseId}`),
  );
  return (
    <section aria-label="Agent activity" className="flex flex-col min-h-0">
      <h2 className="mb-2">Agent activity</h2>
      <ol className={`${height} overflow-y-auto scroll-thin space-y-1.5 pr-1 text-sm`}>
        {!events.length && (
          <li className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-muted">
            <span className={`mx-auto mb-2 block size-2.5 rounded-full ${connected ? "bg-ok pulse-soft" : "bg-mist"}`} />
            {connected ? <>Listening to the live event stream. Agent steps appear here as they happen. <Link href="/demo" className="link">Run the agents</Link></> : "Connecting to the event stream…"}
          </li>
        )}
        {events.map((e, i) => (
          <li key={i} className="leading-snug">
            <span className={`font-medium ${AGENT_COLOR[e.agent ?? ""] ?? "text-muted"}`}>{e.agent ?? e.type}</span>{" "}
            <span className="text-paper/85">{describe(e)}</span>
            {e.graph.startsWith("case_") && !caseId && (
              <Link href={`/cases/${e.graph.slice(5)}`} className="ml-1 mono text-muted hover:text-paper">{e.graph.slice(5)}</Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
