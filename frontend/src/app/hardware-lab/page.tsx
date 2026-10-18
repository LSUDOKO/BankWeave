"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { get, post } from "@/lib/api";

const TABS = ["Card terminals", "Wokwi circuit", "Approval signing", "Enclave", "Private set intersection"] as const;
type Tab = (typeof TABS)[number];

export default function HardwareLab() {
  const [tab, setTab] = useState<Tab>("Card terminals");
  return (
    <div className="space-y-5">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1>Hardware Lab</h1>
          <span className="badge text-verify">simulated devices · real cryptography</span>
        </div>
        <p className="mt-1.5 max-w-[80ch] text-muted">
          Where money and approvals touch hardware: card terminals that emit ISO 8583 / EMV data into the graph, a passkey
          that signs the evidence an approval rests on, an enclave that holds the consortium&apos;s blinding key, and private
          set intersection between banks. Devices are simulated at $0; signatures, hashes and key exchange are real.
        </p>
      </header>
      <div role="tablist" className="flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 border ${tab === t ? "border-cyan text-paper bg-panel-2" : "border-line text-muted hover:text-paper"}`}>{t}</button>
        ))}
      </div>
      {tab === "Card terminals" && <Terminals />}
      {tab === "Wokwi circuit" && <Wokwi />}
      {tab === "Approval signing" && <Signing />}
      {tab === "Enclave" && <EnclavePanel />}
      {tab === "Private set intersection" && <Psi />}
    </div>
  );
}

function Terminals() {
  const [twin, setTwin] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => get("/hardware/twin").then((t) => { setTwin(t); setSel((s: any) => s ?? t.log?.[0] ?? null); }).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setMsg(null);
    try { const r = await fn(); setSel(r.steps ? r.steps[r.steps.length - 1] : r); if (r.title) setMsg(`${r.title}: ${r.alerts.length} alert(s) raised`); }
    catch (e: any) { setMsg(e.message); }
    setBusy(false); load();
  };
  if (!twin) return <p className="text-muted">{msg ?? "Loading terminals…"}</p>;
  return (
    <section className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        {Object.entries<any>(twin.terminals).map(([id, t]) => (
          <div key={id} className="glass p-4">
            <div className="flex items-center justify-between">
              <h2 className="mono text-base">{id}</h2>
              <span className="badge text-cyan">{t.kind} · {t.city}</span>
            </div>
            <p className="mt-1 text-xs text-muted">IFD serial {t.ifd} (9F1E) · device {t.device} in the graph · merchant {t.merchant}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {twin.cards.map((c: any) => (
                <button key={c.card} disabled={busy}
                  onClick={() => run(() => post("/hardware/pos-tap", { terminal_id: id, card_id: c.card, amount: t.kind === "ATM" ? 20000 : 9500, clone: false }))}
                  className="rounded-md border border-line px-2.5 py-1.5 text-xs hover:border-cyan disabled:opacity-50">
                  Tap {c.card} <span className="text-muted">{c.pan_masked}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="glass p-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted">Presets</span>
        <button disabled={busy} onClick={() => run(() => post("/hardware/preset/mule_ring"))} className="rounded-md bg-ring/10 border border-ring text-ring px-3 py-1.5 text-sm disabled:opacity-50">Mule card-swiping ring on shared POS D00063</button>
        <button disabled={busy} onClick={() => run(() => post("/hardware/preset/impossible_travel"))} className="rounded-md bg-verify/10 border border-verify text-verify px-3 py-1.5 text-sm disabled:opacity-50">Cloned EMV: Mumbai → Delhi in 25 min</button>
        {msg && <span className="text-sm">{msg} · <Link href="/alerts" className="link">alert queue</Link></span>}
      </div>
      <p className="text-xs text-muted">Cards belong to accounts in the consortium graph: {twin.cards.map((c: any) => `${c.card} → ${c.account.slice(0, 10)} (bank ${c.bank})`).join(" · ")}. Taps write <span className="mono">CARD_TXN</span> edges and link the account to the terminal&apos;s <span className="mono">Device</span>, so the agents&apos; shared-identity tools see the shared POS.</p>
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="glass p-3">
          <h3 className="mb-2">Transaction log</h3>
          <ol className="space-y-1 text-xs max-h-[520px] overflow-y-auto scroll-thin">
            {twin.log.map((l: any, i: number) => (
              <li key={i}>
                <button onClick={() => setSel(l)} className={`w-full text-left rounded px-2 py-1.5 hover:bg-panel-2 ${sel === l ? "bg-panel-2" : ""}`}>
                  <span className={l.alerts.length ? "text-ring" : "text-ok"}>{l.response.split(" ")[0]}</span>{" "}
                  <span className="mono">{l.card}</span> at {l.city} · INR {l.amount.toLocaleString()} · ATC {l.atc}{l.clone ? " · clone" : ""}
                  {l.alerts.map((a: any) => <span key={a.id} className="block text-verify">{a.rule}</span>)}
                </button>
              </li>
            ))}
            {!twin.log.length && <li className="text-muted">No taps yet.</li>}
          </ol>
        </div>
        {sel && (
          <div className="glass p-4 space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3>ISO 8583 {sel.iso8583.mti}</h3>
              <span className={`badge ${sel.alerts.length ? "text-ring" : "text-ok"}`}>{sel.response}</span>
              <span className="ml-auto flex gap-3 text-xs">
                <button className="link" onClick={() => { navigator.clipboard?.writeText(sel.iso8583.fields["55"]); window.open("https://emvlab.org/tlvutils/", "_blank"); }}>Copy TLV &amp; verify on EMVLab.org ↗</button>
                <a href="https://emvlab.org/cryptogram/" target="_blank" rel="noreferrer" className="link">Cryptogram tool ↗</a>
              </span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <table className="text-xs mono">
                <tbody>{Object.entries<string>(sel.iso8583.fields).filter(([k]) => k !== "55").map(([k, v]) => (
                  <tr key={k}><td className="pr-3 text-muted">DE {k}</td><td>{v}</td></tr>
                ))}</tbody>
              </table>
              <table className="text-xs">
                <thead className="text-muted text-left"><tr><th className="font-normal pr-2">Tag</th><th className="font-normal pr-2">Value</th><th className="font-normal">Meaning</th></tr></thead>
                <tbody>{sel.emv.map((t: any) => (
                  <tr key={t.tag}><td className="mono pr-2 text-cyan">{t.tag}</td><td className="mono pr-2 break-all">{t.value}</td><td className="text-muted">{t.name}</td></tr>
                ))}</tbody>
              </table>
            </div>
            {sel.nfc_uid && (
              <div className="grid gap-2 sm:grid-cols-4 text-xs">
                {[["NFC UID", sel.nfc_uid], ["EMV ATC (9F36)", String(sel.atc)], ["GPS", sel.gps?.join(", ")], ["Terminal IMEI / MAC", `${sel.imei} · ${sel.mac}`]].map(([k, v]) => (
                  <div key={k} className="glass-2 p-2"><p className="text-muted">{k}</p><p className="mono break-all">{v}</p></div>
                ))}
              </div>
            )}
            <div><p className="text-xs text-muted mb-1">Field 55 (EMV TLV, hex) · written to FalkorDB as <span className="mono">(:Account)-[:USES_DEVICE {"{"}emv_atc, terminal_id, gps{"}"}]-&gt;(:Device {"{"}id:&apos;{sel.device_id ?? "D00063"}&apos;{"}"})</span> and a <span className="mono">CARD_TXN</span> edge</p><pre className="mono text-[11px] rounded bg-ink/70 p-2 break-all whitespace-pre-wrap">{sel.iso8583.fields["55"]}</pre></div>
            {sel.alerts.map((a: any) => <p key={a.id} className="text-sm text-verify">Alert {a.id} ({a.rule}): {a.reason}</p>)}
          </div>
        )}
      </div>
    </section>
  );
}

function Wokwi() {
  const [log, setLog] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => get("/hardware/twin").then((t) => setLog(t.wokwi_log ?? [])).catch(() => {}), []);
  useEffect(() => { load(); const id = setInterval(load, 4000); return () => clearInterval(id); }, [load]);
  // the exact JSON the ESP32 sketch posts, so the pipeline can be checked without opening Wokwi
  const sendAsDevice = async (card: string, atm: boolean) => {
    setBusy(true);
    try {
      await post("/hardware/pos-tap", { terminal_id: atm ? "ATM-DEL-A00091" : "POS-MUM-D00063", card_id: card, amount: atm ? 20000 : 9650,
        clone: atm, source: "wokwi", device_id: atm ? "A00091" : "D00063", gps: atm ? [28.6139, 77.209] : [19.076, 72.8777] });
    } catch { /* shown in the log */ }
    setBusy(false); load();
  };
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="glass p-4 space-y-3 text-sm">
        <h2>ESP32 card terminal in the Wokwi simulator</h2>
        <p className="text-muted">ESP32-DevKitC v4, SSD1306 OLED, three card buttons, a POS/ATM switch and two LEDs. Wokwi gives the simulated board real internet through its <span className="mono">Wokwi-GUEST</span> Wi-Fi, so each press is a real HTTPS <span className="mono">POST /hardware/pos-tap</span> that writes into FalkorDB and can raise alerts.</p>
        <Circuit />
        <ol className="list-decimal pl-5 space-y-1 text-xs">
          <li>Open <a className="link" href="https://wokwi.com/projects/new/esp32" target="_blank" rel="noreferrer">wokwi.com/projects/new/esp32 ↗</a> and paste <span className="mono">sketch.ino</span>, <span className="mono">diagram.json</span>, <span className="mono">libraries.txt</span> from <a className="link" href="https://github.com/LSUDOKO/BankWeave/tree/main/hardware/wokwi" target="_blank" rel="noreferrer">hardware/wokwi ↗</a>.</li>
          <li>Press play; press Card A, B, C within a minute (shared-terminal ring), then switch to ATM and press Card A (cloned card).</li>
          <li>Taps from the board appear in the serial monitor here within seconds.</li>
        </ol>
      </div>
      <div className="glass p-4 space-y-2 text-sm min-w-0">
        <div className="flex items-center gap-2"><h2>Serial monitor (taps from Wokwi devices)</h2><span className="badge text-cyan">source = wokwi</span></div>
        <div className="flex flex-wrap gap-2 text-xs">
          {["CARD-A", "CARD-B", "CARD-C"].map((c) => <button key={c} disabled={busy} onClick={() => sendAsDevice(c, false)} className="rounded border border-line px-2 py-1 hover:border-cyan">Send {c} as device D00063</button>)}
          <button disabled={busy} onClick={() => sendAsDevice("CARD-A", true)} className="rounded border border-verify text-verify px-2 py-1">Send CARD-A as ATM A00091 (clone)</button>
        </div>
        <p className="text-[11px] text-muted">The buttons send the same JSON the sketch sends, labelled as a Wokwi device, to test the pipeline without the simulator.</p>
        <pre className="mono text-[11px] rounded bg-black/80 text-ok p-3 h-[340px] overflow-y-auto">{log.length ? log.map((l) =>
          `[${new Date(l.ts * 1000).toISOString().slice(11, 19)}] ${l.device_id} ${l.card} ATC=${l.atc} GPS=${l.gps?.join(",")} -> ${l.response}${l.alerts.length ? "  ALERT " + l.alerts.map((a: any) => a.rule).join(",") : ""}\n  55=${l.iso8583.fields["55"].slice(0, 72)}…`).join("\n") : "waiting for a Wokwi device…"}</pre>
      </div>
    </section>
  );
}

function Circuit() {
  const pin = (x: number, y: number, label: string, color: string) => (
    <g key={label}><line x1={x} y1={y} x2={150} y2={y} stroke={color} strokeWidth="2" /><text x={x - 4} y={y + 3} fontSize="9" fill="#94a3b8" textAnchor="end">{label}</text></g>
  );
  return (
    <svg viewBox="0 0 420 190" className="w-full rounded-lg bg-[#0a1424] border border-line" role="img" aria-label="Wokwi circuit diagram">
      <rect x="150" y="30" width="90" height="130" rx="6" fill="#1e293b" stroke="#475569" />
      <text x="195" y="100" fontSize="11" fill="#e2e8f0" textAnchor="middle" fontFamily="monospace">ESP32</text>
      <text x="195" y="114" fontSize="8" fill="#94a3b8" textAnchor="middle">DevKitC v4</text>
      {pin(95, 50, "Card A · GPIO25", "#56b4e9")}{pin(95, 72, "Card B · GPIO26", "#56b4e9")}{pin(95, 94, "Card C · GPIO27", "#56b4e9")}{pin(95, 116, "POS/ATM · GPIO14", "#f59e0b")}
      <line x1="240" y1="50" x2="300" y2="50" stroke="#10b981" strokeWidth="2" /><line x1="240" y1="62" x2="300" y2="62" stroke="#06b6d4" strokeWidth="2" />
      <rect x="300" y="30" width="100" height="50" rx="4" fill="#020617" stroke="#475569" />
      <text x="350" y="52" fontSize="9" fill="#e2e8f0" textAnchor="middle" fontFamily="monospace">SSD1306</text><text x="350" y="66" fontSize="8" fill="#94a3b8" textAnchor="middle">I2C 0x3C</text>
      <line x1="240" y1="120" x2="300" y2="120" stroke="#10b981" strokeWidth="2" /><circle cx="310" cy="120" r="7" fill="#10b981" /><text x="324" y="123" fontSize="9" fill="#94a3b8">GPIO4 approved</text>
      <line x1="240" y1="145" x2="300" y2="145" stroke="#ef4444" strokeWidth="2" /><circle cx="310" cy="145" r="7" fill="#ef4444" /><text x="324" y="148" fontSize="9" fill="#94a3b8">GPIO5 refer</text>
      <text x="195" y="180" fontSize="9" fill="#06b6d4" textAnchor="middle">Wokwi-GUEST Wi-Fi → HTTPS POST /hardware/pos-tap</text>
    </svg>
  );
}

const enc = (s: string) => new TextEncoder().encode(s);
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
const hexBytes = (h: string) => new Uint8Array(h.match(/.{2}/g)!.map((x) => parseInt(x, 16)));

let vault: { keys: CryptoKeyPair; spki: string; counter: number } | null = null;

function Signing() {
  const [cases, setCases] = useState<any[]>([]);
  const [caseId, setCaseId] = useState("");
  const [ch, setCh] = useState<any>(null);
  const [target, setTarget] = useState("");
  const [receipt, setReceipt] = useState<any>(null);
  const [seal, setSeal] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { get("/cases").then((d) => { setCases(d.cases); if (d.cases[0]) setCaseId(d.cases[0].id); }).catch((e) => setErr(e.message)); }, []);
  const loadCase = useCallback(() => {
    if (!caseId) return;
    get(`/hardware/challenge/${caseId}`).then((c) => { setCh(c); setTarget(c.targets.find((t: any) => t.type === "Action")?.id ?? c.targets[0]?.id ?? ""); }).catch((e) => setErr(e.message));
    get(`/hardware/seal/${caseId}`).then(setSeal).catch(() => {});
  }, [caseId]);
  useEffect(() => { setReceipt(null); loadCase(); }, [loadCase]);

  const submit = async (method: string, assertion: any) => {
    const r = await post("/hardware/attest", { case_id: caseId, target, method, merkle_root: ch.merkle_root, assertion });
    setReceipt(r); loadCase();
  };
  const passkey = async () => {
    setErr(null);
    try {
      const challenge = hexBytes(ch.merkle_root);
      const cred: any = await navigator.credentials.create({ publicKey: {
        challenge, rp: { name: "BankWeave" }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "analyst", displayName: "BankWeave analyst" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }], authenticatorSelection: { userVerification: "preferred" }, attestation: "none", timeout: 60000 } });
      const pk = cred.response.getPublicKey?.();
      if (!pk) throw new Error("This browser cannot export the passkey's public key; use VaultKey.");
      const a: any = await navigator.credentials.get({ publicKey: { challenge, allowCredentials: [{ type: "public-key", id: cred.rawId }], userVerification: "preferred", timeout: 60000 } });
      await submit("webauthn", {
        public_key: b64(pk), signature: b64(a.response.signature), authenticator_data: b64(a.response.authenticatorData),
        client_data_json: b64(a.response.clientDataJSON), credential_id: b64(cred.rawId),
        registration_authenticator_data: cred.response.getAuthenticatorData ? b64(cred.response.getAuthenticatorData()) : undefined,
        device: "WebAuthn authenticator" });
    } catch (e: any) { setErr(e.data?.detail ?? e.message); }
  };
  const vaultKey = async () => {
    setErr(null);
    try {
      if (!vault) {
        const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
        vault = { keys, spki: b64(await crypto.subtle.exportKey("spki", keys.publicKey)), counter: 0 };
      }
      vault.counter += 1;
      const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vault.keys.privateKey, enc(ch.merkle_root));
      await submit("vaultkey", { public_key: vault.spki, signature: b64(sig), counter: vault.counter, origin: location.origin, device: "VaultKey FIPS (virtual)" });
    } catch (e: any) { setErr(e.data?.detail ?? e.message); }
  };
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="glass p-4 space-y-3 text-sm">
        <h2>Sign an approval over the evidence</h2>
        <p className="text-muted">The approver signs the case&apos;s Merkle root: one hash over every claim, piece of evidence (with its query and state) and report sentence. If any of it changes later, the signature no longer matches and the seal breaks.</p>
        <div className="flex flex-wrap gap-2">
          <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className="rounded bg-ink border border-line px-2 py-1 mono text-xs">
            {cases.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.title?.slice(0, 40)}</option>)}
          </select>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="rounded bg-ink border border-line px-2 py-1 mono text-xs">
            {ch?.targets.map((t: any) => <option key={t.id} value={t.id}>{t.type} {t.id} ({t.kind})</option>)}
          </select>
        </div>
        {ch && <p className="text-xs">Merkle root <span className="mono text-cyan break-all">{ch.merkle_root}</span> <span className="text-muted">({ch.leaves} records)</span></p>}
        <div className="flex flex-wrap gap-2">
          <button onClick={passkey} disabled={!ch || !target} className="rounded-md bg-cyan/15 border border-cyan text-cyan px-3 py-1.5 disabled:opacity-40">Sign with passkey (WebAuthn)</button>
          <button onClick={vaultKey} disabled={!ch || !target} className="rounded-md border border-line px-3 py-1.5 hover:border-cyan disabled:opacity-40">Sign with VaultKey FIPS (virtual)</button>
        </div>
        <p className="text-xs text-muted">No passkey device? Chrome DevTools → More tools → WebAuthn → “Enable virtual authenticator environment” (<a className="link" href="https://developer.chrome.com/docs/devtools/webauthn" target="_blank" rel="noreferrer">guide</a>). VaultKey is a simulated security key: a non-extractable WebCrypto P-256 key in this tab.</p>
        {err && <p className="text-ring">{err}</p>}
      </div>
      <div className="space-y-4">
        {receipt && (
          <div className="glass p-4 text-sm border-ok/50">
            <h3 className="text-ok">Signature verified by the server</h3>
            <dl className="mt-2 grid grid-cols-[130px_1fr] gap-y-1 text-xs">
              <dt className="text-muted">Attestation</dt><dd className="mono">{receipt.id} → {receipt.target}</dd>
              <dt className="text-muted">Method</dt><dd>{receipt.method}</dd>
              <dt className="text-muted">Algorithm</dt><dd>{receipt.alg}</dd>
              <dt className="text-muted">Merkle root</dt><dd className="mono break-all">{receipt.merkle_root}</dd>
              <dt className="text-muted">AAGUID</dt><dd className="mono">{receipt.aaguid ?? "–"}</dd>
              <dt className="text-muted">Counter</dt><dd>{receipt.counter}</dd>
              {receipt.user_verified != null && <><dt className="text-muted">User verified</dt><dd>{String(receipt.user_verified)}</dd></>}
            </dl>
            <p className="mt-2 text-xs text-muted">Inspect WebAuthn payloads at <a className="link" href="https://webauthn.me/debugger" target="_blank" rel="noreferrer">webauthn.me/debugger</a>.</p>
          </div>
        )}
        <div className="glass p-4 text-sm">
          <h3>Seals on this case</h3>
          {!seal?.attestations?.length && <p className="mt-1 text-muted">No signatures yet.</p>}
          <ul className="mt-2 space-y-1.5 text-xs">
            {seal?.attestations?.map((a: any) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <span className={`badge ${a.intact ? "text-ok" : "text-ring"}`}>{a.intact ? "seal intact" : "Merkle seal broken"}</span>
                <span className="mono">{a.id}</span> {a.method} on {a.target} · root {a.merkle_root.slice(0, 12)}…
              </li>
            ))}
          </ul>
          {seal?.broken?.length > 0 && <p className="mt-2 text-xs text-ring">Evidence changed after signing: the current root {seal.current_root.slice(0, 12)}… no longer matches. Re-review and sign again.</p>}
          {caseId && <p className="mt-2 text-xs text-muted">Revoke a piece of evidence on the <Link className="link" href={`/cases/${caseId}`}>case page</Link> and come back: the seal breaks.</p>}
        </div>
      </div>
    </section>
  );
}

function EnclavePanel() {
  const [a, setA] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => get("/hardware/enclave").then(setA);
  useEffect(() => { load(); }, []);
  const act = async (path: string) => { setBusy(true); await post(path); await load(); setBusy(false); };
  if (!a) return <p className="text-muted">Attesting…</p>;
  const ok = a.status === "ATTESTED";
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="glass p-4 space-y-3 text-sm">
        <div className="flex items-center gap-2"><h2>Consortium enclave</h2><span className={`badge ${ok ? "text-ok" : "text-ring"}`}>{a.status}</span></div>
        <p className="text-muted">The enclave holds the key that turns bank account ids into consortium ids (HMAC-SHA256). Before it blinds anything it measures its own code (PCR0, SHA-384) and compares it with the value recorded at boot. A changed image means a compromised enclave: it quarantines itself and stops blinding.</p>
        <table className="w-full text-xs">
          <thead className="text-muted text-left"><tr><th className="font-normal">PCR</th><th className="font-normal">Measured</th><th className="font-normal">Match</th></tr></thead>
          <tbody>{Object.entries<string>(a.document.pcrs).map(([k, v]) => (
            <tr key={k} className="border-t border-line/40"><td className="py-1">PCR{k}</td><td className="py-1 mono">{v.slice(0, 32)}…</td><td className={v === a.reference_pcrs[k] ? "text-ok" : "text-ring"}>{v === a.reference_pcrs[k] ? "yes" : "NO"}</td></tr>
          ))}</tbody>
        </table>
        {!ok && <p className="text-ring">{a.reason}. Blinding and PSI are refused until reset.</p>}
        <div className="flex gap-2">
          <button disabled={busy || !ok} onClick={() => act("/hardware/enclave-tamper")} className="rounded-md bg-ring/10 border border-ring text-ring px-3 py-1.5 disabled:opacity-40">Simulate PCR0 memory tamper</button>
          <button disabled={busy || ok} onClick={() => act("/hardware/enclave-reset")} className="rounded-md border border-line px-3 py-1.5 hover:border-cyan disabled:opacity-40">Reset enclave hardware root</button>
        </div>
        {a.hsm && (
          <dl className="grid grid-cols-[150px_1fr] gap-y-1 text-xs">
            <dt className="text-muted">HSM interface</dt><dd>{a.hsm.interface}</dd>
            <dt className="text-muted">PKCS#11 slot</dt><dd className="mono">{a.hsm.pkcs11_slot_id}</dd>
            <dt className="text-muted">Signer fingerprint</dt><dd className="mono">{a.hsm.enclave_signer_fingerprint}</dd>
            <dt className="text-muted">Blinding key</dt><dd>{a.hsm.key}</dd>
          </dl>
        )}
        {a.bank_links && <BankLinks links={a.bank_links} ok={ok} />}
        <p className="text-xs text-muted">Each attestation is recorded as an <span className="mono">(:EnclaveAttestation)</span> node in the consortium graph ({a.history?.length ?? 0} recent).</p>
      </div>
      <div className="glass p-4 text-xs">
        <h3 className="text-sm">Attestation document (AWS Nitro-style schema, ES384-signed, SIMULATED)</h3>
        <pre className="mt-2 mono rounded bg-ink/70 p-2 overflow-auto max-h-[460px]">{JSON.stringify({ ...a.document, signature_es384: a.signature_es384.slice(0, 48) + "…" }, null, 2)}</pre>
      </div>
    </section>
  );
}

function Psi() {
  const [banks, setBanks] = useState<string[]>([]);
  const [pair, setPair] = useState<[string, string]>(["", ""]);
  const [r, setR] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { get("/network/banks").then((b) => { setBanks(b.banks); setPair([b.banks[0], b.banks[1]]); }); }, []);
  const run = async () => { setBusy(true); try { setR(await post("/hardware/psi", { bank_a: pair[0], bank_b: pair[1] })); } catch (e: any) { setR({ error: e.message }); } setBusy(false); };
  return (
    <section className="glass p-4 space-y-3 text-sm">
      <div className="flex items-center gap-2"><h2>Private set intersection</h2><span className="badge text-cyan">ECDH-PSI · X25519</span></div>
      <p className="text-muted max-w-[80ch]">Two banks find which devices, IPs and addresses their customers share without revealing the rest. Each blinds hashed items with a secret Curve25519 scalar; blinding commutes, so only shared items collide.</p>
      <div className="flex flex-wrap gap-2 items-center">
        {[0, 1].map((i) => (
          <select key={i} value={pair[i]} onChange={(e) => setPair((p) => (i ? [p[0], e.target.value] : [e.target.value, p[1]]))} className="rounded bg-ink border border-line px-2 py-1 text-xs">
            {banks.map((b) => <option key={b} value={b}>Bank {b}</option>)}
          </select>
        ))}
        <button onClick={run} disabled={busy || pair[0] === pair[1]} className="rounded-md bg-cyan/15 border border-cyan text-cyan px-3 py-1 disabled:opacity-40">{busy ? "Running…" : "Run handshake"}</button>
      </div>
      {r?.error && <p className="text-ring">{r.error}</p>}
      {r && !r.error && (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="glass-2 p-3"><p className="text-xs text-muted">Bank {r.bank_a} items</p><p className="kpi text-2xl">{r.a_items}</p></div>
          <div className="glass-2 p-3"><p className="text-xs text-muted">Bank {r.bank_b} items</p><p className="kpi text-2xl">{r.b_items}</p></div>
          <div className="glass-2 p-3 border-ok/50"><p className="text-xs text-muted">Shared (only bank {r.bank_a} learns which)</p><p className="kpi text-2xl text-ok">{r.intersection}</p><p className="text-xs text-muted">{r.scalar_mults} scalar mults · {r.ms} ms</p></div>
          <div className="md:col-span-3 text-xs space-y-1">
            <p className="text-muted">{r.protocol}. {r.note}</p>
            <p>First shared items: <span className="mono">{r.a_learns.slice(0, 12).join(", ")}</span></p>
            <pre className="mono rounded bg-ink/70 p-2 overflow-x-auto">{JSON.stringify(r.transcript, null, 2)}</pre>
          </div>
        </div>
      )}
    </section>
  );
}

/** Bank graphs feeding the consortium through the enclave; severed while it is quarantined. */
function BankLinks({ links, ok }: { links: { bank: string; sync: string }[]; ok: boolean }) {
  const n = Math.max(1, links.length);
  return (
    <svg viewBox="0 0 420 150" className="w-full" role="img" aria-label="Bank sync links through the enclave">
      <rect x="160" y="10" width="100" height="34" rx="8" fill="#0f172a" stroke="#06b6d4" />
      <text x="210" y="31" fontSize="11" fill="#e2e8f0" textAnchor="middle" fontFamily="monospace">consortium</text>
      <rect x="175" y="62" width="70" height="26" rx="6" fill={ok ? "#10b98122" : "#ef444422"} stroke={ok ? "#10b981" : "#ef4444"} />
      <text x="210" y="79" fontSize="10" fill={ok ? "#10b981" : "#ef4444"} textAnchor="middle" fontFamily="monospace">{ok ? "enclave ✓" : "QUARANTINE"}</text>
      <line x1="210" y1="44" x2="210" y2="62" stroke={ok ? "#10b981" : "#ef4444"} strokeWidth="2" strokeDasharray={ok ? "" : "4 4"} />
      {links.map((l, i) => {
        const x = 20 + (i + 0.5) * (380 / n);
        const open = l.sync === "open";
        return (
          <g key={l.bank}>
            <line x1={x} y1="118" x2="210" y2="88" stroke={open ? "#10b981" : "#ef4444"} strokeWidth="1.5" strokeDasharray={open ? "" : "3 5"} opacity={open ? 0.8 : 0.9} />
            {!open && <text x={(x + 210) / 2} y="106" fontSize="11" fill="#ef4444" textAnchor="middle">✕</text>}
            <rect x={x - 26} y="118" width="52" height="22" rx="5" fill="#0f172a" stroke={open ? "#334155" : "#ef4444"} />
            <text x={x} y="133" fontSize="9" fill="#e2e8f0" textAnchor="middle" fontFamily="monospace">bank_{l.bank}</text>
          </g>
        );
      })}
    </svg>
  );
}
