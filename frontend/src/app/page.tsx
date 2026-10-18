"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { live } from "@/lib/snapshot";

type Overview = {
  alerts: { total: number; open?: number; cleared?: number; case?: number };
  cases: { total: number; open: number; pending_actions: number; recent: { id: string; title: string; status: string; claims: number }[] };
  claims: { claims: number; independent: number; paths: number; origins: number };
  falkordb: { region: string; graphs: number; version: string | null; memory: { used_mb: number; max_mb: number | null; pct: number | null } };
  ms: number;
};

export default function Landing() {
  const [d, setD] = useState<Overview | null>(null);
  const [replay, setReplay] = useState(false);
  useEffect(() => { live<Overview>("/overview").then(({ data, replay }) => { setD(data); setReplay(replay); }).catch(() => {}); }, []);
  const n = (x?: number) => (x == null ? "…" : Math.round(x).toLocaleString());
  const decided = (d?.alerts.cleared ?? 0) + (d?.alerts.case ?? 0);
  return (
    <>
      <section className="hero-blue relative" style={{ width: "100vw", marginLeft: "calc(50% - 50vw)", marginTop: -104, paddingTop: 150 }}>
        <div className="mx-auto max-w-[760px] px-6 text-center">
          <h1 className="rise text-white text-[44px] sm:text-[64px] leading-[0.98] font-bold" style={{ letterSpacing: "-0.055em" }}>
            Find the laundering ring no single bank can see
          </h1>
          <p className="rise mx-auto mt-6 max-w-[600px] text-[17px] leading-relaxed text-white/85" style={{ animationDelay: ".08s" }}>
            BankWeave&apos;s agents investigate alerts across banks in one FalkorDB instance. Each bank keeps its own graph,
            rings appear where those graphs join, and every sentence of a report points to the query that proves it.
          </p>
          <div className="rise mt-8 flex flex-wrap justify-center gap-3" style={{ animationDelay: ".14s" }}>
            <Link href="/command" className="rounded-xl bg-white px-5 py-2.5 font-semibold text-cyan shadow-lg shadow-black/10 hover:bg-white/90">Open the console</Link>
            <Link href="/scenarios" className="rounded-xl border border-white/40 px-5 py-2.5 font-semibold text-white hover:bg-white/10">See a ring across four banks</Link>
          </div>
        </div>

        <div className="rise relative mx-auto mt-14 max-w-[1040px] px-4 sm:px-6" style={{ animationDelay: ".22s", marginBottom: -140 }}>
          <div className="window">
            <div className="window-bar">
              <i style={{ background: "#ff5f57" }} /><i style={{ background: "#febc2e" }} /><i style={{ background: "#28c840" }} />
              <span className="mx-auto">bankweave · Command Center{replay ? " · replay" : " · live"}</span>
              <span className="text-[11px]">{d ? `${d.ms} ms` : ""}</span>
            </div>
            <div className="grid gap-4 p-5 text-paper md:grid-cols-[1.2fr_1fr]">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Alerts the agents decided" value={n(decided)} sub={`of ${n(d?.alerts.total)} raised by rules`} />
                <Stat label="Cases opened" value={n(d?.cases.total)} sub={`${n(d?.cases.pending_actions)} waiting for a human`} tone="text-cyan" />
                <Stat label="Claims with two or more independent sources" value={n(d?.claims.independent)} sub={`${n(d?.claims.paths)} paths rest on ${n(d?.claims.origins)} origins`} tone="text-ok" />
                <Stat label="FalkorDB Cloud" value={d?.falkordb.version ? `v${d.falkordb.version}` : "…"} sub={`${d?.falkordb.region ?? ""} · ${d?.falkordb.graphs ?? "…"} graphs · ${d?.falkordb.memory.used_mb ?? "…"} MB`} />
              </div>
              <div className="rounded-xl bg-panel-2 p-3">
                <p className="text-xs font-medium text-muted">Latest cases</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {(d?.cases.recent ?? []).slice(0, 6).map((c) => (
                    <li key={c.id} className="flex items-baseline gap-2">
                      <Link href={`/cases/${c.id}`} className="mono text-cyan">{c.id}</Link>
                      <span className="truncate text-paper/80">{c.title}</span>
                    </li>
                  ))}
                  {!d && <li className="text-muted">Connecting to the live API…</li>}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-[180px] max-w-[1040px] grid gap-10 md:grid-cols-3">
        {[
          ["One graph per bank, one where they meet", "Each bank's transfers stay in its own graph. The consortium graph joins them on salted, enclave-blinded ids, and that is where a ring becomes one connected structure.", "/network", "Compare the views"],
          ["Evidence counted by origin, not by path", "Ten paths to one shared device are one fact. Confidence counts distinct origins, and superseded facts flag every claim and report sentence that rests on them.", "/trust", "See the trust layer"],
          ["The engine, opened up", "Every algorithm, index, query plan and tool call the agents use runs live in the Lab, against the same FalkorDB Cloud instance.", "/lab", "Open the Lab"],
        ].map(([t, b, href, cta]) => (
          <div key={t}>
            <h2 className="text-[22px] leading-tight" style={{ letterSpacing: "-0.035em" }}>{t}</h2>
            <p className="mt-3 text-muted">{b}</p>
            <Link href={href} className="link mt-3 inline-block text-sm font-medium">{cta}</Link>
          </div>
        ))}
      </section>
    </>
  );
}

function Stat({ label, value, sub, tone = "text-paper" }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`kpi mt-1 text-[28px] leading-none ${tone}`}>{value}</p>
      <p className="mt-1.5 text-xs text-muted">{sub}</p>
    </div>
  );
}
