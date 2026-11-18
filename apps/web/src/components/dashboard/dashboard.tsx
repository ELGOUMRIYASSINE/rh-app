"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { AlarmClock, ArrowRight, CheckCircle2, Clock, Fingerprint, LogIn, LogOut, UserPlus, UserRoundX, Users, UserCheck, Wallet, Wifi, WifiOff, CalendarCheck2 } from "lucide-react";
import { Avatar, Button, buttonVariants, Card, CardHeader, cn, EmptyState, KpiCard, ProgressRing, StatusPill, StepCard } from "@yghr/ui";
import { formatLongDateFr } from "@yghr/core";
import type { DashboardStats } from "@/server/dashboard";
import { api } from "@/lib/api";
import { dayLabel, dh, timeIn } from "@/lib/format";
import { useRealtimeEvent } from "@/components/shell/realtime";

export function Dashboard({ initial, base, firstName, space }: { initial: DashboardStats; base: string; firstName: string; space: "rh" | "chef" }) {
  const qc = useQueryClient();
  const { data = initial } = useQuery({ queryKey: ["dashboard"], queryFn: () => api<DashboardStats>("/api/dashboard/stats", { silent: true }), initialData: initial, refetchInterval: 30_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["dashboard"] });
  useRealtimeEvent("punch:new", refresh);
  useRealtimeEvent("attendance:update", refresh);
  useRealtimeEvent("device:status", refresh);

  const tz = data.timezone;
  const noEmployees = data.activeCount === 0;
  const allSetup = Object.values(data.setup).every(Boolean);
  const context = noEmployees
    ? "Commencez par ajouter vos salariés : leurs pointages et leur paie apparaîtront ici."
    : data.plannedCount
      ? `${data.onSiteCount} personne${data.onSiteCount > 1 ? "s" : ""} sur site sur ${data.plannedCount} planifiée${data.plannedCount > 1 ? "s" : ""} aujourd'hui${data.lateCount ? ` · ${data.lateCount} retard${data.lateCount > 1 ? "s" : ""}` : ""}.`
      : "Aucun shift publié aujourd'hui. Publiez le planning pour suivre les présences.";

  return (
    <div className="space-y-6">
      {/* HeroGreeting */}
      <section className="relative overflow-hidden rounded-[18px] bg-brand-900 p-6 text-white shadow-pop sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-brand-500/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white/60">{formatLongDateFr(data.today)}</p>
            <h1 className="mt-2 font-display text-[30px] font-bold leading-tight sm:text-[34px]">Bonjour {firstName} 👋</h1>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/75">{context}</p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {space === "rh" && (
                <Link href={`${base}/employes?new=1`} className={buttonVariants({ variant: "accent" })}>
                  <UserPlus /> Ajouter un salarié
                </Link>
              )}
              <Link href={`${base}/presences`} className={buttonVariants({ variant: "onDark" })}>
                <UserCheck /> Présences du jour
              </Link>
              {space === "rh" && (
                <Link href={`${base}/paie`} className={buttonVariants({ variant: "onDark" })}>
                  <Wallet /> Paie
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-8 lg:gap-10">
            <LiveClock tz={tz} />
            <ProgressRing value={data.presenceRate} size={112} stroke={10} sublabel="% présence" />
          </div>
        </div>
      </section>

      {space === "rh" && !allSetup && (
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold">Mise en route</h2>
              <p className="text-sm text-muted">Quatre étapes pour que YGHR travaille pour vous.</p>
            </div>
            <StatusPill tone="brand">{Object.values(data.setup).filter(Boolean).length}/4</StatusPill>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StepCard n={1} title="Ajouter des salariés" done={data.setup.employees} action={<Link className={buttonVariants({ size: "sm" })} href={`${base}/employes?new=1`}>Ajouter</Link>}>Un à un ou par import Excel.</StepCard>
            <StepCard n={2} title="Configurer les shifts" done={data.setup.shifts} action={<Link className={buttonVariants({ size: "sm", variant: "secondary" })} href={`${base}/settings/regles-shifts`}>Configurer</Link>}>Horaires, règles et couverture.</StepCard>
            <StepCard n={3} title="Connecter une pointeuse" done={data.setup.devices} action={<Link className={buttonVariants({ size: "sm", variant: "secondary" })} href={`${base}/pointeuses?tab=devices`}>Connecter</Link>}>Pour recevoir les présences automatiquement.</StepCard>
            <StepCard n={4} title="Créer la première période de paie" done={data.setup.payroll} action={<Link className={buttonVariants({ size: "sm", variant: "secondary" })} href={`${base}/paie?new=1`}>Créer</Link>}>Bulletins CNSS, AMO et IR.</StepCard>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard LinkComponent={Link} href={`${base}/${space === "rh" ? "employes" : "equipe"}`} icon={<Users />} value={data.activeCount} label="Effectif actif" sub={space === "rh" ? `dont ${data.leadsCount} chef${data.leadsCount > 1 ? "s" : ""} d'équipe` : "dans votre équipe"} />
        <KpiCard LinkComponent={Link} href={`${base}/presences`} tone="success" icon={<UserCheck />} value={data.onSiteCount} label="Sur site maintenant" sub={`${data.arrivalsCount} arrivée${data.arrivalsCount > 1 ? "s" : ""} aujourd'hui`} progress={data.plannedCount ? (data.onSiteCount / data.plannedCount) * 100 : 0} />
        <KpiCard LinkComponent={Link} href={`${base}/presences`} tone="warning" icon={<AlarmClock />} value={data.lateCount} label="Retards" sub={data.lateCount ? "au-delà de la tolérance" : "aucun retard"} />
        <KpiCard LinkComponent={Link} href={`${base}/presences`} tone="danger" icon={<UserRoundX />} value={data.absentNowCount} label="Absents maintenant" sub="planifiés, non pointés ou déjà sortis" progress={data.plannedCount ? (data.absentNowCount / data.plannedCount) * 100 : 0} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Présences — 7 derniers jours" subtitle="Arrivées pointées, à l'heure ou en retard" />
          <div className="px-3 pb-4">
            {data.chart.every((d) => d.onTime + d.late === 0) ? (
              <EmptyState compact icon={<CalendarCheck2 />} title="Aucun pointage sur les 7 derniers jours">Les arrivées apparaîtront ici dès que vos pointeuses enverront des données.</EmptyState>
            ) : (
              <AttendanceChart data={data.chart} />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Effectif par département" subtitle="Salariés actifs par service" />
          <div className="space-y-3 px-5 pb-5">
            {data.byService.length === 0 && <p className="py-6 text-center text-sm text-muted">Attribuez un service à vos salariés pour voir la répartition.</p>}
            {data.byService.map((s) => {
              const max = data.byService[0]!.count;
              return (
                <div key={s.name} className="group">
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="truncate">{s.name}</span>
                    <span className="font-semibold tabular">{s.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2">
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(s.count / max) * 100}%`, background: "var(--chart-1)" }} title={`${s.name} : ${s.count}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2">Pointages en direct <span className="size-2 animate-pulse-dot rounded-full bg-success text-success" /></span>}
            actions={space === "rh" ? <Link href={`${base}/pointeuses`} className="text-sm font-medium text-brand-500 hover:underline">Tout voir</Link> : undefined}
          />
          <ul className="px-2 pb-3">
            {data.punches.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Aucun pointage reçu pour l'instant.</li>}
            {data.punches.map((p, i) => {
              const isIn = p.direction ? p.direction === "IN" : i % 2 === 0;
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 hover:bg-surface-2">
                  <Avatar name={p.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className={cn("truncate text-sm font-medium", !p.known && "text-muted")}>{p.name}</div>
                    <div className="truncate text-xs text-muted">{p.device}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm tabular">{timeIn(p.at, tz)}</div>
                    {p.direction && (
                      <div className={cn("mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold", isIn ? "text-success" : "text-muted")}>
                        {isIn ? <LogIn className="size-3" /> : <LogOut className="size-3" />}
                        {isIn ? "ENTRÉE" : "SORTIE"}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Retards du jour" subtitle="Au-delà de la tolérance configurée" />
          <div className="px-2 pb-3">
            {data.lateList.length === 0 ? (
              <div className="flex flex-col items-center px-3 py-8 text-center">
                <CheckCircle2 className="mb-2 size-9 text-success" strokeWidth={1.75} />
                <p className="text-sm font-medium">Aucun retard aujourd'hui.</p>
              </div>
            ) : (
              <ul>
                {data.lateList.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 hover:bg-surface-2">
                    <Avatar name={l.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{l.name}</div>
                      <div className="truncate text-xs text-muted">{l.shift ?? "Shift"} · arrivé(e) à {timeIn(l.firstIn, tz)}</div>
                    </div>
                    <StatusPill tone="warning">+{l.minutes} min</StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        {space === "rh" ? (
          <Card>
            <CardHeader title="Pointeuses" actions={<Link href={`${base}/pointeuses?tab=devices`} className="text-sm font-medium text-brand-500 hover:underline">Gérer</Link>} />
            <div className="px-2 pb-3">
              {data.devices.length === 0 ? (
                <EmptyState compact icon={<Fingerprint />} title="Aucune pointeuse" action={<Link href={`${base}/pointeuses?tab=devices`} className={buttonVariants({ size: "sm" })}>Ajouter une pointeuse</Link>}>
                  Ajoutez votre première pointeuse pour recevoir les présences automatiquement.
                </EmptyState>
              ) : (
                <ul>
                  {data.devices.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 rounded-[10px] px-3 py-2.5">
                      <div className={cn("grid size-9 place-items-center rounded-[10px]", d.status === "ONLINE" ? "bg-success-100 text-success" : "bg-surface-2 text-muted")}>
                        {d.status === "ONLINE" ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{d.name}</div>
                        <div className="text-xs text-muted" suppressHydrationWarning>{d.lastSeenAt ? `Vue ${relative(d.lastSeenAt)}` : "Jamais connectée"} · {d.mode}</div>
                      </div>
                      <StatusPill tone={d.status === "ONLINE" ? "success" : "neutral"} dot>{d.status === "ONLINE" ? "En ligne" : "Hors ligne"}</StatusPill>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        ) : null}
      </div>

      {space === "rh" && (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-accent-100 text-[#9b5d0b] dark:text-accent-500">
              <Wallet className="size-6" strokeWidth={1.75} />
            </div>
            {data.payroll ? (
              <>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-semibold">Paie — {data.payroll.label}</h2>
                    <StatusPill tone={data.payroll.status === "LOCKED" ? "neutral" : data.payroll.status === "VALIDATED" ? "success" : data.payroll.status === "CALCULATED" ? "info" : "warning"}>{data.payroll.statusLabel}</StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-muted">{data.payroll.headcount} bulletin{data.payroll.headcount > 1 ? "s" : ""} · brut {dh(data.payroll.gross, 0)} · net {dh(data.payroll.net, 0)}</p>
                </div>
                <Link href={`${base}/paie/${data.payroll.id}`} className={buttonVariants({ variant: "secondary" })}>Ouvrir la période <ArrowRight /></Link>
              </>
            ) : (
              <>
                <p className="flex-1 text-sm leading-relaxed text-muted">Aucune période de paie calculée. Créez une période pour générer les bulletins selon les règles marocaines (CNSS, AMO, IR).</p>
                <Link href={`${base}/paie?new=1`} className={buttonVariants()}>Créer une période</Link>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function relative(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return "à l'instant";
  if (diff < 60) return `il y a ${Math.round(diff)} min`;
  if (diff < 1440) return `il y a ${Math.round(diff / 60)} h`;
  return `il y a ${Math.round(diff / 1440)} j`;
}

function LiveClock({ tz }: { tz: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const fmt = (o: Intl.DateTimeFormatOptions) => (now ? new Intl.DateTimeFormat("fr-FR", { timeZone: tz, ...o }).format(now) : "--");
  return (
    <div className="text-right">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/50">Heure locale</div>
      <div className="mt-1 font-mono text-[40px] font-semibold leading-none tabular">
        {fmt({ hour: "2-digit", minute: "2-digit" })}
        <span className="text-xl text-white/45">:{fmt({ second: "2-digit" }).padStart(2, "0")}</span>
      </div>
      <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-white/50"><Clock className="size-3" /> {tz.replace("_", " ")}</div>
    </div>
  );
}

function AttendanceChart({ data }: { data: DashboardStats["chart"] }) {
  const rows = data.map((d) => ({ ...d, label: dayLabel(d.date).replace(/\.$/, "") }));
  return (
    <div>
      <div className="mb-2 flex gap-4 px-2 text-xs text-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: "var(--chart-1)" }} /> À l'heure</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: "var(--chart-2)" }} /> En retard</span>
      </div>
      <div className="h-[240px]" role="img" aria-label={`Présences des 7 derniers jours : ${rows.map((r) => `${r.label} ${r.onTime} à l'heure, ${r.late} en retard`).join(" ; ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barCategoryGap="28%" margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted)" }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted)" }} />
            <RTooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-[10px] border border-border bg-surface px-3 py-2 text-xs shadow-pop">
                    <div className="mb-1 font-semibold">{label}</div>
                    <div className="flex items-center gap-2"><span className="size-2 rounded-sm" style={{ background: "var(--chart-1)" }} /> À l'heure : <b className="tabular">{payload.find((p) => p.dataKey === "onTime")?.value as number}</b></div>
                    <div className="flex items-center gap-2"><span className="size-2 rounded-sm" style={{ background: "var(--chart-2)" }} /> En retard : <b className="tabular">{payload.find((p) => p.dataKey === "late")?.value as number}</b></div>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="onTime" stackId="a" fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} name="À l'heure" />
            <Bar dataKey="late" stackId="a" fill="var(--chart-2)" stroke="var(--surface)" strokeWidth={2} radius={[4, 4, 0, 0]} name="En retard" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

