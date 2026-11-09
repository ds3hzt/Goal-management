const CACHE = 'goal-app-v10';
const ASSETS = ['./', './index.html', './app.js?v=10', './metrics.js?v=10', './sync-core.js?v=10', './sync.js?v=10',
  './firebase-config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(Promise.all([
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('goal-app-') && key !== CACHE)
    .map(key => caches.delete(key)))), self.clients.claim()
])));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

