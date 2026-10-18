// Offline support: the whole app is cached on first visit. Bump VERSION
// whenever you publish changes.
// Run Coach shares this website (and its cache storage), so only caches
// named fuel-coach-* are ever touched here.
const VERSION = 'fuel-coach-v2';
const FONT_CACHE = 'fuel-coach-fonts';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/store.js', 'js/targets.js', 'js/foods.js', 'js/ingredients.js', 'js/recipes.js',
  'js/runlink.js', 'js/scan.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('fuel-coach') && k !== VERSION && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.href.startsWith(self.registration.scope)) {
    e.respondWith(DEV ? networkFirst(req) : staleWhileRevalidate(req, e));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req));
  }
  // Everything else (the food database lookup) goes straight to the network.
});

async function staleWhileRevalidate(req, e) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req)
    .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  if (hit) {
    e.waitUntil(net);
    return hit;
  }
  const res = await net;
  if (res) return res;
  if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
  return Response.error();
}

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
