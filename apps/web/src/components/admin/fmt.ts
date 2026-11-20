/** Deterministic date formatting (same on server and browser: fixed time zone, no "x minutes ago"). */
const TZ = "Africa/Casablanca";
const dtf = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const df = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
export const dateTime = (iso: string | null | undefined) => (iso ? dtf.format(new Date(iso)).replace(",", " ·") : "Jamais");
export const dateOnly = (iso: string | null | undefined) => (iso ? df.format(new Date(iso)) : "");
export const daysUntil = (iso: string | null | undefined) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000) : null);

export const STATUS: Record<string, [string, "success" | "info" | "danger"]> = { ACTIVE: ["Client actif", "success"], TRIAL: ["Essai / démo", "info"], SUSPENDED: ["Suspendue", "danger"] };
export const T_STATUS: Record<string, [string, "warning" | "brand" | "info" | "success"]> = { OPEN: ["Nouveau", "warning"], IN_PROGRESS: ["En cours", "brand"], WAITING_CLINIC: ["Attente clinique", "info"], RESOLVED: ["Résolu", "success"] };
export const T_PRIORITY: Record<string, [string, "neutral" | "info" | "warning" | "danger"]> = { LOW: ["Basse", "neutral"], NORMAL: ["Normale", "info"], HIGH: ["Haute", "warning"], URGENT: ["Urgente", "danger"] };
export const T_CATEGORY: Record<string, string> = { question: "Question", bug: "Problème / bug", payroll: "Paie", devices: "Pointeuses", account: "Comptes et accès", billing: "Abonnement", other: "Autre" };
export const PLANS = ["Essentiel", "Pro", "Entreprise"];
