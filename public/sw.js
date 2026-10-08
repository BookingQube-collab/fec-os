/* FEC-OS service worker — installability only.
 * Do not intercept Next.js, RSC, or API traffic: a network-first wrapper on
 * every GET adds a hop to every client navigation and can stall prefetch.
 */
const CACHE = "fec-os-shell-v1";
const PRECACHE = ["/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function shouldBypass(request, url) {
  if (request.method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith("/_next/")) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname === "/sw.js") return true;
  if (url.searchParams.has("_rsc")) return true;
  if (request.headers.get("RSC") === "1") return true;
  if (request.headers.get("Next-Router-Prefetch")) return true;
  if (request.headers.get("Next-Router-State-Tree")) return true;
  if (request.mode === "navigate") return true;
  return false;
}

function safePushTarget(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/chat";
  try {
    const target = new URL(value, self.location.origin);
    if (target.origin !== self.location.origin) return "/chat";
    return `${target.pathname}${target.search}`;
  } catch {
    return "/chat";
  }
}

self.addEventListener("push", (event) => {
  let title = "Chat";
  let body = "";
  let url = "/chat";
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === "object") {
      if (typeof data.title === "string" && data.title.trim()) title = data.title.trim().slice(0, 120);
      if (typeof data.body === "string") body = data.body.trim().slice(0, 180);
      url = safePushTarget(data.url);
    }
  } catch {
    title = "Chat";
    body = "";
    url = "/chat";
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safePushTarget(event.notification.data && event.notification.data.url);
  event.waitUntil(self.clients.openWindow(new URL(url, self.location.origin).href));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (shouldBypass(request, url)) return;

  const isIcon = url.pathname === "/icon-192.png" || url.pathname === "/icon-512.png";
  if (!isIcon) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || Promise.reject(new Error("offline")));
      return cached || fetched;
    }),
  );
});
