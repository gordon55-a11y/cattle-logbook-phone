/* Caches the phone page only. The herd file is never cached here. */
const CACHE = "cattle-phone-shell-v11";
const SHELL = [
  "./index.html",
  "./setup.html",
  "./manifest.webmanifest",
  "./css/app.css?v=11",
  "./js/app.mjs?v=11",
  "./js/auth.mjs",
  "./js/book.mjs",
  "./js/clone.mjs",
  "./js/config.mjs",
  "./js/find-filter.mjs",
  "./js/graph.mjs",
  "./js/local-drive.mjs",
  "./js/merge.mjs",
  "./js/path-guard.mjs",
  "./js/rules.mjs",
  "./js/sample.mjs",
  "./js/store.mjs",
  "./js/sync.mjs",
  "./vendor/msal-browser.min.js",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (path) => {
      const response = await fetch(new Request(path, { cache: "reload" }));
      if (!response.ok) throw new Error(`Could not cache ${path}`);
      await cache.put(path, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request.url, { cache: "reload", credentials: "same-origin" });
    if (fresh && fresh.ok) await cache.put(request.url, fresh.clone());
    return fresh;
  } catch {
    const hit = await caches.match(request);
    if (hit) return hit;
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;
  if (url.pathname.endsWith("/sw.js")) return;
  event.respondWith(networkFirst(event.request));
});
