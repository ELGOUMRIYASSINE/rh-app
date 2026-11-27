"use client";
import { toast } from "sonner";

export class HttpError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST" })
    .then((r) => r.ok)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

/** JSON fetch with silent token refresh on 401 and French error messages. */
export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown; form?: FormData; silent?: boolean } = {}): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
    headers: opts.form ? undefined : { "content-type": "application/json" },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  };
  let res = await fetch(url, init);
  if (res.status === 401 && (await tryRefresh())) res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new HttpError(401, "Session expirée");
  }
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("application/json") ? await res.json() : await res.blob();
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? "Une erreur est survenue.";
    if (!opts.silent) toast.error(msg);
    throw new HttpError(res.status, msg, data);
  }
  return data as T;
}

/** Trigger a browser download from an API endpoint (xlsx, pdf, csv, zip). */
export async function download(url: string, fallbackName: string) {
  let res = await fetch(url);
  if (res.status === 401 && (await tryRefresh())) res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    toast.error((data as { error?: string }).error ?? "Téléchargement impossible.");
    return;
  }
  const blob = await res.blob();
  const name = res.headers.get("content-disposition")?.match(/filename="?([^"]+)"?/)?.[1] ?? fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = decodeURIComponent(name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
