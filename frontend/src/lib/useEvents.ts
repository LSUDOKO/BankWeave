"use client";
import { useEffect, useRef, useState } from "react";
import { WS } from "./api";

export type BwEvent = {
  type: string; graph: string; id: string; ts: number;
  agent?: string | null; data: Record<string, any>; cypher?: string | null;
};

/** Live event stream from the graph (Redis pub/sub -> FastAPI -> WebSocket).
 *  Batches renders every 200 ms as the frontend doc asks. */
export function useEvents(max = 300, filter?: (e: BwEvent) => boolean) {
  const [events, setEvents] = useState<BwEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const buf = useRef<BwEvent[]>([]);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stop = false;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      ws = new WebSocket(WS);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => { setConnected(false); if (!stop) retry = setTimeout(connect, 1500); };
      ws.onmessage = (m) => {
        try {
          const e = JSON.parse(m.data) as BwEvent;
          if (!filterRef.current || filterRef.current(e)) buf.current.push(e);
        } catch { /* ignore malformed */ }
      };
    };
    connect();
    const flush = setInterval(() => {
      if (!buf.current.length) return;
      const batch = buf.current.splice(0);
      setEvents((prev) => [...batch.reverse(), ...prev].slice(0, max));
    }, 200);
    return () => { stop = true; clearInterval(flush); clearTimeout(retry); ws?.close(); };
  }, [max]);

  return { events, connected };
}

/** Re-run a loader whenever matching events arrive (debounced). */
export function useLiveReload(load: () => void, match: (e: BwEvent) => boolean, ms = 600) {
  const { events } = useEvents(50, match);
  const last = useRef(0);
  useEffect(() => {
    if (!events.length) return;
    const t = setTimeout(load, ms);
    last.current = events.length;
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);
}
