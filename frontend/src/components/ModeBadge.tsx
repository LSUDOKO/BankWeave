"use client";
import { Mode, useHealth } from "@/lib/mode";

const LABEL: Record<Mode, [string, string, string]> = {
  "live-llm": ["Live · LLM + FalkorDB", "text-ok", "Agents call free-tier LLMs; every tool is a FalkorDB query."],
  "live-deterministic": ["Live · deterministic agents", "text-cyan", "FalkorDB is live; agents run their deterministic plans (no LLM key)."],
  replay: ["Seeded replay", "text-verify", "The API is asleep or unreachable: showing bundled snapshots captured from real runs."],
  checking: ["Connecting…", "text-muted", "Checking the API."],
};

export default function ModeBadge({ mode: forced }: { mode?: Mode }) {
  const { mode } = useHealth();
  const m = forced ?? mode;
  const [label, cls, title] = LABEL[m];
  return (
    <span className={`badge ${cls}`} title={title}>
      <span className={`size-1.5 rounded-full bg-current ${m === "checking" ? "pulse-soft" : ""}`} />
      {label}
    </span>
  );
}
