"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, LifeBuoy, Send } from "lucide-react";
import { Avatar, Button, Card, Checkbox, cn, EmptyState, PageHeader, Segmented, Select, StatusPill, td, Textarea, th } from "@yghr/ui";
import { toast } from "sonner";
import { When } from "./bits";
import type { TicketThread } from "@/server/platform-data";
import { api } from "@/lib/api";
import { T_CATEGORY, T_PRIORITY, T_STATUS } from "./fmt";

interface Row { id: string; subject: string; category: string; status: string; priority: string; lastFromPlatform: boolean; org: { id: string; name: string }; author: string; messages: number; updatedAt: string }

export function TicketsView({ tickets, filter }: { tickets: Row[]; filter: string }) {
  const router = useRouter();
  return (
    <div>
      <PageHeader title="Support" subtitle="Les demandes envoyées par les cliniques depuis leur espace (menu « Support »)." />
      <Card>
        <div className="p-4"><Segmented value={filter} onChange={(v) => router.push(`/admin/support?f=${v}`)} options={[{ value: "open", label: "À traiter" }, { value: "resolved", label: "Résolues" }, { value: "all", label: "Toutes" }]} /></div>
        {tickets.length === 0 ? <EmptyState icon={<LifeBuoy />} title="Aucune demande">Rien à traiter pour le moment.</EmptyState> : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead><tr>{["Demande", "Clinique", "Catégorie", "Priorité", "Statut", "Mise à jour"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => router.push(`/admin/support/${t.id}`)}>
                    <td className={td}><div className="flex items-center gap-2">{!t.lastFromPlatform && t.status !== "RESOLVED" && <span className="size-2 shrink-0 rounded-full bg-accent-500" aria-label="Attend votre réponse" />}<Link href={`/admin/support/${t.id}`} className="font-medium hover:text-brand-500" onClick={(e) => e.stopPropagation()}>{t.subject}</Link></div><div className="text-xs text-muted">{t.author} · {t.messages} message(s)</div></td>
                    <td className={`${td} text-[13px]`}>{t.org.name}</td>
                    <td className={`${td} text-[13px] text-muted`}>{T_CATEGORY[t.category] ?? t.category}</td>
                    <td className={td}><StatusPill tone={T_PRIORITY[t.priority]![1]}>{T_PRIORITY[t.priority]![0]}</StatusPill></td>
                    <td className={td}><StatusPill tone={T_STATUS[t.status]![1]}>{T_STATUS[t.status]![0]}</StatusPill></td>
                    <td className={`${td} text-[13px] text-muted`}><When iso={t.updatedAt} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Conversation thread, shared by the console (side="platform") and the clinic (side="clinic"). */
export function Thread({ t, side, postUrl, patchUrl, backHref, backLabel }: { t: TicketThread; side: "platform" | "clinic"; postUrl: string; patchUrl?: string; backHref?: string; backLabel?: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [resolve, setResolve] = useState(false);
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try { await api(postUrl, { body: { body: msg, resolve } }); setMsg(""); setResolve(false); toast.success(resolve ? "Réponse envoyée, demande résolue." : "Réponse envoyée."); router.refresh(); } catch {}
    setBusy(false);
  }
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {backHref && <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" /> {backLabel}</Link>}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] font-bold leading-tight">{t.subject}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            {side === "platform" && <Link href={`/admin/cliniques/${t.org.id}`} className="font-medium text-text hover:text-brand-500">{t.org.name}</Link>}
            {t.author && <span>{t.author.name} · {t.author.email}</span>}
            <span>· {T_CATEGORY[t.category] ?? t.category} · ouverte le <When iso={t.createdAt} /></span>
          </div>
        </div>
        {side === "platform" && patchUrl ? (
          <div className="flex gap-2">
            <Select value={t.priority} onChange={async (e) => { await api(patchUrl, { method: "PATCH", body: { priority: e.target.value } }); router.refresh(); }} className="h-9 w-auto" aria-label="Priorité">{Object.entries(T_PRIORITY).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select>
            <Select value={t.status} onChange={async (e) => { await api(patchUrl, { method: "PATCH", body: { status: e.target.value } }); toast.success("Statut mis à jour."); router.refresh(); }} className="h-9 w-auto" aria-label="Statut">{Object.entries(T_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select>
          </div>
        ) : <StatusPill tone={T_STATUS[t.status]![1]}>{side === "clinic" && t.status === "WAITING_CLINIC" ? "Réponse reçue" : T_STATUS[t.status]![0]}</StatusPill>}
      </div>
      <div className="space-y-3">
        {t.messages.map((m) => {
          const mine = (side === "platform") === m.fromPlatform;
          return (
            <div key={m.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
              <Avatar name={m.author} size={34} />
              <div className={cn("max-w-[80%] rounded-[14px] px-4 py-3", mine ? "bg-brand-500 text-white dark:text-brand-900" : "border border-border bg-surface")}>
                <div className={cn("mb-1 text-xs", mine ? "text-white/75 dark:text-brand-900/70" : "text-muted")}>{m.author}{m.fromPlatform && " · Support YGHR"} · <When iso={m.at} /></div>
                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</div>
              </div>
            </div>
          );
        })}
      </div>
      <Card className="space-y-3 p-4">
        <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} placeholder={side === "platform" ? "Votre réponse à la clinique…" : "Ajouter un message pour l'équipe YGHR…"} aria-label="Message" />
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox checked={resolve} onChange={(e) => setResolve(e.target.checked)} label={side === "platform" ? "Marquer comme résolue" : "Mon problème est résolu"} />
          <div className="ml-auto flex gap-2">
            {side === "clinic" && t.status !== "RESOLVED" && <Button variant="ghost" onClick={async () => { await api(postUrl, { body: { resolve: true } }); toast.success("Demande clôturée."); router.refresh(); }}><Check /> Clôturer sans message</Button>}
            <Button onClick={send} loading={busy} disabled={!msg.trim()}><Send /> Envoyer</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
