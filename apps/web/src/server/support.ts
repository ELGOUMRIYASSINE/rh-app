import "server-only";
import { prisma } from "@yghr/db";
import { simpleEmail } from "./mail";

export const TICKET_STATUS: Record<string, string> = { OPEN: "Nouveau", IN_PROGRESS: "En cours", WAITING_CLINIC: "En attente de la clinique", RESOLVED: "Résolu" };
export const TICKET_PRIORITY: Record<string, string> = { LOW: "Basse", NORMAL: "Normale", HIGH: "Haute", URGENT: "Urgente" };
export const TICKET_CATEGORY: Record<string, string> = { question: "Question", bug: "Problème / bug", payroll: "Paie", devices: "Pointeuses", account: "Comptes et accès", billing: "Abonnement", other: "Autre" };

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

/** E-mail the YGHR team (SUPPORT_EMAIL, or every platform admin) about clinic activity on a ticket. */
export async function notifyPlatform(ticketId: string, what: "new" | "reply") {
  const t = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: { organization: { select: { name: true } }, createdBy: { select: { firstName: true, lastName: true } } } });
  if (!t) return;
  const to = process.env.SUPPORT_EMAIL ? [process.env.SUPPORT_EMAIL] : (await prisma.user.findMany({ where: { isPlatformAdmin: true }, select: { email: true } })).map((u) => u.email);
  const who = t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}` : "La clinique";
  for (const email of to)
    await simpleEmail(email, `[Support] ${t.organization.name} : ${t.subject}`, what === "new" ? "Nouvelle demande de support" : "Nouvelle réponse d'une clinique", [`${t.organization.name} · ${who}`, `« ${t.subject} »`], { label: "Ouvrir la demande", url: `${appUrl()}/admin/support/${t.id}` });
}

/** Tell the clinic author that YGHR answered. */
export async function notifyClinic(ticketId: string) {
  const t = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: { organization: { select: { slug: true } }, createdBy: { select: { email: true } } } });
  if (!t?.createdBy) return;
  await simpleEmail(t.createdBy.email, `Réponse du support YGHR : ${t.subject}`, "Le support YGHR vous a répondu", [`Votre demande « ${t.subject} » a reçu une réponse.`], { label: "Voir la réponse", url: `${appUrl()}/${t.organization.slug}/rh/support?t=${t.id}` });
}
