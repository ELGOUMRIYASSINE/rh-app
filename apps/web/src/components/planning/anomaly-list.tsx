"use client";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck, Lightbulb } from "lucide-react";
import type { Anomaly } from "@yghr/core";
import { formatLongDateFr } from "@yghr/core";
import { Button, Field, Modal, SeverityBadge, StatusPill, Textarea, cn } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function AnomalyCounters({ blocking, warnings }: { blocking: number; warnings: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      <StatusPill tone={blocking ? "danger" : "neutral"}><ShieldAlert className="size-3.5" /> {blocking} bloquante{blocking > 1 ? "s" : ""}</StatusPill>
      <StatusPill tone={warnings ? "warning" : "neutral"}><AlertTriangle className="size-3.5" /> {warnings} avertissement{warnings > 1 ? "s" : ""}</StatusPill>
    </div>
  );
}

/** Anomalies grouped by day, each with advice and "Autoriser une exception". */
export function AnomalyList({ anomalies, onChanged, canExcept = true }: { anomalies: Anomaly[]; onChanged: () => void; canExcept?: boolean }) {
  const [target, setTarget] = useState<Anomaly | null>(null);
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);
  if (!anomalies.length)
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <CheckCircle2 className="mb-3 size-10 text-success" strokeWidth={1.75} />
        <p className="font-semibold">Aucune anomalie</p>
        <p className="mt-1 max-w-xs text-sm text-muted">Le planning respecte toutes les règles actives sur cette période.</p>
      </div>
    );
  const byDay = new Map<string, Anomaly[]>();
  for (const a of anomalies) byDay.set(a.date, [...(byDay.get(a.date) ?? []), a]);

  async function save() {
    if (!target) return;
    setSaving(true);
    try {
      await api("/api/planning/exceptions", { body: { anomalyKey: target.key, date: target.date, justification } });
      toast.success("Exception autorisée et enregistrée dans l'historique.");
      setTarget(null);
      setJustification("");
      onChanged();
    } catch {}
    setSaving(false);
  }

  return (
    <div className="divide-y divide-border">
      {[...byDay.entries()].map(([day, list]) => (
        <section key={day} className="px-5 py-4">
          <h4 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">{formatLongDateFr(day)}</h4>
          <ul className="space-y-2.5">
            {list.map((a) => (
              <li key={a.key} className={cn("rounded-[12px] border p-3.5", a.exceptionId ? "border-border bg-surface-2/60" : a.severity === "BLOCKING" ? "border-danger/25 bg-danger-100/40" : "border-warning/30 bg-warning-100/40")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{a.title}</span>
                  {a.exceptionId ? <StatusPill tone="success"><ShieldCheck className="size-3.5" /> Exception autorisée</StatusPill> : <SeverityBadge severity={a.severity} label={a.severity === "BLOCKING" ? "Erreur" : "Avertissement"} />}
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed">{a.message}</p>
                <p className="mt-1.5 flex gap-1.5 text-xs leading-relaxed text-muted"><Lightbulb className="mt-0.5 size-3.5 shrink-0" /> Action conseillée : {a.advice}</p>
                {canExcept && !a.exceptionId && a.exceptionAllowed && (
                  <Button size="sm" variant="secondary" className="mt-3" onClick={() => setTarget(a)}>Autoriser une exception</Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Modal
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Autoriser une exception"
        subtitle="L'exception lève le blocage de publication pour cette anomalie précise. Elle est tracée avec votre nom et votre justification."
        icon={<ShieldCheck />}
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setTarget(null)}>Annuler</Button><Button onClick={save} loading={saving} disabled={justification.trim().length < 5}>Autoriser</Button></>}
      >
        {target && <div className="mb-4 rounded-[10px] bg-surface-2 p-3 text-[13px] leading-relaxed">{target.message}</div>}
        <Field label="Justification" required htmlFor="just" help="Ex. : renfort exceptionnel accepté par le salarié, remplacement d'un arrêt maladie…">
          <Textarea id="just" value={justification} onChange={(e) => setJustification(e.target.value)} rows={4} />
        </Field>
      </Modal>
    </div>
  );
}
