import "server-only";
import { z } from "zod";

export const IMPORT_COLUMNS = [
  { header: "Prénom", key: "firstName", required: true },
  { header: "Nom", key: "lastName", required: true },
  { header: "Email", key: "email", required: false },
  { header: "Téléphone", key: "phone" },
  { header: "Poste", key: "position" },
  { header: "Département", key: "service" },
  { header: "Type de contrat", key: "contractType" },
  { header: "Taux horaire", key: "hourlyRate" },
  { header: "Salaire net par heure", key: "netHourlyRate" },
  { header: "Date de naissance", key: "birthDate" },
  { header: "Date d'embauche", key: "hireDate" },
  { header: "N° Sécurité Sociale", key: "cnssNumber" },
  { header: "Matricule", key: "matricule" },
  { header: "Mot de passe (optionnel)", key: "password" },
] as const;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADER_MAP = new Map<string, string>(IMPORT_COLUMNS.map((c) => [norm(c.header), c.key]));
HEADER_MAP.set(norm("Mot de passe"), "password");
HEADER_MAP.set(norm("Service"), "service");
HEADER_MAP.set(norm("E-mail"), "email");

function parseDate(v: string): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return "invalid";
}
function parseNum(v: string): number | null | "invalid" {
  if (!v) return null;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}
const CONTRACTS: Record<string, "CDI" | "CDD" | "INTERIM" | "STAGE"> = { cdi: "CDI", cdd: "CDD", interim: "INTERIM", interimaire: "INTERIM", stage: "STAGE", stagiaire: "STAGE" };

export interface ImportRow {
  line: number;
  data: { firstName: string; lastName: string; email: string; phone: string | null; position: string | null; service: string | null; contractType: "CDI" | "CDD" | "INTERIM" | "STAGE" | null; hourlyRate: number | null; netHourlyRate: number | null; birthDate: string | null; hireDate: string | null; cnssNumber: string | null; matricule: string | null; password: string | null };
  errors: string[];
  duplicate: boolean;
}

export function validateRows(raw: Record<string, string>[], existingEmails: Set<string>, opts: { emailRequired: boolean } = { emailRequired: true }): ImportRow[] {
  const seen = new Set<string>();
  return raw.map((r, i) => {
    const o: Record<string, string> = {};
    for (const [h, v] of Object.entries(r)) {
      const k = HEADER_MAP.get(norm(h));
      if (k) o[k] = String(v ?? "").trim();
    }
    const errors: string[] = [];
    if (!o.firstName) errors.push("Prénom manquant");
    if (!o.lastName) errors.push("Nom manquant");
    const email = (o.email ?? "").toLowerCase();
    if (!email) { if (opts.emailRequired) errors.push("Email manquant"); }
    else if (!z.string().email().safeParse(email).success) errors.push("Email invalide");
    const birth = parseDate(o.birthDate ?? "");
    const hire = parseDate(o.hireDate ?? "");
    if (birth === "invalid") errors.push("Date de naissance invalide (JJ/MM/AAAA)");
    if (hire === "invalid") errors.push("Date d'embauche invalide (JJ/MM/AAAA)");
    const hr = parseNum(o.hourlyRate ?? "");
    const nhr = parseNum(o.netHourlyRate ?? "");
    if (hr === "invalid") errors.push("Taux horaire invalide");
    if (nhr === "invalid") errors.push("Salaire net par heure invalide");
    const ct = o.contractType ? CONTRACTS[norm(o.contractType)] : null;
    if (o.contractType && !ct) errors.push("Type de contrat inconnu (CDI, CDD, Intérim, Stage)");
    if (o.password && o.password.length < 10) errors.push("Mot de passe trop court (10 caractères)");
    const duplicate = !!email && (existingEmails.has(email) || seen.has(email));
    if (email) seen.add(email);
    return {
      line: i + 2,
      errors,
      duplicate,
      data: {
        firstName: o.firstName ?? "", lastName: o.lastName ?? "", email, phone: o.phone || null, position: o.position || null, service: o.service || null,
        contractType: ct ?? null, hourlyRate: hr === "invalid" ? null : hr, netHourlyRate: nhr === "invalid" ? null : nhr,
        birthDate: birth === "invalid" ? null : birth, hireDate: hire === "invalid" ? null : hire, cnssNumber: o.cnssNumber || null, matricule: o.matricule || null, password: o.password || null,
      },
    };
  });
}
