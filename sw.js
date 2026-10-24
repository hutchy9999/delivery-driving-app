// Offline support. With signal, always loads the newest version from the
// server (and saves a copy). Without signal, or if the server takes longer
// than a few seconds, uses the saved copy.
// Bump VERSION when changing the list of files.
const VERSION = 'v18';
const CACHE = 'shift-profit-' + VERSION;
const FILES = ['./', 'index.html', 'style.css', 'calc.js', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];
const TIMEOUT_MS = 4000;

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, so we never save a stale copy.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // 'no-cache' asks the server whether the file changed instead of trusting the HTTP cache.
    const network = fetch(e.request, { cache: 'no-cache' }).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS));
    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;
    } catch {
      // Offline: fall through to the saved copy.
    }
    return (await cache.match(e.request, { ignoreSearch: true })) || network;
  })());
});
