// Increase this version for every release that changes a cached shell file.
const STATIC_CACHE = 'jvgh-planning-static-v3-responsive';
const CACHE_PREFIX = 'jvgh-planning-static-';
const APP_SHELL = [
  './index.html', './styles.css', './pwa.css', './pwa.js', './main.js',
  './jvgh-api.js', './jvgh-access-control.js', './shared/jvgh-core.js',
  './vendor/event-calendar.min.css', './vendor/event-calendar.min.js',
  './manifest.webmanifest', './icons/app-icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)));
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
    }).catch(() => caches.match('./index.html')));
    return;
  }

  if (!APP_SHELL.some((asset) => new URL(asset, self.location.href).href === url.href)) return;
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
