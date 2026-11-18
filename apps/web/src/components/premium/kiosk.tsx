"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Delete, Loader2, XCircle } from "lucide-react";
import { cn, YGHRLogo } from "@yghr/ui";

export function Kiosk({ token, orgName, logo, place, timezone, photoRequired, geofence }: { token: string; orgName: string; logo: string | null; place: string; timezone: string; photoRequired: boolean; geofence: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  const [pin, setPin] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "err"; msg?: string }>({ kind: "idle" });
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!photoRequired) return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" } }).then((s) => { stream = s; if (video.current) video.current.srcObject = s; }).catch(() => setState({ kind: "err", msg: "Autorisez la caméra pour pointer." }));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [photoRequired]);
  useEffect(() => {
    if (state.kind === "ok" || state.kind === "err") { const t = setTimeout(() => setState({ kind: "idle" }), 3500); return () => clearTimeout(t); }
  }, [state]);

  async function snap(): Promise<Blob | null> {
    const v = video.current;
    if (!v || !v.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = 480; c.height = Math.round((480 * v.videoHeight) / v.videoWidth);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    return new Promise((r) => c.toBlob(r, "image/jpeg", 0.8));
  }
  async function submit(code: string) {
    setState({ kind: "busy" });
    const f = new FormData();
    f.append("pin", code);
    if (photoRequired) { const b = await snap(); if (b) f.append("photo", new File([b], "selfie.jpg", { type: "image/jpeg" })); }
    if (geofence) {
      const pos = await new Promise<GeolocationPosition | null>((r) => navigator.geolocation?.getCurrentPosition(r, () => r(null), { timeout: 6000 }) ?? r(null));
      if (pos) { f.append("lat", String(pos.coords.latitude)); f.append("lng", String(pos.coords.longitude)); }
    }
    try {
      const res = await fetch(`/api/kiosk/${token}`, { method: "POST", body: f });
      const d = await res.json();
      setState(res.ok ? { kind: "ok", msg: `Merci ${d.name} ! Pointage enregistré à ${d.time}.` } : { kind: "err", msg: d.error ?? "Erreur." });
    } catch {
      setState({ kind: "err", msg: "Connexion impossible. Réessayez." });
    }
    setPin("");
  }
  const press = (k: string) => {
    if (state.kind === "busy") return;
    if (k === "del") return setPin((p) => p.slice(0, -1));
    const next = (pin + k).slice(0, 6);
    setPin(next);
  };
  const fmt = (o: Intl.DateTimeFormatOptions) => (now ? new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, ...o }).format(now) : "");

  return (
    <div className="flex min-h-dvh flex-col bg-brand-900 text-white">
      <header className="flex items-center justify-between px-8 py-5">
        {logo ? <span className="grid h-12 min-w-12 place-items-center rounded-xl bg-white p-1.5"><img src={logo} alt={orgName} className="max-h-full max-w-[160px] object-contain" /></span> : <YGHRLogo onDark size={34} />}
        <div className="text-right"><div className="font-semibold">{orgName}</div><div className="text-sm text-white/60">{place}</div></div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-10 lg:flex-row lg:gap-20">
        <div className="text-center lg:text-left">
          <div className="font-mono text-[88px] font-semibold leading-none tabular sm:text-[120px]">{fmt({ hour: "2-digit", minute: "2-digit" })}</div>
          <div className="mt-3 text-xl capitalize text-white/70">{fmt({ weekday: "long", day: "numeric", month: "long" })}</div>
          {photoRequired && <video ref={video} autoPlay playsInline muted className="mx-auto mt-6 aspect-[4/3] w-64 rounded-2xl bg-black/30 object-cover lg:mx-0" />}
        </div>
        <div className="w-full max-w-sm rounded-[28px] bg-white/[0.06] p-6 ring-1 ring-white/10" aria-live="polite">
          {state.kind === "ok" || state.kind === "err" ? (
            <div className="flex min-h-[380px] flex-col items-center justify-center text-center animate-pop">
              {state.kind === "ok" ? <CheckCircle2 className="size-20 text-success" /> : <XCircle className="size-20 text-danger" />}
              <p className="mt-5 text-xl font-semibold">{state.msg}</p>
            </div>
          ) : (
            <>
              <div className="mb-1 text-center text-sm text-white/60">Saisissez votre code borne</div>
              <div className="mb-6 flex h-14 items-center justify-center gap-3">
                {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => <span key={i} className={cn("size-4 rounded-full transition", i < pin.length ? "bg-accent-500" : "bg-white/20")} />)}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => <Key key={k} onClick={() => press(k)}>{k}</Key>)}
                <Key onClick={() => press("del")} aria-label="Effacer"><Delete className="size-6" /></Key>
                <Key onClick={() => press("0")}>0</Key>
                <button onClick={() => pin.length >= 4 && submit(pin)} disabled={pin.length < 4 || state.kind === "busy"} className="grid h-16 cursor-pointer place-items-center rounded-2xl bg-accent-500 text-lg font-bold text-brand-900 transition active:scale-95 disabled:opacity-40">
                  {state.kind === "busy" ? <Loader2 className="size-6 animate-spin" /> : "OK"}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Key({ children, onClick, ...rest }: { children: React.ReactNode; onClick: () => void; "aria-label"?: string }) {
  return <button onClick={onClick} {...rest} className="grid h-16 cursor-pointer place-items-center rounded-2xl bg-white/10 font-mono text-2xl font-semibold transition hover:bg-white/15 active:scale-95">{children}</button>;
}
