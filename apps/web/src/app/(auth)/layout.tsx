import { YGHRLogo } from "@yghr/ui";
import { CalendarClock, Fingerprint, ShieldCheck, Wallet } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 size-[520px] rounded-full bg-brand-500/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-20 size-[420px] rounded-full bg-accent-500/15 blur-3xl" />
        <YGHRLogo onDark size={36} />
        <div className="relative mt-auto max-w-lg">
          <p className="font-display text-[34px] font-bold leading-[1.15] text-balance">Vos équipes, leur temps, leur paie — en un seul endroit.</p>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">Planning des gardes, pointeuses biométriques, congés et paie marocaine (CNSS, AMO, IR) pour les cliniques, hôpitaux et PME.</p>
          <ul className="mt-10 grid grid-cols-2 gap-4 text-sm text-white/85">
            {[
              [CalendarClock, "Planning qui vérifie le droit du travail"],
              [Fingerprint, "Présences en temps réel"],
              [Wallet, "Paie CNSS · AMO · IR"],
              [ShieldCheck, "Traçabilité complète"],
            ].map(([Icon, t], i) => {
              const I = Icon as typeof CalendarClock;
              return (
                <li key={i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3">
                  <I className="size-[18px] shrink-0 text-accent-500" strokeWidth={1.75} />
                  {t as string}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-white/40">© {new Date().getFullYear()} YGHR · Conçu au Maroc</p>
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
