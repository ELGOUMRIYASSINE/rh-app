"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Check, Plus, RefreshCw, Wallet } from "lucide-react";
import { monthNameFr } from "@yghr/core";
import { Button, buttonVariants, Card, cn, EmptyState, Field, Modal, PageHeader, Select, Skeleton } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { dh } from "@/lib/format";

interface Period { id: string; month: number; year: number; status: string; headcount: number; gross: number; net: number; employer: number; warnings: number; fiscal: string | null }
const STEPS = [["DRAFT", "Brouillon"], ["CALCULATED", "Calculée"], ["VALIDATED", "Validée"], ["LOCKED", "Verrouillée"]] as const;

export function Stepper({ status }: { status: string }) {
  const idx = STEPS.findIndex(([k]) => k === status);
  return (
    <ol className="flex items-center gap-1.5" aria-label="Avancement">
      {STEPS.map(([k, l], i) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold", i < idx ? "bg-success-100 text-success" : i === idx ? "bg-brand-500 text-white dark:text-brand-900" : "bg-surface-2 text-muted")} aria-current={i === idx ? "step" : undefined}>
            {i < idx && <Check className="size-3" />}{l}
          </span>
          {i < STEPS.length - 1 && <span className={cn("h-px w-3", i < idx ? "bg-success" : "bg-border")} />}
        </li>
      ))}
    </ol>
  );
}

export function PayrollList({ base, openNew, today }: { base: string; openNew?: boolean; today: string }) {
  const router = useRouter();
  const q = useQuery({ queryKey: ["periods"], queryFn: () => api<{ items: Period[] }>("/api/payroll/periods") });
  const [creating, setCreating] = useState(!!openNew);
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [saving, setSaving] = useState(false);
  async function create() {
    setSaving(true);
    try {
      const r = await api<{ item: { id: string } }>("/api/payroll/periods", { body: { month, year } });
      toast.success("Période créée. Lancez maintenant le calcul des bulletins.");
      router.push(`${base}/paie/${r.item.id}`);
    } catch {}
    setSaving(false);
  }
  return (
    <div>
      <PageHeader title="Paie" subtitle="Calcul, validation et verrouillage des périodes de paie" actions={<><Button variant="secondary" onClick={() => q.refetch()}><RefreshCw /> Actualiser</Button><Button onClick={() => setCreating(true)}><Plus /> Nouvelle période</Button></>} />
      <p className="-mt-3 mb-5 text-sm text-muted">Gestion des bulletins de paie par période mensuelle, selon les règles marocaines (CNSS, AMO, IR).</p>
      {q.isLoading ? <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-44" />)}</div> : !q.data?.items.length ? (
        <Card><EmptyState icon={<Wallet />} title="Aucune période de paie" action={<Button onClick={() => setCreating(true)}><Plus /> Créer une période</Button>}>Créez une période pour générer les bulletins selon les règles marocaines (CNSS, AMO, IR).</EmptyState></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {q.data.items.map((p) => (
            <Card key={p.id} className="p-5 transition-shadow hover:shadow-pop">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold capitalize">{monthNameFr(p.month)} {p.year}</h3>
                  <p className="text-xs text-muted">{p.headcount} bulletin{p.headcount > 1 ? "s" : ""}{p.fiscal ? ` · ${p.fiscal}` : ""}</p>
                </div>
                <Stepper status={p.status} />
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-3">
                {[["Brut", p.gross], ["Net à payer", p.net], ["Charges patronales", p.employer]].map(([k, v]) => (
                  <div key={k as string} className="rounded-[12px] bg-surface-2 px-3 py-2.5"><dt className="text-[11px] text-muted">{k as string}</dt><dd className="mt-0.5 font-display text-[15px] font-bold tabular">{dh(v as number, 0)}</dd></div>
                ))}
              </dl>
              <div className="mt-4 flex items-center justify-between">
                {p.warnings ? <span className="inline-flex items-center gap-1.5 text-xs text-[#9a6a00] dark:text-warning"><AlertTriangle className="size-3.5" /> {p.warnings} avertissement{p.warnings > 1 ? "s" : ""}</span> : <span />}
                <Link href={`${base}/paie/${p.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Ouvrir <ArrowRight /></Link>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={creating} onOpenChange={setCreating} size="sm" icon={<Wallet />} title="Nouvelle période de paie" subtitle="La devise, les dates et la version de règles fiscales sont déterminées automatiquement par le serveur." footer={<><Button variant="ghost" onClick={() => setCreating(false)}>Annuler</Button><Button onClick={create} loading={saving}>Créer la période</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mois" htmlFor="pm"><Select id="pm" value={month} onChange={(e) => setMonth(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthNameFr(i + 1).replace(/^./, (c) => c.toUpperCase())}</option>)}</Select></Field>
          <Field label="Année" htmlFor="py"><Select id="py" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}</Select></Field>
        </div>
      </Modal>
    </div>
  );
}
