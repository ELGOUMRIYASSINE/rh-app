"use client";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button, cn, Input } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";

const PRESETS = [18, 21, 30];

/** Days input with quick presets. Used for the yearly paid-leave allowance. */
export function EntitlementInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {PRESETS.map((d) => (
        <button key={d} type="button" onClick={() => onChange(String(d))} className={cn("h-9 cursor-pointer rounded-[10px] border px-3 text-sm font-semibold tabular transition", value === String(d) ? "border-brand-500 bg-brand-100 text-brand-700 dark:text-brand-400" : "border-border hover:border-brand-500/60")}>
          {d} j
        </button>
      ))}
      <Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Autre" className="h-9 w-24" aria-label="Nombre de jours par an" />
    </div>
  );
}

export function parseDays(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return v.trim() && Number.isFinite(n) && n > 0 ? n : null;
}

/** Prompt asking for the yearly paid-leave allowance (18, 21, 30 days…) before any request. */
export function EntitlementDeclare({ year, employeeId, forSelf = true, onDone, compact }: { year: number; employeeId?: string | null; forSelf?: boolean; onDone: () => void; compact?: boolean }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    const days = parseDays(value);
    if (days === null) return toast.error("Indiquez le nombre de jours de congé annuel.");
    setSaving(true);
    try {
      await api("/api/leaves/entitlement", { method: "PUT", body: { employeeId: employeeId ?? undefined, days } });
      toast.success(`Solde annuel ${year} enregistré : ${days} j.`);
      onDone();
    } catch {}
    setSaving(false);
  }
  return (
    <div className={cn("rounded-[14px] border border-brand-500/30 bg-brand-100/40", compact ? "p-3.5" : "p-5")}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand-100 text-brand-700 dark:text-brand-400"><CalendarDays className="size-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">{forSelf ? `Déclarez votre solde de congés ${year}` : `Solde de congés ${year} non déclaré`}</div>
          <p className="mt-0.5 text-[13px] text-muted">
            {forSelf ? "Indiquez le nombre de jours de congé payé auxquels vous avez droit cette année. Chaque congé approuvé sera déduit de ce solde." : "Indiquez le nombre de jours de congé payé auxquels ce salarié a droit cette année."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <EntitlementInput value={value} onChange={setValue} />
            <Button size="sm" onClick={save} loading={saving} disabled={parseDays(value) === null}>Enregistrer</Button>
          </div>
          {forSelf && <p className="mt-2 text-xs text-muted">Une fois enregistré, seul votre responsable RH pourra le modifier.</p>}
        </div>
      </div>
    </div>
  );
}
