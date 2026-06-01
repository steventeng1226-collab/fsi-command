// FSI Command App — Service Worker v1.0
// 快取 App 所有資源，支援完全離線使用

const CACHE_NAME = 'fsi-app-v1'

// 需要快取的檔案清單（依你的 GitHub Pages 路徑調整）
const ASSETS = [
  '/',
  '/index.html',
  '/App.jsx',
  // Vite build 輸出的 JS/CSS（deploy 後可在 Network tab 查看實際路徑）
]

// ── 安裝：快取所有靜態資源 ──────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(() => {
        // 部分資源快取失敗時不中斷安裝
      })
    })
  )
  self.skipWaiting()
})

// ── 啟動：清除舊快取 ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// ── 攔截請求：優先快取，失敗才連網 ──────────────────────────────
self.addEventListener('fetch', event => {
  // 只處理 GET 請求，跳過 API 呼叫
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  // 跳過外部 API（Anthropic、Google 等）
  if (!url.origin.includes('github.io') &&
      !url.origin.includes('localhost') &&
      url.protocol !== 'chrome-extension:') return

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached
      return fetch(event.request).then(response => {
        // 成功取得 → 存入快取
        if (response && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      }).catch(() => {
        // 離線且無快取 → 回傳離線頁面（如果有）
        return caches.match('/index.html')
      })
    })
  )
})
