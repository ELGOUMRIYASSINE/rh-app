import { YGHRLogo } from "@yghr/ui";
import { CalendarClock, Fingerprint, ShieldCheck, Wallet } from "lucide-react";

const FEATURES = [
  [CalendarClock, "Planning des gardes", "Vérifie le repos, les nuits et les heures légales."],
  [Fingerprint, "Présences en temps réel", "Pointeuses biométriques et tablettes."],
  [Wallet, "Paie marocaine", "CNSS, AMO, IR et bulletins en un clic."],
  [ShieldCheck, "Traçabilité complète", "Chaque action est journalisée."],
] as const;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-bg p-12 lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_0%_0%,color-mix(in_srgb,var(--brand-500)_12%,transparent),transparent_70%),radial-gradient(50%_50%_at_100%_100%,color-mix(in_srgb,var(--accent-500)_10%,transparent),transparent_70%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
        <YGHRLogo size={36} className="relative" />
        <div className="relative mt-auto max-w-lg">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted shadow-soft">
            <span className="size-1.5 rounded-full bg-brand-500" /> Pour les cliniques, hôpitaux et PME au Maroc
          </span>
          <p className="mt-5 font-display text-[40px] font-semibold leading-[1.08] tracking-[-0.035em] text-balance">
            Vos équipes, leur temps et leur paie, <span className="text-brand-500">au même endroit.</span>
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">Moins de tableaux Excel, plus de temps pour les patients. YGHR réunit planning, présences, congés et paie dans un outil clair pour la direction comme pour les équipes.</p>
          <ul className="mt-10 grid grid-cols-2 gap-3">
            {FEATURES.map(([Icon, title, text]) => (
              <li key={title} className="rounded-[16px] border border-border bg-surface p-4 shadow-soft">
                <span className="grid size-8 place-items-center rounded-full bg-brand-100 text-brand-500"><Icon className="size-4" strokeWidth={1.75} /></span>
                <div className="mt-3 text-sm font-semibold">{title}</div>
                <div className="mt-0.5 text-[13px] leading-snug text-muted">{text}</div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-muted">© {new Date().getFullYear()} YGHR · Conçu au Maroc</p>
      </aside>
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[400px] animate-fade-in">
          <div className="mb-10 lg:hidden"><YGHRLogo size={34} /></div>
          {children}
        </div>
      </main>
    </div>
  );
}
