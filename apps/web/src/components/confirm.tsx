"use client";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, Field, Modal, Textarea } from "@yghr/ui";

interface Opts { title: string; message?: string; confirmLabel?: string; danger?: boolean; reasonLabel?: string; reasonRequired?: boolean }
type Pending = Opts & { resolve: (v: string | false) => void };
let push: ((p: Pending) => void) | null = null;

/** await confirmDialog({...}) → true/false. With reasonLabel, resolves to the typed reason (string) or false. */
export function confirmDialog(o: Opts & { reasonLabel: string }): Promise<string | false>;
export function confirmDialog(o: Opts): Promise<boolean>;
export function confirmDialog(o: Opts): Promise<boolean | string> {
  return new Promise((resolve) => {
    if (!push) return resolve(window.confirm(o.title));
    push({ ...o, resolve: (v) => resolve(o.reasonLabel ? v : v !== false) });
  });
}

export function ConfirmHost() {
  const [p, setP] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    push = (x) => { setReason(""); setP(x); };
    return () => { push = null; };
  }, []);
  const close = (v: string | false) => { p?.resolve(v); setP(null); };
  return (
    <Modal
      open={!!p}
      onOpenChange={(o) => !o && close(false)}
      size="sm"
      title={p?.title ?? ""}
      subtitle={p?.message}
      icon={p?.danger ? <AlertTriangle /> : undefined}
      footer={<>
        <Button variant="ghost" onClick={() => close(false)}>Annuler</Button>
        <Button variant={p?.danger ? "danger" : "primary"} disabled={!!p?.reasonRequired && reason.trim().length < 3} onClick={() => close(reason || "ok")}>{p?.confirmLabel ?? "Confirmer"}</Button>
      </>}
    >
      {p?.reasonLabel ? (
        <Field label={p.reasonLabel} required={p.reasonRequired} htmlFor="confirm-reason"><Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} /></Field>
      ) : (
        <p className="text-sm text-muted">{p?.danger ? "Cette action est définitive." : "Voulez-vous continuer ?"}</p>
      )}
    </Modal>
  );
}
