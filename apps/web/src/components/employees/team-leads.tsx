"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Crown, Pencil, RefreshCw, Search, ShieldCheck, UserMinus, Users } from "lucide-react";
import { ALL_PERMISSIONS, PERMISSION_GROUPS, type PermissionSet } from "@yghr/core";
import { Avatar, Button, Card, Checkbox, cn, EmptyState, Input, Modal, SectionLabel, Select, StatusPill } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { confirmDialog } from "@/components/confirm";
import type { EmployeeListData } from "@/server/employee-list";

type Lead = EmployeeListData["leads"][number];
type Emp = EmployeeListData["employees"][number];

export function TeamLeadsTab({ leads, employees }: { leads: Lead[]; employees: Emp[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Lead | "new" | null>(null);
  const inTeam = employees.filter((e) => e.teamLeadId).length;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <p className="flex-1 text-sm text-muted">
          <b className="text-text">{leads.length}</b> chef{leads.length > 1 ? "s" : ""} · <b className="text-text">{inTeam}</b> en équipe · <b className="text-text">{employees.length - inTeam - leads.length > 0 ? employees.length - inTeam - leads.length : 0}</b> sans équipe
        </p>
        <Button variant="secondary" size="icon" onClick={() => router.refresh()} aria-label="Actualiser"><RefreshCw /></Button>
        <Button onClick={() => setEditing("new")}><Crown /> Nouveau chef d'équipe</Button>
      </div>
      {leads.length === 0 ? (
        <EmptyState icon={<Crown />} title="Aucun chef d'équipe" action={<Button onClick={() => setEditing("new")}><Crown /> Nouveau chef d'équipe</Button>}>
          Nommez un chef d'équipe parmi vos salariés : il recevra un e-mail pour créer son mot de passe.
        </EmptyState>
      ) : (
        <div className="grid gap-4 px-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
          {leads.map((l) => {
            const granted = ALL_PERMISSIONS.filter((p) => l.permissions[p]).length;
            return (
              <div key={l.membershipId} className="rounded-[14px] border border-border p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={l.name} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-semibold"><span className="truncate">{l.name}</span><Crown className="size-3.5 shrink-0 text-accent-500" /></div>
                    <div className="truncate text-xs text-muted">{l.position ?? l.email}</div>
                  </div>
                  {!l.activated && <StatusPill tone="warning" dot>Invité</StatusPill>}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-[10px] bg-surface-2 py-2"><div className="font-display text-lg font-bold tabular">{l.teamSize}</div><div className="text-[11px] text-muted">membres</div></div>
                  <div className="rounded-[10px] bg-surface-2 py-2"><div className="font-display text-lg font-bold tabular">{granted}/{ALL_PERMISSIONS.length}</div><div className="text-[11px] text-muted">droits</div></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {PERMISSION_GROUPS.map((g) => {
                    const n = g.items.filter((i) => l.permissions[i.key]).length;
                    return n ? <span key={g.key} className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] text-brand-700 dark:text-brand-400">{g.label.toLowerCase()} {n}/{g.items.length}</span> : null;
                  })}
                </div>
                <Button size="sm" variant="secondary" className="mt-4 w-full" onClick={() => setEditing(l)}><Pencil /> Éditer les droits</Button>
              </div>
            );
          })}
        </div>
      )}
      {editing && <LeadModal lead={editing === "new" ? null : editing} employees={employees} leads={leads} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </Card>
  );
}

function LeadModal({ lead, employees, leads, onClose, onSaved }: { lead: Lead | null; employees: Emp[]; leads: Lead[]; onClose: () => void; onSaved: () => void }) {
  const [employeeId, setEmployeeId] = useState(lead?.employeeId ?? "");
  const [perms, setPerms] = useState<PermissionSet>(lead?.permissions ?? { "planning.manage": true, "leaves.approve": true, "attendance.validate": true, "reports.view": true });
  const [members, setMembers] = useState<Set<string>>(new Set(lead ? employees.filter((e) => e.teamLeadId === lead.employeeId).map((e) => e.id) : []));
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const all = ALL_PERMISSIONS.every((p) => perms[p]);
  const leadIds = new Set(leads.map((l) => l.employeeId));
  const candidates = employees.filter((e) => !leadIds.has(e.id) || e.id === lead?.employeeId);
  const memberList = useMemo(() => employees.filter((e) => e.id !== employeeId && `${e.firstName} ${e.lastName} ${e.service ?? ""}`.toLowerCase().includes(q.toLowerCase())), [employees, employeeId, q]);

  async function save() {
    setSaving(true);
    try {
      if (lead) await api(`/api/permissions/${lead.membershipId}`, { method: "PATCH", body: { permissions: perms, memberIds: [...members] } });
      else {
        const r = await api<{ invited: boolean }>("/api/team-leads", { body: { employeeId, permissions: perms, memberIds: [...members] } });
        toast.success(r.invited ? "Chef d'équipe créé : l'invitation a été envoyée par e-mail." : "Chef d'équipe créé : il garde son compte existant.");
      }
      if (lead) toast.success("Droits mis à jour.");
      onSaved();
    } catch {}
    setSaving(false);
  }
  async function revoke() {
    if (!lead || !(await confirmDialog({ title: `Retirer le rôle de chef d'équipe à ${lead.name} ?`, message: "Il redevient salarié. Les membres de son équipe n'auront plus de chef.", danger: true, confirmLabel: "Retirer le rôle" }))) return;
    await api(`/api/permissions/${lead.membershipId}`, { method: "PATCH", body: { revoke: true } });
    toast.success("Rôle retiré.");
    onSaved();
  }

  return (
    <Modal
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      icon={<Crown />}
      title={lead ? `Droits de ${lead.name}` : "Nouveau chef d'équipe"}
      subtitle={lead ? "Les droits s'appliquent uniquement aux membres de son équipe." : "Choisissez la personne qui devient chef d'équipe. Si elle a déjà un compte (responsable ou salarié déjà connecté), elle garde ce compte ; sinon elle reçoit un e-mail pour créer son mot de passe (lien valable 7 jours)."}
      footer={<>
        {lead && <Button variant="danger-ghost" className="mr-auto" onClick={revoke}><UserMinus /> Retirer le rôle</Button>}
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button onClick={save} loading={saving} disabled={!employeeId}>{lead ? "Enregistrer" : "Créer et envoyer l'invitation"}</Button>
      </>}
    >
      <div className="space-y-6">
        {!lead && (
          <section className="space-y-2">
            <SectionLabel>Salarié ou responsable</SectionLabel>
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} aria-label="Salarié">
              <option value="">Rechercher une personne…</option>
              {candidates.map((e) => <option key={e.id} value={e.id}>{e.lastName} {e.firstName}{e.position ? ` — ${e.position}` : ""}</option>)}
            </Select>
          </section>
        )}
        <section className="space-y-3">
          <SectionLabel><ShieldCheck className="size-3.5" /> Droits</SectionLabel>
          <div className="rounded-[12px] border border-brand-500/30 bg-brand-100/40 p-3">
            <Checkbox checked={all} indeterminate={!all && ALL_PERMISSIONS.some((p) => perms[p])} onChange={() => setPerms(all ? {} : Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, true])))} label={<b>Tous les droits (comme le responsable, limité à son équipe)</b>} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {PERMISSION_GROUPS.map((g) => (
              <div key={g.key} className="rounded-[12px] border border-border p-3.5">
                <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{g.label}</div>
                <div className="space-y-2">
                  {g.items.map((i) => <Checkbox key={i.key} checked={!!perms[i.key]} onChange={(e) => setPerms({ ...perms, [i.key]: e.target.checked })} label={i.label} />)}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-3">
          <SectionLabel><Users className="size-3.5" /> Membres de l'équipe · {members.size}</SectionLabel>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer par nom ou service…" className="pl-9" />
          </div>
          <div className="scrollbar-thin grid max-h-60 gap-1 overflow-y-auto rounded-[12px] border border-border p-2 sm:grid-cols-2">
            {memberList.map((e) => (
              <label key={e.id} className={cn("flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-1.5 hover:bg-surface-2", members.has(e.id) && "bg-brand-100/50")}>
                <Checkbox checked={members.has(e.id)} onChange={() => setMembers((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })} />
                <Avatar name={`${e.firstName} ${e.lastName}`} size={24} />
                <span className="min-w-0 flex-1 truncate text-sm">{e.firstName} {e.lastName}</span>
                <span className="truncate text-[11px] text-muted">{e.service}</span>
              </label>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
