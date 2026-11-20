"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LifeBuoy, MessageSquarePlus, Send } from "lucide-react";
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, StatusPill, Textarea } from "@yghr/ui";
import { toast } from "sonner";
import { When } from "@/components/admin/bits";
import type { TicketThread } from "@/server/platform-data";
import { api } from "@/lib/api";
import { Thread } from "@/components/admin/support-views";
import { T_CATEGORY, T_PRIORITY, T_STATUS } from "@/components/admin/fmt";

interface Row { id: string; subject: string; category: string; status: string; priority: string; lastFromPlatform: boolean; messages: number; updatedAt: string }

export function ClinicSupport({ base, tickets, thread }: { base: string; tickets: Row[]; thread: TicketThread | null }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  if (thread) return <Thread t={thread} side="clinic" postUrl={`/api/support/${thread.id}`} backHref={base} backLabel="Mes demandes" />;
  return (
    <div>
      <PageHeader title="Support YGHR" subtitle="Une question, un problème, un besoin ? L'équipe YGHR vous répond ici et par e-mail." actions={<Button onClick={() => setCreating(true)}><MessageSquarePlus /> Nouvelle demande</Button>} />
      <Card>
        {tickets.length === 0 ? (
          <EmptyState icon={<LifeBuoy />} title="Aucune demande" action={<Button onClick={() => setCreating(true)}><MessageSquarePlus /> Contacter le support</Button>}>Décrivez votre problème : l&apos;équipe YGHR voit votre espace et peut vous aider rapidement.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`${base}?t=${t.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2/60">
                  {t.lastFromPlatform && t.status !== "RESOLVED" && <span className="size-2 shrink-0 rounded-full bg-accent-500" aria-label="Nouvelle réponse" />}
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{t.subject}</div><div className="text-xs text-muted">{T_CATEGORY[t.category] ?? t.category} · {t.messages} message(s) · <When iso={t.updatedAt} /></div></div>
                  <StatusPill tone={t.status === "WAITING_CLINIC" ? "accent" : T_STATUS[t.status]![1]}>{t.status === "WAITING_CLINIC" ? "Réponse reçue" : T_STATUS[t.status]![0]}</StatusPill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {creating && <NewTicket onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); router.push(`${base}?t=${id}`); router.refresh(); }} />}
    </div>
  );
}

function NewTicket({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ subject: "", category: "question", priority: "NORMAL", body: "" });
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try { const r = await api<{ id: string }>("/api/support", { body: f }); toast.success("Demande envoyée à l'équipe YGHR."); onCreated(r.id); } catch {}
    setBusy(false);
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} icon={<LifeBuoy />} title="Nouvelle demande de support" subtitle="Plus votre description est précise (page, salarié, date…), plus la réponse est rapide."
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={send} loading={busy} disabled={f.subject.trim().length < 3 || f.body.trim().length < 5}><Send /> Envoyer</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2" label="Sujet" required htmlFor="ts"><Input id="ts" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="ex. La paie de novembre ne se calcule pas" autoFocus /></Field>
        <Field label="Catégorie" htmlFor="tc"><Select id="tc" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(T_CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Urgence" htmlFor="tp"><Select id="tp" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(T_PRIORITY).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field className="sm:col-span-2" label="Description" required htmlFor="tb"><Textarea id="tb" rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Que s'est-il passé ? Qu'attendiez-vous ?" /></Field>
      </div>
    </Modal>
  );
}
