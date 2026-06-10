// accountant Service-Worker
// Online-only PWA: cacht nur App-Shell, /api/ immer network-only.
// CACHE-Name enthält Version damit alte Caches bei Deploy invalidiert werden.

const CACHE = 'accountant-v0.48.24-a';
const APP_SHELL = ['/', '/m/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API + Server-Endpoints immer frisch holen
  if (url.pathname.startsWith('/api/')) return;

  // Nur GETs cachen (POST/PUT/DELETE nicht)
  if (event.request.method !== 'GET') return;

  // Cache-first mit Network-Fallback und Cache-Update bei Erfolg
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone));
        }
        return resp;
      });
      return cached || network;
    })
  );
});
