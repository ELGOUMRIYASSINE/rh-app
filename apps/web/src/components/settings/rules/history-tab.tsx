"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, RefreshCw } from "lucide-react";
import { Avatar, Button, Card, CardHeader, cn, Skeleton, StatusPill } from "@yghr/ui";
import { api } from "@/lib/api";

interface H { id: string; entity: string; entityId: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; createdAt: string; user: { firstName: string; lastName: string } | null }

const ENTITY: Record<string, string> = { WORK_RULE: "Règle", SHIFT_TYPE: "Type de shift", STAFF_CATEGORY: "Catégorie", SERVICE: "Service", COVERAGE_RULE: "Couverture", ROTATION: "Rotation", ROTATION_ASSIGNMENT: "Affectation de rotation", PLANNING_EXCEPTION: "Exception" };
const ACTION: Record<string, [string, "success" | "info" | "danger"]> = { CREATE: ["Création", "success"], UPDATE: ["Modification", "info"], DELETE: ["Suppression", "danger"] };
const HIDDEN = new Set(["id", "organizationId", "createdAt", "updatedAt", "updatedById"]);

/** Diff of before/after JSON, showing only the changed keys. */
export function JsonDiff({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((k) => !HIDDEN.has(k));
  const rows = keys.filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
  if (!rows.length) return <p className="text-xs text-muted">Aucun champ modifié.</p>;
  const fmt = (v: unknown) => (v === undefined ? "(vide)" : v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <div className="overflow-x-auto rounded-[10px] border border-border">
      <table className="w-full font-mono text-xs">
        <tbody>
          {rows.map((k) => (
            <tr key={k} className="border-b border-border last:border-0">
              <td className="whitespace-nowrap bg-surface-2 px-3 py-1.5 font-semibold">{k}</td>
              <td className="px-3 py-1.5 text-danger line-through decoration-danger/40">{before ? fmt(before[k]) : ""}</td>
              <td className="px-3 py-1.5 text-success">{after ? fmt(after[k]) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HistoryTab({ active }: { active: boolean }) {
  const q = useQuery({ queryKey: ["rules-history"], enabled: active, queryFn: () => api<{ items: H[] }>("/api/rules/history") });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title="Historique" subtitle="Les 200 dernières modifications des règles, shifts, catégories, rotations, couverture et exceptions." actions={<Button size="sm" variant="secondary" onClick={() => q.refetch()} loading={q.isFetching}><RefreshCw /> Actualiser</Button>} />
      <div className="px-5 pb-5">
        {q.isLoading && <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
        {q.data?.items.length === 0 && <p className="py-10 text-center text-sm text-muted">Aucune modification pour l'instant.</p>}
        <ol className="relative space-y-1 border-l border-border pl-5">
          {q.data?.items.map((h) => {
            const [label, tone] = ACTION[h.action] ?? [h.action, "info" as const];
            const name = (h.after?.name ?? h.before?.name ?? h.after?.type ?? h.before?.type ?? h.after?.title ?? "") as string;
            return (
              <li key={h.id} className="relative">
                <span className={cn("absolute -left-[25px] top-4 size-2.5 rounded-full ring-4 ring-surface", tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : "bg-info")} />
                <button onClick={() => setOpen(open === h.id ? null : h.id)} className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-left hover:bg-surface-2" aria-expanded={open === h.id}>
                  <Avatar name={h.user ? `${h.user.firstName} ${h.user.lastName}` : "Système"} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm"><b>{h.user ? `${h.user.firstName} ${h.user.lastName}` : "Système"}</b> · {ENTITY[h.entity] ?? h.entity} {name && <span className="text-muted">« {name} »</span>}</div>
                    <div className="text-xs text-muted">{new Date(h.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</div>
                  </div>
                  <StatusPill tone={tone}>{label}</StatusPill>
                  <ChevronDown className={cn("size-4 text-muted transition-transform", open === h.id && "rotate-180")} />
                </button>
                {open === h.id && <div className="px-3 pb-3 pt-1"><JsonDiff before={h.before} after={h.after} /></div>}
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}
