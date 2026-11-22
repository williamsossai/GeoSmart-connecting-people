const CACHE_NAME = 'geosmart-shell-v1';
const SHELL_PATH = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(SHELL_PATH, { cache: 'reload' });
    if (!response.ok) throw new Error('Could not cache the GeoSmart app shell.');

    const html = await response.clone().text();
    await cache.put(SHELL_PATH, response);
    await cache.put('/', new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }));

    const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => new URL(match[1], self.location.origin))
      .filter((url) => url.origin === self.location.origin && /\.(?:js|css)(?:$|\?)/i.test(url.pathname + url.search));

    await Promise.all([
      ...assetUrls.map((url) => cache.add(url.href).catch(() => undefined)),
      cache.add('/manifest.webmanifest').catch(() => undefined),
      cache.add('/geosmart-icon.svg').catch(() => undefined),
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('geosmart-shell-') && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return await cache.match(SHELL_PATH) || new Response(
          'GeoSmart is offline. Reconnect to load the app.',
          { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
        );
      }
    })());
    return;
  }

  if (!['script', 'style', 'font', 'image'].includes(request.destination)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  })());
});
