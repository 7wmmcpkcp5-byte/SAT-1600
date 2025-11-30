const CACHE_NAME = 'sat-evo-v4.1.0-flat';
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'questions.json',
  'explanations.js',
  'manifest.json',
  'service-worker.js',
  'avatar_phase1.png',
  'avatar_phase2.png',
  'avatar_phase3.png',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req).catch(() => cached)
    )
  );
});
