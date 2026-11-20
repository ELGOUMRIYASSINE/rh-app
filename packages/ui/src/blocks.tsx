import * as React from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { cn } from "./cn";

/** EmptyState: icon in a soft circle, a title, one helpful sentence, a primary CTA. */
export function EmptyState({ icon, title, children, action, className, compact }: { icon: React.ReactNode; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      <div className={cn("grid place-items-center rounded-full bg-brand-100 text-brand-500 [&_svg]:stroke-[1.75]", compact ? "mb-3 size-11 [&_svg]:size-5" : "mb-4 size-14 [&_svg]:size-6")}>{icon}</div>
      <h3 className={cn("font-semibold", compact ? "text-sm" : "text-base")}>{title}</h3>
      {children && <p className={cn("mt-1.5 max-w-sm leading-relaxed text-muted text-balance", compact ? "text-xs" : "text-sm")}>{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** KpiCard: icon chip, big tabular number, label, sub-label, thin progress bar and a ↗ link. */
export function KpiCard({ icon, value, label, sub, progress, tone = "brand", href, LinkComponent }: { icon: React.ReactNode; value: React.ReactNode; label: string; sub?: React.ReactNode; progress?: number; tone?: "brand" | "success" | "warning" | "danger" | "accent"; href?: string; LinkComponent?: React.ElementType }) {
  const toneMap = {
    brand: ["bg-brand-100 text-brand-700 dark:text-brand-400", "bg-brand-500"],
    success: ["bg-success-100 text-success", "bg-success"],
    warning: ["bg-warning-100 text-[#9a6a00] dark:text-warning", "bg-warning"],
    danger: ["bg-danger-100 text-danger", "bg-danger"],
    accent: ["bg-accent-100 text-[#9b5d0b] dark:text-accent-500", "bg-accent-500"],
  }[tone];
  const L = LinkComponent ?? "a";
  return (
    <div className="group relative flex flex-col rounded-[16px] border border-border bg-surface p-5 shadow-soft transition-shadow duration-200 hover:shadow-pop">
      <div className="flex items-start justify-between">
        <div className={cn("grid size-10 place-items-center rounded-[11px] [&_svg]:size-5 [&_svg]:stroke-[1.75]", toneMap[0])}>{icon}</div>
        {href && (
          <L href={href} className="grid size-8 place-items-center rounded-full text-muted transition-colors group-hover:bg-surface-2 group-hover:text-text after:absolute after:inset-0" aria-label={`Voir le détail : ${label}`}>
            <ArrowUpRight className="size-4" />
          </L>
        )}
      </div>
      <div className="mt-4 font-display text-[30px] font-semibold leading-none tracking-[-0.02em] tabular">{value}</div>
      <div className="mt-2 text-sm font-medium">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
      {progress !== undefined && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className={cn("h-full rounded-full transition-[width] duration-500", toneMap[1])} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  );
}

/** StepCard: numbered onboarding step. */
export function StepCard({ n, title, children, done, action }: { n: number; title: React.ReactNode; children?: React.ReactNode; done?: boolean; action?: React.ReactNode }) {
  return (
    <div className={cn("flex gap-4 rounded-[14px] border p-4", done ? "border-success/30 bg-success-100/40" : "border-border bg-surface")}>
      <div className={cn("grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold", done ? "bg-success text-white" : "bg-brand-100 text-brand-700 dark:text-brand-400")}>{done ? <Check className="size-4" strokeWidth={2.5} /> : n}</div>
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-semibold", done && "text-muted line-through decoration-1")}>{title}</div>
        {children && <div className="mt-1 text-[13px] leading-relaxed text-muted">{children}</div>}
        {action && !done && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, className }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.025em]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Wrapper for wide tables: sticky header, horizontal scroll. */
export function TableWrap({ children, className, maxHeight }: { children: React.ReactNode; className?: string; maxHeight?: number | string }) {
  return (
    <div className={cn("scrollbar-thin relative overflow-auto", className)} style={maxHeight ? { maxHeight } : undefined}>
      {children}
    </div>
  );
}
export const th = "sticky top-0 z-10 whitespace-nowrap border-b border-border bg-surface-2 px-4 py-2.5 text-left text-[11.5px] font-medium uppercase tracking-[0.05em] text-muted";
export const td = "border-b border-border px-4 py-3 align-middle text-sm";

export function StatTile({ label, value, tone = "neutral", active, onClick, icon }: { label: string; value: React.ReactNode; tone?: "neutral" | "success" | "danger" | "brand"; active?: boolean; onClick?: () => void; icon?: React.ReactNode }) {
  const toneText = { neutral: "text-text", success: "text-success", danger: "text-danger", brand: "text-brand-500" }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("flex flex-1 cursor-pointer items-center gap-4 rounded-[14px] border bg-surface px-5 py-4 text-left shadow-soft transition-all duration-150 hover:shadow-pop", active ? "border-brand-500 ring-3 ring-brand-500/15" : "border-border")}
    >
      {icon && <div className={cn("[&_svg]:size-6 [&_svg]:stroke-[1.75]", toneText)}>{icon}</div>}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
        <div className={cn("mt-1 font-display text-[28px] font-bold leading-none tabular", toneText)}>{value}</div>
      </div>
    </button>
  );
}
