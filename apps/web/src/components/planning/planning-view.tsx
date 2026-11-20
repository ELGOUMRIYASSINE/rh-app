"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, ClipboardPaste, Copy, Eraser, HelpCircle, Lock, Moon, Plus, Printer, Redo2, Search, Send, Undo2, X, Crown, Clock3,
} from "lucide-react";
import {
  addDays, anchoredInterval, type Anomaly, eachDay, isoWeek, nightMinutes, shiftDurationMinutes, startOfIsoWeek, weekday,
} from "@yghr/core";
import { Avatar, Button, cn, readableText, Field, Input, Segmented, Select, SideSheet, Skeleton, Tooltip, Card, Checkbox } from "@yghr/ui";
import { toast } from "sonner";
import type { PlanningData } from "@/server/planning";
import { api, download, HttpError } from "@/lib/api";
import { dh, hm } from "@/lib/format";
import { AnomalyCounters, AnomalyList } from "./anomaly-list";
import { confirmDialog } from "@/components/confirm";
import { useRealtimeEvent } from "@/components/shell/realtime";

type CellWrite = { employeeId: string; date: string; shiftTypeId?: string | null; customStart?: string | null; customEnd?: string | null; breakMinutes?: number | null; clear?: boolean };
type Assignment = PlanningData["assignments"][number];
const key = (e: string, d: string) => `${e}|${d}`;
const DAY_FR = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
const MON_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function monthRange(anchor: string) {
  const first = `${anchor.slice(0, 7)}-01`;
  const [y, m] = anchor.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: first, to: `${anchor.slice(0, 7)}-${String(last).padStart(2, "0")}` };
}
const fmtShort = (d: string) => `${Number(d.slice(8))} ${MON_FR[Number(d.slice(5, 7)) - 1]}`;

export function PlanningView({ today, title = "Planning" }: { today: string; title?: string }) {
  const qc = useQueryClient();
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(startOfIsoWeek(today));
  const { from, to } = view === "week" ? { from: startOfIsoWeek(anchor), to: addDays(startOfIsoWeek(anchor), 6) } : monthRange(anchor);
  const days = useMemo(() => eachDay(from, to), [from, to]);

  const q = useQuery({ queryKey: ["planning", from, to], queryFn: () => api<PlanningData>(`/api/planning?from=${from}&to=${to}`), placeholderData: (p) => p });
  const an = useQuery({ queryKey: ["planning-anomalies", from, to], queryFn: () => api<{ anomalies: Anomaly[]; blocking: number; warnings: number }>(`/api/planning/anomalies?from=${from}&to=${to}`, { silent: true }), placeholderData: (p) => p });
  const data = q.data;
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["planning"] });
    void qc.invalidateQueries({ queryKey: ["planning-anomalies"] });
  }, [qc]);
  useRealtimeEvent("planning:published", refresh);
  useRealtimeEvent("leave:updated", refresh);

  // ── filters ──
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [serviceId, setServiceId] = useState("");
  const [centreId, setCentreId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const employees = useMemo(() => (data?.employees ?? []).filter((e) => {
    if (search && !`${e.firstName} ${e.lastName}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (role === "lead" && !e.isLead) return false;
    if (role === "employee" && e.isLead) return false;
    if (serviceId && e.serviceId !== serviceId) return false;
    if (centreId && e.centreId !== centreId) return false;
    if (categoryId && e.staffCategoryId !== categoryId) return false;
    return true;
  }), [data, search, role, serviceId, centreId, categoryId]);

  // ── indexes ──
  const stMap = useMemo(() => new Map((data?.shiftTypes ?? []).map((s) => [s.id, s])), [data]);
  const byCell = useMemo(() => {
    const m = new Map<string, Assignment>();
    for (const a of data?.assignments ?? []) if (!a.leaveRequestId) m.set(key(a.employeeId, a.date), a);
    return m;
  }, [data]);
  const leaveAt = useCallback((e: string, d: string) => data?.leaves.find((l) => l.employeeId === e && l.startDate <= d && l.endDate >= d), [data]);
  const unavailable = useMemo(() => new Set(data?.unavailable ?? []), [data]);
  const validated = useMemo(() => new Set((data?.locks.validated ?? []).map((v) => v.replace(":", "|"))), [data]);
  const monthLocked = (d: string) => !!data?.locks.lockedMonths.includes(d.slice(0, 7));
  const isLocked = (e: string, d: string) => monthLocked(d) || validated.has(key(e, d));

  const minutesOf = useCallback((a: Assignment | undefined) => {
    if (!a) return { paid: 0, night: 0 };
    const t = a.shiftTypeId ? stMap.get(a.shiftTypeId) : undefined;
    const start = a.customStart ?? t?.startTime;
    const end = a.customEnd ?? t?.endTime;
    if (!start || !end) return { paid: 0, night: 0 };
    const paid = shiftDurationMinutes({ startTime: start, endTime: end, breakMinutes: a.breakMinutes ?? t?.breakMinutes ?? 0, breakPaid: t?.breakPaid ?? false });
    const night = data ? nightMinutes(anchoredInterval(a.date, start, end), data.nightStart, data.nightEnd) : 0;
    return { paid, night: Math.min(night, paid) };
  }, [stMap, data]);

  // ── selection, undo/redo ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ before: CellWrite[]; after: CellWrite[] }[]>([]);
  const [redo, setRedo] = useState<{ before: CellWrite[]; after: CellWrite[] }[]>([]);
  const [busy, setBusy] = useState(false);

  const snapshot = useCallback((e: string, d: string): CellWrite => {
    const a = byCell.get(key(e, d));
    return a ? { employeeId: e, date: d, shiftTypeId: a.shiftTypeId, customStart: a.customStart, customEnd: a.customEnd, breakMinutes: a.breakMinutes } : { employeeId: e, date: d, clear: true };
  }, [byCell]);

  const write = useCallback(async (after: CellWrite[], record = true) => {
    const cells = after.filter((c) => !isLocked(c.employeeId, c.date) && !leaveAt(c.employeeId, c.date));
    if (!cells.length) {
      if (after.length) toast.error("Ces cellules sont verrouillées ou couvertes par un congé.");
      return false;
    }
    const before = cells.map((c) => snapshot(c.employeeId, c.date));
    setBusy(true);
    try {
      await api("/api/planning/assignments", { body: { cells } });
      if (record) {
        setUndo((u) => [...u.slice(-49), { before, after: cells }]);
        setRedo([]);
      }
      refresh();
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, refresh, data]);

  const doUndo = async () => {
    const last = undo[undo.length - 1];
    if (!last) return;
    if (await write(last.before, false)) {
      setUndo((u) => u.slice(0, -1));
      setRedo((r) => [...r, last]);
    }
  };
  const doRedo = async () => {
    const last = redo[redo.length - 1];
    if (!last) return;
    if (await write(last.after, false)) {
      setRedo((r) => r.slice(0, -1));
      setUndo((u) => [...u, last]);
    }
  };

  // ── picker (quick shift chooser) ──
  const [picker, setPicker] = useState<{ x: number; y: number; cells: string[] } | null>(null);
  const [custom, setCustom] = useState({ start: "08:00", end: "16:00", breakMinutes: 30 });
  const openPicker = (ev: React.MouseEvent, cellKey: string) => {
    const [e, d] = cellKey.split("|") as [string, string];
    if (isLocked(e, d)) return toast.info("Journée verrouillée (présences validées ou paie validée).");
    if (leaveAt(e, d)) return toast.info("Ce jour est couvert par un congé approuvé.");
    let cells = [cellKey];
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
      const next = new Set(selected);
      if (next.has(cellKey)) next.delete(cellKey);
      else next.add(cellKey);
      setSelected(next);
      return;
    }
    if (selected.size && selected.has(cellKey)) cells = [...selected];
    else setSelected(new Set());
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    setPicker({ x: Math.min(r.left, window.innerWidth - 300), y: Math.min(r.bottom + 4, window.innerHeight - 380), cells });
  };
  const applyToPicker = async (w: Omit<CellWrite, "employeeId" | "date">) => {
    if (!picker) return;
    const cells = picker.cells.map((k) => { const [e, d] = k.split("|") as [string, string]; return { employeeId: e, date: d, ...w }; });
    setPicker(null);
    setSelected(new Set());
    await write(cells);
  };

  // ── row clipboard (copy week / paste / clear) ──
  const [clip, setClip] = useState<{ from: string; cells: Omit<CellWrite, "employeeId">[] } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; employeeId: string } | null>(null);
  const copyRow = (employeeId: string) => {
    setClip({ from, cells: days.map((d) => { const { employeeId: _e, ...rest } = snapshot(employeeId, d); return rest; }) });
    toast.success("Ligne copiée. Clic droit sur une autre ligne (ou une autre semaine) puis « Coller ».");
  };
  const pasteRow = (employeeId: string) => {
    if (!clip) return;
    const shift = days.length;
    void write(clip.cells.slice(0, shift).map((c, i) => ({ ...c, employeeId, date: days[i]! })));
  };
  const clearRow = async (employeeId: string) => {
    if (!(await confirmDialog({ title: "Vider la ligne sur la période affichée ?", confirmLabel: "Vider", danger: true }))) return;
    void write(days.filter((d) => byCell.has(key(employeeId, d))).map((d) => ({ employeeId, date: d, clear: true })));
  };

  // ── drag & drop (Alt = copy) ──
  const dragFrom = useRef<string | null>(null);
  const onDrop = async (ev: React.DragEvent, target: string) => {
    ev.preventDefault();
    const src = dragFrom.current;
    dragFrom.current = null;
    if (!src || src === target) return;
    const [se, sd] = src.split("|") as [string, string];
    const [te, tdate] = target.split("|") as [string, string];
    const s = snapshot(se, sd);
    if (s.clear) return;
    const copy = ev.altKey;
    const cells: CellWrite[] = [{ ...s, employeeId: te, date: tdate, clear: false }];
    if (!copy) cells.push({ employeeId: se, date: sd, clear: true });
    await write(cells);
  };

  // ── keyboard ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") { setSelected(new Set()); setPicker(null); setRowMenu(null); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); void doUndo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); void doRedo(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selected.size) {
        e.preventDefault();
        void write([...selected].map((k) => { const [emp, d] = k.split("|") as [string, string]; return { employeeId: emp, date: d, clear: true }; }));
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
  useEffect(() => {
    const close = () => { setPicker(null); setRowMenu(null); };
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, []);

  // ── side sheets ──
  const [anomOpen, setAnomOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const publish = async () => {
    setPublishing(true);
    try {
      const r = await api<{ published: number; employees?: number; message?: string }>("/api/planning/publish", { body: { from, to }, silent: true });
      if (r.published) toast.success(`Planning publié : ${r.published} shift(s) pour ${r.employees} salarié(s). Ils ont été notifiés.`);
      else toast.info(r.message ?? "Rien à publier.");
      refresh();
    } catch (e) {
      if (e instanceof HttpError) {
        toast.error(e.message);
        if (e.status === 409) setAnomOpen(true);
      }
    }
    setPublishing(false);
  };

  // ── totals ──
  const drafts = (data?.assignments ?? []).filter((a) => a.status === "DRAFT" && !a.leaveRequestId).length;
  const dayTotals = days.map((d) => {
    let people = 0;
    let minutes = 0;
    for (const e of employees) {
      const a = byCell.get(key(e.id, d));
      if (a) { people++; minutes += minutesOf(a).paid; }
    }
    return { people, minutes };
  });
  const rowTotals = new Map(employees.map((e) => [e.id, days.reduce((t, d) => t + minutesOf(byCell.get(key(e.id, d))).paid, 0)]));
  const weekCost = employees.reduce((t, e) => {
    const min = rowTotals.get(e.id) ?? 0;
    const weeks = Math.max(1, days.length / 7);
    const ot = Math.max(0, min / 60 - e.weeklyHours * weeks);
    return t + e.rate * (min / 60) + e.rate * ot * (data?.overtimeRate ?? 0.25);
  }, 0);
  const totalMinutes = dayTotals.reduce((t, x) => t + x.minutes, 0);

  const nav = (dir: -1 | 1) => setAnchor(view === "week" ? addDays(startOfIsoWeek(anchor), dir * 7) : (() => { const [y, m] = anchor.split("-").map(Number) as [number, number]; const dt = new Date(Date.UTC(y, m - 1 + dir, 1)); return dt.toISOString().slice(0, 10); })());
  const label = view === "week" ? `${fmtShort(from)} – ${fmtShort(to)} ${to.slice(0, 4)}` : `${MON_FR[Number(from.slice(5, 7)) - 1]?.replace(".", "")} ${from.slice(0, 4)}`.replace(/^./, (c) => c.toUpperCase());
  const compact = view === "month";
  const anomBlocking = an.data?.blocking ?? 0;
  const anomCount = (an.data?.blocking ?? 0) + (an.data?.warnings ?? 0);

  return (
    <div onClick={() => { setPicker(null); setRowMenu(null); }}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted">{drafts ? `${drafts} brouillon${drafts > 1 ? "s" : ""} non publié${drafts > 1 ? "s" : ""} sur la période` : "Tout est publié sur la période affichée."}</p>
        </div>
      </div>

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => nav(-1)} aria-label="Période précédente"><ChevronLeft /></Button>
            <div className="min-w-[180px] text-center font-display text-[15px] font-semibold">{label}</div>
            <Button size="icon" variant="ghost" onClick={() => nav(1)} aria-label="Période suivante"><ChevronRight /></Button>
          </div>
          {view === "week" && <span className="rounded-full bg-accent-100 px-2.5 py-0.5 font-mono text-xs font-semibold text-[#9b5d0b] dark:text-accent-500">S{isoWeek(from).week}</span>}
          <Button size="sm" variant="secondary" onClick={() => setAnchor(today)}>Aujourd'hui</Button>
          <Segmented size="sm" value={view} onChange={(v) => { setView(v); setSelected(new Set()); }} options={[{ value: "week", label: "Semaine" }, { value: "month", label: "Mois" }]} />
          <div className="ml-auto flex items-center gap-1">
            <Tooltip content="Annuler (Ctrl+Z)"><Button size="icon" variant="ghost" disabled={!undo.length || busy} onClick={doUndo} aria-label="Annuler"><Undo2 /></Button></Tooltip>
            <Tooltip content="Rétablir (Ctrl+Y)"><Button size="icon" variant="ghost" disabled={!redo.length || busy} onClick={doRedo} aria-label="Rétablir"><Redo2 /></Button></Tooltip>
            <Button size="sm" variant={anomBlocking ? "danger" : "secondary"} onClick={(e) => { e.stopPropagation(); setAnomOpen(true); }}>
            <AlertTriangle /> Anomalies <span className={cn("rounded-full px-1.5 text-[11px] tabular", anomBlocking ? "bg-white/20" : "bg-surface-2")}>{anomCount}</span>
          </Button>
          <Button size="sm" onClick={publish} loading={publishing} disabled={!drafts}><Send /> Publier</Button>
            <Tooltip content="Aide : clic = choisir un shift · Maj+clic = sélection multiple · glisser = déplacer · Alt+glisser = copier · clic droit sur un nom = copier/coller/vider · Suppr = effacer la sélection"><Button size="icon" variant="ghost" aria-label="Aide"><HelpCircle /></Button></Tooltip>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="h-9 pl-9" aria-label="Rechercher un salarié" />
          </div>
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 w-auto" aria-label="Rôle"><option value="all">Tous rôles</option><option value="lead">Chef d'équipe</option><option value="employee">Salarié</option></Select>
          {!!data?.centres.length && <Select value={centreId} onChange={(e) => setCentreId(e.target.value)} className="h-9 w-auto" aria-label="Centre"><option value="">Tous centres</option>{data.centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
          <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="h-9 w-auto" aria-label="Service"><option value="">Tous services</option>{data?.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-9 w-auto" aria-label="Catégorie"><option value="">Toutes catégories</option>{data?.categories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Tooltip content="Imprimer (PDF)"><Button size="icon" variant="secondary" onClick={() => download(`/api/planning/print?from=${from}&to=${to}`, `planning-${from}.pdf`)} aria-label="Imprimer"><Printer /></Button></Tooltip>
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); if (!data?.employees.length) toast.error("Aucun employé disponible"); else setAddOpen(true); }}><Plus /> Ajouter</Button>

        </div>
      </Card>

      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-[12px] bg-brand-900 px-4 py-2 text-sm text-white animate-fade-in">
          {selected.size} cellule{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""} · cliquez sur l'une d'elles pour appliquer un shift, ou Suppr pour vider.
          <button className="ml-auto grid size-7 cursor-pointer place-items-center rounded-md hover:bg-white/10" onClick={() => setSelected(new Set())} aria-label="Annuler la sélection"><X className="size-4" /></button>
        </div>
      )}

      <Card className="overflow-hidden">
        {!data ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (
          <div className="scrollbar-thin overflow-auto" style={{ maxHeight: "calc(100dvh - 300px)", minHeight: 320 }}>
            <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: compact ? 220 + days.length * 40 : 1100 }}>
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 w-[220px] min-w-[220px] border-b border-r border-border bg-surface-2 px-3 py-2 text-left text-[11.5px] font-semibold uppercase tracking-wider text-muted">Salarié</th>
                  {days.map((d) => {
                    const wd = weekday(d);
                    const isToday = d === today;
                    return (
                      <th key={d} className={cn("sticky top-0 z-20 border-b border-border px-1 py-2 text-center text-xs font-semibold", isToday ? "bg-brand-100 text-brand-700 dark:text-brand-400" : wd === 0 || wd === 6 ? "bg-[color-mix(in_srgb,var(--surface-2)_70%,var(--border))] text-muted" : "bg-surface-2 text-muted")}>
                        {compact ? (
                          <div><div className="text-[10px] uppercase">{DAY_FR[wd]!.slice(0, 2)}</div><div className={cn("tabular", isToday && "font-bold")}>{Number(d.slice(8))}</div></div>
                        ) : (
                          <span className="inline-flex items-center gap-1">{DAY_FR[wd]} {Number(d.slice(8))} {MON_FR[Number(d.slice(5, 7)) - 1]}{monthLocked(d) && <Lock className="size-3" />}</span>
                        )}
                      </th>
                    );
                  })}
                  <th className="sticky right-0 top-0 z-20 w-[84px] border-b border-l border-border bg-surface-2 px-2 py-2 text-right text-[11.5px] font-semibold uppercase tracking-wider text-muted">Total</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  const total = rowTotals.get(e.id) ?? 0;
                  const contract = e.weeklyHours * 60 * (days.length / 7);
                  const over = total > contract;
                  return (
                    <tr key={e.id} style={{ contentVisibility: "auto", containIntrinsicSize: compact ? "auto 40px" : "auto 56px" }}>
                      <td className="sticky left-0 z-10 border-b border-r border-border bg-surface px-3 py-1.5" onContextMenu={(ev) => { ev.preventDefault(); ev.stopPropagation(); setRowMenu({ x: ev.clientX, y: ev.clientY, employeeId: e.id }); }}>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={`${e.firstName} ${e.lastName}`} size={compact ? 24 : 30} />
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium">{e.firstName} {e.lastName}{e.isLead && <Crown className="ml-1 inline size-3 text-accent-500" />}</div>
                            {!compact && <div className="truncate text-[11px] text-muted">{e.category ?? ""}</div>}
                          </div>
                        </div>
                      </td>
                      {days.map((d) => {
                        const k = key(e.id, d);
                        const a = byCell.get(k);
                        const t = a?.shiftTypeId ? stMap.get(a.shiftTypeId) : undefined;
                        const leave = leaveAt(e.id, d);
                        const locked = isLocked(e.id, d);
                        const wd = weekday(d);
                        const sel = selected.has(k);
                        const color = t?.color ?? "#66736F";
                        const draft = a?.status === "DRAFT";
                        return (
                          <td
                            key={d}
                            onClick={(ev) => { ev.stopPropagation(); openPicker(ev, k); }}
                            onDragOver={(ev) => { if (!locked && !leave) ev.preventDefault(); }}
                            onDrop={(ev) => onDrop(ev, k)}
                            className={cn(
                              "relative cursor-pointer border-b border-border p-1 text-center align-middle transition-colors",
                              d === today ? "bg-brand-100/35" : wd === 0 || wd === 6 ? "bg-surface-2/60" : "",
                              unavailable.has(`${e.id}:${d}`) && "bg-[repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_srgb,var(--danger)_10%,transparent)_6px_8px)]",
                              !locked && !leave && "hover:bg-brand-100/50",
                              sel && "outline-2 -outline-offset-2 outline-brand-500 bg-brand-100/60",
                              locked && "cursor-not-allowed",
                            )}
                            aria-label={`${e.firstName} ${e.lastName}, ${d}${t ? `, ${t.name}` : leave ? `, ${leave.label}` : ", vide"}`}
                          >
                            {leave ? (
                              <span className="inline-block max-w-full truncate rounded-full bg-info-100 px-2 py-0.5 text-[10.5px] font-medium text-info" title={leave.label}>{compact ? "C" : leave.label}</span>
                            ) : a ? (
                              <div
                                draggable={!locked}
                                onDragStart={(ev) => { dragFrom.current = k; ev.dataTransfer.effectAllowed = "copyMove"; }}
                                className={cn("mx-auto flex flex-col items-center justify-center rounded-[8px] px-1 font-medium leading-tight", compact ? "h-7 w-8 text-[10.5px]" : "h-11 max-w-[124px]")}
                                style={draft ? { border: `1.5px dashed ${color}`, color: "var(--text)", background: `color-mix(in srgb, ${color} 14%, transparent)` } : { background: color, color: readableText(color) }}
                                title={`${t?.name ?? "Horaire personnalisé"}${draft ? " (brouillon)" : ""}`}
                              >
                                <span className="inline-flex items-center gap-0.5 font-mono text-[11px] font-bold">{t?.code ?? <Clock3 className="size-3" aria-label="Horaires personnalisés" />}{t?.isNight && !compact && <Moon className="size-2.5" />}</span>
                                {!compact && <span className="font-mono text-[10px] tabular opacity-85">{a.customStart ?? t?.startTime}–{a.customEnd ?? t?.endTime}</span>}
                              </div>
                            ) : null}
                            {locked && <Lock className="absolute right-1 top-1 size-2.5 text-muted" />}
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 border-b border-l border-border bg-surface px-2 py-1.5 text-right">
                        <div className={cn("font-mono text-[12.5px] font-semibold tabular", over && "text-[#9a6a00] dark:text-warning")}>{hm(total)}</div>
                        {!compact && <div className="text-[10.5px] text-muted">/ {hm(contract)}</div>}
                      </td>
                    </tr>
                  );
                })}
                {employees.length === 0 && (
                  <tr><td colSpan={days.length + 2} className="px-4 py-16 text-center text-sm text-muted">{data.employees.length ? "Aucun salarié ne correspond aux filtres." : "Aucun employé disponible : ajoutez des salariés pour construire le planning."}</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky bottom-0 left-0 z-30 border-r border-t border-border bg-surface-2 px-3 py-2 text-[12px] font-semibold">
                    <Tooltip content="Nombre de personnes planifiées et heures payées (amplitude − pause non rémunérée) par jour. Le coût estime heures × taux horaire, plus les heures sup. majorées."><span className="inline-flex cursor-help items-center gap-1 underline decoration-dotted underline-offset-4">Heures travaillées <HelpCircle className="size-3" /></span></Tooltip>
                  </td>
                  {dayTotals.map((t, i) => (
                    <td key={days[i]} className="sticky bottom-0 z-20 border-t border-border bg-surface-2 px-1 py-2 text-center text-[11px] text-muted">
                      {compact ? <span className="tabular">{t.people || ""}</span> : <><div className="font-medium text-text">{t.people} pers.</div><div className="font-mono tabular">{hm(t.minutes)}</div></>}
                    </td>
                  ))}
                  <td className="sticky bottom-0 right-0 z-30 border-l border-t border-border bg-surface-2 px-2 py-2 text-right">
                    <div className="font-mono text-[12.5px] font-bold tabular">{hm(totalMinutes)}</div>
                    <div className="text-[10.5px] tabular text-muted">{dh(weekCost, 0)}</div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
        {data?.shiftTypes.filter((s) => s.active).map((s) => <span key={s.id} className="inline-flex items-center gap-1.5"><span className="rounded px-1 font-mono text-[10px] font-bold" style={{ background: s.color, color: readableText(s.color) }}>{s.code}</span>{s.name}</span>)}
        <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-5 rounded border-[1.5px] border-dashed border-muted" />Brouillon</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-5 rounded bg-muted" />Publié</span>
        <span className="inline-flex items-center gap-1.5"><Lock className="size-3" />Verrouillé</span>
      </div>

      {picker && data && (
        <div className="fixed z-50 w-[280px] rounded-[14px] border border-border bg-surface p-2 shadow-pop animate-pop" style={{ left: picker.x, top: picker.y }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choisir un shift">
          <div className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{picker.cells.length > 1 ? `${picker.cells.length} cellules` : "Choisir un shift"}</div>
          <div className="scrollbar-thin max-h-56 overflow-y-auto">
            {data.shiftTypes.filter((s) => s.active).map((s) => (
              <button key={s.id} onClick={() => applyToPicker({ shiftTypeId: s.id })} className="flex w-full cursor-pointer items-center gap-2.5 rounded-[9px] px-2 py-1.5 text-left hover:bg-surface-2">
                <span className="w-11 rounded px-1 py-0.5 text-center font-mono text-[11px] font-bold" style={{ background: s.color, color: readableText(s.color) }}>{s.code}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{s.name}</span>
                <span className="font-mono text-[11px] text-muted">{s.startTime}–{s.endTime}</span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 border-t border-border px-1.5 pt-2">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Horaires personnalisés</div>
            <div className="flex items-center gap-1.5">
              <Input type="time" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} className="h-8 px-2 font-mono text-xs" aria-label="Début" />
              <span className="text-muted">–</span>
              <Input type="time" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} className="h-8 px-2 font-mono text-xs" aria-label="Fin" />
              <Button size="sm" onClick={() => applyToPicker({ customStart: custom.start, customEnd: custom.end, breakMinutes: custom.breakMinutes, shiftTypeId: null })} aria-label="Appliquer">OK</Button>
            </div>
          </div>
          {picker.cells.some((k) => byCell.has(k)) && (
            <button onClick={() => applyToPicker({ clear: true })} className="mt-2 flex w-full cursor-pointer items-center gap-2 rounded-[9px] px-2 py-1.5 text-[13px] text-danger hover:bg-danger-100"><Eraser className="size-4" /> Vider (repos)</button>
          )}
        </div>
      )}
      {rowMenu && (
        <div className="fixed z-50 w-56 rounded-[12px] border border-border bg-surface p-1 shadow-pop animate-pop" style={{ left: Math.min(rowMenu.x, window.innerWidth - 240), top: Math.min(rowMenu.y, window.innerHeight - 160) }} onClick={(e) => e.stopPropagation()} role="menu">
          <button role="menuitem" className="flex w-full cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-sm hover:bg-surface-2" onClick={() => { copyRow(rowMenu.employeeId); setRowMenu(null); }}><Copy className="size-4 text-muted" /> Copier {view === "week" ? "la semaine" : "le mois"}</button>
          <button role="menuitem" disabled={!clip} className="flex w-full cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-sm hover:bg-surface-2 disabled:opacity-40" onClick={() => { pasteRow(rowMenu.employeeId); setRowMenu(null); }}><ClipboardPaste className="size-4 text-muted" /> Coller</button>
          <button role="menuitem" className="flex w-full cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-sm text-danger hover:bg-danger-100" onClick={() => { void clearRow(rowMenu.employeeId); setRowMenu(null); }}><Eraser className="size-4" /> Vider la ligne</button>
        </div>
      )}

      <SideSheet open={anomOpen} onOpenChange={setAnomOpen} title="Anomalies du planning" subtitle={`Du ${from.split("-").reverse().join("/")} au ${to.split("-").reverse().join("/")}`} footer={<a href="settings/regles-shifts" className="text-sm font-medium text-brand-500 hover:underline">Gérer les règles des shifts</a>}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <AnomalyCounters blocking={an.data?.blocking ?? 0} warnings={an.data?.warnings ?? 0} />
          <Button size="sm" variant="secondary" onClick={() => an.refetch()} loading={an.isFetching}>Actualiser</Button>
        </div>
        {an.data ? <AnomalyList anomalies={an.data.anomalies} onChanged={() => an.refetch()} /> : <div className="space-y-3 p-5"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
      </SideSheet>

      {data && <AddShiftSheet open={addOpen} onOpenChange={setAddOpen} data={data} from={from} to={to} onApply={async (cells) => { if (await write(cells)) setAddOpen(false); }} />}
    </div>
  );
}

function AddShiftSheet({ open, onOpenChange, data, from, to, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; data: PlanningData; from: string; to: string; onApply: (cells: CellWrite[]) => void }) {
  const [emps, setEmps] = useState<Set<string>>(new Set());
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(from);
  const [shiftTypeId, setShiftTypeId] = useState("");
  const [customStart, setCustomStart] = useState("08:00");
  const [customEnd, setCustomEnd] = useState("16:00");
  const [daysOn, setDaysOn] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [q, setQ] = useState("");
  useEffect(() => { if (open) { setStart(from); setEnd(from); } }, [open, from]);
  const dates = start && end && end >= start ? eachDay(start, end).filter((d) => daysOn.includes(weekday(d))) : [];
  const cells: CellWrite[] = [...emps].flatMap((e) => dates.map((d) => (shiftTypeId === "__custom" ? { employeeId: e, date: d, customStart, customEnd, shiftTypeId: null } : { employeeId: e, date: d, shiftTypeId }))).filter((c) => !data.leaves.some((l) => l.employeeId === c.employeeId && l.startDate <= c.date && l.endDate >= c.date));
  const list = data.employees.filter((e) => `${e.firstName} ${e.lastName}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <SideSheet open={open} onOpenChange={onOpenChange} title="Ajouter des shifts" subtitle="Les shifts sont créés en brouillon." footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button><Button onClick={() => onApply(cells)} disabled={!cells.length || !shiftTypeId}><CalendarPlus /> Ajouter {cells.length || ""} shift{cells.length > 1 ? "s" : ""}</Button></div>}>
      <div className="space-y-5 p-5">
        <Field label="Shift" required htmlFor="as-st">
          <Select id="as-st" value={shiftTypeId} onChange={(e) => setShiftTypeId(e.target.value)}>
            <option value="">Choisir…</option>
            {data.shiftTypes.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code}, {s.startTime} à {s.endTime})</option>)}
            <option value="__custom">Horaires personnalisés…</option>
          </Select>
        </Field>
        {shiftTypeId === "__custom" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Début" htmlFor="as-cs"><Input id="as-cs" type="time" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></Field>
            <Field label="Fin" htmlFor="as-ce"><Input id="as-ce" type="time" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Du" htmlFor="as-f"><Input id="as-f" type="date" value={start} min={from} max={to} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Au" htmlFor="as-t"><Input id="as-t" type="date" value={end} min={start} max={to} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const on = daysOn.includes(d);
            return <button key={d} type="button" aria-pressed={on} onClick={() => setDaysOn(on ? daysOn.filter((x) => x !== d) : [...daysOn, d])} className={cn("h-8 w-11 cursor-pointer rounded-[8px] border text-xs font-medium", on ? "border-brand-500 bg-brand-100 text-brand-700 dark:text-brand-400" : "border-border text-muted")}>{DAY_FR[d]}</button>;
          })}
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[13px] font-medium">Salariés · {emps.size}<button className="cursor-pointer text-xs text-brand-500 hover:underline" onClick={() => setEmps(emps.size === list.length ? new Set() : new Set(list.map((e) => e.id)))}>{emps.size === list.length ? "Aucun" : "Tous"}</button></div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer…" className="mb-2 h-9" />
          <div className="scrollbar-thin max-h-72 space-y-0.5 overflow-y-auto rounded-[12px] border border-border p-1.5">
            {list.map((e) => (
              <label key={e.id} className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-1.5 hover:bg-surface-2">
                <Checkbox checked={emps.has(e.id)} onChange={() => setEmps((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })} />
                <span className="flex-1 truncate text-sm">{e.firstName} {e.lastName}</span>
                <span className="text-[11px] text-muted">{e.category}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </SideSheet>
  );
}
