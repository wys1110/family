const DEFAULT_URL = "./";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// Installed iOS apps can keep old versioned assets even after the page reloads.
// Always request the module manifest and the settings polish stylesheet from the network.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const forceNetwork =
    url.pathname.endsWith("/config.js") ||
    url.pathname.endsWith("/settings-layout-polish.css");
  if (!forceNetwork) return;

  event.respondWith(fetch(event.request, { cache: "no-store" }));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; }
  catch { payload = { body: event.data?.text() || "오늘 일정을 확인해 주세요." }; }

  const title = payload.title || "우리 가족 일정 브리핑";
  const options = {
    body: payload.body || "오늘 일정을 확인해 주세요.",
    tag: payload.tag || "family-daily-briefing",
    renotify: Boolean(payload.renotify),
    icon: "assets/family-mascots.webp",
    badge: "assets/family-mascots.webp",
    data: {
      url: payload.url || DEFAULT_URL,
      date: payload.date || "",
      eventId: payload.eventId || "",
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || DEFAULT_URL, self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const sameOrigin = windows.find((client) => new URL(client.url).origin === new URL(targetUrl).origin);
    if (sameOrigin) {
      if ("navigate" in sameOrigin) await sameOrigin.navigate(targetUrl);
      return sameOrigin.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
