// ═══════════════════════════════════════════════
//  Central IPÊ — Service Worker v2.3
//  Cache offline + estratégia network-first
// ═══════════════════════════════════════════════

const CACHE_NAME = 'central-ipe-v2.3';
const CACHE_STATIC = 'central-ipe-static-v2.3';

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
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js'
];

// ── INSTALL ─────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando v2.0...');
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
      // Notifica todos os clientes abertos para recarregar automaticamente
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      allClients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME }));
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

  // Arquivos locais — Network First para index.html, Cache First para demais
  if (url.origin === self.location.origin) {
    const isHTML = request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/central-ipe/' || url.pathname.endsWith('/');
    if (isHTML) {
      // index.html sempre busca na rede — garante versão atualizada
      event.respondWith(
        fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_STATIC).then(c => c.put(request, clone));
          }
          return response;
        }).catch(() => caches.match('./index.html'))
      );
    } else {
      // Demais assets (ícones, manifest) — Cache First
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
    }
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
  const pacienteId = event.notification.data?.pacienteId;
  const url = pacienteId ? `./index.html#paciente=${pacienteId}` : './index.html';
  event.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      const existing=list.find(c=>c.url.includes('index.html'));
      if(existing){ existing.focus(); return existing.navigate(url); }
      return clients.openWindow(url);
    })
  );
});
