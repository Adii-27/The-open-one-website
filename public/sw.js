const CACHE_NAME = 'the-open-one-v3';

const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/pwa-192x192.png',
  '/icons/pwa-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.warn('[SW] Precache asset error:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only process standard GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Ignore non-http(s) schemes (e.g., chrome-extension://, data:)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // STRICT EXCLUSIONS: Never intercept or cache sensitive, payment, or transactional endpoints
  // - Cashfree SDK and payment sessions
  // - All API routes (/api/*) including orders, auth, admin, etc.
  // - Google Identity Services (GSI)
  // - Google Analytics / Tag Manager
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('cashfree.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('googletagmanager.com') ||
    url.hostname.includes('google-analytics.com')
  ) {
    return;
  }

  // 1. Navigation requests (HTML pages) - Network-first with cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || caches.match('/');
          });
        })
    );
    return;
  }

  // 2. Static same-origin assets (scripts, styles, images) - Stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Network failure: return cached if available
            return cachedResponse;
          });

        return cachedResponse || fetchPromise;
      })
    );
  }
});
