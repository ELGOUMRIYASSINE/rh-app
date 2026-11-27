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
  "employee_accounts",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const CORE_FEATURES: FeatureKey[] = ["dashboard", "employees", "reports", "planning", "leaves", "attendance", "devices", "payroll", "audit", "settings", "employee_accounts"];

/** What each feature is, for the platform console switches. */
export const FEATURE_INFO: Record<FeatureKey, { label: string; description: string; group: "Pilotage" | "Équipes" | "Matériel" | "Finance" | "Collaboration" | "Espace salarié" }> = {
  dashboard: { label: "Tableau de bord", description: "Vue d'ensemble du jour : présents, retards, absences.", group: "Pilotage" },
  reports: { label: "Rapports", description: "Rapports d'heures, d'absences et exports.", group: "Pilotage" },
  audit: { label: "Journal d'audit", description: "Historique de toutes les actions.", group: "Pilotage" },
  settings: { label: "Paramètres", description: "Règles, horaires, catégories, identité de l'établissement.", group: "Pilotage" },
  employees: { label: "Salariés", description: "Fiches salariés, import Excel, chefs d'équipe.", group: "Équipes" },
  planning: { label: "Planning", description: "Planning des gardes avec contrôle des règles.", group: "Équipes" },
  leaves: { label: "Congés", description: "Soldes et demandes de congés.", group: "Équipes" },
  attendance: { label: "Présences", description: "Présences, corrections et validation des journées.", group: "Équipes" },
  availability: { label: "Disponibilités", description: "Les salariés indiquent leurs indisponibilités.", group: "Équipes" },
  structure: { label: "Structure (centres)", description: "Plusieurs sites, salariés rattachés à un centre.", group: "Équipes" },
  devices: { label: "Pointeuses", description: "Pointeuses biométriques ZKTeco (LAN ou ADMS).", group: "Matériel" },
  tablets: { label: "Tablettes de pointage", description: "Pointage par code sur une tablette (borne).", group: "Matériel" },
  payroll: { label: "Paie", description: "Bulletins, CNSS, AMO, IR.", group: "Finance" },
  advances: { label: "Acomptes", description: "Demandes d'acompte sur salaire.", group: "Finance" },
  expenses: { label: "Notes de frais", description: "Notes de frais et remboursements.", group: "Finance" },
  esignature: { label: "Signature électronique", description: "Envoi de documents à signer.", group: "Collaboration" },
  messaging: { label: "Messagerie", description: "Messagerie interne entre équipes.", group: "Collaboration" },
  employee_accounts: { label: "Comptes salariés", description: "Chaque salarié reçoit un accès à son espace (planning, congés, documents). Désactivé : les salariés n'ont pas de compte et ne reçoivent aucune invitation.", group: "Espace salarié" },
};

/** Plan features, adjusted by the switches set in the platform console. */
export function effectiveFeatures(planFeatures: readonly string[], overrides: unknown): FeatureKey[] {
  const set = new Set(planFeatures.filter((f): f is FeatureKey => (FEATURE_KEYS as readonly string[]).includes(f)));
  if (overrides && typeof overrides === "object") {
    for (const [k, v] of Object.entries(overrides as Record<string, unknown>)) {
      if (!(FEATURE_KEYS as readonly string[]).includes(k)) continue;
      if (v === true) set.add(k as FeatureKey);
      else if (v === false) set.delete(k as FeatureKey);
    }
  }
  return FEATURE_KEYS.filter((k) => set.has(k));
}
export const PLAN_SEEDS: { name: string; features: FeatureKey[] }[] = [
  { name: "Essentiel", features: CORE_FEATURES },
  { name: "Pro", features: [...CORE_FEATURES, "advances", "expenses", "tablets", "messaging"] },
  { name: "Entreprise", features: [...FEATURE_KEYS] },
];
