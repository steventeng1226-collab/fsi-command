// ─── FSI Command Service Worker ───────────────────────────────
const CACHE_NAME = 'fsi-command-v1'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.svg',
  '/icon-512.svg',
]

// ── Install: pre-cache static shell ──────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  )
})

// ── Activate: remove old caches ───────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  )
})

// ── Fetch: cache-first for same-origin, network-first for APIs
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Always go network for Anthropic API and external APIs
  if (
    url.hostname === 'api.anthropic.com' ||
    url.hostname === 'api.dictionaryapi.dev' ||
    url.hostname === 'docs.google.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      fetch(request).catch(() => new Response('Network error', { status: 503 }))
    )
    return
  }

  // Cache-first for everything else (app shell, assets)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        // Cache successful GET responses
        if (request.method === 'GET' && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
        }
        return response
      }).catch(() => {
        // Offline fallback: return cached index.html for navigation
        if (request.mode === 'navigate') {
          return caches.match('/index.html')
        }
        return new Response('Offline', { status: 503 })
      })
    })
  )
})
