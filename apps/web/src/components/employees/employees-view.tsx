"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Download, Eye, FileSpreadsheet, MailPlus, MoreHorizontal, Pencil, RefreshCw, Search, UserPlus, Users, X, Crown, Building, Tags } from "lucide-react";
import { Avatar, Button, Card, Checkbox, cn, EmptyState, Input, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, PageHeader, Segmented, Select, StatusPill, TabPanel, Tabs, td, th, Tooltip } from "@yghr/ui";
import { toast } from "sonner";
import type { EmployeeListData } from "@/server/employee-list";
import { api, download } from "@/lib/api";
import { confirmDialog } from "@/components/confirm";
import { AddEmployeeModal } from "./add-employee-modal";
import { ImportModal } from "./import-modal";
import { TeamLeadsTab } from "./team-leads";

const CONTRACT: Record<string, string> = { CDI: "CDI", CDD: "CDD", INTERIM: "Intérim", STAGE: "Stage" };

export function EmployeesView({ employees, services, categories, leads, base, openNew, initialTab, space }: EmployeeListData & { base: string; openNew?: boolean; initialTab: string; space: "rh" | "chef" }) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState(initialTab);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(!!openNew);
  const [importing, setImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return employees.filter((e) => e.status === status && (!needle || `${e.firstName} ${e.lastName} ${e.email} ${e.matricule ?? ""} ${e.position ?? ""}`.toLowerCase().includes(needle)));
  }, [employees, q, status]);
  const activeCount = employees.filter((e) => e.status === "ACTIVE").length;
  const allSelected = list.length > 0 && list.every((e) => selected.has(e.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(list.map((e) => e.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const refresh = () => { setRefreshing(true); router.refresh(); setTimeout(() => setRefreshing(false), 600); };

  async function bulk(action: string, value?: string | null) {
    const ids = [...selected];
    const r = await api<{ count: number }>("/api/employees/bulk", { body: { ids, action, value } });
    toast.success(`${r.count} salarié(s) mis à jour.`);
    setSelected(new Set());
    router.refresh();
  }
  async function archive(id: string, name: string, restore = false) {
    if (!restore && !(await confirmDialog({ title: `Archiver ${name} ?`, message: "Son accès est désactivé. Son historique (pointages, planning, paie) est conservé et vous pourrez le réactiver.", confirmLabel: "Archiver" }))) return;
    await api(`/api/employees/${id}/archive`, { body: { restore } });
    toast.success(restore ? `${name} est de nouveau actif.` : `${name} a été archivé.`);
    router.refresh();
  }
  async function reinvite(id: string) {
    const r = await api<{ message: string }>(`/api/employees/${id}/invite`, { body: {} });
    toast.success(r.message);
  }

  return (
    <div>
      <PageHeader title="Gestion des salariés" subtitle={`${activeCount} employé${activeCount > 1 ? "s" : ""} au total`} />
      <Tabs value={tab} onValueChange={(t) => { setTab(t); router.replace(`${pathname}${t === "leads" ? "?tab=leads" : ""}`, { scroll: false }); }} tabs={[{ value: "employees", label: "Salariés", icon: <Users />, count: activeCount }, ...(space === "rh" ? [{ value: "leads", label: "Chefs d'équipe", icon: <Crown />, count: leads.length }] : [])]}>
        <TabPanel value="employees" className="mt-5">
          <Card>
            <div className="flex flex-wrap items-center gap-2.5 p-4">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un salarié…" className="pl-9" aria-label="Rechercher un salarié" />
              </div>
              <Segmented value={status} onChange={(v) => { setStatus(v); setSelected(new Set()); }} options={[{ value: "ACTIVE", label: "Actifs" }, { value: "ARCHIVED", label: "Archivés", count: employees.length - activeCount }]} />
              <Tooltip content="Actualiser"><Button variant="secondary" size="icon" onClick={refresh} aria-label="Actualiser"><RefreshCw className={cn(refreshing && "animate-spin")} /></Button></Tooltip>
              <Button variant="secondary" onClick={() => setImporting(true)}><FileSpreadsheet /> Importer (Excel)</Button>
              <Button onClick={() => setAdding(true)}><UserPlus /> Ajouter un salarié</Button>
            </div>

            {selected.size > 0 && (
              <div className="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-[12px] bg-brand-900 px-4 py-2.5 text-sm text-white animate-fade-in">
                <span className="mr-2 font-medium">{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</span>
                {status === "ACTIVE" ? <Button size="sm" variant="onDark" onClick={() => bulk("archive")}><Archive /> Archiver</Button> : <Button size="sm" variant="onDark" onClick={() => bulk("restore")}><ArchiveRestore /> Réactiver</Button>}
                {space === "rh" && (
                  <>
                    <BulkSelect icon={<Crown />} label="Chef d'équipe" options={leads.filter((l) => l.employeeId).map((l) => [l.employeeId!, l.name])} onPick={(v) => bulk("teamLead", v)} />
                    <BulkSelect icon={<Building />} label="Service" options={services.map((s) => [s.id, s.name])} onPick={(v) => bulk("service", v)} />
                    <BulkSelect icon={<Tags />} label="Catégorie" options={categories.map((s) => [s.id, s.name])} onPick={(v) => bulk("category", v)} />
                  </>
                )}
                <Button size="sm" variant="onDark" onClick={() => download(`/api/employees/export?ids=${[...selected].join(",")}`, "salaries.xlsx")}><Download /> Exporter</Button>
                <button onClick={() => setSelected(new Set())} className="ml-auto grid size-7 cursor-pointer place-items-center rounded-md hover:bg-white/10" aria-label="Annuler la sélection"><X className="size-4" /></button>
              </div>
            )}

            {list.length === 0 ? (
              <EmptyState icon={<Users />} title="Aucun employé trouvé" action={!q && status === "ACTIVE" ? <Button onClick={() => setAdding(true)}><UserPlus /> Ajouter un salarié</Button> : undefined}>
                {q ? "Essayez un autre nom, e-mail ou matricule." : status === "ARCHIVED" ? "Aucun salarié archivé." : "Ajoutez vos salariés un par un ou importez-les depuis Excel : ils recevront leurs accès par e-mail."}
              </EmptyState>
            ) : (
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead>
                    <tr>
                      <th className={cn(th, "w-10 pr-0")}><Checkbox checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={toggleAll} aria-label="Tout sélectionner" /></th>
                      {["Employé", "Poste", "Chef d'équipe", "Contact", "Contrat", "Statut", ""].map((h) => <th key={h} className={th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((e) => {
                      const name = `${e.firstName} ${e.lastName}`;
                      return (
                        <tr key={e.id} className={cn("group cursor-pointer transition-colors hover:bg-surface-2/60", selected.has(e.id) && "bg-brand-100/40")} onClick={() => router.push(`${base}/employes/${e.id}`)}>
                          <td className={cn(td, "pr-0")} onClick={(ev) => ev.stopPropagation()}><Checkbox checked={selected.has(e.id)} onChange={() => toggle(e.id)} aria-label={`Sélectionner ${name}`} /></td>
                          <td className={td}>
                            <div className="flex items-center gap-3">
                              <Avatar name={name} size={36} />
                              <div className="min-w-0">
                                <Link href={`${base}/employes/${e.id}`} className="font-medium hover:text-brand-500" onClick={(ev) => ev.stopPropagation()}>{name}</Link>
                                {e.isLead && <Crown className="ml-1.5 inline size-3.5 text-accent-500" aria-label="Chef d'équipe" />}
                                <div className="font-mono text-xs text-muted">{e.matricule ?? "—"}</div>
                              </div>
                            </div>
                          </td>
                          <td className={td}>
                            <div>{e.position ?? <span className="text-muted">—</span>}</div>
                            <div className="text-xs text-muted">{[e.service, e.category].filter(Boolean).join(" · ")}</div>
                          </td>
                          <td className={cn(td, "text-[13px]")}>{e.teamLead ?? <span className="text-muted">—</span>}</td>
                          <td className={td}>
                            <div className="max-w-[220px] truncate text-[13px]">{e.email}</div>
                            <div className="text-xs text-muted">{e.phone ?? ""}</div>
                          </td>
                          <td className={td}>
                            {e.contractType ? <StatusPill tone="brand">{CONTRACT[e.contractType]}</StatusPill> : <span className="text-muted">—</span>}
                            {e.weeklyHours && <div className="mt-1 text-xs text-muted">{e.weeklyHours} h/sem.</div>}
                          </td>
                          <td className={td}>
                            {e.status === "ARCHIVED" ? <StatusPill>Archivé</StatusPill> : e.access === "invited" ? <Tooltip content="Invitation envoyée, compte pas encore activé"><span><StatusPill tone="warning" dot>Invité</StatusPill></span></Tooltip> : <StatusPill tone="success" dot>Actif</StatusPill>}
                          </td>
                          <td className={cn(td, "text-right")} onClick={(ev) => ev.stopPropagation()}>
                            <Menu>
                              <MenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`Actions pour ${name}`}><MoreHorizontal /></Button></MenuTrigger>
                              <MenuContent>
                                <MenuItem icon={<Eye />} onSelect={() => router.push(`${base}/employes/${e.id}`)}>Voir la fiche</MenuItem>
                                <MenuItem icon={<Pencil />} onSelect={() => router.push(`${base}/employes/${e.id}?edit=1`)}>Modifier</MenuItem>
                                {e.access !== "active" && e.status === "ACTIVE" && <MenuItem icon={<MailPlus />} onSelect={() => reinvite(e.id)}>Renvoyer l'invitation</MenuItem>}
                                <MenuSeparator />
                                {e.status === "ACTIVE" ? <MenuItem icon={<Archive />} danger onSelect={() => archive(e.id, name)}>Archiver</MenuItem> : <MenuItem icon={<ArchiveRestore />} onSelect={() => archive(e.id, name, true)}>Réactiver</MenuItem>}
                              </MenuContent>
                            </Menu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabPanel>
        {space === "rh" && (
          <TabPanel value="leads" className="mt-5">
            <TeamLeadsTab leads={leads} employees={employees.filter((e) => e.status === "ACTIVE")} />
          </TabPanel>
        )}
      </Tabs>
      {adding && <AddEmployeeModal services={services} categories={categories} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); router.refresh(); }} canCreateRefs={space === "rh"} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => router.refresh()} />}
    </div>
  );
}

function BulkSelect({ icon, label, options, onPick }: { icon: React.ReactNode; label: string; options: string[][]; onPick: (v: string | null) => void }) {
  return (
    <Menu>
      <MenuTrigger asChild><Button size="sm" variant="onDark">{icon} {label}</Button></MenuTrigger>
      <MenuContent align="start" className="max-h-72 overflow-y-auto">
        <MenuItem onSelect={() => onPick(null)}>— Aucun —</MenuItem>
        {options.map(([id, n]) => <MenuItem key={id} onSelect={() => onPick(id!)}>{n}</MenuItem>)}
      </MenuContent>
    </Menu>
  );
}

