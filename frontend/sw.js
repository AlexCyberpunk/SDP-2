// Cache name
const CACHE_NAME = 'sea-distances-v1';

// Files to cache for offline viewing (we cache the shell, not the heavy data yet)
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/style.css',
    '/main.js',
    '/manifest.json'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(URLS_TO_CACHE);
            })
    );
});

// Fetch Event - Serve from Cache if Offline
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                return fetch(event.request).catch(
                    () => console.log('Fetch failed; returning offline page instead.', event.request.url)
                );
            })
    );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
