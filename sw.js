const CACHE_NAME = 'routelogix-pro-v5';
const coreAssets = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Usar addAll para los recursos locales principales asegurando robustez
      return cache.addAll(coreAssets).catch(err => {
        console.warn('Algunos recursos estáticos no pudieron precargarse:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Evitar interceptar solicitudes de extensiones o métodos no GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Devolver caché y actualizar en segundo plano opcionalmente
        return cachedResponse;
      }
      return fetch(event.request).then(networkResponse => {
        // Almacenar en caché las teselas del mapa o recursos de red dinámicos
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && !event.request.url.includes('openstreetmap.org')) {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
