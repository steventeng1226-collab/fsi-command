# FSI Command — 安裝與部署說明

## 本機開發

### 需求
- Node.js 18+ ([下載](https://nodejs.org))

### 啟動步驟
```bash
# 1. 安裝依賴
npm install

# 2. 啟動開發伺服器
npm run dev

# 開啟瀏覽器：http://localhost:5173
```

## 部署（正式上線）

### 選項 A — Netlify（最簡單，免費）
1. 執行 `npm run build` 產生 `dist/` 資料夾
2. 到 [netlify.com](https://netlify.com) → Sites → "drag & drop"
3. 把整個 `dist/` 資料夾拖進去即完成

### 選項 B — Vercel
```bash
npm install -g vercel
npm run build
vercel --prod
```

### 選項 C — GitHub Pages
```bash
npm install --save-dev gh-pages
# 在 package.json scripts 加入：
# "deploy": "gh-pages -d dist"
npm run build
npm run deploy
```

---

## 功能設定

### 取得 Anthropic API Key
1. 到 [console.anthropic.com](https://console.anthropic.com)
2. API Keys → Create Key
3. 複製後貼入 App → Settings → API Key 欄位

### Google Sheets 格式
欄位用 `｜`（全形直槓）分隔：

| 欄位 | 說明 |
|------|------|
| 模式 | `simple` 或 `hard` |
| 情境名稱 | 顯示在卡片上方的標題 |
| 情境提示 | 斜體說明文字（可空白） |
| 句子模板 | 用 `{括號}` 標記空格 |
| 選項欄 1 | 用 `\|` 分隔選項，例：`SMD line\|packaging line\|assembly line` |
| 選項欄 2+ | 後續空格的選項欄，依此類推 |

範例：
```
simple｜Production｜Daily standup｜The {line} runs at {cap}%.｜SMD line|packaging line｜85|90|72
```

Sheets 必須設定為「任何人（知道連結者）→ 檢視者」。

---

## PWA 安裝到手機主畫面
- **iOS Safari**：分享按鈕 → 加入主畫面
- **Android Chrome**：⋮ → 加入主畫面  
  或網址列右側的「安裝」提示

---

## 檔案結構
```
fsi-command/
├── index.html          ← HTML 進入點
├── package.json        ← 依賴設定
├── vite.config.js      ← 建置設定
├── README.md
├── public/
│   ├── manifest.json   ← PWA 安裝設定
│   ├── sw.js           ← Service Worker（離線支援）
│   ├── icon.svg        ← App 圖示
│   └── icon-apple.svg  ← iOS 主畫面圖示
└── src/
    ├── main.jsx        ← React 進入點
    └── App.jsx         ← 主程式（所有功能）
```
