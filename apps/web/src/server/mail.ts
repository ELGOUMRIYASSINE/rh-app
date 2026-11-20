import "server-only";
import nodemailer from "nodemailer";

/**
 * DECISION: e-mails use a small built-in HTML layout instead of React Email to keep the
 * dependency footprint low; the templates are plain functions and easy to swap later.
 */
let transporter: nodemailer.Transporter | null = null;
function transport() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F8F6;font-family:Inter,Segoe UI,Arial,sans-serif;color:#14201F">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E6E8E3;overflow:hidden">
  <tr><td style="background:#0B2422;padding:20px 28px;color:#fff;font-weight:700;font-size:18px;letter-spacing:.5px">YG<span style="color:#F2A541">HR</span></td></tr>
  <tr><td style="padding:28px">
    <h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
    <div style="font-size:15px;line-height:1.6;color:#33403E">${bodyHtml}</div>
    ${cta ? `<p style="margin:24px 0 8px"><a href="${cta.url}" style="background:#0F766E;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${esc(cta.label)}</a></p><p style="font-size:12px;color:#66736F;word-break:break-all">Ou copiez ce lien : ${cta.url}</p>` : ""}
  </td></tr>
  <tr><td style="padding:16px 28px;border-top:1px solid #E6E8E3;font-size:12px;color:#66736F">Vos équipes, leur temps et leur paie, au même endroit.</td></tr>
  </table></td></tr></table></body></html>`;
}

export async function sendMail(to: string, subject: string, html: string) {
  // Placeholder addresses (employees created from a clock, e-mail not known yet): never send.
  if (/\.invalid$/i.test(to)) return false;
  try {
    await transport().sendMail({ from: process.env.MAIL_FROM ?? "YGHR <no-reply@yghr.ma>", to, subject, html });
    return true;
  } catch (e) {
    // Never block the user flow on SMTP issues; the link is also logged in dev.
    console.warn(`[mail] envoi impossible à ${to} : ${(e as Error).message}`);
    return false;
  }
}

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export function inviteEmail(o: { to: string; firstName: string; orgName: string; token: string; asLead?: boolean }) {
  const url = `${appUrl()}/invite/${o.token}`;
  if (process.env.NODE_ENV !== "production") console.info(`[mail] lien d'invitation pour ${o.to} : ${url}`);
  return sendMail(
    o.to,
    `${o.orgName} vous invite sur YGHR`,
    layout(
      `Bonjour ${o.firstName},`,
      `<p>${esc(o.orgName)} vous a ${o.asLead ? "nommé(e) <b>chef d'équipe</b>" : "ajouté(e)"} sur YGHR.</p><p>Créez votre mot de passe pour accéder à votre espace : planning, demandes de congé, absences et retards.</p><p style="color:#66736F;font-size:13px">Ce lien est valable 7 jours.</p>`,
      { label: "Créer mon mot de passe", url },
    ),
  );
}

export function resetEmail(o: { to: string; firstName: string; token: string }) {
  const url = `${appUrl()}/reset/${o.token}`;
  if (process.env.NODE_ENV !== "production") console.info(`[mail] lien de réinitialisation pour ${o.to} : ${url}`);
  return sendMail(o.to, "Réinitialisation de votre mot de passe YGHR", layout(`Bonjour ${o.firstName},`, `<p>Vous avez demandé à réinitialiser votre mot de passe. Si ce n'est pas vous, ignorez simplement cet e-mail.</p><p style="color:#66736F;font-size:13px">Ce lien est valable 7 jours.</p>`, { label: "Choisir un nouveau mot de passe", url }));
}

export function simpleEmail(to: string, subject: string, title: string, paragraphs: string[], cta?: { label: string; url: string }) {
  return sendMail(to, subject, layout(title, paragraphs.map((p) => `<p>${esc(p)}</p>`).join(""), cta));
}
