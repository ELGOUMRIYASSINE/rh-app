import type { FeatureKey, Permission } from "@yghr/core";

export type IconName =
  | "dashboard" | "reports" | "employees" | "planning" | "leaves" | "attendance" | "devices" | "tablets"
  | "payroll" | "advances" | "expenses" | "audit" | "settings" | "signature" | "messages" | "structure"
  | "availability" | "documents" | "profile" | "home" | "team";

export interface NavItem {
  label: string;
  href: string; // relative to /{org}/{space}
  icon: IconName;
  feature?: FeatureKey;
  permission?: Permission;
  locked?: boolean;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const RH_NAV: NavGroup[] = [
  { label: "Pilotage", items: [
    { label: "Tableau de bord", href: "", icon: "dashboard", feature: "dashboard" },
    { label: "Rapports", href: "/rapports", icon: "reports", feature: "reports" },
  ] },
  { label: "Équipes", items: [
    { label: "Salariés", href: "/employes", icon: "employees", feature: "employees" },
    { label: "Planning", href: "/planning", icon: "planning", feature: "planning" },
    { label: "Congés", href: "/conges", icon: "leaves", feature: "leaves" },
    { label: "Présences", href: "/presences", icon: "attendance", feature: "attendance" },
    { label: "Disponibilités", href: "/disponibilites", icon: "availability", feature: "availability" },
  ] },
  { label: "Matériel", items: [
    { label: "Pointeuses", href: "/pointeuses", icon: "devices", feature: "devices" },
    { label: "Tablettes", href: "/tablettes", icon: "tablets", feature: "tablets" },
  ] },
  { label: "Finance", items: [
    { label: "Paie", href: "/paie", icon: "payroll", feature: "payroll" },
    { label: "Acomptes", href: "/acomptes", icon: "advances", feature: "advances" },
    { label: "Notes de frais", href: "/notes-de-frais", icon: "expenses", feature: "expenses" },
  ] },
  { label: "Collaboration", items: [
    { label: "Signature", href: "/signature", icon: "signature", feature: "esignature" },
    { label: "Messagerie", href: "/messages", icon: "messages", feature: "messaging" },
  ] },
  { label: "Système", items: [
    { label: "Structure", href: "/structure", icon: "structure", feature: "structure" },
    { label: "Audit", href: "/logs", icon: "audit", feature: "audit" },
    { label: "Paramètres", href: "/settings", icon: "settings", feature: "settings" },
  ] },
];

export const CHEF_NAV: NavGroup[] = [
  { label: "Mon équipe", items: [
    { label: "Tableau de bord", href: "", icon: "dashboard" },
    { label: "Équipe", href: "/equipe", icon: "team" },
    { label: "Planning", href: "/planning", icon: "planning", feature: "planning", permission: "planning.manage" },
    { label: "Présences", href: "/presences", icon: "attendance", feature: "attendance", permission: "attendance.validate" },
    { label: "Congés", href: "/conges", icon: "leaves", feature: "leaves", permission: "leaves.approve" },
    { label: "Rapports", href: "/rapports", icon: "reports", feature: "reports", permission: "reports.view" },
  ] },
  { label: "Documents & finance", items: [
    { label: "Dossiers", href: "/dossiers", icon: "documents", permission: "documents.view" },
    { label: "Signature", href: "/signature", icon: "signature", feature: "esignature", permission: "documents.sign" },
    { label: "Acomptes", href: "/acomptes", icon: "advances", feature: "advances", permission: "advances.validate" },
    { label: "Notes de frais", href: "/notes-de-frais", icon: "expenses", feature: "expenses", permission: "expenses.validate" },
    { label: "Messages", href: "/messages", icon: "messages", feature: "messaging", permission: "messaging.access" },
  ] },
  { label: "Moi", items: [{ label: "Profil", href: "/profil", icon: "profile" }] },
];

export const SALARIE_NAV: NavGroup[] = [
  { label: "Mon espace", items: [
    { label: "Accueil", href: "", icon: "home" },
    { label: "Planning", href: "/planning", icon: "planning", feature: "planning" },
    { label: "Congés", href: "/conges", icon: "leaves", feature: "leaves" },
    { label: "Documents", href: "/documents", icon: "documents" },
    { label: "Signature", href: "/signature", icon: "signature", feature: "esignature" },
    { label: "Acomptes", href: "/acomptes", icon: "advances", feature: "advances" },
    { label: "Notes de frais", href: "/notes-de-frais", icon: "expenses", feature: "expenses" },
    { label: "Disponibilités", href: "/disponibilites", icon: "availability", feature: "availability" },
    { label: "Messages", href: "/messages", icon: "messages", feature: "messaging" },
    { label: "Profil", href: "/profil", icon: "profile" },
  ] },
];
