const CACHE_NAME = 'routelogix-enterprise-v29-offline';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE_ASSETS);
      // Intentar cachear CDNs sin fallar la instalación si la señal es débil
      for (const url of CDN_ASSETS) {
        try {
          const req = new Request(url, { mode: 'no-cors' });
          const res = await fetch(req);
          await cache.put(url, res);
        } catch (e) {
          console.warn('CDN no disponible en instalación:', url);
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estrategia Cache-First con actualización en segundo plano para arranque instantáneo sin señal
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        // Actualizar caché en segundo plano si hay red
        fetch(event.request)
          .then((networkRes) => {
            if (networkRes && (networkRes.status === 200 || networkRes.type === 'opaque')) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkRes.clone()));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      // Si no está en caché, intentar red con timeout rápido de 3 segundos
      return Promise.race([
        fetch(event.request).then((networkRes) => {
          if (networkRes && (networkRes.status === 200 || networkRes.type === 'opaque')) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkRes;
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout')), 3000))
      ]).catch(() => {
        // Si es navegación HTML, devolver index.html desde caché
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 408, statusText: 'Offline' });
      });
    })
  );
});
