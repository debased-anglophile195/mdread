/* Markread service worker — offline app shell.
   Strategy: stale-while-revalidate for same-origin GETs. The page paints
   instantly from cache, while a fresh copy is fetched in the background and
   used on the next load. This keeps the app offline-capable without the
   "stuck on an old version" trap of a pure cache-first shell. */
const CACHE = "markread-v2";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./vendor/marked.min.js",
  "./vendor/purify.min.js",
  "./vendor/highlight.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Don't touch cross-origin (e.g. Google Fonts) — let the network/browser cache handle it.
  if (url.origin !== location.origin) return;

  // Stale-while-revalidate: serve cache now, refresh it in the background.
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached || cache.match("./index.html"));
      return cached || network;
    })
  );
});
