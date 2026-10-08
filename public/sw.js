/// <reference lib="webworker" />
/* Bump the version whenever the offline shell or its assets change. */
const sw = /** @type {ServiceWorkerGlobalScope} */ (
  /** @type {unknown} */ (self)
);
const CACHE = "fon-pwa-v1";
const SHELL = [
  "/offline.html",
  "/offline.js",
  "/offline.css",
  "/pwa-192.png",
  "/pwa-512.png",
  "/pwa-maskable-512.png",
  "/apple-touch-icon.png",
];

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("fon-pwa-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Never cache API responses, auth requests, streamed RSC data, or private HTML.
  if (
    request.method !== "GET" ||
    url.origin !== sw.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/trpc/")
  )
    return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.status < 500) return response;
          return (
            (await caches.match("/offline.html", { cacheName: CACHE })) ??
            response
          );
        })
        .catch(
          async () =>
            (await caches.match("/offline.html", { cacheName: CACHE })) ??
            new Response("Raspored trenutno nije dostupan.", { status: 503 }),
        ),
    );
  } else if (
    SHELL.includes(url.pathname) ||
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          event.waitUntil(cache.put(request, response.clone()));
        }
        return response;
      }),
    );
  }
});
