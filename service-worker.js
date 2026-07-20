const DEFAULT_URL = "./";
const CACHE_PREFIX = "family-app-";
const CACHE_NAME = `${CACHE_PREFIX}20260720-galaxy-v2`;
const APP_SHELL = ["./", "index.html", "styles.css", "config.js", "app.js", "manifest.webmanifest", "galaxy-install.css", "galaxy-install.js", "assets/app-icon-192.svg", "assets/app-icon-512.svg", "assets/family-mascots.webp"];

async function cacheResponse(request, response) {
  if (!response || !response.ok || response.type === "opaque") return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

function offlineResponse(request) {
  return new Response(request.destination === "image" ? "" : "오프라인에서 아직 저장되지 않은 항목입니다.", {
    status: 503,
    statusText: "Offline",
    headers: { "Content-Type": request.destination === "image" ? "image/svg+xml" : "text/plain; charset=utf-8" },
  });
}

async function networkFirst(request) {
  try {
    return await cacheResponse(request, await fetch(request));
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") return (await caches.match("./")) || (await caches.match("index.html")) || offlineResponse(request);
    return offlineResponse(request);
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  const refresh = fetch(request).then((response) => cacheResponse(request, response)).catch(() => null);
  if (cached) {
    refresh.catch(() => null);
    return cached;
  }
  return (await refresh) || offlineResponse(request);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_SHELL.map((url) => cache.add(new Request(url, { cache: "reload" }))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate" || ["script", "style", "manifest"].includes(request.destination)) event.respondWith(networkFirst(request));
  else event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; }
  catch { payload = { body: event.data?.text() || "오늘 일정을 확인해 주세요." }; }
  event.waitUntil(self.registration.showNotification(payload.title || "우리 가족 일정 브리핑", {
    body: payload.body || "오늘 일정을 확인해 주세요.",
    tag: payload.tag || "family-daily-briefing",
    renotify: false,
    icon: "assets/family-mascots.webp",
    badge: "assets/family-mascots.webp",
    data: { url: payload.url || DEFAULT_URL, date: payload.date || "" },
  }));
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
