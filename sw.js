/* Caches the phone page only. The herd file is never cached here. */
const CACHE = "cattle-phone-shell-v6";
const SHELL = [
  "./index.html",
  "./setup.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/app.mjs",
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
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
});
