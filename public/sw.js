const VERSION = '2026-07-10-pwa-v2';
const CORE_CACHE = `ikona-core-${VERSION}`;
const STATIC_CACHE = `ikona-static-${VERSION}`;
const IMAGE_CACHE = `ikona-images-${VERSION}`;
const PAGE_CACHE = `ikona-pages-${VERSION}`;

const DEFAULT_OFFLINE_URL = '/uk/offline';
const OFFLINE_URLS = ['/uk/offline', '/ru/offline', '/en/offline'];
const CORE_URLS = [
  '/manifest.webmanifest',
  '/pwa/app-icon-192.png',
  '/pwa/app-icon-512.png',
  '/pwa/app-icon-maskable-512.png',
  '/pwa/apple-touch-icon.png',
  '/favicon.ico',
  '/favicon-32.png',
  '/favicon-512.png',
  '/apple-touch-icon.png',
  '/Image-12-июл.-2026-г._-12_33_55.svg'
];

const PAGE_URLS = [
  '/',
  '/uk',
  '/ru',
  '/en',
  '/uk/icons',
  '/uk/prayers',
  '/uk/saints',
  '/uk/gospel',
  '/uk/churches',
  '/uk/offline',
  '/ru/icons',
  '/ru/prayers',
  '/ru/saints',
  '/ru/gospel',
  '/ru/churches',
  '/ru/offline',
  '/en/icons',
  '/en/prayers',
  '/en/saints',
  '/en/gospel',
  '/en/churches',
  '/en/offline'
];

const MAX_IMAGE_ENTRIES = 48;
const PRIVATE_PATH_PATTERN = /^\/(?:api|admin|dashboard|login|auth|account|profile|_next\/webpack-hmr)(?:\/|$)/i;
const SENSITIVE_QUERY_PATTERN = /(?:token|secret|key|session|auth|password|code)=/i;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const coreCache = await caches.open(CORE_CACHE);
    await coreCache.addAll(CORE_URLS);

    const pageCache = await caches.open(PAGE_CACHE);
    await Promise.allSettled([...OFFLINE_URLS, ...PAGE_URLS].map((url) => pageCache.add(url)));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const expectedCaches = new Set([CORE_CACHE, STATIC_CACHE, IMAGE_CACHE, PAGE_CACHE]);
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => expectedCaches.has(name) ? undefined : caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!shouldHandleRequest(request, url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isCoreAsset(url)) {
    event.respondWith(cacheFirst(request, CORE_CACHE));
    return;
  }

  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'font') {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  if (request.destination === 'image') {
    event.respondWith(limitedImageCache(request));
  }
});

function shouldHandleRequest(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (PRIVATE_PATH_PATTERN.test(url.pathname)) return false;
  if (SENSITIVE_QUERY_PATTERN.test(url.search)) return false;
  if (request.headers.get('authorization')) return false;
  return true;
}

function isCoreAsset(url) {
  return (
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/favicon-32.png' ||
    url.pathname === '/favicon-512.png' ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname === '/Image-12-июл.-2026-г._-12_33_55.svg' ||
    url.pathname.startsWith('/pwa/')
  );
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);

  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return await caches.match(offlineUrlFor(request.url)) || await caches.match(DEFAULT_OFFLINE_URL) || new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (isCacheableResponse(response)) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached || Response.error());

  return cached || network;
}

async function limitedImageCache(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    await cache.put(request, response.clone());
    await trimCache(cache, MAX_IMAGE_ENTRIES);
  }
  return response;
}

function isCacheableResponse(response) {
  return response && response.ok && response.type === 'basic';
}

function offlineUrlFor(requestUrl) {
  const { pathname } = new URL(requestUrl);
  const locale = pathname.match(/^\/(uk|ru|en)(?=\/|$)/)?.[1] || 'uk';
  return `/${locale}/offline`;
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await cache.delete(keys[0]);
  await trimCache(cache, maxEntries);
}
