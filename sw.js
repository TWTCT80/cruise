// Network-first service worker: always ask the server for the newest files
// (revalidating past GitHub Pages' 10-minute cache), fall back to the last
// copy only when offline. Keeps phone testing on the latest build.
const CACHE = 'cruise-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch {
      const hit = await caches.match(req);
      if (hit) return hit;
      throw new Error('offline and not cached');
    }
  })());
});
