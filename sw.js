// ── sw.js — Service Worker for IQ Puzzler Pro PWA ──
// Caches all app assets for offline play.

const CACHE_NAME = 'iq-puzzler-v1';

// Core app files to precache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/game.js',
  '/pieces.js',
  '/solver.js',
  '/solver-worker.js',
  '/challenges.js',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

// ── Install: precache core assets ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaching app shell');
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      // Activate immediately, don't wait for old tabs to close
      return self.skipWaiting();
    })
  );
});

// ── Activate: clean up old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Take control of all open tabs immediately
      return self.clients.claim();
    })
  );
});

// ── Fetch: cache-first strategy for app assets ──
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Only handle same-origin requests
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve from cache, but also update cache in background (stale-while-revalidate)
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Network failed, cached version already served
        });

        return cachedResponse;
      }

      // Not in cache — fetch from network and cache it
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
