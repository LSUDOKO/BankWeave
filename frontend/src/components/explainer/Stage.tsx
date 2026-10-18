"use client";
// React wrapper for the WebGL stage: one renderer for the page's lifetime, paused off screen,
// disposed on unmount. Labels are crisp HTML placed by the stage every frame (no React state).
import { useEffect, useRef, useState } from "react";
import type { Model, Tone } from "./model";
import { World } from "./world";

const TONE: Record<Tone, string> = {
  plain: "bg-paper/80",
  blue: "bg-cyan",
  ok: "bg-ok",
  warn: "bg-verify",
  ring: "bg-ring",
  deep: "bg-deep",
};

function webgl(): boolean {
  try {
    const c = document.createElement("canvas");
    const ctx = c.getContext("webgl2") || c.getContext("webgl");
    (ctx as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!ctx;
  } catch {
    return false;
  }
}

export default function Stage({ model, scene, step, reduced, overrides }: {
  model: Model; scene: number; step: number; reduced: boolean;
  overrides?: Record<string, { title?: string; sub?: string }>;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<World | null>(null);
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const state = useRef({ scene, step });
  const [failed, setFailed] = useState(false);
  state.current = { scene, step };

  useEffect(() => {
    const slot = host.current, box = wrap.current;
    if (!slot || !box) return;
    if (!webgl()) { setFailed(true); return; }
    // a fresh canvas per World: dispose() force-loses its context, so a reused canvas would come back dead
    const el = document.createElement("canvas");
    el.className = "absolute inset-0 h-full w-full";
    el.setAttribute("aria-hidden", "true");
    slot.appendChild(el);
    let w: World;
    try {
      w = new World(el, model, {
        reduced,
        onLabel: (i, x, y, o) => {
          const d = labels.current[i];
          if (!d) return;
          if (o <= 0) { if (d.style.opacity !== "0") { d.style.opacity = "0"; d.style.visibility = "hidden"; } return; }
          d.style.visibility = "visible";
          d.style.opacity = o.toFixed(3);
          d.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) ${model.labels[i]?.below ? "translate(-50%, 6px)" : "translate(-50%, calc(-100% - 12px))"}`;
        },
      });
    } catch {
      el.remove();
      setFailed(true);
      return;
    }
    world.current = w;
    w.setState(state.current.scene, state.current.step);
    const ro = new ResizeObserver(([e]) => w.resize(e.contentRect.width, e.contentRect.height));
    ro.observe(box);
    let onScreen = true;
    const sync = () => { if (onScreen && !document.hidden) w.start(); else w.stop(); };
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }, { threshold: 0.02 });
    io.observe(box);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      w.dispose();
      el.remove();
      world.current = null;
    };
  }, [model, reduced]);

  useEffect(() => { world.current?.setState(scene, step); }, [scene, step]);

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden">
      <div ref={host} className="absolute inset-0" />
      {failed && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">
          This browser has no WebGL, so the 3D stage is off. Every number and query is in the text.
        </div>
      )}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {model.labels.map((l, i) => {
          const o = overrides?.[l.key];
          const sub = o?.sub ?? l.sub;
          return (
            <div key={l.key} ref={(d) => { labels.current[i] = d; }}
              className="absolute left-0 top-0 whitespace-nowrap rounded-[10px] border border-white bg-white/92 px-2.5 py-1.5 shadow-[0_10px_28px_-12px_rgba(11,42,91,.45)] backdrop-blur-sm"
              style={{ opacity: 0, visibility: "hidden", willChange: "transform, opacity" }}>
              <span className="flex items-center gap-1.5 text-[12px] font-semibold leading-tight text-paper">
                <i className={`inline-block size-1.5 rounded-full ${TONE[l.tone]}`} />{o?.title ?? l.title}
              </span>
              {sub && <span className="mono mt-0.5 block text-[10.5px] leading-tight text-muted">{sub}</span>}
              {!l.below && <span className="absolute left-1/2 top-full h-3 w-px -translate-x-1/2 bg-gradient-to-b from-paper/30 to-transparent" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
