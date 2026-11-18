import { ShieldX } from "lucide-react";
import { Card } from "@yghr/ui";

export function NoPermission({ title }: { title: string }) {
  return (
    <Card className="mx-auto mt-10 max-w-xl px-8 py-14 text-center">
      <div className="mx-auto mb-5 grid size-16 place-items-center rounded-full bg-surface-2 text-muted"><ShieldX className="size-7" strokeWidth={1.75} /></div>
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">Vous n'avez pas le droit d'accéder à cette page. Demandez à votre responsable RH de vous l'attribuer dans vos droits de chef d'équipe.</p>
    </Card>
  );
}
