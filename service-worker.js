// Increase this version for every release that changes a cached shell file.
const STATIC_CACHE = 'jvgh-planning-static-v27-availability-bulk-data';
const CACHE_PREFIX = 'jvgh-planning-static-';
const APP_SHELL = [
  './index.html', './availability.html', './availability.js', './styles.css', './pwa.css', './pwa.js', './main.js',
  './jvgh-api.js', './jvgh-access-control.js', './shared/jvgh-core.js',
  './vendor/event-calendar.min.css', './vendor/event-calendar.min.js',
  './shared/ghost-shifts.js', './availability-month-data.js',
  './availability-filter.js',
  './manifest.webmanifest', './availability.webmanifest'
];
const OPTIONAL_ICON_ASSETS = [
  './icons/jvgh-logo.jpg',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then(async (cache) => {
    await cache.addAll(APP_SHELL);
    await Promise.all(OPTIONAL_ICON_ASSETS.map((asset) => cache.add(asset).catch(() => undefined)));
    await self.skipWaiting();
  }));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE)
      .map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});

function isPrivateOrDynamic(url, request) {
  return request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.includes('/wp-json/') ||
    url.pathname.includes('/wp-admin/') ||
    url.pathname.endsWith('/admin-ajax.php') ||
    /(?:whatsapp|nonce|auth|analytics|track)/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (isPrivateOrDynamic(url, request)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (!response.ok) throw new Error('Navigation response was not successful');
      return response;
    }).catch(() => caches.match(url.pathname.endsWith('/availability.html')
      ? './availability.html'
      : './index.html')));
    return;
  }

  const shellAsset = [...APP_SHELL, ...OPTIONAL_ICON_ASSETS]
    .find((asset) => new URL(asset, self.location.href).href === url.href);
  if (!shellAsset) return;

  // JavaScript and manifests define launch/initialization behaviour. Prefer
  // the deployed version so an installed client cannot remain on stale logic.
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(fetch(request).then((response) => {
      if (!response.ok) throw new Error('Shell response was not successful');
      const copy = response.clone();
      event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)));
      return response;
    }).catch(() => caches.match(request)));
    return;
  }

  if (![...APP_SHELL, ...OPTIONAL_ICON_ASSETS]
    .some((asset) => new URL(asset, self.location.href).href === url.href)) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (!response.ok) return response;
    const copy = response.clone();
    caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
    return response;
  })));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
