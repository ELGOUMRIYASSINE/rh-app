"use client";
import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button, cn, Modal, StatusPill } from "@yghr/ui";
import { toast } from "sonner";
import { api, download } from "@/lib/api";

const COLUMNS = ["Prénom*", "Nom*", "Email*", "Téléphone", "Poste", "Département", "Type de contrat", "Taux horaire", "Salaire net par heure", "Date de naissance", "Date d'embauche", "N° Sécurité Sociale", "Matricule", "Mot de passe (optionnel)"];

interface Row { line: number; errors: string[]; duplicate: boolean; data: { firstName: string; lastName: string; email: string; position: string | null; service: string | null; contractType: string | null } }
interface Preview { rows: Row[]; valid: number; invalid: number; duplicates: number }

export function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<{ created: number; invited: number; skipped: number; failures: { line: number; error: string }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState(false);

  async function pick(f: File | undefined) {
    if (!f) return;
    if (!/\.(xlsx|csv)$/i.test(f.name)) return toast.error("Choisissez un fichier .xlsx ou .csv.");
    setFile(f);
    setLoading(true);
    const form = new FormData();
    form.append("file", f);
    form.append("dryRun", "1");
    try {
      setPreview(await api<Preview>("/api/employees/import", { form }));
    } catch {
      setFile(null);
    }
    setLoading(false);
  }
  async function run() {
    if (!file) return;
    setLoading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await api<NonNullable<typeof result>>("/api/employees/import", { form });
      setResult(r);
      onDone();
    } catch {}
    setLoading(false);
  }

  const footer = result ? (
    <Button onClick={onClose}>Terminer</Button>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      {preview && <Button variant="secondary" onClick={() => { setPreview(null); setFile(null); }}>Choisir un autre fichier</Button>}
      {preview && <Button onClick={run} loading={loading} disabled={!preview.valid}>Importer {preview.valid} salarié{preview.valid > 1 ? "s" : ""}</Button>}
    </>
  );

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size={preview && !result ? "xl" : "lg"} title="Importer des salariés" icon={<FileSpreadsheet />} footer={footer}>
      {result ? (
        <div className="py-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 size-12 text-success" strokeWidth={1.75} />
          <h3 className="font-display text-xl font-bold">{result.created} salarié{result.created > 1 ? "s" : ""} importé{result.created > 1 ? "s" : ""}</h3>
          <p className="mt-2 text-sm text-muted">{result.invited} invitation{result.invited > 1 ? "s" : ""} envoyée{result.invited > 1 ? "s" : ""} par e-mail · {result.skipped} ligne{result.skipped > 1 ? "s" : ""} ignorée{result.skipped > 1 ? "s" : ""}</p>
          {result.failures.length > 0 && (
            <ul className="mx-auto mt-4 max-w-md space-y-1 text-left text-sm text-danger">
              {result.failures.map((f) => <li key={f.line}>Ligne {f.line} : {f.error}</li>)}
            </ul>
          )}
        </div>
      ) : preview ? (
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            <StatusPill tone="success"><CheckCircle2 className="size-3.5" /> {preview.valid} prêt{preview.valid > 1 ? "s" : ""} à importer</StatusPill>
            {preview.invalid > 0 && <StatusPill tone="danger"><AlertCircle className="size-3.5" /> {preview.invalid} en erreur</StatusPill>}
            {preview.duplicates > 0 && <StatusPill tone="warning"><Copy className="size-3.5" /> {preview.duplicates} doublon{preview.duplicates > 1 ? "s" : ""} (e-mail)</StatusPill>}
            <span className="ml-auto text-xs text-muted">{file?.name}</span>
          </div>
          <div className="scrollbar-thin max-h-[52vh] overflow-auto rounded-[12px] border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted">
                <tr>{["Ligne", "Nom", "Email", "Poste", "Département", "Contrat", "Validation"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const bad = r.errors.length > 0;
                  return (
                    <tr key={r.line} className={cn("border-t border-border", bad ? "bg-danger-100/50" : r.duplicate ? "bg-warning-100/50" : "")}>
                      <td className="px-3 py-2 font-mono text-xs text-muted">{r.line}</td>
                      <td className="px-3 py-2 font-medium">{r.data.firstName} {r.data.lastName}</td>
                      <td className="px-3 py-2">{r.data.email || <span className="text-danger">Manquant</span>}</td>
                      <td className="px-3 py-2">{r.data.position ?? ""}</td>
                      <td className="px-3 py-2">{r.data.service ?? ""}</td>
                      <td className="px-3 py-2">{r.data.contractType ?? ""}</td>
                      <td className="px-3 py-2 text-xs">
                        {bad ? <span className="text-danger">{r.errors.join(" · ")}</span> : r.duplicate ? <span className="text-[#9a6a00] dark:text-warning">Doublon : e-mail déjà utilisé, ligne ignorée</span> : <span className="text-success">OK</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex gap-4 rounded-[14px] border border-border p-4">
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:text-brand-400">1</div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold">Téléchargez le modèle</h4>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">Remplissez une ligne par personne. Les colonnes Prénom, Nom et Email sont obligatoires. Laissez la colonne Mot de passe vide pour une génération automatique.</p>
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => download("/api/employees/import/template", "modele-import-salaries.xlsx")}><Download /> Modèle Excel</Button>
            </div>
          </div>
          <div className="flex gap-4 rounded-[14px] border border-border p-4">
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:text-brand-400">2</div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold">Importez votre fichier</h4>
              <p className="mt-1 text-[13px] text-muted">Formats acceptés : .xlsx et .csv. Vous verrez un aperçu avant l'import.</p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); void pick(e.dataTransfer.files[0]); }}
                className={cn("mt-3 flex flex-col items-center rounded-[12px] border-2 border-dashed px-4 py-7 text-center transition", drag ? "border-brand-500 bg-brand-100/40" : "border-border")}
              >
                <Upload className="mb-2 size-6 text-muted" strokeWidth={1.75} />
                <p className="text-sm text-muted">Glissez votre fichier ici ou</p>
                <Button size="sm" className="mt-2" onClick={() => input.current?.click()} loading={loading}>Choisir un fichier</Button>
                <input ref={input} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
              </div>
            </div>
          </div>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Colonnes du modèle</div>
            <div className="flex flex-wrap gap-1.5">
              {COLUMNS.map((c) => <span key={c} className={cn("rounded-full border px-2.5 py-1 text-xs", c.endsWith("*") ? "border-brand-500/40 bg-brand-100/50 font-medium text-brand-700 dark:text-brand-400" : "border-border text-muted")}>{c}</span>)}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
