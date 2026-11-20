import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Dark or white text for a background colour, whichever has the better WCAG contrast. */
export function readableText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#fff";
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const withWhite = 1.05 / (L + 0.05);
  const withDark = (L + 0.05) / 0.0279; // #0B2422 luminance ≈ 0.0229
  return withDark > withWhite ? "#0B2422" : "#FFFFFF";
}
