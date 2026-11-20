"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserPlus } from "lucide-react";
import { Button, Field, Input, Modal, SectionLabel, Select } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";

const schema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis"),
  lastName: z.string().trim().min(1, "Nom requis"),
  email: z.string().trim().email("E-mail invalide"),
  serviceId: z.string().optional(),
  centreId: z.string().optional(),
  staffCategoryId: z.string().optional(),
  phone: z.string().optional(),
  netHourlyRate: z.string().optional().refine((v) => !v || !Number.isNaN(Number(v.replace(",", "."))), "Nombre invalide"),
});
type F = z.infer<typeof schema>;
const NEW = "__new__";

export function AddEmployeeModal({ services: initialServices, categories: initialCategories, centres = [], onClose, onCreated, canCreateRefs = true }: { services: { id: string; name: string }[]; categories: { id: string; name: string }[]; centres?: { id: string; name: string }[]; onClose: () => void; onCreated: () => void; canCreateRefs?: boolean }) {
  const [services, setServices] = useState(initialServices);
  const [categories, setCategories] = useState(initialCategories);
  const { register, handleSubmit, setValue, setError, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(schema), defaultValues: { serviceId: "", staffCategoryId: "", centreId: centres.length === 1 ? centres[0]!.id : "" } });

  const [creating, setCreating] = useState<"service" | "category" | null>(null);
  const [newName, setNewName] = useState("");
  async function createInline(kind: "service" | "category") {
    const name = newName.trim();
    if (!name) return;
    try {
      if (kind === "service") {
        const r = await api<{ item: { id: string; name: string } }>("/api/services", { body: { name, active: true } });
        setServices((s) => [...s, r.item].sort((a, b) => a.name.localeCompare(b.name)));
        setValue("serviceId", r.item.id);
      } else {
        const code = name.normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "CAT";
        const r = await api<{ item: { id: string; name: string } }>("/api/staff-categories", { body: { name, code: `${code}${Math.floor(Math.random() * 90 + 10)}`, active: true } });
        setCategories((s) => [...s, r.item].sort((a, b) => a.name.localeCompare(b.name)));
        setValue("staffCategoryId", r.item.id);
      }
      toast.success(`« ${name} » créé.`);
      setCreating(null);
      setNewName("");
    } catch {}
  }
  const inline = (kind: "service" | "category") =>
    creating === kind && (
      <div className="mt-2 flex gap-2 animate-fade-in">
        <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={kind === "service" ? "Nom du service" : "Nom de la catégorie"} className="h-9" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void createInline(kind); } if (e.key === "Escape") setCreating(null); }} />
        <Button size="sm" onClick={() => createInline(kind)} disabled={!newName.trim()}>Créer</Button>
        <Button size="sm" variant="ghost" onClick={() => setCreating(null)}>Annuler</Button>
      </div>
    );

  async function submit(f: F) {
    if (centres.length && !f.centreId) return setError("centreId", { message: "Choisissez le centre du salarié" });
    try {
      const r = await api<{ invited: boolean }>("/api/employees", {
        body: { firstName: f.firstName, lastName: f.lastName, email: f.email, serviceId: f.serviceId || null, centreId: f.centreId || null, staffCategoryId: f.staffCategoryId || null, phone: f.phone || null, netHourlyRate: f.netHourlyRate ? Number(f.netHourlyRate.replace(",", ".")) : null },
      });
      toast.success(`${f.firstName} ${f.lastName} a été ajouté(e).`, { description: r.invited ? `Un e-mail avec ses accès a été envoyé à ${f.email}.` : undefined });
      onCreated();
    } catch {}
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      icon={<UserPlus />}
      title="Ajouter un salarié"
      subtitle="Il recevra par e-mail un lien pour créer son mot de passe et accéder à son espace : planning, demandes de congé, absences et retards."
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={handleSubmit(submit)} loading={isSubmitting}>Ajouter et envoyer les accès</Button></>}
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-6" noValidate>
        <section className="space-y-3">
          <SectionLabel>Identité et accès</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prénom" required htmlFor="fn" error={errors.firstName?.message}><Input id="fn" {...register("firstName")} aria-invalid={!!errors.firstName} autoComplete="off" /></Field>
            <Field label="Nom" required htmlFor="ln" error={errors.lastName?.message}><Input id="ln" {...register("lastName")} aria-invalid={!!errors.lastName} autoComplete="off" /></Field>
            <Field className="sm:col-span-2" label="E-mail" required htmlFor="em" error={errors.email?.message} help="Obligatoire : le salarié y reçoit ses accès à l'application."><Input id="em" type="email" {...register("email")} aria-invalid={!!errors.email} placeholder="prenom.nom@exemple.ma" /></Field>
          </div>
        </section>
        <section className="space-y-3">
          <SectionLabel>Affectation</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            {centres.length > 0 && (
              <Field className="sm:col-span-2" label="Centre" required htmlFor="ce" error={errors.centreId?.message} help="Le site où il travaille : il ne pourra pointer que sur les tablettes de ce centre.">
                <Select id="ce" {...register("centreId")} aria-invalid={!!errors.centreId}>
                  <option value="">Choisir un centre</option>
                  {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Service" htmlFor="sv">
              <Select id="sv" {...register("serviceId", { onChange: (e) => { if (e.target.value === NEW) { setValue("serviceId", ""); setNewName(""); setCreating("service"); } } })}>
                <option value="">Aucun</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                {canCreateRefs && <option value={NEW}>＋ Créer un service</option>}
              </Select>
              {inline("service")}
            </Field>
            <Field label="Catégorie de personnel" htmlFor="ct">
              <Select id="ct" {...register("staffCategoryId", { onChange: (e) => { if (e.target.value === NEW) { setValue("staffCategoryId", ""); setNewName(""); setCreating("category"); } } })}>
                <option value="">Aucune</option>
                {categories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                {canCreateRefs && <option value={NEW}>＋ Créer une catégorie</option>}
              </Select>
              {inline("category")}
            </Field>
          </div>
        </section>
        <section className="space-y-3">
          <SectionLabel>Coordonnées et salaire</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Téléphone" htmlFor="ph"><Input id="ph" type="tel" {...register("phone")} placeholder="06 00 00 00 00" /></Field>
            <Field label="Salaire net / heure (DH)" htmlFor="nh" error={errors.netHourlyRate?.message} help="La paie en déduit le taux brut automatiquement."><Input id="nh" inputMode="decimal" {...register("netHourlyRate")} placeholder="ex. 20" /></Field>
          </div>
        </section>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
