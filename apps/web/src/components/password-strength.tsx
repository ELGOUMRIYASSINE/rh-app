"use client";
import { cn } from "@yghr/ui";

export function passwordScore(pw: string): number {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}
const LABELS = ["Très faible", "Faible", "Moyen", "Bon", "Excellent"];
const COLORS = ["bg-danger", "bg-danger", "bg-warning", "bg-success", "bg-success"];

export function PasswordStrength({ value }: { value: string }) {
  const score = passwordScore(value);
  if (!value) return null;
  return (
    <div aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", i < score ? COLORS[score] : "bg-surface-2")} />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">Robustesse : <span className="font-medium text-text">{LABELS[score]}</span></p>
    </div>
  );
}
