"use client";
import { useState } from "react";
import { Lock } from "lucide-react";
import { Button, Card } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function LockedFeature({ title, feature }: { title: string; feature: string }) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  async function request() {
    setLoading(true);
    try {
      await api("/api/organization/plan/request", { body: { feature } });
      setSent(true);
      toast.success("Demande envoyée : notre équipe vous recontacte rapidement.");
    } catch {}
    setLoading(false);
  }
  return (
    <Card className="mx-auto mt-10 max-w-xl px-8 py-14 text-center">
      <div className="mx-auto mb-5 grid size-16 place-items-center rounded-full bg-accent-100 text-accent-700">
        <Lock className="size-7" strokeWidth={1.75} />
      </div>
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">Cette page n'est pas incluse dans votre pack. Contactez-nous pour l'activer ou passer au pack supérieur.</p>
      <Button className="mt-7" onClick={request} loading={loading} disabled={sent}>
        {sent ? "Demande envoyée" : "Demander l'activation"}
      </Button>
    </Card>
  );
}
