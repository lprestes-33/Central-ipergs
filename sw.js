// ═══════════════════════════════════════════════
//  Central IPÊ — Service Worker v1.5
//  Cache offline + estratégia network-first
// ═══════════════════════════════════════════════

const CACHE_NAME = 'central-ipe-v1.5';
const CACHE_STATIC = 'central-ipe-static-v1.5';

// Recursos locais sempre cacheados
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg'
];

// CDNs externas cacheadas
const CDN_ASSETS = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
];

// ── INSTALL ─────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando v1.5...');
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(CACHE_STATIC);
      // Cache arquivos locais (crítico)
      await staticCache.addAll(STATIC_ASSETS);

      // Cache CDNs (opcional, falha silenciosa)
      const cdnCache = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        CDN_ASSETS.map(url => cdnCache.add(url).catch(() => {}))
      );

      console.log('[SW] Cache preenchido');
      await self.skipWaiting();
    })()
  );
});

// ── ACTIVATE ────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando...');
  event.waitUntil(
    (async () => {
      // Remove caches antigos
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CACHE_STATIC)
          .map(k => caches.delete(k))
      );
      await self.clients.claim();
      console.log('[SW] Ativo e controlando');
    })()
  );
});

// ── FETCH ────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Firebase Realtime DB — sempre network (dados em tempo real)
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('firebase.com')) {
    event.respondWith(fetch(request).catch(() => new Response('offline', { status: 503 })));
    return;
  }

  // Arquivos locais — Cache First (app shell)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_STATIC).then(c => c.put(request, clone));
          }
          return response;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // CDNs externas — Stale While Revalidate
  if (url.hostname.includes('gstatic.com') ||
      url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(request).then(cached => {
        const fetchPromise = fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Tudo mais — Network first
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// ── PUSH NOTIFICATION (futuro) ───────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  self.registration.showNotification(data.title || 'Central IPÊ', {
    body: data.body || 'Nova notificação',
    icon: './icon-192.svg',
    badge: './icon-192.svg',
    tag: 'central-ipe',
    renotify: true
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('./index.html'));
});
