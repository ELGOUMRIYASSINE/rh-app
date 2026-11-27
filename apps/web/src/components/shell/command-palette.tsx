"use client";
import { Command } from "cmdk";
import { Dialog } from "radix-ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarPlus, CornerDownLeft, Search, UserPlus, Wallet, UserCheck } from "lucide-react";
import { Avatar } from "@yghr/ui";
import { NAV_ICONS } from "./icons";
import type { NavGroup } from "./nav";

interface Emp { id: string; firstName: string; lastName: string; position: string | null; matricule: string | null }

export function CommandPalette({ open, onOpenChange, base, nav, space }: { open: boolean; onOpenChange: (o: boolean) => void; base: string; nav: (NavGroup & { items: (NavGroup["items"][number] & { locked?: boolean })[] })[]; space: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [emps, setEmps] = useState<Emp[]>([]);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  useEffect(() => {
    if (space === "salarie" || q.trim().length < 2) {
      setEmps([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/employees?q=${encodeURIComponent(q)}&limit=6`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => setEmps(d.items ?? []))
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, space]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  const item = "flex cursor-pointer items-center gap-3 rounded-[9px] px-3 py-2.5 text-sm data-[selected=true]:bg-brand-100 data-[selected=true]:text-brand-700 dark:data-[selected=true]:text-brand-400 [&_svg]:size-4 [&_svg]:stroke-[1.75]";
  const group = "px-2 py-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted";

  const actions =
    space === "rh"
      ? [
          { label: "Ajouter un salarié", icon: UserPlus, href: `${base}/employes?new=1` },
          { label: "Nouvelle demande de congé", icon: CalendarPlus, href: `${base}/conges?new=1` },
          { label: "Présences du jour", icon: UserCheck, href: `${base}/presences` },
          { label: "Créer une période de paie", icon: Wallet, href: `${base}/paie?new=1` },
        ]
      : space === "salarie"
        ? [{ label: "Nouvelle demande de congé", icon: CalendarPlus, href: `${base}/conges?new=1` }]
        : [{ label: "Nouvelle demande de congé", icon: CalendarPlus, href: `${base}/conges?new=1` }];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-brand-900/40 backdrop-blur-[2px] animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-24px)] max-w-[600px] -translate-x-1/2 overflow-hidden rounded-[16px] border border-border bg-surface shadow-pop animate-pop">
          <Dialog.Title className="sr-only">Palette de commandes</Dialog.Title>
          <Dialog.Description className="sr-only">Rechercher une page, un salarié ou une action</Dialog.Description>
          <Command shouldFilter label="Palette de commandes" loop>
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 text-muted" />
              <Command.Input value={q} onValueChange={setQ} placeholder="Rechercher une page, un salarié, une action…" className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
            </div>
            <Command.List className="scrollbar-thin max-h-[420px] overflow-y-auto pb-2">
              <Command.Empty className="px-4 py-10 text-center text-sm text-muted">Aucun résultat pour « {q} ».</Command.Empty>
              {emps.length > 0 && (
                <Command.Group heading="Salariés" className={group}>
                  {emps.map((e) => (
                    <Command.Item key={e.id} value={`emp ${e.firstName} ${e.lastName} ${e.matricule ?? ""}`} onSelect={() => go(`${base}/employes/${e.id}`)} className={item}>
                      <Avatar name={`${e.firstName} ${e.lastName}`} size={24} />
                      <span className="flex-1">{e.firstName} {e.lastName}</span>
                      <span className="text-xs text-muted">{e.position}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Actions rapides" className={group}>
                {actions.map((a) => (
                  <Command.Item key={a.label} value={a.label} onSelect={() => go(a.href)} className={item}>
                    <a.icon />
                    {a.label}
                  </Command.Item>
                ))}
              </Command.Group>
              {nav.map((g) => (
                <Command.Group key={g.label} heading={g.label} className={group}>
                  {g.items.filter((i) => !i.locked).map((i) => {
                    const Icon = NAV_ICONS[i.icon];
                    return (
                      <Command.Item key={i.href} value={`page ${i.label}`} onSelect={() => go(`${base}${i.href}`)} className={item}>
                        <Icon />
                        <span className="flex-1">{i.label}</span>
                        <CornerDownLeft className="opacity-0 [[data-selected=true]_&]:opacity-60" />
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
