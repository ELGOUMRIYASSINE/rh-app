"use client";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Clock, Cloud, Copy, CreditCard, Download, DownloadCloud, Fingerprint, History, Info, KeyRound, Link2, MoreHorizontal, Pencil, Plug, Power, RefreshCw, ScanFace, Search, Server, ShieldCheck, Sparkles, Trash2, UserPlus, Users, Wifi, WifiOff, X } from "lucide-react";
import { Avatar, Button, Card, CardHeader, Checkbox, cn, EmptyState, Field, Input, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Modal, PageHeader, Segmented, Select, Skeleton, StatusPill, TabPanel, Tabs, td, th, Toggle } from "@yghr/ui";
import { toast } from "sonner";
import { api, download } from "@/lib/api";
import { frDateTime, timeIn } from "@/lib/format";
import { confirmDialog } from "@/components/confirm";
import { useRealtimeEvent } from "@/components/shell/realtime";

interface Device {
  id: string; name: string; mode: "LAN" | "ADMS"; ip: string | null; port: number; serialNumber: string | null; model: string | null; firmware: string | null; platform: string | null; macAddress: string | null; reportedIp: string | null;
  userCount: number | null; fingerprintCount: number | null; faceCount: number | null; logCount: number | null; userCapacity: number | null; fingerprintCapacity: number | null; logCapacity: number | null;
  clockDriftSeconds: number | null; usersSyncedAt: string | null; lastError: string | null;
  status: "ONLINE" | "OFFLINE" | "UNKNOWN"; lastSeenAt: string | null; lastSyncAt: string | null; _count: { punches: number; users: number };
  commands: { id: string; label: string; status: string; createdAt: string; doneAt: string | null }[];
}
interface Punch { id: string; at: string; employee: string | null; deviceUserId: string | null; deviceName: string | null; state: string | null; device: string | null; source: string; verifyMode: string | null; direction: string | null }
interface UserRow { pin: string; name: string | null; admin: boolean; fingerprints: number; face: boolean; card: string | null; password: boolean; devices: string[]; inDevice: boolean; punches: number; lastPunch: string | null; employee: { id: string; mapId: string; name: string; matricule: string | null } | null; suggestion: string | null }

export function DevicesView({ tz, initialTab, useServerTime: initialServerTime }: { tz: string; initialTab: string; useServerTime: boolean; employees?: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [tab, setTab] = useState(initialTab === "maps" ? "users" : initialTab);
  const [exporting, setExporting] = useState(false);
  const punches = useQuery({ queryKey: ["punches"], queryFn: () => api<{ items: Punch[] }>("/api/punches/latest"), refetchInterval: 20_000 });
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api<{ items: Device[]; admsHost: string; admsPort: number }>("/api/devices"), refetchInterval: 15_000 });
  const users = useQuery({ queryKey: ["device-users"], queryFn: () => api<{ rows: UserRow[]; employees: { id: string; name: string; linked: boolean }[] }>("/api/device-users") });
  useRealtimeEvent("punch:new", () => { void punches.refetch(); void users.refetch(); });
  useRealtimeEvent("device:status", () => devices.refetch());
  useRealtimeEvent("device:users", () => { void users.refetch(); void devices.refetch(); });
  const refreshAll = () => { for (const k of ["punches", "devices", "device-users"]) void qc.invalidateQueries({ queryKey: [k] }); };
  const unlinked = users.data?.rows.filter((r) => !r.employee).length ?? 0;

  return (
    <div>
      <PageHeader title="Pointeuses" subtitle="Pointeuses biométriques : présences, utilisateurs et données de chaque appareil" actions={<><Button variant="secondary" onClick={() => setExporting(true)}><Download /> Exporter les pointages</Button><Button variant="secondary" onClick={refreshAll}><RefreshCw /> Actualiser</Button></>} />
      <Tabs value={tab} onValueChange={(t) => { setTab(t); router.replace(`${pathname}?tab=${t}`, { scroll: false }); }} tabs={[
        { value: "punches", label: "Derniers pointages", icon: <History /> },
        { value: "devices", label: "Pointeuses", icon: <Fingerprint />, count: devices.data?.items.length },
        { value: "users", label: "Utilisateurs des pointeuses", icon: <Users />, count: unlinked || undefined },
      ]}>
        <div className="mt-5">
          <TabPanel value="punches">
            <Card>
              {punches.isLoading ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11" />)}</div> : !punches.data?.items.length ? (
                <EmptyState icon={<Fingerprint />} title="Aucun pointage reçu pour l'instant." action={<Button onClick={() => setTab("devices")}>Ajouter une pointeuse</Button>}>Dès qu'une pointeuse envoie des données, les pointages apparaissent ici en temps réel.</EmptyState>
              ) : (
                <div className="scrollbar-thin max-h-[70vh] overflow-auto">
                  <table className="w-full min-w-[820px]">
                    <thead><tr>{["Heure", "Salarié", "Pointeuse", "Type", "Vérification"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {punches.data.items.map((p) => {
                        const dt = frDateTime(p.at, tz);
                        return (
                          <tr key={p.id} className="hover:bg-surface-2/50">
                            <td className={td}><div className="font-mono tabular">{dt.time}</div><div className="text-xs text-muted">{dt.date}</div></td>
                            <td className={td}>
                              {p.employee ? <div className="flex items-center gap-2.5"><Avatar name={p.employee} size={28} />{p.employee}</div> : (
                                <button onClick={() => setTab("users")} className="cursor-pointer text-left">
                                  <div className="font-medium">{p.deviceName ?? `ID #${p.deviceUserId}`}</div>
                                  <div className="text-xs text-[#9a6a00] underline-offset-2 hover:underline dark:text-warning">ID #{p.deviceUserId} · non associé à un salarié</div>
                                </button>
                              )}
                            </td>
                            <td className={cn(td, "text-[13px]")}>{p.device ?? (p.source === "CORRECTION" ? "Correction RH" : p.source === "TABLET" ? "Tablette" : "")}</td>
                            <td className={td}>{p.state || p.direction ? <StatusPill tone={p.direction === "IN" ? "success" : p.direction === "OUT" ? "neutral" : "info"}>{p.state ?? (p.direction === "IN" ? "Entrée" : "Sortie")}</StatusPill> : <span className="text-muted">Auto</span>}</td>
                            <td className={cn(td, "text-[13px] text-muted")}>{p.verifyMode ?? ""}</td>
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
            <DevicesTab data={devices.data} loading={devices.isLoading} useServerTime={initialServerTime} onChange={() => { void devices.refetch(); void users.refetch(); void punches.refetch(); }} tz={tz} />
          </TabPanel>
          <TabPanel value="users">
            <UsersTab data={users.data} loading={users.isLoading} tz={tz} onChange={() => { void users.refetch(); void punches.refetch(); }} onSyncAll={async () => {
              const list = devices.data?.items ?? [];
              if (!list.length) { toast.error("Ajoutez d'abord une pointeuse."); return; }
              let ok = 0;
              for (const d of list) { try { await api(`/api/devices/${d.id}/sync`, { body: {}, silent: true }); ok++; } catch {} }
              toast.success(ok ? `Lecture demandée à ${ok} pointeuse(s). Les pointeuses ADMS répondent en quelques secondes.` : "Aucune pointeuse n'a répondu.");
              void users.refetch(); void devices.refetch();
            }} />
          </TabPanel>
        </div>
      </Tabs>
      {exporting && <ExportModal onClose={() => setExporting(false)} />}
    </div>
  );
}

function ExportModal({ onClose }: { onClose: () => void }) {
  const today = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [from, setFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(iso(today));
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" icon={<Download />} title="Exporter les pointages" subtitle="Fichier Excel : date, heure, salarié, matricule, service, centre, ID et nom sur la pointeuse, appareil, type (entrée, sortie, pause…) et mode de vérification."
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button loading={busy} disabled={!from || !to || from > to} onClick={async () => { setBusy(true); try { await download(`/api/punches/export?from=${from}&to=${to}`, `pointages-${from}-au-${to}.xlsx`); onClose(); } catch {} setBusy(false); }}><Download /> Télécharger</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Du" htmlFor="ef"><Input id="ef" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Au" htmlFor="et"><Input id="et" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function DevicesTab({ data, loading, useServerTime, onChange, tz }: { data?: { items: Device[]; admsHost: string; admsPort: number }; loading: boolean; useServerTime: boolean; onChange: () => void; tz: string }) {
  const [serverTime, setServerTime] = useState(useServerTime);
  const [form, setForm] = useState({ name: "", ip: "", port: 4370, password: "" });
  const [tested, setTested] = useState<{ serialNumber: string | null; model: string | null; firmware: string | null; userCount: number | null; logCount?: number | null; fingerprintCount?: number | null; faceCount?: number | null } | null>(null);
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
      await api("/api/devices", { body: { mode: "LAN", name: form.name || `Pointeuse ${form.ip}`, ip: form.ip, port: form.port, commPassword: form.password || null, serialNumber: tested?.serialNumber, model: tested?.model, firmware: tested?.firmware, userCount: tested?.userCount } });
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
  async function action(d: Device, kind: "sync" | "full" | "time" | "rename" | "delete" | "users" | "info" | "reboot") {
    if (kind === "reboot" && !(await confirmDialog({ title: `Redémarrer « ${d.name} » ?`, message: "La pointeuse sera indisponible une minute environ.", confirmLabel: "Redémarrer" }))) return;
    if (kind === "users" || kind === "info" || kind === "reboot") {
      setBusy(d.id + kind);
      try { const r = await api<{ label: string }>(`/api/devices/${d.id}/command`, { body: { kind } }); toast.success(`Commande envoyée : ${r.label}.`, { description: "La pointeuse l'exécute à sa prochaine connexion (quelques secondes)." }); onChange(); } catch {}
      setBusy(null);
      return;
    }
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
      if (kind === "sync" || kind === "full") {
        const r = await api<{ received?: number; created?: number; users?: number; linked?: number; queued?: boolean }>(`/api/devices/${d.id}/sync`, { body: { full: kind === "full" } });
        if (r.queued) toast.success(kind === "full" ? "Demande envoyée : la pointeuse va renvoyer tout son historique et ses utilisateurs." : "Demande envoyée : la pointeuse va envoyer ses utilisateurs et ses nouvelles données.");
        else toast.success(`${r.created} nouveau(x) pointage(s) sur ${r.received} lu(s) · ${r.users} utilisateur(s) lus${r.linked ? ` · ${r.linked} associé(s) automatiquement` : ""}.`);
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
            <span>SN : <b className="font-mono">{tested.serialNumber ?? ""}</b></span>
            <span>Modèle : <b>{tested.model ?? ""}</b></span>
            <span>Utilisateurs : <b className="tabular">{tested.userCount ?? ""}</b></span>
            {tested.fingerprintCount != null && <span>Empreintes : <b className="tabular">{tested.fingerprintCount}</b></span>}
            {tested.faceCount != null && tested.faceCount > 0 && <span>Visages : <b className="tabular">{tested.faceCount}</b></span>}
            {tested.logCount != null && <span>Pointages stockés : <b className="tabular">{tested.logCount}</b></span>}
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
                      <MenuItem icon={<RefreshCw />} onSelect={() => action(d, "sync")}>Synchroniser (utilisateurs + pointages)</MenuItem>
                      <MenuItem icon={<DownloadCloud />} onSelect={() => action(d, "full")}>Récupérer tout l'historique</MenuItem>
                      {d.mode === "ADMS" && <MenuItem icon={<Users />} onSelect={() => action(d, "users")}>Récupérer les utilisateurs</MenuItem>}
                      {d.mode === "ADMS" && <MenuItem icon={<Info />} onSelect={() => action(d, "info")}>Lire les informations</MenuItem>}
                      {d.mode === "LAN" && <MenuItem icon={<Clock />} onSelect={() => action(d, "time")}>Régler l'heure</MenuItem>}
                      {d.mode === "ADMS" && <MenuItem icon={<Power />} onSelect={() => action(d, "reboot")}>Redémarrer</MenuItem>}
                      <MenuItem icon={<Pencil />} onSelect={() => action(d, "rename")}>Renommer</MenuItem>
                      <MenuSeparator />
                      <MenuItem icon={<Trash2 />} danger onSelect={() => action(d, "delete")}>Supprimer</MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
                <DeviceStats d={d} />
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                  <div><dt className="text-xs text-muted">N° de série</dt><dd className="truncate font-mono">{d.serialNumber ?? ""}</dd></div>
                  <div><dt className="text-xs text-muted">Adresse</dt><dd className="truncate font-mono">{d.mode === "LAN" ? `${d.ip}:${d.port}` : (d.reportedIp ?? "")}</dd></div>
                  <div><dt className="text-xs text-muted">Modèle</dt><dd className="truncate">{d.model ?? ""}</dd></div>
                  <div><dt className="text-xs text-muted">Firmware</dt><dd className="truncate">{d.firmware ?? ""}</dd></div>
                  {d.macAddress && <div><dt className="text-xs text-muted">MAC</dt><dd className="truncate font-mono">{d.macAddress}</dd></div>}
                  {d.platform && <div><dt className="text-xs text-muted">Plateforme</dt><dd className="truncate">{d.platform}</dd></div>}
                  <div><dt className="text-xs text-muted">Vue</dt><dd>{relative(d.lastSeenAt)}</dd></div>
                  <div><dt className="text-xs text-muted">Dernière synchro</dt><dd>{relative(d.lastSyncAt)}</dd></div>
                </dl>
                {d.clockDriftSeconds != null && Math.abs(d.clockDriftSeconds) >= 60 && (
                  <div className="mt-3 flex items-center gap-2 rounded-[10px] bg-warning-100 px-3 py-2 text-xs text-[#9a6a00] dark:text-warning"><Clock className="size-3.5 shrink-0" /> L&apos;horloge de la pointeuse a {Math.round(Math.abs(d.clockDriftSeconds) / 60)} min {d.clockDriftSeconds > 0 ? "d'avance" : "de retard"}.{d.mode === "LAN" && <button className="ml-auto cursor-pointer font-semibold underline" onClick={() => action(d, "time")}>Régler</button>}</div>
                )}
                {d.status === "OFFLINE" && d.lastError && <div className="mt-3 rounded-[10px] bg-danger-100 px-3 py-2 text-xs text-danger">{d.lastError}</div>}
                {d.mode === "ADMS" && d.commands.some((c) => c.status === "PENDING" || c.status === "SENT") && (
                  <div className="mt-3 rounded-[10px] bg-info-100 px-3 py-2 text-xs text-info">En attente de la pointeuse : {d.commands.filter((c) => c.status === "PENDING" || c.status === "SENT").map((c) => c.label.toLowerCase()).join(", ")}.</div>
                )}
                <Button size="sm" variant="secondary" className="mt-4 w-full" onClick={() => action(d, "sync")} loading={busy === d.id + "sync"}><RefreshCw /> Synchroniser</Button>
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
                <CopyBox label="Adresse du serveur" value={data?.admsHost ?? ""} />
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

/** Usage of the device memory: users, fingerprints, faces, stored clock-ins. */
function DeviceStats({ d }: { d: Device }) {
  const items: [React.ReactNode, string, number | null, number | null][] = [
    [<Users key="u" />, "Utilisateurs", d.userCount ?? (d._count.users || null), d.userCapacity],
    [<Fingerprint key="f" />, "Empreintes", d.fingerprintCount, d.fingerprintCapacity],
    [<ScanFace key="v" />, "Visages", d.faceCount, null],
    [<History key="l" />, "Pointages stockés", d.logCount, d.logCapacity],
  ];
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      {items.map(([icon, label, v, cap]) => (
        <div key={label} className="rounded-[12px] bg-surface-2 px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs text-muted [&_svg]:size-3.5">{icon}{label}</div>
          <div className="mt-0.5 font-display text-base font-semibold tabular">{v ?? <span className="text-sm font-normal text-muted">Non lu</span>}{cap ? <span className="text-xs font-normal text-muted"> / {cap}</span> : null}</div>
          {cap && v != null ? <div className="mt-1 h-1 overflow-hidden rounded-full bg-border"><div className={cn("h-full rounded-full", v / cap > 0.9 ? "bg-danger" : v / cap > 0.7 ? "bg-warning" : "bg-brand-500")} style={{ width: `${Math.min(100, (v / cap) * 100)}%` }} /></div> : null}
        </div>
      ))}
    </div>
  );
}

function UsersTab({ data, loading, tz, onChange, onSyncAll }: { data?: { rows: UserRow[]; employees: { id: string; name: string; linked: boolean }[] }; loading: boolean; tz: string; onChange: () => void; onSyncAll: () => Promise<void> }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "unlinked" | "linked">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const rows = data?.rows ?? [];
  const empName = new Map((data?.employees ?? []).map((e) => [e.id, e.name]));
  const needle = q.trim().toLowerCase();
  const list = rows.filter((r) => (filter === "all" || (filter === "linked" ? !!r.employee : !r.employee)) && (!needle || `${r.pin} ${r.name ?? ""} ${r.employee?.name ?? ""}`.toLowerCase().includes(needle)));
  const unlinked = rows.filter((r) => !r.employee);
  const withSuggestion = unlinked.filter((r) => r.suggestion);
  const creatable = unlinked.filter((r) => r.name && !r.suggestion);
  const target = (subset: UserRow[]) => (selected.size ? subset.filter((r) => selected.has(r.pin)) : subset);

  async function run(key: string, body: object, msg: (r: { linked?: number; created?: number; skipped?: number }) => string) {
    setBusy(key);
    try { const r = await api<{ linked?: number; created?: number; skipped?: number }>("/api/device-users", { body }); toast.success(msg(r)); setSelected(new Set()); onChange(); } catch {}
    setBusy(null);
  }
  async function link(pin: string, employeeId: string) {
    try {
      const r = await api<{ backfilled: number; warning: string | null }>("/api/device-user-maps", { body: { deviceUserId: pin, employeeId } });
      toast.success(`ID ${pin} associé.${r.backfilled ? ` ${r.backfilled} pointage(s) passé(s) rattaché(s).` : ""}`, { description: r.warning ?? undefined });
      onChange();
    } catch {}
  }
  async function unlink(r: UserRow) {
    if (!(await confirmDialog({ title: `Dissocier l'ID ${r.pin} ?`, message: "Les futurs pointages de cet ID ne seront plus rattachés au salarié.", confirmLabel: "Dissocier" }))) return;
    await api(`/api/device-user-maps?id=${r.employee!.mapId}`, { method: "DELETE" });
    onChange();
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">Les personnes enregistrées dans vos pointeuses</h3>
            <p className="mt-1 text-sm text-muted">Pour chaque ID : le nom saisi sur la pointeuse, ses moyens d&apos;identification et ses pointages. Associez chaque ID à un salarié pour que ses pointages alimentent ses présences et sa paie.</p>
          </div>
          <Button variant="secondary" loading={busy === "sync"} onClick={async () => { setBusy("sync"); await onSyncAll(); setBusy(null); }}><RefreshCw /> Lire les pointeuses</Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[12px] bg-surface-2 px-4 py-3"><div className="text-xs text-muted">IDs connus</div><div className="font-display text-xl font-semibold tabular">{rows.length}</div></div>
          <div className="rounded-[12px] bg-success-100 px-4 py-3"><div className="text-xs text-muted">Associés à un salarié</div><div className="font-display text-xl font-semibold tabular text-success">{rows.length - unlinked.length}</div></div>
          <div className={cn("rounded-[12px] px-4 py-3", unlinked.length ? "bg-warning-100" : "bg-surface-2")}><div className="text-xs text-muted">À associer</div><div className="font-display text-xl font-semibold tabular">{unlinked.length}</div></div>
        </div>
        {unlinked.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => run("auto", { action: "autolink" }, (r) => r.linked ? `${r.linked} ID(s) associé(s) automatiquement (nom ou matricule identique).` : "Aucune correspondance exacte trouvée.")} loading={busy === "auto"}><Sparkles /> Associer automatiquement</Button>
            {withSuggestion.length > 0 && <Button size="sm" variant="secondary" onClick={() => run("accept", { action: "accept", pins: target(withSuggestion).map((r) => r.pin) }, (r) => `${r.linked ?? 0} suggestion(s) acceptée(s).`)} loading={busy === "accept"}><CheckCircle2 /> Accepter les suggestions ({target(withSuggestion).length})</Button>}
            {creatable.length > 0 && <Button size="sm" variant="secondary" onClick={async () => {
              const t = target(creatable);
              if (!(await confirmDialog({ title: `Créer ${t.length} salarié(s) ?`, message: "Un salarié est créé pour chaque ID non associé, avec le nom enregistré sur la pointeuse et l'ID comme matricule. Complétez ensuite leur e-mail, service et contrat dans leur fiche.", confirmLabel: "Créer" }))) return;
              await run("create", { action: "create", pins: t.map((r) => r.pin) }, (r) => `${r.created ?? 0} salarié(s) créé(s) et associé(s).${r.skipped ? ` ${r.skipped} ID(s) sans nom ignoré(s).` : ""}`);
            }} loading={busy === "create"}><UserPlus /> Créer les salariés manquants ({target(creatable).length})</Button>}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-2.5 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un ID ou un nom…" className="pl-9" aria-label="Rechercher" />
          </div>
          <Segmented value={filter} onChange={(v) => { setFilter(v); setSelected(new Set()); }} options={[{ value: "all", label: "Tous", count: rows.length }, { value: "unlinked", label: "À associer", count: unlinked.length }, { value: "linked", label: "Associés", count: rows.length - unlinked.length }]} />
        </div>
        {loading ? <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div> : !list.length ? (
          <EmptyState icon={<Users />} title={rows.length ? "Aucun résultat" : "Aucun utilisateur lu pour l'instant"} action={!rows.length ? <Button onClick={() => void onSyncAll()}><RefreshCw /> Lire les pointeuses</Button> : undefined}>{rows.length ? "Essayez un autre filtre." : "Synchronisez vos pointeuses : les noms et les IDs enregistrés sur chaque appareil apparaîtront ici."}</EmptyState>
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead><tr>
                <th className={cn(th, "w-10 pr-0")}><Checkbox checked={list.length > 0 && list.every((r) => selected.has(r.pin))} onChange={() => setSelected(list.every((r) => selected.has(r.pin)) ? new Set() : new Set(list.map((r) => r.pin)))} aria-label="Tout sélectionner" /></th>
                {["ID", "Nom sur la pointeuse", "Identification", "Pointages", "Salarié associé"].map((h) => <th key={h} className={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.pin} className={cn("hover:bg-surface-2/50", selected.has(r.pin) && "bg-brand-100/40")}>
                    <td className={cn(td, "pr-0")}><Checkbox checked={selected.has(r.pin)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.pin)) n.delete(r.pin); else n.add(r.pin); return n; })} aria-label={`Sélectionner l'ID ${r.pin}`} /></td>
                    <td className={td}><span className={cn("rounded-md px-2 py-0.5 font-mono text-sm font-semibold", r.employee ? "bg-brand-100 text-brand-700 dark:text-brand-400" : "bg-warning-100 text-[#9a6a00] dark:text-warning")}>#{r.pin}</span></td>
                    <td className={td}>
                      <div className="font-medium">{r.name ?? <span className="text-muted">Sans nom</span>}</div>
                      <div className="text-xs text-muted">{r.inDevice ? r.devices.join(", ") : "Vu uniquement dans les pointages"}</div>
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {r.fingerprints > 0 && <StatusPill tone="brand"><Fingerprint className="size-3" /> {r.fingerprints} empreinte{r.fingerprints > 1 ? "s" : ""}</StatusPill>}
                        {r.face && <StatusPill tone="info"><ScanFace className="size-3" /> Visage</StatusPill>}
                        {r.card && <StatusPill><CreditCard className="size-3" /> Carte {r.card}</StatusPill>}
                        {r.password && <StatusPill><KeyRound className="size-3" /> Code</StatusPill>}
                        {r.admin && <StatusPill tone="accent"><ShieldCheck className="size-3" /> Admin</StatusPill>}
                        {!r.fingerprints && !r.face && !r.card && !r.password && !r.admin && null}
                      </div>
                    </td>
                    <td className={td}><div className="tabular">{r.punches}</div><div className="text-xs text-muted">{r.lastPunch ? `dernier : ${frDateTime(r.lastPunch, tz).date} ${timeIn(r.lastPunch, tz)}` : "aucun"}</div></td>
                    <td className={td}>
                      {r.employee ? (
                        <div className="flex items-center gap-2"><Avatar name={r.employee.name} size={26} /><span className="text-sm font-medium">{r.employee.name}</span><button onClick={() => unlink(r)} className="ml-1 grid size-7 cursor-pointer place-items-center rounded-full text-muted hover:bg-danger-100 hover:text-danger" aria-label={`Dissocier l'ID ${r.pin}`}><X className="size-3.5" /></button></div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {r.suggestion && <Button size="sm" variant="subtle" onClick={() => link(r.pin, r.suggestion!)}><Link2 /> {empName.get(r.suggestion)}</Button>}
                          <Select className="h-8 w-48 text-[13px]" defaultValue="" onChange={(e) => e.target.value && link(r.pin, e.target.value)} aria-label={`Associer l'ID ${r.pin}`}>
                            <option value="">{r.suggestion ? "Autre salarié…" : "Associer à…"}</option>
                            {data?.employees.filter((e) => !e.linked).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </Select>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
