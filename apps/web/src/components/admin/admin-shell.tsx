"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, Building2, LayoutDashboard, LifeBuoy, LogOut, Menu as MenuIcon, ShieldAlert, X } from "lucide-react";
import { Avatar, cn, YGHRLogo } from "@yghr/ui";
import { logout } from "@/components/auth/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/admin", label: "Vue d'ensemble", icon: LayoutDashboard, exact: true },
  { href: "/admin/cliniques", label: "Cliniques", icon: Building2 },
  { href: "/admin/support", label: "Support", icon: LifeBuoy, badge: "tickets" as const },
  { href: "/admin/incidents", label: "Incidents", icon: ShieldAlert, badge: "errors" as const },
  { href: "/admin/activite", label: "Activité", icon: Activity },
];

export function AdminShell({ admin, counts, children }: { admin: { firstName: string; lastName: string; email: string }; counts: { tickets: number; errors: number }; children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const sidebar = (
    <div className="flex h-full w-[248px] flex-col border-r border-border bg-surface text-muted">
      <div className="flex h-16 items-center justify-between px-5">
        <Link href="/admin" className="flex items-center gap-2"><YGHRLogo size={30} /><span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-400">Console</span></Link>
        <button onClick={() => setDrawer(false)} className="grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-surface-2 lg:hidden" aria-label="Fermer le menu"><X className="size-4" /></button>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-3" aria-label="Navigation console">
        {NAV.map((n) => {
          const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
          const count = n.badge ? counts[n.badge] : 0;
          return (
            <Link key={n.href} href={n.href} onClick={() => setDrawer(false)} aria-current={active ? "page" : undefined}
              className={cn("relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-medium transition-colors", active ? "bg-brand-100/70 text-text dark:bg-brand-100" : "hover:bg-surface-2 hover:text-text")}>
              {active && <span className="absolute left-0 top-2 h-6 w-[3px] rounded-r-full bg-brand-500" />}
              <n.icon className={cn("size-[18px]", active && "text-brand-500")} strokeWidth={1.75} />
              <span className="flex-1">{n.label}</span>
              {count > 0 && <span className={cn("min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5", n.badge === "errors" ? "bg-danger text-white" : "bg-accent-500 text-brand-900")}>{count > 99 ? "99+" : count}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-[12px] p-2">
          <Avatar name={`${admin.firstName} ${admin.lastName}`} size={34} />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-text">{admin.firstName} {admin.lastName}</div><div className="truncate text-xs text-muted">Équipe YGHR</div></div>
          <ThemeToggle className="size-8" />
          <button onClick={logout} className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text" aria-label="Se déconnecter"><LogOut className="size-4" /></button>
        </div>
      </div>
    </div>
  );
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh shrink-0 lg:block">{sidebar}</aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-brand-900/30 backdrop-blur-[2px]" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 shadow-pop">{sidebar}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur-md lg:hidden">
          <button className="grid size-9 cursor-pointer place-items-center rounded-lg hover:bg-surface-2" onClick={() => setDrawer(true)} aria-label="Ouvrir le menu"><MenuIcon className="size-5" /></button>
          <span className="font-display font-semibold">Console YGHR</span>
          <ThemeToggle className="ml-auto" />
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
