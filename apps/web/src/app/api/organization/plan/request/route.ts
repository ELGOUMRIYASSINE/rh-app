import { z } from "zod";
import { route } from "@/server/api";
import { simpleEmail } from "@/server/mail";

export const POST = route({ allowEmployee: true, body: z.object({ feature: z.string().max(40) }) }, async ({ s, body, log }) => {
  await simpleEmail(process.env.SALES_EMAIL ?? "commercial@yghr.ma", `Demande d'activation : ${body.feature} — ${s.org.name}`, "Demande d'activation de module", [
    `Organisation : ${s.org.name} (${s.org.slug}) — pack actuel : ${s.org.planName}`,
    `Module demandé : ${body.feature}`,
    `Demandé par : ${s.user.firstName} ${s.user.lastName} <${s.user.email}>`,
  ]);
  await log("CREATE", "PLAN_REQUEST", null, { feature: body.feature });
  return { ok: true };
});
