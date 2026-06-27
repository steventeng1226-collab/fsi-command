// FSI Command App Shell Service Worker v3
// Install 時解析 index.html，把所有 assets 一次快取完
const CACHE_NAME = 'fsi-shell-v3'
const BASE = '/fsi-command'

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    // 先快取 index.html
    try {
      const res = await fetch(BASE + '/index.html')
      if (!res.ok) throw new Error('index.html fetch failed')
      await cache.put(BASE + '/index.html', res.clone())
      await cache.put(BASE + '/', res.clone())

      // 解析 index.html，找出所有 assets
      const html = await res.text()
      const assetUrls = []
      const re = /(?:src|href)=["']([^"']+)["']/g
      let m
      while ((m = re.exec(html)) !== null) {
        const u = m[1]
        if (u.startsWith('/fsi-command/assets/')) {
          assetUrls.push(u)
        }
      }

      // 逐一快取 assets
      await Promise.allSettled(
        assetUrls.map(url =>
          fetch(url).then(r => { if (r.ok) cache.put(url, r) }).catch(() => {})
        )
      )
    } catch (err) {
      console.warn('[SW v3] install fetch failed', err)
    }
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  const isShell = (
    url.pathname === BASE + '/' ||
    url.pathname === BASE + '/index.html' ||
    url.pathname.startsWith(BASE + '/assets/')
  )
  if (!isShell) return

  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(e.request).then(cached => {
        if (cached) {
          // 背景更新
          fetch(e.request)
            .then(r => { if (r.ok) cache.put(e.request, r) })
            .catch(() => {})
          return cached
        }
        return fetch(e.request).then(r => {
          if (r.ok) cache.put(e.request, r.clone())
          return r
        })
      })
    )
  )
})
