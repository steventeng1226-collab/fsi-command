// FSI Command App Shell Service Worker v4
// 離線時 fallback 到快取的 index.html
const CACHE_NAME = 'fsi-shell-v4'
const BASE = '/fsi-command'
const INDEX = BASE + '/index.html'

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    try {
      // 快取 index.html
      const res = await fetch(INDEX)
      if (!res.ok) throw new Error('index.html fetch failed')
      await cache.put(INDEX, res.clone())
      await cache.put(BASE + '/', res.clone())

      // 解析 index.html，找出所有 assets
      const html = await res.text()
      const re = /(?:src|href)=["']([^"']+)["']/g
      let m
      const fetches = []
      while ((m = re.exec(html)) !== null) {
        const u = m[1]
        if (u.startsWith('/fsi-command/assets/')) {
          fetches.push(
            fetch(u).then(r => { if (r.ok) cache.put(u, r) }).catch(() => {})
          )
        }
      }
      await Promise.allSettled(fetches)
      console.log('[SW v4] install complete, assets cached')
    } catch (err) {
      console.warn('[SW v4] install failed', err)
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

  e.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(e.request)

    if (cached) {
      // 背景更新
      fetch(e.request)
        .then(r => { if (r.ok) cache.put(e.request, r) })
        .catch(() => {})
      return cached
    }

    try {
      const response = await fetch(e.request)
      if (response.ok) cache.put(e.request, response.clone())
      return response
    } catch {
      // 網路失敗：fallback 到快取的 index.html（不要顯示離線頁面）
      const fallback = await cache.match(INDEX)
      if (fallback) return fallback
      // 最後手段：回傳一個簡單的離線提示（不會跳到 offline.html）
      return new Response('<html><body style="background:#1a1a1a;color:#f90;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><div style="font-size:48px">📱</div><div style="font-size:18px;margin-top:16px">FSI COMMAND</div><div style="font-size:12px;margin-top:8px;color:#888">請先上網開啟一次 App 再離線使用</div></div></body></html>',
        { headers: { 'Content-Type': 'text/html;charset=utf-8' } })
    }
  })())
})

// 接收 App 傳來的 SKIP_WAITING 指令，立即接管
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
