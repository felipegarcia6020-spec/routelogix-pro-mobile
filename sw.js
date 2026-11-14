const CACHE_NAME = 'routelogix-static-cache-v9';
const CORE_ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Solo limpia cachés de archivos estáticos antiguos; nunca toca localStorage ni IndexedDB
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('routelogix-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;

  // Para mosaicos de mapas: Cache-First para soporte offline fluido
  if (url.includes('tile.openstreetmap.org') || url.includes('basemaps.cartocdn.com')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // Para archivos de la app (HTML/JS/CSS): Network-First para actualizar sin perder sesión
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
