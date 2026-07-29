/* ============================================================
   Service worker — the app opens with no network.

   The shell (page, styles, scripts, icons) is cached on install and
   served from there. API calls are never cached: they either reach the
   server or fail, and api.js falls back to the copy of the kitchen it
   keeps on the device.
   ============================================================ */
const VERSION = 'chakula-v3';
const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/api.js',
  '/app.js',
  '/register-sw.js',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // fonts and videos go straight out
  if (url.pathname.startsWith('/api/')) return;      // never cache anyone's kitchen

  /* Network first for the page itself, so a deployed change is picked up as
     soon as there is a connection; cache is the fallback when there is none. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((hit) => hit || caches.match('/')))
    );
    return;
  }

  /* Everything else: serve from cache, refresh it in the background. */
  event.respondWith(
    caches.match(request).then((hit) => {
      const live = fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || live;
    })
  );
});
