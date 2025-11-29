const CACHE_NAME = "sat-pro-complete-root-v1";
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.json",
  "math_level1.json",
  "math_level2.json",
  "math_level3.json",
  "reading_level1.json",
  "reading_level2.json",
  "reading_level3.json",
  "vocab_level1.json",
  "vocab_level2.json",
  "vocab_level3.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then(
      (resp) => resp || fetch(event.request)
    )
  );
});
