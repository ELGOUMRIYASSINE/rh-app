"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell, Building2, Check, ChevronsLeft, ChevronsRight, LogOut, Menu as MenuIcon, MessageSquare, Moon, Search, Sun, User, Lock, X, ChevronDown,
} from "lucide-react";
import { Avatar, cn, Kbd, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tooltip, YGHRLogo, Popover, PopoverContent, PopoverTrigger } from "@yghr/ui";
import type { FeatureKey, PermissionSet } from "@yghr/core";
import { api } from "@/lib/api";
import { NAV_ICONS } from "./icons";
import type { NavGroup } from "./nav";
import { RealtimeProvider, useRealtime, useRealtimeEvent } from "./realtime";
import { CommandPalette } from "./command-palette";
import { ThemeToggle, useTheme } from "@/components/theme-toggle";
import { toast } from "sonner";

export interface ShellProps {
  base: string; // "/clinique-demo/rh"
  space: "rh" | "chef" | "salarie";
  nav: NavGroup[];
  features: FeatureKey[];
  permissions: PermissionSet;
  role: string;
  user: { firstName: string; lastName: string; email: string; avatarUrl: string | null };
  org: { id: string; name: string; slug: string; planName: string; logo: string | null; status?: string; trialEndsAt?: string | null };
  orgs: { id: string; name: string; slug: string }[];
  children: React.ReactNode;
}

const ROLE_LABEL: Record<string, string> = { RH: "Responsable RH", CHEF: "Chef d'équipe", SALARIE: "Salarié", SUPER_ADMIN: "Admin YGHR" };

export function AppShell(props: ShellProps) {
  return (
    <RealtimeProvider>
      <ShellInner {...props} />
    </RealtimeProvider>
  );
}

function ShellInner({ base, space, nav, features, permissions, role, user, org, orgs, children }: ShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("yghr-sidebar") === "1");
    } catch {}
  }, []);
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("yghr-sidebar", c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  const isChef = space === "chef";
  const visibleNav = useMemo(
    () =>
      nav
        .map((g) => ({
          ...g,
          items: g.items
            .filter((i) => !isChef || !i.permission || permissions[i.permission])
            .map((i) => ({ ...i, locked: !!i.feature && !features.includes(i.feature) })),
        }))
        .filter((g) => g.items.length),
    [nav, features, permissions, isChef],
  );

  const current = useMemo(() => {
    const all = visibleNav.flatMap((g) => g.items);
    const rel = pathname.slice(base.length);
    return [...all].sort((a, b) => b.href.length - a.href.length).find((i) => (i.href === "" ? rel === "" || rel === "/" : rel.startsWith(i.href)));
  }, [pathname, base, visibleNav]);

  const sidebar = (mobile: boolean) => {
    const mini = collapsed && !mobile;
    return (
      <div className={cn("flex h-full flex-col border-r border-border bg-surface text-muted", mini ? "w-[72px]" : "w-[260px]")}>
        <div className={cn("flex h-16 shrink-0 items-center", mini ? "justify-center" : "justify-between px-5")}>
          <Link href={base} aria-label="Accueil" className="flex min-w-0 items-center">
            <YGHRLogo variant={mini ? "mark" : "full"} size={mini ? 28 : 38} />
          </Link>
          {mobile && (
            <button onClick={() => setDrawer(false)} className="grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-surface-2" aria-label="Fermer le menu">
              <X className="size-4" />
            </button>
          )}
        </div>
        <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-3" aria-label="Navigation principale">
          {visibleNav.map((g) => (
            <div key={g.label}>
              {!mini && <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted/80">{g.label}</div>}
              {mini && <div className="mx-3 mb-2 h-px bg-border" />}
              <ul className="space-y-0.5">
                {g.items.map((i) => {
                  const Icon = NAV_ICONS[i.icon];
                  const active = current?.href === i.href;
                  const link = (
                    <Link
                      href={`${base}${i.href}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-10 items-center gap-3 rounded-[10px] text-[13.5px] font-medium transition-colors duration-150",
                        mini ? "justify-center" : "px-3",
                        active ? "bg-brand-100/70 text-text dark:bg-brand-100" : "hover:bg-surface-2 hover:text-text",
                        i.locked && "text-muted/60",
                      )}
                    >
                      {active && <span className="absolute left-0 top-2 h-6 w-[3px] rounded-r-full bg-brand-500" />}
                      <Icon className={cn("size-[18px] shrink-0", active ? "text-brand-500" : "")} strokeWidth={1.75} />
                      {!mini && <span className="truncate">{i.label}</span>}
                      {!mini && i.locked && <Lock className="ml-auto size-3.5 text-muted/60" />}
                    </Link>
                  );
                  return (
                    <li key={i.href}>
                      {mini || i.locked ? (
                        <Tooltip side="right" content={i.locked ? `${i.label} : non inclus dans votre pack` : i.label}>
                          {link}
                        </Tooltip>
                      ) : (
                        link
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className={cn("flex items-center gap-3 rounded-[12px] p-2", mini && "justify-center")}>
            <Avatar name={`${user.firstName} ${user.lastName}`} src={user.avatarUrl} size={34} />
            {!mini && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-text">{user.firstName} {user.lastName}</div>
                <div className="truncate text-xs text-muted">{ROLE_LABEL[role] ?? role}</div>
              </div>
            )}
            {!mini && (
              <Tooltip content="Se déconnecter">
                <button onClick={logout} className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text" aria-label="Se déconnecter">
                  <LogOut className="size-4" />
                </button>
              </Tooltip>
            )}
          </div>
          {!mobile && (
            <button onClick={toggleCollapsed} className={cn("mt-1 flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-3 text-xs text-muted hover:bg-surface-2 hover:text-text", mini && "justify-center px-0")} aria-label={mini ? "Déplier le menu" : "Replier le menu"}>
              {mini ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Replier</>}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">Aller au contenu</a>
      <aside className="no-print sticky top-0 hidden h-dvh shrink-0 lg:block">{sidebar(false)}</aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-brand-900/30 backdrop-blur-[2px] animate-fade-in" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 animate-slide-in-right shadow-pop">{sidebar(true)}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {role === "SUPER_ADMIN" && (
          <div className="no-print flex flex-wrap items-center gap-3 bg-accent-500 px-4 py-2 text-sm font-medium text-brand-900 sm:px-6">
            <span className="flex-1">Mode support : vous êtes dans l&apos;espace de <b>{org.name}</b> en tant qu&apos;Admin YGHR. Vos actions sont inscrites dans son journal.</span>
            <button onClick={async () => { const r = await api<{ redirect: string }>("/api/admin/leave", { body: {} }); window.location.href = r.redirect; }} className="cursor-pointer rounded-lg bg-brand-900 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-800">Revenir à la console</button>
          </div>
        )}
        {role !== "SUPER_ADMIN" && org.status === "TRIAL" && org.trialEndsAt && (
          <div className="no-print bg-info-100 px-4 py-2 text-center text-[13px] text-info sm:px-6">Version d&apos;essai : votre accès est ouvert jusqu&apos;au <b>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Casablanca" }).format(new Date(org.trialEndsAt))}</b>. Une question ? Menu « Support YGHR ».</div>
        )}
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur-md sm:px-6">
          <button className="grid size-9 cursor-pointer place-items-center rounded-lg hover:bg-surface-2 lg:hidden" onClick={() => setDrawer(true)} aria-label="Ouvrir le menu">
            <MenuIcon className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[15px] font-semibold">{current?.label ?? "YGHR"}</div>
            <div className="truncate text-xs text-muted">{org.name}</div>
          </div>
          <button onClick={() => setPalette(true)} className="hidden h-9 w-64 cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-sm text-muted transition hover:border-brand-500/50 md:flex">
            <Search className="size-4" />
            <span className="flex-1 text-left">Rechercher…</span>
            <Kbd>Ctrl K</Kbd>
          </button>
          <button onClick={() => setPalette(true)} className="grid size-9 cursor-pointer place-items-center rounded-lg hover:bg-surface-2 md:hidden" aria-label="Rechercher">
            <Search className="size-[18px]" />
          </button>
          <ConnectionPill />
          {features.includes("messaging") && space !== "salarie" && <MessagesButton href={`${base}/messages`} />}
          <NotificationBell />
          <ThemeToggle theme={theme} />
          <Menu>
            <MenuTrigger asChild>
              <button className="flex cursor-pointer items-center gap-1.5 rounded-full p-0.5 hover:bg-surface-2" aria-label="Menu utilisateur">
                <Avatar name={`${user.firstName} ${user.lastName}`} src={user.avatarUrl} size={32} />
                <ChevronDown className="hidden size-3.5 text-muted sm:block" />
              </button>
            </MenuTrigger>
            <MenuContent className="w-64">
              <div className="px-2.5 py-2">
                <div className="text-sm font-semibold">{user.firstName} {user.lastName}</div>
                <div className="truncate text-xs text-muted">{user.email}</div>
              </div>
              <MenuSeparator />
              <MenuItem icon={<User />} onSelect={() => (window.location.href = `${base}/profil`)}>Mon profil</MenuItem>
              <MenuItem icon={theme.dark ? <Sun /> : <Moon />} onSelect={theme.toggle}>{theme.dark ? "Mode clair" : "Mode sombre"}</MenuItem>
              {orgs.length > 1 && (
                <>
                  <MenuSeparator />
                  <MenuLabel>Organisations</MenuLabel>
                  {orgs.map((o) => (
                    <MenuItem key={o.id} icon={o.id === org.id ? <Check /> : <Building2 />} onSelect={() => switchOrg(o.id)}>{o.name}</MenuItem>
                  ))}
                </>
              )}
              <MenuSeparator />
              <MenuItem icon={<LogOut />} danger onSelect={logout}>Se déconnecter</MenuItem>
            </MenuContent>
          </Menu>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} base={base} nav={visibleNav} space={space} />
    </div>
  );
}

async function logout() {
  const r = await fetch("/api/auth/logout", { method: "POST" });
  const d = await r.json().catch(() => ({ redirect: "/login" }));
  window.location.href = d.redirect ?? "/login";
}
async function switchOrg(organizationId: string) {
  const d = await api<{ redirect: string }>("/api/auth/switch-org", { body: { organizationId } });
  window.location.href = d.redirect;
}

function ConnectionPill() {
  const { connected } = useRealtime();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  const ok = connected && online;
  return (
    <Tooltip content={ok ? "Connexion temps réel active : les présences s'actualisent automatiquement." : online ? "Temps réel indisponible : actualisation périodique." : "Vous êtes hors ligne."}>
      <span className={cn("hidden h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium sm:inline-flex", ok ? "bg-success-100 text-success" : "bg-surface-2 text-muted")} role="status">
        <span className={cn("size-1.5 rounded-full", ok ? "animate-pulse-dot bg-success text-success" : "bg-muted")} />
        {ok ? "En ligne" : "Hors ligne"}
      </span>
    </Tooltip>
  );
}

function MessagesButton({ href }: { href: string }) {
  const { data } = useQuery({ queryKey: ["messages-unread"], queryFn: () => api<{ count: number }>("/api/messages/unread", { silent: true }), refetchInterval: 60_000 });
  const qc = useQueryClient();
  useRealtimeEvent("message:new", () => qc.invalidateQueries({ queryKey: ["messages-unread"] }));
  return (
    <Tooltip content="Messagerie">
      <Link href={href} className="relative grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text" aria-label="Messagerie">
        <MessageSquare className="size-[18px]" />
        {!!data?.count && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-brand-900">{data.count}</span>}
      </Link>
    </Tooltip>
  );
}

interface Notif { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }

function NotificationBell() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ items: Notif[]; unread: number }>("/api/notifications", { silent: true }), refetchInterval: 60_000 });
  useRealtimeEvent<{ title: string; body: string }>("notification:new", (n) => {
    toast(n.title, { description: n.body });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  });
  const unread = data?.unread ?? 0;
  async function open(n: Notif) {
    if (!n.readAt) await api(`/api/notifications/${n.id}/read`, { method: "PATCH", silent: true }).catch(() => {});
    void qc.invalidateQueries({ queryKey: ["notifications"] });
    if (n.link) router.push(n.link);
  }
  async function readAll() {
    await api("/api/notifications", { method: "PATCH", silent: true }).catch(() => {});
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative grid size-9 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text" aria-label={`Notifications${unread ? ` (${unread} non lues)` : ""}`}>
          <Bell className="size-[18px]" />
          {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold">Notifications</div>
          {unread > 0 && <button onClick={readAll} className="cursor-pointer text-xs font-medium text-brand-500 hover:underline">Tout marquer comme lu</button>}
        </div>
        <ul className="scrollbar-thin max-h-[380px] overflow-y-auto">
          {(data?.items ?? []).length === 0 && <li className="px-4 py-10 text-center text-sm text-muted">Aucune notification pour le moment.</li>}
          {(data?.items ?? []).map((n) => (
            <li key={n.id}>
              <button onClick={() => open(n)} className="flex w-full cursor-pointer gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-surface-2">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand-500")} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{n.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{n.body}</span>
                  <span className="mt-1 block text-[11px] text-muted/80">{new Date(n.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
