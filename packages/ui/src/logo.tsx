import { cn } from "./cn";

const SRC = {
  full: ["/brand/logo.png", "/brand/logo-dark.png", 4.442],
  mark: ["/brand/mark.png", "/brand/mark-dark.png", 1.699],
  stacked: ["/brand/logo-stacked.png", "/brand/logo-stacked-dark.png", 1.506],
} as const;

/**
 * IT Global logo: the same on every screen, whatever the clinic.
 * `size` is the height in pixels. Switches to the light version in dark mode (or when `onDark`).
 */
export function YGHRLogo({ variant = "full", className, size = 32, onDark = false }: { variant?: "mark" | "full" | "stacked" | "mono"; className?: string; size?: number; onDark?: boolean }) {
  const [light, dark, ratio] = SRC[variant === "mono" ? "mark" : variant];
  const h = variant === "full" ? Math.round(size * 1.05) : size;
  const w = Math.round(h * ratio);
  const img = (src: string, cls?: string) => <img src={src} alt="IT Global" width={w} height={h} className={cn("shrink-0 select-none object-contain", cls)} style={{ width: w, height: h }} draggable={false} />;
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      {onDark ? img(dark) : <>{img(light, "dark:hidden")}{img(dark, "hidden dark:block")}</>}
    </span>
  );
}
export const BrandLogo = YGHRLogo;
