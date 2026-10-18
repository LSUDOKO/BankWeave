"use client";
import { useCallback, useEffect, useState } from "react";
import { get } from "@/lib/api";
import { Card, PageHeader, StatCard, Tabs } from "@/components/ui";
import Enclave from "@/components/hardware/Enclave";
import VerifiedGallery from "@/components/hardware/Gallery";
import Psi from "@/components/hardware/Psi";
import Signing from "@/components/hardware/Signing";
import Terminals from "@/components/hardware/Terminals";
import Wokwi from "@/components/hardware/Wokwi";

const TABS = [
  ["terminals", "Terminals"], ["key", "Security key"], ["enclave", "Enclave"], ["wokwi", "ESP32 on Wokwi"], ["psi", "PSI"],
] as const;
type Tab = (typeof TABS)[number][0];
const isTab = (s: string): s is Tab => TABS.some(([k]) => k === s);

const REAL: [string, string, string][] = [
  ["Card terminals", "BER-TLV encoding (decodes on EMVLab), ISO 8583 field layout, CARD_TXN and USES_DEVICE writes to FalkorDB, alerts the agents triage, impossible-travel and ATC-replay detection", "the terminals and cards; 9F26 is an HMAC, not a chip's 3DES/AES MAC"],
  ["ESP32 on Wokwi", "the circuit runs in the Wokwi simulator and makes real HTTPS posts to this API", "the board is a simulator"],
  ["Security key", "WebAuthn ES256 verification, signature counter, Merkle root over claims, evidence and sentences, seal break on revocation", "VaultKey is a WebCrypto key in this tab (WebAuthn can use a real key)"],
  ["Enclave / HSM", "HMAC-SHA256 blinding, SHA-384 PCRs, ES384-signed Nitro-style document, EnclaveAttestation nodes, ingestion refused with 423 while quarantined", "no TEE hardware or AWS Nitro PKI chain"],
  ["PSI", "X25519 scalar multiplication, commutative blinding", "both banks run in one process"],
];

export default function HardwareLab() {
  const [tab, setTab] = useState<Tab>("terminals");
  const [twin, setTwin] = useState<any>(null);
  const [twinErr, setTwinErr] = useState<string | null>(null);
  const [enc, setEnc] = useState<any>(null);

  const loadTwin = useCallback(() => get("/hardware/twin").then((t) => { setTwin(t); setTwinErr(null); }).catch((e) => setTwinErr(e.message)), []);
  const loadEnc = useCallback(() => get("/hardware/enclave").then(setEnc).catch(() => {}), []);
  useEffect(() => { loadTwin(); loadEnc(); }, [loadTwin, loadEnc]);
  // the serial log follows the Wokwi board while its tab is open
  useEffect(() => {
    if (tab !== "wokwi") return;
    const id = setInterval(loadTwin, 4000);
    return () => clearInterval(id);
  }, [tab, loadTwin]);

  // deep links: /hardware-lab#wokwi opens that tab
  useEffect(() => {
    const read = () => { const h = window.location.hash.slice(1); if (isTab(h)) setTab(h); };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const choose = (t: Tab) => { setTab(t); history.replaceState(null, "", `#${t}`); };

  const log: any[] = twin?.log ?? [];
  const alerted = log.filter((l) => l.alerts?.length).length;
  const ok = enc?.status === "ATTESTED";
  const links: any[] = enc?.bank_links ?? [];
  const open = links.filter((l) => l.sync === "open").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hardware Lab"
        sub="Where money and approvals touch hardware: card terminals that emit ISO 8583 / EMV data into the graph, a security key that signs the evidence an approval rests on, an enclave that holds the consortium's blinding key, and private set intersection between banks. The devices are simulated at $0; signatures, hashes and key exchange are real."
        actions={<>
          <span className="badge text-verify">simulated devices · real cryptography</span>
          <a href="#verified" className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-deep px-5 py-2.5 text-sm font-semibold text-deep hover:bg-white">Verified on real tools</a>
        </>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard filled label="Recent card taps" value={twin ? log.length : "–"} chip={`${alerted} alerted`} sub="POS and ATM twin, last 20" i={0} />
        <StatCard label="From the Wokwi ESP32" value={twin ? (twin.wokwi_log?.length ?? 0) : "–"} chip="source = wokwi" sub="taps posted by the simulated board" i={1} />
        <StatCard label="Enclave" value={<span className={`text-[34px] ${enc && !ok ? "text-ring" : ""}`}>{enc ? (ok ? "Attested" : "Quarantined") : "–"}</span>} chip="PCR0 · SHA-384" sub={enc ? (ok ? "measurement matches boot" : "blinding refused") : "attesting…"} i={2} />
        <StatCard label="Bank sync links" value={enc ? `${open}/${links.length}` : "–"} chip={enc ? (open === links.length ? "open" : "severed") : "–"} sub="bank graphs through the enclave" i={3} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onChange={choose} items={TABS.map(([k, label]) => [k, label] as [Tab, React.ReactNode])} />
        <p className="text-xs text-muted">API <span className="mono">/hardware/*</span> · {twinErr ? <span className="text-ring">unreachable</span> : twin ? "live" : "connecting…"}</p>
      </div>

      <div key={tab} className="fade-up">
        {tab === "terminals" && <Terminals twin={twin} error={twinErr} reload={loadTwin} />}
        {tab === "key" && <Signing />}
        {tab === "enclave" && <Enclave a={enc} reload={loadEnc} />}
        {tab === "wokwi" && <Wokwi twin={twin} reload={loadTwin} />}
        {tab === "psi" && <Psi />}
      </div>

      <VerifiedGallery />

      <Card title="What is real and what is simulated">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted"><tr><th className="pb-2 pr-4 font-normal">Piece</th><th className="pb-2 pr-4 font-normal">Real</th><th className="pb-2 font-normal">Simulated</th></tr></thead>
            <tbody>{REAL.map(([piece, real, sim]) => (
              <tr key={piece} className="border-t border-line align-top">
                <td className="py-2.5 pr-4 font-medium">{piece}</td>
                <td className="py-2.5 pr-4 text-[13px]"><span className="mr-1.5 inline-block size-2 rounded-full bg-ok align-middle" />{real}</td>
                <td className="py-2.5 text-[13px] text-muted"><span className="mr-1.5 inline-block size-2 rounded-full bg-verify align-middle" />{sim}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
