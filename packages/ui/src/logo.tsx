import { cn } from "./cn";

/**
 * YGHR mark: a rounded square holding a clock whose hands double as a person —
 * the hour hand is the body, the dot at noon is the head.
 */
export function YGHRLogo({ variant = "full", className, size = 32, onDark = false }: { variant?: "mark" | "full" | "mono"; className?: string; size?: number; onDark?: boolean }) {
  const mono = variant === "mono";
  const mark = (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden className="shrink-0">
      <rect width="40" height="40" rx="11" fill={mono ? "currentColor" : "#14808C"} />
      {!mono && <rect width="40" height="40" rx="11" fill="url(#yghr-g)" />}
      <circle cx="20" cy="21" r="11.5" stroke={mono ? "var(--bg, #fff)" : "#fff"} strokeOpacity={mono ? 1 : 0.35} strokeWidth="2" />
      <circle cx="20" cy="12.6" r="2.6" fill={mono ? "var(--bg, #fff)" : "#F2A541"} />
      <path d="M20 16.5v6.2l5.4 3.4" stroke={mono ? "var(--bg, #fff)" : "#fff"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.6 27.4c1.4-1.6 3.3-2.5 5.4-2.5" stroke={mono ? "var(--bg, #fff)" : "#fff"} strokeOpacity={mono ? 0.8 : 0.55} strokeWidth="2" strokeLinecap="round" />
      <defs>
        <linearGradient id="yghr-g" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1A99A6" />
          <stop offset="1" stopColor="#0F4C55" />
        </linearGradient>
      </defs>
    </svg>
  );
  if (variant === "mark") return <span className={className}>{mark}</span>;
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {mark}
      <span className={cn("font-display text-[19px] font-bold tracking-[0.04em]", onDark ? "text-white" : "text-text")} style={{ fontSize: size * 0.6 }}>
        YG<span className={mono ? "" : "text-accent-500"}>HR</span>
      </span>
    </span>
  );
}
