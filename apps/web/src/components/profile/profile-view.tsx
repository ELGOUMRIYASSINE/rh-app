"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UAParser } from "ua-parser-js";
import { KeyRound, Laptop, LogOut, Save, ShieldCheck, ShieldOff, Smartphone, UserRound } from "lucide-react";
import { Avatar, Button, Card, CardHeader, Field, Input, Modal, PageHeader, StatusPill } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PasswordCard } from "@/components/settings/settings-view";
import { PushToggle } from "@/components/push-toggle";

export function ProfileView({ user, tz }: { user: { firstName: string; lastName: string; email: string; phone: string | null; totpEnabled: boolean; role: string }; tz: string }) {
  const router = useRouter();
  const [f, setF] = useState({ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? "" });
  const [saving, setSaving] = useState(false);
  const [enroll, setEnroll] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<{ items: { id: string; ip: string | null; userAgent: string | null; lastUsedAt: string; current: boolean }[] }>("/api/users/sessions") });
  async function save() {
    setSaving(true);
    try { await api("/api/users/me", { method: "PATCH", body: { ...f, phone: f.phone || null } }); toast.success("Profil mis à jour."); router.refresh(); } catch {}
    setSaving(false);
  }
  async function start2fa() { setEnroll(await api("/api/auth/2fa")); setCode(""); }
  async function confirm2fa() {
    try { await api("/api/auth/2fa", { body: { code } }); toast.success("Double authentification activée. Elle vous sera demandée à chaque connexion."); setEnroll(null); router.refresh(); } catch {}
  }
  async function disable2fa() {
    try { await api("/api/auth/2fa", { method: "DELETE" }); toast.success("Double authentification désactivée."); router.refresh(); } catch {}
  }
  async function revoke(id: string) { await api(`/api/users/sessions/${id}`, { method: "DELETE" }); toast.success("Session déconnectée."); void sessions.refetch(); }
  const ua = (s: string | null) => { if (!s) return { label: "Appareil inconnu", mobile: false }; const r = new UAParser(s).getResult(); return { label: `${r.browser.name ?? "Navigateur"} · ${r.os.name ?? ""} ${r.os.version ?? ""}`.trim(), mobile: r.device.type === "mobile" }; };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Mon profil" subtitle="Vos informations, votre sécurité et vos appareils" />
      <div className="space-y-5">
        <Card>
          <CardHeader icon={<UserRound />} title="Informations personnelles" />
          <div className="flex flex-col gap-5 px-5 pb-5 sm:flex-row">
            <Avatar name={`${f.firstName} ${f.lastName}`} size={72} />
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <Field label="Prénom" htmlFor="pf"><Input id="pf" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></Field>
              <Field label="Nom" htmlFor="pl"><Input id="pl" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></Field>
              <Field label="E-mail" htmlFor="pe" help="Pour changer d'adresse, contactez votre responsable RH."><Input id="pe" value={user.email} disabled /></Field>
              <Field label="Téléphone" htmlFor="pp"><Input id="pp" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="06 00 00 00 00" /></Field>
            </div>
          </div>
          <div className="flex justify-end border-t border-border px-5 py-3"><Button onClick={save} loading={saving}><Save /> Enregistrer</Button></div>
        </Card>
        <Card>
          <CardHeader icon={<ShieldCheck />} title="Double authentification (2FA)" subtitle="Un code à 6 chiffres généré par une application (Google Authenticator, Microsoft Authenticator…) en plus du mot de passe." actions={user.totpEnabled ? <StatusPill tone="success" dot>Activée</StatusPill> : <StatusPill>Désactivée</StatusPill>} />
          <div className="px-5 pb-5">{user.totpEnabled ? <Button variant="danger-ghost" onClick={disable2fa}><ShieldOff /> Désactiver</Button> : <Button onClick={start2fa}><KeyRound /> Activer la 2FA</Button>}</div>
        </Card>
        <Card>
          <CardHeader icon={<Laptop />} title="Sessions actives" subtitle="Déconnectez un appareil que vous n'utilisez plus." />
          <ul className="divide-y divide-border">
            {sessions.data?.items.map((s) => { const u = ua(s.userAgent); return (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                <div className="grid size-9 place-items-center rounded-[10px] bg-surface-2 text-muted">{u.mobile ? <Smartphone className="size-4" /> : <Laptop className="size-4" />}</div>
                <div className="min-w-0 flex-1"><div className="text-sm font-medium">{u.label} {s.current && <StatusPill tone="brand" className="ml-1">Cet appareil</StatusPill>}</div><div className="text-xs text-muted">{s.ip ?? "IP inconnue"} · actif le {new Date(s.lastUsedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: tz })}</div></div>
                {!s.current && <Button size="sm" variant="ghost" onClick={() => revoke(s.id)}><LogOut /> Déconnecter</Button>}
              </li>); })}
          </ul>
        </Card>
        <Card><CardHeader title="Notifications" /><div className="px-5 pb-5"><PushToggle /></div></Card>
        <PasswordCard />
      </div>
      <Modal open={!!enroll} onOpenChange={(o) => !o && setEnroll(null)} size="sm" icon={<KeyRound />} title="Activer la double authentification" subtitle="Scannez le QR code avec votre application, puis saisissez le code affiché." footer={<><Button variant="ghost" onClick={() => setEnroll(null)}>Annuler</Button><Button onClick={confirm2fa} disabled={code.length !== 6}>Activer</Button></>}>
        {enroll && <div className="space-y-4 text-center">
          <img src={enroll.qr} alt="QR code d'activation" className="mx-auto rounded-[12px] border border-border bg-white p-2" width={200} height={200} />
          <p className="text-xs text-muted">Ou saisissez la clé : <span className="select-all break-all font-mono text-text">{enroll.secret}</span></p>
          <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" className="mx-auto h-12 max-w-[200px] text-center font-mono text-xl tracking-[0.4em]" aria-label="Code à 6 chiffres" />
        </div>}
      </Modal>
    </div>
  );
}
