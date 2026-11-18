import { redirect } from "next/navigation";
import { getSession, spaceForRole } from "@/server/context";

export default async function Home() {
  const s = await getSession();
  if (!s) redirect("/login");
  redirect(`/${s.org.slug}/${spaceForRole(s.role)}`);
}
