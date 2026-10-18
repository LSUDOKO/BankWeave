"use client";
import { useState } from "react";
import { post } from "@/lib/api";
import { btn, Card, Chip } from "@/components/ui";
import { CodeFiles, CopyButton } from "./CodeBlock";
import { WokwiCircuit } from "./devices";
import { DIAGRAM_JSON, LIBRARIES_TXT, SKETCH_INO } from "./wokwiSources";

const NEW_PROJECT = "https://wokwi.com/projects/new/esp32";
const REPO = "https://github.com/LSUDOKO/BankWeave/tree/main/hardware/wokwi";
const hms = (ts: number) => new Date(ts * 1000).toISOString().slice(11, 19);
const ago = (ts: number) => {
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};

/** The ESP32 terminal that runs in Wokwi: circuit, source files, run steps and the live serial log. */
export default function Wokwi({ twin, reload }: { twin: any; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const log: any[] = twin?.wokwi_log ?? [];
  const last = log[0];

  // the exact JSON the ESP32 sketch posts, so the pipeline can be checked without opening Wokwi
  const sendAsDevice = async (card: string, atm: boolean) => {
    setBusy(true);
    try {
      await post("/hardware/pos-tap", { terminal_id: atm ? "ATM-DEL-A00091" : "POS-MUM-D00063", card_id: card, amount: atm ? 20000 : 9650,
        clone: atm, source: "wokwi", device_id: atm ? "A00091" : "D00063", gps: atm ? [28.6139, 77.209] : [19.076, 72.8777] });
    } catch { /* shown in the log */ }
    setBusy(false); await reload();
  };

  // what the sketch's show() puts on the OLED after a tap
  const screen: [string, string, string] = last
    ? [last.response.slice(0, 21), last.alerts.length ? last.alerts[0].rule : "no alert", `ATC ${last.atc}`]
    : ["Ready", "A/B/C = tap card", "yellow = POS/ATM"];
  const led = last ? (last.alerts.length ? "refer" : "ok") : null;

  const steps: { n: string; title: string; body: React.ReactNode; actions: React.ReactNode }[] = [
    {
      n: "1", title: "Open a new ESP32 project",
      body: <>Wokwi&apos;s free simulator, no account needed. It opens with a blank <span className="mono">sketch.ino</span> and <span className="mono">diagram.json</span>.</>,
      actions: <a href={NEW_PROJECT} target="_blank" rel="noreferrer" className={btn.primary}>Open wokwi.com/projects/new/esp32 ↗</a>,
    },
    {
      n: "2", title: "Paste our two files over the defaults",
      body: <>Replace all of <span className="mono">sketch.ino</span>, then the <span className="mono">diagram.json</span> tab. In the Library Manager add the three libraries (or create <span className="mono">libraries.txt</span>).</>,
      actions: (
        <div className="flex flex-wrap gap-2">
          <CopyButton text={SKETCH_INO} label="Copy sketch.ino" />
          <CopyButton text={DIAGRAM_JSON} label="Copy diagram.json" />
          <CopyButton text={LIBRARIES_TXT} label="Copy libraries.txt" />
        </div>
      ),
    },
    {
      n: "3", title: "Press play, then the buttons",
      body: <>The board joins <span className="mono">Wokwi-GUEST</span> and the OLED shows Ready. Press Card A, B, C within a minute (shared-terminal ring), then the yellow button and Card A (cloned card at the Delhi ATM). Each tap shows up in the serial log below within seconds.</>,
      actions: <p className="text-[11.5px] text-muted">If the OLED shows <span className="mono">HTTP error</span>, the Render API is waking up: press again after a minute.</p>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card title="ESP32 card terminal in the Wokwi simulator" action={<Chip tone="warn">simulated board · real HTTPS</Chip>} pad="p-5">
          <div className="overflow-hidden rounded-2xl border border-line">
            <WokwiCircuit terminal={last?.terminal ?? "POS-MUM-D00063"} screen={screen} led={led} />
          </div>
          <p className="mt-3 text-sm text-muted">
            ESP32-DevKitC V4, SSD1306 OLED, three card buttons, a POS/ATM switch and two LEDs, wired exactly as in
            <span className="mono"> diagram.json</span>. Wokwi gives the simulated board real internet through its
            <span className="mono"> Wokwi-GUEST</span> Wi-Fi, so each press is a real HTTPS <span className="mono">POST /hardware/pos-tap</span> that
            writes into FalkorDB and can raise alerts. {last ? "The OLED and LEDs above mirror the latest tap from a Wokwi device." : ""}
          </p>
        </Card>

        <Card title="Run it in Wokwi" action={<a href={REPO} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-cyan">hardware/wokwi on GitHub ↗</a>}>
          <ol className="space-y-5">
            {steps.map((s) => (
              <li key={s.n} className="flex gap-3.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-deep text-sm font-bold text-white">{s.n}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.title}</p>
                  <p className="mt-0.5 text-[13px] text-muted">{s.body}</p>
                  <div className="mt-2.5">{s.actions}</div>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-5 border-t border-line pt-3 text-[11.5px] text-muted">
            Why not inside this page: Wokwi only embeds projects saved to an account, so the simulator runs in its own tab and reports back here through the API.
          </p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col overflow-hidden rounded-[22px] bg-[#050d1f] shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
            <span className={`size-2 rounded-full ${last ? "bg-[#3ee08f] pulse-soft" : "bg-white/30"}`} />
            <h2 className="text-[15px] font-medium text-white">Serial monitor</h2>
            <span className="rounded-md bg-white/10 px-1.5 py-px text-[10.5px] font-medium text-sky">source = wokwi</span>
            <span className="ml-auto text-[11px] text-white/50">{last ? `last device tap ${ago(last.ts)}` : "no device taps yet"} · polls every 4 s</span>
          </div>
          <div className="scroll-thin mono h-[360px] overflow-y-auto px-4 py-3 text-[11.5px] leading-relaxed">
            {log.length ? log.map((l, i) => (
              <div key={i} className="mb-2">
                <p>
                  <span className="text-white/35">[{hms(l.ts)}]</span>{" "}
                  <span className="text-sky">{l.device_id}</span> <span className="text-white">{l.card}</span>{" "}
                  <span className="text-white/55">ATC={l.atc} GPS={l.gps?.join(",")}</span>{" -> "}
                  <span className={l.response.startsWith("00") ? "text-[#3ee08f]" : "text-[#ff8a8d]"}>{l.response}</span>
                  {l.alerts.length > 0 && <span className="text-[#f5b84a]">  ALERT {l.alerts.map((a: any) => a.rule).join(",")}</span>}
                </p>
                <p className="truncate pl-4 text-white/40" title={l.iso8583.fields["55"]}>55={l.iso8583.fields["55"]}</p>
              </div>
            )) : <p className="text-white/45">waiting for a Wokwi device…</p>}
          </div>
          <div className="border-t border-white/10 px-4 py-3">
            <p className="text-[11px] text-white/50">Test the pipeline without the simulator: these send the same JSON the sketch sends, labelled as a Wokwi device.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {["CARD-A", "CARD-B", "CARD-C"].map((c) => (
                <button key={c} disabled={busy} onClick={() => sendAsDevice(c, false)}
                  className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/85 hover:bg-white/10 disabled:opacity-40">Send {c} as D00063</button>
              ))}
              <button disabled={busy} onClick={() => sendAsDevice("CARD-A", true)}
                className="rounded-full border border-[#f5b84a]/60 px-3 py-1 text-xs font-medium text-[#f5b84a] hover:bg-[#f5b84a]/10 disabled:opacity-40">Send CARD-A as ATM A00091 (clone)</button>
            </div>
          </div>
        </section>

        <div className="min-w-0 space-y-2">
          <CodeFiles files={[
            { name: "sketch.ino", lang: "Arduino C++", code: SKETCH_INO, note: "Posts each tap to https://bankweave-api.onrender.com/hardware/pos-tap and prints field 55 to the serial monitor." },
            { name: "diagram.json", lang: "Wokwi diagram", code: DIAGRAM_JSON, note: "Parts and wiring: buttons on GPIO 25/26/27/14, OLED on I2C 21/22, LEDs on GPIO 4/5." },
            { name: "libraries.txt", lang: "Library Manager", code: LIBRARIES_TXT },
          ]} />
          <p className="px-1 text-[11px] text-muted">Same files as <a className="link" href={REPO} target="_blank" rel="noreferrer">hardware/wokwi</a> in the repository.</p>
        </div>
      </div>
    </div>
  );
}
