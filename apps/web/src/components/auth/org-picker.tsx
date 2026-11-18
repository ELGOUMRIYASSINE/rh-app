"use client";
import { useEffect, useState } from "react";
import { Building2, ChevronRight, Loader2 } from "lucide-react";

export function OrgPicker({ items, preferred }: { items: { id: string; name: string; slug: string; role: string; logo: string | null }[]; preferred?: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function choose(id: string) {
    setBusy(id);
    const res = await fetch("/api/auth/switch-org", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId: id }) });
    const data = await res.json();
    if (res.ok) window.location.href = data.redirect;
    else setBusy(null);
  }
  useEffect(() => {
    const p = items.find((i) => i.slug === preferred);
    if (p) void choose(p.id);
    else if (items.length === 1) void choose(items[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <ul className="space-y-2.5">
      {items.map((o) => (
        <li key={o.id}>
          <button onClick={() => choose(o.id)} disabled={!!busy} className="flex w-full cursor-pointer items-center gap-3.5 rounded-[14px] border border-border bg-surface p-4 text-left shadow-soft transition hover:border-brand-500 hover:shadow-pop disabled:opacity-60">
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-100 text-brand-500">{o.logo ? <img src={o.logo} alt="" className="size-full bg-white object-contain p-0.5" /> : <Building2 className="size-5" strokeWidth={1.75} />}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{o.name}</span>
              <span className="block text-xs text-muted">{o.role} · {o.slug}</span>
            </span>
            {busy === o.id ? <Loader2 className="size-4 animate-spin text-muted" /> : <ChevronRight className="size-4 text-muted" />}
          </button>
        </li>
      ))}
    </ul>
  );
}
