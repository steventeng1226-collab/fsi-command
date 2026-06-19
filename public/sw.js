// FSI Command App Shell Service Worker
// 只快取 App Shell（HTML/JS/CSS），不攔截 API 或 MP3
// MP3 由 App 自行用 IndexedDB 快取

const CACHE_NAME = 'fsi-shell-v1'

// App Shell 資源（Vite build 輸出）
const SHELL_URLS = [
  '/fsi-command/',
  '/fsi-command/index.html',
]

// ── Install：預快取 App Shell ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_URLS).catch(err => {
        console.warn('[SW] Shell 預快取部分失敗', err)
      })
    }).then(() => self.skipWaiting())
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

// ── Fetch：只對 App Shell 做 Cache First；其他全部走網路 ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // 只攔截同源的 HTML 請求（App Shell）
  const isShell = (
    url.origin === self.location.origin &&
    (url.pathname === '/fsi-command/' ||
     url.pathname === '/fsi-command/index.html' ||
     url.pathname.startsWith('/fsi-command/assets/'))
  )

  if (!isShell) {
    // 其他（API、MP3、GAS）全部直接走網路
    return
  }

  // Cache First → 網路更新
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone))
        }
        return response
      }).catch(() => cached) // 離線時 fallback 到快取

      return cached || networkFetch
    })
  )
})
