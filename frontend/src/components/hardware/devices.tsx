// Device drawings for the Hardware Lab. They are diagrams of the simulated devices, not photos:
// each one reflects live state passed in from the API (last tap, enclave status, sync links).

const BANK_COLORS = ["var(--bank-0)", "var(--bank-1)", "var(--bank-2)", "var(--bank-3)", "var(--bank-4)", "var(--bank-5)"];
export const bankColor = (i: number) => BANK_COLORS[((i % 6) + 6) % 6];

type Tap = { card: string; amount: number; atc: number; response: string; alerts?: unknown[] } | null | undefined;

const approved = (r?: string) => !!r && r.startsWith("00");

function Contactless({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
      <path d="M8.5 8.5a5 5 0 0 1 0 7M11.8 6.2a8.3 8.3 0 0 1 0 11.6M15.1 3.9a11.6 11.6 0 0 1 0 16.2M5.2 10.8a1.8 1.8 0 0 1 0 2.4" />
    </svg>
  );
}

/** A countertop POS or an ATM fascia, with its screen showing the last tap it processed. */
export function TerminalDevice({ id, kind, last }: { id: string; kind: string; last: Tap }) {
  const ok = last ? approved(last.response) : null;
  const atm = kind === "ATM";
  const light = ok == null ? "bg-white/15" : ok ? "bg-[#3ee08f] shadow-[0_0_8px_#3ee08f]" : "bg-[#ff5a5f] shadow-[0_0_8px_#ff5a5f]";
  return (
    <div className={`relative shrink-0 select-none rounded-[24px] bg-gradient-to-b from-[#1d3052] via-[#12223f] to-[#0a1630] p-2.5 shadow-[0_26px_40px_-26px_rgba(6,22,52,.95),inset_0_1px_0_rgba(255,255,255,.14)] ${atm ? "w-[178px]" : "w-[148px]"}`}
      role="img" aria-label={`${kind} ${id}: ${last ? last.response : "ready"}`}>
      <div className="flex items-center justify-between px-1.5 pb-2 pt-0.5">
        <span className="mono text-[8.5px] font-semibold tracking-wider text-white/45">{atm ? "ATM" : "POS"}</span>
        <span className="flex gap-1">{[0, 1, 2, 3].map((i) => <i key={i} className={`size-1.5 rounded-full ${light}`} />)}</span>
      </div>
      <div className="rounded-[13px] bg-[radial-gradient(120%_90%_at_20%_0%,#0f3566_0%,#06162f_70%)] p-2.5 ring-1 ring-black/50 shadow-[inset_0_0_18px_rgba(58,160,255,.18)]">
        <p className="mono truncate text-[8.5px] text-sky/80">{id}</p>
        <div className="my-1.5 h-px bg-sky/20" />
        <p className="mono truncate text-[8.5px] text-white/55">{last ? `${last.card} · ATC ${last.atc}` : "Present card"}</p>
        <p className="kpi mt-0.5 truncate text-[17px] leading-tight text-white">{last ? `INR ${Math.round(last.amount).toLocaleString("en-IN")}` : "INR --"}</p>
        <p className={`mono mt-1 truncate text-[8.5px] font-semibold ${ok == null ? "text-white/40" : ok ? "text-[#3ee08f]" : "text-[#ff8a8d]"}`}>{last ? last.response : "READY"}</p>
      </div>
      {atm ? (
        <div className="mt-2.5 space-y-2 px-1">
          <div className="flex items-center gap-2">
            <span className="h-[5px] flex-1 rounded-full bg-black/60 shadow-[inset_0_1px_2px_rgba(0,0,0,.8),0_0_6px_rgba(138,216,252,.35)]" />
            <Contactless className="size-4 text-sky/70" />
          </div>
          <span className="block h-[7px] rounded-[3px] bg-black/55 shadow-[inset_0_1px_3px_rgba(0,0,0,.9)]" />
        </div>
      ) : (
        <div className="mt-2.5 flex items-center justify-between px-1">
          <Contactless className="size-5 text-sky/70" />
          <span className="flex gap-1">
            <i className="h-[7px] w-5 rounded-[3px] bg-[#c94349]" /><i className="h-[7px] w-5 rounded-[3px] bg-[#d6a033]" /><i className="h-[7px] w-5 rounded-[3px] bg-[#2fa66c]" />
          </span>
        </div>
      )}
    </div>
  );
}

/** The virtual VaultKey: a USB-C security key whose gold ring pulses while it signs. */
export function SecurityKey({ active = false, done = false, className = "" }: { active?: boolean; done?: boolean; className?: string }) {
  const ring = done ? "#3ee08f" : "#d8aa45";
  return (
    <svg viewBox="0 0 230 84" className={className} role="img" aria-label="VaultKey security key (virtual)">
      <defs>
        <linearGradient id="sk-body" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#22385e" /><stop offset="1" stopColor="#0a1630" /></linearGradient>
        <linearGradient id="sk-metal" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e9eef4" /><stop offset=".5" stopColor="#aeb8c4" /><stop offset="1" stopColor="#d6dde6" /></linearGradient>
        <radialGradient id="sk-glow"><stop offset="0" stopColor={ring} stopOpacity=".55" /><stop offset="1" stopColor={ring} stopOpacity="0" /></radialGradient>
      </defs>
      <rect x="6" y="31" width="34" height="22" rx="7" fill="url(#sk-metal)" />
      <rect x="12" y="38" width="22" height="8" rx="4" fill="#5d6a7a" />
      <rect x="34" y="12" width="182" height="60" rx="30" fill="url(#sk-body)" />
      <rect x="34.5" y="12.5" width="181" height="59" rx="29.5" fill="none" stroke="rgba(255,255,255,.12)" />
      <text x="60" y="40" fontSize="13" fontWeight="700" fill="#ffffff" letterSpacing="-.2">VaultKey</text>
      <text x="60" y="54" fontSize="8.5" fill="#8ad8fc" fontFamily="var(--font-jetbrains), monospace">ES256 · virtual</text>
      {(active || done) && <circle cx="176" cy="42" r="30" fill="url(#sk-glow)" className={active ? "pulse-soft" : ""} />}
      <circle cx="176" cy="42" r="16" fill="#132748" stroke={ring} strokeWidth="4" className={active ? "pulse-soft" : ""} />
      <circle cx="176" cy="42" r="7" fill={ring} opacity=".18" />
      <circle cx="205" cy="42" r="4" fill="var(--ink)" />
    </svg>
  );
}

/** A secure-element package: green while attested, red when PCR0 no longer matches. */
export function EnclaveChip({ ok, className = "" }: { ok: boolean; className?: string }) {
  const c = ok ? "#3ee08f" : "#ff5a5f";
  const pins = Array.from({ length: 7 }, (_, i) => 30 + i * 10);
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label={ok ? "Enclave attested" : "Enclave quarantined"}>
      <defs>
        <linearGradient id="ec-body" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#1f3a66" /><stop offset="1" stopColor="#0a1a38" /></linearGradient>
        <radialGradient id="ec-glow"><stop offset="0" stopColor={c} stopOpacity=".35" /><stop offset="1" stopColor={c} stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#ec-glow)" className={ok ? "" : "pulse-soft"} />
      {pins.map((p) => (
        <g key={p} fill="#b9c4d2">
          <rect x={p - 2} y="12" width="4" height="10" rx="1" /><rect x={p - 2} y="98" width="4" height="10" rx="1" />
          <rect x="12" y={p - 2} width="10" height="4" rx="1" /><rect x="98" y={p - 2} width="10" height="4" rx="1" />
        </g>
      ))}
      <rect x="22" y="22" width="76" height="76" rx="10" fill="url(#ec-body)" stroke="rgba(255,255,255,.18)" />
      <rect x="36" y="36" width="48" height="48" rx="6" fill="none" stroke={c} strokeOpacity=".8" strokeDasharray="3 3" />
      <path d="M52 60v-5a8 8 0 0 1 16 0v5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <rect x="48" y="59" width="24" height="16" rx="3" fill={c} />
      <circle cx="29" cy="29" r="2" fill="rgba(255,255,255,.5)" />
    </svg>
  );
}

/** Bank graphs syncing into the consortium through the enclave; links break while it is quarantined. */
export function BankLinks({ links, ok }: { links: { bank: string; sync: string }[]; ok: boolean }) {
  const n = Math.max(1, links.length);
  const W = 520, cx = W / 2;
  const encC = ok ? "#3ee08f" : "#ff5a5f";
  return (
    <svg viewBox={`0 0 ${W} 214`} className="w-full" role="img" aria-label="Bank sync links through the enclave">
      <rect x={cx - 78} y="8" width="156" height="36" rx="18" fill="rgba(255,255,255,.08)" stroke="rgba(138,216,252,.55)" />
      <text x={cx} y="31" fontSize="12" fontWeight="600" fill="#fff" textAnchor="middle">consortium graph</text>
      <line x1={cx} y1="44" x2={cx} y2="78" stroke={encC} strokeWidth="2" strokeDasharray={ok ? "" : "4 4"} />
      {ok && <line x1={cx} y1="78" x2={cx} y2="44" stroke="#8ad8fc" strokeWidth="2" className="flow-dash" />}
      <rect x={cx - 82} y="78" width="164" height="34" rx="10" fill={ok ? "rgba(62,224,143,.14)" : "rgba(255,90,95,.16)"} stroke={encC} />
      <text x={cx} y="99" fontSize="11" fontWeight="700" fill={encC} textAnchor="middle" fontFamily="var(--font-jetbrains), monospace">{ok ? "ENCLAVE · ATTESTED" : "QUARANTINED"}</text>
      {links.map((l, i) => {
        const x = 34 + (i + 0.5) * ((W - 68) / n);
        const open = l.sync === "open";
        const d = `M${x} 166 C ${x} 140, ${cx} 140, ${cx} 112`;
        return (
          <g key={l.bank}>
            <path d={d} fill="none" stroke={open ? "rgba(138,216,252,.35)" : "#ff5a5f"} strokeWidth="1.6" strokeDasharray={open ? "" : "3 5"} />
            {open && <path d={d} fill="none" stroke="#8ad8fc" strokeWidth="1.6" className="flow-dash" />}
            {!open && (
              <g transform={`translate(${(x + cx) / 2} 140)`}>
                <circle r="7" fill="#2a0d14" stroke="#ff5a5f" />
                <path d="M-3 -3 3 3M3 -3-3 3" stroke="#ff5a5f" strokeWidth="1.6" strokeLinecap="round" />
              </g>
            )}
            <circle cx={x} cy="182" r="16" fill={bankColor(i)} stroke={open ? "rgba(255,255,255,.7)" : "#ff5a5f"} strokeWidth="1.5" opacity={open ? 1 : 0.55} />
            <text x={x} y="186" fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle" fontFamily="var(--font-jetbrains), monospace">{l.bank}</text>
            <text x={x} y="210" fontSize="9" fill={open ? "rgba(255,255,255,.6)" : "#ff8a8d"} textAnchor="middle">{open ? "sync open" : "severed"}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ESP32-DevKitC V4 header order, top to bottom, as on the real board
const LEFT = ["3V3", "EN", "VP", "VN", "34", "35", "32", "33", "25", "26", "27", "14", "12", "GND", "13", "D2", "D3", "CMD", "5V"];
const RIGHT = ["GND", "23", "22", "TX", "RX", "21", "GND", "19", "18", "5", "17", "16", "4", "0", "2", "15", "D1", "D0", "CLK"];
const PY = (i: number) => 56 + i * 14;

/** The Wokwi circuit from hardware/wokwi/diagram.json, wired pin for pin. The OLED shows what the
 *  sketch would print for the latest Wokwi tap, and the matching LED lights. */
export function WokwiCircuit({ terminal, screen, led }: { terminal: string; screen: [string, string, string]; led: "ok" | "refer" | null }) {
  const L = (name: string) => PY(LEFT.indexOf(name));
  const R = (name: string) => PY(RIGHT.indexOf(name));
  const usedL = new Set(["25", "26", "27", "14"]);
  const usedR = new Set(["22", "21", "5", "4"]);
  const buttons: [string, string, number, string, number][] = [
    ["Card A", "25", 92, "#2f7de1", 236], ["Card B", "26", 152, "#2f7de1", 222],
    ["Card C", "27", 212, "#2f7de1", 208], ["POS / ATM", "14", 272, "#d49b12", 222],
  ];
  const wire = { fill: "none", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const ledAt = (y: number, color: string, lit: boolean, label: string, gpio: string) => (
    <g>
      <path d={`M384 ${y} H410`} stroke={color} {...wire} />
      <rect x="410" y={y - 4.5} width="36" height="9" rx="4.5" fill="#dcc79e" stroke="#b49a6a" strokeWidth=".8" />
      {[418, 424, 430, 438].map((bx, k) => <rect key={bx} x={bx} y={y - 4.5} width="2.4" height="9" fill={["#8b5a2b", "#e23b3b", "#8b5a2b", "#c9a227"][k]} />)}
      <path d={`M446 ${y} H482`} stroke={color} {...wire} />
      {lit && <circle cx="492" cy={y} r="18" fill={color} opacity=".28" className="pulse-soft" />}
      <path d={`M484 ${y + 8} v-10 a8 8 0 0 1 16 0 v10 z`} fill={color} opacity={lit ? 1 : 0.38} stroke="rgba(0,0,0,.25)" />
      <rect x="482" y={y + 8} width="20" height="3.5" rx="1" fill={color} opacity={lit ? 0.9 : 0.35} />
      <path d={`M496 ${y + 12} v10`} stroke="#1c2128" strokeWidth="2" />
      <path d={`M490 ${y + 22} h12 M492.5 ${y + 25} h7 M495 ${y + 28} h2`} stroke="#1c2128" strokeWidth="1.4" strokeLinecap="round" />
      <text x="512" y={y - 1} fontSize="9.5" fontWeight="600" fill="#0c1a2e">{label}</text>
      <text x="512" y={y + 11} fontSize="8.5" fill="#5b6b80" fontFamily="var(--font-jetbrains), monospace">GPIO{gpio} · 220 Ω</text>
    </g>
  );
  return (
    <svg viewBox="0 0 640 344" className="w-full" role="img" aria-label="Wokwi circuit: ESP32 DevKitC, SSD1306 OLED, four buttons, two LEDs">
      <defs>
        <pattern id="wk-dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".9" fill="#c6d2e1" /></pattern>
        <linearGradient id="wk-can" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#e7ecf2" /><stop offset="1" stopColor="#a9b4c1" /></linearGradient>
      </defs>
      <rect width="640" height="344" fill="#f7f9fc" />
      <rect width="640" height="344" fill="url(#wk-dots)" />

      {/* ESP32 DevKitC V4 */}
      <rect x="250" y="34" width="140" height="290" rx="10" fill="#1c2128" />
      <rect x="250.5" y="34.5" width="139" height="289" rx="9.5" fill="none" stroke="rgba(255,255,255,.08)" />
      <rect x="282" y="42" width="76" height="100" rx="3" fill="#0f1216" />
      <path d="M290 50 h8 v8 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 v-8 h4" fill="none" stroke="#c9a227" strokeWidth="1.6" />
      <rect x="286" y="66" width="68" height="70" rx="3" fill="url(#wk-can)" />
      <text x="320" y="96" fontSize="7.5" fontWeight="700" fill="#3b4654" textAnchor="middle">ESP32-WROOM-32</text>
      <text x="320" y="108" fontSize="6.5" fill="#5b6b80" textAnchor="middle" fontFamily="var(--font-jetbrains), monospace">Wi-Fi · BT</text>
      <rect x="306" y="226" width="28" height="28" rx="2" fill="#0f1216" stroke="#2f3640" />
      <text x="320" y="272" fontSize="8" fill="rgba(255,255,255,.55)" textAnchor="middle">DevKitC V4</text>
      <rect x="284" y="292" width="14" height="9" rx="2" fill="#2f3640" /><rect x="342" y="292" width="14" height="9" rx="2" fill="#2f3640" />
      <text x="291" y="310" fontSize="5.5" fill="rgba(255,255,255,.45)" textAnchor="middle">EN</text><text x="349" y="310" fontSize="5.5" fill="rgba(255,255,255,.45)" textAnchor="middle">BOOT</text>
      <rect x="306" y="314" width="28" height="12" rx="2" fill="url(#wk-can)" />
      {LEFT.map((p, i) => (
        <g key={`l${i}`}>
          <rect x="255" y={PY(i) - 3.5} width="7" height="7" rx="1" fill="#2a2f36" />
          <circle cx="258.5" cy={PY(i)} r="1.7" fill={usedL.has(p) ? "#f0c341" : "#9a8a55"} />
          {usedL.has(p) && <text x="266" y={PY(i) + 2.6} fontSize="7" fill="#e8edf3" fontFamily="var(--font-jetbrains), monospace">{p}</text>}
        </g>
      ))}
      {RIGHT.map((p, i) => (
        <g key={`r${i}`}>
          <rect x="378" y={PY(i) - 3.5} width="7" height="7" rx="1" fill="#2a2f36" />
          <circle cx="381.5" cy={PY(i)} r="1.7" fill={usedR.has(p) ? "#f0c341" : "#9a8a55"} />
          {usedR.has(p) && <text x="374" y={PY(i) + 2.6} fontSize="7" fill="#e8edf3" textAnchor="end" fontFamily="var(--font-jetbrains), monospace">{p}</text>}
        </g>
      ))}

      {/* buttons on GPIO 25, 26, 27, 14 with INPUT_PULLUP; the other leg goes to GND */}
      <path d="M92 92 V318" stroke="#1c2128" {...wire} />
      <path d="M86 318 h12 M88.5 321 h7 M91 324 h2" stroke="#1c2128" strokeWidth="1.5" strokeLinecap="round" />
      <text x="80" y="324" fontSize="8" fill="#5b6b80" textAnchor="end" fontFamily="var(--font-jetbrains), monospace">GND</text>
      {buttons.map(([label, gpio, y, color, xt]) => (
        <g key={gpio}>
          <path d={`M255 ${L(gpio)} H${xt} V${y} H138`} stroke={color} {...wire} />
          <path d={`M92 ${y} H108`} stroke="#1c2128" {...wire} />
          <rect x="108" y={y - 15} width="30" height="30" rx="4" fill="#2b313a" />
          <rect x="108.5" y={y - 14.5} width="29" height="29" rx="3.5" fill="none" stroke="rgba(255,255,255,.1)" />
          <circle cx="123" cy={y} r="9.5" fill={color} />
          <circle cx="120" cy={y - 3} r="3" fill="#fff" opacity=".25" />
          <text x="123" y={y + 27} fontSize="9" fontWeight="600" fill="#0c1a2e" textAnchor="middle">{label}</text>
          <text x="123" y={y + 37} fontSize="7.5" fill="#5b6b80" textAnchor="middle" fontFamily="var(--font-jetbrains), monospace">GPIO{gpio}</text>
        </g>
      ))}

      {/* SSD1306 on I2C: SDA 21, SCL 22 */}
      <path d={`M384 ${R("22")} H418 V92 H450`} stroke="#2f7de1" {...wire} />
      <path d={`M384 ${R("21")} H432 V106 H450`} stroke="#19a35b" {...wire} />
      <path d="M450 64 H436" stroke="#1c2128" {...wire} /><path d="M450 78 H436" stroke="#d93a3f" {...wire} />
      <text x="432" y="67" fontSize="7" fill="#5b6b80" textAnchor="end" fontFamily="var(--font-jetbrains), monospace">GND</text>
      <text x="432" y="81" fontSize="7" fill="#5b6b80" textAnchor="end" fontFamily="var(--font-jetbrains), monospace">3V3</text>
      <rect x="450" y="40" width="164" height="94" rx="7" fill="#1d4f8f" />
      {[[458, 48], [606, 48], [458, 126], [606, 126]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="3.2" fill="#0d2c55" stroke="#c9a227" strokeWidth=".8" />)}
      {[64, 78, 92, 106].map((y, k) => (
        <g key={y}><circle cx="456" cy={y} r="2.4" fill="#f0c341" /><text x="462" y={y + 2.4} fontSize="6" fill="rgba(255,255,255,.7)" fontFamily="var(--font-jetbrains), monospace">{["GND", "VCC", "SCL", "SDA"][k]}</text></g>
      ))}
      <rect x="482" y="50" width="124" height="74" rx="2" fill="#03060c" />
      <text x="488" y="62" fontSize="7.5" fill="#d8ecff" fontFamily="var(--font-jetbrains), monospace">{terminal}</text>
      <line x1="488" y1="66" x2="600" y2="66" stroke="#d8ecff" strokeWidth=".8" />
      {screen.map((s, k) => (
        <text key={k} x="488" y={80 + k * 14} fontSize="7.5" fill="#d8ecff" fontFamily="var(--font-jetbrains), monospace">{s.slice(0, 21)}</text>
      ))}
      <text x="532" y="146" fontSize="9.5" fontWeight="600" fill="#0c1a2e" textAnchor="middle">SSD1306 OLED</text>
      <text x="532" y="157" fontSize="7.5" fill="#5b6b80" textAnchor="middle" fontFamily="var(--font-jetbrains), monospace">I2C 0x3C · 128×64</text>

      {/* LEDs: GPIO5 red REFER, GPIO4 green APPROVED */}
      {ledAt(R("5"), "#d93a3f", led === "refer", "REFER", "5")}
      {ledAt(R("4"), "#14a35f", led === "ok", "APPROVED", "4")}
    </svg>
  );
}
