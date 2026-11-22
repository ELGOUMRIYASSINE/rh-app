"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCheck, ChevronLeft, ChevronRight, Clock, LogIn, LogOut, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, UserX, ShieldCheck, CalendarX, FileText } from "lucide-react";
import { addDays, formatLongDateFr, isoWeek, startOfIsoWeek, weekday } from "@yghr/core";
import { Avatar, Button, Card, Checkbox, cn, EmptyState, Field, Input, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Modal, Select, Skeleton, StatusPill, Textarea } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { hm, timeIn } from "@/lib/format";

interface DaySum { date: string; planned: number; total: number; validated: number; absent: number }
interface Row {
  employeeId: string; name: string; position: string | null;
  planned: { code: string; name: string; color: string; start: string; end: string }[];
  punches: { id: string; at: string; source: string; deleted: boolean; reason: string | null; direction: string | null; state: string | null; original: string | null; by: string | null }[];
  day: { status: string; worked: number; night: number; overtime: number; late: number; early: number; issues: string[]; justified: boolean | null; absenceReason: string | null; absenceNote: string | null; validated: boolean } | null;
}
export const ABSENCE_REASON: Record<string, string> = { SICK: "Maladie", WORK_ACCIDENT: "Accident du travail", LEAVE: "Congé", AUTHORIZED: "Absence autorisée", TRAINING: "Formation / mission", FAMILY: "Événement familial", UNJUSTIFIED: "Absence injustifiée", OTHER: "Autre motif" };

/** Entrée / Sortie for each clock-in: the clock's own key when known, otherwise alternating in time order. */
function withDirection(punches: Row["punches"]) {
  let i = 0;
  return punches.map((p) => {
    if (p.deleted) return { ...p, dir: (p.direction as "IN" | "OUT" | null) ?? null };
    const dir = (p.direction as "IN" | "OUT" | null) ?? (i % 2 === 0 ? "IN" : "OUT");
    i++;
    return { ...p, dir };
  });
}

const DAY_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const ISSUE: Record<string, string> = { MISSING_OUT: "Sortie manquante", PUNCH_WITHOUT_SHIFT: "Pointage sans shift", ABSENT: "Absent", LATE: "Retard", EARLY_LEAVE: "Sortie anticipée" };

function Ring({ done, total }: { done: number; total: number }) {
  const pct = total ? done / total : 0;
  const r = 13;
  const c = 2 * Math.PI * r;
  return (
    <svg width="34" height="34" className="-rotate-90" aria-hidden>
      <circle cx="17" cy="17" r={r} fill="none" strokeWidth="4" className="stroke-surface-2" />
      {total > 0 && <circle cx="17" cy="17" r={r} fill="none" strokeWidth="4" strokeLinecap="round" stroke={pct >= 1 ? "var(--success)" : pct > 0 ? "var(--warning)" : "var(--border)"} strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />}
    </svg>
  );
}

export function AttendanceGestion({ today, tz, back }: { today: string; tz: string; back: string }) {
  const qc = useQueryClient();
  const [monday, setMonday] = useState(startOfIsoWeek(today));
  const [date, setDate] = useState(today);
  const week = useQuery({ queryKey: ["att-week", monday], queryFn: () => api<{ days: DaySum[] }>(`/api/attendance/week?from=${monday}`) });
  const day = useQuery({ queryKey: ["att-day", date], queryFn: () => api<{ rows: Row[] }>(`/api/attendance/day?date=${date}`) });
  const [edit, setEdit] = useState<{ row: Row; action: "add" | "move" | "delete"; punch?: Row["punches"][number] } | null>(null);
  const [absence, setAbsence] = useState<Row | null>(null);
  const [validating, setValidating] = useState(false);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["att-week"] }); void qc.invalidateQueries({ queryKey: ["att-day"] }); };
  const rows = day.data?.rows ?? [];
  const absent = rows.filter((r) => r.day?.status === "ABSENT").length;
  const allValidated = rows.length > 0 && rows.every((r) => r.day?.validated);

  async function validate() {
    setValidating(true);
    try {
      const r = await api<{ count: number; warning: string | null }>("/api/attendance/validate-day", { body: { date } });
      toast.success(`${r.count} présence(s) validée(s) pour le ${date.split("-").reverse().join("/")}.`, { description: r.warning ?? undefined });
      refresh();
    } catch {}
    setValidating(false);
  }
  async function clearAbsence(r: Row) {
    await api("/api/attendance/mark", { body: { employeeId: r.employeeId, date, reason: null } });
    toast.success("Motif d'absence retiré.");
    refresh();
  }

  return (
    <div>
      <Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" /> Présences</Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-bold">Gestion et validation des pointages</h1>
          <p className="mt-1 text-sm text-muted">Comparez le planning aux pointages, corrigez avec un motif, puis validez la journée. La paie n'utilise que les journées validées.</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit p-3">
          <div className="mb-2 flex items-center justify-between">
            <Button size="icon-sm" variant="ghost" onClick={() => { setMonday(addDays(monday, -7)); setDate(addDays(monday, -7)); }} aria-label="Semaine précédente"><ChevronLeft /></Button>
            <span className="rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-semibold text-accent-700">Semaine {isoWeek(monday).week}</span>
            <Button size="icon-sm" variant="ghost" onClick={() => { setMonday(addDays(monday, 7)); setDate(addDays(monday, 7)); }} disabled={addDays(monday, 7) > today} aria-label="Semaine suivante"><ChevronRight /></Button>
          </div>
          <ul className="space-y-1">
            {(week.data?.days ?? Array.from({ length: 7 }, (_, i) => ({ date: addDays(monday, i), planned: 0, total: 0, validated: 0, absent: 0 }))).map((d) => (
              <li key={d.date}>
                <button onClick={() => setDate(d.date)} disabled={d.date > today} className={cn("flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition disabled:cursor-default disabled:opacity-40", date === d.date ? "bg-brand-100" : "hover:bg-surface-2")}>
                  <Ring done={d.validated} total={d.total} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{DAY_FR[weekday(d.date)]} {Number(d.date.slice(8))}</div>
                    <div className="text-xs text-muted">{d.total ? (d.validated >= d.total ? "Validée" : d.validated ? `${d.validated}/${d.total} validés` : "Non validée") : "Aucun planning"}</div>
                  </div>
                  {d.absent > 0 && <span className="rounded-full bg-danger-100 px-1.5 text-[11px] font-semibold text-danger">{d.absent}</span>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
            <h2 className="mr-2 font-display text-base font-semibold">{formatLongDateFr(date)}</h2>
            <StatusPill tone="brand">{rows.filter((r) => r.planned.length).length} prévus</StatusPill>
            <StatusPill tone={absent ? "danger" : "neutral"}>{absent} absent{absent > 1 ? "s" : ""}</StatusPill>
            <div className="ml-auto flex gap-2">
              <Button size="icon" variant="secondary" onClick={refresh} aria-label="Actualiser"><RefreshCw className={cn(day.isFetching && "animate-spin")} /></Button>
              <Button onClick={validate} loading={validating} disabled={!rows.length || allValidated || date > today}><CheckCheck /> {allValidated ? "Journée validée" : "Valider la journée (RH)"}</Button>
            </div>
          </div>
          {day.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div> : rows.length === 0 ? (
            <EmptyState icon={<CalendarX />} title="Aucun planning ce jour">Aucun shift publié et aucun pointage pour cette journée.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => {
                const live = r.punches.filter((p) => !p.deleted);
                const v = !!r.day?.validated;
                return (
                  <li key={r.employeeId} className={cn("grid gap-4 p-4 md:grid-cols-[220px_1fr_auto]", r.day?.status === "ABSENT" && "bg-danger-100/25")}>
                    <div className="flex items-start gap-3">
                      <Avatar name={r.name} size={36} />
                      <div className="min-w-0">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted">{r.position ?? ""}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {v && <StatusPill tone="success"><ShieldCheck className="size-3" /> Validé</StatusPill>}
                          {r.day?.absenceReason ? <StatusPill tone={r.day.absenceReason === "UNJUSTIFIED" ? "danger" : "info"}>{ABSENCE_REASON[r.day.absenceReason] ?? r.day.absenceReason}</StatusPill> : r.day?.justified === true ? <StatusPill tone="info">Absence justifiée</StatusPill> : r.day?.justified === false ? <StatusPill tone="danger">Absence injustifiée</StatusPill> : null}
                        </div>
                        {r.day?.absenceNote && <p className="mt-1.5 flex gap-1.5 text-xs text-muted"><FileText className="mt-0.5 size-3 shrink-0" />{r.day.absenceNote}</p>}
                      </div>
                    </div>
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="w-16 text-xs font-semibold uppercase tracking-wide text-muted">Prévu</span>
                        {r.planned.length ? r.planned.map((p) => <span key={p.code} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 font-mono text-xs"><span className="size-2 rounded-full" style={{ background: p.color }} />{p.code} {p.start}–{p.end}</span>) : <span className="text-xs text-muted">Pas de shift</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="w-16 text-xs font-semibold uppercase tracking-wide text-muted">Réel</span>
                        {withDirection(r.punches).filter((p) => !p.deleted).map((p) => (
                          <div key={p.id} className="flex flex-col">
                            <span className={cn("group inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs", p.source === "CORRECTION" ? "bg-accent-100 text-accent-700" : p.dir === "IN" ? "bg-success-100 text-success" : "bg-brand-100 text-brand-700 dark:text-brand-400")}>
                              {p.dir === "IN" ? <LogIn className="size-3" /> : <LogOut className="size-3" />}
                              <span className="font-medium">{p.state ?? (p.dir === "IN" ? "Entrée" : "Sortie")}</span>
                              <span className="font-mono">{timeIn(p.at, tz)}</span>
                              {!v ? (
                                <Menu>
                                  <MenuTrigger asChild><button className="grid size-5 cursor-pointer place-items-center rounded-full hover:bg-black/10" aria-label="Modifier ce pointage"><MoreHorizontal className="size-3" /></button></MenuTrigger>
                                  <MenuContent align="start">
                                    <MenuItem icon={<Pencil />} onSelect={() => setEdit({ row: r, action: "move", punch: p })}>Modifier l&apos;heure</MenuItem>
                                    <MenuItem icon={<Trash2 />} danger onSelect={() => setEdit({ row: r, action: "delete", punch: p })}>Supprimer</MenuItem>
                                  </MenuContent>
                                </Menu>
                              ) : <span className="w-1" />}
                            </span>
                            {p.source === "CORRECTION" && (
                              <span className="mt-1 max-w-[260px] pl-1 text-[11px] leading-snug text-muted">
                                {p.original ? <>Pointé à <b className="font-mono text-text">{timeIn(p.original, tz)}</b> sur la pointeuse<br /></> : <>Ajouté manuellement<br /></>}
                                <span className="italic">« {p.reason} »</span>{p.by ? ` · ${p.by}` : ""}
                              </span>
                            )}
                          </div>
                        ))}
                        {!live.length && <span className="text-xs text-danger">Aucun pointage</span>}
                        {!v && <button onClick={() => setEdit({ row: r, action: "add" })} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted hover:border-brand-500 hover:text-brand-500"><Plus className="size-3" /> Ajouter</button>}
                      </div>
                      {r.punches.some((p) => p.deleted && !p.reason?.startsWith("Déplacé")) && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className="w-16 font-semibold uppercase tracking-wide">Ignorés</span>
                          {r.punches.filter((p) => p.deleted && !p.reason?.startsWith("Déplacé")).map((p) => <span key={p.id} title={p.reason ?? ""}><span className="font-mono line-through">{timeIn(p.at, tz)}</span>{p.reason ? ` (${p.reason})` : ""}</span>)}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {r.day?.issues.filter((i) => i !== "LATE" && i !== "ABSENT").map((i) => <StatusPill key={i} tone="danger">{ISSUE[i] ?? i}</StatusPill>)}
                      </div>
                    </div>
                    <div className="flex items-start gap-4 md:justify-end">
                      <dl className="grid grid-cols-4 gap-3 text-center md:grid-cols-2 xl:grid-cols-4">
                        {[["Travaillé", hm(r.day?.worked ?? 0)], ["Retard", r.day?.late ? `${r.day.late} min` : "Aucun"], ["Nuit", r.day?.night ? hm(r.day.night) : "0h00"], ["H. sup", r.day?.overtime ? hm(r.day.overtime) : "0h00"]].map(([k, val]) => (
                          <div key={k}><dt className="text-[10.5px] uppercase tracking-wide text-muted">{k}</dt><dd className={cn("font-mono text-sm tabular", k === "Retard" && r.day?.late && "text-[#9a6a00] dark:text-warning")}>{val}</dd></div>
                        ))}
                      </dl>
                      {!v && r.planned.length > 0 && (
                        <Menu>
                          <MenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="Plus d'actions"><MoreHorizontal /></Button></MenuTrigger>
                          <MenuContent>
                            <MenuItem icon={<UserX />} onSelect={() => setAbsence(r)}>{r.day?.absenceReason || r.day?.justified != null ? "Modifier le motif d'absence" : "Indiquer un motif d'absence"}</MenuItem>
                            {(r.day?.absenceReason || r.day?.justified != null) && <><MenuSeparator /><MenuItem icon={<Clock />} onSelect={() => clearAbsence(r)}>Retirer le motif</MenuItem></>}
                          </MenuContent>
                        </Menu>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      {absence && <AbsenceModal row={absence} date={date} onClose={() => setAbsence(null)} onDone={() => { setAbsence(null); refresh(); }} />}
      {edit && <CorrectionModal edit={edit} date={date} tz={tz} onClose={() => setEdit(null)} onDone={() => { setEdit(null); refresh(); }} />}
    </div>
  );
}

function CorrectionModal({ edit, date, tz, onClose, onDone }: { edit: { row: Row; action: "add" | "move" | "delete"; punch?: Row["punches"][number] }; date: string; tz: string; onClose: () => void; onDone: () => void }) {
  const [time, setTime] = useState(edit.punch ? timeIn(edit.punch.at, tz) : edit.row.planned[0]?.start ?? "08:00");
  const [nextDay, setNextDay] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const title = { add: "Ajouter un pointage", move: "Modifier l'heure du pointage", delete: "Supprimer le pointage" }[edit.action];
  async function save() {
    setSaving(true);
    try {
      await api("/api/attendance/corrections", { body: { employeeId: edit.row.employeeId, date, action: edit.action, punchId: edit.punch?.id, time: edit.action === "delete" ? undefined : time, nextDay, reason } });
      toast.success("Correction enregistrée et tracée dans le journal d'audit.");
      onDone();
    } catch {}
    setSaving(false);
  }
  return (
    <Modal open size="sm" onOpenChange={(o) => !o && onClose()} title={title} subtitle={`${edit.row.name} · ${date.split("-").reverse().join("/")}`} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant={edit.action === "delete" ? "danger" : "primary"} onClick={save} loading={saving} disabled={reason.trim().length < 3}>Enregistrer</Button></>}>
      <div className="space-y-4">
        {edit.action !== "delete" ? (
          <div className="flex items-end gap-4">
            <Field label="Heure" htmlFor="ct"><Input id="ct" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-32 font-mono" /></Field>
            <div className="pb-2.5"><Checkbox label="Le lendemain" checked={nextDay} onChange={(e) => setNextDay(e.target.checked)} /></div>
          </div>
        ) : <p className="text-sm">Le pointage de <b className="font-mono">{edit.punch ? timeIn(edit.punch.at, tz) : ""}</b> sera ignoré (il reste visible, barré, pour la traçabilité).</p>}
        {edit.action === "move" && edit.punch && <p className="rounded-[10px] bg-surface-2 px-3 py-2 text-xs text-muted">Heure enregistrée par la pointeuse : <b className="font-mono text-text">{timeIn(edit.punch.original ?? edit.punch.at, tz)}</b>. Elle reste affichée sous l&apos;heure corrigée, avec votre justification.</p>}
        <Field label="Justification" required htmlFor="cr" help="Obligatoire. Exemples : oubli de badge, double pointage, pointeuse en panne, autorisation de sortie…"><Textarea id="cr" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function AbsenceModal({ row, date, onClose, onDone }: { row: Row; date: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(row.day?.absenceReason ?? (row.day?.justified === false ? "UNJUSTIFIED" : "SICK"));
  const [note, setNote] = useState(row.day?.absenceNote ?? "");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api("/api/attendance/mark", { body: { employeeId: row.employeeId, date, reason, note: note.trim() || null } });
      toast.success(reason === "UNJUSTIFIED" ? "Absence injustifiée enregistrée (retenue en paie)." : "Motif d'absence enregistré.");
      onDone();
    } catch {}
    setSaving(false);
  }
  return (
    <Modal open size="sm" onOpenChange={(o) => !o && onClose()} icon={<UserX />} title="Motif d'absence" subtitle={`${row.name} · ${date.split("-").reverse().join("/")}`} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={saving}>Enregistrer</Button></>}>
      <div className="space-y-4">
        <Field label="Motif" required htmlFor="ar">
          <Select id="ar" value={reason} onChange={(e) => setReason(e.target.value)}>
            {Object.entries(ABSENCE_REASON).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <p className={cn("rounded-[10px] px-3 py-2 text-xs", reason === "UNJUSTIFIED" ? "bg-danger-100 text-danger" : "bg-info-100 text-info")}>{reason === "UNJUSTIFIED" ? "Une absence injustifiée est retenue sur la paie." : "Absence justifiée : pas de retenue sur la paie."}</p>
        <Field label="Précisions" htmlFor="an" help="Facultatif. Exemples : certificat médical reçu, rendez-vous administratif, prévenu par téléphone…"><Textarea id="an" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
      </div>
    </Modal>
  );
}
