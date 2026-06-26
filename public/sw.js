// FSI Command App Shell Service Worker v2
// 動態快取所有 App Shell 資源（含 Vite hash assets）
const CACHE_NAME = 'fsi-shell-v2'
const BASE = '/fsi-command'

// ── Install：預快取 index.html + 解析出的所有 assets ──
self.addEventListener('install', e => {
  e.waitUntil(
    fetch(BASE + '/index.html')
      .then(r => r.text())
      .then(html => {
        // 從 index.html 解析出所有 src/href 的 assets 路徑
        const urls = [BASE + '/', BASE + '/index.html']
        const matches = html.matchAll(/(?:src|href)="([^"]+)"/g)
        for (const m of matches) {
          const u = m[1]
          if (u.startsWith('/fsi-command/assets/') || u.startsWith('./assets/')) {
            const path = u.startsWith('./') ? BASE + u.slice(1) : u
            urls.push(path)
          }
        }
        return caches.open(CACHE_NAME).then(cache => {
          return cache.addAll(urls).catch(err => {
            console.warn('[SW] 部分資源快取失敗', err)
          })
        })
      })
      .catch(err => {
        // 離線安裝時 fallback：只快取基本路徑
        console.warn('[SW] Install fetch 失敗，fallback', err)
        return caches.open(CACHE_NAME).then(cache =>
          cache.addAll([BASE + '/', BASE + '/index.html']).catch(() => {})
        )
      })
      .then(() => self.skipWaiting())
  )
})

// ── Activate：清除舊快取 ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

// ── Fetch：Cache First for App Shell；其他走網路 ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  const isShell = (
    url.origin === self.location.origin &&
    (url.pathname === BASE + '/' ||
     url.pathname === BASE + '/index.html' ||
     url.pathname.startsWith(BASE + '/assets/'))
  )
  if (!isShell) return  // API/MP3/GAS 全部直接走網路

  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone))
        }
        return response
      }).catch(() => cached)  // 離線 fallback 到快取
      return cached || networkFetch
    })
  )
})
