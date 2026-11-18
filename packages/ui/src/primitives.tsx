"use client";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

// ───────── Button ─────────
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium transition-[background,color,box-shadow,transform] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.75] cursor-pointer select-none",
  {
    variants: {
      variant: {
        primary: "bg-brand-500 text-white shadow-[0_1px_2px_rgb(0_0_0/.08)] hover:bg-brand-700 dark:text-brand-900 dark:hover:bg-brand-400",
        secondary: "bg-surface text-text border border-border hover:bg-surface-2",
        ghost: "text-text hover:bg-surface-2",
        subtle: "bg-brand-100 text-brand-700 hover:bg-brand-100/70 dark:text-brand-400",
        accent: "bg-accent-500 text-brand-900 hover:brightness-95",
        danger: "bg-danger text-white hover:brightness-95",
        "danger-ghost": "text-danger hover:bg-danger-100",
        onDark: "bg-white/10 text-white hover:bg-white/20 border border-white/15",
        link: "text-brand-500 underline-offset-4 hover:underline px-0 h-auto",
      },
      size: { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-11 px-5 text-[15px]", icon: "size-9", "icon-sm": "size-8" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
    {loading && <Loader2 className="animate-spin" />}
    {children}
  </button>
));
Button.displayName = "Button";

// ───────── Inputs ─────────
const fieldBase =
  "w-full rounded-[10px] border border-border bg-surface px-3 text-sm text-text placeholder:text-muted/70 transition-[border,box-shadow] duration-150 outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:opacity-60 disabled:bg-surface-2 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-[84px] py-2.5 leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      fieldBase,
      "h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2366736F%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-medium text-text", className)} {...props} />;
}

export function Field({ label, htmlFor, required, help, error, children, className }: { label?: React.ReactNode; htmlFor?: string; required?: boolean; help?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span aria-hidden="true" className="ml-0.5 text-danger">*</span>}
        </Label>
      )}
      {children}
      {error ? <p className="text-xs text-danger" role="alert">{error}</p> : help ? <p className="text-xs leading-relaxed text-muted">{help}</p> : null}
    </div>
  );
}

export function SectionLabel({ children, className, n }: { children: React.ReactNode; className?: string; n?: number }) {
  return (
    <div className={cn("flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted", className)}>
      {n !== undefined && <span className="grid size-5 place-items-center rounded-full bg-brand-100 text-[11px] text-brand-700 dark:text-brand-400">{n}</span>}
      {children}
    </div>
  );
}

export const Checkbox = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: React.ReactNode; description?: React.ReactNode; indeterminate?: boolean }>(
  ({ className, label, description, indeterminate, ...props }, ref) => {
    const inner = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => inner.current!);
    React.useEffect(() => {
      if (inner.current) inner.current.indeterminate = !!indeterminate;
    }, [indeterminate]);
    const box = <input ref={inner} type="checkbox" className={cn("size-4 shrink-0 cursor-pointer rounded-[5px] border-border accent-[var(--brand-500)]", className)} {...props} />;
    if (!label) return box;
    return (
      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <span className="pt-0.5">{box}</span>
        <span>
          <span className="text-text">{label}</span>
          {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
        </span>
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";

export function Toggle({ checked, onChange, label, description, disabled, size = "md", id }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; description?: React.ReactNode; disabled?: boolean; size?: "sm" | "md"; id?: string }) {
  const sw = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150 disabled:opacity-50",
        size === "sm" ? "h-5 w-9" : "h-6 w-11",
        checked ? "bg-brand-500" : "bg-border",
      )}
    >
      <span className={cn("inline-block rounded-full bg-white shadow transition-transform duration-150", size === "sm" ? "size-4" : "size-5", checked ? (size === "sm" ? "translate-x-[18px]" : "translate-x-[22px]") : "translate-x-0.5")} />
    </button>
  );
  if (!label) return sw;
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="mt-0.5 text-xs leading-relaxed text-muted">{description}</div>}
      </div>
      {sw}
    </div>
  );
}

// ───────── Surfaces ─────────
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[14px] border border-border bg-surface shadow-soft", className)} {...props} />;
}
export function CardHeader({ title, subtitle, actions, className, icon }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand-100 text-brand-700 dark:text-brand-400 [&_svg]:size-[18px]">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight">{title}</h3>
          {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

// ───────── Pills ─────────
const toneClass = {
  neutral: "bg-surface-2 text-muted",
  brand: "bg-brand-100 text-brand-700 dark:text-brand-400",
  success: "bg-success-100 text-success",
  warning: "bg-warning-100 text-[#9a6a00] dark:text-warning",
  danger: "bg-danger-100 text-danger",
  info: "bg-info-100 text-info",
  accent: "bg-accent-100 text-[#9b5d0b] dark:text-accent-500",
} as const;
export type Tone = keyof typeof toneClass;

export function StatusPill({ tone = "neutral", children, dot, className }: { tone?: Tone; children: React.ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium", toneClass[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function SeverityBadge({ severity, label }: { severity: "BLOCKING" | "WARNING"; label?: string }) {
  return (
    <StatusPill tone={severity === "BLOCKING" ? "danger" : "warning"} className="h-5 px-2 text-[10.5px] font-semibold uppercase tracking-wide">
      {label ?? (severity === "BLOCKING" ? "Bloquante" : "Avertissement")}
    </StatusPill>
  );
}

// ───────── Avatar ─────────
const AVATAR_COLORS = ["#14808C", "#F2A541", "#1F9D6B", "#3B82F6", "#6D4AFF", "#D64545", "#0F4C55", "#C2410C"];
export function Avatar({ name, src, size = 32, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[h % AVATAR_COLORS.length];
  if (src) return <img src={src} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 88%, black)`, fontSize: Math.max(10, size * 0.38) }}
    >
      {initials}
    </span>
  );
}

// ───────── Segmented control ─────────
export function Segmented<T extends string>({ value, onChange, options, size = "md", className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; count?: number }[]; size?: "sm" | "md"; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-[10px] border border-border bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-[8px] font-medium transition-colors duration-150",
            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
            value === o.value ? "bg-surface text-text shadow-soft" : "text-muted hover:text-text",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={cn("rounded-full px-1.5 text-[11px] tabular", value === o.value ? "bg-brand-100 text-brand-700 dark:text-brand-400" : "bg-border/60")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ───────── Progress ring ─────────
export function ProgressRing({ value, size = 96, stroke = 9, label, sublabel, trackClass = "stroke-white/12", barColor = "var(--accent-500)", textClass = "text-white" }: { value: number; size?: number; stroke?: number; label?: React.ReactNode; sublabel?: React.ReactNode; trackClass?: string; barColor?: string; textClass?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(v)} %`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={trackClass} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke={barColor} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (v / 100) * c} style={{ transition: "stroke-dashoffset 600ms ease-out" }} />
      </svg>
      <div className={cn("absolute inset-0 grid place-items-center text-center", textClass)}>
        <div>
          <div className="font-display text-xl font-bold tabular leading-none">{label ?? `${Math.round(v)}%`}</div>
          {sublabel && <div className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] opacity-70">{sublabel}</div>}
        </div>
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">{children}</kbd>;
}
