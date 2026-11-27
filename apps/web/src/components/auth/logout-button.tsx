"use client";
import { LogOut } from "lucide-react";
import { Button } from "@yghr/ui";

export async function logout() {
  const r = await fetch("/api/auth/logout", { method: "POST" });
  const d = await r.json().catch(() => ({ redirect: "/login" }));
  window.location.href = d.redirect ?? "/login";
}

export function LogoutButton({ variant = "secondary" }: { variant?: "secondary" | "ghost" | "onDark" }) {
  return <Button variant={variant} onClick={logout}><LogOut /> Se déconnecter</Button>;
}
