"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArrowLeft, Briefcase, Check, CalendarCheck2, CalendarRange, FileText, History, IdCard, Mail, MailPlus, Phone, Save, UserCheck, Wallet, X } from "lucide-react";
import { LEAVE_TYPE_LABELS, type LeaveType } from "@yghr/core";
import { Avatar, Button, buttonVariants, Card, CardHeader, cn, readableText, EmptyState, Field, Input, Select, StatusPill, TabPanel, Tabs, td, th } from "@yghr/ui";
import { toast } from "sonner";
import type { ProfileData } from "@/server/profile";
import { api } from "@/lib/api";
import { dayLabel, dh, frDate, hm, timeIn } from "@/lib/format";
import { confirmDialog } from "@/components/confirm";

const CONTRACT: Record<string, string> = { CDI: "CDI", CDD: "CDD", INTERIM: "Intérim", STAGE: "Stage" };
export const ATT_STATUS: Record<string, [string, "success" | "warning" | "danger" | "neutral" | "info" | "brand"]> = {
  PRESENT: ["Présent", "success"], DONE: ["Présent", "success"], LATE: ["En retard", "warning"], ABSENT: ["Absent", "danger"], LEAVE: ["En congé", "info"], OFF: ["Repos", "neutral"],
};
export const LEAVE_STATUS: Record<string, [string, "warning" | "success" | "danger" | "neutral"]> = { PENDING: ["En attente", "warning"], APPROVED: ["Approuvé", "success"], REJECTED: ["Refusé", "danger"], CANCELLED: ["Annulé", "neutral"] };
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function EmployeeProfile({ data, base, tz, edit, initialTab, canSeeRates, canEditRates }: { data: ProfileData; base: string; tz: string; edit?: boolean; initialTab: string; canSeeRates: boolean; canEditRates: boolean }) {
  const router = useRouter();
  const e = data.employee;
  const name = `${e.firstName} ${e.lastName}`;
  const [tab, setTab] = useState(edit ? "infos" : initialTab);
  const [editing, setEditing] = useState(!!edit);
  const [form, setForm] = useState(e);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    const body: Record<string, unknown> = {
      firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, matricule: form.matricule, position: form.position,
      serviceId: form.serviceId, centreId: form.centreId, staffCategoryId: form.staffCategoryId, teamLeadId: form.teamLeadId, contractType: form.contractType, contractReason: form.contractReason,
      weeklyHours: form.weeklyHours, birthDate: form.birthDate ?? "", hireDate: form.hireDate ?? "", cnssNumber: form.cnssNumber, cin: form.cin, familyDependents: form.familyDependents,
    };
    if (canEditRates) Object.assign(body, { hourlyRate: form.hourlyRate, netHourlyRate: form.netHourlyRate, monthlyBase: form.monthlyBase });
    try {
      await api(`/api/employees/${e.id}`, { method: "PATCH", body });
      toast.success("Fiche mise à jour.");
      setEditing(false);
      router.refresh();
    } catch {}
    setSaving(false);
  }
  async function archive() {
    if (!(await confirmDialog({ title: `Archiver ${name} ?`, message: "Son accès est désactivé ; son historique est conservé.", confirmLabel: "Archiver" }))) return;
    await api(`/api/employees/${e.id}/archive`, { body: {} });
    toast.success(`${name} a été archivé.`);
    router.refresh();
  }
  async function reinvite() {
    const r = await api<{ message: string }>(`/api/employees/${e.id}/invite`, { body: {} });
    toast.success(r.message);
  }

  const txt = (label: string, k: keyof typeof form, opts: { type?: string; full?: boolean; mono?: boolean } = {}) => (
    <Field label={label} htmlFor={`f-${String(k)}`} className={opts.full ? "sm:col-span-2" : ""}>
      {editing ? (
        <Input id={`f-${String(k)}`} type={opts.type ?? "text"} value={(form[k] as string | number | null) ?? ""} onChange={(ev) => set(k, (opts.type === "number" ? (ev.target.value === "" ? null : Number(ev.target.value)) : ev.target.value || null) as never)} className={opts.mono ? "font-mono" : ""} />
      ) : (
        <div className={cn("flex h-10 items-center text-sm", opts.mono && "font-mono", !e[k] && e[k] !== 0 && "text-muted")}>{k === "birthDate" || k === "hireDate" ? frDate(e[k] as string | null) : String(e[k] ?? "")}</div>
      )}
    </Field>
  );
  const sel = (label: string, k: "serviceId" | "centreId" | "staffCategoryId" | "teamLeadId" | "contractType", options: { id: string; name: string }[], display: string | null) => (
    <Field label={label} htmlFor={`f-${k}`}>
      {editing ? (
        <Select id={`f-${k}`} value={form[k] ?? ""} onChange={(ev) => set(k, (ev.target.value || null) as never)}>
          <option value="">Aucun</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      ) : <div className={cn("flex h-10 items-center text-sm", !display && "text-muted")}>{display ?? "Non renseigné"}</div>}
    </Field>
  );

  return (
    <div>
      <Link href={`${base}/employes`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" /> Salariés</Link>
      <Card className="mb-5 overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-brand-900 via-brand-700 to-brand-500" />
        <div className="flex flex-wrap items-end gap-4 px-6 pb-5">
          <Avatar name={name} size={84} className="-mt-10 ring-4 ring-surface" />
          <div className="min-w-0 flex-1 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold">{name}</h1>
              {e.status === "ARCHIVED" ? <StatusPill>Archivé</StatusPill> : e.access === "invited" ? <StatusPill tone="warning" dot>Invitation envoyée</StatusPill> : e.access === "active" ? <StatusPill tone="success" dot>Actif</StatusPill> : <StatusPill>Sans accès</StatusPill>}
              {e.role === "CHEF" && <StatusPill tone="accent">Chef d'équipe</StatusPill>}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5"><Briefcase className="size-3.5" />{e.position ?? "Poste non renseigné"}{e.service ? ` · ${e.service}` : ""}</span>
              <span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" />{e.email}</span>
              {e.phone && <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" />{e.phone}</span>}
              {e.matricule && <span className="inline-flex items-center gap-1.5 font-mono"><IdCard className="size-3.5" />{e.matricule}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {e.access !== "active" && e.status === "ACTIVE" && <Button variant="secondary" onClick={reinvite}><MailPlus /> Renvoyer l'invitation</Button>}
            {e.status === "ACTIVE" && <Button variant="danger-ghost" onClick={archive}><Archive /> Archiver</Button>}
          </div>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab} tabs={[
        { value: "infos", label: "Infos", icon: <IdCard /> },
        { value: "contrat", label: "Contrat & salaire", icon: <Wallet /> },
        { value: "planning", label: "Planning", icon: <CalendarRange /> },
        { value: "presences", label: "Présences", icon: <UserCheck /> },
        { value: "conges", label: "Congés & soldes", icon: <CalendarCheck2 /> },
        { value: "documents", label: "Documents", icon: <FileText /> },
        { value: "historique", label: "Historique", icon: <History /> },
      ]}>
        <div className="mt-5">
          {(tab === "infos" || tab === "contrat") && (
            <div className="mb-4 flex justify-end gap-2">
              {editing ? (
                <>
                  <Button variant="ghost" onClick={() => { setForm(e); setEditing(false); }}><X /> Annuler</Button>
                  <Button onClick={save} loading={saving}><Save /> Enregistrer</Button>
                </>
              ) : <Button variant="secondary" onClick={() => setEditing(true)}>Modifier la fiche</Button>}
            </div>
          )}
          <TabPanel value="infos">
            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title="Identité" />
                <div className="grid gap-x-4 gap-y-3 px-5 pb-5 sm:grid-cols-2">
                  {txt("Prénom", "firstName")}{txt("Nom", "lastName")}{txt("E-mail", "email", { type: "email", full: true })}{txt("Téléphone", "phone")}{txt("Date de naissance", "birthDate", { type: "date" })}{txt("CIN", "cin", { mono: true })}{txt("Personnes à charge", "familyDependents", { type: "number" })}
                </div>
              </Card>
              <Card>
                <CardHeader title="Affectation" />
                <div className="grid gap-x-4 gap-y-3 px-5 pb-5 sm:grid-cols-2">
                  {txt("Matricule", "matricule", { mono: true })}{txt("Poste", "position")}
                  {data.centres.length > 0 && sel("Centre", "centreId", data.centres, e.centre)}{sel("Service", "serviceId", data.services, e.service)}{sel("Catégorie de personnel", "staffCategoryId", data.categories, e.category)}
                  {sel("Chef d'équipe", "teamLeadId", data.leads, e.teamLead)}
                </div>
              </Card>
            </div>
          </TabPanel>
          <TabPanel value="contrat">
            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title="Contrat" />
                <div className="grid gap-x-4 gap-y-3 px-5 pb-5 sm:grid-cols-2">
                  {sel("Type de contrat", "contractType", Object.entries(CONTRACT).map(([id, n]) => ({ id, name: n })), e.contractType ? CONTRACT[e.contractType]! : null)}
                  {txt("Durée hebdo (h)", "weeklyHours", { type: "number" })}
                  {(form.contractType === "CDD" || e.contractType === "CDD") && txt("CDD : motif", "contractReason", { full: true })}
                  {txt("Date d'embauche", "hireDate", { type: "date" })}{txt("N° CNSS", "cnssNumber", { mono: true })}
                </div>
              </Card>
              <Card>
                <CardHeader title="Rémunération" subtitle={canSeeRates ? "Renseignez une base mensuelle, un taux horaire brut ou un salaire net par heure." : undefined} />
                {canSeeRates ? (
                  <div className="grid gap-x-4 gap-y-3 px-5 pb-5 sm:grid-cols-2">
                    {txt("Base mensuelle (DH)", "monthlyBase", { type: "number", mono: true })}{txt("Taux horaire brut (DH)", "hourlyRate", { type: "number", mono: true })}{txt("Salaire net / heure (DH)", "netHourlyRate", { type: "number", mono: true })}
                  </div>
                ) : <p className="px-5 pb-5 text-sm text-muted">Vous n'avez pas accès aux taux de rémunération.</p>}
                {data.payslips.length > 0 && (
                  <div className="border-t border-border px-5 py-4">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Derniers bulletins</div>
                    <ul className="space-y-1.5">
                      {data.payslips.slice(0, 4).map((p) => (
                        <li key={p.id} className="flex items-center justify-between text-sm">
                          <span>{MONTHS[p.month - 1]} {p.year}</span>
                          <span className="font-mono tabular">{dh(p.net)} <span className="text-xs text-muted">net</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            </div>
          </TabPanel>
          <TabPanel value="planning">
            <Card>
              <CardHeader title="Planning" subtitle="Semaine passée et trois semaines à venir" />
              {data.assignments.length === 0 ? <EmptyState compact icon={<CalendarRange />} title="Aucun shift planifié">Ajoutez des shifts depuis le Planning.</EmptyState> : (
                <ul className="grid gap-2 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
                  {data.assignments.map((a) => (
                    <li key={a.id} className={cn("flex items-center gap-3 rounded-[12px] border border-border p-3", a.date === data.today && "border-brand-500 ring-3 ring-brand-500/10")}>
                      <span className={cn("rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold", a.status === "DRAFT" && "opacity-70")} style={{ background: a.color, color: readableText(a.color) }}>{a.code}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{dayLabel(a.date)}</div>
                        <div className="font-mono text-xs text-muted">{a.start}–{a.end}</div>
                      </div>
                      {a.status === "DRAFT" && <StatusPill>Brouillon</StatusPill>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabPanel>
          <TabPanel value="presences">
            <Card>
              <CardHeader title="Présences" subtitle="31 derniers jours" />
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead><tr>{["Date", "Statut", "Arrivée", "Sortie", "Travaillé", "Nuit", "Retard", "Validé"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.attendance.map((a) => {
                      const [l, t] = ATT_STATUS[a.status] ?? [a.status, "neutral" as const];
                      return (
                        <tr key={a.date}>
                          <td className={td}>{dayLabel(a.date)}</td>
                          <td className={td}><StatusPill tone={t}>{l}</StatusPill>{a.issues.includes("MISSING_OUT") && <StatusPill tone="danger" className="ml-1">Sortie manquante</StatusPill>}</td>
                          <td className={cn(td, "font-mono")}>{timeIn(a.firstIn, tz)}</td>
                          <td className={cn(td, "font-mono")}>{timeIn(a.lastOut, tz)}</td>
                          <td className={cn(td, "font-mono tabular")}>{hm(a.worked)}</td>
                          <td className={cn(td, "font-mono tabular")}>{a.night ? hm(a.night) : ""}</td>
                          <td className={td}>{a.late ? <span className="text-[#9a6a00] dark:text-warning">+{a.late} min</span> : ""}</td>
                          <td className={td}>{a.validated ? <Check className="size-4 text-success" aria-label="Validé" /> : null}</td>
                        </tr>
                      );
                    })}
                    {data.attendance.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">Aucune présence enregistrée sur cette période.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabPanel>
          <TabPanel value="conges">
            <div className="mb-5 grid gap-4 sm:grid-cols-3">
              {data.balances.map((b) => (
                <Card key={b.type} className="p-5">
                  <div className="text-sm font-medium">{LEAVE_TYPE_LABELS[b.type]}</div>
                  <div className="mt-2 font-display text-3xl font-bold tabular">{b.available} <span className="text-base font-medium text-muted">j</span></div>
                  <div className="mt-1 text-xs text-muted">acquis {b.acquired} · pris {b.taken}{b.pending ? ` · en attente ${b.pending}` : ""} · {b.method === "OUVRABLES" ? "jours ouvrables" : "jours ouvrés"}</div>
                </Card>
              ))}
              {data.balances.length === 0 && <p className="text-sm text-muted">Aucune politique de congés activée.</p>}
            </div>
            <Card>
              <CardHeader title="Demandes" actions={<Link className={buttonVariants({ size: "sm" })} href={`${base}/conges?new=1&employee=${e.id}`}>Nouvelle demande</Link>} />
              <ul className="divide-y divide-border">
                {data.leaves.map((l) => {
                  const [sl, st] = LEAVE_STATUS[l.status]!;
                  return (
                    <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{LEAVE_TYPE_LABELS[l.type as LeaveType]}</div>
                        <div className="text-xs text-muted">Du {frDate(l.startDate)} au {frDate(l.endDate)} · {l.days} j</div>
                      </div>
                      <StatusPill tone={st}>{sl}</StatusPill>
                    </li>
                  );
                })}
                {data.leaves.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">Aucune demande de congé.</li>}
              </ul>
            </Card>
          </TabPanel>
          <TabPanel value="documents">
            <Card>
              {data.documents.length === 0 && data.payslips.length === 0 ? <EmptyState icon={<FileText />} title="Aucun document">Les bulletins de paie et documents RH du salarié apparaîtront ici.</EmptyState> : (
                <ul className="divide-y divide-border">
                  {data.payslips.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                      <FileText className="size-5 text-brand-500" strokeWidth={1.75} />
                      <div className="flex-1 text-sm">Bulletin de paie de {MONTHS[p.month - 1]} {p.year}</div>
                      <a className={buttonVariants({ size: "sm", variant: "secondary" })} href={`/api/payroll/payslips/${p.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                    </li>
                  ))}
                  {data.documents.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                      <FileText className="size-5 text-muted" strokeWidth={1.75} />
                      <div className="flex-1"><div className="text-sm">{d.title}</div><div className="text-xs text-muted">{d.category} · {frDate(d.createdAt)}</div></div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabPanel>
          <TabPanel value="historique">
            <Card>
              <ul className="divide-y divide-border">
                {data.history.map((h) => (
                  <li key={h.id} className="flex items-start gap-3 px-5 py-3">
                    <Avatar name={h.user} size={28} />
                    <div className="min-w-0 flex-1 text-sm">
                      <b>{h.user}</b> · {h.action.toLowerCase()} {h.entity.toLowerCase()}
                      <div className="text-xs text-muted">{new Date(h.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: tz })}</div>
                    </div>
                  </li>
                ))}
                {data.history.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">Aucun historique.</li>}
              </ul>
            </Card>
          </TabPanel>
        </div>
      </Tabs>
    </div>
  );
}
