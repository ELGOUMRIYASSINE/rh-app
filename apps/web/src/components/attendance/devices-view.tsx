"use client";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Clock, Cloud, Copy, Fingerprint, History, Link2, MoreHorizontal, Pencil, Plug, RefreshCw, Server, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { Avatar, Button, Card, CardHeader, cn, EmptyState, Field, Input, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, PageHeader, Select, Skeleton, StatusPill, TabPanel, Tabs, td, th, Toggle } from "@yghr/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { frDateTime, timeIn } from "@/lib/format";
import { confirmDialog } from "@/components/confirm";
import { useRealtimeEvent } from "@/components/shell/realtime";

interface Device { id: string; name: string; mode: "LAN" | "ADMS"; ip: string | null; port: number; serialNumber: string | null; model: string | null; firmware: string | null; userCount: number | null; status: "ONLINE" | "OFFLINE" | "UNKNOWN"; lastSeenAt: string | null; lastSyncAt: string | null; _count: { punches: number } }
interface Punch { id: string; at: string; employee: string | null; deviceUserId: string | null; device: string | null; source: string; verifyMode: string | null; direction: string | null }

export function DevicesView({ tz, initialTab, useServerTime: initialServerTime, employees }: { tz: string; initialTab: string; useServerTime: boolean; employees: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [tab, setTab] = useState(initialTab);
  const punches = useQuery({ queryKey: ["punches"], queryFn: () => api<{ items: Punch[] }>("/api/punches/latest"), refetchInterval: 20_000 });
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api<{ items: Device[]; admsHost: string; admsPort: number }>("/api/devices") });
  const maps = useQuery({ queryKey: ["maps"], queryFn: () => api<{ maps: { id: string; deviceUserId: string; employee: string }[]; unmapped: { deviceUserId: string; count: number; lastSeen: string | null }[] }>("/api/device-user-maps") });
  useRealtimeEvent("punch:new", () => { void punches.refetch(); void maps.refetch(); });
  useRealtimeEvent("device:status", () => devices.refetch());
  const refreshAll = () => { void qc.invalidateQueries({ queryKey: ["punches"] }); void qc.invalidateQueries({ queryKey: ["devices"] }); void qc.invalidateQueries({ queryKey: ["maps"] }); };

  return (
    <div>
      <PageHeader title="Pointeuses" subtitle="Pointeuse biométrique — présences automatiques" actions={<Button variant="secondary" onClick={refreshAll}><RefreshCw /> Actualiser</Button>} />
      <Tabs value={tab} onValueChange={(t) => { setTab(t); router.replace(`${pathname}?tab=${t}`, { scroll: false }); }} tabs={[
        { value: "punches", label: "Derniers pointages", icon: <History /> },
        { value: "devices", label: "Pointeuses", icon: <Fingerprint />, count: devices.data?.items.length },
        { value: "maps", label: "Empreintes → Employés", icon: <Link2 />, count: maps.data?.unmapped.length || undefined },
      ]}>
        <div className="mt-5">
          <TabPanel value="punches">
            <Card>
              {punches.isLoading ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11" />)}</div> : !punches.data?.items.length ? (
                <EmptyState icon={<Fingerprint />} title="Aucun pointage reçu pour l'instant." action={<Button onClick={() => setTab("devices")}>Ajouter une pointeuse</Button>}>Dès qu'une pointeuse envoie des données, les pointages apparaissent ici en temps réel.</EmptyState>
              ) : (
                <div className="scrollbar-thin max-h-[70vh] overflow-auto">
                  <table className="w-full min-w-[720px]">
                    <thead><tr>{["Heure", "Employé", "Pointeuse", "Type", "Mode de vérification"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {punches.data.items.map((p) => {
                        const dt = frDateTime(p.at, tz);
                        return (
                          <tr key={p.id} className="hover:bg-surface-2/50">
                            <td className={td}><div className="font-mono tabular">{dt.time}</div><div className="text-xs text-muted">{dt.date}</div></td>
                            <td className={td}>{p.employee ? <div className="flex items-center gap-2.5"><Avatar name={p.employee} size={28} />{p.employee}</div> : <button onClick={() => setTab("maps")} className="cursor-pointer text-[#9a6a00] underline-offset-2 hover:underline dark:text-warning">ID inconnu #{p.deviceUserId}</button>}</td>
                            <td className={cn(td, "text-[13px]")}>{p.device ?? (p.source === "CORRECTION" ? "Correction RH" : p.source === "TABLET" ? "Tablette" : "—")}</td>
                            <td className={td}>{p.direction ? <StatusPill tone={p.direction === "IN" ? "success" : "neutral"}>{p.direction === "IN" ? "Entrée" : "Sortie"}</StatusPill> : <span className="text-muted">Auto</span>}</td>
                            <td className={cn(td, "text-[13px] text-muted")}>{p.verifyMode ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabPanel>
          <TabPanel value="devices">
            <DevicesTab data={devices.data} loading={devices.isLoading} useServerTime={initialServerTime} onChange={() => devices.refetch()} tz={tz} />
          </TabPanel>
          <TabPanel value="maps">
            <MapsTab data={maps.data} employees={employees} onChange={() => { void maps.refetch(); void punches.refetch(); }} tz={tz} />
          </TabPanel>
        </div>
      </Tabs>
    </div>
  );
}

function DevicesTab({ data, loading, useServerTime, onChange, tz }: { data?: { items: Device[]; admsHost: string; admsPort: number }; loading: boolean; useServerTime: boolean; onChange: () => void; tz: string }) {
  const [serverTime, setServerTime] = useState(useServerTime);
  const [form, setForm] = useState({ name: "", ip: "", port: 4370, password: "" });
  const [tested, setTested] = useState<{ serialNumber: string | null; model: string | null; firmware: string | null; userCount: number | null } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adv, setAdv] = useState(false);
  const [sn, setSn] = useState("");
  const [snName, setSnName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function test() {
    setTesting(true);
    setTested(null);
    try {
      const r = await api<{ info: NonNullable<typeof tested> }>("/api/devices/test", { body: { ip: form.ip, port: form.port, password: form.password || null } });
      setTested(r.info);
      toast.success(`Connexion réussie${r.info.model ? ` : ${r.info.model}` : ""}.`);
    } catch {}
    setTesting(false);
  }
  async function save() {
    setSaving(true);
    try {
      await api("/api/devices", { body: { mode: "LAN", name: form.name || `Pointeuse ${form.ip}`, ip: form.ip, port: form.port, commPassword: form.password || null, ...tested } });
      toast.success("Pointeuse enregistrée. Les pointages seront récupérés automatiquement.");
      setForm({ name: "", ip: "", port: 4370, password: "" });
      setTested(null);
      onChange();
    } catch {}
    setSaving(false);
  }
  async function addAdms() {
    try {
      await api("/api/devices", { body: { mode: "ADMS", serialNumber: sn.trim(), name: snName.trim() || undefined } });
      toast.success("Pointeuse ADMS ajoutée. Configurez maintenant l'adresse du serveur sur l'appareil.");
      setSn(""); setSnName("");
      onChange();
    } catch {}
  }
  async function action(d: Device, kind: "sync" | "time" | "rename" | "delete") {
    if (kind === "delete" && !(await confirmDialog({ title: `Supprimer « ${d.name} » ?`, message: "Les pointages déjà reçus sont conservés.", danger: true, confirmLabel: "Supprimer" }))) return;
    if (kind === "rename") {
      const name = prompt("Nouveau nom de la pointeuse", d.name)?.trim();
      if (!name) return;
      await api(`/api/devices/${d.id}`, { method: "PATCH", body: { name } });
      onChange();
      return;
    }
    setBusy(d.id + kind);
    try {
      if (kind === "sync") {
        const r = await api<{ received: number; created: number }>(`/api/devices/${d.id}/sync`, { body: {} });
        toast.success(`${r.created} nouveau(x) pointage(s) sur ${r.received} lu(s).`);
      } else if (kind === "time") {
        await api(`/api/devices/${d.id}/time`, { body: {} });
        toast.success("Heure de la pointeuse réglée sur l'heure du serveur.");
      } else {
        await api(`/api/devices/${d.id}`, { method: "DELETE" });
        toast.success("Pointeuse supprimée.");
      }
      onChange();
    } catch {}
    setBusy(null);
  }
  const relative = (iso: string | null) => (iso ? frDateTime(iso, tz).date + " " + timeIn(iso, tz) : "jamais");

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <Toggle checked={serverTime} onChange={async (v) => { setServerTime(v); await api("/api/organization", { method: "PATCH", body: { useServerTimeForPunches: v } }); toast.success("Préférence enregistrée."); }} label={<span className="inline-flex items-center gap-2"><Clock className="size-4 text-muted" />Source de l'heure des pointages : utiliser l'heure du serveur</span>} description="Par défaut, l'horloge de la pointeuse horodate le pointage. Activez cette option pour les pointeuses dont l'horloge dérive : l'heure de réception par le serveur fera foi." />
      </Card>

      <Card>
        <CardHeader icon={<Plug />} title="Ajouter une pointeuse du réseau local" subtitle="Le test est fait par le serveur de l'application : il doit être sur le même réseau que la pointeuse (ou relié par VPN / redirection du port)." />
        <div className="grid gap-3 px-5 pb-5 md:grid-cols-[1.2fr_1fr_110px_1fr]">
          <Field label="Nom" htmlFor="dn"><Input id="dn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex. Pointeuse accueil" /></Field>
          <Field label="Adresse IP" required htmlFor="dip"><Input id="dip" value={form.ip} onChange={(e) => { setForm({ ...form, ip: e.target.value }); setTested(null); }} placeholder="192.168.1.201" className="font-mono" /></Field>
          <Field label="Port" htmlFor="dpo"><Input id="dpo" type="number" value={form.port} onChange={(e) => { setForm({ ...form, port: Number(e.target.value) }); setTested(null); }} className="font-mono" /></Field>
          <Field label="Mot de passe comm." htmlFor="dpw"><Input id="dpw" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="aucun" /></Field>
        </div>
        {tested && (
          <div className="mx-5 mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-[12px] border border-success/30 bg-success-100/50 px-4 py-3 text-sm animate-fade-in">
            <span className="inline-flex items-center gap-2 font-medium text-success"><CheckCircle2 className="size-4" /> Connexion réussie</span>
            <span>SN : <b className="font-mono">{tested.serialNumber ?? "—"}</b></span>
            <span>Modèle : <b>{tested.model ?? "—"}</b></span>
            <span>Utilisateurs : <b className="tabular">{tested.userCount ?? "—"}</b></span>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="secondary" onClick={test} loading={testing} disabled={!form.ip}><Plug /> Tester la connexion</Button>
          <Button onClick={save} loading={saving} disabled={!tested}>Enregistrer la pointeuse</Button>
        </div>
      </Card>

      <div>
        <h3 className="mb-3 font-display text-base font-semibold">Pointeuses enregistrées</h3>
        {loading ? <Skeleton className="h-32" /> : !data?.items.length ? (
          <Card><EmptyState compact icon={<Fingerprint />} title="Aucune pointeuse">Ajoutez votre première pointeuse pour recevoir les présences automatiquement.</EmptyState></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((d) => (
              <Card key={d.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className={cn("grid size-11 place-items-center rounded-[12px]", d.status === "ONLINE" ? "bg-success-100 text-success" : "bg-surface-2 text-muted")}>{d.status === "ONLINE" ? <Wifi className="size-5" /> : <WifiOff className="size-5" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{d.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <StatusPill tone={d.status === "ONLINE" ? "success" : d.status === "OFFLINE" ? "danger" : "neutral"} dot>{d.status === "ONLINE" ? "En ligne" : d.status === "OFFLINE" ? "Hors ligne" : "En attente"}</StatusPill>
                      <StatusPill>{d.mode === "LAN" ? <><Server className="size-3" /> LAN</> : <><Cloud className="size-3" /> ADMS</>}</StatusPill>
                    </div>
                  </div>
                  <Menu>
                    <MenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="Actions"><MoreHorizontal /></Button></MenuTrigger>
                    <MenuContent>
                      {d.mode === "LAN" && <MenuItem icon={<RefreshCw />} onSelect={() => action(d, "sync")}>Synchroniser</MenuItem>}
                      {d.mode === "LAN" && <MenuItem icon={<Clock />} onSelect={() => action(d, "time")}>Régler l'heure</MenuItem>}
                      <MenuItem icon={<Pencil />} onSelect={() => action(d, "rename")}>Renommer</MenuItem>
                      <MenuSeparator />
                      <MenuItem icon={<Trash2 />} danger onSelect={() => action(d, "delete")}>Supprimer</MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                  <div><dt className="text-xs text-muted">N° de série</dt><dd className="font-mono">{d.serialNumber ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted">{d.mode === "LAN" ? "Adresse" : "Modèle"}</dt><dd className="font-mono">{d.mode === "LAN" ? `${d.ip}:${d.port}` : (d.model ?? "—")}</dd></div>
                  <div><dt className="text-xs text-muted">Vue</dt><dd>{relative(d.lastSeenAt)}</dd></div>
                  <div><dt className="text-xs text-muted">Dernière synchro</dt><dd>{relative(d.lastSyncAt)}</dd></div>
                </dl>
                {d.mode === "LAN" && <Button size="sm" variant="secondary" className="mt-4 w-full" onClick={() => action(d, "sync")} loading={busy === d.id + "sync"}><RefreshCw /> Synchroniser</Button>}
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card>
        <button onClick={() => setAdv(!adv)} className="flex w-full cursor-pointer items-center gap-3 px-5 py-4 text-left" aria-expanded={adv}>
          <Cloud className="size-5 text-muted" />
          <span className="flex-1 text-sm font-medium">Avancé : ajouter par numéro de série (mode ADMS / serveur Cloud)</span>
          <ChevronDown className={cn("size-4 text-muted transition-transform", adv && "rotate-180")} />
        </button>
        {adv && (
          <div className="space-y-4 border-t border-border px-5 py-4 animate-fade-in">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Numéro de série (SN)" required htmlFor="sn"><Input id="sn" value={sn} onChange={(e) => setSn(e.target.value)} className="w-56 font-mono" placeholder="ex. BJ2C123456789" /></Field>
              <Field label="Nom (optionnel)" htmlFor="snn"><Input id="snn" value={snName} onChange={(e) => setSnName(e.target.value)} className="w-56" /></Field>
              <Button onClick={addAdms} disabled={sn.trim().length < 4}>+ Ajouter</Button>
            </div>
            <div className="rounded-[12px] bg-surface-2 p-4 text-[13px] leading-relaxed">
              Sur la pointeuse : <b>Menu → Communication → Serveur Cloud (ADMS)</b>, puis saisissez
              <div className="mt-2 flex flex-wrap gap-3">
                <CopyBox label="Adresse du serveur" value={data?.admsHost ?? "—"} />
                <CopyBox label="Port" value={String(data?.admsPort ?? 3000)} />
              </div>
              <p className="mt-2 text-xs text-muted">La pointeuse enverra ses pointages vers <span className="font-mono">/iclock/cdata</span>. Seuls les numéros de série enregistrés ici sont acceptés.</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function CopyBox({ label, value }: { label: string; value: string }) {
  return (
    <button onClick={() => { void navigator.clipboard.writeText(value); toast.success("Copié."); }} className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-1.5 text-left hover:border-brand-500">
      <span className="text-xs text-muted">{label}</span><b className="font-mono">{value}</b><Copy className="size-3.5 text-muted" />
    </button>
  );
}

function MapsTab({ data, employees, onChange, tz }: { data?: { maps: { id: string; deviceUserId: string; employee: string }[]; unmapped: { deviceUserId: string; count: number; lastSeen: string | null }[] }; employees: { id: string; name: string }[]; onChange: () => void; tz: string }) {
  const [employeeId, setEmployeeId] = useState("");
  const [deviceUserId, setDeviceUserId] = useState("");
  const [saving, setSaving] = useState(false);
  async function link(uid = deviceUserId, emp = employeeId) {
    setSaving(true);
    try {
      const r = await api<{ backfilled: number; warning: string | null }>("/api/device-user-maps", { body: { deviceUserId: uid, employeeId: emp } });
      toast.success(`ID ${uid} associé.${r.backfilled ? ` ${r.backfilled} pointage(s) passé(s) rattaché(s) et présences recalculées.` : ""}`, { description: r.warning ?? undefined });
      setDeviceUserId(""); setEmployeeId("");
      onChange();
    } catch {}
    setSaving(false);
  }
  async function unlink(id: string) {
    if (!(await confirmDialog({ title: "Retirer cette association ?", message: "Les futurs pointages de cet ID ne seront plus rattachés au salarié.", confirmLabel: "Retirer" }))) return;
    await api(`/api/device-user-maps?id=${id}`, { method: "DELETE" });
    onChange();
  }
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Associer une empreinte" subtitle="Associez chaque ID d'empreinte détecté à un employé. Les pointages déjà reçus sont alors rattachés à ses présences." />
        <div className="flex flex-wrap items-end gap-3 px-5 pb-5">
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-64" aria-label="Employé"><option value="">Choisir un employé…</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>
          <Input value={deviceUserId} onChange={(e) => setDeviceUserId(e.target.value)} placeholder="ID empreinte (ex. 5)" className="w-48 font-mono" aria-label="ID empreinte" />
          <Button onClick={() => link()} loading={saving} disabled={!employeeId || !deviceUserId}><Link2 /> Associer</Button>
        </div>
        {!!data?.unmapped.length && (
          <div className="border-t border-border">
            <div className="px-5 pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">IDs non associés</div>
            <ul className="divide-y divide-border">
              {data.unmapped.map((u) => (
                <li key={u.deviceUserId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="rounded-md bg-warning-100 px-2 py-0.5 font-mono text-sm font-semibold text-[#9a6a00] dark:text-warning">#{u.deviceUserId}</span>
                  <span className="text-sm text-muted">{u.count} pointage{u.count > 1 ? "s" : ""} · vu {u.lastSeen ? `${frDateTime(u.lastSeen, tz).date} ${timeIn(u.lastSeen, tz)}` : "—"}</span>
                  <Select className="ml-auto h-9 w-60" defaultValue="" onChange={(e) => e.target.value && link(u.deviceUserId, e.target.value)} aria-label={`Associer l'ID ${u.deviceUserId}`}><option value="">Associer à…</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="Associations" subtitle={`${data?.maps.length ?? 0} empreinte(s) associée(s)`} />
        <div className="grid gap-2 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
          {data?.maps.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-[12px] border border-border px-3 py-2">
              <span className="rounded-md bg-brand-100 px-2 py-0.5 font-mono text-xs font-semibold text-brand-700 dark:text-brand-400">#{m.deviceUserId}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{m.employee}</span>
              <button onClick={() => unlink(m.id)} className="grid size-7 cursor-pointer place-items-center rounded-md text-muted hover:bg-danger-100 hover:text-danger" aria-label={`Retirer l'association ${m.deviceUserId}`}><X className="size-3.5" /></button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
