const CACHE_NAME = 'mafia-business-v5';
const APP_SHELL = [
  '/',
  '/offline.html',
  '/css/style.css?v=4.0.0',
  '/css/v4.css?v=4.0.0',
  '/js/platform.js?v=4.0.0',
  '/js/client.js?v=4.0.0',
  '/assets/premium-table-v3.jpg',
  '/assets/mafia-card-back-v3.jpg',
  '/assets/event-card-back-v3.jpg',
  '/assets/app-icon.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/socket.io/') || url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
    return;
  }
  const isCodeAsset = /\.(?:js|css|html|webmanifest)$/.test(url.pathname);
  if (isCodeAsset) {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  })));
});
