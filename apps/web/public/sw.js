// YGHR service worker: Web Push notifications + offline shell fallback.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let data = { title: "YGHR", body: "", link: "/" };
  try { data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icons/icon.svg", badge: "/icons/icon.svg", data: { link: data.link } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const link = e.notification.data?.link ?? "/";
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => {
    const c = cs.find((x) => "focus" in x);
    if (c) { c.navigate(link); return c.focus(); }
    return self.clients.openWindow(link);
  }));
});
