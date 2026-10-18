"use client";
import { useEffect, useRef, useState } from "react";
import { Chip } from "@/components/ui";

/** Screen recordings of third-party sites reading BankWeave's output. Files live in
 *  public/media/hw/; a missing file degrades to a link-only card. */
export const MEDIA = [
  {
    file: "/media/hw/wokwi-esp32.gif", site: "Wokwi", host: "wokwi.com/projects/new/esp32", href: "https://wokwi.com/projects/new/esp32",
    title: "The ESP32 terminal running in Wokwi",
    caption: "hardware/wokwi/sketch.ino on a simulated ESP32-DevKitC. Each button press is an HTTPS POST to /hardware/pos-tap; the OLED shows the response and the serial monitor prints the card, the ISO 8583 response and EMV field 55.",
  },
  {
    file: "/media/hw/emvlab-decode.gif", site: "EMVLab.org", host: "emvlab.org/tlvutils", href: "https://emvlab.org/tlvutils/",
    title: "EMVLab.org decodes our field 55",
    caption: "The EMV TLV from a live terminal tap pasted into EMVLab's BER-TLV decoder: amount 9F02, IFD serial 9F1E, application transaction counter 9F36 and cryptogram information data 9F27 = 80 parse cleanly.",
  },
  {
    file: "/media/hw/webauthn-debugger.gif", site: "webauthn.me", host: "webauthn.me/debugger", href: "https://webauthn.me/debugger",
    title: "webauthn.me inspects our FIDO2 assertion",
    caption: "A passkey assertion from an approval signature, decoded by Auth0's WebAuthn debugger: the clientDataJSON challenge is the case Merkle root, the origin is the BankWeave site, and authenticatorData carries the flags and signature counter.",
  },
  {
    file: "/media/hw/falkordb-browser.gif", site: "FalkorDB Cloud", host: "app.falkordb.cloud", href: "https://app.falkordb.cloud",
    title: "FalkorDB Cloud shows the signed approval",
    caption: "The case graph in the FalkorDB Cloud browser: the (:HardwareAttestation) node that /hardware/attest writes after verifying the ES256 signature, linked by [:ATTESTS] to the approved (:Action).",
  },
] as const;

type Media = (typeof MEDIA)[number];

function Dots() {
  return (
    <span className="flex gap-1.5" aria-hidden>
      <i className="size-[11px] rounded-full bg-[#ff5f57]" /><i className="size-[11px] rounded-full bg-[#febc2e]" /><i className="size-[11px] rounded-full bg-[#28c840]" />
    </span>
  );
}

export function MediaCard({ m }: { m: Media }) {
  const ref = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  // an image that failed before hydration never fires onError, so check it once mounted
  useEffect(() => {
    const img = ref.current;
    if (img?.complete) setState(img.naturalWidth > 0 ? "ok" : "missing");
  }, []);
  return (
    <article className="glass flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line bg-[#f8fafc] px-3.5 py-2.5">
        <Dots />
        <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-[11.5px] text-muted">
          <svg viewBox="0 0 24 24" className="size-3 shrink-0 text-ok" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden><path d="M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" /></svg>
          <span className="mono truncate">{m.host}</span>
        </span>
        <Chip tone="ok" className="hidden shrink-0 sm:inline-flex">real site</Chip>
      </div>
      <div className="relative aspect-[16/10] bg-[#0b1730]">
        {state !== "missing" && (
          <a href={m.file} target="_blank" rel="noreferrer" className="block size-full" aria-label={`Open the ${m.site} recording full size`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- plain img so the GIF animates */}
            <img ref={ref} src={m.file} alt={m.title} loading="lazy" decoding="async"
              onLoad={() => setState("ok")} onError={() => setState("missing")}
              className={`size-full object-contain transition-opacity duration-500 ${state === "ok" ? "opacity-100" : "opacity-0"}`} />
          </a>
        )}
        {state === "loading" && <span className="pulse-soft absolute inset-0 grid place-items-center text-xs text-white/50">Loading recording…</span>}
        {state === "missing" && (
          <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(80%_70%_at_50%_0%,#123a70_0%,#0b1730_70%)] p-6 text-center">
            <div>
              <p className="text-sm font-medium text-white">Recording not included in this build</p>
              <p className="mx-auto mt-1 max-w-[34ch] text-xs text-white/60">Open {m.site} and check it live with data from this page.</p>
              <a href={m.href} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-deep hover:bg-sky">Open {m.site} ↗</a>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-[15.5px] font-semibold">{m.title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{m.caption}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <a href={m.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-deep px-3.5 py-1.5 text-xs font-semibold text-deep hover:bg-panel-2">Open {m.site} ↗</a>
          {state === "ok" && <a href={m.file} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-cyan">Full size</a>}
        </div>
      </div>
    </article>
  );
}

export default function VerifiedGallery() {
  return (
    <section id="verified" className="space-y-4 scroll-mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[24px] font-semibold" style={{ letterSpacing: "-0.03em" }}>Verified on real tools</h2>
          <p className="mt-1 max-w-[80ch] text-sm text-muted">
            Screen recordings of public third-party tools reading BankWeave&apos;s own output: the Wokwi simulator running our sketch,
            EMVLab decoding our TLV, webauthn.me decoding our assertion, and FalkorDB Cloud showing the node the signature writes.
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {MEDIA.map((m) => <MediaCard key={m.file} m={m} />)}
      </div>
      <p className="text-xs text-muted">
        Also used as an external check: <a className="link" href="https://www.opensanctions.org/" target="_blank" rel="noreferrer">OpenSanctions ↗</a> for
        sanctions matches on case pages, and Chrome&apos;s <a className="link" href="https://developer.chrome.com/docs/devtools/webauthn" target="_blank" rel="noreferrer">virtual authenticator ↗</a> for
        WebAuthn without a physical key.
      </p>
    </section>
  );
}
