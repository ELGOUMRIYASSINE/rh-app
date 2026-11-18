export type Role = "SUPER_ADMIN" | "RH" | "CHEF" | "SALARIE";

export const PERMISSION_GROUPS = [
  {
    key: "team",
    label: "ÉQUIPE",
    items: [
      { key: "team.add", label: "Ajouter des subordonnés" },
      { key: "team.edit", label: "Modifier les informations des subordonnés" },
      { key: "team.archive", label: "Supprimer/Archiver des subordonnés" },
    ],
  },
  {
    key: "planning",
    label: "PLANNING ET PRÉSENCES",
    items: [
      { key: "planning.manage", label: "Gérer le planning de l'équipe" },
      { key: "leaves.approve", label: "Approuver/Refuser les congés" },
      { key: "attendance.validate", label: "Valider les présences" },
    ],
  },
  {
    key: "documents",
    label: "DOCUMENTS",
    items: [
      { key: "documents.view", label: "Consulter les documents de l'équipe" },
      { key: "documents.sign", label: "Signer les documents" },
    ],
  },
  {
    key: "payroll",
    label: "PAIE",
    items: [
      { key: "rates.view", label: "Voir les taux de rémunération" },
      { key: "rates.edit", label: "Modifier les taux de rémunération" },
      { key: "payroll.validate", label: "Valider la paie" },
      { key: "advances.validate", label: "Valider les acomptes" },
      { key: "expenses.validate", label: "Valider les notes de frais" },
    ],
  },
  {
    key: "other",
    label: "AUTRES",
    items: [
      { key: "reports.view", label: "Consulter les rapports" },
      { key: "data.export", label: "Exporter les données de l'équipe" },
      { key: "audit.view", label: "Consulter les logs d'audit" },
      { key: "settings.manage", label: "Gérer les paramètres" },
      { key: "messaging.access", label: "Accéder à la messagerie" },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]["items"][number]["key"];
export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export type PermissionSet = Partial<Record<Permission, boolean>>;

export interface Actor {
  role: Role;
  /** Employee id linked to the membership (chef / salarié). */
  employeeId?: string | null;
  permissions?: PermissionSet | null;
  /** Ids of the lead's subordinates (resolved server-side). */
  subordinateIds?: string[];
}

export function normalizePermissions(input: unknown): PermissionSet {
  const out: PermissionSet = {};
  if (!input || typeof input !== "object") return out;
  for (const p of ALL_PERMISSIONS) if ((input as Record<string, unknown>)[p] === true) out[p] = true;
  return out;
}

/**
 * can(user, permission, targetEmployeeId?)
 * - RH and SUPER_ADMIN: everything in their organisation.
 * - CHEF: only granted permissions, and only on their subordinates when a target is given.
 * - SALARIE: nothing administrative.
 */
export function can(actor: Actor, permission: Permission, targetEmployeeId?: string | null): boolean {
  if (actor.role === "RH" || actor.role === "SUPER_ADMIN") return true;
  if (actor.role !== "CHEF") return false;
  if (!actor.permissions?.[permission]) return false;
  if (targetEmployeeId) return (actor.subordinateIds ?? []).includes(targetEmployeeId);
  return true;
}

export const FEATURE_KEYS = [
  "dashboard",
  "employees",
  "reports",
  "planning",
  "leaves",
  "attendance",
  "devices",
  "payroll",
  "audit",
  "settings",
  "advances",
  "expenses",
  "esignature",
  "messaging",
  "tablets",
  "structure",
  "availability",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const CORE_FEATURES: FeatureKey[] = ["dashboard", "employees", "reports", "planning", "leaves", "attendance", "devices", "payroll", "audit", "settings"];
export const PLAN_SEEDS: { name: string; features: FeatureKey[] }[] = [
  { name: "Essentiel", features: CORE_FEATURES },
  { name: "Pro", features: [...CORE_FEATURES, "advances", "expenses", "tablets", "messaging"] },
  { name: "Entreprise", features: [...FEATURE_KEYS] },
];
