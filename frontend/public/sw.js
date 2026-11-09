// Fleet Transfer — service worker
// Strategy: network-first for navigation, cache-first for static assets.
// Supabase Edge Function calls are always skipped (require network).

const CACHE = 'fleet-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['/']).then(() => self.skipWaiting()))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Only cache GET requests to our own origin
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  // Never intercept Supabase Edge Functions or Next.js internal traffic
  if (url.pathname.startsWith('/functions/v1/')) return;
  if (url.pathname.includes('_next/webpack-hmr')) return;
  if (url.pathname.includes('__nextjs')) return;
  // Next.js JS/CSS chunks are immutable via HTTP cache in production (content-hash filenames)
  // and must NOT be SW-cached in development (they change on every hot reload).
  if (url.pathname.startsWith('/_next/static/')) return;

  if (request.mode === 'navigate') {
    // Navigation: network first with 5 s timeout; fall back to cached page when
    // offline or on a flaky connection.
    e.respondWith(
      new Promise((resolve, reject) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);

        fetch(request, { signal: ctrl.signal })
          .then(r => {
            clearTimeout(timer);
            if (r.ok) {
              const clone = r.clone();
              caches.open(CACHE).then(c => c.put(request, clone));
            }
            resolve(r);
          })
          .catch(() => {
            clearTimeout(timer);
            caches.match(request)
              .then(cached => resolve(cached || caches.match('/')))
              .catch(reject);
          });
      })
    );
  } else {
    // Static assets (icons, manifest, etc.): cache-first.
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE).then(c => c.put(request, clone));
          }
          return r;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
  }
});
