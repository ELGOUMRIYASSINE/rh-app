import { SignJWT } from "jose";
import { route } from "@/server/api";

/** Short-lived token the browser hands to the Socket.IO server (the access cookie is httpOnly). */
export const GET = route({ allowEmployee: true }, async ({ s }) => {
  const token = await new SignJWT({ org: s.org.id, role: s.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuer("yghr-rt")
    .setExpirationTime("2m")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
  return { token };
});
