// Event Horizon demo service worker
// Minimal version: provides install/activate lifecycle so the page is
// installable as a PWA, and handles Web Push so we can stop using Bark.
//
// Versioned cache name lets old workers' caches be cleared on activate.
const CACHE_VERSION = "eridanus-v4";

let appVisible = false;
let lastVisibleAt = 0;
let lastHiddenAt = 0;
const VISIBLE_HEARTBEAT_TTL_MS = 6000;

async function hasVisibleAppClient() {
  const all = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  return all.some((client) => {
    const inApp = client.url && new URL(client.url).pathname.startsWith("/app");
    return inApp && (client.visibilityState === "visible" || client.focused);
  }) || (appVisible &&
    lastVisibleAt > lastHiddenAt &&
    Date.now() - lastVisibleAt < VISIBLE_HEARTBEAT_TTL_MS);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});


self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isAppShell =
    url.origin === self.location.origin &&
    (url.pathname === "/app" ||
      url.pathname === "/eh-demo/" ||
      url.pathname === "/eh-demo/index.html" ||
      url.pathname === "/eh-demo/manifest.webmanifest" ||
      url.pathname === "/eh-demo/sw.js");

  if (isAppShell) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
  }
});

// Frontend tells us visibility state
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "VISIBILITY") {
    const now = Date.now();
    appVisible = !!event.data.visible;
    if (appVisible) lastVisibleAt = now;
    else lastHiddenAt = now;
  }
});

// Web Push: server sends a JSON payload, we show a notification.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "小伊", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "小伊";
  const options = {
    body: data.body || "",
    icon: "/eh-demo/icons/icon-192.png",
    badge: "/eh-demo/icons/icon-192.png",
    tag: data.tag || "chat",
    data: { url: data.url || "/eh-demo/" },
  };
  event.waitUntil(
    (async () => {
      if (await hasVisibleAppClient()) return;
      await self.registration.showNotification(title, options);
    })()
  );
});

// When user taps the notification, focus the app (or open it).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/eh-demo/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const c of all) {
        if (c.url.includes(url) && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })()
  );
});
