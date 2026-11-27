"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

interface RealtimeState {
  connected: boolean;
  socket: Socket | null;
}
const Ctx = createContext<RealtimeState>({ connected: false, socket: null });

/** One Socket.IO connection per tab, authenticated with a short-lived token from /api/realtime/token. */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RealtimeState>({ connected: false, socket: null });
  useEffect(() => {
    // Same host as the page (works from localhost or a LAN address); NEXT_PUBLIC_REALTIME_URL overrides.
    const configured = process.env.NEXT_PUBLIC_REALTIME_URL;
    // Behind the production reverse proxy (default port 80/443) Socket.IO is served on the same origin (/socket.io).
    const sameOrigin = location.port === "" || location.port === "80" || location.port === "443";
    const url = configured && !/\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(configured) ? configured : sameOrigin ? location.origin : `${location.protocol}//${location.hostname}:3001`;
    const socket = io(url, {
      transports: ["websocket", "polling"],
      reconnectionDelayMax: 10_000,
      auth: async (cb) => {
        try {
          const r = await fetch("/api/realtime/token");
          cb(r.ok ? await r.json() : {});
        } catch {
          cb({});
        }
      },
    });
    const update = () => setState({ connected: socket.connected, socket });
    socket.on("connect", update);
    socket.on("disconnect", update);
    socket.on("connect_error", update);
    setState({ connected: false, socket });
    // reflect browser offline state immediately
    const off = () => setState((s) => ({ ...s, connected: false }));
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("offline", off);
      socket.close();
    };
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useRealtime() {
  return useContext(Ctx);
}

/** Subscribe to a realtime event. The latest callback is always used. */
export function useRealtimeEvent<T = unknown>(event: string, cb: (payload: T) => void) {
  const { socket } = useRealtime();
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!socket) return;
    const h = (p: T) => ref.current(p);
    socket.on(event, h);
    return () => {
      socket.off(event, h);
    };
  }, [socket, event]);
}
