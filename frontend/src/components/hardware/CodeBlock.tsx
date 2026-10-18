"use client";
import { useState } from "react";

/** Copies text to the clipboard and confirms for two seconds. */
export function CopyButton({ text, label = "Copy", className = "", dark = false }: { text: string; label?: string; className?: string; dark?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard blocked (http, iframe): fall back to a hidden textarea
      const t = document.createElement("textarea");
      t.value = text; document.body.appendChild(t); t.select();
      document.execCommand("copy"); t.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  };
  const tone = dark
    ? "border-white/20 text-white/80 hover:bg-white/10"
    : "border-line bg-white text-paper hover:border-cyan hover:text-cyan";
  return (
    <button type="button" onClick={copy}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${tone} ${className}`}>
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {done ? <path d="M5 12l5 5 9-10" /> : <path d="M9 9h10v12H9zM5 15H4V3h12v1" />}
      </svg>
      {done ? "Copied" : label}
    </button>
  );
}

export type CodeFile = { name: string; lang: string; code: string; note?: string };

/** A small file viewer: file tabs, line numbers, copy, collapsible to a few lines. */
export function CodeFiles({ files, collapsedLines = 14 }: { files: CodeFile[]; collapsedLines?: number }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const f = files[active];
  const lines = f.code.replace(/\n$/, "").split("\n");
  const shown = open ? lines : lines.slice(0, collapsedLines);
  return (
    <div className="overflow-hidden rounded-2xl border border-[#13284a] bg-[#071530] text-[#d6e4f5]">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 bg-[#0a1c3d] px-2 py-1.5">
        {files.map((x, i) => (
          <button key={x.name} type="button" onClick={() => setActive(i)}
            className={`mono rounded-lg px-2.5 py-1 text-[12px] transition-colors ${i === active ? "bg-white/10 text-white" : "text-white/55 hover:text-white"}`}>
            {x.name}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2 pr-1">
          <span className="hidden text-[11px] text-white/45 sm:inline">{f.lang} · {lines.length} lines</span>
          <CopyButton text={f.code} label={`Copy ${f.name}`} dark />
        </span>
      </div>
      {f.note && <p className="border-b border-white/5 px-4 py-2 text-[11.5px] text-sky/90">{f.note}</p>}
      <div className={`scroll-thin overflow-auto ${open ? "max-h-[520px]" : ""}`}>
        <pre className="mono m-0 bg-transparent py-3 text-[12px] leading-[1.6] text-inherit">
          {shown.map((l, i) => (
            <div key={i} className="flex">
              <span className="w-10 shrink-0 select-none pr-3 text-right text-white/25">{i + 1}</span>
              <code className="whitespace-pre pr-4">{l || " "}</code>
            </div>
          ))}
        </pre>
      </div>
      {lines.length > collapsedLines && (
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="w-full border-t border-white/10 bg-[#0a1c3d] py-2 text-xs font-semibold text-sky hover:text-white">
          {open ? "Collapse" : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}
