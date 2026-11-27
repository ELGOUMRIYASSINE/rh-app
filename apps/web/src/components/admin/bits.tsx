"use client";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { buttonVariants, cn, StatusPill } from "@yghr/ui";
import { dateOnly, dateTime, STATUS } from "./fmt";

export function ClinicAvatar({ name, logo, size = 36 }: { name: string; logo: string | null; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-[10px] border border-border bg-white text-brand-700" style={{ width: size, height: size }}>
      {logo ? <img src={logo} alt="" className="max-h-full max-w-full object-contain p-0.5" /> : <Building2 className="size-[55%]" strokeWidth={1.75} />}
    </span>
  );
}

export function OrgStatusPill({ status, isDemo }: { status: string; isDemo?: boolean }) {
  const [label, tone] = STATUS[status] ?? [status, "info"];
  return <span className="inline-flex items-center gap-1"><StatusPill tone={tone} dot>{label}</StatusPill>{isDemo && <StatusPill tone="accent">Démo</StatusPill>}</span>;
}

export function HealthDot({ level }: { level: "success" | "warning" | "danger" }) {
  return <span className={cn("inline-block size-2.5 rounded-full", level === "success" ? "bg-success" : level === "warning" ? "bg-warning" : "bg-danger")} aria-label={level === "success" ? "Tout va bien" : level === "warning" ? "À surveiller" : "Problème"} />;
}

export interface FeedItem { id: string; at: string; action: string; actionLabel: string; entity: string; org: { id: string; name: string } | null; user: string; byPlatform: boolean; ip: string | null; summary: string }

const ACTION_TONE: Record<string, string> = { LOGIN_FAILED: "text-danger", DELETE: "text-danger", SUSPEND: "text-danger", SUPPORT_ACCESS: "text-accent-500", CREATE: "text-success" };

export function Feed({ items, showOrg = true }: { items: FeedItem[]; showOrg?: boolean }) {
  if (!items.length) return <div className="p-6 text-center text-sm text-muted">Aucune activité.</div>;
  return (
    <ul className="divide-y divide-border">
      {items.map((f) => (
        <li key={f.id} className="flex items-start gap-3 px-5 py-3 text-sm">
          <span className="mt-0.5 w-[118px] shrink-0 font-mono text-[11.5px] text-muted"><When iso={f.at} /></span>
          <div className="min-w-0 flex-1">
            <span className={cn("font-medium", ACTION_TONE[f.action])}>{f.actionLabel}</span>
            <span className="text-muted"> · {f.entity.toLowerCase().replace(/_/g, " ")}</span>
            {f.summary && <span> : {f.summary}</span>}
            <div className="truncate text-xs text-muted">
              {f.user}{f.byPlatform && " (YGHR)"}
              {showOrg && f.org && <> · <Link href={`/admin/cliniques/${f.org.id}`} className="hover:text-brand-500">{f.org.name}</Link></>}
              {f.ip && <> · {f.ip}</>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A Link styled as a button (usable from server pages). */
export function LinkButton({ href, children, variant = "primary", size = "md" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" }) {
  return <Link href={href} className={buttonVariants({ variant, size })}>{children}</Link>;
}

/** A date rendered the same way on server and browser; tolerates time-zone data differences between them. */
export function When({ iso, date }: { iso: string | null | undefined; date?: boolean }) {
  return <time dateTime={iso ?? undefined} suppressHydrationWarning>{date ? dateOnly(iso) : dateTime(iso)}</time>;
}
