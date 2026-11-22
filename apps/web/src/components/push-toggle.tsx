"use client";
import { useEffect, useState } from "react";
import { Toggle } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";

function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** "Notifications Push (sur cet appareil)": registers the service worker and a Web Push subscription. */
export function PushToggle() {
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setSupported(false);
    navigator.serviceWorker.getRegistration().then(async (r) => setOn(!!(await r?.pushManager.getSubscription())));
  }, []);
  async function toggle(v: boolean) {
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      if (!v) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await api("/api/push/subscribe", { method: "DELETE", body: { endpoint: sub.endpoint }, silent: true }).catch(() => {});
          await sub.unsubscribe();
        }
        setOn(false);
        return;
      }
      if (!window.isSecureContext) return toast.error("Les notifications nécessitent une connexion sécurisée (https). Elles fonctionneront sur le site hébergé.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return toast.error(perm === "denied" ? "Les notifications sont bloquées pour ce site : autorisez-les dans les réglages du navigateur (icône à gauche de l'adresse)." : "Autorisez les notifications pour les recevoir sur cet appareil.");
      const { publicKey: key } = await api<{ publicKey: string }>("/api/push/key");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) });
      await api("/api/push/subscribe", { body: sub.toJSON() });
      setOn(true);
      toast.success("Notifications push activées sur cet appareil.");
    } catch (e) {
      toast.error(`Activation impossible : ${(e as Error).message}`);
    }
  }
  return <Toggle checked={on} onChange={toggle} disabled={!supported} label="Notifications Push" description={supported ? "Sur cet appareil : nouvelles demandes, pointeuse hors ligne, planning publié." : "Non disponible sur ce navigateur."} />;
}
