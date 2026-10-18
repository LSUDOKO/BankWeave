"use client";
import { useEffect, useState } from "react";
import { get, post } from "@/lib/api";
import { btn, Card, Chip, StatCard } from "@/components/ui";
import { bankColor } from "./devices";

const field = "rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-cyan";

function Handshake({ a, b, ia, ib }: { a: string; b: string; ia: number; ib: number }) {
  return (
    <svg viewBox="0 0 360 120" className="w-full" role="img" aria-label={`ECDH-PSI between bank ${a} and bank ${b}`}>
      <defs><marker id="psi-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 10 5 0 10z" fill="#087cf8" /></marker></defs>
      <path d="M78 46 C 140 14, 220 14, 282 46" fill="none" stroke="#087cf8" strokeWidth="1.6" markerEnd="url(#psi-arrow)" />
      <path d="M282 74 C 220 106, 140 106, 78 74" fill="none" stroke="#087cf8" strokeWidth="1.6" strokeDasharray="5 4" markerEnd="url(#psi-arrow)" />
      <text x="180" y="18" fontSize="10" fill="#0c1a2e" textAnchor="middle" fontFamily="var(--font-jetbrains), monospace">a · H(x)</text>
      <text x="180" y="112" fontSize="10" fill="#0c1a2e" textAnchor="middle" fontFamily="var(--font-jetbrains), monospace">b · a · H(x), b · H(y)</text>
      {[[50, a, ia], [310, b, ib]].map(([x, name, i]) => (
        <g key={String(x)}>
          <circle cx={x as number} cy="60" r="30" fill={bankColor(i as number)} />
          <text x={x as number} y="57" fontSize="9" fill="rgba(255,255,255,.8)" textAnchor="middle">bank</text>
          <text x={x as number} y="70" fontSize="12" fontWeight="700" fill="#fff" textAnchor="middle" fontFamily="var(--font-jetbrains), monospace">{name}</text>
        </g>
      ))}
      <rect x="148" y="48" width="64" height="24" rx="12" fill="#eef3fa" stroke="#d6e1ee" />
      <text x="180" y="64" fontSize="9.5" fontWeight="600" fill="#0b2a5b" textAnchor="middle">X25519</text>
    </svg>
  );
}

/** DH private set intersection between two bank graphs. */
export default function Psi() {
  const [banks, setBanks] = useState<string[]>([]);
  const [pair, setPair] = useState<[string, string]>(["", ""]);
  const [r, setR] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { get("/network/banks").then((b) => { setBanks(b.banks); setPair([b.banks[0], b.banks[1]]); }).catch((e) => setR({ error: e.message })); }, []);
  const run = async () => { setBusy(true); try { setR(await post("/hardware/psi", { bank_a: pair[0], bank_b: pair[1] })); } catch (e: any) { setR({ error: e.message }); } setBusy(false); };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Private set intersection" action={<Chip tone="blue">ECDH-PSI · X25519</Chip>}>
          <p className="text-sm text-muted">
            Two banks find which devices, IPs and addresses their customers share without revealing the rest. Each blinds hashed items with a
            secret Curve25519 scalar; blinding commutes, so only shared items collide. The scalar multiplication is real; both banks run in one
            process here.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            {[0, 1].map((i) => (
              <label key={i} className="text-xs text-muted">{i ? "Bank B" : "Bank A"}
                <select value={pair[i]} onChange={(e) => setPair((p) => (i ? [p[0], e.target.value] : [e.target.value, p[1]]))} className={`${field} mono mt-1 block w-32`}>
                  {banks.map((b) => <option key={b} value={b}>Bank {b}</option>)}
                </select>
              </label>
            ))}
            <button onClick={run} disabled={busy || pair[0] === pair[1]} className={btn.primary}>{busy ? "Running…" : "Run handshake"}</button>
          </div>
          {r?.error && <p className="mt-3 text-sm text-ring">{r.error}</p>}
        </Card>
        <Card title="Protocol">
          <Handshake a={pair[0] || "A"} b={pair[1] || "B"} ia={Math.max(0, banks.indexOf(pair[0]))} ib={Math.max(0, banks.indexOf(pair[1]))} />
          <p className="mt-2 text-xs text-muted">Each bank hashes its items to Curve25519 points and blinds them with its secret scalar. Bank B re-blinds A&apos;s set in order and sends it back with its own blinded set; bank A blinds B&apos;s set with a and compares. a·b·H(x) equals b·a·H(y) only when x = y, so only shared items match and only bank A learns which.</p>
        </Card>
      </div>

      {r && !r.error && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label={`Bank ${r.bank_a} items`} value={r.a_items} sub="hashed and blinded" />
            <StatCard label={`Bank ${r.bank_b} items`} value={r.b_items} sub="hashed and blinded" i={1} />
            <StatCard filled label="Shared" value={r.intersection} chip={`${r.ms} ms`} sub={`only bank ${r.bank_a} learns which · ${r.scalar_mults} scalar mults`} i={2} />
          </div>
          <Card title="Result">
            <p className="text-sm text-muted">{r.protocol}. {r.note}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {r.a_learns.slice(0, 12).map((x: string) => <span key={x} className="mono rounded-md bg-panel-2 px-2 py-0.5 text-[11.5px]">{x}</span>)}
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-semibold text-deep">Handshake transcript</summary>
              <pre className="mono scroll-thin mt-2 max-h-[360px] overflow-auto rounded-2xl bg-[#071530] p-4 text-[11.5px] text-[#d6e4f5]">{JSON.stringify(r.transcript, null, 2)}</pre>
            </details>
          </Card>
        </>
      )}
    </div>
  );
}
