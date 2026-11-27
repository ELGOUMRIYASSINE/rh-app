"use client";
import * as React from "react";
import { Dialog as D, DropdownMenu as DM, Tooltip as T, Tabs as TB, Popover as P } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "./cn";

// ───────── Modal ─────────
export function Modal({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  icon,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  icon?: React.ReactNode;
}) {
  const w = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-brand-900/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <D.Content
          className={cn("fixed left-1/2 top-1/2 z-50 flex max-h-[min(92vh,900px)] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[16px] border border-border bg-surface shadow-pop outline-none data-[state=open]:animate-pop", w)}
          onOpenAutoFocus={(e) => {
            // focus the first field instead of the close button
            const el = (e.currentTarget as HTMLElement).querySelector<HTMLElement>("input:not([type=hidden]),select,textarea");
            if (el) {
              e.preventDefault();
              el.focus();
            }
          }}
        >
          <div className="flex items-start gap-3 border-b border-border px-6 pt-5 pb-4">
            {icon && <div className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-brand-100 text-brand-700 dark:text-brand-400 [&_svg]:size-5">{icon}</div>}
            <div className="min-w-0 flex-1">
              <D.Title className="font-display text-[17px] font-semibold">{title}</D.Title>
              {subtitle ? <D.Description className="mt-1 text-[13px] leading-relaxed text-muted">{subtitle}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : ""}</D.Description>}
            </div>
            <D.Close className="-mr-2 -mt-1 grid size-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text" aria-label="Fermer">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-2/50 px-6 py-3.5 rounded-b-[16px]">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// ───────── SideSheet (right drawer) ─────────
export function SideSheet({ open, onOpenChange, title, subtitle, children, footer, width = 520 }: { open: boolean; onOpenChange: (o: boolean) => void; title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-brand-900/30 data-[state=open]:animate-fade-in" />
        <D.Content className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-border bg-surface shadow-pop outline-none data-[state=open]:animate-slide-in-right" style={{ maxWidth: width }}>
          <div className="flex items-start gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <D.Title className="font-display text-[17px] font-semibold">{title}</D.Title>
              {subtitle ? <D.Description className="mt-0.5 text-[13px] text-muted">{subtitle}</D.Description> : <D.Description className="sr-only">panneau</D.Description>}
            </div>
            <D.Close className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label="Fermer">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="border-t border-border px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// ───────── Dropdown menu ─────────
export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export function MenuContent({ children, align = "end", className }: { children: React.ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} className={cn("z-50 min-w-[200px] rounded-[12px] border border-border bg-surface p-1 shadow-pop data-[state=open]:animate-pop", className)}>
        {children}
      </DM.Content>
    </DM.Portal>
  );
}
export function MenuItem({ children, onSelect, danger, icon, disabled }: { children: React.ReactNode; onSelect?: () => void; danger?: boolean; icon?: React.ReactNode; disabled?: boolean }) {
  return (
    <DM.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn("flex cursor-pointer select-none items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:stroke-[1.75]", danger ? "text-danger data-[highlighted]:bg-danger-100" : "text-text")}
    >
      {icon && <span className={cn(danger ? "" : "text-muted")}>{icon}</span>}
      {children}
    </DM.Item>
  );
}
export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-border" />;
}
export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <DM.Label className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{children}</DM.Label>;
}

// ───────── Tooltip ─────────
export const TooltipProvider = T.Provider;
export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  if (!content) return <>{children}</>;
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-[60] max-w-xs rounded-[8px] bg-brand-900 px-2.5 py-1.5 text-xs leading-relaxed text-white shadow-pop data-[state=delayed-open]:animate-fade-in">
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

// ───────── Popover ─────────
export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export function PopoverContent({ children, className, align = "start" }: { children: React.ReactNode; className?: string; align?: "start" | "center" | "end" }) {
  return (
    <P.Portal>
      <P.Content align={align} sideOffset={6} className={cn("z-50 rounded-[12px] border border-border bg-surface p-3 shadow-pop outline-none data-[state=open]:animate-pop", className)}>
        {children}
      </P.Content>
    </P.Portal>
  );
}

// ───────── Tabs (underline style) ─────────
export function Tabs({ value, onValueChange, tabs, children, className }: { value: string; onValueChange: (v: string) => void; tabs: { value: string; label: React.ReactNode; icon?: React.ReactNode; count?: number }[]; children?: React.ReactNode; className?: string }) {
  return (
    <TB.Root value={value} onValueChange={onValueChange} className={className}>
      <TB.List className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <TB.Trigger
            key={t.value}
            value={t.value}
            className="relative -mb-px inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-muted transition-colors hover:text-text data-[state=active]:border-brand-500 data-[state=active]:text-text [&_svg]:size-4 [&_svg]:stroke-[1.75]"
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && <span className="rounded-full bg-surface-2 px-1.5 text-[11px] tabular text-muted">{t.count}</span>}
          </TB.Trigger>
        ))}
      </TB.List>
      {children}
    </TB.Root>
  );
}
export const TabPanel = TB.Content;
