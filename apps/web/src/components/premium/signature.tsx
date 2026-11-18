"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, Eye, FileSignature, Mail, PenLine, Send, Signature, Upload } from "lucide-react";
import { useRef } from "react";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";
import { Avatar, Button, Card, Checkbox, cn, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Skeleton, StatusPill, td, th } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { frDate } from "@/lib/format";
import { confirmDialog } from "@/components/confirm";

interface Req { id: string; title: string; employee: { id: string; firstName: string; lastName: string }; status: string; fileUrl: string; signedFileUrl: string | null; signedAt: string | null; createdAt: string; mine: boolean }
const ST: Record<string, [string, "warning" | "success" | "danger" | "neutral"]> = { SENT: ["En attente", "warning"], SIGNED: ["Signé", "success"], DECLINED: ["Refusé", "danger"], EXPIRED: ["Annulé", "neutral"], DRAFT: ["Brouillon", "neutral"] };

export function SignatureModule({ canSend, employees, signerName }: { canSend: boolean; employees: { id: string; name: string }[]; signerName?: string }) {
  const q = useQuery({ queryKey: ["signatures"], queryFn: () => api<{ items: Req[] }>("/api/signature-requests") });
  const [sending, setSending] = useState(false);
  const [signing, setSigning] = useState<Req | null>(null);
  const items = q.data?.items ?? [];
  const toSign = items.filter((r) => r.mine && r.status === "SENT");
  const others = items.filter((r) => !(r.mine && r.status === "SENT"));
  return (
    <div>
      <PageHeader title="Signature électronique" subtitle={canSend ? "Envoyez des documents à signer et suivez leur statut. Chaque signature est horodatée et tracée." : "Documents que l'on vous demande de signer"} actions={canSend && <Button onClick={() => setSending(true)}><Send /> Envoyer un document</Button>} />
      {toSign.length > 0 && (
        <div className="mb-5 grid gap-3 md:grid-cols-2">
          {toSign.map((r) => (
            <Card key={r.id} className="flex items-center gap-4 border-accent-500/40 p-4">
              <div className="grid size-11 place-items-center rounded-[12px] bg-accent-100 text-[#9b5d0b] dark:text-accent-500"><FileSignature className="size-5" /></div>
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{r.title}</div><div className="text-xs text-muted">Reçu le {frDate(r.createdAt)}</div></div>
              <Button onClick={() => setSigning(r)}><PenLine /> Signer</Button>
            </Card>
          ))}
        </div>
      )}
      <Card>
        {q.isLoading ? <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : !others.length && !toSign.length ? (
          <EmptyState icon={<FileSignature />} title="Aucun document" action={canSend ? <Button onClick={() => setSending(true)}><Upload /> Envoyer un document</Button> : undefined}>{canSend ? "Contrats, avenants, règlements : envoyez un PDF, le salarié le signe en ligne avec un code reçu par e-mail." : "Vous n'avez aucun document à signer."}</EmptyState>
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr>{["Document", ...(canSend ? ["Destinataire"] : []), "Envoyé le", "Statut", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {others.map((r) => {
                  const [l, t] = ST[r.status] ?? [r.status, "neutral" as const];
                  return (
                    <tr key={r.id} className="hover:bg-surface-2/50">
                      <td className={cn(td, "font-medium")}>{r.title}</td>
                      {canSend && <td className={td}><div className="flex items-center gap-2"><Avatar name={`${r.employee.firstName} ${r.employee.lastName}`} size={26} />{r.employee.firstName} {r.employee.lastName}</div></td>}
                      <td className={cn(td, "text-[13px]")}>{frDate(r.createdAt)}</td>
                      <td className={td}><StatusPill tone={t}>{l}</StatusPill>{r.signedAt && <div className="mt-0.5 text-[11px] text-muted">le {frDate(r.signedAt)}</div>}</td>
                      <td className={cn(td, "whitespace-nowrap text-right")}>
                        <div className="flex justify-end gap-1.5">
                          <a href={r.signedFileUrl ?? r.fileUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border px-3 text-[13px] hover:bg-surface-2"><Eye className="size-4" />{r.signedFileUrl ? "PDF signé" : "Voir"}</a>
                          {canSend && r.status === "SENT" && !r.mine && <Button size="sm" variant="ghost" onClick={async () => { if (await confirmDialog({ title: "Annuler cette demande de signature ?", danger: true, confirmLabel: "Annuler la demande" })) { await api(`/api/signature-requests/${r.id}/cancel`, { body: {} }); void q.refetch(); } }}><Ban /> Annuler</Button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {sending && <SendModal employees={employees} onClose={() => setSending(false)} onDone={() => { setSending(false); void q.refetch(); }} />}
      {signing && <SignModal req={signing} signerName={signerName ?? ""} onClose={() => setSigning(null)} onDone={() => { setSigning(null); void q.refetch(); }} />}
    </div>
  );
}

function SendModal({ employees, onClose, onDone }: { employees: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [placement, setPlacement] = useState("bottom-right");
  const [saving, setSaving] = useState(false);
  async function send() {
    setSaving(true);
    const f = new FormData();
    f.append("file", file!);
    f.append("title", title);
    f.append("employeeIds", [...sel].join(","));
    f.append("placement", placement);
    try {
      const r = await api<{ count: number }>("/api/signature-requests", { form: f });
      toast.success(`Document envoyé à ${r.count} destinataire(s). Ils sont notifiés.`);
      onDone();
    } catch {}
    setSaving(false);
  }
  return (
    <Modal open size="lg" onOpenChange={(o) => !o && onClose()} icon={<Send />} title="Envoyer un document à signer" footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={send} loading={saving} disabled={!file || title.length < 3 || !sel.size}>Envoyer</Button></>}>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <Field label="Document (PDF)" required>
            <label className="flex cursor-pointer flex-col items-center rounded-[12px] border-2 border-dashed border-border px-4 py-8 text-center hover:border-brand-500">
              <Upload className="mb-2 size-6 text-muted" />
              <span className="text-sm">{file?.name ?? "Choisir un PDF"}</span>
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const x = e.target.files?.[0] ?? null; setFile(x); if (x && !title) setTitle(x.name.replace(/\.pdf$/i, "")); }} />
            </label>
          </Field>
          <Field label="Titre" required htmlFor="st"><Input id="st" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex. Avenant au contrat de travail" /></Field>
          <Field label="Emplacement de la signature manuscrite" htmlFor="sp" help="Si le salarié signe à la main, son tracé est apposé à cet endroit. Un certificat de signature est toujours ajouté en dernière page.">
            <Select id="sp" value={placement} onChange={(e) => setPlacement(e.target.value)}>
              <option value="bottom-right">Dernière page, en bas à droite</option>
              <option value="bottom-left">Dernière page, en bas à gauche</option>
              <option value="certificate">Page de certificat uniquement</option>
            </Select>
          </Field>
        </div>
        <Field label={`Destinataires · ${sel.size}`}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer…" className="mb-2 h-9" />
          <div className="scrollbar-thin max-h-64 space-y-0.5 overflow-y-auto rounded-[12px] border border-border p-1.5">
            {employees.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())).map((e) => (
              <label key={e.id} className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-1.5 hover:bg-surface-2">
                <Checkbox checked={sel.has(e.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })} />
                <span className="text-sm">{e.name}</span>
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function SignModal({ req, signerName, onClose, onDone }: { req: Req; signerName: string; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<"read" | "sign" | "done">("read");
  const [method, setMethod] = useState<"draw" | "otp">("draw");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signedUrl, setSignedUrl] = useState("");
  const pad = useRef<SignaturePadHandle>(null);

  async function sendCode() {
    setBusy(true);
    try { const r = await api<{ sentTo: string }>(`/api/signature-requests/${req.id}/otp`, { body: {} }); setSentTo(r.sentTo); toast.success("Code envoyé."); } catch {}
    setBusy(false);
  }
  async function sign() {
    setBusy(true);
    try {
      const body = method === "draw" ? { method, signature: pad.current?.toDataURL(), fullName: name, consent: agree } : { method, code, fullName: name };
      const r = await api<{ signedFileUrl: string }>(`/api/signature-requests/${req.id}/sign`, { body });
      setSignedUrl(r.signedFileUrl);
      setStep("done");
    } catch {}
    setBusy(false);
  }
  async function decline() {
    const reason = await confirmDialog({ title: "Refuser de signer ce document ?", reasonLabel: "Motif (transmis à l'expéditeur)", confirmLabel: "Refuser", danger: true });
    if (reason === false) return;
    await api(`/api/signature-requests/${req.id}/decline`, { body: { reason } });
    toast.success("Refus transmis.");
    onDone();
  }
  const nameOk = name.trim().length >= 3;
  const canSign = method === "draw" ? drawn && nameOk && agree : code.length === 6 && nameOk && !!sentTo;
  const footer =
    step === "done" ? <Button onClick={onDone}>Terminer</Button>
    : step === "read" ? <><Button variant="danger-ghost" className="mr-auto" onClick={decline}>Refuser</Button><Button variant="ghost" onClick={onClose}>Plus tard</Button><Button onClick={() => setStep("sign")}><PenLine /> Signer ce document</Button></>
    : <><Button variant="ghost" className="mr-auto" onClick={() => setStep("read")}>Retour au document</Button><Button onClick={sign} loading={busy} disabled={!canSign}><PenLine /> Valider ma signature</Button></>;

  return (
    <Modal open size="xl" onOpenChange={(o) => !o && (step === "done" ? onDone() : onClose())} icon={<FileSignature />} title={req.title} subtitle={step === "read" ? "Lisez le document avant de le signer." : "Choisissez comment signer : à la main ou avec un code reçu par e-mail."} footer={footer}>
      {step === "done" ? (
        <div className="py-10 text-center">
          <CheckCircle2 className="mx-auto mb-3 size-14 text-success" />
          <h3 className="font-display text-xl font-bold">Document signé</h3>
          <p className="mt-2 text-sm text-muted">Une copie signée avec son certificat est ajoutée à vos documents.</p>
          <a href={signedUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-medium text-brand-500 hover:underline">Ouvrir le PDF signé</a>
        </div>
      ) : step === "read" ? (
        <iframe src={req.fileUrl} title={req.title} className="h-[62vh] w-full rounded-[12px] border border-border bg-surface-2" />
      ) : (
        <div className="mx-auto max-w-xl space-y-5">
          <Segmented value={method} onChange={(v) => setMethod(v)} className="w-full [&>button]:flex-1 [&>button]:justify-center" options={[{ value: "draw", label: <span className="inline-flex items-center gap-1.5"><Signature className="size-4" /> Signer à la main</span> }, { value: "otp", label: <span className="inline-flex items-center gap-1.5"><Mail className="size-4" /> Code par e-mail</span> }]} />
          {method === "draw" ? (
            <>
              <SignaturePad ref={pad} onChange={(empty) => setDrawn(!empty)} />
              <Field label="Votre nom complet" htmlFor="sn" help={signerName ? `Saisissez « ${signerName} »` : undefined}><Input id="sn" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} label="J'ai lu ce document et je le signe. Ma signature manuscrite sera apposée sur le PDF avec la date, l'heure et mon adresse IP." />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-surface-2 p-3.5 text-sm">
                <span className="flex-1">{sentTo ? <>Code envoyé à <b>{sentTo}</b>, valable 10 minutes.</> : "Recevez un code à 6 chiffres sur votre adresse e-mail."}</span>
                <Button size="sm" variant={sentTo ? "secondary" : "primary"} onClick={sendCode} loading={busy}><Mail /> {sentTo ? "Renvoyer" : "Recevoir mon code"}</Button>
              </div>
              <Field label="Code reçu" htmlFor="sc"><Input id="sc" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} disabled={!sentTo} className="h-12 text-center font-mono text-xl tracking-[0.4em]" /></Field>
              <Field label="Votre nom complet" htmlFor="sn2" help={signerName ? `Saisissez « ${signerName} »` : undefined}><Input id="sn2" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
