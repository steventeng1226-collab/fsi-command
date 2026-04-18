const CACHE_NAME = 'fsi-command-v3'
const STATIC_ASSETS = [
  '/fsi-command/',
  '/fsi-command/index.html',
  '/fsi-command/manifest.json',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // 外部 API 一律走網路
  if (!url.hostname.includes('github.io')) {
    event.respondWith(fetch(event.request).catch(() => new Response('Offline', {status:503})))
    return
  }

  // App shell: network first，失敗才用快取
  event.respondWith(
    fetch(event.request).then(response => {
      // 只快取成功的回應
      if (response.status === 200 && event.request.method === 'GET') {
        const clone = response.clone()
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone))
      }
      return response
    }).catch(() => {
      return caches.match(event.request).then(cached => {
        if (cached) return cached
        return caches.match('/fsi-command/index.html')
      })
    })
  )
})
