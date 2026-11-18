const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** 12316.33 → "12 316,33 DH" */
export function dh(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${decimals === 0 ? nf0.format(n) : nf2.format(n)} DH`;
}
export function num(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return "—";
  return decimals === 1 ? nf1.format(n) : decimals === 2 ? nf2.format(n) : nf0.format(n);
}
/** minutes → "7h30" */
export function hm(minutes: number | null | undefined): string {
  if (!minutes) return "0h00";
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}h${String(Math.abs(m % 60)).padStart(2, "0")}`;
}
/** minutes → "7,5 h" */
export function hours(minutes: number | null | undefined): string {
  if (!minutes) return "0 h";
  return `${nf1.format(minutes / 60)} h`;
}
export function fullName(e: { firstName: string; lastName: string }) {
  return `${e.firstName} ${e.lastName}`;
}
export function plural(n: number, one: string, many?: string) {
  return `${n} ${n > 1 ? (many ?? `${one}s`) : one}`;
}
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
/** "2026-11-16" → "16/11/2026" */
export function frDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(`${d.slice(0, 10)}T00:00:00Z`) : d;
  return dateFmt.format(date);
}
export function frDateTime(d: Date | string, timeZone: string): { date: string; time: string } {
  const date = typeof d === "string" ? new Date(d) : d;
  return {
    date: new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone }).format(date),
    time: new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone }).format(date),
  };
}
export function timeIn(d: Date | string | null | undefined, timeZone: string): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(typeof d === "string" ? new Date(d) : d);
}
const shortDay = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
/** "Lun. 16 nov." */
export function dayLabel(d: string): string {
  const s = shortDay.format(new Date(`${d}T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
