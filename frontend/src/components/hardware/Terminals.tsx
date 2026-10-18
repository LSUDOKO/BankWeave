"use client";
import Link from "next/link";
import { useState } from "react";
import { post } from "@/lib/api";
import { btn, Card, Chip, Empty } from "@/components/ui";
import { CopyButton } from "./CodeBlock";
import { TerminalDevice } from "./devices";

const ok = (r?: string) => !!r && r.startsWith("00");
const time = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** POS/ATM digital twin: tap cards, run the two fraud presets, read the ISO 8583 / EMV message. */
export default function Terminals({ twin, error, reload }: { twin: any; error: string | null; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const sel = picked ?? twin?.log?.[0] ?? null;

  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setMsg(null);
    try { const r = await fn(); setPicked(r.steps ? r.steps[r.steps.length - 1] : r); if (r.title) setMsg(`${r.title}: ${r.alerts.length} alert(s) raised`); }
    catch (e: any) { setMsg(e.message); }
    setBusy(false); await reload();
  };

  if (!twin) return <Empty>{error ?? "Loading terminals…"}</Empty>;
  const lastAt = (id: string) => twin.log.find((l: any) => l.terminal === id);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries<any>(twin.terminals).map(([id, t]) => (
          <section key={id} className="glass flex flex-col gap-5 p-5 sm:flex-row">
            <TerminalDevice id={id} kind={t.kind} last={lastAt(id)} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mono text-[15px] font-semibold">{id}</h2>
                <Chip tone="blue">{t.kind} · {t.city}</Chip>
              </div>
              <p className="mt-0.5 text-xs text-muted">{t.name}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                {[["IFD serial (9F1E)", t.ifd], ["Device in graph", t.device], ["Merchant (DE 42)", t.merchant], ["IMEI", t.imei]].map(([k, v]) => (
                  <div key={k} className="min-w-0"><dt className="text-muted">{k}</dt><dd className="mono truncate text-paper">{v}</dd></div>
                ))}
              </dl>
              <p className="mt-4 text-[11px] font-medium uppercase tracking-wider text-muted">Tap a card · INR {(t.kind === "ATM" ? 20000 : 9500).toLocaleString("en-IN")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {twin.cards.map((c: any) => (
                  <button key={c.card} disabled={busy}
                    onClick={() => run(() => post("/hardware/pos-tap", { terminal_id: id, card_id: c.card, amount: t.kind === "ATM" ? 20000 : 9500, clone: false }))}
                    className="group inline-flex flex-col items-start rounded-xl border border-line bg-white px-3 py-1.5 text-left transition-colors hover:border-cyan disabled:opacity-50">
                    <span className="text-xs font-semibold group-hover:text-cyan">Tap {c.card}</span>
                    <span className="mono text-[10.5px] text-muted">{c.pan_masked}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="fill-deep relative overflow-hidden rounded-[22px] p-5">
        <span className="lines" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-medium text-white">Fraud presets</h2>
            <p className="text-xs text-white/60">Each one taps the twin in sequence; the alerts land in the same queue the agents triage.</p>
          </div>
          {msg && <p className="text-sm text-sky">{msg} · <Link href="/alerts" className="underline underline-offset-2 hover:text-white">alert queue →</Link></p>}
        </div>
        <div className="relative mt-4 grid gap-3 md:grid-cols-2">
          {([
            ["mule_ring", "Mule card-swiping ring", "Three cards from two banks on shared POS D00063 within a minute. Raises pos_shared_terminal and links their accounts through one Device node.", "Run mule ring"],
            ["impossible_travel", "Cloned EMV card", "CARD-A in Mumbai, then at the Delhi ATM 10 s later with a replayed ATC, 1,148 km apart. Raises impossible_travel.", "Run cloned card"],
          ] as const).map(([key, title, body, cta]) => (
            <div key={key} className="flex flex-col rounded-2xl bg-white/[.07] p-4 ring-1 ring-white/10">
              <p className="font-semibold text-white">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/65">{body}</p>
              <button disabled={busy} onClick={() => run(() => post(`/hardware/preset/${key}`))}
                className="mt-3 inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-deep hover:bg-sky disabled:opacity-50">
                {busy ? "Running…" : cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Cards map to consortium accounts:</span>
        {twin.cards.map((c: any) => (
          <span key={c.card} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1">
            <span className="mono font-semibold text-paper">{c.card}</span>→<span className="mono">{c.account.slice(0, 10)}</span>
            <Chip>bank {c.bank}</Chip>{c.nfc_uid && <span className="mono text-[10.5px]">UID {c.nfc_uid}</span>}
          </span>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card title="Transaction log" action={<Chip tone="muted">{twin.log.length} recent</Chip>} pad="p-4">
          <ol className="scroll-thin -mx-1 max-h-[560px] space-y-1 overflow-y-auto px-1">
            {twin.log.map((l: any, i: number) => (
              <li key={i}>
                <button onClick={() => setPicked(l)}
                  className={`w-full rounded-xl px-3 py-2 text-left text-xs transition-colors ${sel === l ? "bg-panel-2 ring-1 ring-cyan/30" : "hover:bg-panel-2"}`}>
                  <span className="flex items-center gap-2">
                    <Chip tone={l.alerts.length ? "ring" : ok(l.response) ? "ok" : "warn"}>{l.response.split(" ")[0]}</Chip>
                    <span className="mono font-semibold">{l.card}</span>
                    <span className="text-muted">{l.city}</span>
                    {l.source === "wokwi" && <Chip tone="blue">wokwi</Chip>}
                    <span className="ml-auto mono text-[10.5px] text-muted">{time(l.ts)}</span>
                  </span>
                  <span className="mt-1 block text-muted">INR {Math.round(l.amount).toLocaleString("en-IN")} · ATC {l.atc}{l.clone ? " · clone" : ""}</span>
                  {l.alerts.map((a: any) => <span key={a.id} className="mt-0.5 block font-medium text-verify">{a.rule}</span>)}
                </button>
              </li>
            ))}
            {!twin.log.length && <li className="px-2 py-6 text-center text-muted">No taps yet. Tap a card above.</li>}
          </ol>
        </Card>

        {sel ? <TapDetail sel={sel} /> : <Empty>Tap a card to see its ISO 8583 message and EMV TLV.</Empty>}
      </div>
    </div>
  );
}

function TapDetail({ sel }: { sel: any }) {
  const f55: string = sel.iso8583.fields["55"];
  const verify = () => { navigator.clipboard?.writeText(f55); window.open(sel.emvlab ?? "https://emvlab.org/tlvutils/", "_blank"); };
  return (
    <section className="glass min-w-0 space-y-5 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[17px] font-medium">ISO 8583 <span className="mono">{sel.iso8583.mti}</span></h2>
        <Chip tone={sel.alerts.length ? "ring" : ok(sel.response) ? "ok" : "warn"}>{sel.response}</Chip>
        <Chip tone="muted">{sel.terminal}</Chip>
        <span className="ml-auto flex flex-wrap gap-2">
          <button onClick={verify} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-[#1a8bff] to-[#0a63cf] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_8px_18px_-10px_rgba(8,124,248,.9)] hover:brightness-110">Copy TLV &amp; verify on EMVLab.org ↗</button>
          <a href="https://emvlab.org/cryptogram/" target="_blank" rel="noreferrer" className={btn.small}>Cryptogram tool ↗</a>
        </span>
      </div>

      {sel.nfc_uid && (
        <div className="grid gap-2 sm:grid-cols-4">
          {[["NFC UID", sel.nfc_uid], ["EMV ATC (9F36)", String(sel.atc)], ["GPS", sel.gps?.join(", ")], ["Terminal IMEI / MAC", `${sel.imei} · ${sel.mac}`]].map(([k, v]) => (
            <div key={k} className="glass-2 min-w-0 px-3 py-2"><p className="text-[11px] text-muted">{k}</p><p className="mono break-all text-[12px]">{v}</p></div>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Data elements</p>
          <table className="w-full text-xs">
            <tbody>{Object.entries<string>(sel.iso8583.fields).filter(([k]) => k !== "55").map(([k, v]) => (
              <tr key={k} className="border-t border-line first:border-0"><td className="mono w-14 py-1.5 pr-3 text-muted">DE {k}</td><td className="mono break-all py-1.5">{v}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Field 55 · EMV TLV</p>
          <table className="w-full text-xs">
            <thead className="text-left text-muted"><tr><th className="pb-1.5 pr-2 font-normal">Tag</th><th className="pb-1.5 pr-2 font-normal">Value</th><th className="pb-1.5 font-normal">Meaning</th></tr></thead>
            <tbody>{sel.emv.map((t: any) => (
              <tr key={t.tag} className="border-t border-line"><td className="mono py-1.5 pr-2 font-semibold text-cyan">{t.tag}</td><td className="mono break-all py-1.5 pr-2">{t.value}</td><td className="py-1.5 text-muted">{t.name}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            Written to FalkorDB as <span className="mono">(:Account)-[:USES_DEVICE {"{"}emv_atc, terminal_id, gps{"}"}]-&gt;(:Device {"{"}id:&apos;{sel.device_id ?? "D00063"}&apos;{"}"})</span> and a <span className="mono">CARD_TXN</span> edge
          </p>
          <CopyButton text={f55} label="Copy hex" />
        </div>
        <pre className="mono whitespace-pre-wrap break-all rounded-xl bg-[#071530] p-3 text-[11.5px] leading-relaxed text-sky">{f55}</pre>
        <p className="mt-1.5 text-[11px] text-muted">BER-TLV encoding is real and decodes on EMVLab. 9F26 is an HMAC standing in for a chip&apos;s cryptogram; terminals and cards are simulated.</p>
      </div>

      {sel.alerts.length > 0 && (
        <ul className="space-y-2">
          {sel.alerts.map((a: any) => (
            <li key={a.id} className="flex flex-wrap items-start gap-2 rounded-xl bg-[#fff6e6] px-3 py-2 text-sm">
              <Chip tone="warn">{a.rule}</Chip><span className="mono text-xs text-muted">{a.id}</span><span className="text-[13px]">{a.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
