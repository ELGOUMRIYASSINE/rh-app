"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquarePlus, MessagesSquare, Search, Send, Users } from "lucide-react";
import { Avatar, Button, Card, Checkbox, cn, EmptyState, Input, Modal, Skeleton, Textarea } from "@yghr/ui";
import { api } from "@/lib/api";
import { useRealtimeEvent } from "@/components/shell/realtime";

interface Conv { id: string; title: string; isGroup: boolean; members: number; last: { body: string; at: string; mine: boolean } | null; unread: number }
interface Msg { id: string; body: string; at: string; mine: boolean; sender: string }

const time = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
};

export function Messaging() {
  const qc = useQueryClient();
  const [active, setActive] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [composing, setComposing] = useState(false);
  const convs = useQuery({ queryKey: ["convs"], queryFn: () => api<{ items: Conv[] }>("/api/conversations"), refetchInterval: 60_000 });
  const msgs = useQuery({ queryKey: ["msgs", active], enabled: !!active, queryFn: () => api<{ items: Msg[] }>(`/api/conversations/${active}/messages`) });
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useRealtimeEvent<{ conversationId: string }>("message:new", (p) => {
    void qc.invalidateQueries({ queryKey: ["convs"] });
    if (p.conversationId === active) void msgs.refetch();
    void qc.invalidateQueries({ queryKey: ["messages-unread"] });
  });
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.data]);
  useEffect(() => { if (active) void qc.invalidateQueries({ queryKey: ["messages-unread"] }); }, [active, msgs.data, qc]);
  async function send() {
    const body = text.trim();
    if (!body || !active) return;
    setText("");
    await api(`/api/conversations/${active}/messages`, { body: { body } });
    void msgs.refetch();
    void convs.refetch();
  }
  const list = (convs.data?.items ?? []).filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));
  const current = convs.data?.items.find((c) => c.id === active);

  return (
    <div>
      <h1 className="mb-5 font-display text-[26px] font-bold">Messagerie</h1>
      <Card className="grid h-[calc(100dvh-220px)] min-h-[480px] overflow-hidden md:grid-cols-[320px_1fr]">
        <aside className={cn("flex min-h-0 flex-col border-r border-border", active && "hidden md:flex")}>
          <div className="flex gap-2 border-b border-border p-3">
            <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="h-9 pl-9" aria-label="Rechercher" /></div>
            <Button size="icon" onClick={() => setComposing(true)} aria-label="Nouvelle conversation"><MessageSquarePlus /></Button>
          </div>
          <ul className="scrollbar-thin flex-1 overflow-y-auto">
            {convs.isLoading && <li className="space-y-2 p-3"><Skeleton className="h-14" /><Skeleton className="h-14" /></li>}
            {list.map((c) => (
              <li key={c.id}>
                <button onClick={() => setActive(c.id)} className={cn("flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left hover:bg-surface-2", active === c.id && "bg-brand-100/50")}>
                  {c.isGroup ? <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700 dark:text-brand-400"><Users className="size-4" /></span> : <Avatar name={c.title} size={40} />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2"><span className={cn("truncate text-sm", c.unread ? "font-bold" : "font-medium")}>{c.title}</span>{c.last && <span className="shrink-0 text-[11px] text-muted">{time(c.last.at)}</span>}</span>
                    <span className="flex items-center justify-between gap-2"><span className="truncate text-xs text-muted">{c.last ? `${c.last.mine ? "Vous : " : ""}${c.last.body}` : "Nouvelle conversation"}</span>{c.unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-accent-500 px-1.5 text-[10px] font-bold text-brand-900">{c.unread}</span>}</span>
                  </span>
                </button>
              </li>
            ))}
            {convs.data && !list.length && <li className="px-4 py-10 text-center text-sm text-muted">Aucune conversation. Démarrez-en une avec le bouton ＋.</li>}
          </ul>
        </aside>
        <section className={cn("flex min-h-0 flex-col", !active && "hidden md:flex")}>
          {!active ? <EmptyState icon={<MessagesSquare />} title="Vos messages" action={<Button onClick={() => setComposing(true)}><MessageSquarePlus /> Nouvelle conversation</Button>}>Échangez avec votre équipe et le service RH, en temps réel.</EmptyState> : (
            <>
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <button className="grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-surface-2 md:hidden" onClick={() => setActive(null)} aria-label="Retour"><ArrowLeft className="size-4" /></button>
                <div className="font-semibold">{current?.title}</div>
                {current?.isGroup && <span className="text-xs text-muted">{current.members} membres</span>}
              </div>
              <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto bg-surface-2/40 p-4">
                {msgs.data?.items.map((m, i) => {
                  const prev = msgs.data!.items[i - 1];
                  return (
                    <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[75%] rounded-[16px] px-3.5 py-2 text-sm shadow-soft", m.mine ? "rounded-br-[4px] bg-brand-500 text-white dark:text-brand-900" : "rounded-bl-[4px] bg-surface")}>
                        {current?.isGroup && !m.mine && prev?.sender !== m.sender && <div className="mb-0.5 text-[11px] font-semibold text-brand-500">{m.sender}</div>}
                        <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        <div className={cn("mt-0.5 text-right text-[10px]", m.mine ? "text-white/70 dark:text-brand-900/60" : "text-muted")}>{time(m.at)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={end} />
              </div>
              <form className="flex items-end gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
                <Textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Écrire un message… (Entrée pour envoyer)" rows={1} className="max-h-32 min-h-10 resize-none" aria-label="Message" />
                <Button type="submit" size="icon" disabled={!text.trim()} aria-label="Envoyer"><Send /></Button>
              </form>
            </>
          )}
        </section>
      </Card>
      {composing && <Compose onClose={() => setComposing(false)} onCreated={(id) => { setComposing(false); setActive(id); void convs.refetch(); }} />}
    </div>
  );
}

function Compose({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const contacts = useQuery({ queryKey: ["contacts"], queryFn: () => api<{ items: { userId: string; name: string; subtitle: string }[] }>("/api/contacts") });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  async function start() {
    const r = await api<{ id: string }>("/api/conversations", { body: { userIds: [...sel], title: sel.size > 1 ? title || undefined : undefined } });
    onCreated(r.id);
  }
  const list = (contacts.data?.items ?? []).filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Nouvelle conversation" icon={<MessageSquarePlus />} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={start} disabled={!sel.size}>Démarrer</Button></>}>
      <div className="space-y-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une personne…" aria-label="Rechercher" />
        {sel.size > 1 && <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nom du groupe (optionnel)" aria-label="Nom du groupe" />}
        <div className="scrollbar-thin max-h-72 space-y-0.5 overflow-y-auto rounded-[12px] border border-border p-1.5">
          {list.map((c) => (
            <label key={c.userId} className="flex cursor-pointer items-center gap-3 rounded-[8px] px-2 py-1.5 hover:bg-surface-2">
              <Checkbox checked={sel.has(c.userId)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(c.userId)) n.delete(c.userId); else n.add(c.userId); return n; })} />
              <Avatar name={c.name} size={28} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm">{c.name}</span><span className="block truncate text-[11px] text-muted">{c.subtitle}</span></span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
