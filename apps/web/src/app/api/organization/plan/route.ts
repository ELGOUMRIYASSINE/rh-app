import { route } from "@/server/api";

export const GET = route({ allowEmployee: true }, async ({ s }) => ({ plan: s.org.planName, features: s.org.features }));
