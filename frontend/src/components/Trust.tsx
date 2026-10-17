import { pct } from "@/lib/api";

const STATE: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "text-ok border-ok/40" },
  needs_verification: { label: "Needs verification", cls: "text-verify border-verify/60 bg-verify/10" },
  historical_only: { label: "Historical", cls: "text-muted border-line" },
  superseded: { label: "Superseded", cls: "text-muted border-line line-through" },
};

export function StateBadge({ state }: { state?: string | null }) {
  const s = STATE[state ?? "active"] ?? STATE.active;
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-xs ${s.cls}`}>{s.label}</span>;
}

/** Echo-proof confidence: the bar is distinct origins; the ghost is what path-counting claims. */
export function Confidence({
  confidence, naive, paths, sources, compact = false,
}: { confidence?: number | null; naive?: number | null; paths?: number | null; sources?: number | null; compact?: boolean }) {
  const c = confidence ?? 0;
  const n = naive ?? c;
  return (
    <div className={compact ? "w-40" : "w-full max-w-xs"}>
      <div className="relative h-1.5 rounded bg-line" title={`naive path counting would say ${pct(n)}`}>
        <div className="absolute inset-y-0 left-0 rounded bg-paper/20" style={{ width: pct(n) }} />
        <div className="absolute inset-y-0 left-0 rounded bg-paper" style={{ width: pct(c) }} />
      </div>
      <p className="mt-1 text-xs text-muted">
        <span className="text-paper font-medium">{pct(c)}</span>
        {paths != null && (
          <> from {paths} path{paths === 1 ? "" : "s"}, {sources} independent source{sources === 1 ? "" : "s"}</>
        )}
      </p>
    </div>
  );
}

export function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "ring" | "verify" | "ok" }) {
  const cls = { muted: "text-muted border-line", ring: "text-ring border-ring/50", verify: "text-verify border-verify/50", ok: "text-ok border-ok/40" }[tone];
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}
