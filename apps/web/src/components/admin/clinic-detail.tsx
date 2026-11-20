"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Activity, ArrowLeft, Ban, CalendarClock, Check, CheckCircle2, Copy, Eraser, Fingerprint, KeyRound, LifeBuoy, LogIn, MailPlus, MoreHorizontal, Play, Save, ShieldAlert, ShieldOff, Trash2, UserPlus, Users } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Modal, Select, StatusPill, TabPanel, Tabs, td, Textarea, th, Toggle } from "@yghr/ui";
import { toast } from "sonner";
import type { ClinicDetail } from "@/server/platform-data";
import { api } from "@/lib/api";
import { confirmDialog } from "@/components/confirm";
import { ClinicAvatar, Feed, OrgStatusPill, When } from "./bits";
import { daysUntil, PLANS, T_PRIORITY, T_STATUS } from "./fmt";

const ROLE: Record<string, string> = { RH: "Responsable RH", CHEF: "Chef d'équipe", SUPER_ADMIN: "Admin YGHR" };

export function ClinicDetailView({ d }: { d: ClinicDetail }) {
  const router = useRouter();
  const o = d.org;
  const [tab, setTab] = useState("overview");
  const [note, setNote] = useState(o.internalNote);
  const [trialEnd, setTrialEnd] = useState(o.trialEndsAt?.slice(0, 10) ?? "");
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState<{ url: string; title: string; emailSent: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const left = o.status === "TRIAL" ? daysUntil(o.trialEndsAt) : null;
  const patch = async (body: object, msg: string) => { await api(`/api/admin/organizations/${o.id}`, { method: "PATCH", body }); toast.success(msg); router.refresh(); };

  async function openSpace() {
    if (!(await confirmDialog({ title: `Ouvrir l'espace de ${o.name} ?`, message: "Vous accédez à l'espace RH de la clinique en tant qu'« Admin YGHR » pour l'aider. Cet accès est inscrit dans son journal d'audit.", confirmLabel: "Ouvrir l'espace" }))) return;
    const r = await api<{ redirect: string }>(`/api/admin/organizations/${o.id}/access`, { body: {} });
    window.location.href = r.redirect;
  }
  async function suspend() {
    if (o.status === "SUSPENDED") return patch({ status: o.trialEndsAt && new Date(o.trialEndsAt) > new Date() ? "TRIAL" : "ACTIVE" }, "Accès rétabli.");
    if (!(await confirmDialog({ title: `Suspendre ${o.name} ?`, message: "Plus personne de la clinique ne pourra se connecter (y compris les tablettes de pointage). Les données sont conservées et l'accès peut être rétabli à tout moment.", danger: true, confirmLabel: "Suspendre" }))) return;
    await patch({ status: "SUSPENDED" }, "Clinique suspendue.");
  }
  async function convert() {
    const clear = o.isDemo && (await confirmDialog({ title: "Effacer aussi les données de démonstration ?", message: "Annuler = garder les données. Les salariés fictifs, plannings, pointages, congés et paies de démonstration seront supprimés. Les paramètres, le logo et les comptes RH sont conservés.", confirmLabel: "Oui, repartir de zéro" }));
    if (clear) await api(`/api/admin/organizations/${o.id}/clear-demo`, { body: {} });
    await patch({ status: "ACTIVE", trialEndsAt: null }, `${o.name} est maintenant cliente.`);
  }
  async function clearDemo() {
    if (!(await confirmDialog({ title: "Effacer les données de démonstration ?", message: "Supprime tous les salariés, plannings, pointages, congés, paies et pointeuses. Les paramètres, le logo et les comptes RH sont conservés. Action irréversible.", danger: true, confirmLabel: "Effacer" }))) return;
    await api(`/api/admin/organizations/${o.id}/clear-demo`, { body: {} });
    toast.success("Données de démonstration effacées.");
    router.refresh();
  }
  async function sendLink(id: string, name: string) {
    const r = await api<{ url: string; kind: string; emailSent: boolean }>(`/api/admin/members/${id}/link`, { body: {} });
    setLink({ url: r.url, title: r.kind === "INVITE" ? `Invitation de ${name}` : `Réinitialisation du mot de passe de ${name}`, emailSent: r.emailSent });
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/cliniques" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" /> Cliniques</Link>
      <div className="flex flex-wrap items-start gap-4">
        <ClinicAvatar name={o.name} logo={o.logo} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[26px] font-bold leading-tight">{o.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            <OrgStatusPill status={o.status} isDemo={o.isDemo} />
            <span>Pack {o.plan}</span>·<span className="font-mono">/{o.slug}</span>·<span>Cliente depuis le <When iso={o.createdAt} date /></span>
            {left !== null && <StatusPill tone={left < 0 ? "danger" : left <= 7 ? "warning" : "neutral"}>{left < 0 ? "Essai terminé" : `Fin d'essai dans ${left} j`}</StatusPill>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openSpace}><LogIn /> Ouvrir son espace</Button>
          <Menu>
            <MenuTrigger asChild><Button variant="secondary" size="icon" aria-label="Plus d'actions"><MoreHorizontal /></Button></MenuTrigger>
            <MenuContent>
              {o.status === "TRIAL" && <MenuItem icon={<CheckCircle2 />} onSelect={convert}>Passer en client</MenuItem>}
              {o.isDemo && <MenuItem icon={<Eraser />} onSelect={clearDemo}>Effacer les données de démo</MenuItem>}
              <MenuItem icon={o.status === "SUSPENDED" ? <Play /> : <Ban />} danger={o.status !== "SUSPENDED"} onSelect={suspend}>{o.status === "SUSPENDED" ? "Rétablir l'accès" : "Suspendre l'accès"}</MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Trash2 />} danger onSelect={() => setDeleting(true)}>Supprimer définitivement</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} tabs={[
        { value: "overview", label: "Aperçu", icon: <Activity /> },
        { value: "accounts", label: "Comptes", icon: <Users />, count: d.members.length },
        { value: "support", label: "Support", icon: <LifeBuoy />, count: d.tickets.filter((t) => t.status !== "RESOLVED").length },
        { value: "errors", label: "Incidents", icon: <ShieldAlert />, count: d.errors.filter((e) => !e.resolved).length },
        { value: "activity", label: "Journal", icon: <CalendarClock /> },
      ]}>
        <TabPanel value="overview" className="mt-5">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([["Salariés actifs", d.stats.employees], ["Pointages (30 j)", d.stats.punches30], ["Congés à traiter", d.stats.leavesPending], ["Pointeuses", `${d.stats.devices}${d.stats.devicesOffline ? ` (${d.stats.devicesOffline} HS)` : ""}`], ["Centres", d.stats.centres], ["Services", d.stats.services], ["Dernière paie", d.stats.payroll ?? "Aucune"], ["Dernière connexion", <When key="ll" iso={d.stats.lastLogin} />]] as const).map(([l, v]) => (
                  <Card key={l} className="p-4"><div className="text-xs text-muted">{l}</div><div className="mt-1 font-display text-lg font-bold leading-snug tabular" suppressHydrationWarning>{v}</div></Card>
                ))}
              </div>
              {d.devices.length > 0 && (
                <Card>
                  <CardHeader title="Pointeuses" icon={<Fingerprint />} />
                  <ul className="divide-y divide-border border-t border-border">
                    {d.devices.map((x) => <li key={x.id} className="flex items-center gap-3 px-5 py-2.5 text-sm"><span className="flex-1">{x.name} <span className="text-muted">· {x.mode}</span></span><span className="text-xs text-muted"><When iso={x.lastSeenAt} /></span><StatusPill tone={x.status === "ONLINE" ? "success" : "danger"} dot>{x.status === "ONLINE" ? "En ligne" : "Hors ligne"}</StatusPill></li>)}
                  </ul>
                </Card>
              )}
              <Card>
                <CardHeader title="Activité récente" />
                <div className="border-t border-border"><Feed items={d.feed.slice(0, 12)} showOrg={false} /></div>
              </Card>
            </div>
            <div className="space-y-6">
              <Card className="space-y-4 p-5">
                <div className="font-semibold">Abonnement</div>
                <Field label="Pack" htmlFor="plan"><Select id="plan" value={o.plan} onChange={(e) => patch({ planName: e.target.value }, `Pack ${e.target.value} activé.`)}>{PLANS.map((p) => <option key={p}>{p}</option>)}</Select></Field>
                <Field label="Statut" htmlFor="st">
                  <Select id="st" value={o.status} onChange={(e) => patch({ status: e.target.value }, "Statut mis à jour.")}>
                    <option value="ACTIVE">Client actif</option><option value="TRIAL">Essai / démo</option><option value="SUSPENDED">Suspendue</option>
                  </Select>
                </Field>
                {o.status === "TRIAL" && (
                  <Field label="Fin de l'essai" htmlFor="te" help="Après cette date, la clinique ne peut plus se connecter.">
                    <div className="flex gap-2"><Input id="te" type="date" value={trialEnd} onChange={(e) => setTrialEnd(e.target.value)} /><Button variant="secondary" onClick={() => patch({ trialEndsAt: trialEnd || null }, "Date de fin d'essai enregistrée.")} disabled={trialEnd === (o.trialEndsAt?.slice(0, 10) ?? "")}><Save /></Button></div>
                  </Field>
                )}
              </Card>
              <Card className="space-y-3 p-5">
                <div className="font-semibold">Coordonnées</div>
                <dl className="space-y-1.5 text-sm">
                  {([["E-mail", o.contactEmail], ["Téléphone", o.phone], ["Adresse", o.address], ["Fuseau", o.timezone]] as const).map(([k, v]) => <div key={k} className="flex gap-3"><dt className="w-24 shrink-0 text-muted">{k}</dt><dd className="min-w-0 break-words">{v || "Non renseigné"}</dd></div>)}
                </dl>
              </Card>
              <Card className="space-y-3 p-5">
                <div className="font-semibold">Note interne</div>
                <p className="-mt-2 text-xs text-muted">Visible uniquement par l&apos;équipe YGHR (contrat, interlocuteur, historique…).</p>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder="ex. Contrat signé le 12/11, interlocuteur : Mme Alaoui (06…)" />
                <div className="flex justify-end"><Button size="sm" variant="secondary" onClick={() => patch({ internalNote: note }, "Note enregistrée.")} disabled={note === o.internalNote}><Save /> Enregistrer</Button></div>
              </Card>
            </div>
          </div>
        </TabPanel>

        <TabPanel value="accounts" className="mt-5">
          <Card>
            <CardHeader title="Comptes de gestion" subtitle="Responsables RH et chefs d'équipe. Les salariés se gèrent depuis l'espace de la clinique." actions={<Button size="sm" onClick={() => setAdding(true)}><UserPlus /> Ajouter un compte RH</Button>} />
            <div className="scrollbar-thin overflow-x-auto border-t border-border">
              <table className="w-full min-w-[760px]">
                <thead><tr>{["Nom", "Rôle", "État", "Dernière connexion", "Actif", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {d.members.map((m) => (
                    <tr key={m.id}>
                      <td className={td}><div className="font-medium">{m.name}</div><div className="text-xs text-muted">{m.email}</div></td>
                      <td className={td}>{ROLE[m.role] ?? m.role}</td>
                      <td className={td}>{m.activated ? <StatusPill tone="success" dot>Activé{m.totp ? " · 2FA" : ""}</StatusPill> : <StatusPill tone="warning" dot>Invitation en attente</StatusPill>}</td>
                      <td className={`${td} text-[13px] text-muted`}><When iso={m.lastLoginAt} /></td>
                      <td className={td}><Toggle size="sm" checked={m.active} onChange={async (v) => { await api(`/api/admin/members/${m.id}`, { method: "PATCH", body: { active: v } }); toast.success(v ? "Compte réactivé." : "Compte désactivé."); router.refresh(); }} /></td>
                      <td className={`${td} text-right`}>
                        <Menu>
                          <MenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`Actions pour ${m.name}`}><MoreHorizontal /></Button></MenuTrigger>
                          <MenuContent>
                            <MenuItem icon={m.activated ? <KeyRound /> : <MailPlus />} onSelect={() => sendLink(m.id, m.name)}>{m.activated ? "Envoyer un lien de nouveau mot de passe" : "Renvoyer l'invitation"}</MenuItem>
                            {m.totp && <MenuItem icon={<ShieldOff />} onSelect={async () => { await api(`/api/admin/members/${m.id}`, { method: "PATCH", body: { reset2fa: true } }); toast.success("Double authentification réinitialisée."); router.refresh(); }}>Réinitialiser la 2FA</MenuItem>}
                          </MenuContent>
                        </Menu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabPanel>

        <TabPanel value="support" className="mt-5">
          <Card>
            {d.tickets.length === 0 ? <div className="p-6 text-center text-sm text-muted">Aucune demande de support.</div> : (
              <ul className="divide-y divide-border">
                {d.tickets.map((t) => (
                  <li key={t.id}><Link href={`/admin/support/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/60"><span className="min-w-0 flex-1 truncate text-sm font-medium">{t.subject}</span><span className="text-xs text-muted"><When iso={t.updatedAt} /></span><StatusPill tone={T_PRIORITY[t.priority]![1]}>{T_PRIORITY[t.priority]![0]}</StatusPill><StatusPill tone={T_STATUS[t.status]![1]}>{T_STATUS[t.status]![0]}</StatusPill></Link></li>
                ))}
              </ul>
            )}
          </Card>
        </TabPanel>

        <TabPanel value="errors" className="mt-5">
          <Card>
            {d.errors.length === 0 ? <div className="p-6 text-center text-sm text-muted">Aucune erreur enregistrée pour cette clinique.</div> : (
              <ul className="divide-y divide-border">
                {d.errors.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                    <span className="w-[118px] shrink-0 font-mono text-[11.5px] text-muted"><When iso={e.at} /></span>
                    <div className="min-w-0 flex-1"><div className="font-mono text-xs text-muted">{e.method} {e.path}</div><div className="break-words">{e.message}</div></div>
                    {e.resolved ? <StatusPill tone="success">Résolu</StatusPill> : <Button size="sm" variant="ghost" onClick={async () => { await api(`/api/admin/errors/${e.id}`, { method: "PATCH", body: { resolved: true } }); router.refresh(); }}><Check /> Résolu</Button>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabPanel>

        <TabPanel value="activity" className="mt-5">
          <Card><Feed items={d.feed} showOrg={false} /></Card>
        </TabPanel>
      </Tabs>

      {adding && <AddRh orgId={o.id} onClose={() => setAdding(false)} onDone={(url, emailSent) => { setAdding(false); router.refresh(); if (url) setLink({ url, title: "Invitation du nouveau compte RH", emailSent }); else toast.success("Compte ajouté : la personne a déjà un mot de passe."); }} />}
      {link && <LinkModal {...link} onClose={() => setLink(null)} />}
      {deleting && <DeleteModal org={o} onClose={() => setDeleting(false)} />}
    </div>
  );
}

function AddRh({ orgId, onClose, onDone }: { orgId: string; onClose: () => void; onDone: (url: string | null, emailSent: boolean) => void }) {
  const [f, setF] = useState({ firstName: "", lastName: "", email: "" });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { const r = await api<{ inviteUrl: string | null; emailSent: boolean }>(`/api/admin/organizations/${orgId}/members`, { body: f }); onDone(r.inviteUrl, r.emailSent); } catch {}
    setBusy(false);
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" icon={<UserPlus />} title="Ajouter un compte RH" subtitle="Il pourra gérer tout l'espace de la clinique." footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy} disabled={!f.firstName || !f.lastName || !f.email.includes("@")}>Ajouter et inviter</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prénom" required htmlFor="rf"><Input id="rf" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></Field>
        <Field label="Nom" required htmlFor="rl"><Input id="rl" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></Field>
        <Field className="sm:col-span-2" label="E-mail" required htmlFor="re"><Input id="re" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function LinkModal({ url, title, emailSent, onClose }: { url: string; title: string; emailSent: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" icon={<MailPlus />} title={title} footer={<Button onClick={onClose}>Fermer</Button>}>
      <p className="text-sm text-muted">{emailSent ? "Un e-mail a été envoyé." : "L'e-mail n'a pas pu partir (SMTP non configuré ?)."} Vous pouvez aussi transmettre ce lien, valable 7 jours :</p>
      <div className="mt-3 flex gap-2"><input readOnly value={url} className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Lien" /><Button size="sm" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>{copied ? <Check /> : <Copy />} Copier</Button></div>
    </Modal>
  );
}

function DeleteModal({ org, onClose }: { org: { id: string; name: string; slug: string }; onClose: () => void }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  async function del() {
    setBusy(true);
    try { await api(`/api/admin/organizations/${org.id}`, { method: "DELETE", body: { confirm: v } }); toast.success(`${org.name} a été supprimée.`); window.location.href = "/admin/cliniques"; } catch { setBusy(false); }
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" icon={<Trash2 />} title={`Supprimer ${org.name} ?`} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="danger" onClick={del} loading={busy} disabled={v !== org.slug}>Supprimer définitivement</Button></>}>
      <p className="text-sm text-muted">Toutes les données de la clinique (salariés, plannings, pointages, paies, documents) seront <b className="text-danger">effacées définitivement</b>. Pour une pause, préférez « Suspendre l&apos;accès ».</p>
      <Field className="mt-4" label={<>Tapez <span className="font-mono">{org.slug}</span> pour confirmer</>} htmlFor="dc"><Input id="dc" value={v} onChange={(e) => setV(e.target.value)} className="font-mono" autoComplete="off" /></Field>
    </Modal>
  );
}
