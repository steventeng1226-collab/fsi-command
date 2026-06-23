import { useState, useEffect, useRef, useMemo, useCallback } from "react"

// ═══════════════════════════════════════════════════════════════
// GLOBAL STYLES
// ═══════════════════════════════════════════════════════════════
const G = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Cinzel:wght@500;700&family=Crimson+Pro:ital,wght@0,300;0,400;1,300;1,400&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#050810;overscroll-behavior:none;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes micPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}
  @keyframes glow{0%,100%{box-shadow:0 0 0 0 #f5a62330}50%{box-shadow:0 0 16px 4px #f5a62330}}
  .fadeUp{animation:fadeUp 0.3s ease forwards}
  .chip{display:inline-flex;align-items:center;padding:7px 14px;border-radius:20px;border:1px solid #f5a62335;background:#f5a62308;color:#f5a623;font-family:'JetBrains Mono',monospace;font-size:12px;cursor:pointer;transition:all 0.14s;user-select:none;line-height:1}
  .chip:hover{background:#f5a62320;border-color:#f5a62380}
  .chip.sel{background:#f5a623;color:#050810;border-color:#f5a623}
  .btn{padding:11px 18px;border-radius:9px;border:none;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500;cursor:pointer;transition:all 0.14s;letter-spacing:0.05em;line-height:1}
  .btn:active{transform:scale(0.97)}
  .btn:disabled{opacity:0.45;cursor:not-allowed}
  input[type=text],input[type=password],textarea{background:#0d1117;border:1px solid #2d333b;border-radius:8px;color:#e6edf3;font-family:'JetBrains Mono',monospace;font-size:12px;padding:10px 13px;outline:none;width:100%;transition:border-color 0.15s;line-height:1.5}
  input:focus,textarea:focus{border-color:#f5a623}
  textarea{resize:vertical}
  ::-webkit-scrollbar{width:3px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:#2d333b;border-radius:2px}
`

// ═══════════════════════════════════════════════════════════════
// TOKENS
// ═══════════════════════════════════════════════════════════════
const T = {
  bg:     '#050810',
  surf:   '#0d1117',
  surf2:  '#161b22',
  bdr:    '#21262d',
  bdr2:   '#2d333b',
  amber:  '#f5a623',
  amberD: '#f5a62318',
  blue:   '#58a6ff',
  blueD:  '#58a6ff18',
  grn:    '#3fb950',
  grnD:   '#3fb95018',
  red:    '#f85149',
  redD:   '#f8514918',
  txt:    '#e6edf3',
  txt2:   '#aab3be',   // was #8b949e — brighter secondary text
  txt3:   '#7a8390',   // was #484f58 — much more readable on dark bg
}
const MONO = "'JetBrains Mono',monospace"
const SERIF = "'Crimson Pro',Georgia,serif"
const DISP  = "'Cinzel',serif"
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_xBUsiWvvoF8Qz9OczKniddNVENSz8W0ToTrzIw7VVCG3V0MlM85vl8Z1VmuNPS8STg/exec'

// ── 電影音訊雙檔案設定 ────────────────────────────────────────
const JERRY_MP3 = [
  { url: 'https://steventeng1226-collab.github.io/fsi-command/Jerry_1.mp3', start: 0,    end: 2440 }, // Jerry_1 涵蓋到電影2440秒(41:05前)
  { url: 'https://steventeng1226-collab.github.io/fsi-command/Jerry_2.mp3', start: 2440, end: 99999 }, // Jerry_2 實際起點=電影2440秒(41:05對應MP3 00:25)
]
function getJerryMp3(secs) {
  return JERRY_MP3.find(f => secs >= f.start && secs < f.end) ?? JERRY_MP3[0]
}

// ── MP3 IndexedDB 快取（離線使用）──────────────────────────────
const MP3_DB_NAME = 'fsi-mp3-cache'
const MP3_DB_VER  = 1
const MP3_STORE   = 'blobs'

function openMp3DB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(MP3_DB_NAME, MP3_DB_VER)
    req.onupgradeneeded = e => e.target.result.createObjectStore(MP3_STORE)
    req.onsuccess = e => res(e.target.result)
    req.onerror   = e => rej(e.target.error)
  })
}

async function saveMp3ToIDB(url, blob) {
  try {
    const db = await openMp3DB()
    const tx = db.transaction(MP3_STORE, 'readwrite')
    tx.objectStore(MP3_STORE).put(blob, url)
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej })
    db.close()
  } catch(e) { console.warn('[MP3 IDB save]', e) }
}

async function getMp3FromIDB(url) {
  try {
    const db = await openMp3DB()
    const tx = db.transaction(MP3_STORE, 'readonly')
    const blob = await new Promise((res, rej) => {
      const req = tx.objectStore(MP3_STORE).get(url)
      req.onsuccess = () => res(req.result)
      req.onerror   = rej
    })
    db.close()
    return blob ?? null
  } catch(e) { return null }
}

// ═══════════════════════════════════════════════════════════════
// STORAGE  (localStorage — persists across sessions)
// ═══════════════════════════════════════════════════════════════
const stor = {
  async get(k) {
    try {
      const v = localStorage.getItem(k)
      return v ? JSON.parse(v) : null
    } catch { return null }
  },
  async set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)) } catch {}
  }
}

// ═══════════════════════════════════════════════════════════════
// SRS  (simplified SM-2)
// ═══════════════════════════════════════════════════════════════
function srsSchedule(card, q) {
  let { interval = 1, ease = 2.5, reps = 0 } = card
  if (q < 3) {
    reps = 0; interval = 1
  } else {
    reps += 1
    interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(interval * ease)
  }
  ease = Math.max(1.3, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  return { ...card, interval, ease, reps, dueDate: Date.now() + interval * 86400000, lastSeen: Date.now() }
}
// ── 正規化英文句子（重複比對用）────────────────────────────────
function normalizeEn(text) {
  return (text || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
}
function srsSort(items) {
  const now = Date.now()
  return [...(items ?? [])].sort((a, b) => {
    const an = !a.reps, bn = !b.reps
    if (an !== bn) return an ? -1 : 1
    const ad = (a.dueDate ?? 0) <= now, bd = (b.dueDate ?? 0) <= now
    if (ad !== bd) return ad ? -1 : 1
    return (a.dueDate ?? 0) - (b.dueDate ?? 0)
  })
}

// ═══════════════════════════════════════════════════════════════
// TTS
// ═══════════════════════════════════════════════════════════════
// Clean linked_hint notation for TTS — removes ·, ə, IPA chars, uppercase stress, elision parens
function cleanForTTS(text) {
  return text
    .replace(/\{[^}]+\}/g, '')        // remove {blank} entirely
    .replace(/[ABCD]:/g, '')           // dialogue labels
    .replace(/\[[^\]]*\]/g, w => {     // [t'·word] → word only
      const inner = w.slice(1,-1)
      const dot = inner.indexOf('·')
      return dot !== -1 ? inner.slice(dot+1) : inner
    })
    .replace(/\([^)]\)/g, '')          // (t)(d) elision → remove
    .replace(/·/g, ' ')               // liaison dots → space
    .replace(/ə/g, 'a')               // schwa → a
    .replace(/ð/g, 'th')              // ð → th
    .replace(/ɑ/g, 'a').replace(/ɪ/g, 'i').replace(/ʊ/g, 'u').replace(/ŋ/g, 'ng')
    .replace(/tə/g, 'to').replace(/ən/g, 'and')  // restore weak forms
    .replace(/\b([A-Z]{2,})\b/g, w => w.toLowerCase())  // ALL-CAPS words
    .replace(/\b[A-Z]{2,}[a-z]/g, w => w.toLowerCase()) // Mixed like ORder PRIoritize
    .replace(/\s+/g, ' ')
    .replace(/\b([bcdfghjklmnpqrstvwxyz])\b/gi, '$1-') // single consonant → add dash to prevent letter-spelling
    .trim()
}

function speak(text, rate = 0.6) {
  const clean = cleanForTTS(text)
  window.speechSynthesis?.cancel()
  const u = new SpeechSynthesisUtterance(clean)
  u.lang = 'en-US'; u.rate = rate
  window.speechSynthesis?.speak(u)
}

// ═══════════════════════════════════════════════════════════════
// ELEVENLABS TTS  (高品質語音，用於 chunk 按鈕 + 單字騎車)
// Voice: Rachel (en-US, 美式英語，清晰自然)
// 快取：每個文字只呼叫一次 API，存 base64 在 localStorage
// ═══════════════════════════════════════════════════════════════
const ELEVEN_VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // Rachel
const ELEVEN_MODEL    = 'eleven_turbo_v2_5'      // 最快，品質好

async function speakElevenLabs(text, elevenKey, onEnd) {
  if (!elevenKey || !text.trim()) {
    // fallback to browser TTS
    speak(text); onEnd?.(); return
  }
  const clean = cleanForTTS(text)
  const cacheKey = 'fsi:tts:' + btoa(encodeURIComponent(clean)).slice(0, 60)

  // Check cache
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const audio = new Audio('data:audio/mpeg;base64,' + cached)
      audio.onended = () => onEnd?.()
      audio.onerror = () => { speak(text); onEnd?.() }
      audio.play()
      return
    }
  } catch {}

  // Call ElevenLabs API
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': elevenKey,
      },
      body: JSON.stringify({
        text: clean,
        model_id: ELEVEN_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 0.85 }
      })
    })
    if (!r.ok) throw new Error('ElevenLabs ' + r.status)
    const blob = await r.blob()
    const base64 = await new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onload = () => res(reader.result.split(',')[1])
      reader.onerror = rej
      reader.readAsDataURL(blob)
    })
    // Cache it
    try { localStorage.setItem(cacheKey, base64) } catch {}
    const audio = new Audio('data:audio/mpeg;base64,' + base64)
    audio.onended = () => onEnd?.()
    audio.onerror = () => { speak(text); onEnd?.() }
    audio.play()
  } catch(e) {
    // fallback
    speak(text); onEnd?.()
  }
}

// ═══════════════════════════════════════════════════════════════
// LINKED HINT RENDERER
// Format spec:
//   [t'·word]  weak form + liaison  → t' gray, · amber, word normal
//   [ən·word]  weak and + liaison   → same rule
//   ·          liaison point        → amber
//   (t) (d)    elided consonant     → gray parentheses
//   CAPS       stressed syllable    → white bold
// ═══════════════════════════════════════════════════════════════
function renderLinkedHint(hint) {
  if (!hint) return null
  const out = []
  let i = 0
  const s = hint
  while (i < s.length) {
    // [weak·linked] pattern
    if (s[i] === '[') {
      const end = s.indexOf(']', i)
      if (end !== -1) {
        const inner = s.slice(i + 1, end)
        const dot = inner.indexOf('·')
        if (dot !== -1) {
          out.push(<span key={i+'w'} style={{ color:T.txt3, fontSize:'0.9em' }}>{inner.slice(0, dot)}</span>)
          out.push(<span key={i+'d'} style={{ color:T.amber, fontWeight:700 }}>·</span>)
          out.push(<span key={i+'l'}>{inner.slice(dot + 1)}</span>)
        } else {
          out.push(<span key={i}>{inner}</span>)
        }
        i = end + 1; continue
      }
    }
    // (t) (d) elision
    if (s[i] === '(') {
      const end = s.indexOf(')', i)
      if (end !== -1) {
        out.push(<span key={i} style={{ color:T.txt3, fontSize:'0.82em', opacity:0.7 }}>({s.slice(i+1,end)})</span>)
        i = end + 1; continue
      }
    }
    // · liaison dot
    if (s[i] === '·') {
      out.push(<span key={i} style={{ color:T.amber, fontWeight:700 }}>·</span>)
      i++; continue
    }
    // collect regular text chunk
    let j = i
    while (j < s.length && s[j] !== '[' && s[j] !== '(' && s[j] !== '·') j++
    if (j > i) {
      const chunk = s.slice(i, j)
      // uppercase = stress
      chunk.split(/([A-ZÀÁÂÃÄÅÆÇ]{2,})/).forEach((p, pi) => {
        if (/^[A-Z]{2,}$/.test(p)) {
          out.push(<span key={i+'_'+pi} style={{ color:T.txt, fontWeight:700 }}>{p}</span>)
        } else {
          out.push(<span key={i+'_'+pi}>{p}</span>)
        }
      })
      i = j
    } else {
      out.push(<span key={i}>{s[i]}</span>); i++
    }
  }
  return out
}

// Extract playable chunks from linked_hint for individual 🔊 buttons
// Returns array of { label, tts }
// Filters out:
//   1. Chunks containing {slot} placeholders (slot boundary)
//   2. Weak-form-only chunks (ə, tə, ðə, ən etc.) — too short / meaningless alone
//   3. Chunks whose cleaned tts is a single common function word
function extractLiaisonChunks(hint) {
  if (!hint) return []

  // Function words that are meaningless as standalone chunks
  const SKIP_TTS = new Set(['a','the','to','and','of','for','in','on','at','it','is','be','or','an'])

  function isUseful(tts) {
    if (!tts) return false
    // Full clean: remove IPA chars, dots, apostrophes, then check
    const cleaned = tts
      .replace(/·/g, ' ').replace(/'/g, '').replace(/ə/g, 'a')
      .replace(/ð/g, 'th').replace(/\s+/g, ' ').trim()
    if (cleaned.length < 3) return false                        // too short after cleaning
    if (SKIP_TTS.has(cleaned.toLowerCase())) return false       // pure function word
    if (/^[a-z]$/i.test(cleaned)) return false                  // single letter
    // Must contain at least one vowel (real syllable)
    if (!/[aeiou]/i.test(cleaned)) return false
    return true
  }

  function hasSlot(str) {
    return /\{[^}]+\}/.test(str)
  }

  const chunks = []
  const bracketRe = /\[([^\]]+)\]/g
  const dotRe = /(\S+·\S+)/g
  let m
  const seen = new Set()

  // Weak-form prefixes before · — skip if the part after · is also trivial
  // Exception: ən (and) + meaningful word IS worth keeping (e.g. ən·white)
  const ALWAYS_SKIP_WEAK = new Set(['t','t\'','tə','f','f\'','fər','ə','ðə','ð','wəz','wə','həz','həv','bɪn'])

  while ((m = bracketRe.exec(hint)) !== null) {
    const inner = m[1]
    if (hasSlot(inner)) continue
    const dot = inner.indexOf('·')
    const beforeDot = dot !== -1 ? inner.slice(0, dot).replace(/'/g,'').trim().toLowerCase() : ''
    // Skip always-weak prefixes
    if (dot !== -1 && ALWAYS_SKIP_WEAK.has(beforeDot)) continue
    // Skip ən (and) only if the word after · is a trivial function word
    const afterDot = dot !== -1 ? inner.slice(dot + 1) : inner
    const afterClean = cleanForTTS(afterDot).trim()
    if (dot !== -1 && beforeDot === 'ən' && afterClean.length < 4) continue
    const raw = dot !== -1 ? inner.slice(0, dot).replace(/'/g, '') + ' ' + afterDot : inner
    const label = m[0]
    const tts = cleanForTTS(raw.trim())
    if (!seen.has(label) && isUseful(tts)) {
      seen.add(label)
      chunks.push({ label, tts })
    }
  }

  // also pick up word·word patterns outside brackets
  const noBrackets = hint.replace(/\[[^\]]*\]/g, '')
  while ((m = dotRe.exec(noBrackets)) !== null) {
    const raw = m[1]
    if (hasSlot(raw)) continue                        // skip slot-boundary chunks
    const tts = cleanForTTS(m[1].split('·').join(' '))
    if (!seen.has(m[1]) && isUseful(tts)) {
      seen.add(m[1])
      chunks.push({ label: m[1], tts })
    }
  }

  return chunks
}

// ═══════════════════════════════════════════════════════════════
// ── 統一 AI 呼叫（Anthropic / Gemini 切換）──────────────────────
function getAISettings() {
  try { return JSON.parse(localStorage.getItem('fsi:se') || '{}') } catch { return {} }
}

async function callAI(messages, system = '', _unused) {
  if (!navigator.onLine) throw new Error('目前離線（飛航模式），AI 功能需要網路連線')
  const se = getAISettings()
  const provider = se.aiProvider || 'anthropic'

  if (provider === 'gemini') {
    const apiKey = se.geminiKey || ''
    if (!apiKey) throw new Error('請先在 Setup 設定 Gemini API Key')
    const contents = []
    if (system) contents.push({ role:'user', parts:[{ text: system }] }, { role:'model', parts:[{ text:'OK, understood.' }] })
    messages.forEach(m => contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts:[{ text: m.content }] }))
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 1000 } })
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error?.message ?? 'Gemini error ' + r.status)
    return d.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  } else if (provider === 'openai') {
    const raw = await callAIRaw(messages, system)
    return raw.text

  } else {
    // Anthropic（預設）
    const apiKey = se.apiKey || ''
    if (!apiKey) throw new Error('請先在 Setup 設定 Anthropic API Key')
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, system, messages })
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error?.message ?? 'API error ' + r.status)
    return d.content?.[0]?.text ?? ''
  }
}

// ── callAIRaw：回傳完整 { text, finish_reason, usage, _raw } ──
async function callAIRaw(messages, system = '', debugMode = false) {
  if (!navigator.onLine) throw new Error('目前離線，AI 功能需要網路連線')
  const se = getAISettings()
  const apiKey = se.openaiKey || ''
  if (!apiKey) throw new Error('請先在 Setup 設定 OpenAI API Key')

  const msgs = []
  if (system) msgs.push({ role:'system', content: system })
  messages.forEach(m => msgs.push({ role: m.role, content: m.content }))

  // AbortController：30 秒超時保護
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  let r, d
  try {
    r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 2000, messages: msgs }),
      signal: controller.signal
    })
    d = await r.json()
  } catch(e) {
    if (e.name === 'AbortError') throw new Error('請求超時（30秒），請重試')
    throw new Error('網路錯誤：' + e.message)
  } finally {
    clearTimeout(timeoutId)
  }

  console.log('[callAIRaw full response]', JSON.stringify(d, null, 2))
  if (!r.ok) throw new Error(d.error?.message ?? 'OpenAI error ' + r.status)

  const choice = d.choices?.[0]
  const finish_reason = choice?.finish_reason ?? 'unknown'
  const usage = d.usage ?? {}

  // 診斷模式：列出所有 top-level keys 和 choices[0] keys
  if (debugMode) {
    const topKeys = Object.keys(d)
    const choiceKeys = choice ? Object.keys(choice) : []
    const msgKeys = choice?.message ? Object.keys(choice.message) : []
    const allValues = {}
    topKeys.forEach(k => {
      if (k !== 'choices' && k !== 'usage') {
        allValues[`root.${k}`] = String(d[k]).slice(0, 100)
      }
    })
    choiceKeys.forEach(k => {
      if (k !== 'message') {
        allValues[`choices[0].${k}`] = String(choice[k]).slice(0, 100)
      }
    })
    msgKeys.forEach(k => {
      allValues[`choices[0].message.${k}`] = JSON.stringify(choice.message[k]).slice(0, 200)
    })
    Object.keys(usage).forEach(k => {
      allValues[`usage.${k}`] = String(usage[k])
    })
    throw new Error('=== 完整 keys ===\n' + Object.entries(allValues).map(([k,v]) => `${k}: ${v}`).join('\n'))
  }

  // 嘗試所有已知回傳路徑
  const text =
    choice?.message?.content ||
    choice?.message?.reasoning ||
    choice?.message?.reasoning_content ||
    choice?.text ||
    d.output_text ||
    d.output?.[0]?.content?.[0]?.text ||
    d.output?.[0]?.content ||
    d.text ||
    d.summary ||
    null

  if (!text && text !== '') {
    throw new Error('無法解析回傳，完整 JSON：\n' + JSON.stringify(d, null, 2).slice(0, 800))
  }

  return { text: text ?? '', finish_reason, usage, _raw: d }
}

// ── callAIChunked：自動分批處理，合併結果 ─────────────────────
// promptBuilder(lines) → prompt string
// lineParser(raw, offset) → object mapping { [globalIdx]: parsedData }
async function callAIChunked(lines, promptBuilder, lineParser, chunkSize = 10) {
  const results = {}
  const debugInfo = []
  let i = 0

  while (i < lines.length) {
    const chunk = lines.slice(i, i + chunkSize)
    const prompt = promptBuilder(chunk, i)

    let raw = null
    let attempts = 0
    let currentChunkSize = chunkSize

    while (attempts < 3) {
      try {
        const se = getAISettings()
        const provider = se.aiProvider || 'anthropic'

        if (provider === 'openai') {
          const result = await callAIRaw([{ role:'user', content: prompt }])
          debugInfo.push({
            chunk: `${i+1}-${i+currentChunkSize}`,
            finish_reason: result.finish_reason,
            usage: result.usage
          })
          console.log(`[Chunk ${i+1}-${i+currentChunkSize}] finish_reason=${result.finish_reason}`, result.usage)

          if (result.finish_reason === 'length' && currentChunkSize > 5) {
            // token 不夠：縮小到 5 句重試
            console.warn(`Chunk ${i} finish_reason=length，縮小到 5 句重試`)
            currentChunkSize = 5
            attempts++
            continue
          }
          raw = result.text
        } else {
          // Gemini / Anthropic 不需要分批（token 夠用）
          raw = await callAI([{ role:'user', content: prompt }])
        }
        break
      } catch(e) {
        attempts++
        if (e.message?.includes('超時') && currentChunkSize > 3) {
          // 超時：縮小 chunk 重試
          currentChunkSize = Math.max(3, Math.floor(currentChunkSize / 2))
          console.warn(`超時，縮小 chunk 到 ${currentChunkSize} 句重試`)
          continue
        }
        if (attempts >= 3) throw e
        await new Promise(res => setTimeout(res, 1500 * attempts))
      }
    }

    if (raw) {
      const parsed = lineParser(raw, i)
      Object.assign(results, parsed)
    }

    i += currentChunkSize
    // 批次間停頓：避免 rate limit 和避免 rate limit
    if (i < lines.length) await new Promise(res => setTimeout(res, 200))
  }

  console.log('[callAIChunked debug]', debugInfo)
  return { results, debugInfo }
}

// 舊名稱相容（所有 callClaude 呼叫自動走 callAI）
async function callClaude(apiKey, messages, system = '') {
  return callAI(messages, system)
}

// ═══════════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════════
const SEED_S = [
  {
    "id": "s1",
    "mode": "simple",
    "context": "Production Status",
    "hint": "Daily standup — reporting line output",
    "template": "The {line} is running at {capacity}% capacity today.",
    "subs": [
      [
        "SMD line",
        "packaging line",
        "assembly line",
        "coating line"
      ],
      [
        "85",
        "90",
        "72",
        "100",
        "65"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "s2",
    "mode": "simple",
    "context": "Gross Margin",
    "hint": "Presenting Q results to management",
    "template": "Our gross margin {changed} by {amount}% due to {reason}.",
    "subs": [
      [
        "declined",
        "improved",
        "remained stable"
      ],
      [
        "2.3",
        "1.5",
        "4.1",
        "0.8"
      ],
      [
        "higher silver paste cost",
        "product mix shift",
        "volume scale-up",
        "ASP pressure",
        "inventory write-down"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "s3",
    "mode": "simple",
    "context": "Yield Report",
    "hint": "Presenting process quality results",
    "template": "We achieved a {yield}% yield rate on the {product} line this {period}.",
    "subs": [
      [
        "98.2",
        "96.5",
        "99.1",
        "94.3"
      ],
      [
        "0603",
        "beads",
        "CLH",
        "inductor"
      ],
      [
        "week",
        "month",
        "quarter"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "s4",
    "mode": "simple",
    "context": "Quality Issue",
    "hint": "Reporting a defect finding in QC meeting",
    "template": "We found {count} defective units in the {batch}, with a defect rate of {rate}%.",
    "subs": [
      [
        "3",
        "12",
        "47",
        "156"
      ],
      [
        "latest shipment",
        "incoming lot",
        "Q2 batch",
        "sampling group"
      ],
      [
        "0.3",
        "1.2",
        "2.8",
        "0.05"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "s5",
    "mode": "hard",
    "context": "Customer Call",
    "hint": "Negotiating delivery schedule",
    "template": "A: When can we expect the delivery?\nB: We can {deliver} the order by {date}.\nA: Can you {guarantee} that schedule?\nB: Let me {check} with our {team} and confirm by EOD.",
    "subs": [
      [
        "deliver",
        "ship",
        "dispatch",
        "complete"
      ],
      [
        "end of this week",
        "next Monday",
        "the 25th",
        "Friday"
      ],
      [
        "confirm",
        "guarantee",
        "commit to",
        "ensure"
      ],
      [
        "check",
        "verify",
        "confirm",
        "follow up"
      ],
      [
        "production team",
        "plant manager",
        "logistics team",
        "scheduling team"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "s6",
    "mode": "hard",
    "context": "RCA Meeting",
    "hint": "Root cause analysis discussion",
    "template": "A: What caused the margin drop?\nB: The primary driver was {cause}.\nA: When did this start?\nB: We first {noticed} the issue in {period}.\nA: What's the {action}?\nB: We're {measure} to address it.",
    "subs": [
      [
        "higher raw material cost",
        "unfavorable product mix",
        "ASP erosion",
        "volume underabsorption"
      ],
      [
        "noticed",
        "identified",
        "detected",
        "flagged"
      ],
      [
        "early March",
        "Q1",
        "last month",
        "Week 10"
      ],
      [
        "corrective action",
        "mitigation plan",
        "recovery roadmap"
      ],
      [
        "renegotiating supplier contracts",
        "optimizing product mix",
        "raising ASP",
        "reducing fixed cost allocation"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "xl_s0",
    "mode": "simple",
    "context": "Issue",
    "hint": "The main issue is low yield.",
    "template": "The main issue is {blank}.",
    "subs": [
      [
        "yield",
        "cost",
        "delay",
        "manpower",
        "material"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "xl_s1",
    "mode": "simple",
    "context": "Impact",
    "hint": "The impact is mainly from silver price.",
    "template": "The impact is mainly from {blank}.",
    "subs": [
      [
        "silver price",
        "labor cost",
        "downtime",
        "scrap",
        "demand"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "xl_s2",
    "mode": "simple",
    "context": "Status",
    "hint": "The project is on track.",
    "template": "The project is {blank}.",
    "subs": [
      [
        "on track",
        "delayed",
        "behind schedule",
        "at risk",
        "completed"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "xl_s3",
    "mode": "simple",
    "context": "Action",
    "hint": "We need to improve FPY.",
    "template": "We need to improve {blank}.",
    "subs": [
      [
        "FPY",
        "Cpk",
        "yield",
        "efficiency",
        "quality"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "xl_s4",
    "mode": "simple",
    "context": "Timeline",
    "hint": "The target date is next Friday.",
    "template": "The target date is {blank}.",
    "subs": [
      [
        "next Friday",
        "end of month",
        "Q2",
        "this week",
        "TBD"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "xl_s5",
    "mode": "simple",
    "context": "Bottleneck",
    "hint": "The bottleneck is at the winding stage.",
    "template": "The bottleneck is at the {blank} stage.",
    "subs": [
      [
        "winding",
        "coating",
        "assembly",
        "inspection",
        "packaging"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "life_01",
    "mode": "simple",
    "context": "Daily Life",
    "hint": "Someone asks what you had",
    "template": "I had {food} for {meal}.",
    "subs": [
      [
        "rice and soup",
        "noodles",
        "a sandwich",
        "fried rice",
        "sushi",
        "congee",
        "toast"
      ],
      [
        "breakfast",
        "lunch",
        "dinner",
        "brunch"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "life_02",
    "mode": "simple",
    "context": "Daily Life",
    "hint": "Telling someone where you ate",
    "template": "I ate at {place} near {location}.",
    "subs": [
      [
        "a small restaurant",
        "the cafeteria",
        "a noodle shop",
        "a convenience store",
        "home",
        "a coffee shop"
      ],
      [
        "the office",
        "the station",
        "my place",
        "the park",
        "the hospital"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "life_03",
    "mode": "simple",
    "context": "Appointment",
    "hint": "Confirming schedule details",
    "template": "The appointment is at {time} on {day}.",
    "subs": [
      [
        "9 AM",
        "2 PM",
        "10:30",
        "3:30 PM",
        "noon"
      ],
      [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "this weekend"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "life_04",
    "mode": "simple",
    "context": "Daily Request",
    "hint": "Telling someone what you need",
    "template": "I need {item} by {deadline}.",
    "subs": [
      [
        "the documents",
        "your signature",
        "a copy",
        "the receipt",
        "the report",
        "some help",
        "more time"
      ],
      [
        "today",
        "this afternoon",
        "end of day",
        "tomorrow morning",
        "Friday",
        "next week"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "life_05",
    "mode": "simple",
    "context": "Office Task",
    "hint": "Clarifying who needs something",
    "template": "{person} needs the {document} by {time}.",
    "subs": [
      [
        "The manager",
        "Our client",
        "HR",
        "The director",
        "Cliff",
        "My supervisor"
      ],
      [
        "report",
        "proposal",
        "summary",
        "invoice",
        "contract",
        "presentation"
      ],
      [
        "today",
        "tomorrow",
        "end of week",
        "Monday",
        "3 PM"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "life_06",
    "mode": "simple",
    "context": "Phone Call",
    "hint": "Answering who is on the line",
    "template": "{person} from {company} is calling about {topic}.",
    "subs": [
      [
        "Mr. Chen",
        "A client",
        "Someone",
        "Our supplier",
        "The auditor"
      ],
      [
        "YAGEO",
        "the head office",
        "the factory",
        "our partner",
        "procurement"
      ],
      [
        "the order",
        "the shipment",
        "the meeting",
        "the invoice",
        "the quality issue"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "life_07",
    "mode": "simple",
    "context": "Message Relay",
    "hint": "Passing on a message",
    "template": "The message is that {person} will {action} at {time}.",
    "subs": [
      [
        "he",
        "she",
        "the team",
        "the manager",
        "our client"
      ],
      [
        "call back",
        "arrive",
        "send the file",
        "join the meeting",
        "confirm the order"
      ],
      [
        "10 AM",
        "noon",
        "this afternoon",
        "3 PM",
        "tomorrow",
        "end of day"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "life_08",
    "mode": "simple",
    "context": "Deadline Check",
    "hint": "Clarifying when something is needed",
    "template": "I need it by {time} at the {latest}.",
    "subs": [
      [
        "noon",
        "3 PM",
        "end of day",
        "tomorrow morning",
        "Friday"
      ],
      [
        "latest",
        "absolute latest",
        "very latest",
        "most"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "life_09",
    "mode": "simple",
    "context": "Office Intro",
    "hint": "Introducing who is in charge",
    "template": "{person} is in charge of {department} here.",
    "subs": [
      [
        "Mr. Lin",
        "Ms. Wang",
        "Cliff",
        "Our director",
        "The senior manager"
      ],
      [
        "this department",
        "production",
        "quality",
        "finance",
        "the project",
        "the whole team"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "life_10",
    "mode": "simple",
    "context": "Data Presentation",
    "hint": "Explaining a chart or graph",
    "template": "The chart shows that {metric} {trend} by {amount} this {period}.",
    "subs": [
      [
        "revenue",
        "output",
        "yield rate",
        "cost",
        "margin",
        "headcount"
      ],
      [
        "increased",
        "decreased",
        "dropped",
        "improved",
        "remained stable"
      ],
      [
        "5%",
        "10%",
        "2.3%",
        "significantly",
        "slightly"
      ],
      [
        "month",
        "quarter",
        "week",
        "year"
      ]
    ],
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  }
]

const SEED_V = [
  {
    "id": "xl_v0",
    "word": "Utilization",
    "ipa_us": "/ˌjuːtɪlaɪˈzeɪʃən/",
    "def": "利用率",
    "ex": "We need to improve utilization.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "xl_v1",
    "word": "Bottleneck",
    "ipa_us": "/ˈbɒtlnek/",
    "def": "瓶頸",
    "ex": "This machine is a bottleneck.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "xl_v2",
    "word": "Projection",
    "ipa_us": "/prəˈdʒekʃən/",
    "def": "預測",
    "ex": "The projection is below target.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "xl_v3",
    "word": "Mitigate",
    "ipa_us": "/ˈmɪtɪɡeɪt/",
    "def": "降低風險",
    "ex": "We need to mitigate the risk.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "xl_v4",
    "word": "Expedite",
    "ipa_us": "/ˈekspədaɪt/",
    "def": "加速",
    "ex": "Please expedite the shipment.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "xl_v5",
    "word": "Allocation",
    "ipa_us": "/ˌæləˈkeɪʃən/",
    "def": "分配",
    "ex": "We need to discuss allocation.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "xl_v6",
    "word": "Justification",
    "ipa_us": "/ˌdʒʌstɪfɪˈkeɪʃən/",
    "def": "合理說明",
    "ex": "Please provide justification.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv1",
    "word": "audit",
    "ipa_us": "/ˈɔdɪt/",
    "def": "稽核",
    "ex": "Please find the attached file related to the audit action items.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv2",
    "word": "audit findings",
    "ipa_us": "/ˈɔdɪt fˈaɪndɪŋz/",
    "def": "稽核缺失",
    "ex": "Attached is the response to the audit findings, including root cause analysis.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv3",
    "word": "corrective action",
    "ipa_us": "/kɝˈɛktɪv ˈækʃʌn/",
    "def": "矯正措施",
    "ex": "Including the root cause analysis and corrective actions.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv4",
    "word": "root cause",
    "ipa_us": "/rˈut kˈɑz/",
    "def": "根本原因",
    "ex": "The primary root causes are summarized as follows.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv5",
    "word": "preventive",
    "ipa_us": "/prɪvˈɛntɪv/",
    "def": "預防性的",
    "ex": "Move toward system control to reduce manual errors.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv6",
    "word": "system control",
    "ipa_us": "/sˈɪstʌm kʌntrˈoʊl/",
    "def": "系統控管",
    "ex": "Move toward system control to reduce manual errors.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv7",
    "word": "inventory control",
    "ipa_us": "/ˌɪnvʌntˈɔri kʌntrˈoʊl/",
    "def": "存貨控管",
    "ex": "Insufficient internal inventory control mechanisms were identified.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv8",
    "word": "inventory counting",
    "ipa_us": "/ˌɪnvʌntˈɔri kˈaʊntɪŋ/",
    "def": "盤點",
    "ex": "Failure to execute full or high-percentage inventory counts.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv9",
    "word": "standardized procedure",
    "ipa_us": "/stˈændɝdˌaɪzd prʌsˈidʒɝ/",
    "def": "標準化作業",
    "ex": "Lack of standardized operating procedures was noted.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv10",
    "word": "MES system",
    "ipa_us": "/ˈɛm ˈiː ˈɛs sˈɪstʌm/",
    "def": "製造執行系統",
    "ex": "We plan to introduce an MES system to strengthen control.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv11",
    "word": "production line",
    "ipa_us": "/prʌdˈʌkʃʌn lˈaɪn/",
    "def": "生產線",
    "ex": "VN established an MC process production line.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv12",
    "word": "capacity expansion",
    "ipa_us": "/kʌpˈæsʌti ɪkspˈænʃʌn/",
    "def": "產能擴充",
    "ex": "The project is categorized under capacity expansion.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv13",
    "word": "maintenance",
    "ipa_us": "/mˈeɪntʌnʌns/",
    "def": "設備維護",
    "ex": "Overhaul and maintenance were listed as CAPEX categories.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv14",
    "word": "overhaul",
    "ipa_us": "/ˈoʊvɝhˌɔl/",
    "def": "大修",
    "ex": "Overhaul / maintenance projects are included in this cycle.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv15",
    "word": "equipment readiness",
    "ipa_us": "/ɪkwˈɪpmʌnt rˈɛdinʌs/",
    "def": "設備就緒度",
    "ex": "All units must be fully ready before the next audit.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv16",
    "word": "automation readiness",
    "ipa_us": "/ɔtʌmˈeɪʃʌn rˈɛdinʌs/",
    "def": "自動化準備度",
    "ex": "Cisco emphasized automation readiness as a key expectation.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv17",
    "word": "real-time data",
    "ipa_us": "/rˈil tˈaɪm dˈeɪtʌ/",
    "def": "即時數據",
    "ex": "Real-time data management is essential for execution.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv18",
    "word": "quality control",
    "ipa_us": "/kwˈɑlʌti kʌntrˈoʊl/",
    "def": "品質管制",
    "ex": "These are essential foundations for quality control.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv19",
    "word": "continuous improvement",
    "ipa_us": "/kʌntˈɪnjuʌs ˌɪmprˈuvmʌnt/",
    "def": "持續改善",
    "ex": "Continuous improvement remains a core requirement.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv20",
    "word": "FPY",
    "ipa_us": "/ˈɛf ˈpiː ˈwaɪ/",
    "def": "一次良率",
    "ex": "Operational data such as FPY and Cpk must be accumulated.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv21",
    "word": "Cpk",
    "ipa_us": "/ˈsiː/pk//",
    "def": "製程能力指標",
    "ex": "FPY and Cpk are required to demonstrate capability.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv22",
    "word": "mass production",
    "ipa_us": "/mˈæs prʌdˈʌkʃʌn/",
    "def": "量產",
    "ex": "Three months of stable mass production are required.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv23",
    "word": "action item",
    "ipa_us": "/ˈækʃʌn ˈaɪtʌm/",
    "def": "行動項目",
    "ex": "Please check the action item pages at the end of the file.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv24",
    "word": "closure date",
    "ipa_us": "/klˈoʊʒɝ dˈeɪt/",
    "def": "結案日期",
    "ex": "Action item closure dates are listed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv25",
    "word": "equipment configuration",
    "ipa_us": "/ɪkwˈɪpmʌnt kʌnfˌɪɡjɝˈeɪʃʌn/",
    "def": "設備配置",
    "ex": "Process flow and equipment configuration must be aligned.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv26",
    "word": "process flow",
    "ipa_us": "/prˈɑsˌɛs flˈoʊ/",
    "def": "製程流程",
    "ex": "The production line process flow must be replicated.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv27",
    "word": "AI inspection",
    "ipa_us": "/ˈeɪ ˈaɪ ˌɪnspˈɛkʃʌn/",
    "def": "AI 檢測",
    "ex": "Implement AI-based appearance inspection after winding.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv28",
    "word": "AOI",
    "ipa_us": "/ˈeɪ ˈoʊ ˈaɪ/",
    "def": "自動光學檢測",
    "ex": "We propose the purchase of six-sided AOI equipment.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv29",
    "word": "defect detection",
    "ipa_us": "/dˈifɛkt dɪtˈɛkʃʌn/",
    "def": "缺陷檢出",
    "ex": "This will enhance defect detection accuracy.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv30",
    "word": "yield improvement",
    "ipa_us": "/jˈild ˌɪmprˈuvmʌnt/",
    "def": "良率提升",
    "ex": "Overall yield can be improved by approximately 2–3%.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv31",
    "word": "mold shortage",
    "ipa_us": "/mˈoʊld ʃˈɔrtʌdʒ/",
    "def": "模具短缺",
    "ex": "According to the Audit Office’s feedback on the recent mold shortage issue.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv32",
    "word": "operator error",
    "ipa_us": "/ˈɑpɝˌeɪtɝ ˈɛrɝ/",
    "def": "作業員錯誤",
    "ex": "Operator errors in quantity counting and reporting.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv33",
    "word": "quantity counting",
    "ipa_us": "/kwˈɑntʌti kˈaʊntɪŋ/",
    "def": "數量點收／計數",
    "ex": "Errors occurred during quantity counting and reporting.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv34",
    "word": "commingling",
    "ipa_us": "/kɑmˈɪŋɡʌlɪŋ/",
    "def": "混料／混批",
    "ex": "Improper storage resulted in material commingling.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv35",
    "word": "management oversight",
    "ipa_us": "/mˈænʌdʒmʌnt ˈoʊvɝsˌaɪt/",
    "def": "管理監督",
    "ex": "Inadequate management oversight was identified.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv36",
    "word": "Level 2 approval",
    "ipa_us": "/lˈɛvʌl/tˈu/ ʌprˈuvʌl/",
    "def": "Level 2 核准",
    "ex": "Please complete each Level 2 approval and integrate progress into the site report.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv37",
    "word": "CAPEX",
    "ipa_us": "/ˈsiː ˈeɪ ˈpiː ˈiː ˈɛks/",
    "def": "資本支出",
    "ex": "We have to get the PBU CAPEX application ready by the deadline.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv38",
    "word": "IDL",
    "ipa_us": "/ˈaɪ ˈdiː ˈɛl/",
    "def": "間接人力",
    "ex": "Please prepare the CAPEX and IDL application together.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv39",
    "word": "application",
    "ipa_us": "/ˌæplʌkˈeɪʃʌn/",
    "def": "申請",
    "ex": "Please get the application ready for submission.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv40",
    "word": "approval system",
    "ipa_us": "/ʌprˈuvʌl sˈɪstʌm/",
    "def": "核准系統",
    "ex": "The request must be applied through the corporate approval system.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv41",
    "word": "equipment failure",
    "ipa_us": "/ɪkwˈɪpmʌnt fˈeɪljɝ/",
    "def": "設備故障",
    "ex": "Each equipment failure requires the original supplier to perform repairs.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv42",
    "word": "utilization rate",
    "ipa_us": "/jˌutʌlʌzˈeɪʃʌn rˈeɪt/",
    "def": "稼動率",
    "ex": "The shipment volume has reached more than 80% utilization rate.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv43",
    "word": "payback period",
    "ipa_us": "/pˈeɪbˌæk pˈɪriʌd/",
    "def": "投資回收期",
    "ex": "The recalculated payback period is 1.7 months.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv44",
    "word": "simulation template",
    "ipa_us": "/sˌɪmjʌlˈeɪʃʌn tˈɛmplʌt/",
    "def": "模擬模板",
    "ex": "Please refer to the CAPEX payback simulation template.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv45",
    "word": "cash payout projection",
    "ipa_us": "/kˈæʃ pˈeɪˌaʊt prʌdʒˈɛkʃʌn/",
    "def": "現金支出預測",
    "ex": "Please recheck the cash payout projection.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv46",
    "word": "phased purchase",
    "ipa_us": "/fˈeɪzd pˈɝtʃʌs/",
    "def": "分階段採購",
    "ex": "We plan a phased purchase to retain flexibility.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv47",
    "word": "capacity operation",
    "ipa_us": "/kʌpˈæsʌti ˌɑpɝˈeɪʃʌn/",
    "def": "產能運作",
    "ex": "This approach ensures current capacity operation is maintained.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv48",
    "word": "process stability",
    "ipa_us": "/prˈɑsˌɛs stʌbˈɪlɪti/",
    "def": "製程穩定性",
    "ex": "High temperature may affect yield and process stability.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv49",
    "word": "customer acceptance",
    "ipa_us": "/kˈʌstʌmɝ æksˈɛptʌns/",
    "def": "客戶驗收",
    "ex": "The equipment is required to meet customer acceptance standards.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv50",
    "word": "idle equipment",
    "ipa_us": "/ˈaɪdʌl ɪkwˈɪpmʌnt/",
    "def": "閒置設備",
    "ex": "Some equipment has been idle for more than three years.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv52",
    "word": "residual value",
    "ipa_us": "/rɪzˈɪdʒuʌl vˈælju/",
    "def": "殘值",
    "ex": "The residual value will not impact cost or gross margin.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv53",
    "word": "depreciation",
    "ipa_us": "/dɪprˌiʃiˈeɪʃʌn/",
    "def": "折舊",
    "ex": "This will help reduce subsequent depreciation.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv54",
    "word": "cost structure",
    "ipa_us": "/kˈɑst strˈʌktʃɝ/",
    "def": "成本結構",
    "ex": "The change has a positive effect on cost structure.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv55",
    "word": "centralized system",
    "ipa_us": "/sˈɛntrʌlˌaɪzd sˈɪstʌm/",
    "def": "集中化系統",
    "ex": "Approval records were not managed through a centralized system.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv56",
    "word": "audit sampling",
    "ipa_us": "/ˈɔdɪt sˈæmplɪŋ/",
    "def": "稽核抽樣",
    "ex": "Some records were not available for audit sampling.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv57",
    "word": "follow-up action",
    "ipa_us": "/fˈɑloʊ ˈʌp ˈækʃʌn/",
    "def": "後續改善行動",
    "ex": "The issue is included in the follow-up improvement action.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv58",
    "word": "periodic review",
    "ipa_us": "/pˌɪriˈɑdɪk rˌivjˈu/",
    "def": "定期檢討",
    "ex": "The item will be tracked in the periodic review process.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv59",
    "word": "disposal",
    "ipa_us": "/dɪspˈoʊzʌl/",
    "def": "處置",
    "ex": "Work with Procurement to expedite disposal.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv60",
    "word": "revitalization",
    "ipa_us": "/rˌivˌaɪtʌlʌzˈeɪʃʌn/",
    "def": "活化／再利用",
    "ex": "Idle equipment disposal and revitalization are under review.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv61",
    "word": "damaged equipment",
    "ipa_us": "/dˈæmʌdʒd ɪkwˈɪpmʌnt/",
    "def": "損壞設備",
    "ex": "Some damaged equipment remains unprocessed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv62",
    "word": "air compressor",
    "ipa_us": "/ˈɛr kʌmprˈɛsɝ/",
    "def": "空壓機",
    "ex": "The air compressor was damaged and requires further handling.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv63",
    "word": "CAPEX expenditure",
    "ipa_us": "/ˈsiː ˈeɪ ˈpiː ˈiː ˈɛks ɪkspˈɛndʌtʃɝ/",
    "def": "資本支出費用",
    "ex": "The CAPEX expenditure in that year was significant.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv64",
    "word": "monitoring system",
    "ipa_us": "/mˈɑnʌtɝɪŋ sˈɪstʌm/",
    "def": "監控系統",
    "ex": "The oven temperature monitoring system has been completed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv65",
    "word": "project type",
    "ipa_us": "/prˈɑdʒɛkt tˈaɪp/",
    "def": "專案類型",
    "ex": "The project type is classified as business expansion.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv66",
    "word": "procurement",
    "ipa_us": "/proʊkjˈʊrmʌnt/",
    "def": "採購",
    "ex": "Please coordinate with Procurement for the next step.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv67",
    "word": "price approval",
    "ipa_us": "/prˈaɪs ʌprˈuvʌl/",
    "def": "價格審批",
    "ex": "The price approval has been completed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv68",
    "word": "budget",
    "ipa_us": "/bˈʌdʒɪt/",
    "def": "預算",
    "ex": "Please apply the budget using the attached file.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv69",
    "word": "negotiation",
    "ipa_us": "/nɪɡˌoʊʃiˈeɪʃʌn/",
    "def": "議價",
    "ex": "The negotiation history is recorded in the attachment.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv70",
    "word": "RFQ",
    "ipa_us": "/ˈɑr ˈɛf ˈkjuː/",
    "def": "詢價單",
    "ex": "The RFQ number is listed in the form.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv71",
    "word": "supplier",
    "ipa_us": "/sʌplˈaɪɝ/",
    "def": "供應商",
    "ex": "Dear supplier partner, thank you for your cooperation.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv72",
    "word": "on-site audit",
    "ipa_us": "/ˈɑn sˈaɪt ˈɔdɪt/",
    "def": "現場稽核",
    "ex": "The on-site audit was conducted smoothly.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv73",
    "word": "manufacturing site",
    "ipa_us": "/mˌænjʌfˈæktʃɝɪŋ sˈaɪt/",
    "def": "製造地／廠址",
    "ex": "Any change of manufacturing site must be reported.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv74",
    "word": "key process",
    "ipa_us": "/kˈi prˈɑsˌɛs/",
    "def": "關鍵製程",
    "ex": "Changes to key processes require approval.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv75",
    "word": "subcontractor",
    "ipa_us": "/sʌbkˈɑntrˌæktɝ/",
    "def": "分包商",
    "ex": "Changing subcontractors of key processes requires notification.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv76",
    "word": "VCN",
    "ipa_us": "/ˈviː ˈsiː ˈɛn/",
    "def": "變更通知",
    "ex": "The supplier shall issue a VCN through the system.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv77",
    "word": "checklist",
    "ipa_us": "/tʃˈɛklˌɪst/",
    "def": "檢查表",
    "ex": "Please complete the VDA 6.3 checklist.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv78",
    "word": "calibration",
    "ipa_us": "/kˌælʌbrˈeɪʃʌn/",
    "def": "校正",
    "ex": "Calibration records must be prepared for the audit.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv79",
    "word": "QMS",
    "ipa_us": "/ˈkjuː ˈɛm ˈɛs/",
    "def": "品質管理系統",
    "ex": "The audit covers QMS general requirements.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv80",
    "word": "document control",
    "ipa_us": "/dˈɑkjʌmɛnt kʌntrˈoʊl/",
    "def": "文件管制",
    "ex": "Document control is one of the audit items.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv81",
    "word": "raw material management",
    "ipa_us": "/rˈɑ mʌtˈɪriʌl mˈænʌdʒmʌnt/",
    "def": "原物料管理",
    "ex": "Raw material management is reviewed during the audit.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv82",
    "word": "training program",
    "ipa_us": "/trˈeɪnɪŋ prˈoʊɡrˌæm/",
    "def": "訓練計畫",
    "ex": "The training program must be documented.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv83",
    "word": "design review (DR)",
    "ipa_us": "/dɪzˈaɪn rˌivjˈu(ˈdiː ˈɑr)/",
    "def": "設計審查",
    "ex": "Design review is part of the audit scope.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv84",
    "word": "manufacturing readiness review (MRR)",
    "ipa_us": "/mˌænjʌfˈæktʃɝɪŋ rˈɛdinʌs rˌivjˈu(ˈɛm ˈɑr ˈɑr)/",
    "def": "製造就緒審查",
    "ex": "MRR is required before mass production.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv85",
    "word": "change control",
    "ipa_us": "/tʃˈeɪndʒ kʌntrˈoʊl/",
    "def": "變更管制",
    "ex": "Change control procedures must be followed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv86",
    "word": "ECN",
    "ipa_us": "/ˈiː ˈsiː ˈɛn/",
    "def": "工程變更通知",
    "ex": "ECN and PCN management are required.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv87",
    "word": "PCN",
    "ipa_us": "/ˈpiː ˈsiː ˈɛn/",
    "def": "製程／產品變更通知",
    "ex": "PCN management must comply with customer requirements.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv88",
    "word": "SPC",
    "ipa_us": "/ˈɛs ˈpiː ˈsiː/",
    "def": "統計製程管制",
    "ex": "SPC control is part of the quality system.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv89",
    "word": "nonconformity",
    "ipa_us": "/nˌɑnkʌnfˈɔrmʌti/",
    "def": "不符合",
    "ex": "Nonconformity management must be documented.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv90",
    "word": "OCAP",
    "ipa_us": "/ˈoʊ ˈsiː ˈeɪ ˈpiː/",
    "def": "異常應變計畫",
    "ex": "OCAP is required for abnormal situations.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv91",
    "word": "traceability",
    "ipa_us": "/trˌeɪsʌbˈɪlɪti/",
    "def": "可追溯性",
    "ex": "Traceability control is required across the process.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv92",
    "word": "equipment management",
    "ipa_us": "/ɪkwˈɪpmʌnt mˈænʌdʒmʌnt/",
    "def": "設備管理",
    "ex": "Equipment management is reviewed during audits.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv93",
    "word": "reliability test",
    "ipa_us": "/rilˌaɪʌbˈɪlʌti tˈɛst/",
    "def": "可靠度測試",
    "ex": "Reliability test management is handled by the lab.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv94",
    "word": "failure analysis",
    "ipa_us": "/fˈeɪljɝ ʌnˈælʌsʌs/",
    "def": "失效分析",
    "ex": "Failure analysis capability is required.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv95",
    "word": "CIP",
    "ipa_us": "/ˈsiː ˈaɪ ˈpiː/",
    "def": "持續改善計畫",
    "ex": "CIP is part of the continuous improvement effort.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv96",
    "word": "FMEA",
    "ipa_us": "/ˈɛf ˈɛm ˈiː ˈeɪ/",
    "def": "失效模式與效應分析",
    "ex": "FMEA must be completed by the RD team.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv97",
    "word": "process control",
    "ipa_us": "/prˈɑsˌɛs kʌntrˈoʊl/",
    "def": "製程管制",
    "ex": "Process control is required for stable production.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv98",
    "word": "storage control",
    "ipa_us": "/stˈɔrʌdʒ kʌntrˈoʊl/",
    "def": "倉儲／線邊管制",
    "ex": "Storage control in line is part of the audit.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv99",
    "word": "test program (TP)",
    "ipa_us": "/tˈɛst prˈoʊɡrˌæm(ˈtiː ˈpiː)/",
    "def": "測試程式",
    "ex": "Test program management is required.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv100",
    "word": "process recipe",
    "ipa_us": "/prˈɑsˌɛs rˈɛsʌpi/",
    "def": "製程配方／參數",
    "ex": "Process recipe must be properly controlled.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv101",
    "word": "calibration",
    "ipa_us": "/kˌælʌbrˈeɪʃʌn/",
    "def": "校準 / 定標",
    "ex": "Regular calibration of testing equipment is mandatory for ISO compliance.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv103",
    "word": "Lead-time",
    "ipa_us": "/lˈɛd-tˈaɪm/",
    "def": "交期 / 前置時間",
    "ex": "We need to reduce the lead-time for raw material procurement.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv104",
    "word": "preventive maintenance",
    "ipa_us": "/prɪvˈɛntɪv mˈeɪntʌnʌns/",
    "def": "預防性維護 (PM)",
    "ex": "PM must be scheduled during the weekend to avoid downtime.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv105",
    "word": "downtime",
    "ipa_us": "/dˈaʊntˌaɪm/",
    "def": "停機時間",
    "ex": "Unplanned downtime last month resulted in a 15% loss in output.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv106",
    "word": "throughput",
    "ipa_us": "/θrˈupˌʊt/",
    "def": "生產量 / 吞吐量",
    "ex": "Optimizing the assembly sequence will improve the daily throughput.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv107",
    "word": "inventory turnover",
    "ipa_us": "/ˌɪnvʌntˈɔri tˈɝnˌoʊvɝ/",
    "def": "庫存周轉率",
    "ex": "Our goal is to increase inventory turnover to free up working capital.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv108",
    "word": "procurement",
    "ipa_us": "/proʊkjˈʊrmʌnt/",
    "def": "採購",
    "ex": "The procurement department is negotiating better terms with the supplier.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv109",
    "word": "Standard Operating Procedure (SOP)",
    "ipa_us": "/stˈændɝd ˈɑpɝˌeɪtɪŋ prʌsˈidʒɝ(ˈɛs ˈoʊ ˈpiː)/",
    "def": "標準作業程序",
    "ex": "All operators must strictly follow the updated SOP for safety.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv110",
    "word": "Quality Assurance (QA)",
    "ipa_us": "/kwˈɑlʌti ʌʃˈʊrʌns(ˈkjuː ˈeɪ)/",
    "def": "品質保證",
    "ex": "QA team will conduct a random inspection on the final batch.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv111",
    "word": "compliance",
    "ipa_us": "/kʌmplˈaɪʌns/",
    "def": "合規性 / 遵守",
    "ex": "Ensure all chemical storage is in compliance with safety regulations.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv112",
    "word": "defect rate",
    "ipa_us": "/dˈifɛkt rˈeɪt/",
    "def": "不良率",
    "ex": "The defect rate has dropped significantly after the machine overhaul.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv113",
    "word": "logistics",
    "ipa_us": "/lʌdʒˈɪstɪks/",
    "def": "物流",
    "ex": "We are reviewing our logistics partner to ensure timely delivery.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv114",
    "word": "consumables",
    "ipa_us": "/consumables/",
    "def": "耗材",
    "ex": "Please track the usage of welding consumables more accurately.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv115",
    "word": "capacity utilization",
    "ipa_us": "/kʌpˈæsʌti jˌutʌlʌzˈeɪʃʌn/",
    "def": "產能利用率",
    "ex": "Current capacity utilization is at 85%, which is optimal for us.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv116",
    "word": "subcontractor",
    "ipa_us": "/sʌbkˈɑntrˌæktɝ/",
    "def": "包商 / 外協廠商",
    "ex": "The subcontractor failed to meet our quality specifications.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv117",
    "word": "Work-in-Progress (WIP)",
    "ipa_us": "/wˈɝk-ɪn-prˈɑɡrˌɛs(ˈdʌbəl.juː ˈaɪ ˈpiː)/",
    "def": "在製品",
    "ex": "Excess WIP on the floor is causing space management issues.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv118",
    "word": "Lean Manufacturing",
    "ipa_us": "/lˈin mˌænjʌfˈæktʃɝɪŋ/",
    "def": "精實生產",
    "ex": "We are implementing Lean Manufacturing to eliminate waste.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv119",
    "word": "Just-In-Time (JIT)",
    "ipa_us": "/dʒˈʌst-ɪn-tˈaɪm(ˈdʒeɪ ˈaɪ ˈtiː)/",
    "def": "及時管理系統",
    "ex": "JIT delivery helps us minimize onsite storage costs.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv120",
    "word": "Specifications (Specs)",
    "ipa_us": "/spˌɛsʌfʌkˈeɪʃʌnz(spˈɛks)/",
    "def": "規格 / 技術要求",
    "ex": "The finished product does not meet the customer's specs.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv122",
    "word": "Warehouse Management System (WMS)",
    "ipa_us": "/wˈɛrhˌaʊs mˈænʌdʒmʌnt sˈɪstʌm(ˈdʌbəl.juː ˈɛm ˈɛs)/",
    "def": "倉庫管理系統",
    "ex": "The new WMS will automate our stock counting process.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv123",
    "word": "Safety Stock",
    "ipa_us": "/sˈeɪfti stˈɑk/",
    "def": "安全庫存",
    "ex": "Increase the safety stock for critical components due to the port strike.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv124",
    "word": "Outsourcing",
    "ipa_us": "/ˌaʊtsˈɔrsɪŋ/",
    "def": "委外 / 外包",
    "ex": "We are considering outsourcing the PCBA assembly line.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv125",
    "word": "Total Productive Maintenance (TPM)",
    "ipa_us": "/tˈoʊtʌl prʌdˈʌktɪv mˈeɪntʌnʌns(ˈtiː ˈpiː ˈɛm)/",
    "def": "全面生產維護",
    "ex": "TPM involves operators in daily equipment care.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv126",
    "word": "Root Cause Analysis (RCA)",
    "ipa_us": "/rˈut kˈɑz ʌnˈælʌsʌs(ˈɑr ˈsiː ˈeɪ)/",
    "def": "真因分析",
    "ex": "We must perform an RCA to prevent this failure from recurring.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv127",
    "word": "Cycle Time",
    "ipa_us": "/sˈaɪkʌl tˈaɪm/",
    "def": "循環時間 / 工時",
    "ex": "Reducing the cycle time by 2 seconds will boost output by 5%.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv128",
    "word": "Backlog",
    "ipa_us": "/bˈæklˌɑɡ/",
    "def": "積壓待辦之事 / 訂單",
    "ex": "We have a three-week backlog of orders due to raw material shortage.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv129",
    "word": "Bill of Materials (BOM)",
    "ipa_us": "/bˈɪl ˈʌv mʌtˈɪriʌlz(ˈbiː ˈoʊ ˈɛm)/",
    "def": "物料清單",
    "ex": "Please update the BOM to reflect the change in screw size.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv130",
    "word": "Vendor",
    "ipa_us": "/vˈɛndɝ/",
    "def": "供應商 / 賣主",
    "ex": "Evaluation of the new vendor will be completed by Friday.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv131",
    "word": "Discrepancy",
    "ipa_us": "/dɪskrˈɛpʌnsi/",
    "def": "差異 / 不一致",
    "ex": "There is a discrepancy between the packing list and actual stock.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv133",
    "word": "Corrective Action",
    "ipa_us": "/kɝˈɛktɪv ˈækʃʌn/",
    "def": "糾正措施",
    "ex": "Corrective action must be documented in the incident report.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv135",
    "word": "batch",
    "ipa_us": "/bˈætʃ/",
    "def": "一批 / 批次",
    "ex": "This batch of raw material has been quarantined for inspection.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv137",
    "word": "yield",
    "ipa_us": "/jˈild/",
    "def": "產量 / 良率",
    "ex": "The final yield reached 98% after adjusting the temperature.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv138",
    "word": "troubleshooting",
    "ipa_us": "/trˈʌbʌlʃˌutɪŋ/",
    "def": "故障排除",
    "ex": "The maintenance team is currently troubleshooting the hydraulic leak.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv139",
    "word": "Lead Supplier",
    "ipa_us": "/lˈɛd sʌplˈaɪɝ/",
    "def": "主供應商",
    "ex": "They are our lead supplier for all casting components.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv140",
    "word": "shipment",
    "ipa_us": "/ʃˈɪpmʌnt/",
    "def": "出貨 / 運輸的一批貨",
    "ex": "The shipment was delayed due to customs clearance issues.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv141",
    "word": "workforce",
    "ipa_us": "/wˈɝkfˌɔrs/",
    "def": "勞動力 / 全體員工",
    "ex": "We need to train our workforce on the new safety protocols.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv142",
    "word": "redundancy",
    "ipa_us": "/rɪdˈʌndʌnsi/",
    "def": "冗餘 / 備援",
    "ex": "We added a second pump to provide system redundancy.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv143",
    "word": "facility",
    "ipa_us": "/fʌsˈɪlɪti/",
    "def": "設施 / 工廠",
    "ex": "Our Haiphong facility is undergoing an environmental audit.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv144",
    "word": "Man-hour",
    "ipa_us": "/mˈæn-ˈaʊɝ/",
    "def": "工時",
    "ex": "The project took over 500 man-hours to complete.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv145",
    "word": "Six Sigma",
    "ipa_us": "/sˈɪks sˈɪɡmʌ/",
    "def": "六標準差",
    "ex": "We use Six Sigma methodologies to reduce process variation.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv146",
    "word": "Kaizen",
    "ipa_us": "/kaizen/",
    "def": "改善 (持續改進)",
    "ex": "The team's Kaizen suggestion saved us $10k in energy costs.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv148",
    "word": "Component",
    "ipa_us": "/kʌmpˈoʊnʌnt/",
    "def": "零件 / 組件",
    "ex": "These components are sensitive to electrostatic discharge (ESD).",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv149",
    "word": "Breakdown",
    "ipa_us": "/brˈeɪkdˌaʊn/",
    "def": "故障",
    "ex": "Unexpected machine breakdown caused the production delay.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv151",
    "word": "PLC",
    "ipa_us": "/ˈpiː ˈɛl ˈsiː/",
    "def": "可程式控制器",
    "ex": "The PLC automatically stops the machine when an abnormal condition occurs.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv152",
    "word": "stop",
    "ipa_us": "/stˈɑp/",
    "def": "停機",
    "ex": "The machine will stop immediately if a safety alarm is triggered.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv153",
    "word": "soldering",
    "ipa_us": "/sˈɑdɝɪŋ/",
    "def": "焊接",
    "ex": "Soldering temperature must be tightly controlled to ensure product quality.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv154",
    "word": "furnace temperature",
    "ipa_us": "/fˈɝnʌs tˈɛmprʌtʃɝ/",
    "def": "錫爐溫度",
    "ex": "Furnace temperature is monitored continuously during production.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv155",
    "word": "real-time",
    "ipa_us": "/rˈiltˌaɪm/",
    "def": "即時的",
    "ex": "Real-time monitoring helps identify process deviations early.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv156",
    "word": "temperature curve",
    "ipa_us": "/tˈɛmprʌtʃɝ kˈɝv/",
    "def": "溫度曲線",
    "ex": "The temperature curve is stored for traceability and audit review.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv157",
    "word": "data retention",
    "ipa_us": "/dˈeɪtʌ ritˈɛnʃʌn/",
    "def": "數據保存",
    "ex": "Data retention must comply with customer quality requirements.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv158",
    "word": "AOI",
    "ipa_us": "/ˈeɪ ˈoʊ ˈaɪ/",
    "def": "自動光學檢測",
    "ex": "AOI is used to detect appearance defects automatically.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv159",
    "word": "AI",
    "ipa_us": "/ˈeɪ ˈaɪ/",
    "def": "人工智慧",
    "ex": "AI improves inspection accuracy and reduces false rejects.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv160",
    "word": "PAD",
    "ipa_us": "/ˈpiː ˈeɪ ˈdiː/",
    "def": "焊盤",
    "ex": "PAD alignment is verified during the inspection process.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv161",
    "word": "packaging",
    "ipa_us": "/pˈækɪdʒɪŋ/",
    "def": "包裝",
    "ex": "Packaging must follow the approved customer specification.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv162",
    "word": "test data",
    "ipa_us": "/tˈɛst dˈeɪtʌ/",
    "def": "測試數據",
    "ex": "Test data is reviewed by the quality engineering team.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv163",
    "word": "key characteristic",
    "ipa_us": "/kˈi kˌɛrʌktɝˈɪstɪk/",
    "def": "關鍵特性",
    "ex": "Key characteristics are defined in the control plan.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv164",
    "word": "upload",
    "ipa_us": "/ˈʌplˌoʊd/",
    "def": "上傳",
    "ex": "Production data is uploaded to the SPC system automatically.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv165",
    "word": "SPC software",
    "ipa_us": "/ˈɛs ˈpiː ˈsiː sˈɔftwˌɛr/",
    "def": "SPC軟體",
    "ex": "SPC software is used to monitor process trends.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv166",
    "word": "process capability",
    "ipa_us": "/prˈɑsˌɛs kˌeɪpʌbˈɪlʌti/",
    "def": "製程能力",
    "ex": "Process capability meets the customer acceptance criteria.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv167",
    "word": "stability",
    "ipa_us": "/stʌbˈɪlɪti/",
    "def": "穩定性",
    "ex": "Long-term stability was confirmed through data analysis.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv168",
    "word": "engineering installation",
    "ipa_us": "/ˈɛndʒʌnˈɪrɪŋ ˌɪnstʌlˈeɪʃʌn/",
    "def": "工程安裝",
    "ex": "Engineering installation was completed according to the project plan.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv169",
    "word": "automated",
    "ipa_us": "/ˈɔtʌmˌeɪtɪd/",
    "def": "自動化的",
    "ex": "The production line is highly automated.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv170",
    "word": "senior management alignment",
    "ipa_us": "/sˈinjɝ mˈænʌdʒmʌnt ʌlˈaɪnmʌnt/",
    "def": "高層共識",
    "ex": "Senior management alignment is required before major investment decisions.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv171",
    "word": "investment estimate",
    "ipa_us": "/ˌɪnvˈɛstmʌnt ˈɛstʌmʌt/",
    "def": "投資估算",
    "ex": "The investment estimate was reviewed and approved.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv172",
    "word": "production champion",
    "ipa_us": "/prʌdˈʌkʃʌn tʃˈæmpiʌn/",
    "def": "生產負責人",
    "ex": "A production champion was assigned to lead the project.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv173",
    "word": "cross-fab project",
    "ipa_us": "/krˈɔs-fˈæb prˈɑdʒɛkt/",
    "def": "跨廠專案",
    "ex": "This is a cross-fab project involving multiple sites.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv174",
    "word": "engineering resources",
    "ipa_us": "/ˈɛndʒʌnˈɪrɪŋ rˈisɔrsɪz/",
    "def": "工程資源",
    "ex": "Engineering resources are currently limited.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv175",
    "word": "sample fabrication",
    "ipa_us": "/sˈæmpʌl fˌæbrɪkˈeɪʃʌn/",
    "def": "樣品製作",
    "ex": "Sample fabrication is ongoing for validation purposes.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv176",
    "word": "production transfer",
    "ipa_us": "/prʌdˈʌkʃʌn trænsfˈɝ/",
    "def": "產線移轉",
    "ex": "Production transfer is planned for next quarter.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv177",
    "word": "lead time",
    "ipa_us": "/lˈɛd tˈaɪm/",
    "def": "交期",
    "ex": "The supplier confirmed the lead time.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv178",
    "word": "MOQ",
    "ipa_us": "/ˈɛm ˈoʊ ˈkjuː/",
    "def": "最小訂購量",
    "ex": "The MOQ is set at ten thousand units.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv179",
    "word": "SPQ",
    "ipa_us": "/ˈɛs ˈpiː ˈkjuː/",
    "def": "標準包裝量",
    "ex": "SPQ must be followed during shipment.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv180",
    "word": "reschedule window",
    "ipa_us": "/riskˈɛdʒul wˈɪndoʊ/",
    "def": "改期窗口",
    "ex": "The reschedule window is limited by contract terms.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv181",
    "word": "cancellation window",
    "ipa_us": "/kˌænsʌlˈeɪʃʌn wˈɪndoʊ/",
    "def": "取消窗口",
    "ex": "The cancellation window has already passed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv182",
    "word": "NCNR",
    "ipa_us": "/ˈɛn ˈsiː ˈɛn ˈɑr/",
    "def": "不可取消不可退貨",
    "ex": "This purchase order is NCNR.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv183",
    "word": "COO",
    "ipa_us": "/ˈsiː ˈoʊ ˈoʊ/",
    "def": "原產地",
    "ex": "COO information must be declared on shipping documents.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv184",
    "word": "HS Code",
    "ipa_us": "/ˈeɪtʃ ˈɛs kˈoʊd/",
    "def": "HS編碼",
    "ex": "HS Code is required for customs clearance.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv185",
    "word": "ECCN",
    "ipa_us": "/ˈiː ˈsiː ˈsiː ˈɛn/",
    "def": "出口管制碼",
    "ex": "ECCN classification has been confirmed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv186",
    "word": "invoice",
    "ipa_us": "/ˈɪnvɔɪs/",
    "def": "發票",
    "ex": "The invoice was issued after shipment.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv187",
    "word": "CofC",
    "ipa_us": "/cofc/",
    "def": "合格證明",
    "ex": "CofC must be provided with each shipment.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv188",
    "word": "payment delay",
    "ipa_us": "/pˈeɪmʌnt dɪlˈeɪ/",
    "def": "付款延遲",
    "ex": "Incorrect documentation may cause payment delay.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv189",
    "word": "date code",
    "ipa_us": "/dˈeɪt kˈoʊd/",
    "def": "日期碼",
    "ex": "Date code control is required by the customer.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv190",
    "word": "shipment",
    "ipa_us": "/ʃˈɪpmʌnt/",
    "def": "出貨",
    "ex": "The shipment is scheduled for next week.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv191",
    "word": "mix",
    "ipa_us": "/mˈɪks/",
    "def": "混放",
    "ex": "Do not mix different date codes in one package.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv192",
    "word": "package",
    "ipa_us": "/pˈækʌdʒ/",
    "def": "包裝",
    "ex": "The package type is reel.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv193",
    "word": "PCN",
    "ipa_us": "/ˈpiː ˈsiː ˈɛn/",
    "def": "變更通知",
    "ex": "PCN must be communicated in advance.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv194",
    "word": "EOL",
    "ipa_us": "/ˈiː ˈoʊ ˈɛl/",
    "def": "停產通知",
    "ex": "An EOL notice was issued to customers.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv195",
    "word": "supplier quality requirements",
    "ipa_us": "/sʌplˈaɪɝ kwˈɑlʌti rɪkwˈaɪrmʌnts/",
    "def": "供應商品質要求",
    "ex": "Suppliers must follow defined quality requirements.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv196",
    "word": "audit agenda",
    "ipa_us": "/ˈɔdɪt ʌdʒˈɛndʌ/",
    "def": "稽核議程",
    "ex": "The audit agenda was shared before the meeting.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv197",
    "word": "package review",
    "ipa_us": "/pˈækʌdʒ rˌivjˈu/",
    "def": "文件審查",
    "ex": "The QMS package review is scheduled this week.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv198",
    "word": "issue refresh",
    "ipa_us": "/ˈɪʃu rɪfrˈɛʃ/",
    "def": "問題更新",
    "ex": "An issue refresh was provided to management.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv199",
    "word": "line audit",
    "ipa_us": "/lˈaɪn ˈɔdɪt/",
    "def": "產線稽核",
    "ex": "A line audit will be conducted tomorrow.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv200",
    "word": "timetable",
    "ipa_us": "/tˈaɪmtˌeɪbʌl/",
    "def": "時程表",
    "ex": "The timetable has been confirmed and shared with all teams.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv201",
    "word": "OEE",
    "ipa_us": "/ˈoʊ ˈiː ˈiː/",
    "def": "設備綜合效率",
    "ex": "OEE is used to evaluate overall equipment performance.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv202",
    "word": "downtime",
    "ipa_us": "/dˈaʊntˌaɪm/",
    "def": "停機時間",
    "ex": "Unexpected downtime impacted daily output.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv203",
    "word": "breakdown",
    "ipa_us": "/brˈeɪkdˌaʊn/",
    "def": "設備故障",
    "ex": "The breakdown occurred during night shift operation.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv204",
    "word": "MTBF",
    "ipa_us": "/ˈɛm ˈtiː ˈbiː ˈɛf/",
    "def": "平均故障間隔時間",
    "ex": "MTBF improved after preventive maintenance optimization.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv205",
    "word": "MTTR",
    "ipa_us": "/ˈɛm ˈtiː ˈtiː ˈɑr/",
    "def": "平均修復時間",
    "ex": "MTTR was reduced by standardizing repair procedures.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv206",
    "word": "preventive maintenance",
    "ipa_us": "/prɪvˈɛntɪv mˈeɪntʌnʌns/",
    "def": "預防性維護",
    "ex": "Preventive maintenance helps avoid unexpected equipment failure.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv207",
    "word": "corrective maintenance",
    "ipa_us": "/kɝˈɛktɪv mˈeɪntʌnʌns/",
    "def": "矯正性維護",
    "ex": "Corrective maintenance was performed after the breakdown.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv208",
    "word": "maintenance schedule",
    "ipa_us": "/mˈeɪntʌnʌns skˈɛdʒʊl/",
    "def": "保養計畫",
    "ex": "The maintenance schedule is reviewed monthly.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv209",
    "word": "spare inventory",
    "ipa_us": "/spˈɛr ˌɪnvʌntˈɔri/",
    "def": "備品庫存",
    "ex": "Spare inventory levels were adjusted to reduce risk.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv210",
    "word": "lubrication",
    "ipa_us": "/lˌubrɪkˈeɪʃʌn/",
    "def": "潤滑",
    "ex": "Proper lubrication extends equipment service life.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv211",
    "word": "inspection",
    "ipa_us": "/ˌɪnspˈɛkʃʌn/",
    "def": "檢查",
    "ex": "Routine inspection is required before startup.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv212",
    "word": "calibration",
    "ipa_us": "/kˌælʌbrˈeɪʃʌn/",
    "def": "校正",
    "ex": "Calibration records must be maintained for audit purposes.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv213",
    "word": "checklist",
    "ipa_us": "/tʃˈɛklˌɪst/",
    "def": "檢查表",
    "ex": "The operator completed the startup checklist.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv214",
    "word": "abnormality",
    "ipa_us": "/ˌæbnɔrmˈælʌti/",
    "def": "異常",
    "ex": "Any abnormality must be reported immediately.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv215",
    "word": "root cause analysis",
    "ipa_us": "/rˈut kˈɑz ʌnˈælʌsʌs/",
    "def": "根因分析",
    "ex": "Root cause analysis was conducted after the incident.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv216",
    "word": "containment action",
    "ipa_us": "/kʌntˈeɪnmʌnt ˈækʃʌn/",
    "def": "圍堵措施",
    "ex": "Containment actions were implemented to protect customers.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv217",
    "word": "continuous improvement",
    "ipa_us": "/kʌntˈɪnjuʌs ˌɪmprˈuvmʌnt/",
    "def": "持續改善",
    "ex": "Continuous improvement is part of the plant culture.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv218",
    "word": "Kaizen",
    "ipa_us": "/kaizen/",
    "def": "改善活動",
    "ex": "Kaizen activities focused on waste reduction.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv220",
    "word": "line balancing",
    "ipa_us": "/lˈaɪn bˈælʌnsɪŋ/",
    "def": "產線平衡",
    "ex": "Line balancing improved labor efficiency.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv221",
    "word": "cycle time",
    "ipa_us": "/sˈaɪkʌl tˈaɪm/",
    "def": "循環時間",
    "ex": "Cycle time was reduced after process optimization.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv222",
    "word": "takt time",
    "ipa_us": "/takt tˈaɪm/",
    "def": "節拍時間",
    "ex": "Takt time is aligned with customer demand.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv223",
    "word": "WIP",
    "ipa_us": "/ˈdʌbəl.juː ˈaɪ ˈpiː/",
    "def": "在製品",
    "ex": "Excessive WIP caused congestion on the line.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv224",
    "word": "FIFO",
    "ipa_us": "/ˈɛf ˈaɪ ˈɛf ˈoʊ/",
    "def": "先進先出",
    "ex": "FIFO is enforced to prevent material aging.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv225",
    "word": "Kanban",
    "ipa_us": "/kanban/",
    "def": "看板",
    "ex": "Kanban signals trigger material replenishment.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv226",
    "word": "5S",
    "ipa_us": "//fˈaɪv/ ˈɛs/",
    "def": "5S 管理",
    "ex": "5S implementation improved workplace organization.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv227",
    "word": "visual management",
    "ipa_us": "/vˈɪʒʌwʌl mˈænʌdʒmʌnt/",
    "def": "目視管理",
    "ex": "Visual management helps identify issues quickly.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv228",
    "word": "standard work",
    "ipa_us": "/stˈændɝd wˈɝk/",
    "def": "標準作業",
    "ex": "Standard work ensures consistent operation.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv229",
    "word": "work instruction",
    "ipa_us": "/wˈɝk ˌɪnstrˈʌkʃʌn/",
    "def": "作業指導書",
    "ex": "Work instructions must be followed strictly.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv230",
    "word": "process flow",
    "ipa_us": "/prˈɑsˌɛs flˈoʊ/",
    "def": "製程流程",
    "ex": "The process flow was reviewed during the audit.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv231",
    "word": "material handling",
    "ipa_us": "/mʌtˈɪriʌl hˈændlɪŋ/",
    "def": "物料搬運",
    "ex": "Material handling was optimized to reduce travel time.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv232",
    "word": "storage location",
    "ipa_us": "/stˈɔrʌdʒ loʊkˈeɪʃʌn/",
    "def": "儲位",
    "ex": "Each item has a defined storage location.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv233",
    "word": "inventory accuracy",
    "ipa_us": "/ˌɪnvʌntˈɔri ˈækjɝʌsi/",
    "def": "庫存準確率",
    "ex": "Inventory accuracy is reviewed weekly.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv234",
    "word": "stock discrepancy",
    "ipa_us": "/stˈɑk dɪskrˈɛpʌnsi/",
    "def": "庫存差異",
    "ex": "Stock discrepancy was identified during cycle count.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv235",
    "word": "cycle count",
    "ipa_us": "/sˈaɪkʌl kˈaʊnt/",
    "def": "循環盤點",
    "ex": "Cycle count is performed every week.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv236",
    "word": "material shortage",
    "ipa_us": "/mʌtˈɪriʌl ʃˈɔrtʌdʒ/",
    "def": "缺料",
    "ex": "Material shortage delayed production.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv238",
    "word": "delivery commitment",
    "ipa_us": "/dɪlˈɪvɝi kʌmˈɪtmʌnt/",
    "def": "交期承諾",
    "ex": "Delivery commitment must be met.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv239",
    "word": "supply risk",
    "ipa_us": "/sʌplˈaɪ rˈɪsk/",
    "def": "供應風險",
    "ex": "Supply risk was evaluated for critical components.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv240",
    "word": "dual sourcing",
    "ipa_us": "/dˈuʌl sˈɔrsɪŋ/",
    "def": "雙供應來源",
    "ex": "Dual sourcing reduces supply risk.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv241",
    "word": "lead time variability",
    "ipa_us": "/lˈɛd tˈaɪm vɛriʌbˈɪlɪti/",
    "def": "交期變異",
    "ex": "Lead time variability impacts production planning.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv242",
    "word": "demand forecast",
    "ipa_us": "/dɪmˈænd fˈɔrkˌæst/",
    "def": "需求預測",
    "ex": "Demand forecast was updated for next quarter.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv243",
    "word": "capacity planning",
    "ipa_us": "/kʌpˈæsʌti plˈænɪŋ/",
    "def": "產能規劃",
    "ex": "Capacity planning supports business growth.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv244",
    "word": "production ramp-up",
    "ipa_us": "/prʌdˈʌkʃʌn rˈæmp-ˈʌp/",
    "def": "產能爬坡",
    "ex": "Production ramp-up is progressing as planned.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv245",
    "word": "pilot run",
    "ipa_us": "/pˈaɪlʌt rˈʌn/",
    "def": "試產",
    "ex": "A pilot run was completed successfully.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv246",
    "word": "process validation",
    "ipa_us": "/prˈɑsˌɛs vˌælʌdˈeɪʃʌn/",
    "def": "製程驗證",
    "ex": "Process validation is required before mass production.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv247",
    "word": "mass production",
    "ipa_us": "/mˈæs prʌdˈʌkʃʌn/",
    "def": "量產",
    "ex": "Mass production started after approval.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv248",
    "word": "change management",
    "ipa_us": "/tʃˈeɪndʒ mˈænʌdʒmʌnt/",
    "def": "變更管理",
    "ex": "Change management ensures controlled implementation.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv249",
    "word": "engineering change",
    "ipa_us": "/ˈɛndʒʌnˈɪrɪŋ tʃˈeɪndʒ/",
    "def": "工程變更",
    "ex": "Engineering changes require formal approval.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv250",
    "word": "change impact",
    "ipa_us": "/tʃˈeɪndʒ ˌɪmpˈækt/",
    "def": "變更影響",
    "ex": "Change impact was assessed before execution.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv251",
    "word": "traceability system",
    "ipa_us": "/trˌeɪsʌbˈɪlɪti sˈɪstʌm/",
    "def": "追溯系統",
    "ex": "The traceability system links materials to finished goods.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv252",
    "word": "lot number",
    "ipa_us": "/lˈɑt nˈʌmbɝ/",
    "def": "批號",
    "ex": "Lot number information is recorded in MES.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv253",
    "word": "serialization",
    "ipa_us": "/serialization/",
    "def": "序號化",
    "ex": "Serialization improves product traceability.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv254",
    "word": "quality gate",
    "ipa_us": "/kwˈɑlʌti ɡˈeɪt/",
    "def": "品質關卡",
    "ex": "Quality gates prevent defects from flowing downstream.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv255",
    "word": "acceptance criteria",
    "ipa_us": "/æksˈɛptʌns kraɪtˈɪriʌ/",
    "def": "驗收標準",
    "ex": "Acceptance criteria are defined by the customer.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv256",
    "word": "rework",
    "ipa_us": "/riwˈɝk/",
    "def": "返工",
    "ex": "Rework increases manufacturing cost.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv257",
    "word": "scrap rate",
    "ipa_us": "/skrˈæp rˈeɪt/",
    "def": "報廢率",
    "ex": "Scrap rate was reduced after process improvement.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv258",
    "word": "cost reduction",
    "ipa_us": "/kˈɑst rʌdˈʌkʃʌn/",
    "def": "成本降低",
    "ex": "Cost reduction initiatives are ongoing.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv259",
    "word": "value analysis",
    "ipa_us": "/vˈælju ʌnˈælʌsʌs/",
    "def": "價值分析",
    "ex": "Value analysis identified improvement opportunities.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv260",
    "word": "productivity",
    "ipa_us": "/prˌoʊdʌktˈɪvʌti/",
    "def": "生產力",
    "ex": "Productivity improved after automation.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv261",
    "word": "labor efficiency",
    "ipa_us": "/lˈeɪbɝ ɪfˈɪʃʌnsi/",
    "def": "人力效率",
    "ex": "Labor efficiency is tracked monthly.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv262",
    "word": "shift handover",
    "ipa_us": "/ʃˈɪft hˈændoʊvɝ/",
    "def": "交接班",
    "ex": "Shift handover procedures were standardized.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv263",
    "word": "communication gap",
    "ipa_us": "/kʌmjˌunʌkˈeɪʃʌn ɡˈæp/",
    "def": "溝通落差",
    "ex": "The issue was caused by a communication gap.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv264",
    "word": "escalation",
    "ipa_us": "/ˌɛskʌlˈeɪʃʌn/",
    "def": "升級通報",
    "ex": "The problem was escalated to management.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv265",
    "word": "decision authority",
    "ipa_us": "/dɪsˈɪʒʌn ʌθˈɔrʌti/",
    "def": "決策權限",
    "ex": "Decision authority must be clearly defined.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv266",
    "word": "approval hierarchy",
    "ipa_us": "/ʌprˈuvʌl hˈaɪɝˌɑrki/",
    "def": "核准層級",
    "ex": "Approval hierarchy varies by investment amount.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv267",
    "word": "governance",
    "ipa_us": "/ɡˈʌvɝnʌns/",
    "def": "治理",
    "ex": "Governance ensures compliance with policy.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv268",
    "word": "compliance",
    "ipa_us": "/kʌmplˈaɪʌns/",
    "def": "合規",
    "ex": "Compliance with customer requirements is mandatory.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv269",
    "word": "internal control",
    "ipa_us": "/ˌɪntˈɝnʌl kʌntrˈoʊl/",
    "def": "內控制度",
    "ex": "Internal controls were strengthened after the audit.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv270",
    "word": "risk assessment",
    "ipa_us": "/rˈɪsk ʌsˈɛsmʌnt/",
    "def": "風險評估",
    "ex": "Risk assessment was conducted for the project.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv271",
    "word": "mitigation plan",
    "ipa_us": "/mˌɪtɪɡˈeɪʃʌn plˈæn/",
    "def": "風險對策",
    "ex": "A mitigation plan was developed to address risks.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv272",
    "word": "contingency plan",
    "ipa_us": "/kʌntˈɪndʒʌnsi plˈæn/",
    "def": "應變計畫",
    "ex": "The contingency plan covers supply disruptions.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv273",
    "word": "business continuity",
    "ipa_us": "/bˈɪznʌs kˌɑntʌnˈuʌti/",
    "def": "營運持續",
    "ex": "Business continuity planning is essential.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv274",
    "word": "recovery plan",
    "ipa_us": "/rɪkˈʌvri plˈæn/",
    "def": "復原計畫",
    "ex": "The recovery plan was activated after the incident.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv275",
    "word": "performance review",
    "ipa_us": "/pɝfˈɔrmʌns rˌivjˈu/",
    "def": "績效檢討",
    "ex": "Performance review is conducted quarterly.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv276",
    "word": "KPI",
    "ipa_us": "/ˈkeɪ ˈpiː ˈaɪ/",
    "def": "關鍵績效指標",
    "ex": "KPIs are used to track operational performance.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv277",
    "word": "target achievement",
    "ipa_us": "/tˈɑrɡʌt ʌtʃˈivmʌnt/",
    "def": "目標達成",
    "ex": "Target achievement was reviewed by management.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv278",
    "word": "variance analysis",
    "ipa_us": "/vˈɛriʌns ʌnˈælʌsʌs/",
    "def": "差異分析",
    "ex": "Variance analysis explains performance gaps.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv279",
    "word": "action item",
    "ipa_us": "/ˈækʃʌn ˈaɪtʌm/",
    "def": "行動項目",
    "ex": "Each action item has an owner and due date.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv280",
    "word": "follow-up",
    "ipa_us": "/fˈɑloʊˌʌp/",
    "def": "追蹤",
    "ex": "Follow-up meetings are scheduled weekly.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv281",
    "word": "closure",
    "ipa_us": "/klˈoʊʒɝ/",
    "def": "結案",
    "ex": "Issue closure requires evidence.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv282",
    "word": "lesson learned",
    "ipa_us": "/lˈɛsʌn lˈɝnd/",
    "def": "經驗教訓",
    "ex": "Lessons learned were documented.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv283",
    "word": "best practice",
    "ipa_us": "/bˈɛst prˈæktʌs/",
    "def": "最佳實務",
    "ex": "Best practices are shared across sites.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv284",
    "word": "standardization",
    "ipa_us": "/stændɝdɪzˈeɪʃʌn/",
    "def": "標準化",
    "ex": "Standardization improves consistency.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv285",
    "word": "replication",
    "ipa_us": "/rˌɛplʌkˈeɪʃʌn/",
    "def": "複製導入",
    "ex": "The process will be replicated at other plants.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv286",
    "word": "scalability",
    "ipa_us": "/skˈeɪlʌbˈɪlɪti/",
    "def": "可擴展性",
    "ex": "Scalability is considered in system design.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv287",
    "word": "digitalization",
    "ipa_us": "/digitalization/",
    "def": "數位化",
    "ex": "Digitalization enhances operational visibility.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv288",
    "word": "data transparency",
    "ipa_us": "/dˈeɪtʌ trænspˈɛrʌnsi/",
    "def": "數據透明",
    "ex": "Data transparency supports decision making.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv289",
    "word": "analytics",
    "ipa_us": "/ˌænʌlˈɪtɪks/",
    "def": "數據分析",
    "ex": "Analytics provides insight into process performance.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv290",
    "word": "decision support",
    "ipa_us": "/dɪsˈɪʒʌn sʌpˈɔrt/",
    "def": "決策支援",
    "ex": "The system provides decision support for managers.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv291",
    "word": "system integration",
    "ipa_us": "/sˈɪstʌm ˌɪntʌɡrˈeɪʃʌn/",
    "def": "系統整合",
    "ex": "System integration connects MES and ERP.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv292",
    "word": "ERP",
    "ipa_us": "/ˈiː ˈɑr ˈpiː/",
    "def": "企業資源規劃",
    "ex": "ERP manages enterprise-wide resources.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv293",
    "word": "master data",
    "ipa_us": "/mˈæstɝ dˈeɪtʌ/",
    "def": "主數據",
    "ex": "Master data accuracy is critical.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv294",
    "word": "data governance",
    "ipa_us": "/dˈeɪtʌ ɡˈʌvɝnʌns/",
    "def": "數據治理",
    "ex": "Data governance defines ownership and rules.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv295",
    "word": "access control",
    "ipa_us": "/ˈæksˌɛs kʌntrˈoʊl/",
    "def": "存取控制",
    "ex": "Access control prevents unauthorized changes.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv296",
    "word": "cybersecurity",
    "ipa_us": "/cybersecurity/",
    "def": "資安",
    "ex": "Cybersecurity measures protect production systems.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv297",
    "word": "system availability",
    "ipa_us": "/sˈɪstʌm ʌvˌeɪlʌbˈɪlʌti/",
    "def": "系統可用率",
    "ex": "System availability is monitored around the clock.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv298",
    "word": "incident response",
    "ipa_us": "/ˈɪnsʌdʌnt rɪspˈɑns/",
    "def": "事件應變",
    "ex": "Incident response procedures were executed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv299",
    "word": "post-incident review",
    "ipa_us": "/pˈoʊst-ˈɪnsʌdʌnt rˌivjˈu/",
    "def": "事後檢討",
    "ex": "A post-incident review was conducted.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv300",
    "word": "continuous monitoring",
    "ipa_us": "/kʌntˈɪnjuʌs mˈɑnʌtɝɪŋ/",
    "def": "持續監控",
    "ex": "Continuous monitoring helps prevent recurrence.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv301",
    "word": "capacity utilization",
    "ipa_us": "/kʌpˈæsʌti jˌutʌlʌzˈeɪʃʌn/",
    "def": "產能利用率",
    "ex": "Capacity utilization exceeded ninety percent.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv302",
    "word": "throughput",
    "ipa_us": "/θrˈupˌʊt/",
    "def": "產出量",
    "ex": "Throughput increased after bottleneck removal.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv303",
    "word": "load balance",
    "ipa_us": "/lˈoʊd bˈælʌns/",
    "def": "負載平衡",
    "ex": "Load balance was optimized across production lines.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv304",
    "word": "process window",
    "ipa_us": "/prˈɑsˌɛs wˈɪndoʊ/",
    "def": "製程窗口",
    "ex": "The process window must be strictly controlled.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv305",
    "word": "critical parameter",
    "ipa_us": "/krˈɪtɪkʌl pɝˈæmʌtɝ/",
    "def": "關鍵參數",
    "ex": "Critical parameters are monitored in real time.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv306",
    "word": "variation",
    "ipa_us": "/vˌɛriˈeɪʃʌn/",
    "def": "變異",
    "ex": "Process variation was reduced significantly.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv307",
    "word": "control limit",
    "ipa_us": "/kʌntrˈoʊl lˈɪmʌt/",
    "def": "管制界限",
    "ex": "The data exceeded the upper control limit.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv308",
    "word": "out-of-control",
    "ipa_us": "/ˈaʊt-ˈʌv-kʌntrˈoʊl/",
    "def": "失控",
    "ex": "The process was identified as out-of-control.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv309",
    "word": "process drift",
    "ipa_us": "/prˈɑsˌɛs drˈɪft/",
    "def": "製程漂移",
    "ex": "Process drift was detected through SPC monitoring.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv310",
    "word": "root cause owner",
    "ipa_us": "/rˈut kˈɑz ˈoʊnɝ/",
    "def": "根因負責人",
    "ex": "A root cause owner was assigned to the issue.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv311",
    "word": "corrective plan",
    "ipa_us": "/kɝˈɛktɪv plˈæn/",
    "def": "矯正計畫",
    "ex": "The corrective plan was approved by management.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv312",
    "word": "preventive plan",
    "ipa_us": "/prɪvˈɛntɪv plˈæn/",
    "def": "預防計畫",
    "ex": "A preventive plan was implemented to avoid recurrence.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv313",
    "word": "effectiveness check",
    "ipa_us": "/ɪfˈɛktɪvnʌs tʃˈɛk/",
    "def": "成效確認",
    "ex": "An effectiveness check was conducted after implementation.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv314",
    "word": "audit trail",
    "ipa_us": "/ˈɔdɪt trˈeɪl/",
    "def": "稽核軌跡",
    "ex": "The system provides a complete audit trail.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv315",
    "word": "document control",
    "ipa_us": "/dˈɑkjʌmɛnt kʌntrˈoʊl/",
    "def": "文件管制",
    "ex": "Document control ensures the latest revision is used.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv316",
    "word": "revision history",
    "ipa_us": "/rivˈɪʒʌn hˈɪstɝi/",
    "def": "版本紀錄",
    "ex": "Revision history must be clearly documented.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv317",
    "word": "approval record",
    "ipa_us": "/ʌprˈuvʌl rʌkˈɔrd/",
    "def": "核准紀錄",
    "ex": "Approval records are required for audit review.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv318",
    "word": "process owner",
    "ipa_us": "/prˈɑsˌɛs ˈoʊnɝ/",
    "def": "流程負責人",
    "ex": "The process owner is responsible for performance.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv319",
    "word": "stakeholder alignment",
    "ipa_us": "/stˈeɪkhˌoʊldɝ ʌlˈaɪnmʌnt/",
    "def": "利害關係人對齊",
    "ex": "Stakeholder alignment was achieved before execution.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv320",
    "word": "cross-functional review",
    "ipa_us": "/krˈɔs-fˈʌŋkʃʌnʌl rˌivjˈu/",
    "def": "跨部門審查",
    "ex": "A cross-functional review was conducted.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv321",
    "word": "digital traceability",
    "ipa_us": "/dˈɪdʒʌtʌl trˌeɪsʌbˈɪlɪti/",
    "def": "數位追溯",
    "ex": "Digital traceability improves audit readiness.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv322",
    "word": "data integrity",
    "ipa_us": "/dˈeɪtʌ ˌɪntˈɛɡrʌti/",
    "def": "資料完整性",
    "ex": "Data integrity is critical for compliance.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv323",
    "word": "system redundancy",
    "ipa_us": "/sˈɪstʌm rɪdˈʌndʌnsi/",
    "def": "系統備援",
    "ex": "System redundancy ensures high availability.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv324",
    "word": "failover",
    "ipa_us": "/failover/",
    "def": "故障切換",
    "ex": "Failover was triggered during system interruption.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv325",
    "word": "backup recovery",
    "ipa_us": "/bˈækˌʌp rɪkˈʌvri/",
    "def": "備份復原",
    "ex": "Backup recovery was completed successfully.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv326",
    "word": "access log",
    "ipa_us": "/ˈæksˌɛs lˈɔɡ/",
    "def": "存取紀錄",
    "ex": "Access logs are reviewed regularly.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv327",
    "word": "user authorization",
    "ipa_us": "/jˈuzɝ ˌɔθɝʌzˈeɪʃʌn/",
    "def": "使用者授權",
    "ex": "User authorization is managed by IT.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv328",
    "word": "role-based access",
    "ipa_us": "/rˈoʊl-bˈeɪst ˈæksˌɛs/",
    "def": "角色權限控管",
    "ex": "Role-based access limits system exposure.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv329",
    "word": "system validation",
    "ipa_us": "/sˈɪstʌm vˌælʌdˈeɪʃʌn/",
    "def": "系統驗證",
    "ex": "System validation is required before go-live.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv330",
    "word": "go-live",
    "ipa_us": "/ɡˈoʊ-lˈaɪv/",
    "def": "正式上線",
    "ex": "The system is scheduled to go-live next month.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv331",
    "word": "change freeze",
    "ipa_us": "/tʃˈeɪndʒ frˈiz/",
    "def": "變更凍結",
    "ex": "A change freeze was applied during peak season.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv332",
    "word": "deployment plan",
    "ipa_us": "/dɪplˈɔɪmʌnt plˈæn/",
    "def": "部署計畫",
    "ex": "The deployment plan was reviewed by all teams.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv333",
    "word": "cutover",
    "ipa_us": "/cutover/",
    "def": "切換作業",
    "ex": "Cutover activities were executed overnight.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv334",
    "word": "rollback",
    "ipa_us": "/rˈoʊlbˌæk/",
    "def": "回復機制",
    "ex": "A rollback was prepared in case of failure.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv335",
    "word": "system stability",
    "ipa_us": "/sˈɪstʌm stʌbˈɪlɪti/",
    "def": "系統穩定性",
    "ex": "System stability was confirmed after deployment.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv336",
    "word": "performance baseline",
    "ipa_us": "/pɝfˈɔrmʌns bˈeɪslˌaɪn/",
    "def": "效能基準",
    "ex": "A performance baseline was established.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv337",
    "word": "capacity threshold",
    "ipa_us": "/kʌpˈæsʌti θrˈɛʃˌoʊld/",
    "def": "容量門檻",
    "ex": "The capacity threshold was exceeded.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv338",
    "word": "alert mechanism",
    "ipa_us": "/ʌlˈɝt mˈɛkʌnˌɪzʌm/",
    "def": "警示機制",
    "ex": "An alert mechanism was configured.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv339",
    "word": "incident escalation",
    "ipa_us": "/ˈɪnsʌdʌnt ˌɛskʌlˈeɪʃʌn/",
    "def": "事件升級通報",
    "ex": "Incident escalation followed the defined procedure.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv340",
    "word": "service level",
    "ipa_us": "/sˈɝvʌs lˈɛvʌl/",
    "def": "服務水準",
    "ex": "Service levels are defined in the agreement.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv341",
    "word": "SLA",
    "ipa_us": "/ˈɛs ˈɛl ˈeɪ/",
    "def": "服務水準協議",
    "ex": "The SLA defines response and recovery time.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv342",
    "word": "uptime",
    "ipa_us": "/uptime/",
    "def": "系統運作時間",
    "ex": "System uptime reached ninety-nine percent.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv343",
    "word": "availability target",
    "ipa_us": "/ʌvˌeɪlʌbˈɪlʌti tˈɑrɡʌt/",
    "def": "可用率目標",
    "ex": "The availability target was achieved.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv344",
    "word": "operational resilience",
    "ipa_us": "/ˌɑpɝˈeɪʃʌnʌl rɪzˈɪliʌns/",
    "def": "營運韌性",
    "ex": "Operational resilience was strengthened.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv345",
    "word": "business impact",
    "ipa_us": "/bˈɪznʌs ˌɪmpˈækt/",
    "def": "營運影響",
    "ex": "The business impact was assessed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv346",
    "word": "risk exposure",
    "ipa_us": "/rˈɪsk ɪkspˈoʊʒɝ/",
    "def": "風險曝險",
    "ex": "Risk exposure was reduced after mitigation.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv347",
    "word": "compliance gap",
    "ipa_us": "/kʌmplˈaɪʌns ɡˈæp/",
    "def": "合規缺口",
    "ex": "A compliance gap was identified.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv348",
    "word": "regulatory requirement",
    "ipa_us": "/rˈɛɡjʌlʌtˌɔri rɪkwˈaɪrmʌnt/",
    "def": "法規要求",
    "ex": "Regulatory requirements must be met.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv349",
    "word": "audit readiness",
    "ipa_us": "/ˈɔdɪt rˈɛdinʌs/",
    "def": "稽核準備度",
    "ex": "Audit readiness was reviewed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv350",
    "word": "management review",
    "ipa_us": "/mˈænʌdʒmʌnt rˌivjˈu/",
    "def": "管理審查",
    "ex": "Management review is conducted annually.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv351",
    "word": "performance dashboard",
    "ipa_us": "/pɝfˈɔrmʌns dˈæʃbˌɔrd/",
    "def": "績效儀表板",
    "ex": "The dashboard provides real-time visibility.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv352",
    "word": "data visualization",
    "ipa_us": "/dˈeɪtʌ vˌɪʒwʌlʌzˈeɪʃʌn/",
    "def": "數據視覺化",
    "ex": "Data visualization supports analysis.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv353",
    "word": "trend analysis",
    "ipa_us": "/trˈɛnd ʌnˈælʌsʌs/",
    "def": "趨勢分析",
    "ex": "Trend analysis identified performance issues.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv354",
    "word": "predictive model",
    "ipa_us": "/prɪdˈɪktɪv mˈɑdʌl/",
    "def": "預測模型",
    "ex": "A predictive model was developed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv355",
    "word": "early warning",
    "ipa_us": "/ˈɝli wˈɔrnɪŋ/",
    "def": "預警機制",
    "ex": "An early warning was triggered.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv356",
    "word": "optimization loop",
    "ipa_us": "/ɑptʌmʌzˈeɪʃʌn lˈup/",
    "def": "最佳化循環",
    "ex": "The optimization loop runs continuously.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv357",
    "word": "continuous learning",
    "ipa_us": "/kʌntˈɪnjuʌs lˈɝnɪŋ/",
    "def": "持續學習",
    "ex": "Continuous learning supports improvement.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv358",
    "word": "knowledge base",
    "ipa_us": "/nˈɑlʌdʒ bˈeɪs/",
    "def": "知識庫",
    "ex": "The knowledge base is regularly updated.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv359",
    "word": "best practice sharing",
    "ipa_us": "/bˈɛst prˈæktʌs ʃˈɛrɪŋ/",
    "def": "最佳實務分享",
    "ex": "Best practice sharing was encouraged.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv360",
    "word": "standard rollout",
    "ipa_us": "/stˈændɝd rˈoʊlˌaʊt/",
    "def": "標準化推廣",
    "ex": "The standard rollout covered all sites.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv361",
    "word": "replication plan",
    "ipa_us": "/rˌɛplʌkˈeɪʃʌn plˈæn/",
    "def": "複製導入計畫",
    "ex": "A replication plan was approved.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv362",
    "word": "scalable architecture",
    "ipa_us": "/skˈeɪlʌbʌl ˈɑrkʌtˌɛktʃɝ/",
    "def": "可擴展架構",
    "ex": "A scalable architecture was designed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv363",
    "word": "modular design",
    "ipa_us": "/mˈɑdʒʌlɝ dɪzˈaɪn/",
    "def": "模組化設計",
    "ex": "Modular design improves flexibility.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv364",
    "word": "interface standard",
    "ipa_us": "/ˈɪntɝfˌeɪs stˈændɝd/",
    "def": "介面標準",
    "ex": "Interface standards were defined.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv365",
    "word": "system interoperability",
    "ipa_us": "/sˈɪstʌm interoperability/",
    "def": "系統互通性",
    "ex": "System interoperability was validated.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv366",
    "word": "integration testing",
    "ipa_us": "/ˌɪntʌɡrˈeɪʃʌn tˈɛstɪŋ/",
    "def": "整合測試",
    "ex": "Integration testing was completed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv367",
    "word": "acceptance testing",
    "ipa_us": "/æksˈɛptʌns tˈɛstɪŋ/",
    "def": "驗收測試",
    "ex": "Acceptance testing was approved.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv368",
    "word": "handover package",
    "ipa_us": "/hˈændoʊvɝ pˈækʌdʒ/",
    "def": "交付文件包",
    "ex": "The handover package was delivered.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv369",
    "word": "operational handover",
    "ipa_us": "/ˌɑpɝˈeɪʃʌnʌl hˈændoʊvɝ/",
    "def": "營運交接",
    "ex": "Operational handover was completed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv370",
    "word": "training readiness",
    "ipa_us": "/trˈeɪnɪŋ rˈɛdinʌs/",
    "def": "訓練準備度",
    "ex": "Training readiness was confirmed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv371",
    "word": "user adoption",
    "ipa_us": "/jˈuzɝ ʌdˈɑpʃʌn/",
    "def": "使用者採用度",
    "ex": "User adoption increased steadily.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv372",
    "word": "change acceptance",
    "ipa_us": "/tʃˈeɪndʒ æksˈɛptʌns/",
    "def": "變更接受度",
    "ex": "Change acceptance was monitored.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv373",
    "word": "support model",
    "ipa_us": "/sʌpˈɔrt mˈɑdʌl/",
    "def": "支援模式",
    "ex": "The support model was defined.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv374",
    "word": "service desk",
    "ipa_us": "/sˈɝvʌs dˈɛsk/",
    "def": "服務台",
    "ex": "The service desk handles incidents.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv375",
    "word": "ticket system",
    "ipa_us": "/tˈɪkʌt sˈɪstʌm/",
    "def": "工單系統",
    "ex": "All issues are tracked in the ticket system.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv376",
    "word": "resolution time",
    "ipa_us": "/rˌɛzʌlˈuʃʌn tˈaɪm/",
    "def": "問題解決時間",
    "ex": "Resolution time met the SLA.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv377",
    "word": "service improvement",
    "ipa_us": "/sˈɝvʌs ˌɪmprˈuvmʌnt/",
    "def": "服務改善",
    "ex": "Service improvement initiatives were launched.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv378",
    "word": "customer satisfaction",
    "ipa_us": "/kˈʌstʌmɝ sˌætʌsfˈækʃʌn/",
    "def": "客戶滿意度",
    "ex": "Customer satisfaction improved.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv379",
    "word": "feedback loop",
    "ipa_us": "/fˈidbˌæk lˈup/",
    "def": "回饋循環",
    "ex": "The feedback loop supports continuous improvement.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv380",
    "word": "service maturity",
    "ipa_us": "/sˈɝvʌs mʌtʃˈʊrʌti/",
    "def": "服務成熟度",
    "ex": "Service maturity increased over time.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv381",
    "word": "operational excellence",
    "ipa_us": "/ˌɑpɝˈeɪʃʌnʌl ˈɛksʌlʌns/",
    "def": "營運卓越",
    "ex": "Operational excellence is a strategic goal.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv382",
    "word": "continuous optimization",
    "ipa_us": "/kʌntˈɪnjuʌs ɑptʌmʌzˈeɪʃʌn/",
    "def": "持續最佳化",
    "ex": "Continuous optimization drives performance.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv383",
    "word": "long-term roadmap",
    "ipa_us": "/lˈɔŋtˈɝm rˈoʊdmˌæp/",
    "def": "長期藍圖",
    "ex": "The long-term roadmap was defined.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv384",
    "word": "strategic alignment",
    "ipa_us": "/strʌtˈidʒɪk ʌlˈaɪnmʌnt/",
    "def": "策略對齊",
    "ex": "Strategic alignment was achieved.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv385",
    "word": "investment priority",
    "ipa_us": "/ˌɪnvˈɛstmʌnt praɪˈɔrʌti/",
    "def": "投資優先順序",
    "ex": "Investment priorities were reviewed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv386",
    "word": "resource allocation",
    "ipa_us": "/rˈisɔrs ˌælʌkˈeɪʃʌn/",
    "def": "資源配置",
    "ex": "Resource allocation was optimized.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv387",
    "word": "portfolio management",
    "ipa_us": "/pɔrtfˈoʊliˌoʊ mˈænʌdʒmʌnt/",
    "def": "投資組合管理",
    "ex": "Portfolio management supports decision making.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv388",
    "word": "benefit realization",
    "ipa_us": "/bˈɛnʌfɪt rˈilʌzˈeɪʃʌn/",
    "def": "效益實現",
    "ex": "Benefit realization was tracked.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv389",
    "word": "value delivery",
    "ipa_us": "/vˈælju dɪlˈɪvɝi/",
    "def": "價值交付",
    "ex": "Value delivery met expectations.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv390",
    "word": "performance outcome",
    "ipa_us": "/pɝfˈɔrmʌns ˈaʊtkˌʌm/",
    "def": "績效成果",
    "ex": "Performance outcomes were reported.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv391",
    "word": "continuous improvement culture",
    "ipa_us": "/kʌntˈɪnjuʌs ˌɪmprˈuvmʌnt kˈʌltʃɝ/",
    "def": "持續改善文化",
    "ex": "A continuous improvement culture was promoted.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv392",
    "word": "operational maturity",
    "ipa_us": "/ˌɑpɝˈeɪʃʌnʌl mʌtʃˈʊrʌti/",
    "def": "營運成熟度",
    "ex": "Operational maturity increased.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv393",
    "word": "enterprise visibility",
    "ipa_us": "/ˈɛntɝprˌaɪz vˌɪzʌbˈɪlɪti/",
    "def": "企業可視性",
    "ex": "Enterprise visibility supports decisions.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv394",
    "word": "data-driven decision",
    "ipa_us": "/dˈeɪtʌ-drˈɪvʌn dɪsˈɪʒʌn/",
    "def": "數據導向決策",
    "ex": "Data-driven decisions improve accuracy.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv395",
    "word": "management insight",
    "ipa_us": "/mˈænʌdʒmʌnt ˈɪnsˌaɪt/",
    "def": "管理洞察",
    "ex": "Management insight was enhanced.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv396",
    "word": "decision quality",
    "ipa_us": "/dɪsˈɪʒʌn kwˈɑlʌti/",
    "def": "決策品質",
    "ex": "Decision quality improved.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv397",
    "word": "execution discipline",
    "ipa_us": "/ˌɛksʌkjˈuʃʌn dˈɪsʌplʌn/",
    "def": "執行紀律",
    "ex": "Execution discipline was emphasized.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv398",
    "word": "governance framework",
    "ipa_us": "/ɡˈʌvɝnʌns frˈeɪmwˌɝk/",
    "def": "治理架構",
    "ex": "The governance framework was established.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv399",
    "word": "continuous alignment",
    "ipa_us": "/kʌntˈɪnjuʌs ʌlˈaɪnmʌnt/",
    "def": "持續對齊",
    "ex": "Continuous alignment supports strategy.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv400",
    "word": "long-term sustainability",
    "ipa_us": "/lˈɔŋtˈɝm sʌstˌeɪnʌbˈɪlɪti/",
    "def": "長期永續",
    "ex": "Long-term sustainability is the ultimate goal.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv401",
    "word": "operational strategy",
    "ipa_us": "/ˌɑpɝˈeɪʃʌnʌl strˈætʌdʒi/",
    "def": "營運策略",
    "ex": "The operational strategy supports long-term growth.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv402",
    "word": "execution roadmap",
    "ipa_us": "/ˌɛksʌkjˈuʃʌn rˈoʊdmˌæp/",
    "def": "執行藍圖",
    "ex": "The execution roadmap was aligned with business goals.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv403",
    "word": "program governance",
    "ipa_us": "/prˈoʊɡrˌæm ɡˈʌvɝnʌns/",
    "def": "專案治理",
    "ex": "Program governance ensures decision discipline.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv404",
    "word": "portfolio alignment",
    "ipa_us": "/pɔrtfˈoʊliˌoʊ ʌlˈaɪnmʌnt/",
    "def": "投資組合對齊",
    "ex": "Portfolio alignment was reviewed quarterly.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv405",
    "word": "value stream",
    "ipa_us": "/vˈælju strˈim/",
    "def": "價值流",
    "ex": "The value stream was mapped to identify waste.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv406",
    "word": "process ownership",
    "ipa_us": "/prˈɑsˌɛs ˈoʊnɝʃˌɪp/",
    "def": "流程責任歸屬",
    "ex": "Process ownership was clearly defined.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv407",
    "word": "accountability model",
    "ipa_us": "/ʌkˈaʊntʌbˌɪlɪti mˈɑdʌl/",
    "def": "責任制度",
    "ex": "The accountability model improves execution.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv408",
    "word": "performance ownership",
    "ipa_us": "/pɝfˈɔrmʌns ˈoʊnɝʃˌɪp/",
    "def": "績效責任制",
    "ex": "Performance ownership was assigned to each function.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv409",
    "word": "decision latency",
    "ipa_us": "/dɪsˈɪʒʌn lˈeɪtʌnsi/",
    "def": "決策延遲",
    "ex": "Decision latency impacts execution speed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv410",
    "word": "organizational friction",
    "ipa_us": "/ˌɔrɡʌnʌzˈeɪʃʌnʌl frˈɪkʃʌn/",
    "def": "組織摩擦",
    "ex": "Organizational friction slowed cross-team progress.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv411",
    "word": "cross-site coordination",
    "ipa_us": "/krˈɔs-sˈaɪt koʊˌɔrdʌnˈeɪʃʌn/",
    "def": "跨據點協調",
    "ex": "Cross-site coordination was strengthened.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv412",
    "word": "resource contention",
    "ipa_us": "/rˈisɔrs kʌntˈɛnʃʌn/",
    "def": "資源衝突",
    "ex": "Resource contention affected project timelines.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv413",
    "word": "priority arbitration",
    "ipa_us": "/praɪˈɔrʌti ˌɑrbɪtrˈeɪʃʌn/",
    "def": "優先順序協調",
    "ex": "Priority arbitration was required across programs.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv414",
    "word": "execution cadence",
    "ipa_us": "/ˌɛksʌkjˈuʃʌn kˈeɪdʌns/",
    "def": "執行節奏",
    "ex": "Execution cadence was reviewed weekly.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv415",
    "word": "delivery rhythm",
    "ipa_us": "/dɪlˈɪvɝi rˈɪðʌm/",
    "def": "交付節奏",
    "ex": "The delivery rhythm improved predictability.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv416",
    "word": "issue backlog",
    "ipa_us": "/ˈɪʃu bˈæklˌɑɡ/",
    "def": "問題待辦清單",
    "ex": "The issue backlog was prioritized.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv417",
    "word": "risk backlog",
    "ipa_us": "/rˈɪsk bˈæklˌɑɡ/",
    "def": "風險清單",
    "ex": "Risks were tracked in a central backlog.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv418",
    "word": "decision log",
    "ipa_us": "/dɪsˈɪʒʌn lˈɔɡ/",
    "def": "決策紀錄",
    "ex": "All major decisions were recorded in the log.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv419",
    "word": "assumption tracking",
    "ipa_us": "/ʌsˈʌmpʃʌn trˈækɪŋ/",
    "def": "假設追蹤",
    "ex": "Key assumptions were actively tracked.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv420",
    "word": "dependency mapping",
    "ipa_us": "/dɪpˈɛndʌnsi mˈæpɪŋ/",
    "def": "相依性盤點",
    "ex": "Dependency mapping reduced coordination risk.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv421",
    "word": "constraint management",
    "ipa_us": "/kʌnstrˈeɪnt mˈænʌdʒmʌnt/",
    "def": "限制管理",
    "ex": "Constraint management improved throughput.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv422",
    "word": "capacity buffering",
    "ipa_us": "/kʌpˈæsʌti bˈʌfɝɪŋ/",
    "def": "產能緩衝",
    "ex": "Capacity buffering absorbed demand spikes.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv423",
    "word": "scenario planning",
    "ipa_us": "/sɪnˈɛrioʊ plˈænɪŋ/",
    "def": "情境規劃",
    "ex": "Scenario planning supported uncertainty management.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv424",
    "word": "stress testing",
    "ipa_us": "/strˈɛs tˈɛstɪŋ/",
    "def": "壓力測試",
    "ex": "Stress testing validated system robustness.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv425",
    "word": "resilience assessment",
    "ipa_us": "/rɪzˈɪliʌns ʌsˈɛsmʌnt/",
    "def": "韌性評估",
    "ex": "Resilience assessment identified weaknesses.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv426",
    "word": "operating model",
    "ipa_us": "/ˈɑpɝˌeɪtɪŋ mˈɑdʌl/",
    "def": "營運模式",
    "ex": "The operating model was standardized.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv427",
    "word": "governance cadence",
    "ipa_us": "/ɡˈʌvɝnʌns kˈeɪdʌns/",
    "def": "治理節奏",
    "ex": "The governance cadence was aligned with reviews.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv428",
    "word": "review cycle",
    "ipa_us": "/rˌivjˈu sˈaɪkʌl/",
    "def": "檢討週期",
    "ex": "The review cycle occurs monthly.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv429",
    "word": "management forum",
    "ipa_us": "/mˈænʌdʒmʌnt fˈɔrʌm/",
    "def": "管理會議平台",
    "ex": "The management forum addressed key issues.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv430",
    "word": "executive sponsorship",
    "ipa_us": "/ɪɡzˈɛkjʌtɪv spˈɑnsɝʃˌɪp/",
    "def": "高層贊助",
    "ex": "Executive sponsorship accelerated decisions.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv431",
    "word": "organizational alignment",
    "ipa_us": "/ˌɔrɡʌnʌzˈeɪʃʌnʌl ʌlˈaɪnmʌnt/",
    "def": "組織對齊",
    "ex": "Organizational alignment improved execution.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv432",
    "word": "change fatigue",
    "ipa_us": "/tʃˈeɪndʒ fʌtˈiɡ/",
    "def": "變革疲勞",
    "ex": "Change fatigue reduced adoption speed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv433",
    "word": "adoption barrier",
    "ipa_us": "/ʌdˈɑpʃʌn bˈæriɝ/",
    "def": "採用障礙",
    "ex": "Adoption barriers were addressed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv434",
    "word": "enablement plan",
    "ipa_us": "/enablement plˈæn/",
    "def": "賦能計畫",
    "ex": "An enablement plan was launched.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv435",
    "word": "capability uplift",
    "ipa_us": "/kˌeɪpʌbˈɪlʌti ˈʌplɪft/",
    "def": "能力提升",
    "ex": "Capability uplift was measured.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv436",
    "word": "skills matrix",
    "ipa_us": "/skˈɪlz mˈeɪtrɪks/",
    "def": "技能矩陣",
    "ex": "The skills matrix identified gaps.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv437",
    "word": "succession planning",
    "ipa_us": "/sʌksˈɛʃʌn plˈænɪŋ/",
    "def": "接班規劃",
    "ex": "Succession planning reduced key-person risk.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv438",
    "word": "talent pipeline",
    "ipa_us": "/tˈælʌnt pˈaɪplˌaɪn/",
    "def": "人才管道",
    "ex": "The talent pipeline was strengthened.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv439",
    "word": "knowledge transfer",
    "ipa_us": "/nˈɑlʌdʒ trænsfˈɝ/",
    "def": "知識移轉",
    "ex": "Knowledge transfer ensured continuity.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv440",
    "word": "organizational learning",
    "ipa_us": "/ˌɔrɡʌnʌzˈeɪʃʌnʌl lˈɝnɪŋ/",
    "def": "組織學習",
    "ex": "Organizational learning was encouraged.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv441",
    "word": "culture reinforcement",
    "ipa_us": "/kˈʌltʃɝ rˌiɪnfˈɔrsmʌnt/",
    "def": "文化強化",
    "ex": "Culture reinforcement supported execution.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv442",
    "word": "behavioral change",
    "ipa_us": "/bɪhˈeɪvjɝʌl tʃˈeɪndʒ/",
    "def": "行為改變",
    "ex": "Behavioral change takes time.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv443",
    "word": "incentive alignment",
    "ipa_us": "/ˌɪnsˈɛntɪv ʌlˈaɪnmʌnt/",
    "def": "誘因對齊",
    "ex": "Incentive alignment improved outcomes.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv444",
    "word": "performance reinforcement",
    "ipa_us": "/pɝfˈɔrmʌns rˌiɪnfˈɔrsmʌnt/",
    "def": "績效強化",
    "ex": "Performance reinforcement sustained results.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv445",
    "word": "continuous feedback",
    "ipa_us": "/kʌntˈɪnjuʌs fˈidbˌæk/",
    "def": "持續回饋",
    "ex": "Continuous feedback accelerated learning.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv446",
    "word": "insight generation",
    "ipa_us": "/ˈɪnsˌaɪt dʒˌɛnɝˈeɪʃʌn/",
    "def": "洞察產生",
    "ex": "Insight generation supported decisions.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv447",
    "word": "decision enablement",
    "ipa_us": "/dɪsˈɪʒʌn enablement/",
    "def": "決策賦能",
    "ex": "Decision enablement improved speed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv448",
    "word": "execution transparency",
    "ipa_us": "/ˌɛksʌkjˈuʃʌn trænspˈɛrʌnsi/",
    "def": "執行透明度",
    "ex": "Execution transparency increased trust.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv449",
    "word": "operational visibility",
    "ipa_us": "/ˌɑpɝˈeɪʃʌnʌl vˌɪzʌbˈɪlɪti/",
    "def": "營運可視性",
    "ex": "Operational visibility supported coordination.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv450",
    "word": "performance narrative",
    "ipa_us": "/pɝfˈɔrmʌns nˈærʌtɪv/",
    "def": "績效敘事",
    "ex": "The performance narrative was shared.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv451",
    "word": "strategic communication",
    "ipa_us": "/strʌtˈidʒɪk kʌmjˌunʌkˈeɪʃʌn/",
    "def": "策略溝通",
    "ex": "Strategic communication aligned teams.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv452",
    "word": "message consistency",
    "ipa_us": "/mˈɛsʌdʒ kʌnsˈɪstʌnsi/",
    "def": "訊息一致性",
    "ex": "Message consistency built confidence.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv453",
    "word": "stakeholder trust",
    "ipa_us": "/stˈeɪkhˌoʊldɝ trˈʌst/",
    "def": "利害關係人信任",
    "ex": "Stakeholder trust was strengthened.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv454",
    "word": "expectation management",
    "ipa_us": "/ˌɛkspɛktˈeɪʃʌn mˈænʌdʒmʌnt/",
    "def": "期望管理",
    "ex": "Expectation management reduced conflict.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv455",
    "word": "alignment check",
    "ipa_us": "/ʌlˈaɪnmʌnt tʃˈɛk/",
    "def": "對齊檢核",
    "ex": "An alignment check was performed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv456",
    "word": "execution review",
    "ipa_us": "/ˌɛksʌkjˈuʃʌn rˌivjˈu/",
    "def": "執行檢討",
    "ex": "The execution review identified gaps.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv457",
    "word": "outcome tracking",
    "ipa_us": "/ˈaʊtkˌʌm trˈækɪŋ/",
    "def": "成果追蹤",
    "ex": "Outcomes were tracked monthly.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv458",
    "word": "benefit tracking",
    "ipa_us": "/bˈɛnʌfɪt trˈækɪŋ/",
    "def": "效益追蹤",
    "ex": "Benefits were tracked against targets.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv459",
    "word": "value realization",
    "ipa_us": "/vˈælju rˈilʌzˈeɪʃʌn/",
    "def": "價值實現",
    "ex": "Value realization was reviewed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv460",
    "word": "performance sustainability",
    "ipa_us": "/pɝfˈɔrmʌns sʌstˌeɪnʌbˈɪlɪti/",
    "def": "績效永續性",
    "ex": "Performance sustainability was achieved.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv461",
    "word": "operational health",
    "ipa_us": "/ˌɑpɝˈeɪʃʌnʌl hˈɛlθ/",
    "def": "營運健康度",
    "ex": "Operational health was monitored.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv462",
    "word": "early signal",
    "ipa_us": "/ˈɝli sˈɪɡnʌl/",
    "def": "早期訊號",
    "ex": "Early signals indicated potential risk.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv463",
    "word": "leading indicator",
    "ipa_us": "/lˈidɪŋ ˈɪndʌkˌeɪtɝ/",
    "def": "領先指標",
    "ex": "Leading indicators were monitored.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv464",
    "word": "lagging indicator",
    "ipa_us": "/lˈæɡɪŋ ˈɪndʌkˌeɪtɝ/",
    "def": "落後指標",
    "ex": "Lagging indicators reflect past performance.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv465",
    "word": "signal-to-noise ratio",
    "ipa_us": "/sˈɪɡnʌl-tˈu-nˈɔɪz rˈeɪʃiˌoʊ/",
    "def": "訊噪比",
    "ex": "The signal-to-noise ratio was improved.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv466",
    "word": "performance anomaly",
    "ipa_us": "/pɝfˈɔrmʌns ʌnˈɑmʌli/",
    "def": "績效異常",
    "ex": "A performance anomaly was detected.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv467",
    "word": "root signal",
    "ipa_us": "/rˈut sˈɪɡnʌl/",
    "def": "根本訊號",
    "ex": "The root signal was identified.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv468",
    "word": "corrective trigger",
    "ipa_us": "/kɝˈɛktɪv trˈɪɡɝ/",
    "def": "矯正觸發條件",
    "ex": "The corrective trigger was activated.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv469",
    "word": "decision threshold",
    "ipa_us": "/dɪsˈɪʒʌn θrˈɛʃˌoʊld/",
    "def": "決策門檻",
    "ex": "The decision threshold was exceeded.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv470",
    "word": "response playbook",
    "ipa_us": "/rɪspˈɑns plˈeɪbʊk/",
    "def": "應對手冊",
    "ex": "The response playbook guided actions.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv471",
    "word": "escalation path",
    "ipa_us": "/ˌɛskʌlˈeɪʃʌn pˈæθ/",
    "def": "升級路徑",
    "ex": "The escalation path was followed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv472",
    "word": "decision rights",
    "ipa_us": "/dɪsˈɪʒʌn rˈaɪts/",
    "def": "決策權限",
    "ex": "Decision rights were clarified.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv473",
    "word": "authority matrix",
    "ipa_us": "/ʌθˈɔrʌti mˈeɪtrɪks/",
    "def": "權限矩陣",
    "ex": "The authority matrix was updated.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv474",
    "word": "RACI model",
    "ipa_us": "/ˈɑr ˈeɪ ˈsiː ˈaɪ mˈɑdʌl/",
    "def": "RACI 模型",
    "ex": "The RACI model clarified responsibilities.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv475",
    "word": "handoff clarity",
    "ipa_us": "/handoff klˈɛrʌti/",
    "def": "交接清楚度",
    "ex": "Handoff clarity reduced errors.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv476",
    "word": "operational cadence review",
    "ipa_us": "/ˌɑpɝˈeɪʃʌnʌl kˈeɪdʌns rˌivjˈu/",
    "def": "營運節奏檢討",
    "ex": "The cadence review aligned teams.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv477",
    "word": "management operating system",
    "ipa_us": "/mˈænʌdʒmʌnt ˈɑpɝˌeɪtɪŋ sˈɪstʌm/",
    "def": "管理營運系統",
    "ex": "The management operating system was adopted.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv478",
    "word": "performance governance",
    "ipa_us": "/pɝfˈɔrmʌns ɡˈʌvɝnʌns/",
    "def": "績效治理",
    "ex": "Performance governance ensured discipline.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv479",
    "word": "enterprise execution",
    "ipa_us": "/ˈɛntɝprˌaɪz ˌɛksʌkjˈuʃʌn/",
    "def": "企業執行力",
    "ex": "Enterprise execution improved.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv480",
    "word": "strategy deployment",
    "ipa_us": "/strˈætʌdʒi dɪplˈɔɪmʌnt/",
    "def": "策略展開",
    "ex": "Strategy deployment was completed.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv481",
    "word": "Hoshin Kanri",
    "ipa_us": "/hoshin kanri/",
    "def": "方針管理",
    "ex": "Hoshin Kanri aligned strategy and execution.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv482",
    "word": "breakthrough objective",
    "ipa_us": "/brˈeɪkθrˌu ʌbdʒˈɛktɪv/",
    "def": "突破性目標",
    "ex": "Breakthrough objectives were defined.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv483",
    "word": "catchball process",
    "ipa_us": "/catchball prˈɑsˌɛs/",
    "def": "Catchball 溝通流程",
    "ex": "The catchball process improved alignment.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv484",
    "word": "strategy cascade",
    "ipa_us": "/strˈætʌdʒi kæskˈeɪd/",
    "def": "策略展開傳遞",
    "ex": "The strategy cascade reached all levels.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv485",
    "word": "policy deployment",
    "ipa_us": "/pˈɑlʌsi dɪplˈɔɪmʌnt/",
    "def": "政策展開",
    "ex": "Policy deployment ensured focus.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv486",
    "word": "execution review board",
    "ipa_us": "/ˌɛksʌkjˈuʃʌn rˌivjˈu bˈɔrd/",
    "def": "執行審查會",
    "ex": "The execution review board met monthly.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv487",
    "word": "performance escalation",
    "ipa_us": "/pɝfˈɔrmʌns ˌɛskʌlˈeɪʃʌn/",
    "def": "績效升級通報",
    "ex": "Performance escalation followed protocol.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv488",
    "word": "countermeasure tracking",
    "ipa_us": "/kˈaʊntɝmˌɛʒɝ trˈækɪŋ/",
    "def": "對策追蹤",
    "ex": "Countermeasures were tracked.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv489",
    "word": "standard follow-up",
    "ipa_us": "/stˈændɝd fˈɑloʊˌʌp/",
    "def": "標準追蹤",
    "ex": "Standard follow-up ensured closure.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv490",
    "word": "issue closure rate",
    "ipa_us": "/ˈɪʃu klˈoʊʒɝ rˈeɪt/",
    "def": "問題結案率",
    "ex": "The issue closure rate improved.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv491",
    "word": "operational discipline",
    "ipa_us": "/ˌɑpɝˈeɪʃʌnʌl dˈɪsʌplʌn/",
    "def": "營運紀律",
    "ex": "Operational discipline was reinforced.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv492",
    "word": "management rigor",
    "ipa_us": "/mˈænʌdʒmʌnt rˈɪɡɝ/",
    "def": "管理嚴謹度",
    "ex": "Management rigor improved execution.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv493",
    "word": "execution excellence",
    "ipa_us": "/ˌɛksʌkjˈuʃʌn ˈɛksʌlʌns/",
    "def": "執行卓越",
    "ex": "Execution excellence became a core capability.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv494",
    "word": "continuous execution improvement",
    "ipa_us": "/kʌntˈɪnjuʌs ˌɛksʌkjˈuʃʌn ˌɪmprˈuvmʌnt/",
    "def": "持續執行改善",
    "ex": "Continuous execution improvement was pursued.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv495",
    "word": "operational sustainability",
    "ipa_us": "/ˌɑpɝˈeɪʃʌnʌl sʌstˌeɪnʌbˈɪlɪti/",
    "def": "營運永續",
    "ex": "Operational sustainability was strengthened.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv496",
    "word": "enterprise resilience",
    "ipa_us": "/ˈɛntɝprˌaɪz rɪzˈɪliʌns/",
    "def": "企業韌性",
    "ex": "Enterprise resilience increased.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv497",
    "word": "long-term value creation",
    "ipa_us": "/lˈɔŋtˈɝm vˈælju kriˈeɪʃʌn/",
    "def": "長期價值創造",
    "ex": "Long-term value creation guided strategy.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv498",
    "word": "strategic sustainability",
    "ipa_us": "/strʌtˈidʒɪk sʌstˌeɪnʌbˈɪlɪti/",
    "def": "策略永續",
    "ex": "Strategic sustainability was emphasized.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv499",
    "word": "enterprise performance",
    "ipa_us": "/ˈɛntɝprˌaɪz pɝfˈɔrmʌns/",
    "def": "企業績效",
    "ex": "Enterprise performance improved year over year.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  },
  {
    "id": "sv500",
    "word": "organizational excellence",
    "ipa_us": "/ˌɔrɡʌnʌzˈeɪʃʌnʌl ˈɛksʌlʌns/",
    "def": "組織卓越",
    "ex": "Organizational excellence is the ultimate goal.",
    "reps": 0,
    "ease": 2.5,
    "interval": 1,
    "dueDate": 0,
    "lastSeen": 0
  }
]

const LEVELS = [
  { name:'Beginner',      min:0,   max:100,  clr:'#8b949e' },
  { name:'A2 Elementary', min:100, max:300,  clr:'#58a6ff' },
  { name:'B1 Intermediate',min:300,max:700,  clr:'#f5a623' },
  { name:'Conversational',min:700, max:1500, clr:'#3fb950' },
]
const BADGES = [
  { id:'first_drill', name:'First Step',      desc:'Complete your first drill',     icon:'🎯', xp:10 },
  { id:'five_drills', name:'Momentum',        desc:'Complete 5 drills',             icon:'⚡', xp:20 },
  { id:'perfect_5',   name:'Flawless Five',   desc:'5 correct answers in a row',    icon:'✨', xp:30 },
  { id:'hard_done',   name:'Deep End',        desc:'Finish a Hard dialogue',        icon:'🏆', xp:60 },
  { id:'vocab_5',     name:'Word Hoard I',    desc:'Add 5 words to vocabulary',     icon:'📖', xp:25 },
  { id:'vocab_10',    name:'Word Hoard II',   desc:'Add 10 words to vocabulary',    icon:'📚', xp:50 },
  { id:'email_done',  name:'Business Analyst',desc:'Analyze your first email',      icon:'📧', xp:25 },
  { id:'streak_3',    name:'On Fire',         desc:'Practice 3 days in a row',      icon:'🔥', xp:40 },
  { id:'b1_reached',  name:'B1 Unlocked',     desc:'Reach B1 Intermediate level',   icon:'🌟', xp:100 },
]


// ═══════════════════════════════════════════════════════════════
// DIFFICULTY LEVELS
// ═══════════════════════════════════════════════════════════════
const DIFF = {
  easy: { label:'EASY', color:'#3fb950', bg:'#3fb95018' },
  mid:  { label:'MID',  color:'#f5a623', bg:'#f5a62318' },
  hard: { label:'HARD', color:'#f85149', bg:'#f8514918' },
}
function nextDiff(d) {
  return d === 'easy' ? 'mid' : d === 'mid' ? 'hard' : 'easy'
}

// ═══════════════════════════════════════════════════════════════
// APP ICON
// ═══════════════════════════════════════════════════════════════
function AppIcon({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-label="FSI Command">
      <polygon points="20,1.5 36.5,10.5 36.5,29.5 20,38.5 3.5,29.5 3.5,10.5"
        fill="#f5a62312" stroke="#f5a62360" strokeWidth="1.3"/>
      <polygon points="20,5.5 33,13 33,27 20,34.5 7,27 7,13"
        fill="none" stroke="#f5a62330" strokeWidth="0.7"/>
      <path d="M11 20 Q13 15 15.5 20 Q18 25 20.5 20 Q23 15 25.5 20 Q28 25 29 20"
        stroke="#f5a623" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════
// HEADER
// ═══════════════════════════════════════════════════════════════
function Header({ stats, audioMode, toggleAudioMode }) {
  const xp = stats?.xp ?? 0
  const lvl = [...LEVELS].reverse().find(l => xp >= l.min) ?? LEVELS[0]
  const nxt = LEVELS[LEVELS.indexOf(lvl) + 1]
  const pct = nxt ? Math.min(100, ((xp - lvl.min) / (nxt.min - lvl.min)) * 100) : 100
  return (
    <header style={{ background:T.surf, borderBottom:`1px solid ${T.bdr}`, padding:'10px 16px', display:'flex', alignItems:'center', gap:10, position:'sticky', top:0, zIndex:10 }}>
      <AppIcon size={30} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:DISP, fontSize:12, color:T.amber, letterSpacing:'0.14em', lineHeight:1, display:'flex', alignItems:'center', gap:6 }}>FSI COMMAND v3.82
          {(() => {
            const se = getAISettings()
            const p = se.aiProvider || 'anthropic'
            const label = p === 'openai' ? 'GPT' : p === 'gemini' ? 'Gemini' : 'Claude'
            const color = p === 'openai' ? '#10a37f' : p === 'gemini' ? '#4285f4' : T.amber
            return <span style={{ fontFamily:MONO, fontSize:8, color, background:color+'18',
              border:`1px solid ${color}50`, borderRadius:5, padding:'1px 6px',
              letterSpacing:'0.06em', fontWeight:700 }}>{label}</span>
          })()}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:7, marginTop:5 }}>
          <span style={{ fontFamily:MONO, fontSize:9, color:T.txt2, whiteSpace:'nowrap' }}>{lvl.name}</span>
          <div style={{ flex:1, height:3, background:T.bdr2, borderRadius:2, overflow:'hidden' }}>
            <div style={{ width:`${pct}%`, height:'100%', background:lvl.clr, borderRadius:2, transition:'width 0.7s ease' }}/>
          </div>
          <span style={{ fontFamily:MONO, fontSize:9, color:T.amber, whiteSpace:'nowrap' }}>{xp} XP</span>
        </div>
      </div>
      {/* 全域音軌切換 🎬 / 🔊 */}
      {toggleAudioMode && (
        <div onClick={toggleAudioMode}
          title={audioMode === 'original' ? '切換為系統音' : '切換為電影原音'}
          style={{ cursor:'pointer', fontSize:16, padding:'5px 8px', borderRadius:8,
            background: audioMode === 'original' ? T.amberD : T.surf2,
            border:`1px solid ${audioMode === 'original' ? T.amber+'60' : T.bdr}`,
            transition:'all 0.15s', flexShrink:0, userSelect:'none' }}>
          {audioMode === 'original' ? '🎬' : '🔊'}
        </div>
      )}
    </header>
  )
}

// ═══════════════════════════════════════════════════════════════
// BOTTOM NAV
// ═══════════════════════════════════════════════════════════════
const NAV = [
  { id:'phrase',   label:'Phrase',  svg: <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 9h10M3 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="16" cy="13" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M18 15l1.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
  { id:'practice', label:'Build',   svg: <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M10 3L3 10h3v7h8v-7h3L10 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M8 14v-3h4v3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> },
  { id:'drill',    label:'Drill',   svg: <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { id:'vocab',    label:'Vocab',   svg: <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M7 7h6M7 10.5h6M7 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { id:'email',    label:'AI',      svg: <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M10 3a7 7 0 100 14A7 7 0 0010 3z" stroke="currentColor" strokeWidth="1.5"/><path d="M7 10h6M10 7v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { id:'movie',    label:'電影',    svg: <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M7 4v12M13 4v12M2 8h4M14 8h4M2 12h4M14 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
  { id:'settings', label:'Setup',   svg: <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.34 4.34l1.41 1.41M14.25 14.25l1.41 1.41M15.66 4.34l-1.41 1.41M5.75 14.25l-1.41 1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
]
function BottomNav({ tab, setTab }) {
  return (
    <nav style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:480, background:T.surf, borderTop:`1px solid ${T.bdr}`, display:'flex', paddingBottom:'env(safe-area-inset-bottom, 16px)', zIndex:20 }}>
      {NAV.map(n => {
        const on = tab === n.id
        return (
          <div key={n.id} onClick={() => setTab(n.id)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, cursor:'pointer', padding:'9px 0 7px', color: on ? T.amber : '#8a95a0', transition:'color 0.14s' }}>
            {n.svg}
            <span style={{ fontFamily:MONO, fontSize:7.5, letterSpacing:'0.06em', fontWeight: on ? 600 : 400 }}>{n.label.toUpperCase()}</span>
          </div>
        )
      })}
    </nav>
  )
}

// ═══════════════════════════════════════════════════════════════
// ── SECTION LABEL
// ═══════════════════════════════════════════════════════════════
function SectionLabel({ children, color = '#8a95a0' }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:2 }}>
      <div style={{ flex:1, height:1, background:T.bdr }}/>
      <span style={{ fontFamily:MONO, fontSize:9, color, letterSpacing:'0.03em' }}>{children}</span>
      <div style={{ flex:1, height:1, background:T.bdr }}/>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════
// STRESS WORD RENDERER
// Natural mixed case display. Stressed syllable shown in amber color (not caps).
// Heuristic stress rules based on common English suffixes.
// e.g. "execution" → exe·CU·tion  (CU in amber, rest normal)
//      "transparency" → trans·PA·ren·cy  (PA in amber)
// ═══════════════════════════════════════════════════════════════
function renderStressWord(word) {
  if (!word) return null
  const tokens = word.trim().split(/\s+/)

  function stressToken(tok) {
    if (!tok) return null
    const low = tok.toLowerCase()
    // Split into syllables: consonant cluster + vowel group + optional coda
    const sylRe = /[^aeiou]*[aeiou]+(?:[^aeiou]+(?=[aeiou])|[^aeiou]*$)/gi
    const syllables = low.match(sylRe) || [low]

    // Title-case the whole token (first char uppercase, rest lowercase)
    const titleTok = tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase()

    if (syllables.length <= 1) {
      // Monosyllable: display normally (no stress highlight needed)
      return <span style={{ color:T.txt }}>{titleTok}</span>
    }

    // Determine stressed syllable index
    let si = 0
    if      (/tion$|sion$|cion$/i.test(low))         si = syllables.length - 2
    else if (/ity$|ify$/i.test(low))                  si = Math.max(0, syllables.length - 3)
    else if (/ical$|ible$|ative$|ative$/i.test(low))  si = Math.max(0, syllables.length - 3)
    else if (/ment$|ness$|less$|ful$/i.test(low))     si = 0
    else if (/ate$|ize$|ise$/i.test(low) && syllables.length >= 3) si = syllables.length - 3
    else                                               si = 0

    // Reconstruct from syllables, coloring stressed one amber
    let pos = 0
    return (
      <>
        {syllables.map((syl, i) => {
          // Get the matching slice from the title-cased token
          const slice = titleTok.slice(pos, pos + syl.length)
          pos += syl.length
          return i === si
            ? <span key={i} style={{ color:T.amber, fontWeight:600 }}>{slice}</span>
            : <span key={i} style={{ color:T.txt }}>{slice}</span>
        })}
      </>
    )
  }

  return (
    <span style={{ display:'inline-flex', flexWrap:'wrap', justifyContent:'center', gap:'0.35em' }}>
      {tokens.map((tok, i) => <span key={i}>{stressToken(tok)}</span>)}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════
// DRILL TAB — Q→A Oral Response Training
// ═══════════════════════════════════════════════════════════════

// ── Fallback question templates by card type ──────────────────
const Q_TEMPLATES = {
  capacity:   ["What is the current capacity?", "How is the line running today?", "Can you update us on utilization?"],
  yield:      ["What is today's yield rate?", "How did the line perform?", "Any quality issues to report?"],
  delay:      ["What is causing the delay?", "When can we expect the shipment?", "What is the revised ETA?"],
  cost:       ["What is driving the cost increase?", "How has the cost structure changed?", "What is the main cost factor?"],
  output:     ["What was today's output?", "Did we hit the production target?", "How many units were completed?"],
  manpower:   ["What is the current headcount?", "Any manpower shortage today?", "How is staffing looking?"],
  schedule:   ["Are we on schedule?", "What is the current timeline?", "Any risk to the deadline?"],
  bottleneck: ["Where is the bottleneck?", "What is slowing down production?", "Which process needs attention?"],
  margin:     ["What caused the margin change?", "How did gross margin perform?", "What is the main margin driver?"],
  default:    ["What is the current status?", "Can you give us an update?", "What is your assessment?"],
}

const KW_TEMPLATES = {
  capacity:   ['line', '%', 'today'],
  yield:      ['rate', 'product', 'line'],
  delay:      ['reason', 'ETA', 'date'],
  cost:       ['driver', 'cost', '%'],
  output:     ['units', 'target', 'line'],
  manpower:   ['headcount', 'shortage', 'line'],
  schedule:   ['status', 'date', 'risk'],
  bottleneck: ['process', 'line', 'issue'],
  margin:     ['driver', 'margin', '%'],
  default:    ['status', 'update', 'action'],
}

// ── BOSS 追問題庫（預設，無需 API）────────────────────────────
const BOSS_FOLLOWUP = {
  capacity:   [
    "What's causing the gap from target?",
    "Can we recover by end of week?",
    "What does the team need to get back to 100%?",
  ],
  yield:      [
    "Have we identified the root cause yet?",
    "What's the trend over the past three days?",
    "Is this a process issue or a material issue?",
  ],
  delay:      [
    "Who's the customer and how critical is this order?",
    "What's the risk if we miss the revised date?",
    "Have you looped in logistics yet?",
  ],
  cost:       [
    "What's the dollar impact this quarter?",
    "Have we looked at alternative suppliers?",
    "What's the action plan to close the gap?",
  ],
  output:     [
    "How does that compare to last week?",
    "What's the bottleneck right now?",
    "Are we at risk of missing the monthly target?",
  ],
  manpower:   [
    "Is overtime an option this week?",
    "Which line is most short-staffed?",
    "Have you escalated to HR?",
  ],
  schedule:   [
    "What's the critical path item right now?",
    "Which customer is most impacted?",
    "What do you need from management to stay on track?",
  ],
  bottleneck: [
    "How long has this been the constraint?",
    "What's the fix and how long will it take?",
    "Have we reallocated resources from other lines?",
  ],
  margin:     [
    "Is this a one-time hit or a structural change?",
    "What levers do we have to recover margin?",
    "How does this compare to our annual target?",
  ],
  default:    [
    "What's the biggest risk right now?",
    "Who owns the action item?",
    "When can I expect an update?",
  ],
}

// ── AI 產生 BOSS 追問（有 API Key 時使用）────────────────────
async function generateBossFollowup(card, answer) {
  const se = getAISettings()
  const hasKey = se.aiProvider === 'gemini' ? !!se.geminiKey : se.aiProvider === 'openai' ? !!se.openaiKey : !!se.apiKey
  if (!hasKey) return null
  try {
    const prompt = `You are a senior manager in a manufacturing/electronics company.
A team member just answered your question about "${card.context}".
Their answer was: "${answer}"
Generate exactly 3 sharp follow-up questions a senior manager would realistically ask (under 12 words each, direct and pressured).
Return ONLY a JSON array of 3 strings, no markdown.
Example: ["Follow-up 1?","Follow-up 2?","Follow-up 3?"]`
    const text = await callAI([{ role:'user', content: prompt }], '')
    const qs = JSON.parse(text.replace(/```json|```/g, '').trim())
    if (Array.isArray(qs) && qs.length >= 1) return qs
  } catch {}
  return null
}

function detectCardType(card) {
  const t = (card.template + ' ' + card.context + ' ' + (card.hint||'')).toLowerCase()
  if (/capacity|utiliz|running at/.test(t))   return 'capacity'
  if (/yield|defect|quality|fpy/.test(t))      return 'yield'
  if (/delay|shipment|eta|deliver/.test(t))    return 'delay'
  if (/cost|silver|paste|material/.test(t))    return 'cost'
  if (/output|units|produc/.test(t))           return 'output'
  if (/manpower|headcount|staff|labor/.test(t))return 'manpower'
  if (/schedule|deadline|timeline|plan/.test(t))return 'schedule'
  if (/bottleneck|slow|block/.test(t))         return 'bottleneck'
  if (/margin|gross|profit/.test(t))           return 'margin'
  return 'default'
}

function buildAnswerPattern(template) {
  const main = template.replace(/\{[^}]+\}/g, '___')
  const blanks = []
  const re = /\{([^}]+)\}/g; let m
  while ((m = re.exec(template)) !== null) blanks.push(m[1])
  return { main, keywords: blanks.slice(0, 5) }
}

async function generateQuestions(card) {
  const cacheKey = 'fsi:dq:' + card.id
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) return JSON.parse(cached)
  } catch {}

  const type = detectCardType(card)
  const fallback = Q_TEMPLATES[type]

  const se = getAISettings()
  const hasKey = se.aiProvider === 'gemini' ? !!se.geminiKey : se.aiProvider === 'openai' ? !!se.openaiKey : !!se.apiKey
  if (!hasKey) return fallback

  try {
    const prompt = `Factory meeting context. Generate exactly 3 short questions (under 12 words each) that someone might ask in a meeting, where the answer would be:
"${card.template}"
Scenario: ${card.context}${card.hint ? ' — ' + card.hint : ''}

Return ONLY a JSON array of 3 strings, no markdown, no explanation.
Example: ["Question 1?","Question 2?","Question 3?"]`
    const text = await callAI([{ role:'user', content: prompt }], '')
    const questions = JSON.parse(text.replace(/```json|```/g, '').trim())
    if (Array.isArray(questions) && questions.length === 3) {
      localStorage.setItem(cacheKey, JSON.stringify(questions))
      return questions
    }
  } catch {}
  return fallback
}

// ── Progress bar component ────────────────────────────────────
function ProgressBar({ duration, onTimeout, running, color = T.amber }) {
  const [pct, setPct] = useState(100)
  const start = useRef(null)
  const raf   = useRef(null)

  useEffect(() => {
    if (!running) { setPct(100); return }
    start.current = performance.now()
    function tick(now) {
      const elapsed = now - start.current
      const remaining = Math.max(0, 1 - elapsed / (duration * 1000))
      setPct(remaining * 100)
      if (remaining > 0) {
        raf.current = requestAnimationFrame(tick)
      } else {
        onTimeout?.()
      }
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [running, duration])

  return (
    <div style={{ height:4, background:T.bdr2, borderRadius:2, overflow:'hidden' }}>
      <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:2, transition:'width 0.1s linear' }}/>
    </div>
  )
}

// ── Stage indicator ───────────────────────────────────────────
function StageIndicator({ stage }) {
  const stages = ['shadow','respond','pressure','boss']
  const labels = ['SHADOW','RESPOND','PRESSURE','BOSS']
  const colors = [T.blue, T.amber, T.red, '#f0883e']
  const ci = stages.indexOf(stage)
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      {stages.map((s, i) => (
        <div key={s} style={{ display:'flex', alignItems:'center', gap:5 }}>
          <div style={{
            width: i === ci ? 8 : 6,
            height: i === ci ? 8 : 6,
            borderRadius:'50%',
            background: i < ci ? T.grn : i === ci ? colors[i] : T.bdr2,
            transition:'all 0.3s',
            border: i === ci ? `2px solid ${colors[i]}40` : 'none',
          }}/>
          {i === ci && (
            <span style={{ fontFamily:MONO, fontSize:9, color:colors[i], letterSpacing:'0.12em', fontWeight:600 }}>
              {labels[i]}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main DrillTab ─────────────────────────────────────────────
function DrillTab({ sentences, vocab, settings }) {
  const [drillProgress, setDrillProgress] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fsi:drill') || '{}') } catch { return {} }
  })
  const [cardIdx, setCardIdx] = useState(0)
  const [phase, setPhase] = useState('question') // question | answered
  const [timedOut, setTimedOut] = useState(false)
  const [timerRunning, setTimerRunning] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [showKw, setShowKw] = useState(false)
  const [questions, setQuestions] = useState(null)
  const [loadingQ, setLoadingQ] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [rideMode, setRideMode] = useState(null) // null | 'fsi' | 'vocab'
  const [rideStatus, setRideStatus] = useState('idle') // idle | playing | paused
  const [rideCurrent, setRideCurrent] = useState({ text:'', label:'' })
  const [rideSpeed, setRideSpeed] = useState(0.6) // 0.82 | 0.6
  const [ridePaused, setRidePaused] = useState(false)
  const [activeChunk, setActiveChunk] = useState(null)
  const rideTimer = useRef(null)
  const rideStop = useRef(false)

  // ── BOSS FOLLOW-UP state ──────────────────────────────────
  const [bossPhase, setBossPhase] = useState(null)   // null | 'question' | 'answered'
  const [bossQ, setBossQ]         = useState('')     // the follow-up question
  const [bossRef, setBossRef]     = useState('')     // reference answer (filled template)
  const [bossLoading, setBossLoading] = useState(false)
  const BOSS_COLOR = '#f0883e'

  // ── Ride mode engine ──────────────────────────────────────
  function clearRideTimers() {
    if (rideTimer.current) clearTimeout(rideTimer.current)
    window.speechSynthesis?.cancel()
  }

  function speakRide(text, lang, rate, onEnd, useEleven = false) {
    if (rideStop.current) return
    const eKey = settings?.elevenKey || (() => { try { return JSON.parse(localStorage.getItem('fsi:se')||'{}')?.elevenKey??'' } catch { return '' } })()
    if (useEleven && eKey && lang === 'en-US') {
      speakElevenLabs(text, eKey, () => { if (!rideStop.current) onEnd?.() })
      return
    }
    window.speechSynthesis?.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang; u.rate = rate
    u.onend = () => { if (!rideStop.current) onEnd?.() }
    u.onerror = () => { if (!rideStop.current) onEnd?.() }
    window.speechSynthesis?.speak(u)
  }

  function startFSIRide(allCards, qMap, idx) {
    if (rideStop.current || allCards.length === 0) return
    const card = allCards[idx % allCards.length]
    const type = detectCardType(card)
    const qs = qMap[card.id] || Q_TEMPLATES[type] || Q_TEMPLATES.default
    // Rotate through 3 questions per card across cycles
    const question = qs[idx % 3] || qs[0]
    // Fill answer — pick a random option from each slot for variety
    let slotIdx = 0
    const answer = card.template.replace(/\{[^}]+\}/g, () => {
      const opts = (card.subs ?? [])[slotIdx] ?? []
      slotIdx++
      if (!opts.length) return ''
      return opts[Math.floor(Math.random() * Math.min(opts.length, 3))]
    })
    // Collect alt options for display (exclude chosen answer)
    const altsBySlot = (card.subs ?? []).map(opts =>
      opts.filter(o => !answer.includes(o)).slice(0, 2)
    ).flat()

    setRideCurrent({ text: question, label: 'QUESTION' })
    speakRide(question, 'en-US', rideSpeed, () => {
      setRideCurrent({ text: '...', label: 'YOUR TURN — 3 SEC' })
      rideTimer.current = setTimeout(() => {
        if (rideStop.current) return
        setRideCurrent({ text: answer, label: 'ANSWER', alts: altsBySlot })
        speakRide(answer, 'en-US', rideSpeed, () => {
          setRideCurrent({ text: answer, label: 'SHADOW', alts: altsBySlot })
          speakRide(answer, 'en-US', rideSpeed, () => {
            rideTimer.current = setTimeout(() => {
              const nextIdx = idx + 1
              // Re-shuffle every cycle
              if (nextIdx >= allCards.length) {
                const reshuffled = [...allCards].sort(() => Math.random() - 0.5)
                startFSIRide(reshuffled, qMap, 0)
              } else {
                startFSIRide(allCards, qMap, nextIdx)
              }
            }, 1000)
          })
        })
      }, 3000)
    })
  }

  function startVocabRide(words, idx) {
    if (rideStop.current || words.length === 0) return
    // Re-shuffle at the start of each new cycle
    const list = idx === 0 ? [...words].sort(() => Math.random() - 0.5) : words
    const w = list[idx % list.length]
    setRideCurrent({ text: w.word, label: 'WORD', ipa: w.ipa_us || '' })
    speakRide(w.word, 'en-US', 0.6, () => {
      rideTimer.current = setTimeout(() => {
        if (rideStop.current) return
        const def = w.def || w.word
        const lang = /[一-鿿]/.test(def) ? 'zh-TW' : 'en-US'
        setRideCurrent({ text: def, label: 'DEFINITION' })
        speakRide(def, lang, 0.6, () => {
          rideTimer.current = setTimeout(() => {
            const nextIdx = idx + 1
            // Re-shuffle every cycle
            if (nextIdx >= list.length) {
              startVocabRide([...words].sort(() => Math.random() - 0.5), 0)
            } else {
              startVocabRide(list, nextIdx)
            }
          }, 1000)
        })
      }, 1200)  // slightly longer pause after ElevenLabs word
    }, true)  // useEleven=true for word pronunciation
  }

  function beginRide(mode) {
    rideStop.current = false
    setRideMode(mode)
    setRideStatus('playing')
    if (mode === 'fsi') {
      const allCards = (sentences ?? []).filter(s => s.mode === 'simple')
      const shuffled = [...allCards].sort(() => Math.random() - 0.5)
      // Build question map from cache
      const qMap = {}
      shuffled.forEach(c => {
        try { const v = localStorage.getItem('fsi:dq:' + c.id); if (v) qMap[c.id] = JSON.parse(v) } catch {}
      })
      startFSIRide(shuffled, qMap, 0)
    } else {
      const words = [...(vocab ?? [])].filter(v => !v.archived).sort(() => Math.random() - 0.5)
      startVocabRide(words, 0)
    }
  }

  function stopRide() {
    rideStop.current = true
    clearRideTimers()
    setRideMode(null)
    setRideStatus('idle')
    setRideCurrent({ text:'', label:'' })
    setRidePaused(false)
  }

  function pauseRide() {
    rideStop.current = true      // stop the chain
    clearRideTimers()
    window.speechSynthesis?.cancel()
    setRidePaused(true)
    setRideStatus('paused')
  }

  function resumeRide() {
    rideStop.current = false
    setRidePaused(false)
    setRideStatus('playing')
    // Resume: re-enter at current word/card
    if (rideMode === 'vocab') {
      const words = [...(vocab ?? [])].filter(v => !v.archived).sort(() => Math.random() - 0.5)
      startVocabRide(words, 0)
    } else if (rideMode === 'fsi') {
      const allCards = (sentences ?? []).filter(s => s.mode === 'simple')
      const shuffled = [...allCards].sort(() => Math.random() - 0.5)
      const qMap = {}
      shuffled.forEach(c => {
        try { const v = localStorage.getItem('fsi:dq:' + c.id); if (v) qMap[c.id] = JSON.parse(v) } catch {}
      })
      startFSIRide(shuffled, qMap, 0)
    }
  }

  // Cleanup on unmount
  useEffect(() => () => { rideStop.current = true; clearRideTimers() }, [])

  const cards = useMemo(() => (sentences ?? []).filter(s => s.mode === 'simple'), [sentences])

  function getProgress(id) {
    return drillProgress[id] ?? { stage:'shadow', shadowCount:0, respondOk:0, qIndex:0 }
  }

  function saveProgress(id, data) {
    setDrillProgress(prev => {
      const next = { ...prev, [id]: { ...getProgress(id), ...data } }
      localStorage.setItem('fsi:drill', JSON.stringify(next))
      return next
    })
  }

  const card = cards.length > 0 ? cards[cardIdx % cards.length] : null
  const prog = card ? getProgress(card.id) : null
  const stage = prog?.stage ?? 'shadow'
  const type  = card ? detectCardType(card) : 'default'
  const pattern = card ? buildAnswerPattern(card.template) : null
  const qIndex = prog?.qIndex ?? 0
  const currentQ = questions ? questions[qIndex % 3] : null

  // Load questions when card changes
  useEffect(() => {
    if (!card) return
    setPhase('question')
    setTimedOut(false)
    setTimerRunning(false)
    setShowHint(false)
    setShowKw(false)
    setQuestions(null)

    const cacheKey = 'fsi:dq:' + card.id
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try { setQuestions(JSON.parse(cached)); return } catch {}
    }
    if (stage !== 'shadow') {
      setLoadingQ(true)
      generateQuestions(card).then(qs => {
        setQuestions(qs); setLoadingQ(false)
      })
    } else {
      // Silent background generation during shadow stage
      generateQuestions(card).then(qs => setQuestions(qs))
    }
  }, [cardIdx, card?.id])

  // Start timer when entering respond/pressure question phase
  useEffect(() => {
    if (phase === 'question' && (stage === 'respond' || stage === 'pressure')) {
      const t = setTimeout(() => setTimerRunning(true), 400)
      return () => clearTimeout(t)
    }
  }, [phase, stage, cardIdx])

  function handleTimeout() {
    if (stage === 'pressure') setShowKw(true)
    if (stage === 'respond')  setTimedOut(true)
  }

  function buildDrillFilled(c) {
    if (!c?.template) return ''
    let slotIdx = 0
    return c.template.replace(/\{([^}]+)\}/g, (_, label) => {
      const group = (c.subs ?? [])[slotIdx] ?? []
      slotIdx++
      return group.length > 0 ? group[0] : label
    })
  }

  function handleSpoke() {
    setTimerRunning(false)
    setPhase('answered')
    speak(buildDrillFilled(card))
  }

  function handleShadow() {
    const newCount = (prog.shadowCount ?? 0) + 1
    if (newCount >= 3) {
      saveProgress(card.id, { shadowCount: newCount, stage: 'respond' })
      speak(buildDrillFilled(card))
      setTimeout(() => nextCard(), 1200)
    } else {
      saveProgress(card.id, { shadowCount: newCount })
      speak(buildDrillFilled(card))
    }
  }

  function handleRate(ok) {
    const newOk = (prog.respondOk ?? 0) + (ok ? 1 : 0)
    const nextQIndex = (qIndex + 1) % 3

    if (stage === 'respond' && newOk >= 3) {
      saveProgress(card.id, { stage:'pressure', respondOk: newOk, qIndex: nextQIndex })
    } else {
      if (stage === 'pressure') {
        const rotate = Math.random() < 0.3 ? 'respond' : 'pressure'
        saveProgress(card.id, { stage: rotate, qIndex: nextQIndex })
      } else {
        saveProgress(card.id, { respondOk: newOk, qIndex: nextQIndex })
      }
    }

    // 30% 機率觸發 BOSS（只在 respond 或 pressure 且有開口時）
    if (ok && (stage === 'respond' || stage === 'pressure') && Math.random() < 0.30) {
      triggerBoss()
    } else {
      nextCard()
    }
  }

  async function triggerBoss() {
    const cardType  = detectCardType(card)
    const fallbacks = BOSS_FOLLOWUP[cardType] || BOSS_FOLLOWUP.default
    const fallbackQ = fallbacks[Math.floor(Math.random() * fallbacks.length)]
    const filledAns = buildDrillFilled(card)

    // Build reference answer string (show first option per slot clearly)
    setBossPhase('question')
    setBossQ(fallbackQ)
    setBossRef(filledAns)

    // Speak the boss question
    speak(fallbackQ, 0.82)

    // Try AI in background
    const se = getAISettings()
    const hasKey = se.aiProvider === 'gemini' ? !!se.geminiKey : se.aiProvider === 'openai' ? !!se.openaiKey : !!se.apiKey
    if (hasKey) {
      setBossLoading(true)
      generateBossFollowup(card, filledAns).then(aiQs => {
        setBossLoading(false)
        if (aiQs && aiQs.length > 0) {
          const aiQ = aiQs[Math.floor(Math.random() * aiQs.length)]
          setBossQ(aiQ)
          // Re-speak with AI question
          speak(aiQ, 0.82)
        }
      })
    }
  }

  function nextCard() {
    setCardIdx(i => (i + 1) % Math.max(1, cards.length))
    setPhase('question')
    setTimedOut(false)
    setTimerRunning(false)
    setShowHint(false)
    setShowKw(false)
    setBossPhase(null)
    setBossQ('')
    setBossRef('')
  }

  if (!card) return (
    <div style={{ padding:'40px 16px', textAlign:'center', color:T.txt3, fontFamily:SERIF, fontSize:14 }}>
      練習庫是空的。<br/>先在 Practice 或 AI 標籤新增句子。
    </div>
  )

  const shadowCount = prog.shadowCount ?? 0
  const respondOk   = prog.respondOk ?? 0

  // ── Ride Mode Overlay ────────────────────────────────────────
  if (rideMode) {
    const isYourTurn = rideCurrent.label.includes('YOUR TURN')
    const isAnswer   = rideCurrent.label === 'ANSWER' || rideCurrent.label === 'SHADOW'
    const isWord     = rideCurrent.label === 'WORD'
    const isDef      = rideCurrent.label === 'DEFINITION'
    return (
      <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:T.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:24, padding:32, zIndex:100 }}>
        {/* Status label */}
        <div style={{ fontFamily:MONO, fontSize:10, color: isYourTurn ? T.grn : isAnswer ? T.amber : T.txt3, letterSpacing:'0.18em', animation: isYourTurn ? 'pulse 1s infinite' : 'none' }}>
          {rideCurrent.label || (rideMode === 'fsi' ? 'FSI RIDE' : 'VOCAB RIDE')}
        </div>

        {/* Current text */}
        {isWord ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            <div style={{ fontFamily:SERIF, fontSize:28, fontWeight:400, color:T.amber, textAlign:'center', lineHeight:1.4, maxWidth:320, letterSpacing:'0.02em' }}>
              {renderStressWord(rideCurrent.text)}
            </div>
            {rideCurrent.ipa && (
              <div style={{ fontFamily:MONO, fontSize:11, color:T.txt3, letterSpacing:'0.05em' }}>
                {rideCurrent.ipa}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
            <div style={{ fontFamily:MONO, fontSize: isYourTurn ? 22 : 18, color: isYourTurn ? T.grn : ridePaused ? T.txt2 : T.txt, textAlign:'center', lineHeight:1.6, maxWidth:320 }}>
              {isYourTurn ? '開口說 ···' : (rideCurrent.text || '···')}
            </div>
            {isAnswer && rideCurrent.alts && rideCurrent.alts.length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center', maxWidth:300 }}>
                {rideCurrent.alts.map((alt, ai) => (
                  <span key={ai} style={{ fontFamily:MONO, fontSize:9, color:T.txt3, background:T.surf2, border:`1px solid ${T.bdr}`, borderRadius:5, padding:'3px 8px' }}>
                    {alt}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Paused indicator */}
        {ridePaused && (
          <div style={{ fontFamily:MONO, fontSize:11, color:T.amber, letterSpacing:'0.14em', animation:'pulse 1.5s infinite' }}>
            ⏸ 已暫停
          </div>
        )}

        {/* Waveform animation */}
        <div style={{ display:'flex', alignItems:'center', gap:4, height:32 }}>
          {[1,2,3,4,5,6,7].map(i => (
            <div key={i} style={{
              width:4, borderRadius:2,
              background: isYourTurn ? T.grn : T.amber,
              height: isYourTurn ? 8 : `${10 + Math.sin(i * 0.9) * 14}px`,
              animation: (!isYourTurn) ? `pulse ${0.4 + i*0.08}s ease infinite alternate` : 'none',
              opacity: isYourTurn ? 0.3 : 0.8,
              transition:'height 0.3s'
            }}/>
          ))}
        </div>

        {/* Mode indicator */}
        <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, letterSpacing:'0.1em' }}>
          {rideMode === 'fsi' ? '🚴 FSI 騎車模式' : '🎧 單字騎車模式'}
        </div>

        {/* Pause / Resume / Stop buttons */}
        <div style={{ display:'flex', flexDirection:'column', gap:12, width:'100%', maxWidth:280, marginTop:20 }}>
          {ridePaused ? (
            <button className="btn" onClick={resumeRide}
              style={{ background:`${T.grn}20`, border:`2px solid ${T.grn}80`, color:T.grn, padding:'16px 0', fontSize:14, letterSpacing:'0.12em', borderRadius:14, width:'100%' }}>
              ▶ 繼續
            </button>
          ) : (
            <button className="btn" onClick={pauseRide}
              style={{ background:`${T.amber}15`, border:`2px solid ${T.amber}60`, color:T.amber, padding:'16px 0', fontSize:14, letterSpacing:'0.12em', borderRadius:14, width:'100%' }}>
              ⏸ 暫停
            </button>
          )}

          {/* Spacer + divider to prevent accidental stop tap */}
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 4px' }}>
            <div style={{ flex:1, height:1, background:T.bdr }}/>
            <span style={{ fontFamily:MONO, fontSize:8, color:T.txt3, letterSpacing:'0.08em' }}>
              {ridePaused ? '確認結束？' : '結束練習'}
            </span>
            <div style={{ flex:1, height:1, background:T.bdr }}/>
          </div>

          <button className="btn" onClick={stopRide}
            style={{ background:T.redD, border:`1px solid ${T.red}50`, color:T.red, padding:'11px 0', fontSize:12, letterSpacing:'0.12em', borderRadius:14, width:'100%', opacity:0.85 }}>
            ■ 停止
          </button>
        </div>
        <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:11, color:T.txt3 }}>
          {ridePaused ? '看清楚後按繼續，或按停止結束' : '到達目的地後按停止'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:14 }} className="fadeUp">

      {/* ── RIDE MODE BUTTONS ── */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, letterSpacing:'0.12em', marginBottom:2 }}>騎車模式 — 純口說反射</div>
        {/* Speed selector */}
        <div style={{ display:'flex', gap:6, marginBottom:4 }}>
          <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, alignSelf:'center' }}>語速：</div>
          {[{label:'0.82x (正常)', val:0.82},{label:'0.6x (慢)', val:0.6}].map(s => (
            <div key={s.val} onClick={() => setRideSpeed(s.val)}
              style={{ padding:'4px 12px', borderRadius:12, fontFamily:MONO, fontSize:9, cursor:'pointer',
                background: rideSpeed === s.val ? T.amberD : T.surf2,
                border: `1px solid ${rideSpeed === s.val ? T.amber+'60' : T.bdr}`,
                color: rideSpeed === s.val ? T.amber : T.txt3 }}>
              {s.label}
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn" onClick={() => beginRide('fsi')}
            style={{ flex:1, background:`${T.amber}15`, border:`1px solid ${T.amber}50`, color:T.amber, padding:'13px 8px', fontSize:11, letterSpacing:'0.06em' }}>
            🚴 FSI 騎車練習
          </button>
          <button className="btn" onClick={() => beginRide('vocab')}
            style={{ flex:1, background:`${T.blue}15`, border:`1px solid ${T.blue}50`, color:T.blue, padding:'13px 8px', fontSize:11, letterSpacing:'0.06em' }}>
            🎧 單字騎車練習
          </button>
        </div>
        <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:11, color:T.txt3, lineHeight:1.5 }}>
          問題 → 3秒開口 → 答案 → Shadow → 下一題，全程免手
        </div>
      </div>

      <div style={{ height:1, background:T.bdr }}/>

      {/* Header: stage + info */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <StageIndicator stage={stage}/>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
            {cardIdx % cards.length + 1}/{cards.length}
          </span>
          <div onClick={() => setShowInfo(s=>!s)}
            style={{ cursor:'pointer', color: showInfo ? T.amber : T.txt3, padding:'4px 8px', background:T.surf2, borderRadius:7, fontFamily:MONO, fontSize:10 }}>?</div>
        </div>
      </div>

      {/* Info panel */}
      {showInfo && (
        <div style={{ background:T.surf2, border:`1px solid ${T.bdr2}`, borderRadius:11, padding:14 }} className="fadeUp">
          <div style={{ fontFamily:MONO, fontSize:9, color:T.amber, marginBottom:8, letterSpacing:'0.1em' }}>DRILL 三階段說明</div>
          <div style={{ fontFamily:SERIF, fontSize:13, color:T.txt2, lineHeight:1.75 }}>
            <b style={{color:T.blue}}>SHADOW</b> — 看完整句，跟TTS朗讀3次，熟悉句型後自動升級<br/>
            <b style={{color:T.amber}}>RESPOND</b> — 看問題，5秒內開口說完整句，按「我說完了」看答案<br/>
            <b style={{color:T.red}}>PRESSURE</b> — 3秒倒數，超時只顯示關鍵詞，模擬會議壓力<br/>
            <b style={{color:'#f0883e'}}>BOSS</b> — 答完後 30% 機率主管追問，即時應對真實追問情境
          </div>
        </div>
      )}

      {/* ─── SHADOW STAGE ─────────────────────────────── */}
      {stage === 'shadow' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:14, padding:20 }}>
            <div style={{ fontFamily:MONO, fontSize:8.5, color:'#9aa5b0', letterSpacing:'0.03em', marginBottom:10 }}>
              {card.context}
              {card.hint && <span style={{ color:T.txt3 }}> — {card.hint}</span>}
            </div>
            <div style={{ fontFamily:MONO, fontSize:14, color:T.txt, lineHeight:2, marginBottom:16 }}>
              {card.template.replace(/\{[^}]+\}/g, w =>
                `[${w.slice(1,-1)}]`
              ).split(/(\[[^\]]+\])/).map((part, i) =>
                part.startsWith('[') ? (
                  <span key={i} style={{ color:T.amber, fontWeight:500 }}>{part}</span>
                ) : <span key={i}>{part}</span>
              )}
            </div>

            {/* linked_hint 連音視覺化 */}
            {card.linked_hint && (() => {
              const chunks = extractLiaisonChunks(card.linked_hint)
              return (
                <div style={{ marginBottom:14, padding:'11px 13px', background:T.surf2, borderRadius:10, border:`1px solid ${T.amber}22` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <span style={{ fontFamily:MONO, fontSize:8, color:T.amber }}>· 連音</span>
                    <span style={{ fontFamily:MONO, fontSize:8, color:T.txt3 }}>[ ] 弱化</span>
                    <span style={{ fontFamily:MONO, fontSize:8, color:T.txt3 }}>( ) 省略</span>
                    <span style={{ fontFamily:MONO, fontSize:8, color:T.txt, fontWeight:700 }}>大寫 重音</span>
                  </div>
                  <div style={{ fontFamily:SERIF, fontSize:15, lineHeight:2, letterSpacing:'0.02em', color:T.txt2, marginBottom: chunks.length ? 10 : 0 }}>
                    {renderLinkedHint(card.linked_hint)}
                  </div>
                  {chunks.length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      <div style={{ width:'100%', fontFamily:MONO, fontSize:8, color:T.txt3, marginBottom:3 }}>
                        點擊連音片段 → {settings?.elevenKey ? '🎙 AI 高品質語音' : '先慢速，再正常速'}
                      </div>
                      {chunks.map((c, ci) => {
                        const isActive = activeChunk === ci
                        return (
                          <div key={ci} onClick={async () => {
                            setActiveChunk(ci)
                            const eKey = settings?.elevenKey || (() => { try { return JSON.parse(localStorage.getItem('fsi:se')||'{}')?.elevenKey??'' } catch { return '' } })()
                            if (eKey) {
                              await speakElevenLabs(c.tts, eKey, () => setActiveChunk(null))
                            } else {
                              window.speechSynthesis?.cancel()
                              const u1 = new SpeechSynthesisUtterance(c.tts)
                              u1.lang = 'en-US'; u1.rate = 0.5
                              u1.onend = () => {
                                setTimeout(() => {
                                  const u2 = new SpeechSynthesisUtterance(c.tts)
                                  u2.lang = 'en-US'; u2.rate = 0.82
                                  u2.onend = () => setActiveChunk(null)
                                  window.speechSynthesis?.speak(u2)
                                }, 600)
                              }
                              window.speechSynthesis?.speak(u1)
                            }
                          }}
                            style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer',
                              background: isActive ? T.amber+'40' : T.amberD,
                              border:`1px solid ${isActive ? T.amber : T.amber+'40'}`,
                              borderRadius:7, padding:'4px 9px', transition:'all 0.14s' }}>
                            <span style={{ fontFamily:MONO, fontSize:10, color:T.amber }}>{c.label}</span>
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{color:T.amber}}><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.4" fill="none"/><path d="M10.5 5a3 3 0 010 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                            <span style={{ fontFamily:MONO, fontSize:8, color:T.txt3 }}>{settings?.elevenKey ? '🎙 AI' : '慢→正常'}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            <div style={{ display:'flex', gap:8 }}>
              <div onClick={() => speak(buildDrillFilled(card), 0.82)} style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', color:T.txt3, padding:'5px 10px', background:T.bdr, borderRadius:7, transition:'color 0.14s' }}
                onMouseOver={e=>e.currentTarget.style.color=T.amber} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M10.5 5a3 3 0 010 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M12 2.5a6 6 0 010 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                <span style={{ fontFamily:MONO, fontSize:9 }}>0.82x</span>
              </div>
              <div onClick={() => speak(buildDrillFilled(card), 0.6)} style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', color:T.txt3, padding:'5px 10px', background:T.bdr, borderRadius:7, transition:'color 0.14s' }}
                onMouseOver={e=>e.currentTarget.style.color=T.blue} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
                <span style={{ fontFamily:MONO, fontSize:11 }}>🐢</span>
                <span style={{ fontFamily:MONO, fontSize:9 }}>0.6x</span>
              </div>
            </div>
          </div>

          {/* Shadow progress */}
          <div style={{ display:'flex', gap:6, justifyContent:'center', marginBottom:4 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width:10, height:10, borderRadius:'50%', background: i < shadowCount ? T.blue : T.bdr2, transition:'background 0.3s' }}/>
            ))}
          </div>
          <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:12, color:T.txt3, textAlign:'center' }}>
            {shadowCount === 0 ? '跟著TTS朗讀，按下方按鈕計次' : shadowCount === 1 ? '再跟讀 2 次後解鎖下一階段' : '再跟讀 1 次後解鎖下一階段'}
          </div>

          <button className="btn" onClick={handleShadow}
            style={{ background:T.blueD, border:`1px solid ${T.blue}60`, color:T.blue, width:'100%', fontSize:12, letterSpacing:'0.08em', padding:'14px' }}>
            🎙 跟讀（{shadowCount}/3）
          </button>
        </div>
      )}

      {/* ─── RESPOND / PRESSURE STAGE ─────────────────── */}
      {(stage === 'respond' || stage === 'pressure') && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

          {/* Question card */}
          <div style={{ background:T.surf, border:`1px solid ${stage==='pressure' ? T.red+'40' : T.bdr}`, borderRadius:14, padding:20 }}>
            <div style={{ fontFamily:MONO, fontSize:8.5, color:'#9aa5b0', letterSpacing:'0.03em', marginBottom:12 }}>
              {card.context}
            </div>

            {loadingQ ? (
              <div style={{ fontFamily:MONO, fontSize:11, color:T.txt3, animation:'pulse 1.2s infinite' }}>生成問題中…</div>
            ) : (
              <div style={{ fontFamily:SERIF, fontSize:17, color:T.txt, lineHeight:1.55, marginBottom:14 }}>
                {currentQ ?? Q_TEMPLATES[type][qIndex % 3]}
              </div>
            )}

            {/* Timer bar */}
            {phase === 'question' && (
              <ProgressBar
                duration={stage === 'pressure' ? 3 : 5}
                running={timerRunning}
                onTimeout={handleTimeout}
                color={stage === 'pressure' ? T.red : T.amber}
              />
            )}

            {/* Respond: Answer Pattern */}
            {stage === 'respond' && phase === 'question' && (
              <div style={{ marginTop:14, background:T.surf2, borderRadius:9, padding:12 }}>
                <div style={{ fontFamily:MONO, fontSize:8.5, color:T.amber, letterSpacing:'0.1em', marginBottom:7 }}>ANSWER PATTERN</div>
                <div style={{ fontFamily:MONO, fontSize:12, color:T.txt, lineHeight:1.7, marginBottom:6 }}>
                  {pattern?.main}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                  {pattern?.keywords.map((k,i) => (
                    <span key={i} style={{ fontFamily:MONO, fontSize:10, color:T.txt2, background:T.bdr, padding:'2px 8px', borderRadius:10 }}>{k}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Pressure: keyword hint after timeout */}
            {stage === 'pressure' && showKw && phase === 'question' && (
              <div style={{ marginTop:12, display:'flex', gap:6, flexWrap:'wrap' }} className="fadeUp">
                {KW_TEMPLATES[type].map((k,i) => (
                  <span key={i} style={{ fontFamily:MONO, fontSize:11, color:T.red, background:`${T.red}12`, border:`1px solid ${T.red}40`, padding:'3px 10px', borderRadius:12 }}>{k}</span>
                ))}
              </div>
            )}

            {/* Respond: hint button */}
            {stage === 'respond' && phase === 'question' && !showHint && (
              <div onClick={() => setShowHint(true)} style={{ marginTop:12, cursor:'pointer', fontFamily:MONO, fontSize:10, color:T.txt3, display:'inline-flex', alignItems:'center', gap:5 }}>
                <span style={{ fontSize:8 }}>▶</span> HINT
              </div>
            )}
            {stage === 'respond' && showHint && (
              <div style={{ marginTop:10, fontFamily:MONO, fontSize:11, color:T.amber, lineHeight:1.6 }} className="fadeUp">
                {KW_TEMPLATES[type].join(' / ')}
              </div>
            )}
          </div>

          {/* Timed out warning (respond) */}
          {timedOut && phase === 'question' && (
            <div style={{ fontFamily:MONO, fontSize:10, color:T.red, textAlign:'center', animation:'pulse 1.5s infinite' }}>
              ⏱ 時間到！先開口說，再按「我說完了」
            </div>
          )}

          {/* Speak button */}
          {phase === 'question' && (
            <button className="btn" onClick={handleSpoke}
              style={{ background: stage==='pressure' ? `${T.red}20` : T.amberD, border:`1px solid ${stage==='pressure' ? T.red+'60' : T.amber+'60'}`, color: stage==='pressure' ? T.red : T.amber, width:'100%', fontSize:12, letterSpacing:'0.08em', padding:'15px' }}>
              🎙 我說完了，看答案
            </button>
          )}

          {/* Answer reveal */}
          {phase === 'answered' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }} className="fadeUp">
              <div style={{ background:T.surf, border:`1px solid ${T.grn}40`, borderRadius:12, padding:18 }}>
                <div style={{ fontFamily:MONO, fontSize:8.5, color:T.grn, letterSpacing:'0.1em', marginBottom:8 }}>ANSWER</div>
                <div style={{ fontFamily:MONO, fontSize:14, color:T.txt, lineHeight:1.9 }}>
                  {card.template.replace(/\{[^}]+\}/g, w =>
                    `[${w.slice(1,-1)}]`
                  ).split(/(\[[^\]]+\])/).map((part, i) =>
                    part.startsWith('[') ? (
                      <span key={i} style={{ color:T.amber, fontWeight:500 }}>{part}</span>
                    ) : <span key={i}>{part}</span>
                  )}
                </div>
                <div style={{ display:'flex', gap:10, marginTop:12 }}>
                  <div onClick={() => speak(buildDrillFilled(card))} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:5, color:T.txt3, fontFamily:MONO, fontSize:10 }}
                    onMouseOver={e=>e.currentTarget.style.color=T.amber} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M10.5 5a3 3 0 010 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    Replay
                  </div>
                  <div onClick={() => { speak(buildDrillFilled(card), 0.6) }} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:5, color:T.txt3, fontFamily:MONO, fontSize:10 }}
                    onMouseOver={e=>e.currentTarget.style.color=T.blue} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M10.5 5a3 3 0 010 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    Repeat Slow
                  </div>
                </div>
              </div>

              {/* Stage progress info */}
              {stage === 'respond' && (
                <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, textAlign:'center' }}>
                  RESPOND 進度：{respondOk}/3 ✓ 解鎖 PRESSURE
                </div>
              )}

              {/* Rating */}
              <div style={{ display:'flex', gap:10 }}>
                <button className="btn" onClick={() => handleRate(false)}
                  style={{ flex:1, background:T.redD, border:`1px solid ${T.red}50`, color:T.red, fontSize:13, padding:'14px' }}>
                  ✗ 沒開口
                </button>
                <button className="btn" onClick={() => handleRate(true)}
                  style={{ flex:1, background:T.grnD, border:`1px solid ${T.grn}50`, color:T.grn, fontSize:13, padding:'14px' }}>
                  ✓ 有開口
                </button>
              </div>

              {/* Weakness tags */}
              {phase === 'answered' && (() => {
                const WEAKNESS_TAGS = [
                  { id:'vocab',   label:'詞彙不足', icon:'📖', color:T.blue },
                  { id:'fluency', label:'說不流暢', icon:'🗣️', color:T.amber },
                  { id:'grammar', label:'文法錯誤', icon:'📝', color:'#a371f7' },
                  { id:'blank',   label:'腦袋空白', icon:'🫥', color:T.red },
                  { id:'stress',  label:'重音錯誤', icon:'🎵', color:T.grn },
                ]
                const cardTags = drillProgress[card.id]?.weakTags ?? []
                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <div style={{ fontFamily:MONO, fontSize:8, color:T.txt3, letterSpacing:'0.08em' }}>⚑ 標記弱點（選填）</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                      {WEAKNESS_TAGS.map(tag => {
                        const active = cardTags.includes(tag.id)
                        return (
                          <div key={tag.id}
                            onClick={() => {
                              const next = active
                                ? cardTags.filter(t => t !== tag.id)
                                : [...cardTags, tag.id]
                              saveProgress(card.id, { weakTags: next })
                            }}
                            style={{
                              display:'inline-flex', alignItems:'center', gap:4,
                              padding:'3px 9px', borderRadius:12, cursor:'pointer',
                              fontFamily:MONO, fontSize:9,
                              background: active ? tag.color+'22' : T.surf2,
                              border:`1px solid ${active ? tag.color+'80' : T.bdr}`,
                              color: active ? tag.color : T.txt3,
                              transition:'all 0.14s', userSelect:'none',
                            }}>
                            <span>{tag.icon}</span>
                            <span>{tag.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* ─── BOSS FOLLOW-UP OVERLAY ───────────────────── */}
      {bossPhase && (
        <div style={{ position:'fixed', inset:0, background:'#00000095', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:'0 0 calc(120px + env(safe-area-inset-bottom,20px)) 0' }} className="fadeUp">
          <div style={{ width:'100%', maxWidth:480, background:T.surf, border:`2px solid ${BOSS_COLOR}60`, borderRadius:'20px 20px 0 0', padding:'22px 20px 24px', display:'flex', flexDirection:'column', gap:16 }}>

            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:`${BOSS_COLOR}22`, border:`2px solid ${BOSS_COLOR}60`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                👔
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:MONO, fontSize:9, color:BOSS_COLOR, letterSpacing:'0.14em', marginBottom:2 }}>
                  BOSS FOLLOW-UP {bossLoading ? <span style={{ color:T.txt3 }}>— AI 產生中…</span> : ''}
                </div>
                <div style={{ fontFamily:MONO, fontSize:8, color:T.txt3 }}>主管追問，30 秒內開口回應</div>
              </div>
            </div>

            {/* Boss question */}
            <div style={{ background:`${BOSS_COLOR}12`, border:`1px solid ${BOSS_COLOR}40`, borderRadius:14, padding:'18px 16px' }}>
              <div style={{ fontFamily:SERIF, fontSize:18, color:T.txt, lineHeight:1.55 }}>
                {bossQ || '…'}
              </div>
              <div onClick={() => speak(bossQ, 0.82)}
                style={{ marginTop:12, display:'inline-flex', alignItems:'center', gap:5, cursor:'pointer',
                  fontFamily:MONO, fontSize:9, color:BOSS_COLOR, background:`${BOSS_COLOR}15`,
                  border:`1px solid ${BOSS_COLOR}40`, padding:'4px 10px', borderRadius:8 }}>
                🔊 再聽一次
              </div>
            </div>

            {/* Reference answer (shown after spoke) */}
            {bossPhase === 'answered' && (
              <div style={{ background:T.grnD, border:`1px solid ${T.grn}40`, borderRadius:12, padding:'14px 16px' }} className="fadeUp">
                <div style={{ fontFamily:MONO, fontSize:8, color:T.grn, letterSpacing:'0.1em', marginBottom:8 }}>參考答案</div>
                <div style={{ fontFamily:MONO, fontSize:13, color:T.txt, lineHeight:1.8 }}>
                  {bossRef}
                </div>
                <div onClick={() => speak(bossRef, 0.75)}
                  style={{ marginTop:10, display:'inline-flex', alignItems:'center', gap:5, cursor:'pointer',
                    fontFamily:MONO, fontSize:9, color:T.grn, background:T.grnD,
                    border:`1px solid ${T.grn}40`, padding:'4px 10px', borderRadius:8 }}>
                  🔊 聽範例
                </div>
              </div>
            )}

            {/* Buttons */}
            {bossPhase === 'question' ? (
              <button className="btn" onClick={() => setBossPhase('answered')}
                style={{ background:`${BOSS_COLOR}20`, border:`2px solid ${BOSS_COLOR}70`, color:BOSS_COLOR,
                  fontSize:13, fontWeight:700, padding:'15px', letterSpacing:'0.08em' }}>
                🎙 我說完了，看參考答案
              </button>
            ) : (
              <button className="btn" onClick={nextCard}
                style={{ background:T.grnD, border:`1px solid ${T.grn}60`, color:T.grn,
                  fontSize:13, fontWeight:700, padding:'15px', letterSpacing:'0.08em' }}>
                ✓ 繼續下一題 →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// PRACTICE TAB
// ═══════════════════════════════════════════════════════════════
function PracticeTab({ sentences, vocab, stats, settings, updateSentences, updateStats, awardBadge }) {
  const [mode, setMode] = useState('simple')
  const [category, setCategory] = useState('all')
  const [showInfo, setShowInfo] = useState(false)
  const [idx, setIdx] = useState(0)
  const [sels, setSels] = useState({})
  const [revealed, setRevealed] = useState(false)
  const [toast, setToast] = useState('')
  const [round, setRound] = useState(1)
  const [showRoundComplete, setShowRoundComplete] = useState(false)
  const [editingHint, setEditingHint] = useState(false)
  const [hintDraft, setHintDraft] = useState('')
  const [activeChunk, setActiveChunk] = useState(null)
  const [filledHint, setFilledHint] = useState(null)
  const [generatingFilledHint, setGeneratingFilledHint] = useState(false)
  const [generatingChunkZh, setGeneratingChunkZh] = useState(false)
  // Chinese translation
  const [zhTranslation, setZhTranslation]   = useState(null)   // string | null
  const [generatingZh, setGeneratingZh]     = useState(false)
  // Slot inline editing
  const [slotEditMode, setSlotEditMode] = useState(false)   // show edit controls
  const [addingSlot, setAddingSlot]     = useState(null)    // gi index being added to
  const [newOptText, setNewOptText]     = useState('')
  const [showFsiList, setShowFsiList]   = useState(false)   // FSI 一覽表
  const [dailyCount, setDailyCount] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('fsi:daily') || 'null')
      const today = new Date().toISOString().slice(0,10)
      return (saved?.date === today) ? (saved.count ?? 0) : 0
    } catch { return 0 }
  })
  const [dailyGoal] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fsi:goal') || '50') } catch { return 50 }
  })

  const LIFE_CONTEXTS = ['Daily Life','Greeting','Travel','Shopping','Food','Health','Family','Hobby','Lifestyle','生活']
  const isWork = (s) => !LIFE_CONTEXTS.some(c => (s.context??'').toLowerCase().includes(c.toLowerCase()))

  const queue = useMemo(() => {
    let filtered = (sentences ?? []).filter(s => {
      if (mode === 'simple' && s.mode !== 'simple') return false
      if (mode === 'hard'   && s.mode !== 'hard')   return false
      if (category === 'work' && !isWork(s)) return false
      if (category === 'life' &&  isWork(s)) return false
      return true
    })
    return srsSort(filtered)
  }, [sentences, mode, category])

  const card = queue.length > 0 ? queue[idx % queue.length] : null

  const tplParts = useMemo(() => {
    if (!card?.template) return []
    const parts = []; let last = 0, m, bi = 0
    const re = /\{([^}]+)\}/g
    while ((m = re.exec(card.template)) !== null) {
      if (m.index > last) parts.push({ t:'txt', text: card.template.slice(last, m.index) })
      parts.push({ t:'blank', label: m[1], bi: bi++ })
      last = m.index + m[0].length
    }
    if (last < card.template.length) parts.push({ t:'txt', text: card.template.slice(last) })
    return parts
  }, [card])

  const totalBlanks = tplParts.filter(p => p.t === 'blank').length
  const allFilled = true // Always allow reveal - unfilled slots use first option

  function buildFilled() {
    return tplParts.map(p => {
      if (p.t === 'txt') return p.text
      // Use selected option, or first option as fallback, or label
      const sel = sels[p.bi]
      if (sel) return sel
      const firstOpt = (card?.subs ?? [])[p.bi]?.[0]
      return firstOpt ?? `[${p.label}]`
    }).join('')
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 1800) }

  function saveDailyCount(n) {
    const today = new Date().toISOString().slice(0,10)
    localStorage.setItem('fsi:daily', JSON.stringify({ date: today, count: n }))
    setDailyCount(n)
  }

  function handleReveal() {
    setRevealed(true)
    speak(buildFilled())
  }

  function handleRate(q) {
    const updated = srsSchedule(card, q)
    updateSentences(prev => prev.map(s => s.id === card.id ? updated : s))
    const isCorrect = q >= 3
    const newTotal = (stats?.totalDrills ?? 0) + 1
    const newStreak = isCorrect ? (stats?.perfectStreak ?? 0) + 1 : 0
    updateStats(s => ({ ...s, totalDrills: newTotal, correct: (s.correct ?? 0) + (isCorrect ? 1 : 0), perfectStreak: newStreak, xp: (s.xp ?? 0) + (q === 5 ? 5 : q === 3 ? 3 : 1) }))
    if (newTotal === 1) awardBadge('first_drill')
    if (newTotal >= 5) awardBadge('five_drills')
    if (newStreak >= 5) awardBadge('perfect_5')
    if (card.mode === 'hard' && isCorrect) awardBadge('hard_done')
    // daily count
    const newDaily = dailyCount + 1
    saveDailyCount(newDaily)
    // round complete check
    const nextIdx = idx + 1
    if (nextIdx >= queue.length) {
      setShowRoundComplete(true)
      setTimeout(() => {
        setShowRoundComplete(false)
        setRound(r => r + 1)
        setIdx(0)
      }, 2200)
    } else {
      setIdx(nextIdx)
    }
    setSels({}); setRevealed(false); setFilledHint(null); setZhTranslation(null)
    showToast(q === 5 ? '✓ Easy +5 XP' : q === 3 ? '◎ Hard +3 XP' : '↺ Again +1 XP')
  }

  const [generatingHint, setGeneratingHint] = useState(false)

  async function generateLinkedHint() {
    // Read apiKey from prop OR directly from localStorage (most reliable)
    const apiKey = settings?.apiKey || (() => {
      try { return JSON.parse(localStorage.getItem('fsi:se') || '{}')?.apiKey ?? '' } catch { return '' }
    })()
    if (!apiKey) { showToast('請先在 Setup 設定 API Key'); return }
    if (!card) return
    setGeneratingHint(true)
    try {
      const system = `You are an English connected speech expert. Given a sentence template, produce a "linked_hint" showing how native speakers actually say it.

RULES (apply ALL that apply):
1. Consonant+Vowel liaison (MOST IMPORTANT): when a word ends in consonant and next word starts with vowel (A E I O U), merge with ·
   e.g. "need it" → "nee·dit", "pick it up" → "pi·ki·tup", "turn it on" → "tur·ni·ton", "not at all" → "no·ta·tall", "I ate at" → "I·ei·tat"
2. Weak "of" → ə merged: "end of" → "endə", "kind of" → "kində", "out of" → "outə", "a lot of" → "a lotə"
3. Weak "and" → ən merged: "black and white" → "blackən white"
4. Weak "to" → tə: "need to go" → "need tə go"
5. Weak "a/the" → ə: "at the" → "ət ðə", "a delay" → "ə delay"
6. Elision — t/d often dropped before consonant: "last night" → "las(t) night", "need by" → "nee(d) by"
7. Stressed syllables: CAPITALIZE. e.g. "production" → "proDUCtion", "latest" → "LAtest"
8. {slot} is an INVISIBLE WALL — NEVER merge · across it. Treat the word before and after {slot} as isolated.
   WRONG: "by{time}·at" or "nee·d{time}" — never do this.
   RIGHT: "by {time} ə(t)" — liaison stops at the wall, restarts after it.

EXAMPLE:
Input:  I need it by {time} at the absolute latest.
Output: I nee·dit by {time} ə(t) ðə·ABsolute LAtest

Return ONLY the linked_hint string, no explanation, no quotes, no markdown.`
      const raw = await callClaude(apiKey, [{ role:'user', content: card.template }], system)
      const hint = raw.trim().replace(/^["']|["']$/g,'')
      updateSentences(prev => prev.map(s => s.id === card.id ? { ...s, linked_hint: hint } : s))
      showToast('✓ 連音標注已產生')
    } catch(e) {
      showToast('✗ 產生失敗，請檢查 API Key')
    } finally { setGeneratingHint(false) }
  }

  // ── 用填完 slot 的完整句產生連音（暫存在 filledHint，不覆蓋原始 linked_hint）──
  async function generateFilledHint() {
    const apiKey = settings?.apiKey || (() => {
      try { return JSON.parse(localStorage.getItem('fsi:se') || '{}')?.apiKey ?? '' } catch { return '' }
    })()
    if (!apiKey) { showToast('請先在 Setup 設定 API Key'); return }
    if (!card) return
    const filled = buildFilled()
    if (!filled.trim()) return
    setGeneratingFilledHint(true)
    try {
      const system = `You are an English connected speech expert. Given a complete English sentence (no placeholders), produce a "linked_hint" showing how native speakers actually say it.

RULES (apply ALL that apply):
1. Consonant+Vowel liaison (MOST IMPORTANT): word ending consonant + next word starting vowel → merge with ·
   e.g. "need it" → "nee·dit", "pick it up" → "pi·ki·tup", "not at all" → "no·ta·tall"
2. Weak "of" → ə merged: "end of" → "endə", "kind of" → "kində"
3. Weak "and" → ən merged: "black and white" → "blackən white"
4. Weak "to" → tə: "need to go" → "need tə go"
5. Weak "a/the" → ə: "at the" → "ət ðə"
6. Elision: "last night" → "las(t) night", "need by" → "nee(d) by"
7. Stressed syllables: CAPITALIZE. e.g. "proDUCtion", "LAtest"

This is a COMPLETE sentence with no placeholders. Apply all rules fully.
Return ONLY the linked_hint string, no explanation, no quotes, no markdown.`
      const raw = await callClaude(apiKey, [{ role:'user', content: filled }], system)
      const hint = raw.trim().replace(/^["']|["']$/g,'')
      setFilledHint(hint)
      showToast('✓ 已用選項更新連音')
    } catch(e) {
      showToast('✗ 產生失敗，請檢查 API Key')
    } finally { setGeneratingFilledHint(false) }
  }

  // ── 產生 chunk 中文近似音（存入 card.chunk_zh，下次直接顯示）──
  async function generateChunkZh(chunks) {
    const apiKey = settings?.apiKey || (() => {
      try { return JSON.parse(localStorage.getItem('fsi:se') || '{}')?.apiKey ?? '' } catch { return '' }
    })()
    if (!apiKey) { showToast('請先在 Setup 設定 API Key'); return }
    if (!card || !chunks.length) return
    setGeneratingChunkZh(true)
    try {
      const labels = chunks.map(c => c.label)
      const system = `You are a Taiwanese English pronunciation coach. For each English connected speech chunk, provide a Chinese phonetic approximation (近似音) that helps Taiwanese learners sound it out.

Rules:
- Use natural Mandarin Chinese characters that approximate the English sounds
- Keep it short (2–5 Chinese characters per chunk)
- Prioritize sounds a Taiwanese speaker would recognize
- Examples: "nee·dit" → "你迪特", "pi·ki·tup" → "批克搭", "tur·ni·ton" → "特你頓", "nə·ðər" → "那勒"

Return ONLY a JSON object with chunk labels as keys. No markdown, no explanation.
Example: {"nee·dit":"你迪特","tur·ni·ton":"特你頓"}`
      const raw = await callClaude(apiKey, [{ role:'user', content: JSON.stringify(labels) }], system)
      const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim())
      updateSentences(prev => prev.map(s =>
        s.id === card.id ? { ...s, chunk_zh: { ...(s.chunk_zh ?? {}), ...parsed } } : s
      ))
      showToast('✓ 近似音已產生')
    } catch {
      showToast('✗ 產生失敗，請檢查 API Key')
    } finally { setGeneratingChunkZh(false) }
  }

  async function generateZhTranslation() {
    const apiKey = settings?.apiKey || (() => {
      try { return JSON.parse(localStorage.getItem('fsi:se') || '{}')?.apiKey ?? '' } catch { return '' }
    })()
    if (!apiKey) { showToast('請先在 Setup 設定 API Key'); return }
    if (!card) return
    setGeneratingZh(true)
    try {
      const sentence = buildFilled()
      const sys = '你是英語教學助理，幫助台灣製造業工作者學習英語。請將英語句子翻譯成繁體中文，並說明使用情境。格式如下（只輸出這兩行）：\n翻譯：[中文翻譯]\n情境：[一句話說明何時使用]'
      const raw = await callClaude(apiKey, [{ role:'user', content: sentence }], sys)
      setZhTranslation(raw.trim())
    } catch(e) {
      showToast('翻譯失敗，請檢查 API Key')
    } finally { setGeneratingZh(false) }
  }

  function ModeBtn({ id, label }) {
    return (
      <div onClick={() => { setMode(id); setIdx(0); setSels({}); setRevealed(false) }}
        style={{ flex:1, textAlign:'center', padding:'7px 0', borderRadius:7, cursor:'pointer', fontFamily:MONO, fontSize:10, letterSpacing:'0.07em', fontWeight:500, background: mode===id ? T.amber : 'transparent', color: mode===id ? T.bg : '#c2cad4', transition:'all 0.14s' }}>
        {label}
      </div>
    )
  }

  return (
    <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:14 }} className="fadeUp">

      {/* Round Complete Overlay */}
      {showRoundComplete && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'#050810ee', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, zIndex:200, animation:'fadeUp 0.3s ease' }}>
          <div style={{ fontFamily:DISP, fontSize:28, color:T.amber, letterSpacing:'0.12em' }}>✦ Round {round} ✦</div>
          <div style={{ fontFamily:MONO, fontSize:13, color:T.txt2 }}>完成！今日已練 <span style={{color:T.amber,fontWeight:700}}>{dailyCount}</span> 句</div>
          {dailyCount < dailyGoal
            ? <div style={{ fontFamily:MONO, fontSize:11, color:T.txt3 }}>距離目標還差 {dailyGoal - dailyCount} 句</div>
            : <div style={{ fontFamily:MONO, fontSize:11, color:T.grn }}>🎉 今日目標達成！</div>
          }
          <div style={{ fontFamily:MONO, fontSize:10, color:T.txt3, animation:'pulse 1.2s infinite', marginTop:8 }}>自動進入 Round {round + 1}…</div>
        </div>
      )}

      {/* Daily Progress Bar */}
      <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:12, padding:'12px 14px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ display:'flex', gap:16 }}>
            <span style={{ fontFamily:MONO, fontSize:11, color:T.txt }}>🗣 <b style={{color:T.amber}}>{dailyCount}</b> 句</span>
            <span style={{ fontFamily:MONO, fontSize:11, color:T.txt }}>🔄 Round <b style={{color:T.blue}}>{round}</b></span>
            <span style={{ fontFamily:MONO, fontSize:11, color:T.txt }}>🔥 <b style={{color:T.red}}>{stats?.streak ?? 0}</b> 天</span>
          </div>
          <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>目標 {dailyGoal}</span>
        </div>
        <div style={{ height:5, background:T.bdr2, borderRadius:3, overflow:'hidden' }}>
          <div style={{ width:`${Math.min(100, (dailyCount/dailyGoal)*100)}%`, height:'100%', background: dailyCount >= dailyGoal ? T.grn : T.amber, borderRadius:3, transition:'width 0.4s ease' }}/>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:70, left:'50%', transform:'translateX(-50%)', background:T.surf2, border:`1px solid ${T.bdr2}`, borderRadius:20, padding:'8px 18px', fontFamily:MONO, fontSize:11, color:T.amber, zIndex:50, whiteSpace:'nowrap', animation:'fadeUp 0.2s ease' }}>{toast}</div>
      )}

      {/* Mode toggle */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ display:'flex', background:T.surf2, borderRadius:9, padding:3, gap:2, flex:1 }}>
          <ModeBtn id="simple" label="SIMPLE"/>
          <ModeBtn id="hard" label="HARD"/>
        </div>
        <div onClick={() => setShowInfo(s=>!s)} style={{ cursor:'pointer', color: showInfo ? T.amber : T.txt3, padding:'6px 8px', background:T.surf2, borderRadius:9, fontFamily:MONO, fontSize:11, transition:'color 0.14s' }}>?</div>
      </div>

      {showInfo && (
        <div style={{ background:T.surf2, border:`1px solid ${T.bdr2}`, borderRadius:11, padding:14 }} className="fadeUp">
          <div style={{ fontFamily:MONO, fontSize:10, color:T.amber, marginBottom:8 }}>SIMPLE vs HARD</div>
          <div style={{ fontFamily:SERIF, fontSize:13, color:T.txt2, lineHeight:1.7 }}>
            <b style={{color:T.txt}}>SIMPLE</b> — 單句填空練習。選好詞組後按「Speak & Reveal」，練習說出完整句子。適合通勤、零碎時間。<br/><br/>
            <b style={{color:T.txt}}>HARD</b> — 多句對話情境（3句以上）。模擬會議、客戶電話、RCA討論的完整對話。適合有15分鐘以上的練習時間。
          </div>
        </div>
      )}

      {/* Category filter */}
      <div style={{ display:'flex', gap:6 }}>
        {[['all','ALL'],['work','💼 WORK'],['life','🏠 LIFE']].map(([id, lbl]) => (
          <div key={id} onClick={() => { setCategory(id); setIdx(0) }}
            style={{ flex:1, textAlign:'center', padding:'6px 0', borderRadius:8, cursor:'pointer', fontFamily:MONO, fontSize:9, letterSpacing:'0.06em', border:`1px solid ${category===id ? T.amber+'80' : T.bdr}`, background: category===id ? T.amberD : 'transparent', color: category===id ? T.amber : '#c2cad4', transition:'all 0.14s' }}>
            {lbl}
          </div>
        ))}
        <div style={{ display:'flex', alignItems:'center', gap:6, paddingLeft:4 }}>
          <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3, whiteSpace:'nowrap' }}>{queue.length} cards</span>
          <div onClick={() => setShowFsiList(v => !v)} title="一覽表"
            style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color: showFsiList ? T.amber : T.txt3,
              background: showFsiList ? T.amberD : 'transparent', border:`1px solid ${showFsiList ? T.amber+'60' : T.bdr}`,
              borderRadius:6, padding:'3px 7px', whiteSpace:'nowrap', transition:'all 0.14s' }}>
            ☰
          </div>
        </div>
      </div>

      {/* FSI 一覽表 */}
      {showFsiList && (
        <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', borderBottom:`1px solid ${T.bdr}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontFamily:MONO, fontSize:9, color:T.amber, letterSpacing:'0.1em' }}>FSI 一覽表</span>
            <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>{queue.length} 句</span>
          </div>
          <div style={{ maxHeight:320, overflowY:'auto' }}>
            {queue.map((s, i) => {
              const isLife = LIFE_CONTEXTS.some(c => (s.context??'').toLowerCase().includes(c.toLowerCase()))
              return (
                <div key={s.id} style={{ padding:'9px 14px', borderBottom:`1px solid ${T.bdr}20`, display:'flex', alignItems:'center', gap:8,
                  background: i % 2 === 0 ? 'transparent' : T.surf2 }}>
                  <div onClick={() => {
                    const newCtx = isLife
                      ? s.context.replace(/\s*\(Life\)/i,'').replace(/Daily Life|生活/i, 'Work').trim()
                      : (s.context ? s.context + ' (Life)' : 'Daily Life')
                    updateSentences(prev => prev.map(x => x.id === s.id ? {...x, context: newCtx} : x))
                  }}
                    title={isLife ? '移至 WORK' : '移至 LIFE'}
                    style={{ flexShrink:0, fontFamily:MONO, fontSize:8, padding:'2px 7px', borderRadius:6, cursor:'pointer', userSelect:'none',
                      background: isLife ? '#3fb95018' : T.amberD,
                      border:`1px solid ${isLife ? '#3fb95050' : T.amber+'50'}`,
                      color: isLife ? '#3fb950' : T.amber }}>
                    {isLife ? '🏠' : '💼'}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:MONO, fontSize:11, color:T.txt, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.template}</div>
                    <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, marginTop:1 }}>{s.context}</div>
                  </div>
                  <div onClick={() => { setShowFsiList(false); setIdx(i) }}
                    style={{ flexShrink:0, fontFamily:MONO, fontSize:8, color:T.txt3, cursor:'pointer', padding:'2px 6px',
                      border:`1px solid ${T.bdr}`, borderRadius:6 }}>
                    練習
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!card ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:T.txt3, fontFamily:SERIF, fontSize:14 }}>
          No sentences in this mode yet.<br/>
          <span style={{ fontSize:12, color:T.txt3 }}>Add via AI Analysis or Settings.</span>
        </div>
      ) : (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
            <SectionLabel color={T.amber}>{card.context}</SectionLabel>
            <div onClick={() => {
              const isLifeCard = LIFE_CONTEXTS.some(c => (card.context??'').toLowerCase().includes(c.toLowerCase()))
              const newCtx = isLifeCard
                ? card.context.replace(/\s*\(Life\)/i,'').replace(/Daily Life|生活/i,'Work').trim()
                : (card.context ? card.context + ' (Life)' : 'Daily Life')
              updateSentences(prev => prev.map(x => x.id === card.id ? {...x, context: newCtx} : x))
            }}
              title="切換 WORK / LIFE"
              style={{ flexShrink:0, fontFamily:MONO, fontSize:8, padding:'3px 9px', borderRadius:6, cursor:'pointer', userSelect:'none',
                background: LIFE_CONTEXTS.some(c=>(card.context??'').toLowerCase().includes(c.toLowerCase())) ? '#3fb95018' : T.amberD,
                border:`1px solid ${LIFE_CONTEXTS.some(c=>(card.context??'').toLowerCase().includes(c.toLowerCase())) ? '#3fb95050' : T.amber+'50'}`,
                color: LIFE_CONTEXTS.some(c=>(card.context??'').toLowerCase().includes(c.toLowerCase())) ? '#3fb950' : T.amber }}>
              {LIFE_CONTEXTS.some(c=>(card.context??'').toLowerCase().includes(c.toLowerCase())) ? '🏠 LIFE' : '💼 WORK'}
            </div>
          </div>

          {/* Drill card */}
          <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:14, padding:20, position:'relative' }}>
            {card.hint && (
              <div style={{ marginBottom:12, paddingBottom:12, borderBottom:`1px solid ${T.bdr}` }}>
                <div style={{ fontFamily:MONO, fontSize:8.5, color:T.amber, letterSpacing:'0.1em', marginBottom:6 }}>提示詞</div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:15, color:T.txt2, lineHeight:1.3, flex:1 }}>
                  "{card.hint}"
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                  {!card.linked_hint && (
                    <div onClick={generateLinkedHint} title="產生連音標注"
                      style={{ cursor: generatingHint ? 'not-allowed' : 'pointer', color: generatingHint ? T.txt3 : T.amber, padding:'4px 6px', background:T.amberD, borderRadius:6, fontFamily:MONO, fontSize:10, display:'flex', alignItems:'center', gap:3, opacity: generatingHint ? 0.6 : 1, transition:'all 0.14s' }}>
                      {generatingHint
                        ? <span style={{ display:'inline-block', width:8, height:8, border:'1.5px solid transparent', borderTopColor:T.amber, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                        : '✨'}
                      <span style={{ fontSize:8 }}>{generatingHint ? '產生中' : '連音'}</span>
                    </div>
                  )}
                  <div onClick={() => speak(buildFilled())} title="朗讀句子"
                    style={{ cursor:'pointer', color:T.txt3, padding:'4px 5px', flexShrink:0, transition:'color 0.14s' }}
                    onMouseOver={e=>e.currentTarget.style.color=T.amber} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M10.5 5a3 3 0 010 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M12 2.5a6 6 0 010 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  </div>
                </div>
                </div>
              </div>
            )}
            {!card.hint && !card.linked_hint && (
              <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
                <div onClick={generateLinkedHint} title="產生連音標注"
                  style={{ cursor: generatingHint ? 'not-allowed' : 'pointer', color: generatingHint ? T.txt3 : T.amber, padding:'4px 8px', background:T.amberD, borderRadius:6, fontFamily:MONO, fontSize:10, display:'flex', alignItems:'center', gap:3, opacity: generatingHint ? 0.6 : 1 }}>
                  {generatingHint
                    ? <span style={{ display:'inline-block', width:8, height:8, border:'1.5px solid transparent', borderTopColor:T.amber, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                    : '✨'}
                  <span style={{ fontSize:8 }}>{generatingHint ? '產生中' : '產生連音'}</span>
                </div>
              </div>
            )}
            {/* Template with blanks */}
            <div style={{ fontFamily:MONO, fontSize:13.5, lineHeight:2.1, color:T.txt, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
              {tplParts.map((p, i) => {
                if (p.t === 'txt') return <span key={i}>{p.text}</span>
                const sel = sels[p.bi]
                const hasOpts = ((card?.subs ?? [])[p.bi]?.length ?? 0) > 0
                return (
                  <span key={i} style={{ display:'inline-block', minWidth:70, borderBottom:`2px solid ${sel ? T.amber : hasOpts ? T.bdr2 : T.red}`, color: sel ? T.amber : hasOpts ? T.txt3 : T.red, padding:'0 5px', transition:'all 0.15s', fontWeight: sel ? 500 : 300 }}>
                    {sel || (hasOpts ? '___' : '⚠')}
                  </span>
                )
              })}
            </div>

            {/* Speed buttons + SPEAK & REVEAL */}
            <div style={{ display:'flex', gap:8, marginTop:10, alignItems:'center' }}>
              <div onClick={() => speak(buildFilled(), 0.82)}
                style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', color:T.txt3, padding:'5px 10px', background:T.surf2, borderRadius:7, transition:'color 0.14s' }}
                onMouseOver={e=>e.currentTarget.style.color=T.amber} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M10.5 5a3 3 0 010 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M12 2.5a6 6 0 010 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                <span style={{ fontFamily:MONO, fontSize:9 }}>0.82x</span>
              </div>
              <div onClick={() => speak(buildFilled(), 0.6)}
                style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', color:T.txt3, padding:'5px 10px', background:T.surf2, borderRadius:7, transition:'color 0.14s' }}
                onMouseOver={e=>e.currentTarget.style.color=T.blue} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
                <span style={{ fontFamily:MONO, fontSize:11 }}>🐢</span>
                <span style={{ fontFamily:MONO, fontSize:9 }}>0.6x</span>
              </div>
              {!revealed && (
                <div onClick={allFilled ? handleReveal : undefined}
                  style={{ display:'flex', alignItems:'center', gap:5, cursor: allFilled ? 'pointer' : 'not-allowed',
                    padding:'5px 13px', borderRadius:7, fontFamily:MONO, fontSize:10, letterSpacing:'0.08em',
                    background: allFilled ? T.amber : T.surf2,
                    color: allFilled ? T.bg : T.txt3,
                    border: `1px solid ${allFilled ? T.amber : T.bdr}`,
                    transition:'all 0.14s', opacity: allFilled ? 1 : 0.5 }}>
                  ▶ REVEAL
                </div>
              )}
            </div>

            {/* ── 中文翻譯區塊 ── */}
            <div style={{ marginTop:8 }}>
              {!zhTranslation && (
                <div onClick={generatingZh ? undefined : generateZhTranslation}
                  style={{ display:'inline-flex', alignItems:'center', gap:5, cursor: generatingZh ? 'default' : 'pointer',
                    fontFamily:MONO, fontSize:9, color: generatingZh ? T.txt3 : T.blue,
                    padding:'4px 10px', borderRadius:6, background:T.blueD,
                    border:`1px solid ${T.blue}30`, opacity: generatingZh ? 0.6 : 1,
                    transition:'all 0.15s', userSelect:'none' }}>
                  {generatingZh ? '⏳ 翻譯中…' : '🀄 中文翻譯'}
                </div>
              )}
              {zhTranslation && (
                <div style={{ background:T.blueD, border:`1px solid ${T.blue}25`, borderRadius:9, padding:'10px 13px', display:'flex', flexDirection:'column', gap:5 }}>
                  {zhTranslation.split('\n').map((line, i) => {
                    const isFirst = i === 0
                    return (
                      <div key={i} style={{ fontFamily:MONO, fontSize: isFirst ? 12 : 10,
                        color: isFirst ? T.txt : T.txt2, lineHeight:1.6 }}>
                        {line}
                      </div>
                    )
                  })}
                  <div onClick={() => setZhTranslation(null)}
                    style={{ alignSelf:'flex-end', fontFamily:MONO, fontSize:8.5, color:T.txt3, cursor:'pointer', marginTop:2 }}>
                    ✕ 關閉
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Substitution chips */}
          {!revealed && (() => {
            const templateSlotCount = (card.template?.match(/\{[^}]+\}/g) ?? []).length
            const subsCount = (card.subs ?? []).length
            const missingSlots = Math.max(0, templateSlotCount - subsCount)
            const extraSlots  = Math.max(0, subsCount - templateSlotCount)

            const deleteOpt = (gi, oi) => {
              updateSentences(prev => prev.map(s => {
                if (s.id !== card.id) return s
                const newSubs = (s.subs ?? []).map((g, gIdx) =>
                  gIdx === gi ? g.filter((_, oIdx) => oIdx !== oi) : g
                )
                return { ...s, subs: newSubs }
              }))
              if (sels[gi] === (card.subs ?? [])[gi]?.[oi]) {
                setSels(prev => { const r = { ...prev }; delete r[gi]; return r })
              }
            }

            const confirmAddOpt = (gi) => {
              const txt = newOptText.trim()
              if (!txt) { setAddingSlot(null); return }
              updateSentences(prev => prev.map(s => {
                if (s.id !== card.id) return s
                const newSubs = (s.subs ?? []).map((g, gIdx) =>
                  gIdx === gi ? [...g, txt] : g
                )
                return { ...s, subs: newSubs }
              }))
              setNewOptText('')
              setAddingSlot(null)
            }

            return (
              <>
                {/* Edit toggle */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', marginBottom:2 }}>
                  <div onClick={() => { setSlotEditMode(v => !v); setAddingSlot(null); setNewOptText('') }}
                    style={{ fontFamily:MONO, fontSize:8.5, color: slotEditMode ? T.amber : T.txt3, cursor:'pointer', padding:'3px 8px', borderRadius:5,
                      background: slotEditMode ? T.amberD : 'transparent', border: `1px solid ${slotEditMode ? T.amber+'50' : 'transparent'}`,
                      transition:'all 0.15s', userSelect:'none' }}>
                    {slotEditMode ? '✓ 完成編輯' : '✏ 編輯選項'}
                  </div>
                </div>

                {(card.subs ?? []).map((group, gi) => {
                  const isExtra = gi >= templateSlotCount
                  return (
                    <div key={gi}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                        <div style={{ fontFamily:MONO, fontSize:8.5, color: isExtra ? T.amber : '#9aa5b0', letterSpacing:'0.1em' }}>SLOT {gi + 1}</div>
                        {isExtra && <span style={{ fontFamily:MONO, fontSize:8, color:T.amber, background:T.amberD, padding:'1px 6px', borderRadius:4 }}>⚠ 多餘</span>}
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6, opacity: isExtra ? 0.5 : 1, alignItems:'center' }}>
                        {group.map((opt, oi) => (
                          <div key={oi} style={{ display:'flex', alignItems:'center', gap:0 }}>
                            <div className={`chip${sels[gi] === opt ? ' sel' : ''}`}
                              style={{ borderRadius: slotEditMode ? '20px 0 0 20px' : '20px', paddingRight: slotEditMode ? 8 : 14 }}
                              onClick={() => !isExtra && !slotEditMode && setSels(prev => prev[gi] === opt ? (({ [gi]:_, ...rest }) => rest)(prev) : { ...prev, [gi]: opt })}>
                              {opt}
                            </div>
                            {slotEditMode && (
                              <div onClick={() => deleteOpt(gi, oi)}
                                style={{ display:'flex', alignItems:'center', justifyContent:'center', width:22, height:34, background:'#f8514925', border:'1px solid #f8514950', borderLeft:'none', borderRadius:'0 20px 20px 0', cursor:'pointer', color:T.red, fontSize:11, flexShrink:0 }}>
                                ✕
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Add button */}
                        {slotEditMode && addingSlot !== gi && (
                          <div onClick={() => { setAddingSlot(gi); setNewOptText('') }}
                            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:'50%', background:T.grnD, border:`1px solid ${T.grn}50`, cursor:'pointer', color:T.grn, fontSize:16, flexShrink:0 }}>
                            +
                          </div>
                        )}

                        {/* Inline input for new option */}
                        {slotEditMode && addingSlot === gi && (
                          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                            <input
                              autoFocus
                              value={newOptText}
                              onChange={e => setNewOptText(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') confirmAddOpt(gi); if (e.key === 'Escape') { setAddingSlot(null); setNewOptText('') } }}
                              placeholder="新選項…"
                              style={{ width:130, background:T.surf2, border:`1px solid ${T.grn}60`, borderRadius:8, padding:'5px 8px', fontFamily:MONO, fontSize:11, color:T.txt, outline:'none' }}
                            />
                            <div onClick={() => confirmAddOpt(gi)}
                              style={{ cursor:'pointer', background:T.grn, color:T.bg, borderRadius:6, padding:'4px 8px', fontFamily:MONO, fontSize:10, fontWeight:600 }}>
                              確認
                            </div>
                            <div onClick={() => { setAddingSlot(null); setNewOptText('') }}
                              style={{ cursor:'pointer', color:T.txt3, fontFamily:MONO, fontSize:10 }}>
                              取消
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {extraSlots > 0 && (
                  <div style={{ background:T.amberD, border:`1px solid ${T.amber}40`, borderRadius:8, padding:'8px 12px' }}>
                    <span style={{ fontFamily:MONO, fontSize:9, color:T.amber }}>⚠ 此卡有 {extraSlots} 個多餘 SLOT — 建議到 SETUP 修正</span>
                  </div>
                )}
                {missingSlots > 0 && Array.from({ length: missingSlots }).map((_, mi) => (
                  <div key={`missing-${mi}`} style={{ background: T.redD, border:`1px solid ${T.red}50`, borderRadius:8, padding:'8px 12px', display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontFamily:MONO, fontSize:8.5, color:T.red, letterSpacing:'0.1em' }}>SLOT {subsCount + mi + 1}</span>
                    <span style={{ fontFamily:MONO, fontSize:9, color:T.red }}>⚠ 未設定選項</span>
                  </div>
                ))}
              </>
            )
          })()}

          {/* Rating buttons (shown after reveal) — 放在連音上方方便按 */}
          {revealed && (
            <div style={{ display:'flex', gap:8, marginBottom:4 }}>
              {[{l:'Again',q:0,c:T.red},{l:'Hard',q:3,c:T.blue},{l:'Easy',q:5,c:T.grn}].map(({ l, q, c }) => (
                <button key={l} className="btn" onClick={() => handleRate(q)}
                  style={{ flex:1, background:`${c}18`, border:`1px solid ${c}55`, color:c, padding:'10px 0', fontSize:12, letterSpacing:'0.06em' }}>
                  {l}
                </button>
              ))}
            </div>
          )}

          {/* ── 連音區塊（slot 下方）─────────────────────── */}
          {card.linked_hint && (() => {
            const displayHint = filledHint ?? card.linked_hint
            const isFilledMode = !!filledHint
            const chunks = extractLiaisonChunks(displayHint)
            const hasAnySel = Object.keys(sels).length > 0
            const totalSlots = (card.subs ?? []).length

            return (
              <div style={{ background:T.surf, border:`1px solid ${isFilledMode ? T.grn+'40' : T.amber+'22'}`, borderRadius:12, padding:'13px 15px', transition:'border-color 0.3s' }}>
                {/* Header row — legend + action buttons, no LIAISON label */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {!isFilledMode && !editingHint && (
                      <div style={{ display:'flex', gap:10 }}>
                        <span style={{ fontFamily:MONO, fontSize:8, color:T.amber }}>· 連音</span>
                        <span style={{ fontFamily:MONO, fontSize:8, color:T.txt3 }}>ə 弱化</span>
                        <span style={{ fontFamily:MONO, fontSize:8, color:T.txt3 }}>( ) 省略</span>
                        <span style={{ fontFamily:MONO, fontSize:8, color:T.txt, fontWeight:700 }}>大寫 重音</span>
                      </div>
                    )}
                    {isFilledMode && (
                      <span style={{ fontFamily:MONO, fontSize:8, color:T.grn }}>✓ 已填入選項</span>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    {totalSlots > 0 && !editingHint && (
                      <div onClick={() => { if (!generatingFilledHint) generateFilledHint() }}
                        title={hasAnySel ? '用目前選項產生連音' : '先選 SLOT 再產生'}
                        style={{
                          cursor: generatingFilledHint ? 'not-allowed' : 'pointer',
                          color: isFilledMode ? T.grn : hasAnySel ? T.amber : T.txt3,
                          padding:'3px 8px', background: isFilledMode ? T.grnD : hasAnySel ? T.amberD : T.surf2,
                          borderRadius:6, fontFamily:MONO, fontSize:9,
                          display:'flex', alignItems:'center', gap:4,
                          border:`1px solid ${isFilledMode ? T.grn+'50' : hasAnySel ? T.amber+'50' : T.bdr}`,
                          opacity: generatingFilledHint ? 0.6 : 1, transition:'all 0.14s'
                        }}>
                        {generatingFilledHint
                          ? <span style={{ display:'inline-block', width:8, height:8, border:'1.5px solid transparent', borderTopColor: T.amber, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                          : isFilledMode ? '✓' : '🔄'}
                        <span style={{ fontSize:8 }}>
                          {generatingFilledHint ? '產生中' : isFilledMode ? '已更新' : '用選項更新'}
                        </span>
                      </div>
                    )}
                    {isFilledMode && (
                      <div onClick={() => setFilledHint(null)}
                        style={{ cursor:'pointer', color:T.txt3, padding:'3px 7px', background:T.surf2, borderRadius:5, fontFamily:MONO, fontSize:8, border:`1px solid ${T.bdr}` }}>
                        還原
                      </div>
                    )}
                    {!isFilledMode && (
                      <div onClick={() => { setEditingHint(e => !e); setHintDraft(card.linked_hint) }}
                        style={{ cursor:'pointer', fontFamily:MONO, fontSize:8, color: editingHint ? T.amber : T.txt3, padding:'3px 7px', background:T.surf2, borderRadius:5 }}>
                        {editingHint ? '取消' : '✏ 編輯'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Linked hint 顯示 */}
                {editingHint ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <textarea value={hintDraft} onChange={e => setHintDraft(e.target.value)}
                      style={{ fontFamily:MONO, fontSize:12, background:T.surf2, border:`1px solid ${T.amber}40`, borderRadius:8, color:T.txt, padding:'8px 10px', minHeight:60, resize:'vertical' }}/>
                    <button className="btn" onClick={() => {
                      updateSentences(prev => prev.map(s => s.id === card.id ? { ...s, linked_hint: hintDraft } : s))
                      setEditingHint(false)
                      showToast('✓ 連音已更新')
                    }} style={{ background:T.amberD, border:`1px solid ${T.amber}50`, color:T.amber, fontSize:10 }}>
                      儲存
                    </button>
                  </div>
                ) : (
                  <div style={{ fontFamily:SERIF, fontSize:15, lineHeight:2, letterSpacing:'0.02em', color: isFilledMode ? T.txt : T.txt2, marginBottom: chunks.length ? 12 : 0 }}>
                    {renderLinkedHint(displayHint)}
                  </div>
                )}

                {/* Chunk buttons */}
                {!editingHint && chunks.length > 0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
                      {chunks.map((c, ci) => {
                        const isActive = activeChunk === ci
                        const zh = card.chunk_zh?.[c.label]
                        return (
                          <div key={ci} style={{ display:'flex', flexDirection:'column', gap:3, alignItems:'center' }}>
                            <div onClick={async () => {
                              setActiveChunk(ci)
                              const eKey = settings?.elevenKey || (() => { try { return JSON.parse(localStorage.getItem('fsi:se')||'{}')?.elevenKey??'' } catch { return '' } })()
                              if (eKey) {
                                await speakElevenLabs(c.tts, eKey, () => setActiveChunk(null))
                              } else {
                                window.speechSynthesis?.cancel()
                                const u1 = new SpeechSynthesisUtterance(c.tts)
                                u1.lang = 'en-US'; u1.rate = 0.5
                                u1.onend = () => {
                                  setTimeout(() => {
                                    const u2 = new SpeechSynthesisUtterance(c.tts)
                                    u2.lang = 'en-US'; u2.rate = 0.82
                                    u2.onend = () => setActiveChunk(null)
                                    window.speechSynthesis?.speak(u2)
                                  }, 600)
                                }
                                window.speechSynthesis?.speak(u1)
                              }
                            }}
                              style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer',
                                background: isActive ? (isFilledMode ? T.grn+'40' : T.amber+'40') : (isFilledMode ? T.grnD : T.amberD),
                                border:`1px solid ${isActive ? (isFilledMode ? T.grn : T.amber) : (isFilledMode ? T.grn+'40' : T.amber+'40')}`,
                                borderRadius:8, padding:'5px 10px', transition:'all 0.14s' }}>
                              <span style={{ fontFamily:MONO, fontSize:11, color: isFilledMode ? T.grn : T.amber }}>{c.label}</span>
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{color: isFilledMode ? T.grn : T.amber}}><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.4" fill="none"/><path d="M10.5 5a3 3 0 010 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                              <span style={{ fontFamily:MONO, fontSize:8, color:T.txt3 }}>{settings?.elevenKey ? '🎙 AI' : '慢→正常'}</span>
                            </div>
                            {zh && (
                              <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, letterSpacing:'0.04em' }}>{zh}</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div onClick={() => !generatingChunkZh && generateChunkZh(chunks)}
                      style={{ display:'inline-flex', alignItems:'center', gap:5, cursor: generatingChunkZh ? 'not-allowed' : 'pointer', opacity: generatingChunkZh ? 0.5 : 1, alignSelf:'flex-start', padding:'4px 10px', borderRadius:6, background:T.surf2, border:`1px solid ${T.bdr2}` }}>
                      <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
                        {generatingChunkZh ? '產生中…' : (card.chunk_zh ? '🈶 重新產生近似音' : '🈶 產生中文近似音')}
                      </span>
                    </div>
                  </div>
                )}

                {isFilledMode && (
                  <div style={{ fontFamily:MONO, fontSize:8, color:T.grn, marginTop:8, opacity:0.8 }}>
                    ✓ 連音已根據選項「{Object.values(sels).join(' / ')}」更新 · 按「還原」回到模板版
                  </div>
                )}
              </div>
            )
          })()}

        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// VOCAB TAB
// ═══════════════════════════════════════════════════════════════
function VocabTab({ vocab, updateVocab, updateStats, awardBadge }) {
  const [sub, setSub] = useState('list')
  // Search
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchRes, setSearchRes] = useState(null)
  const [searchMsg, setSearchMsg] = useState('')
  const [pendingDiff, setPendingDiff] = useState('mid')
  // List
  const [diffFilter, setDiffFilter] = useState('all')
  const [adding, setAdding] = useState(false)
  const [newWord, setNewWord] = useState('')
  const [loading, setLoading] = useState(false)
  // Flash/Fill
  const [flipIdx, setFlipIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [fillAns, setFillAns] = useState('')
  const [fillRes, setFillRes] = useState(null)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const audioRef = useRef(null)

  // List: newest first, archived last
  const listWords = useMemo(() => {
    const arr = [...(vocab ?? [])].filter(w =>
      diffFilter === 'all' ? true : (w.diff ?? 'mid') === diffFilter
    )
    arr.sort((a, b) => {
      if (a.archived && !b.archived) return 1
      if (!a.archived && b.archived) return -1
      const aTime = parseInt(String(a.id).replace(/\D/g,'')) || 0
      const bTime = parseInt(String(b.id).replace(/\D/g,'')) || 0
      return bTime - aTime
    })
    return arr
  }, [vocab, diffFilter])

  const sorted = useMemo(() => srsSort((vocab ?? []).filter(v => !v.archived)), [vocab])
  const cur = sorted.length > 0 ? sorted[flipIdx % sorted.length] : null

  // ── Word Search ─────────────────────────────────────────────
  async function searchWord() {
    if (!query.trim()) return
    setSearching(true); setSearchRes(null); setSearchMsg('')
    try {
      // Fetch English definition
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query.trim())}`)
      const d = await r.json()
      if (!Array.isArray(d) || !d[0]) { setSearchMsg('找不到這個單字，請確認拼字'); return }
      const ipa = d[0]?.phonetics?.find(p => p.text)?.text ?? ''
      const meanings = d[0]?.meanings ?? []
      const defs = meanings.flatMap(m =>
        m.definitions.slice(0,2).map(def => ({ pos: m.partOfSpeech, def: def.definition, ex: def.example ?? '', zh: '' }))
      ).slice(0,3)
      const word = d[0].word ?? query.trim()
      setSearchRes({ word, ipa, defs })
      setPendingDiff('mid')

      // Fetch Chinese translations in parallel
      const zhResults = await Promise.all(
        defs.map(async (def) => {
          try {
            const tr = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(def.def)}&langpair=en|zh-TW`)
            const tj = await tr.json()
            return tj?.responseData?.translatedText ?? ''
          } catch { return '' }
        })
      )
      setSearchRes(prev => prev ? {
        ...prev,
        defs: prev.defs.map((def, i) => ({ ...def, zh: zhResults[i] ?? '' }))
      } : null)
    } catch { setSearchMsg('查詢失敗，請稍後再試') }
    finally { setSearching(false) }
  }

  function addSearchResult(def) {
    if (!searchRes) return
    const exists = (vocab ?? []).some(v => v.word.toLowerCase() === searchRes.word.toLowerCase())
    if (exists) { setSearchMsg(`「${searchRes.word}」已在單字庫中`); return }
    const entry = {
      id: `v${Date.now()}`, word: searchRes.word, ipa_us: searchRes.ipa,
      def: def.zh ? `${def.zh}` : def.def,
      defEn: def.def, ex: def.ex, diff: pendingDiff,
      reps:0, ease:2.5, interval:1, dueDate:0, lastSeen:0
    }
    updateVocab(prev => {
      const next = [...(prev??[]), entry]
      if (next.length >= 5) awardBadge('vocab_5')
      if (next.length >= 10) awardBadge('vocab_10')
      return next
    })
    updateStats(s => ({ ...s, xp: (s.xp??0) + 3 }))
    setSearchMsg(`✓ 已加入單字庫（${DIFF[pendingDiff].label}）`)
  }

  function toggleDiff(id) {
    updateVocab(prev => (prev??[]).map(v => v.id === id ? { ...v, diff: nextDiff(v.diff ?? 'mid') } : v))
  }

  // ── Audio mode ───────────────────────────────────────────────
  function startAudio() {
    setAudioPlaying(true)
    const words = listWords.filter(w => !w.archived)
    let i = 0
    function playNext() {
      if (i >= words.length) { setAudioPlaying(false); return }
      const w = words[i++]
      const u1 = new SpeechSynthesisUtterance(w.word)
      u1.lang = 'en-US'; u1.rate = 0.82
      u1.onend = () => {
        if (w.def) {
          setTimeout(() => {
            const u2 = new SpeechSynthesisUtterance(w.def)
            u2.lang = /[\u4e00-\u9fff]/.test(w.def) ? 'zh-TW' : 'en-US'; u2.rate = 0.9
            u2.onend = () => setTimeout(playNext, 800)
            window.speechSynthesis.speak(u2)
          }, 300)
        } else { setTimeout(playNext, 800) }
      }
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u1)
    }
    playNext()
  }
  function stopAudio() { window.speechSynthesis.cancel(); setAudioPlaying(false) }

  function archiveWord(id)   { updateVocab(prev => (prev??[]).map(v => v.id === id ? {...v, archived:true}  : v)) }
  function unarchiveWord(id) { updateVocab(prev => (prev??[]).map(v => v.id === id ? {...v, archived:false} : v)) }

  async function lookupIPA(word) {
    try {
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim())}`)
      const d = await r.json()
      if (!Array.isArray(d)) return {}
      const ipa = d[0]?.phonetics?.find(p => p.text)?.text ?? ''
      const meaning = d[0]?.meanings?.[0]
      return { ipa_us: ipa, def: meaning?.definitions?.[0]?.definition ?? '', ex: meaning?.definitions?.[0]?.example ?? '' }
    } catch { return {} }
  }

  async function handleAdd() {
    if (!newWord.trim()) return
    const exists = (vocab ?? []).some(v => v.word.toLowerCase() === newWord.trim().toLowerCase())
    if (exists) { setAdding(false); setNewWord(''); return }
    setLoading(true)
    const extra = await lookupIPA(newWord)
    const entry = { id:`v${Date.now()}`, word:newWord.trim(), ipa_us:extra.ipa_us||`/${newWord}/`, def:extra.def||'', ex:extra.ex||'', diff:'mid', reps:0,ease:2.5,interval:1,dueDate:0,lastSeen:0 }
    updateVocab(prev => {
      const next = [...(prev??[]), entry]
      if (next.length >= 5) awardBadge('vocab_5')
      if (next.length >= 10) awardBadge('vocab_10')
      return next
    })
    updateStats(s => ({ ...s, xp: (s.xp??0) + 3 }))
    setNewWord(''); setAdding(false); setLoading(false)
  }

  function rate(q) {
    if (!cur) return
    updateVocab(prev => (prev??[]).map(v => v.id === cur.id ? srsSchedule(v, q) : v))
    updateStats(s => ({ ...s, xp: (s.xp??0) + (q>=3?3:1) }))
    setFlipIdx(i => i+1); setFlipped(false)
  }

  function checkFill() {
    const ok = fillAns.trim().toLowerCase() === (cur?.word ?? '').toLowerCase()
    setFillRes(ok ? 'ok' : 'no')
    rate(ok ? 5 : 0)
    setTimeout(() => { setFillRes(null); setFillAns('') }, 1300)
  }

  const SubBtn = ({ id, lbl }) => (
    <div onClick={() => setSub(id)} style={{ flex:1, textAlign:'center', padding:'7px 0', borderRadius:7, cursor:'pointer', fontFamily:MONO, fontSize:9.5, letterSpacing:'0.06em', background: sub===id ? T.amber : 'transparent', color: sub===id ? T.bg : '#c2cad4', transition:'all 0.14s' }}>
      {lbl}
    </div>
  )

  const DiffTag = ({ diff, onClick }) => {
    const d = DIFF[diff ?? 'mid'] ?? DIFF.mid
    return (
      <div onClick={onClick} title="點擊切換難度"
        style={{ cursor:'pointer', fontFamily:MONO, fontSize:8, color:d.color, background:d.bg, border:`1px solid ${d.color}50`, padding:'2px 7px', borderRadius:8, letterSpacing:'0.08em', flexShrink:0, userSelect:'none' }}>
        {d.label}
      </div>
    )
  }

  const DiffFilterBtn = ({ id, label }) => (
    <div onClick={() => setDiffFilter(id)}
      style={{ flex:1, textAlign:'center', padding:'5px 0', borderRadius:7, cursor:'pointer', fontFamily:MONO, fontSize:9, letterSpacing:'0.06em',
        background: diffFilter===id ? (id==='all'?T.surf2 : DIFF[id]?.bg ?? T.surf2) : 'transparent',
        color: diffFilter===id ? (id==='all'?T.amber : DIFF[id]?.color ?? T.amber) : '#9aa5b0',
        border: `1px solid ${diffFilter===id ? (id==='all'?T.amber+'50' : DIFF[id]?.color+'50' ?? T.amber) : T.bdr}`,
        transition:'all 0.14s' }}>
      {label}
    </div>
  )

  return (
    <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:14 }} className="fadeUp">

      {/* ── WORD SEARCH ── */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, letterSpacing:'0.12em' }}>WORD SEARCH</div>
        <div style={{ display:'flex', gap:8 }}>
          <input type="text" value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Type English word to look up…"
            onKeyDown={e=>e.key==='Enter'&&searchWord()}
            style={{ flex:1 }}/>
          <button className="btn" onClick={searchWord} disabled={searching||!query.trim()}
            style={{ background:T.blueD, border:`1px solid ${T.blue}50`, color:T.blue, padding:'10px 14px', whiteSpace:'nowrap' }}>
            {searching ? '…' : '🔍'}
          </button>
        </div>

        {searchMsg && (
          <div style={{ fontFamily:MONO, fontSize:11, color: searchMsg.startsWith('✓') ? T.grn : searchMsg.startsWith('「') ? T.txt2 : T.red, padding:'4px 2px' }}>
            {searchMsg}
          </div>
        )}

        {searchRes && (
          <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:12, padding:16, display:'flex', flexDirection:'column', gap:10 }} className="fadeUp">
            {/* Word header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <span style={{ fontFamily:DISP, fontSize:20, color:T.amber }}>{searchRes.word}</span>
                {searchRes.ipa && <span style={{ fontFamily:MONO, fontSize:10, color:'#9aa5b0', marginLeft:10 }}>{searchRes.ipa}</span>}
              </div>
              <div onClick={()=>speak(searchRes.word)} style={{ cursor:'pointer', color:T.txt3, padding:5 }}
                onMouseOver={e=>e.currentTarget.style.color=T.amber} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M10.5 5a3 3 0 010 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M12 2.5a6 6 0 010 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              </div>
            </div>

            {/* Difficulty selector */}
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>難度：</span>
              {['easy','mid','hard'].map(d => (
                <div key={d} onClick={() => setPendingDiff(d)}
                  style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color: pendingDiff===d ? DIFF[d].color : T.txt3,
                    background: pendingDiff===d ? DIFF[d].bg : 'transparent',
                    border:`1px solid ${pendingDiff===d ? DIFF[d].color+'70' : T.bdr}`,
                    padding:'3px 10px', borderRadius:10, transition:'all 0.14s' }}>
                  {DIFF[d].label}
                </div>
              ))}
            </div>

            {/* Definitions */}
            {searchRes.defs.map((def, i) => (
              <div key={i} style={{ background:T.surf2, borderRadius:9, padding:12 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                  <span style={{ fontFamily:MONO, fontSize:9, color:T.blue, letterSpacing:'0.08em' }}>{def.pos?.toUpperCase()}</span>
                  <button className="btn" onClick={() => addSearchResult(def)}
                    style={{ background:T.amberD, border:`1px solid ${T.amber}50`, color:T.amber, padding:'4px 12px', fontSize:10 }}>
                    + 加入單字庫
                  </button>
                </div>
                {/* Chinese translation */}
                {def.zh && (
                  <div style={{ fontFamily:MONO, fontSize:13, color:T.amber, fontWeight:500, marginBottom:5, lineHeight:1.4 }}>
                    {def.zh}
                  </div>
                )}
                {/* English definition */}
                <div style={{ fontFamily:SERIF, fontSize:12, color:T.txt2, lineHeight:1.55, marginBottom:4 }}>{def.def}</div>
                {def.ex && <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:11, color:T.txt3 }}>"{def.ex}"</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ height:1, background:T.bdr }}/>

      {/* Sub-tabs */}
      <div style={{ display:'flex', background:T.surf2, borderRadius:9, padding:3, gap:2 }}>
        <SubBtn id="list" lbl="LIST"/>
        <SubBtn id="flash" lbl="FLASHCARD"/>
        <SubBtn id="fill" lbl="FILL-IN"/>
        <div onClick={() => audioPlaying ? stopAudio() : startAudio()}
          style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'7px 12px', borderRadius:7, cursor:'pointer', background: audioPlaying ? T.amber : 'transparent', color: audioPlaying ? T.bg : '#c2cad4', transition:'all 0.14s', fontSize:13 }}
          title="Ride & Listen mode">
          {audioPlaying ? '⏹' : '🎧'}
        </div>
      </div>

      {audioPlaying && (
        <div style={{ background:`${T.amber}18`, border:`1px solid ${T.amber}40`, borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontFamily:MONO, fontSize:10, color:T.amber, animation:'pulse 1.5s infinite' }}>● AUDIO</span>
          <span style={{ fontFamily:SERIF, fontSize:12, color:T.txt2, flex:1 }}>騎車模式播放中</span>
          <button className="btn" onClick={stopAudio} style={{ background:T.redD, border:`1px solid ${T.red}50`, color:T.red, padding:'5px 10px', fontSize:11 }}>停止</button>
        </div>
      )}

      {sub === 'list' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {/* Difficulty filter */}
          <div style={{ display:'flex', gap:6 }}>
            <DiffFilterBtn id="all"  label="ALL"/>
            <DiffFilterBtn id="hard" label="🔴 HARD"/>
            <DiffFilterBtn id="mid"  label="🟡 MID"/>
            <DiffFilterBtn id="easy" label="🟢 EASY"/>
          </div>

          {adding ? (
            <div style={{ display:'flex', gap:8 }}>
              <input type="text" value={newWord} onChange={e=>setNewWord(e.target.value)} placeholder="Type English word…" onKeyDown={e=>e.key==='Enter'&&handleAdd()} autoFocus/>
              <button className="btn" onClick={handleAdd} disabled={loading||!newWord.trim()} style={{ background:T.amber, color:T.bg, whiteSpace:'nowrap', padding:'10px 14px' }}>
                {loading ? '…' : 'ADD'}
              </button>
              <button className="btn" onClick={()=>{setAdding(false);setNewWord('')}} style={{ background:T.bdr, color:T.txt2, padding:'10px 12px' }}>✕</button>
            </div>
          ) : (
            <button className="btn" onClick={()=>setAdding(true)} style={{ background:T.amberD, border:`1px solid ${T.amber}50`, color:T.amber, width:'100%' }}>
              + ADD WORD
            </button>
          )}

          {listWords.length === 0 && (
            <div style={{ textAlign:'center', color:T.txt3, fontFamily:SERIF, fontSize:13, padding:'24px 0' }}>
              {diffFilter === 'all' ? 'No words yet. Search above to add!' : `No ${diffFilter.toUpperCase()} words yet.`}
            </div>
          )}
          {listWords.map(w => (
            <div key={w.id} style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:11, padding:15, opacity: w.archived ? 0.5 : 1, transition:'opacity 0.2s' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:w.def ? 6 : 0 }}>
                <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontFamily:MONO, fontSize:15, color: w.archived ? T.txt3 : T.amber, fontWeight:500 }}>{w.word}</span>
                  {w.ipa_us && <span style={{ fontFamily:MONO, fontSize:10, color:'#9aa5b0' }}>{w.ipa_us}</span>}
                  <DiffTag diff={w.diff} onClick={() => toggleDiff(w.id)}/>
                </div>
                <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                  <div onClick={()=>speak(w.word)} style={{ cursor:'pointer', color:T.txt3, padding:5, transition:'color 0.14s' }}
                    onMouseOver={e=>e.currentTarget.style.color=T.amber} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M10.5 5a3 3 0 010 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  </div>
                  <div onClick={()=> w.archived ? unarchiveWord(w.id) : archiveWord(w.id)}
                    title={w.archived ? '取消封存' : '已熟，移到最後'}
                    style={{ cursor:'pointer', color: w.archived ? T.grn : T.txt3, padding:5, fontSize:12, fontFamily:MONO }}
                    onMouseOver={e=>e.currentTarget.style.color=T.grn} onMouseOut={e=>e.currentTarget.style.color= w.archived ? T.grn : T.txt3}>
                    {w.archived ? '↺' : '✓'}
                  </div>
                </div>
              </div>
              {w.def && <div style={{ fontFamily:SERIF, fontSize:13, color:T.txt2, lineHeight:1.55 }}>{w.def}</div>}
              {w.ex  && <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:12, color:T.txt3, marginTop:4, lineHeight:1.45 }}>"{w.ex}"</div>}
            </div>
          ))}
        </div>
      )}

      {sub === 'flash' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {!cur ? <div style={{ textAlign:'center', color:T.txt3, fontFamily:SERIF, fontSize:13, padding:24 }}>No words yet.</div> : (
            <>
              <div style={{ fontFamily:MONO, fontSize:9, color:'#9aa5b0', textAlign:'center', letterSpacing:'0.1em' }}>
                CARD {flipIdx % sorted.length + 1} / {sorted.length}
              </div>
              <div onClick={() => setFlipped(f=>!f)} style={{ background:T.surf, border:`1px solid ${flipped ? T.amber+'70' : T.bdr}`, borderRadius:16, padding:'36px 24px', minHeight:190, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, transition:'border-color 0.25s' }}>
                {!flipped ? (
                  <>
                    <div style={{ fontFamily:DISP, fontSize:26, color:T.amber, textAlign:'center' }}>{cur.word}</div>
                    {cur.ipa_us && <div style={{ fontFamily:MONO, fontSize:11, color:'#9aa5b0' }}>{cur.ipa_us}</div>}
                    <DiffTag diff={cur.diff}/>
                    <div style={{ fontFamily:MONO, fontSize:9, color:'#9aa5b0', marginTop:8, letterSpacing:'0.1em' }}>TAP TO REVEAL</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily:MONO, fontSize:11, color:T.amber, marginBottom:4 }}>{cur.word}</div>
                    <div style={{ fontFamily:SERIF, fontSize:15, color:T.txt, textAlign:'center', lineHeight:1.65 }}>{cur.def}</div>
                    {cur.ex && <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:13, color:T.txt2, textAlign:'center', lineHeight:1.5 }}>"{cur.ex}"</div>}
                    <div onClick={e=>{e.stopPropagation();speak(cur.word)}} style={{ cursor:'pointer', color:T.txt3, marginTop:8, padding:4 }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M10.5 5a3 3 0 010 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M12 2.5a6 6 0 010 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    </div>
                  </>
                )}
              </div>
              {flipped && (
                <div style={{ display:'flex', gap:8 }}>
                  {[{l:'Again',q:0,c:T.red},{l:'Hard',q:3,c:T.blue},{l:'Easy',q:5,c:T.grn}].map(({l,q,c}) => (
                    <button key={l} className="btn" onClick={() => rate(q)} style={{ flex:1, background:`${c}18`, border:`1px solid ${c}55`, color:c }}>{l}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {sub === 'fill' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {!cur ? <div style={{ textAlign:'center', color:T.txt3, fontFamily:SERIF, fontSize:13, padding:24 }}>No words yet.</div> : (
            <>
              <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:12, padding:20 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, letterSpacing:'0.1em' }}>FILL IN THE BLANK</div>
                  <DiffTag diff={cur.diff}/>
                </div>
                <div style={{ fontFamily:SERIF, fontSize:14, color:T.txt, lineHeight:1.75, marginBottom:14 }}>
                  {cur.ex
                    ? cur.ex.replace(new RegExp(`\b${cur.word.replace(/\s/g,'\\s')}\b`, 'gi'), '＿＿＿＿＿')
                    : cur.def.replace(new RegExp(`\b${cur.word.split(' ')[0]}\w*\b`, 'gi'), '＿＿＿＿＿')
                  }
                </div>
                {cur.ipa_us && <div style={{ fontFamily:MONO, fontSize:10, color:T.txt3, marginBottom:10 }}>Hint: {cur.ipa_us}</div>}
                <input type="text" value={fillAns} onChange={e=>setFillAns(e.target.value)}
                  placeholder="Type the missing word…" onKeyDown={e=>e.key==='Enter'&&checkFill()}
                  style={{ borderColor: fillRes==='ok' ? T.grn : fillRes==='no' ? T.red : T.bdr2 }}/>
                {fillRes && (
                  <div style={{ marginTop:9, fontFamily:MONO, fontSize:12, color: fillRes==='ok' ? T.grn : T.red, textAlign:'center' }}>
                    {fillRes==='ok' ? '✓ Correct!' : `✗ Answer: ${cur.word}`}
                  </div>
                )}
              </div>
              <button className="btn" onClick={checkFill} style={{ background:T.amber, color:T.bg, width:'100%' }}>CHECK →</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// EMAIL / AI TAB
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// PHRASE DATA — 副廠長會議常用 50 句
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// PHRASE DATA
// ═══════════════════════════════════════════════════════════════
const PHRASE_CATS = [
  { id:'all',      label:'全部' },
  { id:'opening',  label:'開場/進度' },
  { id:'capacity', label:'產能/稼動' },
  { id:'quality',  label:'良率/品質' },
  { id:'cost',     label:'成本/毛利' },
  { id:'action',   label:'行動/決策' },
  { id:'life',     label:'🗣 生活口說' },
  { id:'my',       label:'⭐ 我的收藏' },   // 手動新增的句子
]
const PHRASE_DATA = [
  { id:'ph01', cat:'opening',  en:'Let me give a quick update on the current status.', zh:'讓我快速更新一下目前狀況。' },
  { id:'ph02', cat:'opening',  en:"Let's start with the production update.", zh:'我們先從生產狀況開始。' },
  { id:'ph03', cat:'opening',  en:'The overall performance is stable.', zh:'整體績效目前穩定。' },
  { id:'ph04', cat:'opening',  en:'Production is running normally today.', zh:'今天生產運作正常。' },
  { id:'ph05', cat:'opening',  en:'The current status is under control.', zh:'目前狀況在控制之中。' },
  { id:'ph06', cat:'opening',  en:'We are making steady progress.', zh:'我們正在穩定推進。' },
  { id:'ph07', cat:'opening',  en:'Let me summarize the key points.', zh:'我來總結一下重點。' },
  { id:'ph08', cat:'opening',  en:'We will review the details later.', zh:'細節我們稍後再檢視。' },
  { id:'ph09', cat:'opening',  en:'I will walk you through the main issues.', zh:'我來說明主要問題。' },
  { id:'ph10', cat:'opening',  en:"Let's move on to the next topic.", zh:'我們進入下一個議題。' },
  { id:'ph11', cat:'capacity', en:'We need to review the utilization of the SMD lines.', zh:'我們需要檢視 SMD 線的稼動率。' },
  { id:'ph12', cat:'capacity', en:'The current utilization rate is below target.', zh:'目前稼動率低於目標。' },
  { id:'ph13', cat:'capacity', en:'Production output is slightly below expectation.', zh:'產出略低於預期。' },
  { id:'ph14', cat:'capacity', en:'We need to increase production capacity.', zh:'我們需要提升產能。' },
  { id:'ph15', cat:'capacity', en:'The production line is running at full capacity.', zh:'產線目前滿載運作。' },
  { id:'ph16', cat:'capacity', en:'We are facing some bottlenecks in this process.', zh:'這個製程目前有瓶頸。' },
  { id:'ph17', cat:'capacity', en:'We are working on balancing the production lines.', zh:'我們正在進行產線平衡。' },
  { id:'ph18', cat:'capacity', en:'The equipment utilization needs improvement.', zh:'設備利用率需要改善。' },
  { id:'ph19', cat:'capacity', en:'We are monitoring the production output closely.', zh:'我們正在密切監控產出。' },
  { id:'ph20', cat:'capacity', en:'The production plan remains unchanged.', zh:'生產計畫維持不變。' },
  { id:'ph21', cat:'quality',  en:'The yield has improved compared to last month.', zh:'良率比上月有所改善。' },
  { id:'ph22', cat:'quality',  en:'The yield is still below our target.', zh:'良率仍低於目標。' },
  { id:'ph23', cat:'quality',  en:'We are investigating the root cause.', zh:'我們正在調查根本原因。' },
  { id:'ph24', cat:'quality',  en:'We identified the main issue in the process.', zh:'我們已找到製程的主要問題。' },
  { id:'ph25', cat:'quality',  en:'Corrective actions are being implemented.', zh:'正在執行矯正措施。' },
  { id:'ph26', cat:'quality',  en:'We need to prevent this issue from happening again.', zh:'我們需要防止問題再次發生。' },
  { id:'ph27', cat:'quality',  en:'The defect rate has decreased significantly.', zh:'不良率明顯下降。' },
  { id:'ph28', cat:'quality',  en:'Quality performance is improving steadily.', zh:'品質表現正在穩定改善。' },
  { id:'ph29', cat:'quality',  en:'The issue has been contained.', zh:'問題已經被控制。' },
  { id:'ph30', cat:'quality',  en:'We will continue to monitor the situation.', zh:'我們會持續監控狀況。' },
  { id:'ph31', cat:'cost',     en:'We need to mitigate the cost impact.', zh:'我們需要減輕成本衝擊。' },
  { id:'ph32', cat:'cost',     en:'Several cost reduction projects are underway.', zh:'多個降成本專案正在進行。' },
  { id:'ph33', cat:'cost',     en:'The gross margin needs improvement.', zh:'毛利需要改善。' },
  { id:'ph34', cat:'cost',     en:'We need to review the pricing strategy.', zh:'我們需要檢討定價策略。' },
  { id:'ph35', cat:'cost',     en:'The current cost structure needs adjustment.', zh:'目前成本結構需要調整。' },
  { id:'ph36', cat:'cost',     en:'This product currently has a negative margin.', zh:'這個產品目前毛利為負。' },
  { id:'ph37', cat:'cost',     en:'We need to optimize the product portfolio.', zh:'我們需要優化產品組合。' },
  { id:'ph38', cat:'cost',     en:'The price gap with competitors is still large.', zh:'與競爭對手仍有價格差距。' },
  { id:'ph39', cat:'cost',     en:'We need to close the gap as soon as possible.', zh:'我們需要盡快縮小差距。' },
  { id:'ph40', cat:'cost',     en:'This will have a significant impact on our margin.', zh:'這會對毛利產生明顯影響。' },
  { id:'ph41', cat:'action',   en:'This issue should be our top priority.', zh:'這個問題應該是我們的首要優先事項。' },
  { id:'ph42', cat:'action',   en:'We need to take action immediately.', zh:'我們需要立即採取行動。' },
  { id:'ph43', cat:'action',   en:'Please coordinate with the engineering team.', zh:'請與工程團隊協調。' },
  { id:'ph44', cat:'action',   en:"Let's follow up on this next week.", zh:'我們下週再追蹤。' },
  { id:'ph45', cat:'action',   en:'We need a clear action plan.', zh:'我們需要一個清楚的行動計畫。' },
  { id:'ph46', cat:'action',   en:'Please provide justification for this request.', zh:'請提供這項需求的理由。' },
  { id:'ph47', cat:'action',   en:'We will evaluate this proposal.', zh:'我們會評估這個提案。' },
  { id:'ph48', cat:'action',   en:"Let's align with the team before making a decision.", zh:'我們先與團隊對齊再做決定。' },
  { id:'ph49', cat:'action',   en:'We need to monitor this closely.', zh:'我們需要密切監控。' },
  { id:'ph50', cat:'action',   en:"Let's keep this as a key focus.", zh:'這件事我們持續重點關注。' },
  // 生活口說 — 一、開口
  { id:'lf01', cat:'life', sub:'開口說', en:'Let me try.', zh:'讓我試試看' },
  { id:'lf02', cat:'life', sub:'開口說', en:'Give me a second.', zh:'給我一下' },
  { id:'lf03', cat:'life', sub:'開口說', en:'How can I say…', zh:'我怎麼說…' },
  { id:'lf04', cat:'life', sub:'開口說', en:"It's hard to explain, but…", zh:'有點難講，但…' },
  // 生活口說 — 二、聽不懂
  { id:'lf05', cat:'life', sub:'聽不懂', en:'Sorry, can you repeat?', zh:'可以再說一次嗎' },
  { id:'lf06', cat:'life', sub:'聽不懂', en:'What do you mean?', zh:'你是什麼意思' },
  { id:'lf07', cat:'life', sub:'聽不懂', en:'Do you mean…?', zh:'你是指…嗎' },
  { id:'lf08', cat:'life', sub:'聽不懂', en:'Can you say it in a simpler way?', zh:'可以講簡單一點嗎' },
  // 生活口說 — 三、簡單回答
  { id:'lf09', cat:'life', sub:'簡單回答', en:'I think…', zh:'我覺得…' },
  { id:'lf10', cat:'life', sub:'簡單回答', en:'Maybe because…', zh:'可能是因為…' },
  { id:'lf11', cat:'life', sub:'簡單回答', en:'Main reason is…', zh:'主要原因是…' },
  { id:'lf12', cat:'life', sub:'簡單回答', en:'The problem is…', zh:'問題是…' },
  // 生活口說 — 四、拖時間
  { id:'lf13', cat:'life', sub:'拖時間', en:'Let me think…', zh:'我想一下' },
  { id:'lf14', cat:'life', sub:'拖時間', en:"I'm not sure, but…", zh:'我不確定，但…' },
  { id:'lf15', cat:'life', sub:'拖時間', en:'Something like…', zh:'有點像…' },
  // 生活口說 — 五、補充
  { id:'lf16', cat:'life', sub:'補充', en:'Also…', zh:'還有…' },
  { id:'lf17', cat:'life', sub:'補充', en:'And then…', zh:'然後…' },
  { id:'lf18', cat:'life', sub:'補充', en:'After that…', zh:'之後…' },
  // 生活口說 — 六、收尾
  { id:'lf19', cat:'life', sub:'收尾', en:"That's it.", zh:'就這樣' },
  { id:'lf20', cat:'life', sub:'收尾', en:"That's my idea.", zh:'這是我的想法' },
]

// ── Q&A 問答資料（20句）──────────────────────────────────────
const QA_DATA = [
  { id:'qa01', q:'What is the main issue?',        a:'The main issue is yield.',                linked:'Thə-main-issue-is yield',                  rhythm:'thə-MAIN-issue-is-YIELD' },
  { id:'qa02', q:'Why is the cost high?',           a:'Because material cost is high.',          linked:'Be-cause-ma-terial-cos(t)-is high',          rhythm:'beCAUSE-maTERial-COST-is-HIGH' },
  { id:'qa03', q:'Where is the problem coming from?',a:"It's coming from the packaging stage.",  linked:"It's-co-ming-from-thə-pa-cka-ging stage",    rhythm:'its-COMing-from-thə-PACKaging-STAGE' },
  { id:'qa04', q:'What should we do?',              a:'We need to reduce the cost.',             linked:'We-need-tə-re-duce-thə cost',               rhythm:'we-NEED-tə-reDUCE-thə-COST' },
  { id:'qa05', q:'What is the action?',             a:'We need to improve yield.',               linked:'We-need-tə-im-prove yield',                 rhythm:'we-NEED-tə-imPROVE-YIELD' },
  { id:'qa06', q:'Are we facing any issues?',       a:'Yes, we are facing a delay.',             linked:'Yes-we-are-fa-cingə-de-lay',                rhythm:'YES-we-are-FAcingə-deLAY' },
  { id:'qa07', q:'What is the current status?',     a:'We are working on a solution.',           linked:'We-are-wor-king-onə-so-lu-tion',            rhythm:'we-are-WORKing-onə-soLUtion' },
  { id:'qa08', q:'Do we have a capacity issue?',    a:'Yes, we have a capacity issue.',          linked:'Yes-we-haveə-ca-pa-ci-ty issue',            rhythm:'YES-we-HAVEə-caPAcity-ISSUE' },
  { id:'qa09', q:'What is the root cause?',         a:'The issue is from process variation.',    linked:'Thə-issue-is-from-pro-cess-va-ri-a-tion',   rhythm:'thə-ISSUE-is-FROM-PROcess-vaRIation' },
  { id:'qa10', q:'What is happening now?',          a:'Right now, we are fixing this issue.',    linked:'Right-now-we-are-fi-xing-this issue',       rhythm:'RIGHT-now-we-are-FIXing-this-ISSUE' },
  { id:'qa11', q:'What is the plan?',               a:'We will update you later.',               linked:'We-will-up-date-you-la-ter',                rhythm:'we-will-upDATE-you-LAter' },
  { id:'qa12', q:'What is your suggestion?',        a:'We need to improve the process.',         linked:'We-need-tə-im-prove-thə-pro-cess',          rhythm:'we-NEED-tə-imPROVE-thə-PROcess' },
  { id:'qa13', q:'Why is the yield low?',           a:'Because of process issues.',              linked:'Be-cause-of-pro-cess issues',               rhythm:'beCAUSE-of-PROcess-ISSUES' },
  { id:'qa14', q:'Is the line running well?',       a:'No, it is running below target.',         linked:'No-it-is-run-ning-be-low-tar-get',          rhythm:'NO-it-is-RUNning-beLOW-TARget' },
  { id:'qa15', q:'What is the impact?',             a:'This will impact delivery.',              linked:'This-will-im-pact-de-li-ve-ry',             rhythm:'this-will-imPACT-deLIvery' },
  { id:'qa16', q:'Do we need action now?',          a:'Yes, we need to act now.',                linked:'Yes-we-need-tə-act-now',                    rhythm:'YES-we-NEED-tə-ACT-now' },
  { id:'qa17', q:'What should we check?',           a:'We need to check the data.',              linked:'We-need-tə-check-thə-da-ta',                rhythm:'we-NEED-tə-CHECK-thə-DAta' },
  { id:'qa18', q:'What is the priority?',           a:'The priority is yield improvement.',      linked:'Thə-pri-or-i-ty-is-yield-im-prove-ment',   rhythm:'thə-priORity-is-YIELD-imPROVEment' },
  { id:'qa19', q:'What is your update?',            a:"That's my update.",                       linked:"That's-my-up-date",                         rhythm:"THAT's-my-UPdate" },
  { id:'qa20', q:'Are we on track?',                a:'Yes, we are on track.',                   linked:'Yes-we-are-on track',                       rhythm:'YES-we-are-on-TRACK' },
]

// ── Linked / Rhythm 文字渲染器 ────────────────────────────────
function LinkedText({ text, type }) {
  // type: 'linked' (amber) or 'rhythm' (green)
  const baseColor = type === 'linked' ? T.amber : T.grn
  const tokens = text.split('-')
  return (
    <div style={{ display:'flex', flexWrap:'wrap', alignItems:'baseline', gap:'1px 0', lineHeight:1.8 }}>
      {tokens.map((tok, i) => {
        const isLast   = i === tokens.length - 1
        // weak forms: thə tə ə ðə
        const isWeak   = /^(thə|tə|ə|ðə)$/i.test(tok)
        // stressed: ALL CAPS (length>1, or short like YIELD YES NO)
        const isStress = tok === tok.toUpperCase() && /[A-Z]{2,}/.test(tok)
        // elision: contains ()
        const hasElis  = tok.includes('(')
        const color    = isWeak ? '#58a6ff' : isStress ? '#ffffff' : baseColor
        return (
          <span key={i} style={{ display:'inline-flex', alignItems:'baseline', gap:0 }}>
            <span style={{
              fontFamily: MONO,
              fontSize:   isStress ? 14 : 12,
              fontWeight: isStress ? 700 : 400,
              color,
              letterSpacing: '0.01em',
            }}>
              {tok}
            </span>
            {!isLast && (
              <span style={{ fontFamily:MONO, fontSize:11, color:baseColor+'60', margin:'0 0px' }}>·</span>
            )}
          </span>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// DICTATION MODE — 聽寫模式
// ═══════════════════════════════════════════════════════════════
function _lev(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m+1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}
function _norm(w) { return w.toLowerCase().replace(/[.,!?;:'"]/g, '') }

function dictDiff(original, userInput) {
  const origWords  = original.trim().split(/\s+/)
  const typedWords = userInput.trim().split(/\s+/).filter(w => w.length > 0)
  if (typedWords.length === 0) {
    return { tokens: origWords.map(w => ({ orig:w, typed:null, status:'missing' })), score:0, correct:0, total:origWords.length }
  }
  const m = origWords.length, n = typedWords.length
  const dp = Array.from({ length: m+1 }, () => Array(n+1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = _norm(origWords[i-1]) === _norm(typedWords[j-1])
        ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1])
  const aligned = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && _norm(origWords[i-1]) === _norm(typedWords[j-1])) {
      aligned.unshift({ orig:origWords[i-1], typed:typedWords[j-1], status:'correct' }); i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { j-- }
    else { aligned.unshift({ orig:origWords[i-1], typed:null, status:'missing' }); i-- }
  }
  const usedTyped = new Set(aligned.filter(t => t.typed).map(t => t.typed))
  const unusedTyped = typedWords.filter(w => !usedTyped.has(w))
  const tokens = aligned.map(t => {
    if (t.status === 'correct') return t
    let best = null, bestDist = Infinity
    for (const tw of unusedTyped) {
      const d = _lev(_norm(t.orig), _norm(tw))
      const thresh = Math.max(1, Math.floor(_norm(t.orig).length * 0.35))
      if (d < bestDist && d <= thresh) { best = tw; bestDist = d }
    }
    if (best) { unusedTyped.splice(unusedTyped.indexOf(best), 1); return { orig:t.orig, typed:best, status:'typo' } }
    return t
  })
  const correct = tokens.filter(t => t.status === 'correct').length
  return { tokens, score: Math.round((correct / tokens.length) * 100), correct, total: tokens.length }
}

function DiffDisplay({ tokens }) {
  return (
    <div style={{ fontFamily:MONO, fontSize:14, lineHeight:2.4, flexWrap:'wrap', display:'flex', gap:'0 7px', alignItems:'baseline' }}>
      {tokens.map((tok, i) => {
        if (tok.status === 'correct')
          return <span key={i} style={{ color:T.grn, fontWeight:500 }}>{tok.orig}</span>
        if (tok.status === 'typo')
          return (
            <span key={i} style={{ display:'inline-flex', flexDirection:'column', alignItems:'center', gap:0 }}>
              <span style={{ fontFamily:MONO, fontSize:9, color:T.amber, lineHeight:1 }}>{tok.typed}</span>
              <span style={{ color:T.amber, textDecoration:'underline wavy', textDecorationColor:T.amber+'80' }}>{tok.orig}</span>
            </span>
          )
        return <span key={i} style={{ color:T.red, textDecoration:'underline', textDecorationStyle:'dashed', opacity:0.85 }}>{tok.orig}</span>
      })}
    </div>
  )
}

function DictationCard({ card, cardNum, total, onNext }) {
  const [phase, setPhase]         = useState('listen')
  const [playCount, setPlayCount] = useState(0)
  const [showHint, setShowHint]   = useState(false)
  const [input, setInput]         = useState('')
  const [result, setResult]       = useState(null)
  const [showZh, setShowZh]       = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    setPhase('listen'); setPlayCount(0); setShowHint(false)
    setInput(''); setResult(null); setShowZh(false)
  }, [card?.en])

  useEffect(() => {
    if (phase === 'listen' && playCount === 0 && card) {
      const t = setTimeout(() => { speak(card.en, 0.75); setPlayCount(1) }, 500)
      return () => clearTimeout(t)
    }
  }, [phase, card])

  useEffect(() => {
    if (phase === 'type') setTimeout(() => inputRef.current?.focus(), 100)
  }, [phase])

  function handlePlay() { speak(card.en, playCount >= 2 ? 0.6 : 0.75); setPlayCount(p => p+1) }
  function handleSubmit() {
    if (!input.trim()) return
    setResult(dictDiff(card.en, input)); setPhase('result')
  }
  function handleNext() {
    setPhase('listen'); setPlayCount(0); setShowHint(false)
    setInput(''); setResult(null); setShowZh(false)
    onNext?.()
  }

  const wordCount = card.en.trim().split(/\s+/).length
  const sc = result ? (result.score >= 90 ? T.grn : result.score >= 60 ? T.amber : T.red) : T.amber

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, textAlign:'right' }}>{cardNum} / {total}</div>

      {/* ── LISTEN ── */}
      {phase === 'listen' && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:18 }}>
          <div style={{ width:'100%', background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:16, padding:'30px 20px', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
            <div style={{ fontFamily:MONO, fontSize:10, color:T.txt3, letterSpacing:'0.15em' }}>🎧 DICTATION</div>
            <div style={{ fontFamily:MONO, fontSize:12, color:T.txt3 }}>仔細聽，寫下你聽到的句子</div>
            {showHint && <div style={{ fontFamily:MONO, fontSize:10, color:T.amber }}>共 {wordCount} 個字</div>}
          </div>
          <div onClick={handlePlay}
            style={{ width:72, height:72, borderRadius:'50%', background:T.amberD, border:`2px solid ${T.amber}60`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'background 0.15s' }}
            onMouseOver={e=>e.currentTarget.style.background=T.amber+'30'} onMouseOut={e=>e.currentTarget.style.background=T.amberD}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M3 9h4l5-5v16l-5-5H3z" stroke={T.amber} strokeWidth="1.5" fill={T.amber+'30'}/>
              <path d="M16 6.5a5.5 5.5 0 010 11" stroke={T.amber} strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M13.5 9a2.5 2.5 0 010 5" stroke={T.amber} strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ fontFamily:MONO, fontSize:9, color: playCount >= 3 ? T.red : T.txt3 }}>
            已播 {playCount} 次{playCount >= 3 ? '（建議不超過 3 次）' : ''}
          </div>
          <div style={{ display:'flex', gap:8, width:'100%' }}>
            {!showHint && (
              <button className="btn" onClick={() => setShowHint(true)}
                style={{ flex:1, background:'transparent', border:`1px solid ${T.bdr2}`, color:T.txt3, fontSize:11 }}>
                💡 字數提示
              </button>
            )}
            <button className="btn" onClick={() => setPhase('type')} disabled={playCount === 0}
              style={{ flex:2, background:T.amberD, border:`1px solid ${T.amber}60`, color:T.amber, fontSize:11, fontWeight:700 }}>
              ✏️ 我聽好了，開始寫
            </button>
          </div>
        </div>
      )}

      {/* ── TYPE ── */}
      {phase === 'type' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, textAlign:'center' }}>
            寫下你聽到的句子{showHint ? `（共 ${wordCount} 個字）` : ''}
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <div onClick={handlePlay}
              style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.txt3, padding:'4px 10px', borderRadius:6, background:T.surf2, border:`1px solid ${T.bdr}` }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.3" fill="none"/></svg>
              再聽一次（{playCount}）
            </div>
          </div>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }}}
            placeholder="Type what you heard…"
            style={{ minHeight:90, resize:'none', background:T.surf, border:`1px solid ${T.bdr2}`, borderRadius:10, padding:'12px 14px', fontFamily:MONO, fontSize:14, color:T.txt, outline:'none', lineHeight:1.8, transition:'border-color 0.15s' }}
            onFocus={e=>e.target.style.borderColor=T.amber} onBlur={e=>e.target.style.borderColor=T.bdr2}/>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" onClick={() => setPhase('listen')}
              style={{ flex:1, background:'transparent', border:`1px solid ${T.bdr}`, color:T.txt3, fontSize:11 }}>← 再聽</button>
            <button className="btn" onClick={handleSubmit} disabled={!input.trim()}
              style={{ flex:2, background:T.blueD, border:`1px solid ${T.blue}60`, color:T.blue, fontSize:11, fontWeight:700 }}>✓ 對答案</button>
          </div>
        </div>
      )}

      {/* ── RESULT ── */}
      {phase === 'result' && result && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }} className="fadeUp">
          {/* 分數卡 */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:16, background:T.surf, border:`1px solid ${sc}40`, borderRadius:14, padding:'16px 20px' }}>
            <div style={{ fontFamily:MONO, fontSize:42, fontWeight:700, color:sc, lineHeight:1 }}>{result.score}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>分</div>
              <div style={{ fontFamily:MONO, fontSize:11, color:T.txt2 }}>{result.correct} / {result.total} 字正確</div>
              <div style={{ fontFamily:MONO, fontSize:10, color:sc }}>
                {result.score>=90?'🎉 完美！':result.score>=70?'👍 不錯':result.score>=50?'繼續加油':'再聽一次！'}
              </div>
            </div>
          </div>

          {/* Diff */}
          <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:12, padding:'14px 16px', display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ fontFamily:MONO, fontSize:8, color:T.txt3, display:'flex', gap:12 }}>
              <span><span style={{color:T.grn}}>■</span> 正確</span>
              <span><span style={{color:T.amber}}>■</span> 拼錯（你寫的在上方）</span>
              <span><span style={{color:T.red}}>■</span> 缺字</span>
            </div>
            <DiffDisplay tokens={result.tokens}/>
          </div>

          {/* 你的輸入 */}
          <div style={{ background:T.surf2, border:`1px solid ${T.bdr}`, borderRadius:10, padding:'10px 14px' }}>
            <div style={{ fontFamily:MONO, fontSize:8, color:T.txt3, marginBottom:4 }}>你寫的</div>
            <div style={{ fontFamily:MONO, fontSize:12, color:T.txt2, lineHeight:1.7 }}>{input}</div>
          </div>

          {/* 中文（選擇性）*/}
          {card.zh && (
            <div onClick={() => setShowZh(v=>!v)} style={{ cursor:'pointer', textAlign:'center' }}>
              {showZh
                ? <span style={{ fontFamily:SERIF, fontSize:13, color:T.txt2, fontStyle:'italic' }}>{card.zh}</span>
                : <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>▾ 顯示中文翻譯</span>}
            </div>
          )}

          {/* 按鈕 */}
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" onClick={() => { speak(card.en, 0.7) }}
              style={{ flex:1, background:T.surf2, border:`1px solid ${T.bdr2}`, color:T.txt2, fontSize:11 }}>🔊 再聽</button>
            <button className="btn" onClick={handleNext}
              style={{ flex:2, background:T.grnD, border:`1px solid ${T.grn}60`, color:T.grn, fontSize:11, fontWeight:700 }}>下一句 →</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── DictationCardManager：管理洗牌 queue ────────────────────
function DictationCardManager({ pool, cat }) {
  const [queue, setQueue] = useState(() => [...pool].sort(() => Math.random() - 0.5))
  const [idx, setIdx] = useState(0)

  // pool 改變時（切換分類）重新洗牌
  useEffect(() => {
    setQueue([...pool].sort(() => Math.random() - 0.5))
    setIdx(0)
  }, [cat])

  const card = queue[idx] ?? queue[0]
  if (!card) return (
    <div style={{ textAlign:'center', color:T.txt3, fontFamily:SERIF, fontSize:14, padding:40 }}>此分類尚無句子</div>
  )
  return (
    <DictationCard card={card} cardNum={idx+1} total={queue.length}
      onNext={() => setIdx(i => (i+1) % queue.length)}/>
  )
}

// ── SpeechCard：口說比對 ─────────────────────────────────────
function SpeechCard({ card, cardNum, total, onNext }) {
  const [phase, setPhase]             = useState('ready')
  const [transcript, setTranscript]   = useState('')
  const [interim, setInterim]         = useState('')
  const [result, setResult]           = useState(null)
  const [isListening, setIsListening] = useState(false)
  const [supported, setSupported]     = useState(null)
  const [errMsg, setErrMsg]           = useState('')
  const [played, setPlayed]           = useState(false)
  const [showZh, setShowZh]           = useState(false)
  const recogRef = useRef(null)

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    setSupported(!!SR)
  }, [])

  useEffect(() => {
    setPhase('ready'); setTranscript(''); setInterim('')
    setResult(null); setIsListening(false); setErrMsg('')
    setPlayed(false); setShowZh(false)
    recogRef.current?.abort()
  }, [card?.en])

  useEffect(() => {
    if (phase === 'ready' && !played && card) {
      const t = setTimeout(() => { speak(card.en, 0.75); setPlayed(true) }, 400)
      return () => clearTimeout(t)
    }
  }, [phase, card, played])

  function startRecognition() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) { setErrMsg('此裝置不支援語音辨識（需要 Chrome 或 Safari）'); return }
    window.speechSynthesis?.cancel()
    const recog = new SR()
    recog.lang = 'en-US'; recog.continuous = false
    recog.interimResults = true; recog.maxAlternatives = 3
    let finalT = ''
    recog.onstart  = () => { setIsListening(true); setErrMsg(''); setInterim('') }
    recog.onresult = (e) => {
      let itm = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalT += t + ' '
        else itm += t
      }
      setInterim(itm); setTranscript(finalT.trim())
    }
    recog.onend = () => {
      setIsListening(false); setInterim('')
      const final = finalT.trim()
      if (final) { setTranscript(final); setResult(dictDiff(card.en, final)); setPhase('result') }
      else { if (!errMsg) setErrMsg('沒有偵測到聲音，請靠近麥克風再試'); setPhase('ready') }
    }
    recog.onerror = (e) => {
      setIsListening(false); setInterim('')
      const msgs = { 'no-speech':'沒有偵測到聲音，請靠近麥克風再試', 'not-allowed':'麥克風權限被拒絕，請在瀏覽器設定中允許', 'network':'網路錯誤，請確認連線狀態' }
      setErrMsg(msgs[e.error] ?? ('辨識失敗：' + e.error)); setPhase('ready')
    }
    recogRef.current = recog; recog.start(); setPhase('listening')
  }

  function stopRecognition() { recogRef.current?.stop() }
  function retry() { setPhase('ready'); setTranscript(''); setInterim(''); setResult(null); setErrMsg(''); setPlayed(false) }

  const sc = result ? (result.score>=90?T.grn : result.score>=60?T.amber : T.red) : T.amber

  if (supported === false) return (
    <div style={{ background:T.surf, border:`1px solid ${T.red}40`, borderRadius:14, padding:24, textAlign:'center', display:'flex', flexDirection:'column', gap:12, alignItems:'center' }}>
      <div style={{ fontSize:28 }}>🚫</div>
      <div style={{ fontFamily:MONO, fontSize:11, color:T.red }}>此裝置不支援語音辨識</div>
      <div style={{ fontFamily:SERIF, fontSize:13, color:T.txt2, lineHeight:1.7 }}>
        請使用 Chrome（桌機/Android）<br/>或 Safari（iOS 14.5+）
      </div>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, textAlign:'right' }}>{cardNum} / {total}</div>

      {/* ── READY / LISTENING ── */}
      {(phase === 'ready' || phase === 'listening') && (
        <>
          {/* 句子卡（顯示）*/}
          <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:14, padding:'18px 18px', display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontFamily:MONO, fontSize:8.5, color:T.txt3, letterSpacing:'0.1em' }}>🎙 口說比對 — 跟著說這句話</div>
            <div style={{ fontFamily:MONO, fontSize:15, color:T.txt, lineHeight:1.8 }}>{card.en}</div>
            {card.zh && showZh && <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:13, color:T.txt2 }}>{card.zh}</div>}
            <div style={{ display:'flex', gap:8 }}>
              <div onClick={() => { speak(card.en, 0.75); setPlayed(true) }}
                style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', color:T.txt3, padding:'4px 8px', background:T.surf2, borderRadius:6, fontFamily:MONO, fontSize:9 }}
                onMouseOver={e=>e.currentTarget.style.color=T.amber} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.3" fill="none"/></svg>
                聽範例
              </div>
              {card.zh && (
                <div onClick={() => setShowZh(v=>!v)}
                  style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.txt3, padding:'4px 8px', background:T.surf2, borderRadius:6 }}>
                  {showZh ? '隱藏翻譯' : '中文翻譯'}
                </div>
              )}
            </div>
          </div>

          {/* Interim transcript */}
          {phase === 'listening' && (
            <div style={{ background:T.surf2, border:`1px solid ${T.blue}40`, borderRadius:12, padding:'12px 16px', minHeight:48, display:'flex', alignItems:'center' }} className="fadeUp">
              <div style={{ fontFamily:MONO, fontSize:13, color: interim ? T.blue : T.txt3, lineHeight:1.6 }}>
                {interim || <span style={{ animation:'pulse 1s infinite', display:'inline-block' }}>聆聽中…</span>}
              </div>
            </div>
          )}

          {/* Error */}
          {errMsg && (
            <div style={{ background:T.redD, border:`1px solid ${T.red}40`, borderRadius:10, padding:'10px 14px', fontFamily:MONO, fontSize:10, color:T.red }}>⚠ {errMsg}</div>
          )}

          {/* Mic button */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
            <div onClick={phase==='ready' ? startRecognition : stopRecognition}
              style={{ width:80, height:80, borderRadius:'50%',
                background: phase==='listening' ? `${T.red}25` : T.redD,
                border: `2px solid ${phase==='listening' ? T.red : T.red+'60'}`,
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', gap:4,
                animation: phase==='listening' ? 'glow 1s infinite' : 'none', transition:'background 0.2s' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="2" width="6" height="12" rx="3" stroke={T.red} strokeWidth="1.6" fill={phase==='listening' ? T.red+'60' : T.red+'30'}/>
                <path d="M5 10a7 7 0 0014 0" stroke={T.red} strokeWidth="1.6" strokeLinecap="round"/>
                <line x1="12" y1="20" x2="12" y2="23" stroke={T.red} strokeWidth="1.6" strokeLinecap="round"/>
                <line x1="9" y1="23" x2="15" y2="23" stroke={T.red} strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              <span style={{ fontFamily:MONO, fontSize:8, color:T.red }}>{phase==='listening' ? '按下停止' : '按下說話'}</span>
            </div>
            <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
              {phase==='listening' ? '正在聆聽，說完後自動辨識' : '按下麥克風開始說話'}
            </div>
          </div>
          <button className="btn" onClick={onNext}
            style={{ background:'transparent', border:`1px solid ${T.bdr}`, color:T.txt3, fontSize:10 }}>跳過 →</button>
        </>
      )}

      {/* ── RESULT ── */}
      {phase === 'result' && result && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }} className="fadeUp">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:16, background:T.surf, border:`1px solid ${sc}40`, borderRadius:14, padding:'16px 20px' }}>
            <div style={{ fontFamily:MONO, fontSize:42, fontWeight:700, color:sc, lineHeight:1 }}>{result.score}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>分</div>
              <div style={{ fontFamily:MONO, fontSize:11, color:T.txt2 }}>{result.correct} / {result.total} 字正確</div>
              <div style={{ fontFamily:MONO, fontSize:10, color:sc }}>
                {result.score>=90?'🎉 說得很好！':result.score>=70?'👍 不錯，繼續':result.score>=50?'多練幾次':'再聽一次再說'}
              </div>
            </div>
          </div>
          <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:12, padding:'14px 16px', display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ fontFamily:MONO, fontSize:8, color:T.txt3, display:'flex', gap:12 }}>
              <span><span style={{color:T.grn}}>■</span> 說對</span>
              <span><span style={{color:T.amber}}>■</span> 近似</span>
              <span><span style={{color:T.red}}>■</span> 漏說</span>
            </div>
            <DiffDisplay tokens={result.tokens}/>
          </div>
          <div style={{ background:T.surf2, border:`1px solid ${T.bdr}`, borderRadius:10, padding:'10px 14px' }}>
            <div style={{ fontFamily:MONO, fontSize:8, color:T.txt3, marginBottom:4 }}>機器聽到的</div>
            <div style={{ fontFamily:MONO, fontSize:12, color:T.txt2, lineHeight:1.7 }}>{transcript}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" onClick={retry}
              style={{ flex:1, background:T.redD, border:`1px solid ${T.red}50`, color:T.red, fontSize:11 }}>🎙 再說一次</button>
            <button className="btn" onClick={() => speak(card.en, 0.7)}
              style={{ flex:1, background:T.surf2, border:`1px solid ${T.bdr2}`, color:T.txt2, fontSize:11 }}>🔊 聽範例</button>
            <button className="btn" onClick={onNext}
              style={{ flex:1, background:T.grnD, border:`1px solid ${T.grn}60`, color:T.grn, fontSize:11, fontWeight:700 }}>下一句</button>
          </div>
        </div>
      )}
    </div>
  )
}

function SpeechCardManager({ pool, cat }) {
  const [queue, setQueue] = useState(() => [...pool].sort(() => Math.random() - 0.5))
  const [idx, setIdx] = useState(0)
  useEffect(() => { setQueue([...pool].sort(() => Math.random() - 0.5)); setIdx(0) }, [cat])
  const card = queue[idx] ?? queue[0]
  if (!card) return (
    <div style={{ textAlign:'center', color:T.txt3, fontFamily:SERIF, fontSize:14, padding:40 }}>此分類尚無句子</div>
  )
  return <SpeechCard card={card} cardNum={idx+1} total={queue.length} onNext={() => setIdx(i => (i+1) % queue.length)}/>
}

// ═══════════════════════════════════════════════════════════════
// PHRASE SRS 輕量化
// ═══════════════════════════════════════════════════════════════
const PHRASE_SRS_KEY = 'fsi:ph:srs'
const SRS_ITV = [1, 3, 7, 14, 30]  // 間隔天數（level 0~4）

function phraseSrsRate(record = {}, rating) {
  const now = Date.now()
  let { state = 'new', level = 0, reps = 0 } = record
  if (rating === 'again') {
    level = Math.max(0, level - 1); state = 'review'
  } else if (rating === 'okay') {
    level = Math.min(SRS_ITV.length - 1, level + 1)
    state = (level >= SRS_ITV.length - 1 && reps >= 2) ? 'done' : 'review'
  } else if (rating === 'got') {
    level = Math.min(SRS_ITV.length - 1, level + 2)
    state = level >= SRS_ITV.length - 1 ? 'done' : 'review'
  }
  reps += 1
  const dueDate = state === 'done' ? null : now + (SRS_ITV[level] ?? 30) * 86400000
  return { state, level, reps, dueDate, lastSeen: now }
}

function phraseBuildQueue(pool, srsMap, maxNew = 20) {
  const now = Date.now()
  const overdue = [], newCards = [], future = []
  pool.forEach(p => {
    const r = srsMap[p.id]
    if (!r || r.state === 'new') newCards.push(p)
    else if (r.state === 'done') { /* 畢業，略過 */ }
    else if (r.dueDate <= now) overdue.push(p)
    else future.push(p)
  })
  overdue.sort((a, b) => (srsMap[a.id]?.dueDate ?? 0) - (srsMap[b.id]?.dueDate ?? 0))
  return [...overdue, ...newCards.slice(0, maxNew), ...future]
}

function phraseCalcStats(pool, srsMap) {
  const now = Date.now()
  let newC = 0, overdueC = 0, reviewC = 0, doneC = 0
  pool.forEach(p => {
    const r = srsMap[p.id]
    if (!r || r.state === 'new') newC++
    else if (r.state === 'done') doneC++
    else if (r.dueDate <= now) overdueC++
    else reviewC++
  })
  return { newC, overdueC, reviewC, doneC }
}

function nextItvLabel(level, delta) {
  const l = Math.min(SRS_ITV.length - 1, Math.max(0, (level ?? 0) + delta))
  return l >= SRS_ITV.length - 1 ? '畢業✨' : SRS_ITV[l] + '天'
}

// ═══════════════════════════════════════════════════════════════
// 反向模式（中 → 英）
// ═══════════════════════════════════════════════════════════════
const PHRASE_RSRS_KEY = 'fsi:ph:rsrs'  // 獨立 key，不混正向 SRS

function ReverseCard({ card, cardNum, total, onNext, srsMap, onRate }) {
  const [phase, setPhase]           = useState('prompt')
  const [hintPlayed, setHintPlayed] = useState(false)

  useEffect(() => { setPhase('prompt'); setHintPlayed(false) }, [card?.en])

  function handleReveal() { setPhase('reveal'); setTimeout(() => speak(card.en, 0.75), 300) }
  function handleRate(rating) { onRate(card.id, rating); onNext() }

  const cardSrs = srsMap[card?.id] ?? {}
  const lv = cardSrs.level ?? 0

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, textAlign:'right' }}>{cardNum} / {total}</div>

      {/* ── PROMPT ── */}
      {phase === 'prompt' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ background:T.surf, border:`1px solid ${T.blue}40`, borderRadius:16,
            padding:'30px 22px', textAlign:'center', display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ fontFamily:MONO, fontSize:9, color:T.blue, letterSpacing:'0.14em', marginBottom:4 }}>🔄 中 → 英</div>
            <div style={{ fontFamily:SERIF, fontSize:20, color:T.txt, lineHeight:1.8, fontStyle:'italic' }}>{card.zh}</div>
            {cardSrs.state && cardSrs.state !== 'new' && (
              <div style={{ fontFamily:MONO, fontSize:8, color:T.txt3, marginTop:4 }}>
                {cardSrs.state === 'done' ? '✨ 已畢業' : `lv${lv} · 已練${cardSrs.reps}次`}
              </div>
            )}
          </div>
          <div style={{ textAlign:'center' }}>
            <div onClick={() => { speak(card.en, 0.5); setHintPlayed(true) }}
              style={{ display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer', fontFamily:MONO, fontSize:9,
                padding:'5px 14px', borderRadius:8,
                background: hintPlayed ? T.amberD : T.surf2,
                border:`1px solid ${hintPlayed ? T.amber+'50' : T.bdr}`,
                color: hintPlayed ? T.amber : T.txt3, transition:'all 0.15s' }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
              </svg>
              {hintPlayed ? '再播一次提示' : '💡 播放提示（0.5x）'}
            </div>
          </div>
          <button className="btn" onClick={handleReveal}
            style={{ background:T.amberD, border:`1px solid ${T.amber}60`, color:T.amber, fontSize:12, fontWeight:700, padding:'14px', letterSpacing:'0.08em' }}>
            顯示英文 →
          </button>
        </div>
      )}

      {/* ── REVEAL ── */}
      {phase === 'reveal' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }} className="fadeUp">
          <div style={{ background:T.surf, border:`1px solid ${T.amber}40`, borderRadius:14, padding:'18px 18px', display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:14, color:T.txt2, lineHeight:1.7 }}>{card.zh}</div>
            <div style={{ height:1, background:T.bdr }}/>
            <div style={{ fontFamily:MONO, fontSize:15, color:T.txt, lineHeight:1.8 }}>{card.en}</div>
          </div>
          <SpeakRow text={card.en} color={T.amber}/>
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            <div style={{ fontFamily:MONO, fontSize:8, color:T.txt3, textAlign:'center', letterSpacing:'0.06em' }}>
              你說出來了嗎？　下次複習間隔
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn" onClick={() => handleRate('again')}
                style={{ flex:1, background:T.redD, border:`1px solid ${T.red}50`, color:T.red, padding:'10px 0', fontSize:10, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                <span>✗ 說不出</span>
                <span style={{ fontSize:8, opacity:0.8 }}>{nextItvLabel(lv, -1)}</span>
              </button>
              <button className="btn" onClick={() => handleRate('okay')}
                style={{ flex:1, background:T.amberD, border:`1px solid ${T.amber}50`, color:T.amber, padding:'10px 0', fontSize:10, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                <span>◎ 說一半</span>
                <span style={{ fontSize:8, opacity:0.8 }}>{nextItvLabel(lv, 1)}</span>
              </button>
              <button className="btn" onClick={() => handleRate('got')}
                style={{ flex:1, background:T.grnD, border:`1px solid ${T.grn}50`, color:T.grn, padding:'10px 0', fontSize:10, fontWeight:700, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                <span>✓ 完整說</span>
                <span style={{ fontSize:8, opacity:0.8 }}>{nextItvLabel(lv, 2)}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ReverseCardManager({ pool, cat, rsrsMap, onRate }) {
  const zhPool = useMemo(() => pool.filter(p => p.zh && p.zh.trim()), [pool.map(p=>p.id).join(',')])
  const queue  = useMemo(() => phraseBuildQueue(zhPool, rsrsMap), [zhPool.map(p=>p.id).join(','), rsrsMap])
  const [idx, setIdx] = useState(0)
  useEffect(() => { setIdx(0) }, [cat])

  const card = queue[idx] ?? queue[0]
  const stats = useMemo(() => phraseCalcStats(zhPool, rsrsMap), [zhPool.map(p=>p.id).join(','), rsrsMap])

  if (!card) return (
    <div style={{ textAlign:'center', color:T.txt3, fontFamily:SERIF, fontSize:14, padding:40 }}>
      此分類尚無含中文翻譯的句子
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* 統計 mini-bar */}
      <div style={{ display:'flex', gap:5, alignItems:'center' }}>
        {stats.overdueC > 0 && <div style={{ fontFamily:MONO, fontSize:8, padding:'2px 7px', borderRadius:5, background:T.redD, color:T.red, border:`1px solid ${T.red}30` }}>⏰ {stats.overdueC}</div>}
        <div style={{ fontFamily:MONO, fontSize:8, padding:'2px 7px', borderRadius:5, background:T.blueD, color:T.blue, border:`1px solid ${T.blue}30` }}>🆕 {stats.newC}</div>
        {stats.reviewC > 0 && <div style={{ fontFamily:MONO, fontSize:8, padding:'2px 7px', borderRadius:5, background:T.amberD, color:T.amber, border:`1px solid ${T.amber}30` }}>📅 {stats.reviewC}</div>}
        {stats.doneC > 0 && <div style={{ fontFamily:MONO, fontSize:8, padding:'2px 7px', borderRadius:5, background:T.grnD, color:T.grn, border:`1px solid ${T.grn}30` }}>✓ {stats.doneC}</div>}
        <span style={{ fontFamily:MONO, fontSize:8, color:T.txt3, marginLeft:'auto' }}>{zhPool.length} 句（含譯）</span>
      </div>
      <ReverseCard card={card} cardNum={idx+1} total={queue.length}
        srsMap={rsrsMap} onRate={onRate}
        onNext={() => setIdx(i => (i+1) % Math.max(1, queue.length))}/>
    </div>
  )
}

const SCENARIOS = [
  { id:'mystyle', label:'我的風格', en:'Free conversation from my collection', icon:'⭐', cat:'my' },
  { id:'greet',   label:'打招呼',   en:'Greeting friends',      icon:'👋', cat:'life'  },
  { id:'cafe',    label:'咖啡廳',   en:'Coffee shop',            icon:'☕', cat:'life'  },
  { id:'shop',    label:'買衣服',   en:'Clothing store',         icon:'👗', cat:'life'  },
  { id:'dining',  label:'餐廳',     en:'Restaurant',             icon:'🍽️', cat:'life'  },
  { id:'airport', label:'機場',     en:'Airport',                icon:'✈️', cat:'life'  },
  { id:'hotel',   label:'飯店',     en:'Hotel check-in',         icon:'🏨', cat:'life'  },
  { id:'taxi',    label:'計程車',   en:'Taxi / transport',       icon:'🚕', cat:'life'  },
  { id:'doctor',  label:'診所',     en:'Clinic / pharmacy',      icon:'💊', cat:'life'  },
  { id:'super',   label:'超市',     en:'Supermarket',            icon:'🛒', cat:'life'  },
  { id:'cinema',  label:'電影院',   en:'Cinema',                 icon:'🎬', cat:'life'  },
  { id:'meeting', label:'晨會',     en:'Morning meeting',        icon:'📊', cat:'work'  },
  { id:'client',  label:'客戶來訪', en:'Client visit',           icon:'🤝', cat:'work'  },
  { id:'phone',   label:'電話英文', en:'Phone call',             icon:'📞', cat:'work'  },
  { id:'factory', label:'工廠現場', en:'Factory floor',          icon:'🏭', cat:'work'  },
]

// ── Linked / Rhythm 渲染器 ────────────────────────────────────
// ── 我的收藏子分類導覽面板 ─────────────────────────────────────
function MySubcatPanel({ counts, selected, onSelect, onReclassify, reclassifyLoading, reclassifyProgress, autoListen, onToggleAuto, shuffleMode, onToggleShuffle, sleepMins, sleepLeft, onSleepPick, pendingCount }) {
  const MONO = "'JetBrains Mono',monospace"
  const RECLASSIFY_LABELS = {
    restaurant:'🍽️ 餐廳咖啡', shopping:'🛍️ 購物', travel:'✈️ 交通旅遊',
    greeting:'👋 打招呼', opinion:'💬 表達意見', emotion:'😤 情緒狀態',
    request:'🤝 請求幫忙', apology:'🙏 道謝道歉', idiom:'🗣️ 慣用語',
    daily:'🌅 日常作息', relationship:'❤️ 友情關係', grammar:'📚 語法學習',
  }
  const PINNED_SUBCATS = ['shopping']  // 購物固定在全部旁邊
  const subcats = Object.keys(counts).filter(k => k !== 'all').sort()
  const subcatOrdered = [
    ...PINNED_SUBCATS.filter(k => counts[k] != null),
    ...subcats.filter(k => !PINNED_SUBCATS.includes(k))
  ]
  const getLabel = s => RECLASSIFY_LABELS[s] || s
  const chipStyle = (active) => ({
    padding:'5px 11px', borderRadius:10, cursor:'pointer', fontFamily:MONO, fontSize:10,
    background: active ? '#f5a623' : '#161b22',
    border:'1px solid '+(active ? '#f5a623' : '#30363d'),
    color: active ? '#050810' : '#ffffff',
    fontWeight: active ? 700 : 400,
  })
  return (
    <div style={{ width:'100%', background:'#0d1117', border:'1px solid #21262d',
      borderRadius:14, padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
      {/* 標題列：文字 + 自動播放長方形 + AI圖示 */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ fontFamily:MONO, fontSize:11, color:'#8b949e', letterSpacing:'0.06em', flex:1 }}>
          ⭐ 我的收藏 — 切換分類
        </div>
        {/* 隨機播放按鈕 */}
        {onToggleShuffle && (
          <div onClick={onToggleShuffle}
            title={shuffleMode ? '關閉隨機' : '開啟隨機播放'}
            style={{ padding:'4px 10px', borderRadius:8, cursor:'pointer', fontFamily:MONO, fontSize:12,
              background: shuffleMode ? '#3fb95020' : '#ffffff08',
              border:'1px solid '+(shuffleMode ? '#3fb95080' : '#ffffff20'),
              color: shuffleMode ? '#3fb950' : '#7a8390',
              fontWeight: shuffleMode ? 700 : 400, flexShrink:0, transition:'all 0.14s',
              userSelect:'none' }}>
            🔀
          </div>
        )}
        {/* 自動播放長方形按鈕 */}
        {onToggleAuto && (
          <div onClick={onToggleAuto}
            style={{ padding:'4px 14px', borderRadius:8, cursor:'pointer', fontFamily:MONO, fontSize:10,
              background: autoListen ? '#f5a623' : '#58a6ff20',
              border:'1px solid '+(autoListen ? '#f5a623' : '#58a6ff60'),
              color: autoListen ? '#050810' : '#58a6ff',
              fontWeight: autoListen ? 700 : 500, flexShrink:0 }}>
            {autoListen ? '⏸ 暫停' : '▶ 自動播'}
          </div>
        )}
        {/* AI 重分類圖示按鈕 */}
        {onReclassify && (
          <div onClick={reclassifyLoading ? undefined : onReclassify}
            title="AI 自動重新分類"
            style={{ padding:'4px 10px', borderRadius:8, cursor: reclassifyLoading ? 'default' : 'pointer',
              fontFamily:MONO, fontSize:10,
              background: reclassifyLoading ? '#21262d' : '#a371f715',
              border:'1px solid '+(reclassifyLoading ? '#30363d' : '#a371f750'),
              color: reclassifyLoading ? '#7a8390' : '#a371f7', flexShrink:0 }}>
            {reclassifyLoading
              ? (reclassifyProgress ? reclassifyProgress.current+'/'+reclassifyProgress.total : '⏳')
              : (pendingCount > 0 ? '🤖 '+pendingCount : '🤖')}
          </div>
        )}
      </div>
      {/* 睡眠計時器列（只在自動播放開啟時顯示）*/}
      {autoListen && onSleepPick && (
        <div style={{ display:'flex', alignItems:'center', gap:6, paddingTop:2 }}>
          <span style={{ fontFamily:MONO, fontSize:9, color:'#7a8390', flexShrink:0 }}>🌙</span>
          {[10,15,20,25,30].map(m => {
            const active = sleepMins === m
            const fmt = sleepLeft != null && active
              ? Math.floor(sleepLeft/60)+':'+(sleepLeft%60).toString().padStart(2,'0')
              : m+'min'
            return (
              <div key={m} onClick={() => onSleepPick(m)}
                style={{ padding:'3px 9px', borderRadius:8, cursor:'pointer', fontFamily:MONO, fontSize:9,
                  background: active ? '#58a6ff22' : '#ffffff08',
                  border:'1px solid '+(active ? '#58a6ffaa' : '#ffffff15'),
                  color: active ? '#58a6ff' : '#7a8390',
                  fontWeight: active ? 700 : 400, transition:'all 0.2s', flexShrink:0 }}>
                {fmt}
              </div>
            )
          })}
          {sleepMins && (
            <div onClick={() => onSleepPick(null)}
              style={{ padding:'3px 8px', borderRadius:8, cursor:'pointer', fontFamily:MONO, fontSize:9,
                color:'#f85149', border:'1px solid #f8514930', background:'#f8514910' }}>
              ✕
            </div>
          )}
        </div>
      )}
      {/* 分類 chips */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
        <div onClick={() => onSelect('all')} style={chipStyle(selected==='all')}>
          全部 <span style={{ opacity:0.6 }}>({counts.all})</span>
        </div>
        {subcatOrdered.map(s => (
          <div key={s} onClick={() => onSelect(s)} style={chipStyle(selected===s)}>
            {getLabel(s)} <span style={{ opacity:0.6 }}>({counts[s]})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── SpeakRow：通用大喇叭按鈕組（PhraseTab 外部定義）──────────────
function SpeakRow({ text, color }) {
  function speakEn(t, rate) {
    const u = new SpeechSynthesisUtterance(t)
    u.lang = 'en-US'; u.rate = rate
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
      <div onClick={() => speakEn(text, 0.6)}
        style={{ padding:'6px 16px', borderRadius:8, background:color+'18', border:`1px solid ${color}60`,
          display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
        <span style={{ fontSize:16 }}>🐢</span>
        <span style={{ fontFamily:MONO, fontSize:11, color, fontWeight:600 }}>0.6x</span>
      </div>
      <div onClick={() => speakEn(text, 1)}
        style={{ padding:'6px 16px', borderRadius:8, background:color+'15', border:`1px solid ${color}50`,
          display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
        <span style={{ fontSize:16 }}>🔊</span>
        <span style={{ fontFamily:MONO, fontSize:11, color }}>1.0x</span>
      </div>
    </div>
  )
}

function PhraseTab({ settings }) {
  const MONO  = "'JetBrains Mono',monospace"
  const SERIF = "'Crimson Pro',Georgia,serif"

  // ── 主模式切換 ────────────────────────────────────────────────
  const [pMode, setPMode] = useState('sentence') // 'sentence'|'qa'|'scenario'
  const [reverseFilter, setReverseFilter] = useState('all') // 'all'|'island'

  // ── 句型練習 ──────────────────────────────────────────────────
  const [cat,        setCat]        = useState('my')
  const [idx,        setIdx]        = useState(0)
  const [phase,      setPhase]      = useState('listen')
  const [autoPlayed, setAutoPlayed] = useState(false)
  const [autoListen, setAutoListen] = useState(false)  // 連續自動播放模式
  const [shuffleMode, setShuffleMode] = useState(true) // 隨機播放模式（預設開啟）
  const [sleepMins,  setSleepMins]  = useState(null)   // 選取的睡眠分鐘數
  const [sleepEnd,   setSleepEnd]   = useState(null)   // 計時結束 timestamp
  const [sleepLeft,  setSleepLeft]  = useState(null)   // 剩餘秒數（顯示用）
  const [sessionPlayedIds, setSessionPlayedIds] = useState(new Set()) // 本輪已播
  const autoListenRef = useRef(false)
  const shuffleModeRef = useRef(false)
  const [doneIds,    setDoneIds]    = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('fsi:ph:done') ?? '[]')) } catch { return new Set() }
  })
  const [extraPhrases, setExtraPhrases] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fsi:ph:extra') ?? '[]') } catch { return [] }
  })
  // ── 手動新增收藏 ──────────────────────────────────────────────
  const [showAdd,   setShowAdd]   = useState(false)
  const [addText,   setAddText]   = useState('')
  const [addCat,    setAddCat]    = useState('life')
  const [addLoading, setAddLoading] = useState(false)
  const [addDone,   setAddDone]   = useState(null)  // {en, zh, cat, _count}
  const [addProgress, setAddProgress] = useState(null) // {current, total}
  const [showMyList, setShowMyList] = useState(false) // 我的收藏清單模式
  const [showSubcatFilter, setShowSubcatFilter] = useState(true) // 我的收藏子分類篩選展開
  const [deleteConfirm, setDeleteConfirm] = useState(null) // phrase id 待確認刪除
  const [editingPhrase, setEditingPhrase] = useState(null)  // { id, en, zh }
  const [mySubcat, setMySubcat] = useState('all') // 我的收藏子分類篩選
  const [myTag, setMyTag] = useState('all')   // 臨時 tag 篩選
  const [showTagInput, setShowTagInput] = useState(null) // phrase id | null
  const [tagDraft, setTagDraft] = useState('')
  // ── 臨時分類 ─────────────────────────────────────────────────
  const [tempCats, setTempCats] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fsi:ph:tempCats') ?? '[]') } catch { return [] }
  })
  const [activeTempCatId, setActiveTempCatId] = useState(null)
  const [newTempTopic, setNewTempTopic] = useState('')
  const [showTempCatInput, setShowTempCatInput] = useState(false)
  const [creatingTempCat, setCreatingTempCat] = useState(false)

  // 所有 tag 統計（動態）
  const myTagCounts = useMemo(() => {
    const counts = { all: extraPhrases.length }
    extraPhrases.forEach(p => {
      ;(p.tags ?? []).forEach(t => { counts[t] = (counts[t] ?? 0) + 1 })
    })
    return counts
  }, [extraPhrases])

  function addTagToPhrase(id, tag) {
    const t = tag.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 20)
    if (!t) return
    const updated = extraPhrases.map(p =>
      p.id === id ? { ...p, tags: [...new Set([...(p.tags ?? []), t])] } : p
    )
    setExtraPhrases(updated)
    localStorage.setItem('fsi:ph:extra', JSON.stringify(updated))
  }

  function removeTagFromPhrase(id, tag) {
    const updated = extraPhrases.map(p =>
      p.id === id ? { ...p, tags: (p.tags ?? []).filter(t => t !== tag) } : p
    )
    setExtraPhrases(updated)
    localStorage.setItem('fsi:ph:extra', JSON.stringify(updated))
  }
  const [reclassifyLoading, setReclassifyLoading] = useState(false)
  const [reclassifyProgress, setReclassifyProgress] = useState(null)
  const [srsMap, setSrsMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PHRASE_SRS_KEY) ?? '{}') } catch { return {} }
  })
  const [rsrsMap, setRsrsMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PHRASE_RSRS_KEY) ?? '{}') } catch { return {} }
  })

  // ── Q&A 練習 ─────────────────────────────────────────────────
  const [qaIdx,       setQaIdx]       = useState(0)
  const [qaPhase,     setQaPhase]     = useState('question')
  const [qaAutoPlayed,setQaAutoPlayed]= useState(false)
  const [qaDoneIds,   setQaDoneIds]   = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('fsi:qa:done') ?? '[]')) } catch { return new Set() }
  })

  // ── 情境對話 ──────────────────────────────────────────────────
  const [sceneFilter,  setSceneFilter]  = useState('all')   // 'all'|'life'|'work'
  const [chosenScene,  setChosenScene]  = useState(null)
  const [conv,         setConv]         = useState([])      // [{who,text,hints?}]
  const [convStep,     setConvStep]     = useState(0)
  const [convLoading,  setConvLoading]  = useState(false)
  const [convErr,      setConvErr]      = useState('')
  const [revealHints,  setRevealHints]  = useState(false)
  const [sessionDone,  setSessionDone]  = useState(false)

  // ── 句型資料 ──────────────────────────────────────────────────
  const allPhrases = [...PHRASE_DATA, ...extraPhrases]
  const basePool   = cat === 'all' ? allPhrases : allPhrases.filter(p => p.cat === cat)
  const pool       = (() => {
    // 臨時分類優先
    if (activeTempCatId && cat === 'my') {
      const tc = tempCats.find(t => t.id === activeTempCatId)
      if (tc) {
        const matched = extraPhrases.filter(p => tc.phraseIds.includes(p.id))
        return matched.length > 0 ? matched : extraPhrases
      }
    }
    let p = (cat === 'my' && mySubcat !== 'all')
      ? basePool.filter(p => (p.subcat ?? '') === mySubcat)
      : basePool
    // Tag 篩選
    if (cat === 'my' && myTag !== 'all') {
      p = p.filter(p => (p.tags ?? []).includes(myTag))
    }
    // fallback：my 分類空時自動用全部
    return (cat === 'my' && p.length === 0) ? allPhrases : p
  })()
  const _srsQueue = useMemo(
    () => pool,
    [pool.map(p=>p.id).join(',')]
  )
  const queue = _srsQueue.length > 0 ? _srsQueue : pool
  const card       = queue[idx] ?? queue[0]
  const srsStats   = useMemo(() => phraseCalcStats(pool, srsMap), [pool.map(p=>p.id).join(','), srsMap])
  const doneCount  = srsStats.doneC

  // 我的收藏：計算各 subcat 筆數（動態）
  const mySubcatCounts = useMemo(() => {
    const counts = { all: extraPhrases.length }
    extraPhrases.forEach(p => {
      const k = p.subcat ?? '未分類'
      counts[k] = (counts[k] ?? 0) + 1
    })
    return counts
  }, [extraPhrases])

  // ── Q&A 資料 ─────────────────────────────────────────────────
  const qa          = QA_DATA[qaIdx]
  const qaDoneCount = QA_DATA.filter(q => qaDoneIds.has(q.id)).length

  // ── 句型：自動播放（只有 autoListen 開啟時才自動播音）────────
  useEffect(() => { setPhase('listen'); setAutoPlayed(false) }, [idx, cat])

  // ── Effect 1：語音鏈 EN×2 → ZH（autoPlayed 不在 deps，避免 cleanup 中斷）
  // cancelled flag：防止 Chrome cancel() 觸發 onend 後繼續播下一張的聲音（畫面/聲音不同步根因）
  useEffect(() => {
    if (!autoListen || pMode !== 'sentence' || phase !== 'listen' || autoPlayed || !card) return
    window.speechSynthesis?.cancel()
    let cancelled = false

    const timer = setTimeout(() => {
      if (!autoListenRef.current || cancelled) return

      function afterAll() {
        if (autoListenRef.current && !cancelled) setAutoPlayed(true)
      }

      const u1 = new SpeechSynthesisUtterance(card.en)
      u1.lang = 'en-US'; u1.rate = 0.6
      u1.onend = u1.onerror = () => {
        if (!autoListenRef.current || cancelled) return
        const u2 = new SpeechSynthesisUtterance(card.en)
        u2.lang = 'en-US'; u2.rate = 0.6
        u2.onend = u2.onerror = () => {
          if (!autoListenRef.current || cancelled) return
          const zhText = card.zh?.trim()
          if (zhText) {
            const u3 = new SpeechSynthesisUtterance(zhText)
            u3.lang = /[一-鿿]/.test(zhText) ? 'zh-TW' : 'en-US'
            u3.rate = 0.9
            u3.onend = u3.onerror = () => afterAll()
            window.speechSynthesis?.speak(u3)
          } else {
            afterAll()
          }
        }
        window.speechSynthesis?.speak(u2)
      }
      window.speechSynthesis?.speak(u1)
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
      window.speechSynthesis?.cancel()
    }
  }, [autoListen, pMode, phase, card?.id, autoPlayed])

  // ── Effect 2：語音鏈結束後跳下一句
  useEffect(() => {
    if (!autoPlayed || phase !== 'listen') return
    const t = setTimeout(() => {
      if (!autoListenRef.current) return
      if (shuffleModeRef.current && queue.length > 1) {
        setIdx(i => { let n; do { n = Math.floor(Math.random() * queue.length) } while (n === i); return n })
      } else {
        setIdx(i => (i + 1) % queue.length)
      }
    }, 600)
    return () => clearTimeout(t)
  }, [autoPlayed])

  useEffect(() => { autoListenRef.current = autoListen }, [autoListen])
  useEffect(() => { shuffleModeRef.current = shuffleMode }, [shuffleMode])

  // 自動播放進度追蹤：記錄已播 card
  useEffect(() => {
    if (!autoListen || !card?.id) return
    setSessionPlayedIds(prev => {
      if (prev.has(card.id)) return prev
      return new Set([...prev, card.id])
    })
  }, [card?.id, autoListen])

  // 換分類/subcat/tempCat 時重置進度
  useEffect(() => {
    setSessionPlayedIds(new Set())
  }, [cat, mySubcat, activeTempCatId, myTag])

  // ── 睡眠計時器 ────────────────────────────────────────────────
  useEffect(() => {
    if (!sleepEnd) { setSleepLeft(null); return }
    const tick = () => {
      const left = Math.max(0, Math.round((sleepEnd - Date.now()) / 1000))
      setSleepLeft(left)
      if (left <= 0) {
        setAutoListen(false); autoListenRef.current = false
        setSleepEnd(null); setSleepMins(null)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [sleepEnd])

  // ── Q&A：自動播放（只有 autoListen 開啟時才自動播音）────────
  useEffect(() => { setQaPhase('question'); setQaAutoPlayed(false) }, [qaIdx])
  useEffect(() => {
    if (autoListen && pMode === 'qa' && qaPhase === 'question' && !qaAutoPlayed && qa) {
      const t = setTimeout(() => { speakEn(qa.q, 0.6); setQaAutoPlayed(true) }, 400)
      return () => clearTimeout(t)
    }
  }, [autoListen, qaPhase, qaAutoPlayed, qa, pMode])

  function speakEn(text, rate = 0.6) {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'; u.rate = rate
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }


  async function savePhrase(rawText, catId) {
    const apiKey = settings?.apiKey || (() => {
      try { return JSON.parse(localStorage.getItem('fsi:se') || '{}')?.apiKey ?? '' } catch { return '' }
    })()
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    if (lines.length === 0) return
    setAddLoading(true)
    setAddProgress({ current: 0, total: lines.length })
    const existing = (() => { try { return JSON.parse(localStorage.getItem('fsi:ph:extra') ?? '[]') } catch { return [] } })()
    // 建立已存在句子的正規化 set（含本次 existing + 本批次已新增的）
    const existingNorm = new Set(existing.map(p => normalizeEn(p.en)))
    let updated = [...existing]
    let lastPhrase = null
    let skipped = 0
    const sys = 'Translate the English phrase/sentence to Traditional Chinese. Reply with ONLY the translation, nothing else.'
    for (let i = 0; i < lines.length; i++) {
      setAddProgress({ current: i + 1, total: lines.length })
      const en = lines[i]
      const norm = normalizeEn(en)
      if (existingNorm.has(norm)) { skipped++; continue }
      existingNorm.add(norm) // 防止同批次重複
      let zh = ''
      try {
        if (apiKey) { zh = (await callClaude(apiKey, [{ role:'user', content: en }], sys)).trim() }
      } catch(e) { zh = '' }
      const newPhrase = { id: 'ph_my_' + Date.now() + '_' + i, cat: 'my', subcat: catId, en, zh }
      updated = [...updated, newPhrase]
      lastPhrase = newPhrase
    }
    localStorage.setItem('fsi:ph:extra', JSON.stringify(updated))
    setExtraPhrases(updated)
    const added = lines.length - skipped
    setAddDone(lastPhrase
      ? { ...lastPhrase, _count: added, _skipped: skipped }
      : { en: '', zh: '', _count: 0, _skipped: skipped }
    )
    setAddProgress(null)
    setAddLoading(false)
  }

  function deletePhrase(id) {
    const updated = extraPhrases.filter(p => p.id !== id)
    localStorage.setItem('fsi:ph:extra', JSON.stringify(updated))
    setExtraPhrases(updated)
    setDeleteConfirm(null)
  }

  // ── AI 一鍵重新分類 ───────────────────────────────────────────
  const RECLASSIFY_CATS = {
    restaurant: '🍽️ 餐廳咖啡',
    shopping:   '🛍️ 購物',
    travel:     '✈️ 交通旅遊',
    greeting:   '👋 打招呼',
    opinion:    '💬 表達意見',
    emotion:    '😤 情緒狀態',
    request:    '🤝 請求幫忙',
    apology:    '🙏 道謝道歉',
    idiom:      '🗣️ 慣用語',
    daily:      '🌅 日常作息',
    relationship:'❤️ 友情關係',
    grammar:    '📚 語法學習',
  }

  async function aiReclassify() {
    const apiKey = settings?.apiKey || (() => { try { return JSON.parse(localStorage.getItem('fsi:se')||'{}')?.apiKey??'' } catch { return '' } })()
    if (!apiKey) { alert('請先設定 API Key'); return }
    const targets = extraPhrases.filter(p => p.subcat === 'life')
    if (!targets.length) { alert('沒有待分類的句子（分類=life）'); return }
    setReclassifyLoading(true)
    setReclassifyProgress({ current: 0, total: targets.length })
    const BATCH = 30
    const catKeys = Object.keys(RECLASSIFY_CATS).join(', ')
    const sys = 'You are classifying English sentences into categories. Reply ONLY with a JSON array of category keys, one per sentence, in the same order. Categories: ' + catKeys + '. Choose the single best fit.'
    let updated = [...extraPhrases]
    // 建立 id → index map 方便回寫
    const idxMap = {}
    updated.forEach((p, i) => { idxMap[p.id] = i })
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH)
      const prompt = 'Classify each sentence (return JSON array of category keys only):\n' + batch.map((p,j) => (j+1)+'. '+p.en).join('\n')
      try {
        const raw = await callClaude(apiKey, [{ role:'user', content: prompt }], sys)
        const clean = raw.replace(/```json|```/g,'').trim()
        const cats = JSON.parse(clean)
        cats.forEach((c, j) => {
          if (batch[j] && RECLASSIFY_CATS[c]) {
            updated[idxMap[batch[j].id]] = { ...updated[idxMap[batch[j].id]], subcat: c }
          }
        })
        setReclassifyProgress({ current: Math.min(i+BATCH, targets.length), total: targets.length })
        setExtraPhrases([...updated])
      } catch(e) { /* skip batch on error */ }
    }
    localStorage.setItem('fsi:ph:extra', JSON.stringify(updated))
    setExtraPhrases(updated)
    setReclassifyLoading(false)
    setReclassifyProgress(null)
    alert('✓ 分類完成！共處理 ' + targets.length + ' 句')
  }

  // ── 句型 helpers ──────────────────────────────────────────────
  function markDone() {
    const n = new Set(doneIds); n.add(card.id)
    setDoneIds(n); localStorage.setItem('fsi:ph:done', JSON.stringify([...n]))
    setIdx(i => (i + 1) % Math.max(1, queue.length))
  }

  function srsRatePhrase(rating) {
    if (!card) return
    const rec = srsMap[card.id] ?? {}
    const newRec = phraseSrsRate(rec, rating)
    const newMap = { ...srsMap, [card.id]: newRec }
    setSrsMap(newMap)
    try { localStorage.setItem(PHRASE_SRS_KEY, JSON.stringify(newMap)) } catch {}
    setPhase('listen'); setAutoPlayed(false)
    setIdx(i => (i + 1) % Math.max(1, queue.length))
  }

  function reverseRatePhrase(phraseId, rating) {
    const rec = rsrsMap[phraseId] ?? {}
    const newRec = phraseSrsRate(rec, rating)
    const newMap = { ...rsrsMap, [phraseId]: newRec }
    setRsrsMap(newMap)
    try { localStorage.setItem(PHRASE_RSRS_KEY, JSON.stringify(newMap)) } catch {}
  }

  // ── Q&A helpers ───────────────────────────────────────────────
  function qaMarkDone() {
    const n = new Set(qaDoneIds); n.add(qa.id)
    setQaDoneIds(n); localStorage.setItem('fsi:qa:done', JSON.stringify([...n]))
    setQaIdx(i => (i + 1) % QA_DATA.length)
  }

  // ── 情境對話：呼叫 AI ─────────────────────────────────────────
  async function startScenario(sc) {
    const apiKey = settings?.apiKey || (() => {
      try { return JSON.parse(localStorage.getItem('fsi:se') || '{}')?.apiKey ?? '' } catch { return '' }
    })()
    if (!apiKey) { setConvErr('請先在 Setup 設定 API Key'); return }
    setChosenScene(sc)
    setConv([])
    setConvStep(0)
    setRevealHints(false)
    setSessionDone(false)
    setConvErr('')
    setConvLoading(true)

    // 智慧過濾：依場景類別選相關收藏句
    let filteredPhrases = allPhrases
    if (sc.id === 'mystyle') {
      // 我的風格：只用用戶手動收藏的句子
      filteredPhrases = allPhrases.filter(p => p.cat === 'my')
      if (filteredPhrases.length === 0) filteredPhrases = allPhrases // fallback
    } else if (sc.cat === 'work') {
      filteredPhrases = allPhrases.filter(p => p.cat !== 'life')
    } else if (sc.cat === 'life') {
      filteredPhrases = allPhrases.filter(p => p.cat === 'life' || p.cat === 'my')
    }

    const myPhrases = filteredPhrases.map(p => p.en).join(' / ')
    let sys, prompt
    if (sc.id === 'mystyle') {
      sys = 'You are an English conversation partner helping a Taiwanese manufacturing professional practice spoken English. Based on the learner\'s collected phrases, design the most natural scenario that fits them best, then generate a conversation. For each learner turn, suggest 2-3 of their exact phrases as hints. Return ONLY valid JSON, no markdown.'
      prompt = 'Learner\'s collected phrases:\n' + myPhrases + '\n\nDesign the most natural and useful scenario for these phrases. Generate a realistic 5-6 exchange conversation. The "other" person speaks first. For each "user" turn, include hints array with 2-3 phrases from the collection that fit naturally.\n\nReturn JSON:\n{"scenario":"(brief scenario description)","exchanges":[{"who":"other","text":"..."},{"who":"user","hints":["phrase1","phrase2"]},{"who":"other","text":"..."},{"who":"user","hints":["phrase1","phrase2"]}]}'
    } else {
      sys = 'You are an English conversation partner helping a Taiwanese manufacturing professional practice spoken English. Generate a short realistic conversation for the given scenario. The learner\'s collected phrases are provided — for each learner turn, suggest 2-3 of their phrases that naturally fit. Return ONLY valid JSON, no markdown.'
      prompt = 'Scenario: ' + sc.en + ' (' + sc.label + ')\n\nLearner phrases collection:\n' + myPhrases + '\n\nGenerate a realistic 5-6 exchange conversation. The "other" person speaks first. For each "user" turn, include hints array with 2-3 phrases from the collection that fit naturally.\n\nReturn JSON:\n{"exchanges":[{"who":"other","text":"..."},{"who":"user","hints":["phrase1","phrase2"]},{"who":"other","text":"..."},{"who":"user","hints":["phrase1","phrase2"]}]}'
    }

    try {
      const raw = await callClaude(apiKey, [{ role:'user', content: prompt }], sys)
      const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim())
      const exchanges = parsed.exchanges ?? []
      if (exchanges.length === 0) throw new Error('empty exchanges')
      setConv(exchanges)
      setConvStep(0)
    } catch(e) {
      setConvErr('AI 產生失敗，請重試')
      setChosenScene(null)  // 重置回場景選擇，避免黑畫面
    } finally { setConvLoading(false) }
  }

  function convNext() {
    setRevealHints(false)
    if (convStep < conv.length - 1) { setConvStep(s => s + 1) }
    else { setSessionDone(true) }
  }

  // ── 共用：大喇叭按鈕組（定義在 PhraseTab 外部，避免 hoisting 問題）───

  // ── 臨時分類 functions ────────────────────────────────────────
  async function createTempCat(topic) {
    const apiKey = settings?.apiKey || (() => {
      try { return JSON.parse(localStorage.getItem('fsi:se') || '{}')?.apiKey ?? '' } catch { return '' }
    })()
    if (!apiKey) { flash('請先設定 API Key'); return }
    if (!topic.trim()) return
    if (!extraPhrases.length) { flash('我的收藏目前沒有句子'); return }
    setCreatingTempCat(true)
    try {
      // Step 1: AI 生成語意關鍵字（只送主題詞，payload 極小）
      const system = 'You are a language learning assistant. Given a topic keyword (possibly in Chinese or English), generate 12-15 English keywords and short phrases that commonly appear in English sentences related to this topic. Include both single words and short phrases (2-3 words). Return ONLY a JSON array of lowercase strings. No markdown, no explanation.'
      const raw = await callAI([{ role: 'user', content: `Topic: "${topic.trim()}"` }], system)
      const keywords = JSON.parse(raw.replace(/```json|```/g, '').trim())
      if (!Array.isArray(keywords) || keywords.length === 0) {
        flash('AI 無法生成關鍵字，請重試'); return
      }

      // Step 2: 本地關鍵字掃描（不需呼叫 API）
      const kwLower = keywords.map(k => k.toLowerCase().trim()).filter(k => k.length > 1)
      const matched = extraPhrases.filter(p => {
        const text = (p.en + ' ' + (p.zh ?? '')).toLowerCase()
        return kwLower.some(kw => text.includes(kw))
      })

      if (matched.length === 0) {
        flash('找不到相關句子，請換個關鍵字'); return
      }

      const phraseIds = matched.map(p => p.id)
      const newTc = { id: 'tc_' + Date.now(), name: topic.trim(), phraseIds, createdAt: Date.now() }
      const updated = [...tempCats, newTc]
      setTempCats(updated)
      localStorage.setItem('fsi:ph:tempCats', JSON.stringify(updated))
      setNewTempTopic('')
      setShowTempCatInput(false)
      flash(`✓ 臨時分類「${topic.trim()}」建立（${phraseIds.length} 句）`)
    } catch(e) {
      flash('AI 分類失敗，請重試')
    } finally {
      setCreatingTempCat(false)
    }
  }

  function dissolveTempCat(id) {
    const tc = tempCats.find(t => t.id === id)
    const updated = tempCats.filter(t => t.id !== id)
    setTempCats(updated)
    localStorage.setItem('fsi:ph:tempCats', JSON.stringify(updated))
    if (activeTempCatId === id) setActiveTempCatId(null)
    if (tc) flash(`🗑 「${tc.name}」已解散`)
  }

  const CAT_COLORS = { opening:'#58a6ff', capacity:'#f5a623', quality:'#3fb950', cost:'#f85149', action:'#a371f7', life:'#f78166' }
  const cc = CAT_COLORS[card?.cat] ?? '#f5a623'

  // ════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding:'10px 16px 0', display:'flex', flexDirection:'column', gap:8 }} className="fadeUp">

      {/* OPEN YOUR MOUTH banner */}
      <div style={{ textAlign:'center', padding:'4px 0 2px' }}>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:16, color:'#f5a623', letterSpacing:'0.18em', fontWeight:700 }}>
          OPEN YOUR MOUTH.
        </div>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:'#7a8390', letterSpacing:'0.12em', marginTop:2 }}>
          每天開口，英文才會真正屬於你
        </div>
      </div>

      {/* 主模式切換 */}
      <div style={{ display:'flex', background:'#161b22', borderRadius:10, padding:2, gap:2, flexShrink:0 }}>
        {[{id:'sentence',label:'📋 句型'},{id:'reverse',label:'🔄 反向'},{id:'qa',label:'💬 問答'},{id:'dictation',label:'🎧 聽寫'},{id:'speech',label:'🎙 口說'},{id:'scenario',label:'🎭 情境'}].map(m => (
          <div key={m.id} onClick={() => { setPMode(m.id); if (m.id !== 'reverse') setReverseFilter('all') }}
            style={{ flex:1, textAlign:'center', padding:'6px 0', borderRadius:8, cursor:'pointer',
              fontFamily:MONO, fontSize:10, letterSpacing:'0.05em', fontWeight: pMode===m.id ? 700 : 400,
              background: pMode===m.id ? '#f5a623' : 'transparent',
              color:      pMode===m.id ? '#050810' : '#c9d1d9',
              transition:'all 0.15s' }}>
            {m.label}
          </div>
        ))}
      </div>

      {/* ── 我的中文句捷徑按鈕（有自創句時顯示）────────────────── */}
      {(() => {
        const islandCount = extraPhrases.filter(p => p.zh?.trim()).length
        if (islandCount === 0) return null
        const active = pMode === 'reverse' && reverseFilter === 'island'
        return (
          <div onClick={() => { setPMode('reverse'); setReverseFilter('island') }}
            style={{ display:'flex', alignItems:'center', gap:8,
              padding:'10px 14px', borderRadius:12, cursor:'pointer',
              background: active ? T.blue+'22' : T.surf2,
              border:`1.5px solid ${active ? T.blue : T.bdr2}`,
              transition:'all 0.14s' }}>
            <span style={{ fontSize:15 }}>🗣</span>
            <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
              <span style={{ fontFamily:MONO, fontSize:11, fontWeight:700,
                color: active ? T.blue : T.txt, letterSpacing:'0.04em' }}>
                練習我的中文 → 英文例句
              </span>
              <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
                {islandCount} 句 · 點我開始反向練習
              </span>
            </div>
            <span style={{ fontFamily:MONO, fontSize:10, color: active ? T.blue : T.txt3,
              marginLeft:'auto' }}>{active ? '▶ 練習中' : '→'}</span>
          </div>
        )
      })()}

      {/* ══════════════════ 句型練習 ══════════════════ */}
      {pMode === 'sentence' && (
        <>
          {/* 分類篩選 + 新增按鈕 */}
          <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap' }}>
            {PHRASE_CATS.map(c => (
              <div key={c.id} onClick={() => { setCat(c.id); setIdx(0); setMySubcat('all') }}
                style={{ padding:'3px 8px', borderRadius:12, fontFamily:MONO, fontSize:9, cursor:'pointer',
                  background: cat===c.id ? '#f5a623' : '#161b22',
                  border: '1px solid '+(cat===c.id ? '#f5a623' : '#21262d'),
                  color: cat===c.id ? '#050810' : '#c9d1d9', fontWeight: cat===c.id ? 700 : 400, transition:'all 0.14s' }}>
                {c.label}
              </div>
            ))}
            {cat === 'my' && (
              <div onClick={() => { setShowMyList(v => !v); setDeleteConfirm(null) }}
                title="查看全部收藏"
                style={{ width:30, height:30, borderRadius:'50%',
                  background: showMyList ? '#58a6ff' : '#58a6ff20', border:'1px solid #58a6ff40',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  cursor:'pointer', fontSize:14, color: showMyList ? '#050810' : '#58a6ff',
                  fontWeight:700, flexShrink:0, transition:'all 0.15s' }}>
                📋
              </div>
            )}
            <div onClick={() => { setShowAdd(v => !v); setAddDone(null); setAddText('') }}
              style={{ width:30, height:30, borderRadius:'50%',
                background: showAdd ? '#f5a623' : '#f5a62320', border:'1px solid #f5a62360',
                display:'flex', alignItems:'center', justifyContent:'center',
                cursor:'pointer', fontSize:18, color: showAdd ? '#050810' : '#f5a623',
                fontWeight:700, flexShrink:0, transition:'all 0.15s' }}>
              {showAdd ? '×' : '+'}
            </div>
            {/* 🐢 0.6x / 🔊 1.0x — 最右側 */}
            <div onClick={() => { if (!card?.en) return; window.speechSynthesis?.cancel(); const u=new SpeechSynthesisUtterance(card.en); u.lang='en-US'; u.rate=0.6; window.speechSynthesis?.speak(u) }}
              style={{ marginLeft:'auto', padding:'4px 10px', borderRadius:8, cursor:'pointer', fontFamily:MONO, fontSize:9,
                background:T.amberD, border:`1px solid ${T.amber}50`, color:T.amber,
                display:'flex', alignItems:'center', gap:4, flexShrink:0, transition:'all 0.14s' }}>
              🐢 <span>0.6x</span>
            </div>
            <div onClick={() => { if (!card?.en) return; window.speechSynthesis?.cancel(); const u=new SpeechSynthesisUtterance(card.en); u.lang='en-US'; u.rate=1; window.speechSynthesis?.speak(u) }}
              style={{ padding:'4px 10px', borderRadius:8, cursor:'pointer', fontFamily:MONO, fontSize:9,
                background:T.amberD, border:`1px solid ${T.amber}50`, color:T.amber,
                display:'flex', alignItems:'center', gap:4, flexShrink:0, transition:'all 0.14s' }}>
              🔊 <span>1.0x</span>
            </div>
          </div>

          {/* 新增收藏 Modal */}
          {showAdd && (
            <div style={{ background:'#0d1117', border:'1px solid #f5a62340', borderRadius:14, padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }} className="fadeUp">
              {!addDone ? (
                <>
                  <div style={{ fontFamily:MONO, fontSize:9, color:'#f5a623', letterSpacing:'0.1em' }}>＋ 新增到我的收藏</div>
                  <textarea value={addText} onChange={e => setAddText(e.target.value)}
                    placeholder={"輸入英文句子\nI'm snowed under.\nTake your time."}
                    style={{ minHeight:72, resize:'none', background:'#161b22', border:'1px solid #2d333b',
                      borderRadius:8, padding:'10px 12px', fontFamily:MONO, fontSize:13, color:'#e6edf3',
                      outline:'none', lineHeight:1.6 }}/>
                  <div>
                    <div style={{ fontFamily:MONO, fontSize:8.5, color:'#7a8390', marginBottom:6 }}>分類</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                      {[
                        {id:'life',     l:'🏠 生活'},
                        {id:'opening',  l:'📢 開場'},
                        {id:'quality',  l:'✅ 品質'},
                        {id:'cost',     l:'💰 成本'},
                        {id:'action',   l:'🎯 行動'},
                        {id:'capacity', l:'🏭 產能'},
                      ].map(o => (
                        <div key={o.id} onClick={() => setAddCat(o.id)}
                          style={{ padding:'4px 10px', borderRadius:10, fontFamily:MONO, fontSize:9, cursor:'pointer',
                            background: addCat===o.id ? '#f5a62325' : '#161b22',
                            border:'1px solid '+(addCat===o.id ? '#f5a62360' : '#21262d'),
                            color: addCat===o.id ? '#f5a623' : '#7a8390' }}>
                          {o.l}
                        </div>
                      ))}
                    </div>
                  </div>
                  <button className="btn" onClick={() => addText.trim() && savePhrase(addText, addCat)}
                    disabled={addLoading || !addText.trim()}
                    style={{ background: addLoading ? '#21262d' : '#f5a623', color: addLoading ? '#7a8390' : '#050810',
                      padding:'12px', fontSize:12, fontWeight:700, letterSpacing:'0.08em',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    {addLoading
                      ? <><span style={{ display:'inline-block', width:10, height:10, border:'2px solid transparent', borderTopColor:'#7a8390', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                          {addProgress ? 'AI 翻譯中… ' + addProgress.current + ' / ' + addProgress.total : 'AI 翻譯中…'}
                        </>
                      : '✨ AI 新增（自動翻譯）'
                    }
                  </button>
                </>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }} className="fadeUp">
                  <div style={{ fontFamily:MONO, fontSize:9, color:'#3fb950', letterSpacing:'0.08em' }}>
                    {addDone._count > 0
                      ? `✓ 已加入收藏 ${addDone._count > 1 ? addDone._count + ' 句' : ''}`
                      : '⚠ 全部為重複句子，未新增'}
                  </div>
                  {addDone._skipped > 0 && (
                    <div style={{ fontFamily:MONO, fontSize:9, color:'#f5a623', background:'#f5a62310', border:'1px solid #f5a62330', borderRadius:8, padding:'6px 10px' }}>
                      🔁 跳過 {addDone._skipped} 筆重複
                    </div>
                  )}
                  {addDone._count > 0 && (
                    <div style={{ background:'#161b22', borderRadius:10, padding:'12px' }}>
                      <div style={{ fontFamily:MONO, fontSize:13, color:'#7a8390', marginBottom:4 }}>
                        {addDone._count > 1 ? '最後一句：' : ''}
                      </div>
                      <div style={{ fontFamily:MONO, fontSize:14, color:'#e6edf3', marginBottom:6 }}>{addDone.en}</div>
                      {addDone.zh && <div style={{ fontFamily:"'Crimson Pro',Georgia,serif", fontSize:13, color:'#aab3be', fontStyle:'italic' }}>{addDone.zh}</div>}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8 }}>
                    <button className="btn" onClick={() => { setAddText(''); setAddDone(null) }}
                      style={{ flex:1, background:'#161b22', border:'1px solid #21262d', color:'#aab3be', padding:'10px 0', fontSize:11 }}>
                      再加一句
                    </button>
                    <button className="btn" onClick={() => { setShowAdd(false); setAddDone(null); setCat('all') }}
                      style={{ flex:1, background:'#3fb95018', border:'1px solid #3fb95050', color:'#3fb950', padding:'10px 0', fontSize:11, fontWeight:700 }}>
                      完成 ✓
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 我的收藏清單（showMyList 模式）──────────────────────── */}
          {showMyList && cat === 'my' ? (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }} className="fadeUp">
              {/* ── 頂部操作列：切換分類 ｜ 全部（N）｜ 🤖 ｜ ▶ ── */}
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div onClick={() => setShowSubcatFilter(v=>!v)}
                  style={{ padding:'5px 10px', borderRadius:8, cursor:'pointer', fontFamily:MONO, fontSize:9,
                    background: showSubcatFilter ? '#f5a62320' : '#161b22',
                    border:'1px solid '+(showSubcatFilter ? '#f5a62360' : '#30363d'),
                    color: showSubcatFilter ? '#f5a623' : '#8b949e', flexShrink:0, transition:'all 0.14s' }}>
                  切換分類
                </div>
                <div style={{ flex:1, fontFamily:MONO, fontSize:10, color:'#8b949e', textAlign:'center' }}>
                  全部（{extraPhrases.length}）
                </div>
                <div onClick={reclassifyLoading ? undefined : aiReclassify}
                  title="AI 自動重新分類"
                  style={{ width:32, height:32, borderRadius:8, cursor: reclassifyLoading ? 'default' : 'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:15,
                    background: reclassifyLoading ? '#21262d' : '#a371f715',
                    border:'1px solid '+(reclassifyLoading ? '#30363d' : '#a371f750'), flexShrink:0 }}>
                  {reclassifyLoading ? (reclassifyProgress ? reclassifyProgress.current+'/'+reclassifyProgress.total : '⏳') : '🤖'}
                </div>
                <div onClick={() => { const n=!autoListen; setAutoListen(n); autoListenRef.current=n; if(n){setShowMyList(false);setAutoPlayed(false)} }}
                  title={autoListen ? '停止自動播放' : '自動播放我的收藏'}
                  style={{ width:32, height:32, borderRadius:8, cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:14,
                    background: autoListen ? '#58a6ff' : '#58a6ff15',
                    border:'1px solid '+(autoListen ? '#58a6ff' : '#58a6ff50'),
                    color: autoListen ? '#050810' : '#58a6ff', flexShrink:0, transition:'all 0.14s' }}>
                  {autoListen ? '⏸' : '▶'}
                </div>
                {extraPhrases.some(p => !p.zh) && (
                  <div onClick={async () => {
                    const apiKey = settings?.apiKey || (() => { try { return JSON.parse(localStorage.getItem('fsi:se')||'{}')?.apiKey??'' } catch { return '' } })()
                    if (!apiKey) return
                    const sys = 'Translate the English phrase/sentence to Traditional Chinese. Reply with ONLY the translation, nothing else.'
                    let updated = [...extraPhrases]
                    for (let i = 0; i < updated.length; i++) {
                      if (!updated[i].zh) {
                        try {
                          const zh = (await callClaude(apiKey, [{ role:'user', content: updated[i].en }], sys)).trim()
                          updated[i] = { ...updated[i], zh }
                          setExtraPhrases([...updated])
                        } catch(e) {}
                      }
                    }
                    localStorage.setItem('fsi:ph:extra', JSON.stringify(updated))
                    setExtraPhrases(updated)
                  }}
                    title="翻譯所有未翻句子"
                    style={{ width:32, height:32, borderRadius:8, cursor:'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:14,
                      background:'#58a6ff18', border:'1px solid #58a6ff50', flexShrink:0 }}>
                    🌐
                  </div>
                )}
              </div>
              {extraPhrases.length === 0 && (
                <div style={{ fontFamily:MONO, fontSize:11, color:'#7a8390', textAlign:'center', padding:'24px 0' }}>
                  尚無收藏句子，點 ＋ 新增
                </div>
              )}
              {/* 子分類篩選列（清單模式 - 收合式）*/}
              {showSubcatFilter && extraPhrases.length > 0 && (() => {
                const subcatList = ['all', ...Object.keys(mySubcatCounts).filter(k => k !== 'all').sort()]
                return (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                    {subcatList.map(s => (
                      <div key={s} onClick={() => setMySubcat(s)}
                        style={{ padding:'4px 10px', borderRadius:9, cursor:'pointer', fontFamily:MONO, fontSize:9,
                          background: mySubcat===s ? '#f5a623' : '#161b22',
                          border:'1px solid '+(mySubcat===s ? '#f5a623' : '#30363d'),
                          color: mySubcat===s ? '#050810' : '#7a8390',
                          fontWeight: mySubcat===s ? 700 : 400 }}>
                        {s === 'all' ? '全部' : s} ({mySubcatCounts[s] ?? 0})
                      </div>
                    ))}
                  </div>
                )
              })()}
              {(mySubcat === 'all' ? extraPhrases : extraPhrases.filter(p => (p.subcat ?? '未分類') === mySubcat)).map(p => (
                <div key={p.id} style={{ background:'#0d1117', border:'1px solid '+(deleteConfirm===p.id ? '#f85149aa' : editingPhrase?.id===p.id ? '#58a6ffaa' : '#21262d'),
                  borderRadius:10, padding:'12px 14px', display:'flex', flexDirection:'column', gap:6,
                  transition:'border-color 0.15s' }}>

                  {/* ── 編輯模式 ── */}
                  {editingPhrase?.id === p.id ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      <div style={{ fontFamily:MONO, fontSize:9, color:'#58a6ff', letterSpacing:'0.08em', marginBottom:2 }}>✏ 編輯句子</div>
                      <div>
                        <div style={{ fontFamily:MONO, fontSize:9, color:'#7a8390', marginBottom:3 }}>英文</div>
                        <textarea rows={2} value={editingPhrase.en}
                          onChange={e => setEditingPhrase(prev => ({ ...prev, en: e.target.value }))}
                          style={{ width:'100%', fontFamily:MONO, fontSize:12, background:'#161b22', border:'1px solid #58a6ff60',
                            borderRadius:7, color:'#e6edf3', padding:'8px 10px', resize:'none', outline:'none', lineHeight:1.5 }}/>
                      </div>
                      <div>
                        <div style={{ fontFamily:MONO, fontSize:9, color:'#7a8390', marginBottom:3 }}>中文</div>
                        <textarea rows={2} value={editingPhrase.zh ?? ''}
                          onChange={e => setEditingPhrase(prev => ({ ...prev, zh: e.target.value }))}
                          style={{ width:'100%', fontFamily:"'Crimson Pro',Georgia,serif", fontSize:13, background:'#161b22', border:'1px solid #58a6ff60',
                            borderRadius:7, color:'#aab3be', padding:'8px 10px', resize:'none', outline:'none', lineHeight:1.5 }}/>
                      </div>
                      <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                        <button className="btn" onClick={() => setEditingPhrase(null)}
                          style={{ fontSize:10, padding:'5px 12px', background:'#21262d', border:'1px solid #30363d', color:'#aab3be' }}>
                          取消
                        </button>
                        <button className="btn" onClick={() => {
                          const updated = extraPhrases.map(x => x.id===p.id ? { ...x, en: editingPhrase.en.trim(), zh: editingPhrase.zh?.trim() ?? x.zh } : x)
                          localStorage.setItem('fsi:ph:extra', JSON.stringify(updated))
                          setExtraPhrases(updated)
                          setEditingPhrase(null)
                        }} style={{ fontSize:10, padding:'5px 12px', background:'#58a6ff25', border:'1px solid #58a6ff', color:'#58a6ff', fontWeight:700 }}>
                          ✓ 儲存
                        </button>
                      </div>
                    </div>
                  ) : (
                  <>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:MONO, fontSize:13, color:'#e6edf3', lineHeight:1.5 }}>{p.en}</div>
                      {p.zh
                        ? <div style={{ fontFamily:"'Crimson Pro',Georgia,serif", fontSize:13, color:'#aab3be', fontStyle:'italic', marginTop:4 }}>{p.zh}</div>
                        : <button className="btn" onClick={async () => {
                            const apiKey = settings?.apiKey || (() => { try { return JSON.parse(localStorage.getItem('fsi:se')||'{}')?.apiKey??'' } catch { return '' } })()
                            if (!apiKey) return
                            const sys = 'Translate the English phrase/sentence to Traditional Chinese. Reply with ONLY the translation, nothing else.'
                            try {
                              const zh = (await callClaude(apiKey, [{ role:'user', content: p.en }], sys)).trim()
                              const updated = extraPhrases.map(x => x.id===p.id ? {...x, zh} : x)
                              localStorage.setItem('fsi:ph:extra', JSON.stringify(updated))
                              setExtraPhrases(updated)
                            } catch(e) {}
                          }}
                            style={{ fontFamily:MONO, fontSize:9, padding:'3px 8px', marginTop:4, background:'#f5a62315',
                              border:'1px solid #f5a62340', color:'#f5a623', borderRadius:6, alignSelf:'flex-start' }}>
                            🌐 翻譯
                          </button>
                      }
                    </div>
                    {deleteConfirm === p.id ? (
                      <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                        <button className="btn" onClick={() => setDeleteConfirm(null)}
                          style={{ fontSize:10, padding:'4px 8px', background:'#21262d', border:'1px solid #30363d', color:'#aab3be' }}>
                          取消
                        </button>
                        <button className="btn" onClick={() => deletePhrase(p.id)}
                          style={{ fontSize:10, padding:'4px 8px', background:'#f8514920', border:'1px solid #f85149', color:'#f85149', fontWeight:700 }}>
                          確認刪除
                        </button>
                      </div>
                    ) : (
                      <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                        <button className="btn" onClick={() => { setEditingPhrase({ id: p.id, en: p.en, zh: p.zh ?? '' }); setDeleteConfirm(null) }}
                          style={{ fontSize:12, padding:'4px 10px', background:'transparent', border:'1px solid #30363d',
                            color:'#7a8390', lineHeight:1 }}
                          title="編輯">
                          ✏
                        </button>
                        <button className="btn" onClick={() => setDeleteConfirm(p.id)}
                          style={{ fontSize:12, padding:'4px 10px', background:'transparent', border:'1px solid #30363d',
                            color:'#7a8390', lineHeight:1 }}>
                          🗑
                        </button>
                      </div>
                    )}
                  </div>
                  {p.subcat && (
                    <div style={{ fontFamily:MONO, fontSize:8, color:'#f5a623', background:'#f5a62315',
                      border:'1px solid #f5a62330', borderRadius:5, padding:'2px 7px', alignSelf:'flex-start' }}>
                      {p.subcat}
                    </div>
                  )}
                  {/* Tags */}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, alignItems:'center' }}>
                    {(p.tags ?? []).map(tag => (
                      <span key={tag} style={{ fontFamily:MONO, fontSize:8, color:T.blue,
                        background:T.blue+'15', border:`1px solid ${T.blue}40`,
                        borderRadius:6, padding:'2px 7px', display:'inline-flex', alignItems:'center', gap:4 }}>
                        #{tag}
                        <span onClick={() => removeTagFromPhrase(p.id, tag)}
                          style={{ cursor:'pointer', color:T.txt3, fontSize:9, lineHeight:1 }}>✕</span>
                      </span>
                    ))}
                    {showTagInput === p.id ? (
                      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                        <input value={tagDraft} onChange={e => setTagDraft(e.target.value)}
                          onKeyDown={e => { if(e.key==='Enter'){ addTagToPhrase(p.id, tagDraft); setTagDraft(''); setShowTagInput(null) } if(e.key==='Escape') setShowTagInput(null) }}
                          placeholder="標籤名稱…" autoFocus
                          style={{ fontFamily:MONO, fontSize:9, padding:'2px 7px', borderRadius:6, width:90,
                            background:T.surf2, border:`1px solid ${T.blue}60`, color:T.txt }}/>
                        <span onClick={() => { addTagToPhrase(p.id, tagDraft); setTagDraft(''); setShowTagInput(null) }}
                          style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.grn }}>✓</span>
                        <span onClick={() => setShowTagInput(null)}
                          style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.red }}>✕</span>
                      </div>
                    ) : (
                      <span onClick={() => { setShowTagInput(p.id); setTagDraft('') }}
                        style={{ fontFamily:MONO, fontSize:8, color:T.txt3, cursor:'pointer',
                          border:`1px dashed ${T.bdr2}`, borderRadius:6, padding:'2px 7px' }}>
                        + 標籤
                      </span>
                    )}
                  </div>
                  </>
                  )}
                </div>
              ))}
            </div>
          ) : (
          <>
          {!card ? (
            <div style={{ textAlign:'center', padding:'40px 20px', display:'flex', flexDirection:'column', gap:12, alignItems:'center' }}>
              <div style={{ fontSize:32 }}>📭</div>
              <div style={{ fontFamily:MONO, fontSize:12, color:T.txt2 }}>此分類尚無句子</div>
              <div style={{ fontFamily:MONO, fontSize:10, color:T.txt3 }}>
                {cat === 'my' ? '點右上角「+」新增收藏句子' : '請選擇其他分類'}
              </div>
            </div>
          ) : (
            <>
              {/* ── 臨時分類 Active Banner ── */}
              {activeTempCatId && cat === 'my' && (() => {
                const tc = tempCats.find(t => t.id === activeTempCatId)
                if (!tc) return null
                const count = extraPhrases.filter(p => tc.phraseIds.includes(p.id)).length
                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:6,
                    padding:'10px 12px', background:'#a371f718', border:'1px solid #a371f750',
                    borderRadius:10 }}>
                    {/* 第一列：名稱 + 取消/解散 */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <span style={{ fontSize:14 }}>🏷</span>
                        <span style={{ fontFamily:MONO, fontSize:10, color:'#a371f7', fontWeight:700 }}>{tc.name}</span>
                        <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>({count} 句)</span>
                      </div>
                      <div style={{ display:'flex', gap:5 }}>
                        <div onClick={() => setActiveTempCatId(null)}
                          style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.txt3,
                            padding:'3px 8px', background:T.surf2, border:`1px solid ${T.bdr}`, borderRadius:6 }}>
                          取消
                        </div>
                        <div onClick={() => dissolveTempCat(tc.id)}
                          style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.red,
                            padding:'3px 8px', background:T.redD, border:`1px solid ${T.red}40`, borderRadius:6 }}>
                          解散
                        </div>
                      </div>
                    </div>
                    {/* 第二列：騎車快捷控制 */}
                    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                      <span style={{ fontFamily:MONO, fontSize:8, color:'#a371f7', opacity:0.8 }}>🚴 騎車</span>
                      <div onClick={() => { setShuffleMode(m => !m) }}
                        style={{ cursor:'pointer', fontFamily:MONO, fontSize:12, padding:'4px 10px',
                          borderRadius:8, border:`1px solid ${shuffleMode ? T.grn+'70' : T.bdr}`,
                          background: shuffleMode ? T.grnD : T.surf2,
                          color: shuffleMode ? T.grn : T.txt3, transition:'all 0.14s' }}>
                        🔀 {shuffleMode ? '隨機 ON' : '隨機 OFF'}
                      </div>
                      <div onClick={() => {
                          const n = !autoListen
                          setAutoListen(n); autoListenRef.current = n
                          if (n) setAutoPlayed(false)
                        }}
                        style={{ cursor:'pointer', fontFamily:MONO, fontSize:12, padding:'4px 14px',
                          borderRadius:8, fontWeight:700,
                          border:`1px solid ${autoListen ? T.amber+'80' : T.bdr}`,
                          background: autoListen ? T.amber : T.surf2,
                          color: autoListen ? T.bg : T.txt3, transition:'all 0.14s' }}>
                        {autoListen ? '⏸ 暫停' : '▶ 自動播'}
                      </div>
                    </div>
                  </div>
                )
              })()}
              {phase === 'listen' && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                  {/* 句子卡片 */}
                  <div style={{ width:'100%', background:'#0d1117', border:'1px solid '+cc+'40',
                    borderRadius:14, padding:'14px 18px', textAlign:'center' }}>
                    <div style={{ fontFamily:MONO, fontSize:16, color:'#ffffff', lineHeight:1.75, letterSpacing:'0.01em' }}>
                      {card.en}
                    </div>
                    {card.zh && (
                      <div style={{ fontFamily:SERIF, fontSize:13, color:'#c9d1d9', fontStyle:'italic', marginTop:10, lineHeight:1.6 }}>
                        {card.zh}
                      </div>
                    )}
                  </div>
                  {/* ⏸/▶ + 下一句 + 對答案 — 三顆等寬 */}
                  <div style={{ display:'flex', gap:6, width:'100%' }}>
                    <button className="btn" onClick={() => {
                        const n = !autoListen
                        setAutoListen(n); autoListenRef.current = n
                        if (n) { setAutoPlayed(false) } else { window.speechSynthesis?.cancel() }
                      }}
                      style={{ flex:1, padding:'12px 0', fontSize:14, background: autoListen ? T.amberD : T.surf2,
                        border:`1px solid ${autoListen ? T.amber+'60' : T.bdr}`,
                        color: autoListen ? T.amber : T.txt3 }}>
                      {autoListen ? '⏸' : '▶'}
                    </button>
                    <button className="btn" onClick={() => {
                        const nextIdx = (idx + 1) % queue.length
                        setIdx(nextIdx)
                        const next = queue[nextIdx]
                        if (next) { window.speechSynthesis?.cancel(); const u=new SpeechSynthesisUtterance(next.en); u.lang='en-US'; u.rate=0.82; window.speechSynthesis?.speak(u) }
                      }}
                      style={{ flex:1, padding:'12px 0', fontSize:12, background:'#161b22',
                        border:'1px solid #30363d', color:'#c9d1d9' }}>
                      ▷ 下一句
                    </button>
                    <button className="btn" onClick={() => setPhase('reveal')}
                      style={{ flex:1, padding:'12px 0', fontSize:12, background:'#f5a62318',
                        border:'1px solid #f5a62350', color:'#f5a623', letterSpacing:'0.05em' }}>
                      ✏️ 對答案
                    </button>
                  </div>
                  {/* 本輪播放進度條（autoListen 開啟時顯示）*/}
                  {autoListen && queue.length > 0 && (() => {
                    const played = [...sessionPlayedIds].filter(id => queue.some(p => p.id === id)).length
                    const total  = queue.length
                    const pct    = Math.min(100, Math.round(played / total * 100))
                    const done   = played >= total
                    return (
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
                            本輪進度
                          </span>
                          {done
                            ? <span style={{ fontFamily:MONO, fontSize:9, color:T.grn }}>🎉 完成一輪！</span>
                            : <span style={{ fontFamily:MONO, fontSize:9, color: pct >= 70 ? T.grn : T.amber }}>
                                {played} / {total} &nbsp;·&nbsp; {pct}%
                              </span>
                          }
                        </div>
                        <div style={{ height:8, background:T.bdr, borderRadius:4, overflow:'hidden' }}>
                          <div style={{
                            height:'100%', borderRadius:4, transition:'width 0.5s ease',
                            width:`${pct}%`,
                            background: done ? T.grn : pct >= 70 ? `linear-gradient(90deg,${T.amber},${T.grn})` : T.amber
                          }}/>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
              {phase === 'reveal' && (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }} className="fadeUp">
                  <div style={{ background:'#0d1117', border:'1px solid '+cc+'50', borderRadius:14, padding:'18px 16px', display:'flex', flexDirection:'column', gap:10 }}>
                    <div style={{ fontFamily:MONO, fontSize:16, color:'#ffffff', lineHeight:1.75 }}>{card.en}</div>
                    <div style={{ height:1, background:'#21262d' }}/>
                    <div style={{ fontFamily:SERIF, fontSize:14, color:'#c9d1d9', fontStyle:'italic' }}>{card.zh}</div>
                  </div>
                  {/* SRS 評分按鈕 */}
                  {(() => {
                    const cardSrs = srsMap[card?.id] ?? {}
                    const lv = cardSrs.level ?? 0
                    return (
                      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                        <div style={{ fontFamily:MONO, fontSize:8, color:T.txt3, textAlign:'center', letterSpacing:'0.06em' }}>
                          下次複習間隔
                        </div>
                        <div style={{ display:'flex', gap:6 }}>
                          <button className="btn" onClick={() => srsRatePhrase('again')}
                            style={{ flex:1, background:T.redD, border:`1px solid ${T.red}50`, color:T.red, padding:'10px 0', fontSize:11, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                            <span>✗ 再練</span>
                            <span style={{ fontSize:8, opacity:0.8 }}>{nextItvLabel(lv, -1)}</span>
                          </button>
                          <button className="btn" onClick={() => srsRatePhrase('okay')}
                            style={{ flex:1, background:T.amberD, border:`1px solid ${T.amber}50`, color:T.amber, padding:'10px 0', fontSize:11, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                            <span>◎ 還行</span>
                            <span style={{ fontSize:8, opacity:0.8 }}>{nextItvLabel(lv, 1)}</span>
                          </button>
                          <button className="btn" onClick={() => srsRatePhrase('got')}
                            style={{ flex:1, background:T.grnD, border:`1px solid ${T.grn}50`, color:T.grn, padding:'10px 0', fontSize:11, fontWeight:700, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                            <span>✓ 會了</span>
                            <span style={{ fontSize:8, opacity:0.8 }}>{nextItvLabel(lv, 2)}</span>
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                  {cat === 'my' && extraPhrases.length > 0 && (
                    <MySubcatPanel counts={mySubcatCounts} selected={mySubcat}
                      onSelect={s => { setMySubcat(s); setIdx(0); setPhase('listen'); setAutoPlayed(false) }}
                      onReclassify={aiReclassify} reclassifyLoading={reclassifyLoading} reclassifyProgress={reclassifyProgress}
                      autoListen={autoListen} onToggleAuto={() => { const n=!autoListen; setAutoListen(n); autoListenRef.current=n; if(n) setAutoPlayed(false); if(!n){setSleepEnd(null);setSleepMins(null)} }}
                      shuffleMode={shuffleMode} onToggleShuffle={() => setShuffleMode(m => !m)}
                      sleepMins={sleepMins} sleepLeft={sleepLeft}
                      pendingCount={extraPhrases.filter(p=>p.subcat==='life').length}
                      onSleepPick={m => {
                        if (!m || m === sleepMins) { setSleepMins(null); setSleepEnd(null) }
                        else { setSleepMins(m); setSleepEnd(Date.now() + m * 60000) }
                      }}/>
                  )}
                </div>
              )}
              {/* ── 我的收藏子分類（listen/reveal 通用，常駐顯示）── */}
              {cat === 'my' && extraPhrases.length > 0 && phase !== 'reveal' && (
                <MySubcatPanel counts={mySubcatCounts} selected={mySubcat}
                  onSelect={s => { setMySubcat(s); setMyTag('all'); setIdx(0); setAutoPlayed(false) }}
                  onReclassify={aiReclassify} reclassifyLoading={reclassifyLoading} reclassifyProgress={reclassifyProgress}
                  autoListen={autoListen} onToggleAuto={() => { const n=!autoListen; setAutoListen(n); autoListenRef.current=n; if(n) setAutoPlayed(false); if(!n){setSleepEnd(null);setSleepMins(null)} }}
                  shuffleMode={shuffleMode} onToggleShuffle={() => setShuffleMode(m => !m)}
                  sleepMins={sleepMins} sleepLeft={sleepLeft}
                  pendingCount={extraPhrases.filter(p=>p.subcat==='life').length}
                  onSleepPick={m => {
                    if (!m || m === sleepMins) { setSleepMins(null); setSleepEnd(null) }
                    else { setSleepMins(m); setSleepEnd(Date.now() + m * 60000) }
                  }}/>
              )}
              {/* ── 臨時 Tag 篩選列 ── */}
              {cat === 'my' && Object.keys(myTagCounts).length > 1 && (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  <div style={{ fontFamily:MONO, fontSize:8, color:T.txt3, letterSpacing:'0.08em' }}>🏷 臨時標籤篩選</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                    {Object.entries(myTagCounts).map(([tag, cnt]) => {
                      const active = myTag === tag
                      return (
                        <div key={tag} onClick={() => { setMyTag(tag); setIdx(0) }}
                          style={{ padding:'4px 10px', borderRadius:10, cursor:'pointer',
                            fontFamily:MONO, fontSize:9,
                            background: active ? T.blue+'25' : T.surf2,
                            border:`1px solid ${active ? T.blue+'80' : T.bdr}`,
                            color: active ? T.blue : T.txt3,
                            fontWeight: active ? 700 : 400, transition:'all 0.12s' }}>
                          {tag === 'all' ? `全部 (${cnt})` : `#${tag} (${cnt})`}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
          {/* ── 臨時分類管理 ── */}
          {cat === 'my' && (
            <div style={{ display:'flex', flexDirection:'column', gap:8, paddingTop:4 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontFamily:MONO, fontSize:8, color:T.txt3, letterSpacing:'0.1em' }}>🏷 臨時分類</span>
                <div onClick={() => { setShowTempCatInput(v => !v); setNewTempTopic('') }}
                  style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, padding:'3px 9px', borderRadius:7,
                    background: showTempCatInput ? '#a371f725' : T.surf2,
                    border:`1px solid ${showTempCatInput ? '#a371f760' : T.bdr}`,
                    color: showTempCatInput ? '#a371f7' : T.txt3, transition:'all 0.14s' }}>
                  {showTempCatInput ? '✕ 取消' : '+ 建立'}
                </div>
              </div>

              {/* 建立新臨時分類 */}
              {showTempCatInput && (
                <div style={{ display:'flex', flexDirection:'column', gap:7, background:T.surf2,
                  border:`1px solid #a371f740`, borderRadius:10, padding:'11px 12px' }} className="fadeUp">
                  <div style={{ fontFamily:MONO, fontSize:8, color:'#a371f7', letterSpacing:'0.08em' }}>
                    AI 從我的收藏中找出相關句子
                  </div>
                  <input value={newTempTopic} onChange={e => setNewTempTopic(e.target.value)}
                    onKeyDown={e => e.key==='Enter' && !creatingTempCat && newTempTopic.trim() && createTempCat(newTempTopic)}
                    placeholder="輸入主題，如：健康、道歉、旅遊…"
                    style={{ background:T.surf, border:`1px solid #a371f750`, borderRadius:7,
                      padding:'8px 11px', fontFamily:MONO, fontSize:12, color:T.txt, outline:'none' }}/>
                  <button className="btn" onClick={() => createTempCat(newTempTopic)}
                    disabled={creatingTempCat || !newTempTopic.trim()}
                    style={{ background: creatingTempCat ? T.surf : '#a371f720',
                      border:`1px solid ${creatingTempCat ? T.bdr : '#a371f760'}`,
                      color: creatingTempCat ? T.txt3 : '#a371f7',
                      fontSize:11, padding:'8px', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                    {creatingTempCat
                      ? <><span style={{ display:'inline-block', width:9, height:9, border:'1.5px solid transparent', borderTopColor:'#a371f7', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>{' '}AI 搜尋中…</>
                      : '🤖 AI 找句子'}
                  </button>
                </div>
              )}

              {/* 現有臨時分類清單 */}
              {tempCats.map(tc => {
                const count = extraPhrases.filter(p => tc.phraseIds.includes(p.id)).length
                const isActive = activeTempCatId === tc.id
                return (
                  <div key={tc.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'8px 12px', borderRadius:10,
                    background: isActive ? '#a371f720' : T.surf2,
                    border:`1px solid ${isActive ? '#a371f780' : T.bdr}`,
                    transition:'all 0.14s' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7, flex:1, minWidth:0 }}>
                      <span style={{ fontSize:13 }}>🏷</span>
                      <span style={{ fontFamily:MONO, fontSize:11, color: isActive ? '#a371f7' : T.txt,
                        fontWeight: isActive ? 700 : 400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {tc.name}
                      </span>
                      <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3, flexShrink:0 }}>({count} 句)</span>
                    </div>
                    <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                      {/* 🚴 一鍵騎車：啟動 + 隨機 + 自動播 */}
                      <div onClick={() => {
                          setActiveTempCatId(tc.id)
                          setMySubcat('all'); setMyTag('all'); setIdx(0); setAutoPlayed(false)
                          setShuffleMode(true)
                          setAutoListen(true); autoListenRef.current = true
                        }}
                        title="隨機自動播放（騎車模式）"
                        style={{ cursor:'pointer', fontFamily:MONO, fontSize:12, padding:'3px 10px', borderRadius:7,
                          background: T.grnD, border:`1px solid ${T.grn}50`, color:T.grn }}>
                        🚴
                      </div>
                      <div onClick={() => {
                          if (isActive) { setActiveTempCatId(null) }
                          else { setActiveTempCatId(tc.id); setMySubcat('all'); setMyTag('all'); setIdx(0); setAutoPlayed(false) }
                        }}
                        style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, padding:'3px 9px', borderRadius:7,
                          background: isActive ? '#a371f7' : '#a371f720',
                          border:`1px solid ${isActive ? '#a371f7' : '#a371f750'}`,
                          color: isActive ? '#050810' : '#a371f7', fontWeight: isActive ? 700 : 400,
                          transition:'all 0.14s' }}>
                        {isActive ? '✓ 練習中' : '練習'}
                      </div>
                      <div onClick={() => dissolveTempCat(tc.id)}
                        style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, padding:'3px 9px', borderRadius:7,
                          background:T.redD, border:`1px solid ${T.red}40`, color:T.red }}>
                        解散
                      </div>
                    </div>
                  </div>
                )
              })}

              {tempCats.length === 0 && !showTempCatInput && (
                <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, textAlign:'center', padding:'6px 0' }}>
                  尚無臨時分類，點「+ 建立」讓 AI 幫你找句子
                </div>
              )}
            </div>
          )}
          </> )} {/* end showMyList ternary */}
        </>
      )}

      {/* ══════════════════ 🔄 反向（中→英）══════════════════ */}
      {pMode === 'reverse' && (() => {
        const islandPhrases = extraPhrases.filter(p => p.zh?.trim())
        const seenIds = new Set(pool.map(p => p.id))
        const fullPool = [...pool, ...islandPhrases.filter(p => !seenIds.has(p.id))]
        const reversePool = reverseFilter === 'island'
          ? islandPhrases
          : fullPool
        return (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {/* 篩選 chip 列 */}
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              {[
                { id:'all',    label:'🌐 全部', count: fullPool.filter(p=>p.zh?.trim()).length },
                { id:'island', label:'🗣 我的自創', count: islandPhrases.length },
              ].map(f => {
                const active = reverseFilter === f.id
                return (
                  <div key={f.id} onClick={() => setReverseFilter(f.id)}
                    style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 12px',
                      borderRadius:16, cursor:'pointer', fontFamily:MONO, fontSize:10,
                      background: active ? T.amber : T.surf2,
                      border:`1px solid ${active ? T.amber : T.bdr}`,
                      color: active ? T.bg : T.txt2, transition:'all 0.13s', userSelect:'none' }}>
                    {f.label}
                    <span style={{ fontSize:9, opacity:0.75 }}>({f.count})</span>
                  </div>
                )
              })}
              {reverseFilter === 'island' && islandPhrases.length === 0 && (
                <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
                  → 先到 AI tab 用「🗣 中文→英文」存入句子
                </span>
              )}
            </div>
            <ReverseCardManager pool={reversePool} cat={cat} rsrsMap={rsrsMap} onRate={reverseRatePhrase}/>
          </div>
        )
      })()}

      {/* ══════════════════ 🎧 聽寫 ══════════════════ */}
      {pMode === 'dictation' && (() => {
        const dictPool = cat === 'all' ? allPhrases
          : cat === 'my' ? (mySubcat === 'all' ? allPhrases.filter(p=>p.cat==='my') : allPhrases.filter(p=>p.cat==='my'&&(p.subcat??'')===mySubcat))
          : allPhrases.filter(p=>p.cat===cat)
        return <DictationCardManager pool={dictPool} cat={cat}/>
      })()}

      {/* ══════════════════ 🎙 口說比對 ══════════════════ */}
      {pMode === 'speech' && (() => {
        const speechPool = cat === 'all' ? allPhrases
          : cat === 'my' ? (mySubcat === 'all' ? allPhrases.filter(p=>p.cat==='my') : allPhrases.filter(p=>p.cat==='my'&&(p.subcat??'')===mySubcat))
          : allPhrases.filter(p=>p.cat===cat)
        return <SpeechCardManager pool={speechPool} cat={cat}/>
      })()}

      {/* ══════════════════ Q&A 問答 ══════════════════ */}
      {pMode === 'qa' && qa && (
        <>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1, height:4, background:'#161b22', borderRadius:4, overflow:'hidden' }}>
              <div style={{ height:'100%', width:(qaDoneCount/QA_DATA.length*100)+'%', background:'#3fb950', borderRadius:4, transition:'width 0.4s' }}/>
            </div>
            <span style={{ fontFamily:MONO, fontSize:9, color:'#7a8390' }}>{qaDoneCount}/{QA_DATA.length}</span>
          </div>
          <div style={{ fontFamily:MONO, fontSize:8.5, color:'#7a8390', textAlign:'center' }}>{qaIdx+1} / {QA_DATA.length}</div>

          {qaPhase === 'question' && (
            <div style={{ display:'flex', flexDirection:'column', gap:18 }} className="fadeUp">
              <div style={{ background:'#0d1117', border:'1px solid #58a6ff50', borderRadius:14, padding:'20px 16px' }}>
                <div style={{ fontFamily:MONO, fontSize:9, color:'#58a6ff', letterSpacing:'0.1em', marginBottom:10 }}>Q</div>
                <div style={{ fontFamily:MONO, fontSize:17, color:'#e6edf3', lineHeight:1.6 }}>{qa.q}</div>
              </div>
              <SpeakRow text={qa.q} color="#58a6ff"/>
              <div style={{ fontFamily:SERIF, fontSize:13, color:'#aab3be', fontStyle:'italic', textAlign:'center' }}>先在紙上寫出答案，或在心裡說出來</div>
              <button className="btn" onClick={() => setQaPhase('answer')}
                style={{ background:'#f5a623', color:'#050810', width:'100%', padding:'15px', fontSize:13, fontWeight:700, letterSpacing:'0.1em' }}>
                💬 我說好了 → 看答案
              </button>
            </div>
          )}
          {qaPhase === 'answer' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }} className="fadeUp">
              <div style={{ fontFamily:MONO, fontSize:11, color:'#7a8390', background:'#161b22', borderRadius:8, padding:'8px 12px' }}>Q: {qa.q}</div>
              <div style={{ background:'#0d1117', border:'1px solid #f5a62350', borderRadius:14, padding:'16px' }}>
                <div style={{ fontFamily:MONO, fontSize:9, color:'#f5a623', letterSpacing:'0.1em', marginBottom:8 }}>A</div>
                <div style={{ fontFamily:MONO, fontSize:16, color:'#e6edf3', lineHeight:1.7, marginBottom:14 }}>{qa.a}</div>
                <div style={{ marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                    <span style={{ fontFamily:MONO, fontSize:8, color:'#f5a623', background:'#f5a62318', padding:'2px 8px', borderRadius:6, letterSpacing:'0.08em' }}>LINKED</span>
                    <span style={{ fontFamily:MONO, fontSize:8, color:'#7a8390' }}>連音方式</span>
                  </div>
                  <div style={{ background:'#f5a62318', border:'1px solid #f5a62330', borderRadius:8, padding:'8px 12px' }}>
                    <LinkedText text={qa.linked} type="linked"/>
                  </div>
                </div>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                    <span style={{ fontFamily:MONO, fontSize:8, color:'#3fb950', background:'#3fb95018', padding:'2px 8px', borderRadius:6, letterSpacing:'0.08em' }}>RHYTHM</span>
                    <span style={{ fontFamily:MONO, fontSize:8, color:'#7a8390' }}>大寫=重音</span>
                  </div>
                  <div style={{ background:'#3fb95018', border:'1px solid #3fb95030', borderRadius:8, padding:'8px 12px' }}>
                    <LinkedText text={qa.rhythm} type="rhythm"/>
                  </div>
                </div>
              </div>
              <SpeakRow text={qa.a} color="#f5a623"/>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn" onClick={() => { setQaPhase('question'); setQaAutoPlayed(false) }}
                  style={{ flex:1, background:'#f8514918', border:'1px solid #f8514955', color:'#f85149', padding:'13px 0', fontSize:13 }}>
                  ↺ 再來一次
                </button>
                <button className="btn" onClick={qaMarkDone}
                  style={{ flex:2, background:'#3fb95018', border:'1px solid #3fb95055', color:'#3fb950', padding:'13px 0', fontSize:13, fontWeight:700 }}>
                  ✓ 我會了 →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════ 情境對話 ══════════════════ */}
      {pMode === 'scenario' && (
        <>
          {/* 場景選擇 */}
          {!chosenScene && !convLoading && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }} className="fadeUp">
              {/* 工作/生活篩選 */}
              <div style={{ display:'flex', gap:6 }}>
                {[{id:'all',l:'全部'},{id:'life',l:'🏠 生活'},{id:'work',l:'💼 工作'},{id:'my',l:'⭐ 我的'}].map(f => (
                  <div key={f.id} onClick={() => setSceneFilter(f.id)}
                    style={{ padding:'5px 12px', borderRadius:10, fontFamily:MONO, fontSize:9, cursor:'pointer',
                      background: sceneFilter===f.id ? '#f5a623' : '#161b22',
                      border: '1px solid '+(sceneFilter===f.id ? '#f5a623' : '#21262d'),
                      color: sceneFilter===f.id ? '#050810' : '#7a8390', fontWeight: sceneFilter===f.id ? 700 : 400 }}>
                    {f.l}
                  </div>
                ))}
              </div>

              <div style={{ fontFamily:MONO, fontSize:9, color:'#7a8390', lineHeight:1.6,
                background:'#161b22', border:'1px solid #21262d', borderRadius:8, padding:'10px 12px' }}>
                AI 會用你的收藏句子模擬真實對話。選場景 → AI 扮演對方 → 你開口回應。
              </div>

              {/* 場景格 */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
                {SCENARIOS.filter(s => sceneFilter === 'all' || s.cat === sceneFilter).map(sc => {
                  // 我的風格：計算收藏句數；其他：依 cat 對應
                  const myCount = allPhrases.filter(p => p.cat === 'my').length
                  const relatedCount = sc.id === 'mystyle' ? myCount
                    : sc.cat === 'life' ? allPhrases.filter(p => p.cat === 'life' || p.cat === 'my').length
                    : allPhrases.filter(p => p.cat !== 'life').length
                  const isMystyle = sc.id === 'mystyle'
                  return (
                    <div key={sc.id} onClick={() => startScenario(sc)}
                      style={{ background: isMystyle ? '#f5a62310' : '#0d1117',
                        border:'1px solid '+(isMystyle ? '#f5a62355' : '#21262d'), borderRadius:10,
                        padding:'10px 8px', cursor:'pointer', display:'flex', flexDirection:'column', gap:4,
                        transition:'border-color 0.15s', alignItems:'flex-start' }}
                      onMouseOver={e => e.currentTarget.style.borderColor='#f5a62380'}
                      onMouseOut={e => e.currentTarget.style.borderColor=isMystyle ? '#f5a62355' : '#21262d'}>
                      <span style={{ fontSize:18 }}>{sc.icon}</span>
                      <div style={{ fontFamily:MONO, fontSize:11, color: isMystyle ? '#f5a623' : '#e6edf3', fontWeight: isMystyle ? 700 : 500 }}>{sc.label}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
                        {!isMystyle && (
                          <div style={{ fontFamily:MONO, fontSize:8, color: sc.cat==='work' ? '#f5a623' : '#58a6ff',
                            background: sc.cat==='work' ? '#f5a62315' : '#58a6ff15',
                            border:'1px solid '+(sc.cat==='work' ? '#f5a62340' : '#58a6ff40'),
                            padding:'1px 5px', borderRadius:5 }}>
                            {sc.cat==='work' ? '💼' : '🏠'}
                          </div>
                        )}
                        <span style={{ fontFamily:MONO, fontSize:8, color: isMystyle ? '#f5a623' : '#7a8390' }}>{relatedCount} 句</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              {convErr && (
                <div style={{ background:'#f8514918', border:'1px solid #f8514950', borderRadius:8, padding:'10px 12px', fontFamily:MONO, fontSize:11, color:'#f85149' }}>{convErr}</div>
              )}
            </div>
          )}

          {/* AI 產生中 */}
          {convLoading && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:'60px 0' }}>
              <span style={{ display:'inline-block', width:36, height:36, border:'3px solid transparent', borderTopColor:'#f5a623', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
              <div style={{ fontFamily:MONO, fontSize:10, color:'#f5a623', letterSpacing:'0.1em', textAlign:'center' }}>
                AI 正在產生<br/>{chosenScene?.label} 情境對話…
              </div>
              <div style={{ fontFamily:MONO, fontSize:9, color:'#7a8390', textAlign:'center', lineHeight:1.6 }}>
                從你的收藏中找合適的句子
              </div>
            </div>
          )}

          {/* 對話進行中 */}
          {!convLoading && chosenScene && conv.length > 0 && !sessionDone && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }} className="fadeUp">
              {/* 場景標題 */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:18 }}>{chosenScene.icon}</span>
                  <span style={{ fontFamily:MONO, fontSize:11, color:'#e6edf3', fontWeight:500 }}>{chosenScene.label}</span>
                </div>
                <div onClick={() => { setChosenScene(null); setConv([]) }}
                  style={{ fontFamily:MONO, fontSize:9, color:'#7a8390', cursor:'pointer', padding:'4px 8px',
                    background:'#161b22', borderRadius:6, border:'1px solid #21262d' }}>
                  換場景
                </div>
              </div>

              {/* 進度條 */}
              <div style={{ display:'flex', gap:3 }}>
                {conv.map((_,i) => (
                  <div key={i} style={{ flex:1, height:3, borderRadius:2,
                    background: i <= convStep ? '#f5a623' : '#21262d', transition:'background 0.3s' }}/>
                ))}
              </div>

              {/* 對話泡泡（已過的） */}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {conv.slice(0, convStep).map((msg, i) => {
                  const isUser = msg.who === 'user'
                  return (
                    <div key={i} style={{ display:'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth:'78%', borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                        padding:'10px 13px', fontSize:13, lineHeight:1.6,
                        background: isUser ? '#f5a62325' : '#161b22',
                        border: '1px solid '+(isUser ? '#f5a62350' : '#21262d'),
                        color: isUser ? '#f5c875' : '#e6edf3',
                        fontFamily:"'Crimson Pro',Georgia,serif"
                      }}>
                        <div style={{ fontFamily:MONO, fontSize:8, color: isUser ? '#f5a623' : '#7a8390', marginBottom:4 }}>
                          {isUser ? '你' : chosenScene.label}
                        </div>
                        {isUser
                          ? <span style={{ fontStyle:'italic', color:'#7a8390' }}>(你的回應)</span>
                          : msg.text
                        }
                      </div>
                    </div>
                  )
                })}

                {/* 目前這一步 */}
                {conv[convStep] && (() => {
                  const msg = conv[convStep]
                  const isUser = msg.who === 'user'
                  return (
                    <div style={{ display:'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth:'78%', borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                        padding:'10px 13px', fontSize:13, lineHeight:1.6,
                        background: isUser ? '#3fb95015' : '#0d1117',
                        border: '2px solid '+(isUser ? '#3fb95060' : '#f5a62360'),
                        color:'#e6edf3',
                        fontFamily:"'Crimson Pro',Georgia,serif"
                      }}>
                        <div style={{ fontFamily:MONO, fontSize:8, color: isUser ? '#3fb950' : '#f5a623', marginBottom:4 }}>
                          {isUser ? '💬 你的回合' : chosenScene.label}
                        </div>
                        {isUser ? (
                          <span style={{ fontStyle:'italic', color:'#7a8390' }}>思考一下，準備好再繼續…</span>
                        ) : (
                          <>
                            {msg.text}
                            <div style={{ marginTop:8 }}>
                              <div onClick={() => speakEn(msg.text, 0.85)}
                                style={{ display:'inline-flex', alignItems:'center', gap:4, cursor:'pointer',
                                  fontFamily:MONO, fontSize:8.5, color:'#f5a623', background:'#f5a62315',
                                  border:'1px solid #f5a62340', padding:'3px 8px', borderRadius:6 }}>
                                🔊 聽發音
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* 使用者回合：收藏提示 */}
              {conv[convStep]?.who === 'user' && (
                <div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontFamily:MONO, fontSize:8.5, color:'#f5a623', letterSpacing:'0.06em' }}>⭐ 你的收藏可以用</span>
                    <div onClick={() => setRevealHints(v => !v)}
                      style={{ fontFamily:MONO, fontSize:8.5, color:'#7a8390', cursor:'pointer',
                        background:'#161b22', border:'1px solid #21262d', padding:'3px 8px', borderRadius:6 }}>
                      {revealHints ? '收起' : '顯示提示'}
                    </div>
                  </div>
                  {revealHints && (
                    <div style={{ background:'#f5a62310', border:'1px solid #f5a62330', borderRadius:10, padding:'10px 12px' }} className="fadeUp">
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                        {(conv[convStep].hints ?? []).map((h, i) => (
                          <div key={i} onClick={() => speakEn(h, 0.9)}
                            style={{ fontFamily:MONO, fontSize:11, color:'#f5a623', background:'#f5a62318',
                              border:'1px solid #f5a62450', padding:'5px 11px', borderRadius:20, cursor:'pointer' }}>
                            {h}
                          </div>
                        ))}
                      </div>
                      <div style={{ fontFamily:MONO, fontSize:8.5, color:'#7a8390', marginTop:8 }}>
                        點句子可以聽發音 · 在紙上或心裡說出來再繼續
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 繼續按鈕 */}
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                {conv[convStep]?.who === 'other' ? (
                  <button className="btn" onClick={convNext}
                    style={{ flex:1, background:'#f5a623', color:'#050810', padding:'14px 0', fontSize:13, fontWeight:700, letterSpacing:'0.06em' }}>
                    聽完了 → 換我說
                  </button>
                ) : (
                  <>
                    <button className="btn" onClick={() => setRevealHints(true)}
                      style={{ flex:1, background:'#f5a62318', border:'1px solid #f5a62350', color:'#f5a623', padding:'13px 0', fontSize:12 }}>
                      ⭐ 看提示
                    </button>
                    <button className="btn" onClick={convNext}
                      style={{ flex:2, background:'#3fb95018', border:'1px solid #3fb95050', color:'#3fb950', padding:'13px 0', fontSize:13, fontWeight:700 }}>
                      我說好了 → 繼續
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 對話結束 */}
          {!convLoading && sessionDone && chosenScene && (
            <div style={{ display:'flex', flexDirection:'column', gap:14, alignItems:'center', padding:'20px 0' }} className="fadeUp">
              <div style={{ fontSize:36 }}>🎉</div>
              <div style={{ fontFamily:MONO, fontSize:13, color:'#e6edf3', fontWeight:600, letterSpacing:'0.06em' }}>
                {chosenScene.label} 對話完成！
              </div>
              <div style={{ fontFamily:MONO, fontSize:10, color:'#7a8390', textAlign:'center', lineHeight:1.8 }}>
                每次練習都在強化大腦的情境連結<br/>
                重複練習同一場景，說話會越來越自然
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, width:'100%' }}>
                <button className="btn" onClick={() => startScenario(chosenScene)}
                  style={{ background:'#f5a623', color:'#050810', padding:'14px 0', fontSize:13, fontWeight:700, letterSpacing:'0.06em', width:'100%' }}>
                  🔄 再練一次（新對話）
                </button>
                <button className="btn" onClick={() => { setChosenScene(null); setConv([]); setSessionDone(false) }}
                  style={{ background:'#161b22', border:'1px solid #21262d', color:'#aab3be', padding:'12px 0', fontSize:12, width:'100%' }}>
                  換一個場景
                </button>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  )
}

function EmailTab({ settings, updateSentences, updateVocab, updateStats, awardBadge }) {
  const [text, setText]           = useState('')
  const [busy, setBusy]           = useState(false)
  const [res,  setRes]            = useState(null)   // { phrases, fsi, vocab }
  const [err,  setErr]            = useState('')
  const [addedP, setAddedP]       = useState([])     // phrase en strings added
  const [addedS, setAddedS]       = useState([])     // fsi template strings added
  const [addedV, setAddedV]       = useState([])     // vocab word strings added
  const [phraseCats, setPhraseCats] = useState({})   // index -> PHRASE_CATS id
  const [fsiCats,    setFsiCats]    = useState({})   // index -> 'work'|'life'
  const [isDesktop, setIsDesktop] = useState(window.innerWidth > 640)
  // ── 🗣 中文→英文 句子島 state ──────────────────────────────
  const [siMode,        setSiMode]        = useState('analyze') // 'analyze' | 'island' | 'translate'
  const [zhInput,       setZhInput]       = useState('')
  const [islandCat,     setIslandCat]     = useState('life')   // 'life' | 'work'
  const [islandAudience,setIslandAudience]= useState('friend') // 說話對象
  const [islandResults, setIslandResults] = useState([])       // [{zh,en,added,dup}]
  const [islandBusy,    setIslandBusy]    = useState(false)
  const [islandErr,     setIslandErr]     = useState('')
  // ── 即時翻譯 ──
  const [transInput,     setTransInput]     = useState('')
  const [transResult,    setTransResult]    = useState('')
  const [transBusy,      setTransBusy]      = useState(false)
  const [transErr,       setTransErr]       = useState('')
  const [transLang,      setTransLang]      = useState('zh-TW') // 語音辨識語言
  const [transListening, setTransListening] = useState(false)
  const [transInterim,   setTransInterim]   = useState('')
  const transTimerRef = useRef(null)
  const transRecogRef = useRef(null)

  useEffect(() => {
    const h = () => setIsDesktop(window.innerWidth > 640)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  // ── 即時翻譯：防抖 800ms ──────────────────────────────────
  useEffect(() => {
    if (siMode !== 'translate') return
    const trimmed = transInput.trim()
    if (!trimmed) { setTransResult(''); setTransErr(''); return }
    clearTimeout(transTimerRef.current)
    transTimerRef.current = setTimeout(() => doTranslate(trimmed), 800)
    return () => clearTimeout(transTimerRef.current)
  }, [transInput, siMode])

  async function doTranslate(input) {
    const hasChinese = /[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef]/.test(input)
    setTransBusy(true); setTransErr('')
    try {
      const prompt = hasChinese
        ? `Translate the following Chinese text to natural, colloquial English. Return ONLY the translation with no explanation or preamble:\n\n${input}`
        : `將以下英文翻譯成自然流暢的繁體中文。只回傳翻譯結果，不需任何說明：\n\n${input}`
      const result = await callAI([{ role:'user', content: prompt }])
      setTransResult(result.trim())
    } catch(e) {
      setTransErr(e.message)
    } finally {
      setTransBusy(false)
    }
  }

  // ── 🗣 中文→英文 函式 ─────────────────────────────────────
  async function translateIsland() {
    if (!zhInput.trim()) return
    setIslandBusy(true); setIslandErr(''); setIslandResults([])
    try {
      const lines = zhInput.split('\n').map(l => l.trim()).filter(l => l.length > 0)
      const audienceMap = {
        colleague: 'casual office colleague small talk — friendly, relaxed, slightly professional',
        friend:    'close American friends hanging out — most casual, slang welcome, very natural',
        message:   'text message to a friend — short, punchy, lowercase ok, no formality',
        social:    'social dinner or party chat — warm, fun, conversational, like meeting new people',
      }
      const audienceCtx = audienceMap[islandAudience] ?? audienceMap.friend
      const isWork = islandCat === 'work'
      const system = `You are an English language coach for a Taiwanese manufacturing professional.
Translate each Chinese sentence into natural, colloquial American English that a native speaker would actually say out loud.

AUDIENCE: ${audienceCtx}
${isWork ? 'SETTING: manufacturing workplace, meetings, client calls' : 'SETTING: everyday personal life'}

STRICT RULES:
- Use contractions: I'm, we've, it's, can't, you're, gonna, wanna
- Use spoken American expressions, NOT textbook English
- Keep it short and punchy like real speech
- For text message mode: use casual abbreviations and short sentences
- For friend mode: slang is welcome (e.g. "That client is a total nightmare")
- NEVER write what sounds like a formal email or textbook sentence
- Return ONLY valid JSON array: [{"zh":"original","en":"natural American English"}]
- No markdown, no explanation`
      const prompt = `Translate these ${lines.length} sentences:\n${lines.map((l,i) => `${i+1}. ${l}`).join('\n')}`
      const raw = await callAI([{ role:'user', content: prompt }], system)
      const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim())
      if (!Array.isArray(parsed)) throw new Error('invalid')
      setIslandResults(parsed.map(p => ({ zh: p.zh ?? '', en: p.en ?? '', added: false, dup: false })))
    } catch(e) {
      setIslandErr('翻譯失敗，請重試')
    } finally { setIslandBusy(false) }
  }

  function addIslandPhrase(i) {
    const p = islandResults[i]
    if (!p || p.added) return
    const existing = (() => { try { return JSON.parse(localStorage.getItem('fsi:ph:extra') ?? '[]') } catch { return [] } })()
    const normEn = normalizeEn(p.en)
    if (existing.some(e => normalizeEn(e.en) === normEn)) {
      setIslandResults(prev => prev.map((r, ri) => ri === i ? { ...r, added: true, dup: true } : r))
      return
    }
    const newPhrase = { id: 'ph_island_' + Date.now() + '_' + i, cat: 'my', subcat: islandCat, en: p.en, zh: p.zh }
    localStorage.setItem('fsi:ph:extra', JSON.stringify([...existing, newPhrase]))
    setIslandResults(prev => prev.map((r, ri) => ri === i ? { ...r, added: true } : r))
  }

  function addAllIsland() {
    islandResults.forEach((_, i) => addIslandPhrase(i))
  }

  // ── AI prompt ──────────────────────────────────────────────
  async function analyze() {
    if (!settings?.apiKey) { setErr('請先在 Setup 設定 Anthropic API Key'); return }
    if (!text.trim())       { setErr('請先貼上英文文字'); return }
    setBusy(true); setErr(''); setRes(null)
    setAddedP([]); setAddedS([]); setAddedV([])
    try {
      const system = [
        'You are an English teaching assistant for a Taiwanese electronics manufacturing professional.',
        'Analyze the text and classify extracted content into THREE categories:\n',
        '1. PHRASES: Complete, fixed sentences that are commonly used as-is in meetings.',
        '   - No substitution needed, short and direct.',
        '   - Must include a zh (Traditional Chinese) translation.',
        '   - Assign a cat from: opening | capacity | quality | cost | action',
        '   - Extract 2-4 phrases.\n',
        '2. FSI: Sentences with variable slots suitable for substitution drilling.',
        '   - Use {slot_name} placeholders. Include linked_hint and subs arrays.',
        '   - linked_hint rules: consonant+vowel liaison with ·, weak words ə/ən/tə, elision (t), CAPS stress.',
        '   - {slot} is INVISIBLE WALL — never merge · across it.',
        '   - Extract 2-4 FSI sentences.\n',
        '3. VOCAB: Key words worth memorizing.',
        '   - Include ipa_us (IPA pronunciation), def (concise English def), zh (Traditional Chinese translation), and ex (example sentence).',
        '   - Extract 2-4 words.\n',
        'Return ONLY valid JSON, no markdown:',
        '{"phrases":[{"en":"...","zh":"...","cat":"opening"}],',
        '"fsi":[{"template":"...{slot}...","context":"Short name","hint":"When to say this","linked_hint":"annotated","subs":[["opt1","opt2","opt3"]]}],',
        '"vocab":[{"word":"...","ipa_us":"/…/","def":"...","zh":"...","ex":"..."}]}'
      ].join('\n')

      const raw = await callClaude(settings.apiKey, [{ role:'user', content: text }], system)
      const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim())
      setRes(parsed)
      awardBadge('email_done')
      updateStats(s => ({ ...s, xp: (s.xp??0) + 15 }))
    } catch(e) {
      setErr(e.message?.includes('API') ? e.message : '分析失敗，請確認 API Key 正確')
    } finally { setBusy(false) }
  }

  // ── Add functions ───────────────────────────────────────────
  function addPhrase(p, catId) {
    const existing = JSON.parse(localStorage.getItem('fsi:ph:extra') ?? '[]')
    const norm = normalizeEn(p.en)
    if (existing.some(e => normalizeEn(e.en) === norm)) {
      setAddedP(a => [...a, p.en + '⚠️重複'])
      return
    }
    const id = 'ph_ai_' + Date.now()
    const cat = catId || p.cat || 'action'
    const newPhrase = { id, cat, en: p.en, zh: p.zh }
    localStorage.setItem('fsi:ph:extra', JSON.stringify([...existing, newPhrase]))
    setAddedP(a => [...a, p.en])
    updateStats(st => ({ ...st, xp: (st.xp??0) + 3 }))
  }

  function addFsi(s, cat) {
    const existing = (() => { try { return JSON.parse(localStorage.getItem('fsi:s') ?? '[]') } catch { return [] } })()
    const normT = normalizeEn(s.template)
    if (existing.some(e => normalizeEn(e.template) === normT)) {
      setAddedS(a => [...a, s.template + '⚠️重複']); return
    }
    const id = 'ai_' + Date.now()
    const context = cat === 'life' ? (s.context||'Daily Life') + ' (Life)' : s.context || 'AI'
    updateSentences(prev => [...(prev??[]), {
      id, mode:'simple', context, hint:s.hint||'', template:s.template,
      linked_hint:s.linked_hint||'', subs:s.subs||[],
      reps:0, ease:2.5, interval:1, dueDate:0, lastSeen:0
    }])
    setAddedS(a => [...a, s.template])
    updateStats(st => ({ ...st, xp: (st.xp??0) + 5 }))
  }

  function addVocab(v) {
    const existing = (() => { try { return JSON.parse(localStorage.getItem('fsi:v') ?? '[]') } catch { return [] } })()
    const normW = v.word.toLowerCase().trim()
    if (existing.some(e => (e.word||'').toLowerCase().trim() === normW)) {
      setAddedV(a => [...a, v.word + '⚠️重複']); return
    }
    const id = 'av_' + Date.now()
    updateVocab(prev => [...(prev??[]), {
      id, word:v.word, ipa_us:v.ipa_us||'', def:v.def, zh:v.zh||'', ex:v.ex,
      reps:0, ease:2.5, interval:1, dueDate:0, lastSeen:0
    }])
    setAddedV(a => [...a, v.word])
    updateStats(st => ({ ...st, xp: (st.xp??0) + 3 }))
  }

  function addAll() {
    ;(res?.phrases ?? []).forEach((p,i) => {
      if (!addedP.includes(p.en) && !addedP.includes(p.en+'⚠️重複')) addPhrase(p, phraseCats[i])
    })
    ;(res?.fsi ?? []).forEach((s,i) => {
      if (!addedS.includes(s.template) && !addedS.includes(s.template+'⚠️重複')) addFsi(s, fsiCats[i] ?? 'work')
    })
    ;(res?.vocab ?? []).forEach(v => {
      if (!addedV.includes(v.word) && !addedV.includes(v.word+'⚠️重複')) addVocab(v)
    })
  }

  // 計算真正新增數 vs 重複數
  const addedNew  = addedP.filter(x=>!x.includes('⚠️重複')).length
                  + addedS.filter(x=>!x.includes('⚠️重複')).length
                  + addedV.filter(x=>!x.includes('⚠️重複')).length
  const addedDup  = addedP.filter(x=>x.includes('⚠️重複')).length
                  + addedS.filter(x=>x.includes('⚠️重複')).length
                  + addedV.filter(x=>x.includes('⚠️重複')).length
  const totalItems  = (res?.phrases?.length??0) + (res?.fsi?.length??0) + (res?.vocab?.length??0)
  const pendingNew  = totalItems - addedNew - addedDup

  // ── Section header chip ─────────────────────────────────────
  function SecHead({ label, color, count, added }) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:3, height:14, background:color, borderRadius:2 }}/>
          <span style={{ fontFamily:MONO, fontSize:9, color, letterSpacing:'0.1em' }}>{label}</span>
        </div>
        <span style={{ fontFamily:MONO, fontSize:8.5, color:T.grn }}>{added}/{count} 已加入</span>
      </div>
    )
  }

  // ── Cat badge select (for phrase) ──────────────────────────
  function PhraseCatSelect({ idx, done }) {
    const cur = phraseCats[idx] ?? 'action'
    const opts = [
      { id:'opening',  label:'開場' },
      { id:'capacity', label:'產能' },
      { id:'quality',  label:'良率' },
      { id:'cost',     label:'成本' },
      { id:'action',   label:'行動' },
    ]
    return (
      <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
        {opts.map(o => (
          <div key={o.id} onClick={() => !done && setPhraseCats(p => ({ ...p, [idx]: o.id }))}
            style={{ padding:'2px 8px', borderRadius:8, fontFamily:MONO, fontSize:8, cursor: done ? 'default' : 'pointer',
              background: cur===o.id ? T.blue+'20' : T.surf2,
              border: '1px solid ' + (cur===o.id ? T.blue+'60' : T.bdr),
              color: cur===o.id ? T.blue : T.txt3, opacity: done ? 0.5 : 1 }}>
            {o.label}
          </div>
        ))}
      </div>
    )
  }

  // ── Work/Life select (for FSI) ──────────────────────────────
  function WLSelect({ idx, done }) {
    const cur = fsiCats[idx] ?? 'work'
    return (
      <div style={{ display:'flex', gap:5 }}>
        {['work','life'].map(c => (
          <div key={c} onClick={() => !done && setFsiCats(p => ({ ...p, [idx]: c }))}
            style={{ padding:'3px 10px', borderRadius:10, fontFamily:MONO, fontSize:8.5, cursor: done ? 'default' : 'pointer',
              background: cur===c ? (c==='work' ? T.amberD : T.blueD) : T.surf2,
              border: '1px solid ' + (cur===c ? (c==='work' ? T.amber+'60' : T.blue+'60') : T.bdr),
              color: cur===c ? (c==='work' ? T.amber : T.blue) : T.txt3,
              opacity: done ? 0.5 : 1 }}>
            {c==='work' ? '💼 WORK' : '🏠 LIFE'}
          </div>
        ))}
      </div>
    )
  }

  // ── Card renderers ──────────────────────────────────────────
  function PhraseCard({ p, i, desktop }) {
    const added = addedP.includes(p.en)
    const isDup = addedP.includes(p.en + '⚠️重複')
    const done = added || isDup
    const dupExists = !added && !isDup && (() => {
      try {
        const ex = JSON.parse(localStorage.getItem('fsi:ph:extra') ?? '[]')
        return ex.some(e => normalizeEn(e.en) === normalizeEn(p.en))
      } catch { return false }
    })()
    return (
      <div style={{ background:T.surf, border:'1px solid '+((isDup||dupExists) ? '#f5a62350' : done ? T.grn+'50' : T.bdr), borderRadius:10, padding:12, display:'flex', flexDirection:'column', gap:7, transition:'border-color 0.3s' }}>
        <div style={{ fontFamily:SERIF, fontSize: desktop?12:13, color:T.txt, lineHeight:1.6 }}>{p.en}</div>
        <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize: desktop?11:12, color:T.txt2 }}>{p.zh}</div>
        <PhraseCatSelect idx={i} done={done}/>
        <button className="btn" onClick={() => addPhrase(p, phraseCats[i])} disabled={done || dupExists}
          style={{ background: (isDup||dupExists) ? '#f5a62315' : done ? T.grnD : T.blueD,
            border:'1px solid '+((isDup||dupExists) ? '#f5a62350' : done ? T.grn+'50' : T.blue+'50'),
            color: (isDup||dupExists) ? '#f5a623' : done ? T.grn : T.blue,
            fontSize:9, padding:'5px 0', marginTop:2 }}>
          {(isDup||dupExists) ? '⚠ 已存在（重複）' : done ? '✓ 已加入 PHRASE' : '+ 加入 PHRASE 練習'}
        </button>
      </div>
    )
  }

  function FsiCard({ s, i, desktop }) {
    const added = addedS.includes(s.template)
    const isDup = addedS.includes(s.template + '⚠️重複')
    const done = added || isDup
    const dupExists = !added && !isDup && (() => {
      try {
        const ex = JSON.parse(localStorage.getItem('fsi:s') ?? '[]')
        return ex.some(e => normalizeEn(e.template) === normalizeEn(s.template))
      } catch { return false }
    })()
    return (
      <div style={{ background:T.surf, border:'1px solid '+((isDup||dupExists) ? '#f5a62350' : done ? T.grn+'50' : T.bdr), borderRadius:10, padding:12, display:'flex', flexDirection:'column', gap:7, transition:'border-color 0.3s' }}>
        <div style={{ fontFamily:MONO, fontSize: desktop?11:12, color:T.txt, lineHeight:1.6 }}>{s.template}</div>
        <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:11, color:T.txt3 }}>{s.context} — {s.hint}</div>
        {s.linked_hint && <div style={{ fontFamily:MONO, fontSize:10, color:T.amber, background:T.amberD, borderRadius:6, padding:'4px 8px' }}>{s.linked_hint}</div>}
        {(s.subs??[]).map((g,gi) => (
          <div key={gi} style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
            {g.map((o,oi) => <span key={oi} style={{ fontFamily:MONO, fontSize:9, background:T.surf2, border:'1px solid '+T.bdr, borderRadius:10, padding:'2px 7px', color:T.txt3 }}>{o}</span>)}
          </div>
        ))}
        <WLSelect idx={i} done={done}/>
        <button className="btn" onClick={() => addFsi(s, fsiCats[i]??'work')} disabled={done || dupExists}
          style={{ background: (isDup||dupExists) ? '#f5a62315' : done ? T.grnD : T.amberD,
            border:'1px solid '+((isDup||dupExists) ? '#f5a62350' : done ? T.grn+'50' : T.amber+'50'),
            color: (isDup||dupExists) ? '#f5a623' : done ? T.grn : T.amber,
            fontSize:9, padding:'5px 0', marginTop:2 }}>
          {(isDup||dupExists) ? '⚠ 已存在（重複）' : done ? '✓ 已加入 FSI' : '+ 加入 FSI 練習'}
        </button>
      </div>
    )
  }

  function VocabCard({ v }) {
    const added = addedV.includes(v.word)
    const isDup = addedV.includes(v.word + '⚠️重複')
    const done = added || isDup
    const dupExists = !added && !isDup && (() => {
      try {
        const ex = JSON.parse(localStorage.getItem('fsi:v') ?? '[]')
        return ex.some(e => (e.word||'').toLowerCase().trim() === v.word.toLowerCase().trim())
      } catch { return false }
    })()
    return (
      <div style={{ background:T.surf, border:'1px solid '+((isDup||dupExists) ? '#f5a62350' : done ? T.grn+'50' : T.bdr), borderRadius:10, padding:12, display:'flex', flexDirection:'column', gap:6 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:MONO, fontSize:13, color:T.blue, fontWeight:500 }}>{v.word}</span>
          <div onClick={() => speak(v.word)} style={{ cursor:'pointer', color:T.txt3 }}
            onMouseOver={e=>e.currentTarget.style.color=T.blue} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M10.5 5a3 3 0 010 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          </div>
        </div>
        <div style={{ fontFamily:SERIF, fontSize:12, color:T.txt2, lineHeight:1.4 }}>{v.def}</div>
        {v.ex && <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:11, color:T.txt3 }}>"{v.ex}"</div>}
        <button className="btn" onClick={() => addVocab(v)} disabled={done || dupExists}
          style={{ background: (isDup||dupExists) ? '#f5a62315' : done ? T.grnD : T.blueD,
            border:'1px solid '+((isDup||dupExists) ? '#f5a62350' : done ? T.grn+'50' : T.blue+'50'),
            color: (isDup||dupExists) ? '#f5a623' : done ? T.grn : T.blue,
            fontSize:9, padding:'5px 0', marginTop:2 }}>
          {(isDup||dupExists) ? '⚠ 已存在（重複）' : done ? '✓ 已加入 VOCAB' : '+ 加入 VOCAB'}
        </button>
      </div>
    )
  }

  // ── Shared analyze button + input ───────────────────────────
  function InputArea() {
    return (
      <>
        <textarea value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter' && (e.ctrlKey||e.metaKey)) analyze() }}
          placeholder={'貼上 Email、會議記錄、報告…\n\nAI 會自動分成三類：\n📌 PHRASE — 固定常用句 → PHRASE 練習\n🔄 FSI    — 替換句型  → BUILD/DRILL\n📖 VOCAB  — 關鍵單字  → VOCAB\n\n(Ctrl+Enter 快速分析)'}
          style={{ flex:1, resize:'none', lineHeight:1.7, fontSize:13, minHeight:180,
            background:T.surf2, border:'1px solid '+T.bdr2, borderRadius:10,
            padding:'14px 16px', color:T.txt, fontFamily:MONO, outline:'none' }}/>
        {err && <div style={{ background:T.redD, border:'1px solid '+T.red+'50', borderRadius:8, padding:11, fontFamily:MONO, fontSize:11, color:T.red }}>{err}</div>}
        <button className="btn" onClick={analyze} disabled={busy || !text.trim()}
          style={{ background: busy ? T.bdr : T.amber, color: busy ? T.txt2 : T.bg,
            width:'100%', letterSpacing:'0.1em', padding:'13px', fontSize:12, fontWeight:700 }}>
          {busy
            ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <span style={{ display:'inline-block', width:10, height:10, border:'2px solid transparent', borderTopColor:T.txt2, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                AI 分析中…
              </span>
            : '⚡ AI 三分類分析（Ctrl+Enter）'
          }
        </button>
      </>
    )
  }

  // ── 🗣 中文→英文 句子島 layout ─────────────────────────────
  const ModeToggle = () => (
    <div style={{ display:'flex', background:T.surf2, borderRadius:10, padding:2, gap:2, flexShrink:0 }}>
      {[{id:'analyze',label:'⚡ AI 三分類'},{id:'island',label:'🗣 中文→英文'},{id:'translate',label:'🔁 即時翻譯'}].map(m => (
        <div key={m.id} onClick={() => setSiMode(m.id)}
          style={{ flex:1, textAlign:'center', padding:'7px 12px', borderRadius:8, cursor:'pointer',
            fontFamily:MONO, fontSize:10, fontWeight: siMode===m.id?700:400, whiteSpace:'nowrap',
            background: siMode===m.id ? T.amber : 'transparent',
            color: siMode===m.id ? T.bg : T.txt2, transition:'all 0.15s' }}>
          {m.label}
        </div>
      ))}
    </div>
  )

  if (siMode === 'island') {
    return (
      <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:14 }} className="fadeUp">
        <ModeToggle/>

        <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, lineHeight:1.8, background:T.surf2, border:`1px solid ${T.bdr}`, borderRadius:8, padding:'10px 12px' }}>
          輸入你今天真實想說的中文 → AI 翻成道地口語英文 → 存入收藏 → 用「🔄 反向」模式練習
        </div>

        {/* 分類選擇 */}
        <div style={{ display:'flex', gap:8 }}>
          {[{id:'life',l:'🏠 生活日常'},{id:'work',l:'💼 工作職場'}].map(c => (
            <div key={c.id} onClick={() => setIslandCat(c.id)}
              style={{ flex:1, textAlign:'center', padding:'9px 0', borderRadius:9, cursor:'pointer',
                fontFamily:MONO, fontSize:10, fontWeight: islandCat===c.id?700:400,
                background: islandCat===c.id ? (c.id==='work' ? T.amberD : T.blueD) : T.surf2,
                border: `1px solid ${islandCat===c.id ? (c.id==='work' ? T.amber+'60' : T.blue+'60') : T.bdr}`,
                color: islandCat===c.id ? (c.id==='work' ? T.amber : T.blue) : T.txt2,
                transition:'all 0.15s' }}>
              {c.l}
            </div>
          ))}
        </div>

        {/* 說話對象選擇 */}
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          <div style={{ fontFamily:MONO, fontSize:8, color:T.txt3, letterSpacing:'0.08em' }}>說給誰聽</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {[
              {id:'colleague', l:'👥 同事閒聊'},
              {id:'friend',    l:'👫 好友'},
              {id:'message',   l:'📱 傳訊息'},
              {id:'social',    l:'🍽️ 聚餐社交'},
            ].map(a => {
              const active = islandAudience === a.id
              return (
                <div key={a.id} onClick={() => setIslandAudience(a.id)}
                  style={{ padding:'5px 12px', borderRadius:10, cursor:'pointer',
                    fontFamily:MONO, fontSize:9, fontWeight: active?700:400,
                    background: active ? T.amber+'25' : T.surf2,
                    border: `1px solid ${active ? T.amber+'80' : T.bdr}`,
                    color: active ? T.amber : T.txt2, transition:'all 0.14s',
                    userSelect:'none' }}>
                  {a.l}
                </div>
              )
            })}
          </div>
        </div>

        {/* 中文輸入 */}
        <textarea value={zhInput} onChange={e => setZhInput(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter' && (e.ctrlKey||e.metaKey)) translateIsland() }}
          placeholder={'每行一句，輸入你今天真實想說的中文：\n\n晚上有全球視訊，壓力很大\n那個客戶最近很難搞\n想帶女兒去看畢業典禮'}
          style={{ minHeight:160, resize:'none', lineHeight:1.8, fontSize:13,
            background:T.surf2, border:'1px solid '+T.bdr2, borderRadius:10,
            padding:'14px 16px', color:T.txt, fontFamily:SERIF, outline:'none' }}/>

        {islandErr && (
          <div style={{ background:T.redD, border:`1px solid ${T.red}50`, borderRadius:8, padding:11, fontFamily:MONO, fontSize:11, color:T.red }}>
            {islandErr}
          </div>
        )}

        <button className="btn" onClick={translateIsland} disabled={islandBusy || !zhInput.trim()}
          style={{ background: islandBusy ? T.bdr : T.amber, color: islandBusy ? T.txt2 : T.bg,
            width:'100%', letterSpacing:'0.1em', padding:'13px', fontSize:12, fontWeight:700 }}>
          {islandBusy
            ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <span style={{ display:'inline-block', width:10, height:10, border:'2px solid transparent', borderTopColor:T.txt2, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                AI 翻譯中…
              </span>
            : '🌐 翻成道地英文（Ctrl+Enter）'
          }
        </button>

        {/* 翻譯結果 */}
        {islandResults.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }} className="fadeUp">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
                {islandResults.length} 句 · {islandResults.filter(r=>r.added).length} 已加入
              </span>
              <button className="btn" onClick={addAllIsland}
                disabled={islandResults.every(r => r.added)}
                style={{ background:T.grnD, border:`1px solid ${T.grn}50`, color:T.grn, fontSize:9, padding:'4px 12px' }}>
                全部加入收藏
              </button>
            </div>

            {islandResults.map((p, i) => (
              <div key={i} style={{ background:T.surf, borderRadius:12, padding:14,
                border:`1px solid ${p.added ? (p.dup ? T.amber+'50' : T.grn+'50') : T.bdr}`,
                display:'flex', flexDirection:'column', gap:8, transition:'border-color 0.3s' }}>
                {/* 原始中文 */}
                <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:13, color:T.txt3 }}>
                  {p.zh}
                </div>
                {/* 英文結果 */}
                <div style={{ fontFamily:MONO, fontSize:14, color:T.txt, lineHeight:1.6 }}>
                  {p.en}
                </div>
                {/* 操作按鈕 */}
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <div onClick={() => { window.speechSynthesis?.cancel(); const u=new SpeechSynthesisUtterance(p.en); u.lang='en-US'; u.rate=0.85; window.speechSynthesis?.speak(u) }}
                    style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.txt3, padding:'3px 8px', background:T.surf2, borderRadius:6, border:`1px solid ${T.bdr}` }}>
                    🔊 聽
                  </div>
                  <div onClick={() => { window.speechSynthesis?.cancel(); const u=new SpeechSynthesisUtterance(p.en); u.lang='en-US'; u.rate=0.6; window.speechSynthesis?.speak(u) }}
                    style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.txt3, padding:'3px 8px', background:T.surf2, borderRadius:6, border:`1px solid ${T.bdr}` }}>
                    🐢 慢
                  </div>
                  <button className="btn" onClick={() => addIslandPhrase(i)} disabled={p.added}
                    style={{ marginLeft:'auto',
                      background: p.added ? (p.dup ? '#f5a62315' : T.grnD) : T.blueD,
                      border: `1px solid ${p.added ? (p.dup ? T.amber+'50' : T.grn+'50') : T.blue+'50'}`,
                      color: p.added ? (p.dup ? T.amber : T.grn) : T.blue,
                      fontSize:9, padding:'4px 12px' }}>
                    {p.added ? (p.dup ? '⚠ 已存在' : '✓ 已加入') : '+ 加入收藏'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── 🔁 即時翻譯 layout ───────────────────────────────────
  if (siMode === 'translate') {
    const hasChinese = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(transInput)
    const dir        = transInput.trim() ? (hasChinese ? 'zh→en' : 'en→zh') : null
    const canSave    = transResult && dir === 'zh→en'
    const micSupported = !!(window.SpeechRecognition ?? window.webkitSpeechRecognition)

    function startTransRecog() {
      const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
      if (!SR) { setTransErr('此裝置不支援語音辨識（需 Chrome）'); return }
      window.speechSynthesis?.cancel()
      const recog = new SR()
      recog.lang = transLang; recog.continuous = false
      recog.interimResults = true; recog.maxAlternatives = 1
      let finalT = ''
      recog.onstart  = () => { setTransListening(true); setTransInterim(''); setTransErr('') }
      recog.onresult = (e) => {
        let itm = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) finalT += t
          else itm += t
        }
        setTransInterim(itm)
      }
      recog.onend = () => {
        setTransListening(false); setTransInterim('')
        if (finalT.trim()) { setTransInput(finalT.trim()); setTransResult(''); setTransErr('') }
        else if (!transErr) setTransErr('沒有偵測到聲音，請靠近麥克風再試')
      }
      recog.onerror = (e) => {
        setTransListening(false); setTransInterim('')
        const msgs = { 'no-speech':'沒有偵測到聲音，請靠近麥克風再試', 'not-allowed':'麥克風權限被拒絕，請在瀏覽器設定中允許', 'network':'網路錯誤' }
        setTransErr(msgs[e.error] ?? '語音辨識失敗：' + e.error)
      }
      transRecogRef.current = recog; recog.start()
    }
    function stopTransRecog() { transRecogRef.current?.stop() }
    function copyResult() { navigator.clipboard?.writeText(transResult).catch(() => {}) }
    function speakResult() {
      if (!transResult) return
      window.speechSynthesis?.cancel()
      const u = new SpeechSynthesisUtterance(transResult)
      u.lang = dir === 'zh→en' ? 'en-US' : 'zh-TW'; u.rate = 0.85
      window.speechSynthesis?.speak(u)
    }
    function saveToCollection() {
      if (!canSave) return
      const newPhrase = { id:'ph_trans_'+Date.now(), cat:'my', subcat:'life', en:transResult, zh:transInput.trim() }
      if (extraPhrases.find(p => p.en?.trim() === newPhrase.en)) { flash('⚠ 已存在收藏'); return }
      setExtraPhrases(prev => { const u=[...prev,newPhrase]; localStorage.setItem('fsi:ph:extra',JSON.stringify(u)); return u })
      flash('✓ 已加入我的收藏')
    }

    return (
      <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:14 }} className="fadeUp">
        <ModeToggle/>

        {/* ── 麥克風區 ── */}
        {micSupported && (
          <div style={{ display:'flex', flexDirection:'column', gap:10, alignItems:'center',
            background:T.surf2, border:`1.5px solid ${transListening ? T.red+'80' : T.bdr}`,
            borderRadius:14, padding:'16px 12px', transition:'border-color 0.2s' }}>

            {/* 語言切換 chip */}
            <div style={{ display:'flex', gap:6 }}>
              {[{id:'zh-TW',label:'🇹🇼 說中文'},{id:'en-US',label:'🇺🇸 說英文'}].map(l => (
                <div key={l.id} onClick={() => !transListening && setTransLang(l.id)}
                  style={{ padding:'5px 14px', borderRadius:10,
                    cursor: transListening ? 'default' : 'pointer',
                    fontFamily:MONO, fontSize:10, fontWeight: transLang===l.id ? 700 : 400,
                    background: transLang===l.id ? (l.id==='zh-TW' ? T.amberD : T.blueD) : 'transparent',
                    border:`1px solid ${transLang===l.id ? (l.id==='zh-TW' ? T.amber+'60' : T.blue+'60') : T.bdr}`,
                    color: transLang===l.id ? (l.id==='zh-TW' ? T.amber : T.blue) : T.txt3,
                    transition:'all 0.13s' }}>
                  {l.label}
                </div>
              ))}
            </div>

            {/* 麥克風按鈕圓圈 */}
            <div onClick={transListening ? stopTransRecog : startTransRecog}
              style={{ width:64, height:64, borderRadius:'50%', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                background: transListening ? T.red+'22' : T.surf,
                border:`2px solid ${transListening ? T.red : T.bdr2}`,
                boxShadow: transListening ? `0 0 0 8px ${T.red}18` : 'none',
                transition:'all 0.2s',
                animation: transListening ? 'pulse 1.4s ease-in-out infinite' : 'none' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="2" width="6" height="12" rx="3"
                  fill={transListening ? T.red : T.txt2}/>
                <path d="M5 11a7 7 0 0 0 14 0"
                  stroke={transListening ? T.red : T.txt2}
                  strokeWidth="1.8" strokeLinecap="round" fill="none"/>
                <line x1="12" y1="18" x2="12" y2="22"
                  stroke={transListening ? T.red : T.txt2} strokeWidth="1.8" strokeLinecap="round"/>
                <line x1="8" y1="22" x2="16" y2="22"
                  stroke={transListening ? T.red : T.txt2} strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>

            {/* 狀態文字 / 即時辨識預覽 */}
            <div style={{ fontFamily:MONO, fontSize:10, textAlign:'center', minHeight:18,
              color: transListening ? T.red : T.txt3, fontStyle: transListening && transInterim ? 'italic' : 'normal' }}>
              {transListening
                ? (transInterim || '🎙 聆聽中，說完後自動辨識…')
                : '點擊麥克風開始語音輸入'}
            </div>
          </div>
        )}

        {/* ── 方向指示列 ── */}
        <div style={{ display:'flex', alignItems:'center', gap:8, minHeight:20 }}>
          {dir ? (
            <>
              <span style={{ fontFamily:MONO, fontSize:10,
                color: dir==='zh→en' ? T.amber : T.blue,
                background: dir==='zh→en' ? T.amberD : T.blueD,
                border:`1px solid ${dir==='zh→en' ? T.amber+'60' : T.blue+'60'}`,
                padding:'2px 10px', borderRadius:10, letterSpacing:'0.08em' }}>
                {dir === 'zh→en' ? '中文 → 英文' : '英文 → 中文'}
              </span>
              <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>自動偵測</span>
            </>
          ) : (
            <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>語音或打字輸入，自動偵測語言</span>
          )}
          {transBusy && (
            <span style={{ marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:5,
              fontFamily:MONO, fontSize:9, color:T.txt3 }}>
              <span style={{ display:'inline-block', width:8, height:8,
                border:'1.5px solid transparent', borderTopColor:T.txt3,
                borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
              翻譯中…
            </span>
          )}
        </div>

        {/* ── 文字輸入框 ── */}
        <div style={{ position:'relative' }}>
          <textarea
            value={transListening ? transInterim : transInput}
            onChange={e => { if (!transListening) { setTransInput(e.target.value); setTransResult(''); setTransErr('') } }}
            placeholder={'或直接打字…\n\n停止打字 0.8 秒後自動翻譯'}
            rows={3}
            readOnly={transListening}
            style={{ width:'100%', resize:'none', lineHeight:1.7, fontSize:14, boxSizing:'border-box',
              background: transListening ? T.surf : T.surf2,
              border:`1.5px solid ${transListening ? T.red+'40' : transInput ? T.bdr2 : T.bdr}`,
              borderRadius:10, padding:'12px 40px 12px 16px', color: transListening ? T.txt3 : T.txt,
              fontFamily:MONO, outline:'none', transition:'all 0.15s',
              fontStyle: transListening ? 'italic' : 'normal' }}
          />
          {transInput && !transListening && (
            <div onClick={() => { setTransInput(''); setTransResult(''); setTransErr('') }}
              style={{ position:'absolute', top:10, right:10, cursor:'pointer',
                fontFamily:MONO, fontSize:10, color:T.txt3, padding:'2px 6px',
                background:T.surf, borderRadius:6, border:`1px solid ${T.bdr}` }}>✕</div>
          )}
        </div>

        {/* ── 錯誤訊息 ── */}
        {transErr && (
          <div style={{ background:T.redD, border:`1px solid ${T.red}50`, borderRadius:8,
            padding:'10px 14px', fontFamily:MONO, fontSize:11, color:T.red }}>{transErr}</div>
        )}

        {/* ── 翻譯結果 ── */}
        {transResult && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }} className="fadeUp">
            <div style={{ height:1, background:T.bdr }}/>
            <div style={{ background:T.surf, border:`1px solid ${T.bdr2}`, borderRadius:12,
              padding:'16px 18px', fontFamily: dir==='zh→en' ? MONO : SERIF,
              fontStyle: dir==='en→zh' ? 'italic' : 'normal',
              fontSize:15, color:T.txt, lineHeight:1.8 }}>
              {transResult}
            </div>
            <div style={{ display:'flex', gap:7 }}>
              <div onClick={speakResult}
                style={{ cursor:'pointer', fontFamily:MONO, fontSize:10, color:T.txt2,
                  padding:'6px 14px', background:T.surf2, borderRadius:8, border:`1px solid ${T.bdr}` }}>
                🔊 朗讀
              </div>
              <div onClick={copyResult}
                style={{ cursor:'pointer', fontFamily:MONO, fontSize:10, color:T.txt2,
                  padding:'6px 14px', background:T.surf2, borderRadius:8, border:`1px solid ${T.bdr}` }}>
                📋 複製
              </div>
              {canSave && (
                <div onClick={saveToCollection}
                  style={{ cursor:'pointer', fontFamily:MONO, fontSize:10, color:T.blue,
                    padding:'6px 14px', background:T.blueD, borderRadius:8,
                    border:`1px solid ${T.blue}50`, marginLeft:'auto' }}>
                  + 加入收藏
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── DESKTOP layout ──────────────────────────────────────────
  if (isDesktop) {
    return (
      <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:T.bg, display:'flex', flexDirection:'column', zIndex:5 }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 24px', borderBottom:'1px solid '+T.bdr, background:T.surf, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <AppIcon size={28}/>
            <span style={{ fontFamily:DISP, fontSize:13, color:T.amber, letterSpacing:'0.12em' }}>FSI COMMAND — AI 三分類分析</span>
            <ModeToggle/>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {res && (
              <button className="btn" onClick={addAll} disabled={pendingNew===0}
                style={{ background: pendingNew===0 ? T.surf2 : T.grnD, border:'1px solid '+(pendingNew===0 ? T.bdr : T.grn+'50'), color: pendingNew===0 ? T.txt3 : T.grn, fontSize:10, padding:'5px 14px' }}>
                {pendingNew > 0
                  ? `全部加入 ✦ ${pendingNew} 筆新${addedDup>0?' / 跳過'+addedDup+'筆重複':''}`
                  : `✓ 已全部加入${addedDup>0?' （跳過'+addedDup+'筆重複）':''}`}
              </button>
            )}
            <button className="btn" onClick={() => { setText(''); setRes(null); setErr('') }}
              style={{ background:T.surf2, border:'1px solid '+T.bdr, color:T.txt3, fontSize:10, padding:'5px 12px' }}>
              清除
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
          {/* LEFT */}
          <div style={{ width:'38%', minWidth:300, display:'flex', flexDirection:'column', borderRight:'1px solid '+T.bdr, padding:'20px 24px', gap:12, flexShrink:0 }}>
            <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, letterSpacing:'0.1em' }}>貼上英文文字</div>
            <InputArea/>
            <div style={{ fontFamily:MONO, fontSize:8, color:T.txt3, lineHeight:1.8, textAlign:'center' }}>
              {'📌 PHRASE → PHRASE 頁練習\n🔄 FSI → BUILD/DRILL\n📖 VOCAB → 單字庫'}
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
            {!res && !busy && (
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, opacity:0.35 }}>
                <div style={{ display:'flex', flexDirection:'column', gap:10, fontFamily:MONO, fontSize:10, color:T.txt3, lineHeight:2 }}>
                  <div>📌 PHRASE — 固定常用句 → PHRASE 頁</div>
                  <div>🔄 FSI &nbsp;&nbsp;&nbsp;— 替換句型 &nbsp;&nbsp;→ BUILD/DRILL</div>
                  <div>📖 VOCAB — 關鍵單字 &nbsp;&nbsp;→ VOCAB</div>
                </div>
              </div>
            )}
            {busy && (
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
                <span style={{ display:'inline-block', width:32, height:32, border:'3px solid transparent', borderTopColor:T.amber, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                <span style={{ fontFamily:MONO, fontSize:10, color:T.amber, letterSpacing:'0.1em' }}>AI 分析中，自動分三類…</span>
              </div>
            )}
            {res && (
              <div style={{ display:'flex', flexDirection:'column', gap:18 }} className="fadeUp">

                {/* PHRASE section */}
                {(res.phrases??[]).length > 0 && (
                  <div>
                    <SecHead label="📌 PHRASE — 固定常用句" color={T.blue} count={res.phrases.length} added={addedP.length}/>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:8 }}>
                      {res.phrases.map((p,i) => <PhraseCard key={i} p={p} i={i} desktop/>)}
                    </div>
                  </div>
                )}

                {/* FSI section */}
                {(res.fsi??[]).length > 0 && (
                  <div>
                    <SecHead label="🔄 FSI — 替換句型練習" color={T.amber} count={res.fsi.length} added={addedS.length}/>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:8 }}>
                      {res.fsi.map((s,i) => <FsiCard key={i} s={s} i={i} desktop/>)}
                    </div>
                  </div>
                )}

                {/* VOCAB section */}
                {(res.vocab??[]).length > 0 && (
                  <div>
                    <SecHead label="📖 VOCAB — 關鍵單字" color={T.blue} count={res.vocab.length} added={addedV.length}/>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginTop:8 }}>
                      {res.vocab.map((v,i) => <VocabCard key={i} v={v}/>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── MOBILE layout ───────────────────────────────────────────
  return (
    <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:14 }} className="fadeUp">
      <ModeToggle/>
      <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, letterSpacing:'0.1em' }}>AI 三分類分析</div>
      <InputArea/>

      {res && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }} className="fadeUp">

          {/* Summary bar */}
          <div style={{ background:T.surf2, border:'1px solid '+T.bdr, borderRadius:10, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', gap:12 }}>
              <span style={{ fontFamily:MONO, fontSize:9, color:T.blue }}>📌 {res.phrases?.length??0}</span>
              <span style={{ fontFamily:MONO, fontSize:9, color:T.amber }}>🔄 {res.fsi?.length??0}</span>
              <span style={{ fontFamily:MONO, fontSize:9, color:T.txt2 }}>📖 {res.vocab?.length??0}</span>
            </div>
            <button className="btn" onClick={addAll} disabled={pendingNew===0}
              style={{ background: pendingNew===0 ? T.surf2 : T.grnD, border:'1px solid '+(pendingNew===0 ? T.bdr : T.grn+'50'), color: pendingNew===0 ? T.txt3 : T.grn, fontSize:9, padding:'4px 12px', maxWidth:200, textAlign:'center', lineHeight:1.4 }}>
              {pendingNew > 0
                ? `全部加入 ✦ ${pendingNew}筆新${addedDup>0?' /跳過'+addedDup+'重複':''}`
                : `✓ 已全部加入${addedDup>0?' (跳過'+addedDup+')':''}`}
            </button>
          </div>

          {/* PHRASE */}
          {(res.phrases??[]).length > 0 && (
            <div>
              <SecHead label="📌 PHRASE — 固定常用句" color={T.blue} count={res.phrases.length} added={addedP.length}/>
              <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:8 }}>
                {res.phrases.map((p,i) => <PhraseCard key={i} p={p} i={i}/>)}
              </div>
            </div>
          )}

          {/* FSI */}
          {(res.fsi??[]).length > 0 && (
            <div>
              <SecHead label="🔄 FSI — 替換句型練習" color={T.amber} count={res.fsi.length} added={addedS.length}/>
              <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:8 }}>
                {res.fsi.map((s,i) => <FsiCard key={i} s={s} i={i}/>)}
              </div>
            </div>
          )}

          {/* VOCAB */}
          {(res.vocab??[]).length > 0 && (
            <div>
              <SecHead label="📖 VOCAB — 關鍵單字" color={T.blue} count={res.vocab.length} added={addedV.length}/>
              <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:8 }}>
                {res.vocab.map((v,i) => <VocabCard key={i} v={v}/>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════
// MOVIE TAB  🎬
// ═══════════════════════════════════════════════════════════════
const DEFAULT_MOVIE_DB = {
  movies: [{
    id: 'jerry_maguire', title: '征服情海', titleEn: 'Jerry Maguire', year: 1996,
    scenes: [{
      id: 'scene_001', timeRange: '00:05:57 ~ 00:07:59', name: '使命宣言的誕生',
      phrases: [
        { id:'jm_01', en:'I hated myself.',                                                                zh:'我討厭我自己。',                           played:false, starred:false },
        { id:'jm_02', en:"No, here's what it was.",                                                       zh:'不，真正的原因是這個。',                   played:false, starred:false },
        { id:'jm_03', en:'I hated my place in the world.',                                                zh:'我討厭自己在這世界上的位置。',             played:false, starred:false },
        { id:'jm_04', en:'I had so much to say and no one to listen.',                                    zh:'我有很多話想說，卻沒有人願意聽。',         played:false, starred:false },
        { id:'jm_05', en:'And then it happened.',                                                         zh:'然後，事情發生了。',                       played:false, starred:false },
        { id:'jm_06', en:'It was the oddest, most unexpected thing.',                                     zh:'那是最奇怪、最出乎意料的事。',             played:false, starred:false },
        { id:'jm_07', en:'I began writing what they call a mission statement.',                           zh:'我開始寫一份他們所謂的使命宣言。',         played:false, starred:false },
        { id:'jm_08', en:'Not a memo, a mission statement.',                                              zh:'不是備忘錄，而是使命宣言。',               played:false, starred:false },
        { id:'jm_09', en:'You know, a suggestion for the future of our company.',                         zh:'就是對公司未來的一些建議。',               played:false, starred:false },
        { id:'jm_10', en:"A night like this doesn't come along very often.",                              zh:'像這樣的夜晚並不常有。',                   played:false, starred:false },
        { id:'jm_11', en:'I seized it.',                                                                  zh:'我抓住了它。',                             played:false, starred:false },
        { id:'jm_12', en:'What started out as one page became 25.',                                       zh:'原本只有一頁，最後變成25頁。',             played:false, starred:false },
        { id:'jm_13', en:"Suddenly I was my father's son again.",                                         zh:'突然間，我又變回了父親的兒子。',           played:false, starred:false },
        { id:'jm_14', en:'I was remembering the simple pleasures of this job.',                           zh:'我想起了這份工作的單純快樂。',             played:false, starred:false },
        { id:'jm_15', en:'How I ended up here out of law school.',                                        zh:'我如何從法學院一路走到了今天。',           played:false, starred:false },
        { id:'jm_16', en:'The key to this business is personal relationships.',                           zh:'這個行業成功的關鍵是人際關係。',           played:false, starred:false },
        { id:'jm_17', en:'Suddenly it was all pretty clear.',                                             zh:'突然間，一切都變得很清楚了。',             played:false, starred:false },
        { id:'jm_18', en:'The answer was fewer clients, less money, more attention, caring for them.',    zh:'答案是更少客戶、更少金錢、更多關注、用心照顧他們。', played:false, starred:false },
        { id:'jm_19', en:'Just starting our lives, really.',                                              zh:'其實，我們才正要開始生活。',               played:false, starred:false },
        { id:'jm_20', en:"I didn't care.",                                                                zh:'我不在乎。',                               played:false, starred:false },
        { id:'jm_21', en:'I had lost the ability to bullshit.',                                           zh:'我已經失去了說場面話的能力。',             played:false, starred:false },
        { id:'jm_22', en:"It was me I'd always wanted to be.",                                            zh:'那才是我一直想成為的人。',                 played:false, starred:false },
      ]
    }]
  }],
  vocab: []
}

function MovieTab({ audioMode, setAudioMode, movieToast, showMovieToast }) {
  const [db, setDb] = useState(() => {
    try {
      const s = localStorage.getItem('fsi:movie:db')
      if (!s) return DEFAULT_MOVIE_DB
      const parsed = JSON.parse(s)
      // 還原獨立存放的逐字稿
      const transcript0 = localStorage.getItem('fsi:movie:transcript:0') ?? ''
      if (transcript0 && parsed.movies?.[0]?.transcript === '__REF__') {
        parsed.movies[0].transcript = transcript0
      }
      return parsed
    }
    catch { return DEFAULT_MOVIE_DB }
  })
  const [view,       setView]       = useState('list')
  const [movieId,    setMovieId]    = useState('jerry_maguire')
  const [sceneId,    setSceneId]    = useState(null)
  const [playIdx,    setPlayIdx]    = useState(0)
  const [playing,    setPlaying]    = useState(false)
  const [looping,    setLooping]    = useState(false)
  const [sleepMins,  setSleepMins]  = useState(null)   // null | 10 | 20 | 30
  const [sleepSecs,  setSleepSecs]  = useState(null)   // 倒數秒數
  const [revIdx,     setRevIdx]     = useState(0)
  const [revFlip,    setRevFlip]    = useState(false)
  const [revMode,    setRevMode]    = useState('zh')
  const [flipCountdown, setFlipCountdown] = useState(null) // null | 2 | 1 | 0
  const [hintOpen, setHintOpen] = useState(() => {
    const s = localStorage.getItem('fsi:movie:hintOpen')
    return s === null ? true : s === 'true' // 第一次自動展開
  })
  const [editingSceneDescId,   setEditingSceneDescId]   = useState(null)
  const [editingSceneDescText, setEditingSceneDescText] = useState('')
  const [autoGenSceneBusy, setAutoGenSceneBusy] = useState(false)
  const [starFilter,      setStarFilter]      = useState(true)
  const [editingSceneNameId,   setEditingSceneNameId]   = useState(null)
  const [sceneSearch, setSceneSearch] = useState('')  // 場景搜尋關鍵字
  const [editingSceneNameText, setEditingSceneNameText] = useState('')
  const [playingPhraseId, setPlayingPhraseId] = useState(null)
  const [deletingPhraseId,setDeletingPhraseId]= useState(null)
  const [editingZhId,     setEditingZhId]     = useState(null)
  const [editingZhText,   setEditingZhText]   = useState('')
  const [editingNoteId,   setEditingNoteId]   = useState(null)
  const [editingNoteText, setEditingNoteText] = useState('')
  const [retranslatingId, setRetranslatingId] = useState(null)
  const [wordModal,       setWordModal]       = useState(null)
  // ── 行內單字查詢（取代 modal，在句子卡內展開）──
  const [inlineLookup,    setInlineLookup]    = useState(null) // {phraseId, word, sentence}
  const tapTimerRef  = useRef(null)
  const tapStartRef  = useRef(null)
  // ── 電影原音播放 refs ──
  const audioElRef   = useRef(null)   // HTMLAudioElement
  const audioUrlRef  = useRef(null)   // blob URL
  const audioStopRef = useRef(null)
  const audioSrcKeyRef = useRef(null) // 當前載入的 MP3 原始 URL（Jerry_1/Jerry_2），用於切換判斷
  const [audioFileName, setAudioFileName] = useState(
    () => localStorage.getItem('fsi:movie:audioName') ?? ''
  )
  const [audioReady, setAudioReady] = useState(false)
  const [audioSource, setAudioSource] = useState('none') // 'none' | 'cloud' | 'local'
  const [cloudAudioUrl, setCloudAudioUrl] = useState('')
  const [part1Status, setPart1Status] = useState('idle') // 'idle'|'loading'|'cached'|'error'
  const [part2Status, setPart2Status] = useState('idle') // 'idle'|'loading'|'cached'|'error'

  // ── 開 App 自動載入雲端 MP3（Part 1 顯示進度；Part 2 靜默背景預載）──
  useEffect(() => {
    localStorage.removeItem('fsi:movie:cloudUrl')
    if (audioMode === 'original') {
      // 啟動時立即查 IDB 狀態（Part 1 + Part 2）
      getMp3FromIDB(JERRY_MP3[0].url).then(c => { if (c) setPart1Status('cached') }).catch(() => {})
      getMp3FromIDB(JERRY_MP3[1].url).then(c => { if (c) setPart2Status('cached') }).catch(() => {})
      // Part 1：正常載入（顯示狀態列）
      loadAudioUrl(JERRY_MP3[0].url, '征服情海 Part 1')
      // Part 2：背景靜默預載進 IDB（不切換 audio element，不影響 Part 1 播放）
      const preloadPart2 = async () => {
        const url2 = JERRY_MP3[1].url
        // 先查 IDB，已有快取直接標記
        try {
          const cached = await getMp3FromIDB(url2)
          if (cached) { setPart2Status('cached'); return }
        } catch(e) {}
        if (!navigator.onLine) { setPart2Status('error'); return }
        // 沒有快取且有網路 → 開始下載
        try {
          setPart2Status('loading')
          const res = await fetch(url2)
          if (!res.ok) { setPart2Status('error'); return }
          // 用 arrayBuffer 讀取（更穩定）
          const buf = await res.arrayBuffer()
          const blob = new Blob([buf], { type: 'audio/mpeg' })
          await saveMp3ToIDB(url2, blob)
          setPart2Status('cached')
        } catch(e) { setPart2Status('error') }
      }
      // Part 1 載好後立即查 IDB；3秒後若無快取才開始下載
      preloadPart2()  // 立即查 IDB 狀態（不下載，有快取就顯示 ✅）
      setTimeout(preloadPart2, 3000) // 3秒後才正式下載（讓 Part 1 先佔頻寬）
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [scenePlaying, setScenePlaying] = useState(false)
  const [scenePlayPos,  setScenePlayPos]  = useState(0)
  const [sceneRate,     setSceneRate]     = useState(0.6) // 0~1 進度
  const [sceneLoop,     setSceneLoop]     = useState(false)
  const [playRate, setPlayRate] = useState(
    () => parseFloat(localStorage.getItem('fsi:movie:playRate') ?? '0.6')
  )
  const [pushSyncing,     setPushSyncing]     = useState(false)
  const [pullSyncing,     setPullSyncing]     = useState(false)
  const [movieSyncMsg,    setMovieSyncMsg]    = useState("")
  const [autoSyncStatus,  setAutoSyncStatus]  = useState('idle') // 'idle'|'syncing'|'ok'|'err'

  // ── 對話練習 state ──────────────────────────────────────────
  const [convPractice,    setConvPractice]    = useState(false)
  const [convHistory,     setConvHistory]     = useState([])
  const [convTurn,        setConvTurn]        = useState(0)
  const [convDone,        setConvDone]        = useState(false)
  const [convResult,      setConvResult]      = useState(null)
  const [convBusy,        setConvBusy]        = useState(false)
  const [convInput,       setConvInput]       = useState('')
  const [convListening,   setConvListening]   = useState(false)
  const convRecogRef = useRef(null)

  // ── 場景重述 state ──────────────────────────────────────────
  const [retellMode,      setRetellMode]      = useState(false)
  const [retellSegments,  setRetellSegments]  = useState([])
  const [retellListening, setRetellListening] = useState(false)
  const [retellDone,      setRetellDone]      = useState(false)
  const [retellResult,    setRetellResult]    = useState(null)
  const [retellBusy,      setRetellBusy]      = useState(false)
  const [retellInput,     setRetellInput]     = useState('')
  const retellRecogRef = useRef(null)

  // ── Speak 課程 state ────────────────────────────────────────
  const [speakOpen,   setSpeakOpen]   = useState(false)
  const [speakBusy,   setSpeakBusy]   = useState(false)
  const [speakCopied, setSpeakCopied] = useState(null)  // 'easy'|'advanced'|null

  // ── 開 App 自動從 Sheets 讀入（背景靜默執行）──────────────
  useEffect(() => {
    async function autoInit() {
      if (!navigator.onLine) return
      setAutoSyncStatus('syncing')
      try {
        const r    = await fetch(APPS_SCRIPT_URL)
        const json = await r.json()
        if (!json.ok || !json.movieDB) { setAutoSyncStatus('idle'); return }
        const sheetsDb       = json.movieDB
        const transcriptDB   = json.transcriptDB ?? []
        const sheetsAt       = sheetsDb.updatedAt ?? 0
        const localAt        = db.updatedAt ?? 0
        if (sheetsAt > localAt) {
          // Sheets 較新 → 合併，但必須保護本機逐字稿不被覆蓋
          const merged = {
            ...sheetsDb,
            movies: sheetsDb.movies?.map(m => {
              const localMovie  = db.movies?.find(lm => lm.id === m.id)
              const sheetsEntry = transcriptDB.find(tr => tr.movieId === m.id)
              const localTs     = localMovie?.transcriptUpdatedAt ?? 0
              const sheetsTs    = sheetsEntry?.updatedAt ?? 0

              if (sheetsEntry?.transcript?.trim()) {
                // Sheets 有逐字稿：用較新的
                if (sheetsTs >= localTs || !localMovie?.transcript?.trim()) {
                  return { ...m, transcript: sheetsEntry.transcript, transcriptUpdatedAt: sheetsTs }
                }
                return { ...m, transcript: localMovie.transcript, transcriptUpdatedAt: localTs }
              }
              // Sheets 沒有逐字稿：一定保留本機的（防止逐字稿消失）
              if (localMovie?.transcript?.trim()) {
                return { ...m, transcript: localMovie.transcript, transcriptUpdatedAt: localTs }
              }
              return m
            }) ?? []
          }
          setDb(merged)
          localStorage.setItem('fsi:movie:db', JSON.stringify(merged))
          setAutoSyncStatus('ok')
          setMovieSyncMsg('✓ 已自動同步最新資料')
        } else {
          setAutoSyncStatus('ok')
        }
      } catch { setAutoSyncStatus('idle') }
    }
    autoInit()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [wordBusy,   setWordBusy]   = useState(false)
  const [wordInfo,   setWordInfo]   = useState(null)
  // ── 手動新增單字 ──
  const [manualOpen,    setManualOpen]    = useState(false)
  const [manualInput,   setManualInput]   = useState('')
  const [manualBusy,    setManualBusy]    = useState(false)
  const [manualResult,  setManualResult]  = useState(null) // {phonetic,zh,example}
  const [manualExample, setManualExample] = useState('')
  const [srtText,       setSrtText]       = useState('')
  const [transcriptDraft, setTranscriptDraft] = useState('')
  const [transcriptEditMode, setTranscriptEditMode] = useState(false) // false=唯讀顯示已存, true=編輯新內容
  const [startTime,  setStartTime]  = useState('')
  const [endTime,    setEndTime]    = useState('')
  const [exportPreview, setExportPreview] = useState(null) // { lines, text } | null
  const [addBusy,    setAddBusy]    = useState(false)
  const [addErr,     setAddErr]     = useState('')
  const [addPreview, setAddPreview] = useState(null)
  const [aiStarBusy, setAiStarBusy] = useState(false)
  const [memoryFilter,    setMemoryFilter]    = useState('5') // '5'|'4'|'all'
  // ── ⭐ 重點句 view state ──────────────────────────────────
  const [starMode,        setStarMode]        = useState('list')   // 'list'|'reverse'|'familiar'|'unfamiliar'
  const [starFlip,        setStarFlip]        = useState({})       // { [phraseId]: true } 已翻牌
  const [starFamiliar,    setStarFamiliar]    = useState(() => {
    // 從 movieDB 初始化熟悉狀態（讓 App 重開後保留）
    try {
      const raw = localStorage.getItem('fsi:movie:db')
      if (!raw) return {}
      const db0 = JSON.parse(raw)
      const map = {}
      ;(db0.movies ?? []).forEach(m =>
        (m.scenes ?? []).forEach(s =>
          (s.phrases ?? []).forEach(ph => {
            if (ph.familiar === true) map[ph.id] = true
            else if (ph.familiar === false) map[ph.id] = false
          })
        )
      )
      return map
    } catch { return {} }
  })  // { [phraseId]: true/false } 熟悉
  const [starCurrentIdx,  setStarCurrentIdx]  = useState(0)        // 練習模式當前索引
  const [starReverse,     setStarReverse]     = useState(false)     // 反向開關（獨立於模式）
  const starPlayCountRef  = useRef({})          // { [phraseId]: count } 循環播放計數（自動熟悉用）
  const [starLoopMode,    setStarLoopMode]    = useState(null)      // null | 'familiar' | 'unfamiliar'
  const [starLoopIdx,     setStarLoopIdx]     = useState(0)
  const [starLoopPaused,  setStarLoopPaused]  = useState(false)     // 暫停狀態
  const starLoopRef      = useRef(null)   // setTimeout handle
  const starLoopListRef  = useRef([])     // 當前播放列表
  const starLoopIdxRef   = useRef(0)      // 當前索引
  const starLoopActiveRef = useRef(false) // 是否循環中
  const starLoopPausedRef = useRef(false) // 暫停 ref（供 callback 讀取）
  const fabRef = useRef(null)      // FAB DOM element
  const backBtnRef = useRef(null)  // 浮動返回鍵 DOM element
  const pauseFnRef = useRef(null)  // pause function ref
  const resumeFnRef = useRef(null) // resume function ref
  const starTimeUpdateRef = useRef(null)  // ontimeupdate handler
  const starCardRefs      = useRef({})    // { [phraseId]: DOM element } 自動滾動用
  const [starSleepMins,   setStarSleepMins]   = useState(0)      // 0=無限, 10/20/30=睡眠計時
  const starSleepRef = useRef(null)                               // 睡眠計時器
  const [starSleepEnd,    setStarSleepEnd]    = useState(null)    // 睡眠結束時間戳
  const [starSleepRemain, setStarSleepRemain] = useState(null)    // 倒數秒數
  const movie   = db.movies.find(m => m.id === movieId)
  const scene   = sceneId ? movie?.scenes.find(s => s.id === sceneId) : null
  const phrases     = scene?.phrases ?? []
  const activePhrases = starFilter ? phrases.filter(p => p.starred) : phrases
  const playedCount = activePhrases.filter(p => p.played).length
  const starredCount = phrases.filter(p => p.starred).length

  // 監聽 Sheets 同步還原事件，自動重載電影資料
  useEffect(() => {
    function onStorage(e) {
      if (e.key === 'fsi:movie:db') {
        try { const nd = JSON.parse(localStorage.getItem('fsi:movie:db')); if (nd) setDb(nd) } catch {}
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // ── File System Access API: 自動恢復上次 MP3 ──────────────────
  useEffect(() => {
    async function restoreAudioHandle() {
      if (!('showOpenFilePicker' in window)) return
      try {
        const req = indexedDB.open('fsi_audio', 1)
        req.onupgradeneeded = e => e.target.result.createObjectStore('handles')
        req.onsuccess = async e => {
          const db2 = e.target.result
          const tx  = db2.transaction('handles', 'readonly')
          const getReq = tx.objectStore('handles').get('mp3')
          getReq.onsuccess = async ev => {
            const handle = ev.target.result
            if (!handle) return
            try {
              // timeout 保護：5秒內未完成視為失敗
              const timeoutId = setTimeout(() => {
                setAudioFileName('')
                clearAudioHandle()
              }, 5000)
              let perm = await handle.queryPermission({ mode:'read' })
              if (perm === 'prompt') {
                perm = await handle.requestPermission({ mode:'read' })
              }
              if (perm !== 'granted') {
                clearTimeout(timeoutId)
                clearAudioHandle()
                return
              }
              const file = await handle.getFile()
              clearTimeout(timeoutId)
              loadAudioFile(file)
            } catch {
              clearAudioHandle()
            }
          }
        }
      } catch {}
    }
    restoreAudioHandle()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function clearAudioHandle() {
    try {
      const req = indexedDB.open('fsi_audio', 1)
      req.onsuccess = e => {
        const db2 = e.target.result
        const tx = db2.transaction('handles', 'readwrite')
        tx.objectStore('handles').delete('mp3')
      }
    } catch {}
    setAudioFileName('')
    setAudioReady(false)
  }

  async function saveAudioHandle(handle) {
    if (!handle) return
    try {
      const req = indexedDB.open('fsi_audio', 1)
      req.onupgradeneeded = e => e.target.result.createObjectStore('handles')
      req.onsuccess = e => {
        const db2 = e.target.result
        const tx = db2.transaction('handles', 'readwrite')
        tx.objectStore('handles').put(handle, 'mp3')
      }
    } catch {}
  }

  async function pickAudioFile(idbKey) {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types:[{ description:'Audio', accept:{'audio/*':['.mp3','.m4a','.aac','.wav','.ogg']} }]
        })
        const file = await handle.getFile()
        await saveAudioHandle(handle)
        loadAudioFile(file, idbKey)
      } catch(e) {
        if (e.name !== 'AbortError') console.error(e)
      }
    } else {
      // fallback: 傳統 input[type=file]
      const inp = idbKey === JERRY_MP3[1].url
        ? document.getElementById('fsi-audio-input-p2')
        : document.getElementById('fsi-audio-input')
      inp?.click()
    }
  }

  // ── auto push debounce ref ───────────────────────────────────
  const autoPushTimer = useRef(null)

  function saveDb(nd) {
    const ndWithTs = { ...nd, updatedAt: Date.now() }
    setDb(ndWithTs)
    // 逐字稿獨立存：避免 movieDB 超過 localStorage 5MB 限制
    const transcript = ndWithTs.movies?.[0]?.transcript ?? ''
    if (transcript) {
      try { localStorage.setItem('fsi:movie:transcript:0', transcript) } catch(e) {}
    }
    // movieDB 去掉逐字稿再存（縮小體積）
    const ndLight = {
      ...ndWithTs,
      movies: (ndWithTs.movies ?? []).map((m, i) =>
        i === 0 ? { ...m, transcript: '__REF__' } : m
      )
    }
    try {
      localStorage.setItem('fsi:movie:db', JSON.stringify(ndLight))
    } catch(e) {
      // QuotaExceededError：movieDB 仍然太大，告警但不崩潰
      console.warn('saveDb quota exceeded:', e)
    }
    if (autoPushTimer.current) clearTimeout(autoPushTimer.current)
    autoPushTimer.current = setTimeout(() => autoPush(ndWithTs), 3000)
  }

  async function autoPush(ndWithTs) {
    if (!navigator.onLine) return
    try {
      const dbToSync = {
        ...ndWithTs,
        movies: ndWithTs.movies?.map(m => {
          const { transcript, ...rest } = m
          return rest
        }) ?? []
      }
      // 還原真正的逐字稿（v3.81+ 存 __REF__ 佔位，需從獨立 key 讀回）
      const transcript0 = localStorage.getItem('fsi:movie:transcript:0') ?? ''
      const transcriptDB = (ndWithTs.movies ?? [])
        .filter(m => m.transcript || (m.id === 'jerry_maguire' && transcript0))
        .map((m, i) => ({
          movieId: m.id,
          transcript: (m.transcript === '__REF__' || (!m.transcript && i === 0))
            ? transcript0 : m.transcript,
          updatedAt: m.transcriptUpdatedAt ?? Date.now()
        }))
        .filter(t => t.transcript) ?? []
      const form = new FormData()
      form.append('data', JSON.stringify({ movieDB: dbToSync, transcriptDB }))
      await fetch(APPS_SCRIPT_URL, { method:'POST', mode:'no-cors', body:form })
    } catch { /* 靜默失敗，下次再試 */ }
  }

  function updateScenePhrases(fn) {
    saveDb({ ...db, movies: db.movies.map(m => m.id !== movieId ? m : {
      ...m, scenes: m.scenes.map(s => s.id !== sceneId ? s : { ...s, phrases: fn(s.phrases) })
    })})
  }

  // ── 補充時間碼（不重新解析，保留所有備註和收藏）──────────────
  function patchTimestamps() {
    const transcript = movie?.transcript ?? ''
    if (!transcript) return false
    const normalized = normalizeSRT(transcript)
    // 建立 文字 → 時間碼 對應表
    const lookup = {}
    for (const block of normalized.split(/\n{2,}/)) {
      const blines = block.trim().split('\n')
      const tsLine = blines.find(l => /\d{2}:\d{2}:\d{2},\d+\s*-->\s*\d{2}:\d{2}:\d{2},\d+/.test(l))
      if (!tsLine) continue
      const [tsStart, tsEnd] = tsLine.split('-->')
      const ls = timeToSecs(tsStart.trim())
      const le = timeToSecs((tsEnd ?? '').trim()) || ls + 3
      const txt = blines
        .filter(l => !/^\s*\d+\s*$/.test(l) && !/\d{2}:\d{2}:\d{2}/.test(l))
        .join(' ').replace(/\s+/g,' ').replace(/[.!?,…]+$/,'').trim().toLowerCase()
      if (txt.length > 1) lookup[txt] = { startSecs: ls, endSecs: le }
    }
    let patched = 0
    updateScenePhrases(ps => ps.map(p => {
      if (p.startSecs > 0) return p
      const key = p.en.replace(/[.!?,…]+$/,'').trim().toLowerCase()
      // 完全比對
      if (lookup[key]) { patched++; return { ...p, ...lookup[key] } }
      // 部分比對（句子可能有省略）
      const found = Object.entries(lookup).find(([k]) =>
        k.length > 8 && (k.includes(key) || key.includes(k))
      )
      if (found) { patched++; return { ...p, ...found[1] } }
      return p
    }))
    return patched
  }

  function markPlayed(pid) {
    updateScenePhrases(ps => ps.map(p => p.id === pid ? { ...p, played:true } : p))
  }
  function resetScene() {
    updateScenePhrases(ps => ps.map(p => ({ ...p, played:false, starred:false })))
  }
  function deletePhrase(pid) {
    updateScenePhrases(ps => ps.filter(p => p.id !== pid))
  }
  function toggleStar(pid) {
    updateScenePhrases(ps => ps.map(p => p.id === pid ? { ...p, starred: !p.starred } : p))
  }
  function toggleStarGlobal(pid) {
    saveDb({ ...db, movies: db.movies.map(m => ({
      ...m, scenes: (m.scenes ?? []).map(s => ({
        ...s, phrases: (s.phrases ?? []).map(p => p.id === pid ? { ...p, starred: !p.starred } : p)
      }))
    }))})
  }
  function saveZh(pid, newZh) {
    updateScenePhrases(ps => ps.map(p => p.id === pid ? { ...p, zh: newZh.trim() } : p))
    setEditingZhId(null)
  }
  function saveNote(pid, newNote) {
    updateScenePhrases(ps => ps.map(p => p.id === pid ? { ...p, note: newNote } : p))
    setEditingNoteId(null)
  }
  function saveSceneDesc(pid, text) {
    updateScenePhrases(ps => ps.map(p => p.id === pid ? { ...p, sceneDesc: text } : p))
    setEditingSceneDescId(null)
  }
  async function autoGenSceneDesc(pid, enText) {
    setAutoGenSceneBusy(pid)
    try {
      const prompt = `這是電影《征服情海》的台詞："${enText}"
用15~25字的繁體中文，描述說這句話時的電影畫面情境（不要翻譯台詞，描述場景畫面）。
只回傳描述文字，不要任何說明。`
      const result = await callAI([{ role:'user', content:prompt }])
      saveSceneDesc(pid, result.trim())
    } catch(e) { /* silent fail */ }
    finally { setAutoGenSceneBusy(false) }
  }
  function speakPhrase(pid, textOrRate, rateOverride) {
    const text = typeof textOrRate === 'string' ? textOrRate : ''
    const rate = typeof rateOverride === 'number' ? rateOverride : playRate

    // 停止當前播放
    clearTimeout(audioStopRef.current)
    if (audioElRef.current) audioElRef.current.pause()
    window.speechSynthesis?.cancel()

    // 再點同一句（且未指定 rate）→ 停止
    if (playingPhraseId === pid && rateOverride === undefined) {
      setPlayingPhraseId(null); return
    }
    setPlayingPhraseId(pid)

    // 找當前場景的 phrase 取得時間碼
    const phrase = phrases.find(p => p.id === pid)
    const hasTimestamp = phrase && (phrase.startSecs > 0 || phrase.endSecs > 0)

    // 優先用電影原音（audioMode === 'original' 且 MP3 已載入且有時間碼）
    if (audioMode === 'original' && audioElRef.current && hasTimestamp) {
      const el = audioElRef.current
      const targetFile = getJerryMp3(phrase.startSecs)
      const offsetSecs = phrase.startSecs - targetFile.start
      // 用 audioSrcKeyRef 判斷是否需要切換（blob URL 下 el.src 不含檔名，不能用）
      const needSwitch = audioSrcKeyRef.current !== targetFile.url
      if (needSwitch) {
        loadAudioUrl(targetFile.url, `征服情海 Part ${JERRY_MP3.indexOf(targetFile) + 1}`)
        const onReady = () => {
          // 確認已切換到正確檔案才播（防止舊 canplay 殘留觸發）
          if (audioSrcKeyRef.current !== targetFile.url) return
          el.playbackRate = rate
          el.currentTime = offsetSecs
          el.play().catch(() => {})
          const dur = Math.max(0.5, (phrase.endSecs - phrase.startSecs)) * 1000 / rate
          audioStopRef.current = setTimeout(() => {
            el.pause(); setPlayingPhraseId(null)
          }, dur + 200)
          el.removeEventListener('canplay', onReady)
        }
        el.addEventListener('canplay', onReady)
      } else {
        el.playbackRate = rate
        el.currentTime = offsetSecs
        el.play().catch(() => {})
        const dur = Math.max(0.5, (phrase.endSecs - phrase.startSecs)) * 1000 / rate
        audioStopRef.current = setTimeout(() => {
          el.pause(); setPlayingPhraseId(null)
        }, dur + 200)
      }
    } else {
      // fallback: TTS
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'en-US'; u.rate = rate
      u.onend = u.onerror = () => setPlayingPhraseId(null)
      window.speechSynthesis?.speak(u)
    }
  }

  function loadAudioFile(file, idbKey) {
    if (!file) return
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    const blobUrl = URL.createObjectURL(file)
    audioUrlRef.current = blobUrl
    if (!audioElRef.current) audioElRef.current = new Audio()
    const el = audioElRef.current
    // 存進 IDB（以 idbKey 為索引，之後可離線讀取）
    if (idbKey) {
      saveMp3ToIDB(idbKey, file).then(() => {
        if (idbKey === JERRY_MP3[0].url) setPart1Status('cached')
        if (idbKey === JERRY_MP3[1].url) setPart2Status('cached')
      }).catch(() => {})
      audioSrcKeyRef.current = idbKey
    }
    el.src = blobUrl
    el.oncanplay = () => setAudioReady(true)
    el.onerror = () => setAudioReady(false)
    // 整段播放進度追蹤
    el.ontimeupdate = () => {
      if (el._sceneEnd && el.currentTime >= el._sceneEnd) {
        if (el._sceneLoop) {
          el.currentTime = el._sceneStart ?? 0
          el.play().catch(() => { setScenePlaying(false); setScenePlayPos(0) })
          setScenePlayPos(0)
        } else {
          el.pause(); el._sceneEnd = null
          setScenePlaying(false); setScenePlayPos(0)
          setSleepMins(null); setSleepSecs(null)
        }
      } else if (el._sceneStart !== undefined && el._sceneEnd) {
        const pos = (el.currentTime - el._sceneStart) / (el._sceneEnd - el._sceneStart)
        setScenePlayPos(Math.min(1, Math.max(0, pos)))
      }
    }
    setAudioFileName(file.name)
    localStorage.setItem('fsi:movie:audioName', file.name)
    setAudioSource('local')
    setAudioReady(false)
  }

  function loadAudioUrl(url, label) {
    if (!url) return
    if (!audioElRef.current) audioElRef.current = new Audio()
    const el = audioElRef.current
    const displayName = label || url.split('/').pop()

    // 共用 ontimeupdate handler
    el.ontimeupdate = () => {
      if (el._sceneEnd && el.currentTime >= el._sceneEnd) {
        if (el._sceneLoop) {
          el.currentTime = el._sceneStart ?? 0
          el.play().catch(() => { setScenePlaying(false); setScenePlayPos(0) })
          setScenePlayPos(0)
        } else {
          el.pause(); el._sceneEnd = null
          setScenePlaying(false); setScenePlayPos(0)
          setSleepMins(null); setSleepSecs(null)
        }
      } else if (el._sceneStart !== undefined && el._sceneEnd) {
        const pos = (el.currentTime - el._sceneStart) / (el._sceneEnd - el._sceneStart)
        setScenePlayPos(Math.min(1, Math.max(0, pos)))
      }
    }

    setAudioFileName(displayName)
    setAudioSource('cloud')
    setAudioReady(false)

    // 先嘗試從 IndexedDB 讀取快取
    getMp3FromIDB(url).then(cachedBlob => {
      if (cachedBlob) {
        // 有快取，直接用 blobURL
        const blobUrl = URL.createObjectURL(cachedBlob)
        el.src = blobUrl
        audioSrcKeyRef.current = url  // 記錄原始 URL
        el.addEventListener('canplay', () => { setAudioReady(true); setAudioFileName('📦 ' + displayName) }, { once: true })
        el.onerror   = () => {
          // blobURL 失效，改用原始 URL
          el.src = url
          el.addEventListener('canplay', () => { setAudioReady(true); setAudioFileName(displayName) }, { once: true })
          el.onerror = () => { setAudioReady(false); setAudioFileName('❌ ' + displayName) }
          el.load()
        }
        el.load()
        return
      }

      // 沒有快取，用網路載入並同時快取
      if (!navigator.onLine) {
        // 離線且沒快取
        setAudioReady(false)
        setAudioFileName('❌ 離線且無快取：' + displayName)
        return
      }

      // 線上：fetch → 存 IDB → 建立 blobURL
      setAudioFileName('⬇️ 下載中：' + displayName)
      fetch(url)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.blob() })
        .then(async blob => {
          await saveMp3ToIDB(url, blob)
          if (url === JERRY_MP3[0].url) setPart1Status('cached')
          if (url === JERRY_MP3[1].url) setPart2Status('cached')
          const blobUrl = URL.createObjectURL(blob)
          el.src = blobUrl
          audioSrcKeyRef.current = url  // 記錄原始 URL
          el.addEventListener('canplay', () => { setAudioReady(true); setAudioFileName('📦 ' + displayName) }, { once: true })
          el.onerror   = () => { setAudioReady(false); setAudioFileName('❌ ' + displayName) }
          el.load()
        })
        .catch(() => {
          // fetch 失敗，直接用 URL（舊行為）
          el.src = url
          audioSrcKeyRef.current = url  // 記錄原始 URL
          el.addEventListener('canplay', () => { setAudioReady(true); setAudioFileName(displayName) }, { once: true })
          el.onerror   = () => { setAudioReady(false); setAudioFileName('❌ ' + displayName) }
          el.load()
        })
    })
  }

  function parseSceneTimeRange(timeRange) {
    // "00:05:57 ~ 00:07:59" 或 "00:08:02,498 ~ 00:10:00,382"
    const parts = timeRange.split(/\s*[~～]\s*/)
    return { start: timeToSecs(parts[0]?.trim()), end: timeToSecs(parts[1]?.trim()) }
  }

  function playSceneAudio() {
    if (!audioElRef.current || !scene) return
    const { start, end } = parseSceneTimeRange(scene.timeRange)
    if (!end || end <= start) return
    clearTimeout(audioStopRef.current)
    window.speechSynthesis?.cancel()
    setPlayingPhraseId(null)
    const el = audioElRef.current
    const targetFile = getJerryMp3(start)
    const offsetStart = start - targetFile.start
    const offsetEnd   = end   - targetFile.start

    function doPlay() {
      el._sceneStart = offsetStart; el._sceneEnd = offsetEnd; el._sceneLoop = sceneLoop
      el.playbackRate = playRate
      el.currentTime = offsetStart
      el.play().catch(() => setScenePlaying(false))
      setScenePlaying(true); setScenePlayPos(0)
    }

    const needSwitch = audioSrcKeyRef.current !== targetFile.url
    if (needSwitch) {
      loadAudioUrl(targetFile.url, `征服情海 Part ${JERRY_MP3.indexOf(targetFile) + 1}`)
      const onReady = () => { doPlay(); el.removeEventListener('canplay', onReady) }
      el.addEventListener('canplay', onReady)
    } else {
      doPlay()
    }
  }

  function stopSceneAudio() {
    if (!audioElRef.current) return
    audioElRef.current.pause()
    audioElRef.current._sceneEnd = null
    setScenePlaying(false); setScenePlayPos(0)
  }
  function deleteScene(sid) {
    const scene = db.movies.find(m => m.id === movieId)?.scenes.find(s => s.id === sid)
    if (!scene) return
    const phraseCount = scene.phrases?.length ?? 0
    const confirmed = window.confirm(`刪除「${scene.name}」？\n此場景共 ${phraseCount} 句將全部刪除，無法復原。`)
    if (!confirmed) return
    saveDb({ ...db, movies: db.movies.map(m => m.id !== movieId ? m : {
      ...m, scenes: m.scenes.filter(s => s.id !== sid)
    })})
    if (sceneId === sid) { setSceneId(null); setView('list') }
  }

  async function retranslatePhrase(phraseId, en) {
    setRetranslatingId(phraseId)
    try {
      const prompt = `把以下英文翻譯成繁體中文，只回傳翻譯結果，不要其他說明：\n${en}`
      const zh = await callAI([{ role:'user', content: prompt }])
      if (zh?.trim()) {
        updateScenePhrases(ps => ps.map(p =>
          p.id === phraseId ? { ...p, zh: zh.trim() } : p
        ))
      }
    } catch(e) {
      alert('翻譯失敗：' + e.message)
    } finally {
      setRetranslatingId(null)
    }
  }

  async function aiRateScene() {
    if (!scene || phrases.length === 0) return
    setAiStarBusy(true)
    try {
      const lines = phrases.map((p, i) => `${i+1}. ${p.en}`)

      const promptBuilder = (chunk, offset) => {
        const numbered = chunk.map((l, i) => l).join('\n')
        const total = lines.length
        const max5 = Math.max(1, Math.floor(total * 0.2))
        const max45 = Math.max(2, Math.floor(total * 0.4))
        return `以下是電影台詞，請翻譯並評分。
每行格式：序號|推薦(1或0)|評分(1-5)|理由(10字內)|繁體中文翻譯

評分標準（嚴格執行，大多數句子應為3星）：
5=必背：完整句，日常對話可直接套用。整場景★5不超過20%（最多${max5}句）。
4=推薦：有學習價值，句型可延伸。★4+★5合計不超過40%（最多${max45}句）。
3=普通：以下一律給3星 → 打招呼/感嘆詞(Wow/Hey/OK/Hi)/稱謂/單字/純劇情推進/短句

只回傳格式內容，不要其他說明。

範例：
${offset+1}|1|5|完整句型可套用|我討厭我自己。
${offset+2}|0|3|打招呼不適合必背|你好，泰森。
${offset+3}|1|4|值得學習的表達|我開始寫一份使命宣言。
${offset+4}|0|3|感嘆詞|哇。

台詞：
${numbered}`
      }

      const lineParser = (raw, offset) => {
        const parsed = {}
        raw.trim().split('\n').forEach(l => {
          const clean = l.trim().replace(/\s+/g, ' ')
          // 格式：序號|推薦|評分|理由|翻譯
          const m = clean.match(/^(\d+)\s*\|\s*([01])\s*\|\s*([1-5])\s*\|\s*(.+?)\s*\|\s*(.+)$/)
          if (m) {
            const globalIdx = parseInt(m[1]) - 1
            if (globalIdx >= 0 && globalIdx < phrases.length) {
              parsed[globalIdx] = {
                starred: m[2] === '1',
                rating: Number(m[3]),
                reason: m[4].trim(),
                zh: m[5].trim()
              }
            }
          }
        })
        return parsed
      }

      const { results, debugInfo } = await callAIChunked(lines, promptBuilder, lineParser, 8)

      const parsed = Object.keys(results).length
      if (parsed === 0) {
        alert(`⚠ 無法解析任何結果\ndebug: ${JSON.stringify(debugInfo)}`)
        return
      }

      updateScenePhrases(ps => ps.map((p, i) =>
        results[i] !== undefined ? { ...p,
          starred: results[i].starred,
          rating: Number(results[i].rating),
          reason: results[i].reason,
          zh: results[i].zh || p.zh  // 有新翻譯就更新，否則保留原有
        } : p
      ))

      const star5 = Object.values(results).filter(u => Number(u.rating) === 5).length
      const star4 = Object.values(results).filter(u => Number(u.rating) === 4).length
      const debugSummary = debugInfo.map(d => `${d.chunk}: ${d.finish_reason} (${d.usage?.completion_tokens ?? '?'}tok)`).join('\n')
      alert(`✅ AI 評分完成（${parsed}/${phrases.length} 句）\n★5 必背：${star5} 句\n★4 推薦：${star4} 句\n\n${debugSummary}`)
    } catch(e) {
      alert('AI 評分失敗：\n' + (e.message ?? String(e)))
    } finally {
      setAiStarBusy(false)
    }
  }
  function addToVocab(word, phonetic, zh, example) {
    if (db.vocab.find(v => v.word.toLowerCase() === word.toLowerCase())) return false
    saveDb({ ...db, vocab:[...db.vocab, { id:'v_'+Date.now(), word, phonetic, zh, example, movieId }] })
    return true
  }
  function deleteVocab(vid) { saveDb({ ...db, vocab: db.vocab.filter(v => v.id !== vid) }) }

  // ── 反向練習：換句子時啟動 2 秒倒數 ─────────────────────────
  useEffect(() => {
    if (view !== 'reverse') return
    setRevFlip(false)
    setFlipCountdown(2)
  }, [revIdx, view])

  useEffect(() => {
    if (flipCountdown === null || flipCountdown <= 0) return
    const t = setTimeout(() => setFlipCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [flipCountdown])

  function toggleHint() {
    const next = !hintOpen
    setHintOpen(next)
    localStorage.setItem('fsi:movie:hintOpen', String(next))
  }
  function retryPhrase() {
    setRevFlip(false)
    setFlipCountdown(2)
  }

  // ── 睡眠計時器倒數 ────────────────────────────────────────────
  useEffect(() => {
    if (sleepSecs === null) return
    if (sleepSecs <= 0) {
      setPlaying(false)
      window.speechSynthesis?.cancel()
      // 停止整段原聲循環
      if (audioElRef.current) {
        audioElRef.current.pause()
        audioElRef.current._sceneEnd = null
        audioElRef.current._sceneLoop = false
      }
      setScenePlaying(false); setScenePlayPos(0)
      setSleepMins(null)
      setSleepSecs(null)
      return
    }
    const t = setTimeout(() => setSleepSecs(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [sleepSecs])

  function startSleep(mins) {
    setSleepMins(mins)
    setSleepSecs(mins * 60)
  }
  function cancelSleep() {
    setSleepMins(null)
    setSleepSecs(null)
  }
  function fmtSleep(secs) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2,'0')}`
  }

  // ── auto-play effect（優先電影原音，fallback TTS）──────────────
  useEffect(() => {
    if (view !== 'play' || !playing || !activePhrases[playIdx]) return
    let cancelled = false
    const p = activePhrases[playIdx]
    const hasTimestamp = p.startSecs > 0 || p.endSecs > 0

    clearTimeout(audioStopRef.current)
    window.speechSynthesis?.cancel()

    function advance() {
      if (cancelled) return
      markPlayed(p.id)
      setTimeout(() => {
        if (cancelled) return
        const next = playIdx + 1
        if (next >= activePhrases.length) { if (looping) setPlayIdx(0); else setPlaying(false) }
        else setPlayIdx(next)
      }, 800)
    }

    if (audioMode === 'original' && audioElRef.current && hasTimestamp) {
      // 電影原音：自動切換正確檔案
      const el = audioElRef.current
      const targetFile = getJerryMp3(p.startSecs)
      const offsetSecs = p.startSecs - targetFile.start

      function playOffset() {
        el.playbackRate = playRate
        el.currentTime = offsetSecs
        el.play().catch(() => { if (!cancelled) setPlaying(false) })
        const dur = Math.max(1, (p.endSecs - p.startSecs)) * 1000 / playRate
        audioStopRef.current = setTimeout(() => { el.pause(); advance() }, dur + 300)
      }

      const needSwitch = audioSrcKeyRef.current !== targetFile.url
      if (needSwitch) {
        // 用 Promise 等待 canplay，不依賴 audioReady state 重新觸發 effect
        const waitCanPlay = new Promise(resolve => {
          const onReady = () => {
            el.removeEventListener('canplay', onReady)
            resolve()
          }
          el.addEventListener('canplay', onReady)
        })
        loadAudioUrl(targetFile.url, `征服情海 Part ${JERRY_MP3.indexOf(targetFile) + 1}`)
        waitCanPlay.then(() => { if (!cancelled) playOffset() })
      } else {
        playOffset()
      }
    } else {
      // TTS fallback
      const u = new SpeechSynthesisUtterance(p.en)
      u.lang = 'en-US'; u.rate = 0.6
      u.onend = () => { if (!cancelled) advance() }
      u.onerror = () => { if (!cancelled) setPlaying(false) }
      window.speechSynthesis?.speak(u)
    }

    return () => {
      cancelled = true
      clearTimeout(audioStopRef.current)
      if (audioElRef.current) audioElRef.current.pause()
      window.speechSynthesis?.cancel()
    }
  }, [view, playing, playIdx])

  // ── word lookup ───────────────────────────────────────────────
  async function lookupWord(phraseId, word, sentence) {
    setInlineLookup({ phraseId, word, sentence, busy: true, info: null })
    setWordBusy(true); setWordInfo(null)
    try {
      const prompt = `For the English word/phrase "${word}" used in: "${sentence}"
Return ONLY a JSON object, no markdown:
{"phonetic":"/IPA/","zh":"中文意思（3~5字）","example":"${sentence}"}`
      const raw = await callAI([{ role:'user', content:prompt }])
      const info = JSON.parse(raw.replace(/```json|```/g,'').trim())
      setInlineLookup(prev => prev?.word === word ? { ...prev, busy: false, info } : prev)
      setWordInfo(info)
    } catch {
      setInlineLookup(prev => prev?.word === word ? { ...prev, busy: false, info: { phonetic:'', zh:'查詢失敗', example:sentence } } : prev)
    }
    finally { setWordBusy(false) }
  }

  async function lookupManualVocab(input) {
    if (!input.trim()) return
    setManualBusy(true); setManualResult(null)
    try {
      const prompt = `For the English word or phrase "${input.trim()}", return ONLY JSON, no markdown:
{"phonetic":"/IPA/","zh":"繁體中文意思（5~15字）","example":"一句自然的英文例句"}`
      const raw = await callAI([{ role:'user', content:prompt }])
      const res = JSON.parse(raw.replace(/```json|```/g,'').trim())
      setManualResult(res)
      setManualExample(res.example ?? '')
    } catch { setManualResult({ phonetic:'', zh:'查詢失敗', example:'' }) }
    finally { setManualBusy(false) }
  }

  // ── 儲存逐字稿到 movie 物件 ──────────────────────────────────
  function saveTranscript(text) {
    saveDb({ ...db, movies: db.movies.map(m =>
      m.id !== movieId ? m : { ...m, transcript: text.trim(), transcriptUpdatedAt: Date.now() }
    )})
  }
  function appendTranscript(text) {
    const existing = movie?.transcript ?? ''
    const merged = existing ? existing + '\n\n' + text.trim() : text.trim()
    // 附加後自動排序去重
    const normalized = normalizeSRT(merged)
    const blocks = normalized.split(/\n{2,}/)
    const seen = new Map()
    for (const block of blocks) {
      const blines = block.trim().split('\n')
      const tsLine = blines.find(l => /\d{2}:\d{2}:\d{2},\d+\s*-->\s*\d{2}:\d{2}:\d{2},\d+/.test(l))
      if (!tsLine) continue
      const key = tsLine.split('-->')[0].trim()
      if (!seen.has(key)) seen.set(key, block.trim())
    }
    const sorted = [...seen.entries()]
      .sort((a, b) => timeToSecs(a[0]) - timeToSecs(b[0]))
      .map(([, v]) => v)
    const cleaned = sorted.join('\n\n')
    saveDb({ ...db, movies: db.movies.map(m =>
      m.id !== movieId ? m : { ...m, transcript: cleaned }
    )})
  }

  function deduplicateTranscript() {
    const raw = movie?.transcript ?? ''
    if (!raw) return 0
    const normalized = normalizeSRT(raw)
    const blocks = normalized.split(/\n{2,}/)
    const seen = new Map() // timestamp → block text
    for (const block of blocks) {
      const blines = block.trim().split('\n')
      const tsLine = blines.find(l => /\d{2}:\d{2}:\d{2},\d+\s*-->\s*\d{2}:\d{2}:\d{2},\d+/.test(l))
      if (!tsLine) continue
      const [tsStart] = tsLine.split('-->')
      const key = tsStart.trim()
      if (!seen.has(key)) seen.set(key, block.trim())
    }
    // 依時間排序
    const sorted = [...seen.entries()]
      .sort((a, b) => timeToSecs(a[0]) - timeToSecs(b[0]))
      .map(([, v]) => v)
    const cleaned = sorted.join('\n\n')
    const removed = blocks.filter(b => b.trim()).length - sorted.length
    saveDb({ ...db, movies: db.movies.map(m =>
      m.id !== movieId ? m : { ...m, transcript: cleaned }
    )})
    return removed
  }

  // ── SRT 格式正規化（支援 → / -> / --> / 空格時間碼）──────────
  function normalizeSRT(raw) {
    return raw
      // 清除 OCR 雜訊：時間碼裡的非數字字元（除 :,. 外）
      .replace(/(\d{2}:\d{2}:\d{2})[^\d:,.\s→\-–—>]+(\d+)/g, '$1,$2')
      // 修正空格時間碼：「00: 10:48」→「00:10:48」、「00:11 :53」→「00:11:53」
      .replace(/(\d{2}):\s+(\d{2})/g, '$1:$2')
      .replace(/(\d{2}:\d{2})\s+:(\d{2})/g, '$1:$2')
      // 統一小數點 → 逗號：00:06:09.218 → 00:06:09,218
      .replace(/(\d{2}:\d{2}:\d{2})\.(\d+)/g, '$1,$2')
      // 統一各種箭頭 → -->（/, →, ->, —>, –>, ——>）
      .replace(/(\d{2}:\d{2}:\d{2},\d+)\s*(?:\/|→|->|—>|–>|——>|--?>)\s*(\d{2}:\d{2}:\d{2},\d+)/g, '$1 --> $2')
      // 處理 em/en dash 開頭的箭頭：00:08:26,855 — 00:08:30,086
      .replace(/(\d{2}:\d{2}:\d{2},\d+)\s*[–—]+\s*(\d{2}:\d{2}:\d{2},\d+)/g, '$1 --> $2')
  }

  // ── 時間字串轉秒數（支援 HH:MM:SS 和 MM:SS）────────────────────
  function timeToSecs(t) {
    if (!t) return 0
    const clean = t.replace(',','.').trim()
    const parts  = clean.split(':').map(parseFloat)
    if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2]
    if (parts.length === 2) return parts[0]*60   + parts[1]
    return 0
  }

  function secsToTimeStr(s) {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = Math.floor(s % 60)
    const hh = String(h).padStart(2,'0')
    const mm = String(m).padStart(2,'0')
    const ss = String(sec).padStart(2,'0')
    return h > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
  }

  function previewSceneTranscript() {
    const savedTranscript = movie?.transcript ?? ''
    if (!savedTranscript.trim()) { alert('請先儲存逐字稿'); return }
    if (!startTime || !endTime)  { alert('請填入時間範圍'); return }
    const lines = extractSRTLines(savedTranscript, startTime, endTime)
    if (lines.length === 0) { alert('此時間範圍內找不到字幕'); return }
    const text = lines.map(l => `[${secsToTimeStr(l.startSecs)}] ${l.text}`).join('\n')
    setExportPreview({ lines, text })
  }

  function doCopy(content, label) {
    const fallback = () => {
      const el = document.createElement('textarea')
      el.value = content
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      showMovieToast(`✅ ${label} 已複製`)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(content)
        .then(() => showMovieToast(`✅ ${label} 已複製`))
        .catch(fallback)
    } else { fallback() }
  }

  function copyTranscriptOnly() {
    if (!exportPreview) return
    doCopy(exportPreview.text, `${exportPreview.lines.length} 行逐字稿`)
  }

  function copyTranscriptWithPrompt() {
    if (!exportPreview) return
    const prompt = `以下是電影《征服情海》（Jerry Maguire）的一段英文台詞，請幫我分析：
1. 重要單字與片語
2. 值得學習的句型與語法
3. 連音與口語說法
4. 整段大意

---
${exportPreview.text}
---`
    doCopy(prompt, `逐字稿＋分析指令（${exportPreview.lines.length} 行）`)
  }

  // ── 直接從 SRT 取出指定時間範圍的每一行（不合併）─────────────
  function extractSRTLines(raw, startTime, endTime) {
    const normalized = normalizeSRT(raw)
    const startSecs  = timeToSecs(startTime)
    const endSecs    = timeToSecs(endTime)
    const lines      = [] // [{text, startSecs, endSecs}]

    const blocks = normalized.split(/\n{2,}/)
    for (const block of blocks) {
      const blines = block.trim().split('\n')
      const tsLine = blines.find(l => /\d{2}:\d{2}:\d{2},\d+\s*-->\s*\d{2}:\d{2}:\d{2},\d+/.test(l))
      if (!tsLine) continue
      const [tsStart, tsEnd] = tsLine.split('-->')
      const lineStart = timeToSecs(tsStart.trim())
      const lineEnd   = timeToSecs((tsEnd ?? '').trim())
      if (lineStart < startSecs - 1 || lineStart > endSecs + 1) continue
      const textLines = blines
        .filter(l => !/^\s*\d+\s*$/.test(l) && !/\d{2}:\d{2}:\d{2}/.test(l))
        .join(' ').replace(/\s+/g, ' ').trim()
      if (textLines.length > 1) lines.push({ text: textLines, startSecs: lineStart, endSecs: lineEnd || lineStart + 3 })
    }
    return lines
  }

  // ── parse SRT scene（Chunk Mode）────────────────────────────
  async function parseScene() {
    const savedTranscript = movie?.transcript ?? ''
    const activeTranscript = savedTranscript || srtText
    if (!activeTranscript.trim()) { setAddErr('請貼上逐字稿'); return }
    if (!startTime || !endTime)   { setAddErr('請填入開始和結束時間'); return }
    if (!savedTranscript && srtText.trim()) saveTranscript(srtText.trim())

    setAddBusy(true); setAddErr(''); setAddPreview(null)
    try {
      // 1. 取出字幕行
      const lineObjects = extractSRTLines(activeTranscript, startTime, endTime)
      if (lineObjects.length === 0) {
        setAddErr(`在 ${startTime}～${endTime} 範圍內找不到字幕行。`)
        setAddBusy(false); return
      }
      const lines = lineObjects.map(l => l.text)

      // 2. 第一批：取場景名（只用前5句）
      const namePrompt = `給你以下英文字幕，只回傳一個中文場景名（6~10字，不要其他文字）：
${lines.slice(0,5).map((l,i)=>`${i+1}. ${l}`).join('\n')}`
      const nameRaw = await callAI([{ role:'user', content: namePrompt }])
      const sceneName = nameRaw.trim().replace(/^\d+[\.|]/, '').trim() || '電影場景'

      // 3. Chunk Mode：翻譯 + 評分 + 推薦
      const translations = {}
      const recommended = {}
      const ratings = {}
      const reasons = {}

      const promptBuilder = (chunk, offset) => {
        const numbered = chunk.map((l, i) => `${offset + i + 1}. ${l}`).join('\n')
        return `翻譯以下英文字幕為繁體中文，並評分。
每行格式：序號|中文翻譯|推薦(1或0)|評分(1-5)|理由(10字內)

評分標準（嚴格執行，大多數句子應為3星）：
5=必背：完整句，日常對話可直接套用。★5不超過20%。
4=推薦：有學習價值，句型可延伸。★4+★5合計不超過40%。
3=普通：打招呼/感嘆詞/稱謂/單字/純劇情推進一律給3星
只回傳格式，不要其他說明。

範例：
${offset+1}|我討厭我自己。|1|5|高頻情感表達
${offset+2}|然後事情發生了。|0|3|純劇情推進
${offset+3}|你好，泰森。|0|3|打招呼

字幕：
${numbered}`
      }

      const lineParser = (raw, offset) => {
        const parsed = {}
        raw.trim().split('\n').forEach(l => {
          const clean = l.trim()
          const m = clean.match(/^(\d+)\s*\|\s*(.+?)\s*\|\s*([01])\s*\|\s*([1-5])\s*\|\s*(.+)$/)
          if (m) {
            const idx = parseInt(m[1]) - 1
            if (idx >= 0 && idx < lines.length) {
              parsed[idx] = {
                zh: m[2].trim(),
                starred: m[3] === '1',
                rating: Number(m[4]),
                reason: m[5].trim()
              }
            }
          } else {
            // 兼容簡化格式：序號|翻譯
            const m2 = clean.match(/^(\d+)\s*\|\s*(.+)$/)
            if (m2) {
              const idx = parseInt(m2[1]) - 1
              if (idx >= 0 && idx < lines.length && !parsed[idx]) {
                parsed[idx] = { zh: m2[2].trim(), starred: false, rating: 3, reason: '' }
              }
            }
          }
        })
        return parsed
      }

      const { results, debugInfo } = await callAIChunked(lines, promptBuilder, lineParser, 8)
      console.log('[parseScene debug]', debugInfo)

      // 合併結果
      lines.forEach((_, i) => {
        if (results[i]) {
          translations[i] = results[i].zh ?? ''
          recommended[i] = results[i].starred ?? false
          ratings[i] = results[i].rating ?? 3
          reasons[i] = results[i].reason ?? ''
        }
      })

      const result = {
        name: sceneName,
        phrases: lines.map((en, i) => ({
          en,
          zh: translations[i] ?? '',
          starred: recommended[i] ?? false,
          rating: ratings[i] ?? 3,
          reason: reasons[i] ?? '',
          startSecs: lineObjects[i]?.startSecs ?? 0,
          endSecs:   lineObjects[i]?.endSecs   ?? 0,
        }))
      }

      setAddPreview(result)
    } catch(e) { setAddErr('AI 翻譯失敗：' + e.message) }
    finally { setAddBusy(false) }
  }

  function confirmAddScene() {
    if (!addPreview) return
    const ns = {
      id: 'scene_'+Date.now(), timeRange:`${startTime} ~ ${endTime}`,
      name: addPreview.name,
      phrases: addPreview.phrases.map((p,i) => ({ id:'ph_'+Date.now()+'_'+i, en:p.en, zh:p.zh, played:false, starred: p.starred ?? false, rating: p.rating ?? 3, reason: p.reason ?? '', startSecs: p.startSecs??0, endSecs: p.endSecs??0 }))
    }
    // 同步產生 Speak 課程，避免 setTimeout 造成 db state 覆蓋問題
    const newDb = { ...db, movies: db.movies.map(m => m.id !== movieId ? m : { ...m, scenes:[...m.scenes, ns] }) }
    saveDb(newDb)
    setSrtText(''); setStartTime(''); setEndTime(''); setAddPreview(null); setView('list')
    // 在新 db 基礎上產生 Speak 課程（直接傳入 newDb，不依賴 React state）
    setTimeout(() => generateSpeakCoursesWithDb(ns, newDb), 300)
  }

  // ── helpers ───────────────────────────────────────────────────
  // ── 電影資料獨立同步 ──────────────────────────────────────────
  async function pushMovieDB() {
    setPushSyncing(true); setMovieSyncMsg('推送中…')
    try {
      const dbToSync = {
        ...db,
        updatedAt: Date.now(),
        movies: db.movies.map(m => {
          const { transcript, ...rest } = m
          return rest
        })
      }
      // 還原真正的逐字稿
      const t0mt = localStorage.getItem('fsi:movie:transcript:0') ?? ''
      const transcriptDB = db.movies
        .filter(m => m.transcript || (m.id === 'jerry_maguire' && t0mt))
        .map((m, i) => ({
          movieId: m.id,
          transcript: (m.transcript === '__REF__' || (!m.transcript && i === 0))
            ? t0mt : m.transcript,
          updatedAt: m.transcriptUpdatedAt ?? Date.now()
        }))
        .filter(t => t.transcript)

      // 推送用 no-cors（手機 Chrome 安全限制）
      const form = new FormData()
      form.append('data', JSON.stringify({ movieDB: dbToSync, transcriptDB }))
      const ctrl1 = new AbortController()
      const t1 = setTimeout(() => ctrl1.abort(), 60000)
      try {
        await fetch(APPS_SCRIPT_URL, { method:'POST', mode:'no-cors', body:form, signal: ctrl1.signal })
      } catch(e) {
        if (e.name === 'AbortError') throw new Error('推送超時，請重試')
        throw e
      } finally { clearTimeout(t1) }

      // 等 2 秒後 GET 確認
      setMovieSyncMsg('確認中…')
      await new Promise(r => setTimeout(r, 2000))
      const ctrl2 = new AbortController()
      const t2 = setTimeout(() => ctrl2.abort(), 30000)
      try {
        const r = await fetch(APPS_SCRIPT_URL, { signal: ctrl2.signal })
        const json = await r.json()
        if (json.movieDB) {
          const mc = db.movies?.length ?? 0
          const sc = db.movies?.reduce((a,m) => a + (m.scenes?.length ?? 0), 0) ?? 0
          const vc = db.vocab?.length ?? 0
          const dataSize = JSON.stringify(dbToSync).length
          setMovieSyncMsg(`✓ 已推送：${mc} 部 · ${sc} 場景 · 單字庫 ${vc} 個 (${Math.round(dataSize/1000)}KB)`)
        } else {
          setMovieSyncMsg('⚠ 已送出，請至 Sheets 確認')
        }
      } catch {
        setMovieSyncMsg('⚠ 已送出，無法確認（請至 Sheets 確認）')
      } finally { clearTimeout(t2) }

    } catch(e) {
      if (e.name === 'AbortError') setMovieSyncMsg('✗ 推送超時，請重試')
      else setMovieSyncMsg('✗ ' + (e.message ?? '網路錯誤'))
    }
    finally { setPushSyncing(false) }
  }

  async function pullMovieDB() {
    setPullSyncing(true); setMovieSyncMsg('讀取中…')
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 30000)
      let json
      try {
        const r = await fetch(APPS_SCRIPT_URL, { signal: ctrl.signal })
        json = await r.json()
      } finally { clearTimeout(t) }
      if (!json.ok) throw new Error(json.error ?? 'Sync failed')
      if (!json.movieDB) throw new Error('Sheets 尚無電影資料，請先推送。')
      const nd = json.movieDB
      const transcriptDB = json.transcriptDB ?? []

      // 診斷 log
      console.log('[pullMovieDB] transcriptDB from Sheets:', transcriptDB.length, '筆')
      transcriptDB.forEach(tr => console.log(`  movieId=${tr.movieId} len=${tr.transcript?.length ?? 0}`))

      // 合併逐字稿：Sheets 有就用 Sheets（同時間戳也用 Sheets），本機有但 Sheets 沒有才保留本機
      const merged = {
        ...nd,
        movies: nd.movies?.map(m => {
          const localMovie  = db.movies?.find(lm => lm.id === m.id)
          const sheetsEntry = transcriptDB.find(tr => tr.movieId === m.id)
          const localTs     = localMovie?.transcriptUpdatedAt ?? 0
          const sheetsTs    = sheetsEntry?.updatedAt ?? 0

          if (sheetsEntry?.transcript?.trim()) {
            // Sheets 有逐字稿：用較新的那個
            if (sheetsTs >= localTs || !localMovie?.transcript?.trim()) {
              return { ...m, transcript: sheetsEntry.transcript, transcriptUpdatedAt: sheetsTs }
            }
            // 本機較新
            return { ...m, transcript: localMovie.transcript, transcriptUpdatedAt: localTs }
          }
          // Sheets 沒有逐字稿：保留本機的
          if (localMovie?.transcript?.trim()) {
            return { ...m, transcript: localMovie.transcript, transcriptUpdatedAt: localTs }
          }
          return m
        }) ?? []
      }

      setDb(merged)
      localStorage.setItem('fsi:movie:db', JSON.stringify(merged))
      const mc = merged.movies?.length ?? 0
      const sc = merged.movies?.reduce((a,m) => a + (m.scenes?.length ?? 0), 0) ?? 0
      const vc = merged.vocab?.length ?? 0
      const tCount = merged.movies?.filter(m => m.transcript?.trim()).length ?? 0
      const tMsg = tCount > 0
        ? ` · 逐字稿 ${tCount} 部已同步`
        : (transcriptDB.length === 0 ? ' · ⚠ Sheets 無逐字稿（請先從有逐字稿的裝置推送）' : ' · 逐字稿同步中')
      setMovieSyncMsg(`✓ 已還原：${mc} 部 · ${sc} 場景 · 單字庫 ${vc} 個${tMsg}`)
    } catch(e) {
      if (e.name === 'AbortError') setMovieSyncMsg('✗ 讀取超時，請重試')
      else setMovieSyncMsg('✗ ' + (e.message ?? 'Sync failed'))
    }
    finally { setPullSyncing(false) }
  }

  // ══ 對話練習 ════════════════════════════════════════════════

  function startConvPractice() {
    const starred = (scene?.phrases ?? []).filter(p => p.starred)
    const sceneDesc = scene?.title ?? 'this scene'
    const keyPhrases = starred.slice(0, 5).map(p => p.en).join(' / ')
    const systemPrompt = `You are an English conversation practice partner helping a Taiwanese adult learner improve their spoken English. 
The learner is practicing a scene from the movie Jerry Maguire: "${sceneDesc}".
Key phrases from this scene: ${keyPhrases || 'general conversation'}.

Rules:
- Start with a simple, friendly opening line related to the scene context
- Adjust your language complexity based on the learner's responses:
  * If they use short/simple sentences → keep your English simple and slow
  * If they respond well → gradually use more natural expressions
- Keep each response to 1-2 sentences max
- Be encouraging and natural
- This is turn 1 of 3 total turns`

    setConvHistory([])
    setConvTurn(0)
    setConvDone(false)
    setConvResult(null)
    setConvInput('')
    setConvBusy(true)
    setConvPractice(true)

    callAI(systemPrompt, 'Start the conversation with one simple opening line related to the scene. Just say the line, nothing else.')
      .then(text => {
        setConvHistory([{ role: 'ai', text: text.trim() }])
        setConvBusy(false)
      })
      .catch(() => setConvBusy(false))
  }

  function startConvListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) { alert('此裝置不支援語音辨識，請用文字輸入'); return }
    const recog = new SpeechRecognition()
    recog.lang = 'en-US'
    recog.interimResults = false
    recog.maxAlternatives = 1
    recog.onresult = e => {
      const text = e.results[0][0].transcript
      setConvInput(prev => (prev ? prev + ' ' + text : text))
      setConvListening(false)
    }
    recog.onerror = () => setConvListening(false)
    recog.onend = () => setConvListening(false)
    convRecogRef.current = recog
    recog.start()
    setConvListening(true)
  }

  function stopConvListening() {
    convRecogRef.current?.stop()
    setConvListening(false)
  }

  async function submitConvTurn() {
    if (!convInput.trim()) return
    const userText = convInput.trim()
    setConvInput('')
    const newHistory = [...convHistory, { role: 'user', text: userText }]
    setConvHistory(newHistory)
    setConvBusy(true)
    const nextTurn = convTurn + 1

    if (nextTurn >= 3) {
      // 最後一輪 → 請 AI 給評分
      setConvTurn(nextTurn)
      setConvDone(true)
      const dialogue = newHistory.map(h => `${h.role === 'ai' ? 'AI' : 'Learner'}: ${h.text}`).join('\n')
      const evalPrompt = `You evaluated an English conversation practice session. Here is the full dialogue:

${dialogue}

Please evaluate the learner's responses (not the AI's) and provide:
1. A naturalness score from 1-5 stars
2. A sentence completeness score from 1-5 stars  
3. A relevance score from 1-5 stars
4. For each of the learner's turns, suggest a more natural way to say it (keep suggestions simple and encouraging)
5. One overall encouraging comment

Respond in JSON format only:
{"naturalness": 3, "completeness": 4, "relevance": 4, "suggestions": ["turn1 suggestion", "turn2 suggestion", "turn3 suggestion"], "comment": "..."}`
      try {
        const raw = await callAI('You are an English teacher evaluator. Return only valid JSON.', evalPrompt)
        const clean = raw.replace(/```json|```/g, '').trim()
        const result = JSON.parse(clean)
        setConvResult(result)
      } catch {
        setConvResult({ naturalness: 3, completeness: 3, relevance: 3, suggestions: [], comment: 'Great effort! Keep practicing!' })
      }
      setConvBusy(false)
    } else {
      // 繼續對話
      setConvTurn(nextTurn)
      const prevResponses = newHistory.filter(h => h.role === 'user')
      const complexity = prevResponses.length > 0 && prevResponses[prevResponses.length-1].text.split(' ').length > 8
        ? 'intermediate' : 'simple'
      const dialogue = newHistory.map(h => `${h.role === 'ai' ? 'AI' : 'Learner'}: ${h.text}`).join('\n')
      try {
        const reply = await callAI(
          `You are a conversation practice partner. Use ${complexity} English. This is turn ${nextTurn + 1} of 3.`,
          `Continue this conversation naturally with one short response (1-2 sentences):
${dialogue}

Your response only:`
        )
        setConvHistory([...newHistory, { role: 'ai', text: reply.trim() }])
      } catch { /* silent */ }
      setConvBusy(false)
    }
  }

  // ══ 場景重述 ════════════════════════════════════════════════

  const retellAccumRef = useRef('')   // 跨段累積文字
  const retellActiveRef = useRef(false) // 是否應該繼續辨識

  function toggleRetellListening() {
    if (retellListening) {
      // 使用者主動停止
      retellActiveRef.current = false
      retellRecogRef.current?.stop()
      setRetellListening(false)
      return
    }
    retellAccumRef.current = ''
    retellActiveRef.current = true
    setRetellInput('')
    startOneRetellSession()
    setRetellListening(true)
  }

  function startOneRetellSession() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return
    const recog = new SpeechRecognition()
    recog.lang = 'en-US'
    recog.continuous = false      // 每段獨立，避免 Android 重複 bug
    recog.interimResults = false  // 只取 final，乾淨無重複
    recog.maxAlternatives = 1
    recog.onresult = e => {
      const text = e.results[0][0].transcript.trim()
      if (text) {
        retellAccumRef.current += (retellAccumRef.current ? ' ' : '') + text
        setRetellInput(retellAccumRef.current)
      }
    }
    recog.onerror = e => {
      if (e.error === 'aborted') return
      // 其他錯誤（no-speech 等）→ 若仍在錄音中就自動重啟
      if (retellActiveRef.current) setTimeout(startOneRetellSession, 300)
    }
    recog.onend = () => {
      // 自動重啟，直到使用者點停止
      if (retellActiveRef.current) setTimeout(startOneRetellSession, 200)
    }
    retellRecogRef.current = recog
    recog.start()
  }

  function addRetellSegment() {
    if (!retellInput.trim()) return
    setRetellSegments(prev => [...prev, retellInput.trim()])
    setRetellInput('')
  }

  async function finishRetell() {
    // 自動把輸入框裡還沒按「加入」的文字也一起帶入
    let segs = retellSegments
    if (retellInput.trim()) {
      segs = [...retellSegments, retellInput.trim()]
      setRetellSegments(segs)
      setRetellInput('')
    }
    const allText = segs.join(' ')
    if (!allText.trim()) { alert('請先說幾句話再結束'); return }
    setRetellDone(true)
    setRetellBusy(true)
    const sceneDesc = scene?.title ?? 'a movie scene'
    const starred = (scene?.phrases ?? []).filter(p => p.starred)
    const keyPhrases = starred.slice(0, 5).map(p => p.en).join(' / ')
    const segList = segs.map((s, i) => `${i+1}. "${s}"`).join('\n')
    const prompt = `A Taiwanese adult English learner retold a Jerry Maguire scene called "${sceneDesc}".
Key phrases from this scene: ${keyPhrases || 'general conversation'}.

The learner said (${segs.length} segment(s)):
${segList}

Please evaluate and respond in JSON only. Be specific — reference the learner's EXACT words in your corrections:
{
  "naturalness": <1-5>,
  "coverage": <1-5>,
  "corrections": [
    {"original": "<exact words learner said>", "better": "<more natural version>", "tip": "<one short reason why, in simple English>"}
  ],
  "extra_phrases": ["<1-2 useful phrases from the scene they could add next time>"],
  "comment": "<one encouraging sentence in English>"
}`
    try {
      const se = getAISettings()
      const sysPrompt = 'You are an encouraging English teacher. Return only valid JSON. Always include corrections array with specific feedback referencing the learner exact words.'
      let rawText = ''
      if ((se.aiProvider ?? 'anthropic') === 'anthropic' && se.anthropicKey) {
        // 直接呼叫 Claude API，max_tokens 加大到 2000
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': se.anthropicKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2000,
            system: sysPrompt,
            messages: [{ role: 'user', content: prompt }]
          })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error?.message ?? 'API error ' + r.status)
        rawText = d.content?.[0]?.text ?? ''
      } else {
        // Gemini / GPT fallback：system 在前，prompt 在後
        rawText = await callAI(sysPrompt, prompt)
      }
      const clean = rawText.replace(/```json|```/g, '').trim()
      try {
        const result = JSON.parse(clean)
        setRetellResult(result)
      } catch {
        setRetellResult({ naturalness: 3, coverage: 3, corrections: [], extra_phrases: [], comment: '(parse error) ' + clean.slice(0, 200) })
      }
    } catch(e) {
      setRetellResult({ naturalness: 0, coverage: 0, corrections: [], extra_phrases: [], comment: '⚠ 連線失敗：' + (e?.message ?? '請重試') })
    }
    setRetellBusy(false)
  }

  function resetRetell() {
    setRetellMode(false)
    setRetellSegments([])
    setRetellInput('')
    setRetellDone(false)
    setRetellResult(null)
    setRetellBusy(false)
  }

  function resetConv() {
    setConvPractice(false)
    setConvHistory([])
    setConvTurn(0)
    setConvDone(false)
    setConvResult(null)
    setConvInput('')
    setConvBusy(false)
  }

  // ══ Speak 課程產生 ══════════════════════════════════════════

  // generateSpeakCoursesWithDb：接受明確的 db 參數，避免 React state 競爭
  async function generateSpeakCoursesWithDb(sc, explicitDb) {
    const targetScene = sc ?? scene
    if (!targetScene) return
    setSpeakBusy(true)
    setSpeakOpen(true)
    const sceneTitle = targetScene.name ?? targetScene.title ?? 'this scene'
    const allPhrases = targetScene.phrases ?? []
    const starred = allPhrases.filter(p => p.starred)
    const pool = starred.length >= 5 ? starred : allPhrases
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    const easyPool = shuffled.filter(p => p.en.split(' ').length <= 10)
    const easySentences = easyPool.length >= 4 ? easyPool.slice(0, 7) : shuffled.slice(0, 7)
    const advanced = shuffled.slice(0, 10)
    const speakMyRole = 'Rod Tidwell, an NFL player'
    const speakAIRole = 'Jerry Maguire, my sports agent'
    const buildSpeak = (phrases) => {
      const nums = phrases.map((p, i) => (i+1) + '. "' + p.en + '"').join('\n')
      return 'We are in the scene "' + sceneTitle + '". You are frustrated and want more money and respect.\n\n' +
        'IMPORTANT: Your ONLY job is to deliver the phrases below one at a time in order. After each phrase, wait for my response. Do NOT improvise. Do NOT ask questions. Do NOT change topic. Do NOT end until ALL phrases are delivered.\n\n' +
        'Deliver one phrase per turn:\n' + nums + '\n\nBegin with phrase 1.'
    }
    const keyPhrases = easySentences.slice(0, 5).map(p => p.en).join(', ')
    const buildChatGPTPrompt = (phrases) => {
      const nums = phrases.map((p, i) => (i+1) + '. ' + p.en).join('\n')
      const firstPhrase = phrases.length > 0 ? phrases[0].en : ''
      return 'You are my FSI English Coach.\n\n' +
        'Student Profile:\n' +
        '- 55-year-old Taiwanese adult\n' +
        '- English level: Intermediate-Beginner\n' +
        '- Works in Vietnam factory management\n' +
        '- Goal: Speak English automatically in meetings and daily conversations\n\n' +
        'Teaching Method:\n' +
        'Use FSI-style drills only.\n' +
        'Do NOT explain grammar unless necessary.\n' +
        'Do NOT ask discussion questions.\n' +
        'Do NOT ask movie analysis questions.\n' +
        'Do NOT ask personal opinion questions.\n\n' +
        'Focus on: Repetition / Substitution / Transformation / Automatic speaking\n\n' +
        'Rules:\n' +
        '- Speak very slowly.\n' +
        '- Use simple English only.\n' +
        '- One instruction at a time.\n' +
        '- Wait for my answer.\n' +
        '- Correct only major mistakes.\n' +
        '- Keep responses under 15 words.\n' +
        '- No long explanations.\n' +
        '- No Chinese.\n\n' +
        'STEP 1 - Repeat: Read the sentence slowly. Ask me to repeat.\n\n' +
        'STEP 2 - Substitution Drill: Change one word. Wait for my answer. Do 5-10 substitutions.\n\n' +
        'STEP 3 - Transformation Drill: Change I / You / We / They / Present / Past / Future\n\n' +
        'STEP 4 - Vietnam Factory Drill: Create 5 examples related to Quality / Customer complaint / Production / Meeting / Teamwork\n\n' +
        'STEP 5 - Speed Round: Ask 5 rapid substitutions. Then move to the next phrase.\n\n' +
        'Movie: Jerry Maguire\n' +
        'Scene: ' + sceneTitle + '\n' +
        'Phrases:\n' + nums + '\n\n' +
        'Start immediately. Do not explain. Do not analyze. Only drill.'
    }
    const chatgptEasy     = buildChatGPTPrompt(easySentences)
    const chatgptAdvanced = buildChatGPTPrompt(advanced)
    const speakEasy = buildSpeak(easySentences)
    const speakAdvanced = buildSpeak(advanced)
    const baseDb = explicitDb ?? db
    saveDb({
      ...baseDb,
      movies: baseDb.movies.map(m => m.id !== movieId ? m : {
        ...m,
        scenes: m.scenes.map(s => s.id !== targetScene.id ? s : {
          ...s, speakMyRole, speakAIRole, speakEasy, speakAdvanced, chatgptEasy, chatgptAdvanced
        })
      })
    })
    setSpeakBusy(false)
  }

  async function generateSpeakCourses(sc) {
    return generateSpeakCoursesWithDb(sc, null)
  }


  async function generateSpeakCourses_old(sc) {
    const targetScene = sc ?? scene
    if (!targetScene) return
    setSpeakBusy(true)
    setSpeakOpen(true)
    const sceneTitle = targetScene.name ?? targetScene.title ?? 'this scene'
    const allPhrases = targetScene.phrases ?? []
    const starred = allPhrases.filter(p => p.starred)
    const pool = starred.length >= 5 ? starred : allPhrases
    // 隨機打亂
    const shuffled = [...pool].sort(() => Math.random() - 0.5)

    // 🟢 簡單組：10字以內高頻短句，7句
    const easyPool = shuffled.filter(p => p.en.split(' ').length <= 10)
    const easySentences = easyPool.length >= 4 ? easyPool.slice(0, 7) : shuffled.slice(0, 7)
    // 🟡 進階組：所有重點句，10句
    const advanced = shuffled.slice(0, 10)

    // Speak 格式
    // Speak 三欄格式：你的角色、AI角色、情境描述分開
    const speakMyRole  = 'Rod Tidwell, an NFL player'
    const speakAIRole  = 'Jerry Maguire, my sports agent'
    const buildSpeak = (phrases) => {
      const nums = phrases.map((p, i) => (i+1) + '. "' + p.en + '"').join('\n')
      return 'We are on a phone call about Rod\'s contract. Scene: "' + sceneTitle + '".\n' +
        'You are frustrated and want more money and respect.\n\n' +
        'Your ONLY job each turn: say the next phrase from the list below exactly as written, then wait for my response. Do NOT end the conversation until ALL phrases are used. Do NOT ask questions. Do NOT add other topics. Do NOT say goodbye until the last phrase is done.\n\n' +
        'Phrase list (say one per turn, in order):\n' +
        nums + '\n\nStart with phrase 1 now.'
    }

    // ChatGPT 格式
    // ChatGPT 格式：場景導入陪練模式（不是句子清單）
    // 一個指令就夠，讓 ChatGPT 自由追問
    const keyPhrases = easySentences.slice(0, 5).map(p => p.en).join(', ')
    const chatgptPrompt =
      'You are my English coach. I am a Taiwanese adult learning English through the movie Jerry Maguire.\n\n' +
      'I just studied this scene: "' + sceneTitle + '"\n\n' +
      'Please do the following:\n' +
      '1. First ask me: "What happened in this scene? Tell me in your own words."\n' +
      '2. After I answer, ask 2-3 natural follow-up questions about the scene or characters.\n' +
      '3. Then naturally bring these key phrases into the conversation (one at a time): ' + keyPhrases + '\n' +
      '4. Correct my English naturally after each response — do not let errors pass.\n' +
      '5. Keep the conversation going. Do NOT let me use Chinese.\n\n' +
      'Start now with step 1.'

    const speakEasy     = buildSpeak(easySentences)
    const speakAdvanced = buildSpeak(advanced)
    const chatgptEasy   = chatgptPrompt
    const chatgptAdvanced = chatgptPrompt  // 同一個 prompt，ChatGPT 會自動調整難度

    // 存進場景資料
    saveDb({
      ...db,
      movies: db.movies.map(m => m.id !== movieId ? m : {
        ...m,
        scenes: m.scenes.map(s => s.id !== targetScene.id ? s : {
          ...s,
          speakMyRole,
          speakAIRole,
          speakEasy,
          speakAdvanced,
          chatgptEasy,
          chatgptAdvanced
        })
      })
    })
    setSpeakBusy(false)
  }

  function copyChatGPTWithTranscript() {
    const transcript = movie?.transcript ?? ''
    if (!transcript.trim()) {
      alert('請先儲存逐字稿（電影 Tab → 貼上新逐字稿）')
      return
    }
    if (!scene?.timeRange) {
      alert('此場景沒有時間範圍')
      return
    }
    const { start, end } = parseSceneTimeRange(scene.timeRange)
    const lines = extractSRTLines(transcript, secsToTimeStr(start), secsToTimeStr(end))
    if (lines.length === 0) {
      alert('此時間範圍找不到逐字稿內容，請確認逐字稿已儲存')
      return
    }
    const transcriptText = lines.map(l => '[' + secsToTimeStr(l.startSecs) + '] ' + l.text).join('\n')
    const starred = (scene?.phrases ?? []).filter(p => p.starred)
    const keyPhrases = starred.slice(0, 5).map(p => p.en).join(', ')

    const prompt =
      'You are my FSI English Coach.\n\n' +
      'Student Profile:\n' +
      '- 55-year-old Taiwanese adult\n' +
      '- English level: Intermediate-Beginner\n' +
      '- Works in Vietnam factory management\n' +
      '- Goal: Speak English automatically in meetings and daily conversations\n\n' +
      'Teaching Method:\n' +
      'Use FSI-style drills only.\n' +
      'Do NOT explain grammar unless necessary.\n' +
      'Do NOT ask discussion questions.\n' +
      'Do NOT ask movie analysis questions.\n' +
      'Do NOT ask personal opinion questions.\n\n' +
      'Focus on: Repetition / Substitution / Transformation / Automatic speaking\n\n' +
      'Rules:\n' +
      '- Speak very slowly.\n' +
      '- Use simple English only.\n' +
      '- One instruction at a time.\n' +
      '- Wait for my answer.\n' +
      '- Correct only major mistakes.\n' +
      '- Keep responses under 15 words.\n' +
      '- No long explanations.\n' +
      '- No Chinese.\n\n' +
      'STEP 1 - Repeat: Read the sentence slowly. Ask me to repeat.\n\n' +
      'STEP 2 - Substitution Drill: Change one word. Wait for my answer. Do 5-10 substitutions.\n\n' +
      'STEP 3 - Transformation Drill: Change I / You / We / They / Present / Past / Future\n\n' +
      'STEP 4 - Vietnam Factory Drill: Create 5 examples related to Quality / Customer complaint / Production / Meeting / Teamwork\n\n' +
      'STEP 5 - Speed Round: Ask 5 rapid substitutions. Then move to the next phrase.\n\n' +
      'Movie: Jerry Maguire\n' +
      'Scene: ' + (scene?.name ?? scene?.title ?? '') + '\n' +
      'Transcript:\n---\n' + transcriptText + '\n---\n\n' +
      'Key phrases:\n' + (keyPhrases || 'see transcript above') + '\n\n' +
      'Start immediately. Do not explain. Do not analyze. Only drill.'

    const fallback = () => {
      const el = document.createElement('textarea'); el.value = prompt
      document.body.appendChild(el); el.select()
      document.execCommand('copy'); document.body.removeChild(el)
      showMovieToast('✅ 指令已複製，貼至 ChatGPT')
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(prompt)
        .then(() => { setSpeakCopied('cgpt_transcript'); setTimeout(() => setSpeakCopied(null), 2000) })
        .catch(fallback)
    } else { fallback() }
  }

  function copySpeak(type) {
    const textMap = {
      easy:          scene?.speakEasy,
      advanced:      scene?.speakAdvanced,
      cgpt_easy:     scene?.chatgptEasy,
      cgpt_advanced: scene?.chatgptAdvanced,
    }
    const text = textMap[type]
    if (!text) return
    const fallback = () => {
      const el = document.createElement('textarea'); el.value = text
      document.body.appendChild(el); el.select()
      document.execCommand('copy'); document.body.removeChild(el)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setSpeakCopied(type); setTimeout(() => setSpeakCopied(null), 2000)
      }).catch(fallback)
    } else { fallback(); setSpeakCopied(type); setTimeout(() => setSpeakCopied(null), 2000) }
  }

  // ── 睡眠計時器倒數 useEffect ──
  useEffect(() => {
    if (!starSleepEnd) { setStarSleepRemain(null); return }
    const tick = () => {
      const rem = Math.max(0, Math.ceil((starSleepEnd - Date.now()) / 1000))
      setStarSleepRemain(rem)
      if (rem <= 0) setStarSleepEnd(null)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [starSleepEnd])

  // ── 浮動返回鍵：掛到 body，starred view 時顯示 ──
  useEffect(() => {
    const btn = document.createElement('div')
    btn.id = 'star-back-btn'
    btn.textContent = '← 返回'
    Object.assign(btn.style, {
      position: 'fixed',
      top: '60px',
      left: '16px',
      zIndex: '9999',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      fontFamily: 'monospace',
      fontSize: '13px',
      fontWeight: '700',
      color: '#f5a623',
      background: '#2a1f00',
      border: '1.5px solid #f5a62360',
      borderRadius: '10px',
      padding: '8px 14px',
      userSelect: 'none',
    })
    document.body.appendChild(btn)
    backBtnRef.current = btn
    return () => { btn.remove() }
  }, [])

  // ── 浮動返回鍵：view===starred 時顯示，點擊返回 list ──
  useEffect(() => {
    const btn = backBtnRef.current
    if (!btn) return
    if (view === 'starred') {
      btn.style.display = 'flex'
      const handler = () => { setView('list'); setPlaying(false); window.speechSynthesis?.cancel() }
      btn.addEventListener('click', handler)
      return () => btn.removeEventListener('click', handler)
    } else {
      btn.style.display = 'none'
    }
  }, [view])

  // ── FAB 浮動按鈕：直接掛到 document.body，繞過 overflow 截斷問題 ──
  useEffect(() => {
    // 建立 FAB element
    const fab = document.createElement('div')
    fab.id = 'star-loop-fab'
    Object.assign(fab.style, {
      position: 'fixed',
      bottom: '88px',
      left: '20px',
      zIndex: '9999',
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      fontSize: '22px',
      userSelect: 'none',
      fontFamily: 'monospace',
      transition: 'background 0.2s, box-shadow 0.2s',
      border: '2px solid',
    })
    document.body.appendChild(fab)
    fabRef.current = fab
    return () => { fab.remove() }
  }, [])

  // ── FAB 狀態同步 ──
  useEffect(() => {
    const fab = fabRef.current
    if (!fab) return
    if (starLoopMode != null) {
      const color = starLoopPaused ? '#22c55e' : '#f59e0b'
      fab.style.display = 'flex'
      fab.style.background = color
      fab.style.boxShadow = '0 4px 16px ' + color + '60'
      fab.style.borderColor = color + '80'
      fab.textContent = starLoopPaused ? '▶' : '⏸'
    } else {
      fab.style.display = 'none'
    }
  }, [starLoopMode, starLoopPaused])

  // ── FAB 點擊事件（用 ref 避免 stale closure）──
  useEffect(() => {
    const fab = fabRef.current
    if (!fab) return
    const handler = () => {
      if (starLoopPausedRef.current) { if (resumeFnRef.current) resumeFnRef.current() }
      else { if (pauseFnRef.current) pauseFnRef.current() }
    }
    fab.addEventListener('click', handler)
    return () => fab.removeEventListener('click', handler)
  }, [])

  function goBack(to='list') { setView(to); setPlaying(false); window.speechSynthesis?.cancel() }

  const BackBtn = ({ label='← 返回', to='list' }) => (
    <span onClick={() => goBack(to)}
      style={{ cursor:'pointer', fontFamily:MONO, fontSize:13, fontWeight:700,
        color:T.amber, display:'inline-flex', alignItems:'center', gap:4,
        padding:'6px 12px', background:T.amberD, borderRadius:9,
        border:`1px solid ${T.amber}50` }}>
      {label}
    </span>
  )

  const Chip = ({ on, onClick, children }) => (
    <div onClick={onClick} style={{ cursor:'pointer', fontFamily:MONO, fontSize:9,
      padding:'4px 12px', borderRadius:10, transition:'all 0.13s',
      background: on ? T.amberD : T.surf2, border:`1px solid ${on ? T.amber+'60' : T.bdr}`,
      color: on ? T.amber : T.txt3 }}>
      {children}
    </div>
  )

  // ══════════════════════════════════════════════════════════════
  // VOCAB VIEW
  // ══════════════════════════════════════════════════════════════
  if (view === 'vocab') return (
    <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:12 }} className="fadeUp">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <BackBtn label="← 返回句子" to="scene"/>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontFamily:MONO, fontSize:11, color:T.amber }}>📖 單字庫 · {db.vocab.length} 個</span>
          <div onClick={() => { setManualOpen(o=>!o); setManualInput(''); setManualResult(null); setManualExample('') }}
            style={{ cursor:'pointer', fontFamily:MONO, fontSize:10, fontWeight:700,
              padding:'4px 12px', borderRadius:8, transition:'all 0.15s',
              background: manualOpen ? T.amber : T.surf2,
              border:`1px solid ${manualOpen ? T.amber : T.bdr}`,
              color: manualOpen ? T.bg : T.txt2 }}>
            {manualOpen ? '✕ 關閉' : '＋ 新增'}
          </div>
        </div>
      </div>

      {/* ── 手動新增表單 ── */}
      {manualOpen && (
        <div style={{ background:T.surf, border:`1px solid ${T.bdr2}`, borderRadius:14,
          padding:'16px', display:'flex', flexDirection:'column', gap:12 }} className="fadeUp">
          <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
            可輸入單字、片語、動詞片語
          </div>
          {/* 輸入 + 查詢 */}
          <div style={{ display:'flex', gap:8 }}>
            <input value={manualInput}
              onChange={e => { setManualInput(e.target.value); setManualResult(null) }}
              onKeyDown={e => e.key==='Enter' && lookupManualVocab(manualInput)}
              placeholder="cover / print up / in the middle of the night"
              style={{ flex:1, fontFamily:MONO, fontSize:12, background:T.surf2,
                border:`1px solid ${manualInput ? T.bdr2 : T.bdr}`,
                borderRadius:8, padding:'9px 12px', color:T.txt, outline:'none' }}/>
            <div onClick={() => lookupManualVocab(manualInput)}
              style={{ cursor:'pointer', padding:'9px 14px', borderRadius:8,
                background: manualBusy ? T.surf2 : T.blueD,
                border:`1px solid ${manualBusy ? T.bdr : T.blue+'50'}`,
                fontFamily:MONO, fontSize:10, color: manualBusy ? T.txt3 : T.blue,
                display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
              {manualBusy
                ? <span style={{ display:'inline-block', width:8, height:8,
                    border:'1.5px solid transparent', borderTopColor:T.txt3,
                    borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                : '🔍'}
              {manualBusy ? '查詢中' : 'AI 查'}
            </div>
          </div>
          {/* 查詢結果 */}
          {manualResult && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }} className="fadeUp">
              <div style={{ display:'flex', alignItems:'baseline', gap:10, flexWrap:'wrap' }}>
                <span style={{ fontFamily:MONO, fontSize:16, color:T.amber, fontWeight:700 }}>
                  {manualInput.trim()}
                </span>
                <span style={{ fontFamily:MONO, fontSize:11, color:T.txt3 }}>
                  {manualResult.phonetic}
                </span>
              </div>
              <div style={{ fontFamily:MONO, fontSize:13, color:T.txt2 }}>{manualResult.zh}</div>
              {/* 例句（可編輯） */}
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>例句（可修改）</span>
                <input value={manualExample}
                  onChange={e => setManualExample(e.target.value)}
                  style={{ fontFamily:MONO, fontSize:11, background:T.surf2,
                    border:`1px solid ${T.bdr}`, borderRadius:8,
                    padding:'8px 10px', color:T.txt, outline:'none' }}/>
              </div>
              <div onClick={() => {
                  const word = manualInput.trim()
                  if (!word) return
                  const ok = addToVocab(word, manualResult.phonetic, manualResult.zh, manualExample)
                  if (ok) { setManualOpen(false); setManualInput(''); setManualResult(null) }
                  else alert('已存在單字庫')
                }}
                style={{ background:T.amber, borderRadius:10, padding:'11px',
                  textAlign:'center', cursor:'pointer',
                  fontFamily:MONO, fontSize:11, fontWeight:700, color:T.bg }}>
                ＋ 加入單字庫
              </div>
            </div>
          )}
        </div>
      )}

      {/* 空狀態 */}
      {db.vocab.length === 0 && !manualOpen && (
        <div style={{ textAlign:'center', padding:'40px 0', fontFamily:MONO, fontSize:11, color:T.txt3, lineHeight:2 }}>
          點句子中的單字自動加入<br/>或點右上角「＋ 新增」手動輸入
        </div>
      )}

      {/* 單字列表 */}
      {db.vocab.map(v => (
        <div key={v.id} style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:12, padding:'14px 16px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
            <span style={{ fontFamily:MONO, fontSize:15, color:T.amber, fontWeight:700 }}>{v.word}</span>
            <span style={{ fontFamily:MONO, fontSize:10, color:T.txt3 }}>{v.phonetic}</span>
            <div onClick={() => speakPhrase('vocab_'+v.id, v.word)}
              style={{ cursor:'pointer', width:24, height:24, borderRadius:6,
                display:'flex', alignItems:'center', justifyContent:'center',
                background: playingPhraseId==='vocab_'+v.id ? T.amber+'22' : T.surf2,
                border:`1px solid ${playingPhraseId==='vocab_'+v.id ? T.amber : T.bdr}`,
                transition:'all 0.15s' }}>
              <span style={{ fontSize:12 }}>{playingPhraseId==='vocab_'+v.id ? '⏹' : '🔊'}</span>
            </div>
            <span onClick={() => deleteVocab(v.id)}
              style={{ marginLeft:'auto', cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.txt3,
                padding:'1px 6px', background:T.surf2, borderRadius:5, border:`1px solid ${T.bdr}` }}>✕</span>
          </div>
          <div style={{ fontFamily:MONO, fontSize:12, color:T.txt2, marginBottom:5 }}>{v.zh}</div>
          <div style={{ fontFamily:MONO, fontSize:10, color:T.txt3, fontStyle:'italic', lineHeight:1.7 }}>{v.example}</div>
        </div>
      ))}
    </div>
  )

  // ══════════════════════════════════════════════════════════════
  // MANAGE TRANSCRIPT + ADD SCENE（合併一頁）
  // ══════════════════════════════════════════════════════════════
  if (view === 'manageTranscript') {
    const hasSaved = !!(movie?.transcript?.trim())
    const canParse = hasSaved && startTime && endTime  // 以已存逐字稿為準
    return (
    <div style={{ padding:'16px 16px 80px', display:'flex', flexDirection:'column', gap:12 }} className="fadeUp">

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <BackBtn label="← 返回" to="list"/>
        <span style={{ fontFamily:MONO, fontSize:11, color:T.amber }}>＋ 新增場景</span>
      </div>

      {/* ── 區塊一：逐字稿 ── */}
      <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:13,
        padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>

        {/* 標題列 */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:MONO, fontSize:10, color:T.txt2, fontWeight:700 }}>
            📄 逐字稿
            {hasSaved && <span style={{ color:T.grn, marginLeft:6 }}>✓ {movie.transcript.length.toLocaleString()} 字元</span>}
          </span>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {hasSaved && !transcriptEditMode && (
              <div onClick={() => {
                  const n = deduplicateTranscript()
                  alert(n > 0 ? `✅ 已清除 ${n} 個重複段落` : '✓ 無重複，已排序')
                }}
                style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.blue,
                  padding:'3px 9px', background:T.blueD, borderRadius:6,
                  border:`1px solid ${T.blue}50` }}>
                🧹 去除重複
              </div>
            )}
            {hasSaved && (
              <div onClick={() => { setTranscriptEditMode(!transcriptEditMode); setTranscriptDraft('') }}
                style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                  color: transcriptEditMode ? T.txt3 : T.amber,
                  padding:'3px 9px', background: transcriptEditMode ? T.surf2 : T.amberD,
                  borderRadius:6, border:`1px solid ${transcriptEditMode ? T.bdr : T.amber+'50'}` }}>
                {transcriptEditMode ? '✕ 取消編輯' : '✏️ 附加/取代'}
              </div>
            )}
            {transcriptEditMode && transcriptDraft.trim() && (
              <span onClick={() => setTranscriptDraft('')}
                style={{ fontFamily:MONO, fontSize:9, color:T.red, cursor:'pointer', padding:'3px 6px' }}>清除</span>
            )}
          </div>
        </div>

        {/* 唯讀模式：顯示已存逐字稿供查閱時間碼 */}
        {!transcriptEditMode && (
          <>
            {hasSaved ? (
              <textarea
                readOnly
                value={movie.transcript}
                rows={12}
                style={{ fontFamily:MONO, fontSize:10, background:T.surf2,
                  border:`1px solid ${T.bdr}`, borderRadius:10, padding:'12px',
                  color:T.txt2, resize:'none', outline:'none', lineHeight:1.7,
                  boxSizing:'border-box', width:'100%', cursor:'default',
                  opacity:0.85 }}
              />
            ) : (
              <div style={{ fontFamily:MONO, fontSize:10, color:T.txt3, padding:'12px',
                background:T.surf2, borderRadius:10, border:`1px solid ${T.bdr}` }}>
                尚未存入逐字稿，請點「✏️ 貼上新逐字稿」
              </div>
            )}
            {!hasSaved && (
              <div onClick={() => setTranscriptEditMode(true)}
                style={{ cursor:'pointer', fontFamily:MONO, fontSize:10, fontWeight:700,
                  color:T.amber, padding:'10px', background:T.amberD,
                  borderRadius:9, border:`1px solid ${T.amber}50`, textAlign:'center' }}>
                ✏️ 貼上新逐字稿
              </div>
            )}
          </>
        )}

        {/* 編輯模式：貼新內容附加或取代 */}
        {transcriptEditMode && (
          <>
            {hasSaved && (
              <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
                已存 {(movie.transcript?.length ?? 0).toLocaleString()} 字元
                {transcriptDraft.trim() ? `　本頁 ${transcriptDraft.length.toLocaleString()} 字元` : ''}
              </div>
            )}
            <textarea
              value={transcriptDraft}
              onChange={e => setTranscriptDraft(e.target.value)}
              rows={10}
              placeholder={'貼上新的 SRT 逐字稿內容...\n\n00:05:34,303 --> 00:05:55,885\nDo you know your name?'}
              style={{ fontFamily:MONO, fontSize:10, background:T.surf2,
                border:`1px solid ${transcriptDraft.trim() ? T.grn+'60' : T.bdr}`,
                borderRadius:10, padding:'12px', color:T.txt, resize:'none',
                outline:'none', lineHeight:1.7, boxSizing:'border-box', width:'100%' }}
            />
            {transcriptDraft.trim() && (
              <div style={{ display:'flex', gap:8 }}>
                {hasSaved && (
                  <div onClick={() => { appendTranscript(transcriptDraft); setTranscriptDraft(''); setTranscriptEditMode(false) }}
                    style={{ flex:2, cursor:'pointer', fontFamily:MONO, fontSize:10, fontWeight:700,
                      color:T.grn, padding:'9px', background:T.grnD,
                      borderRadius:8, border:`1px solid ${T.grn}50`, textAlign:'center' }}>
                    ＋ 附加（合計 {((movie.transcript?.length ?? 0) + transcriptDraft.length).toLocaleString()} 字）
                  </div>
                )}
                <div onClick={() => { saveTranscript(transcriptDraft); setTranscriptDraft(''); setTranscriptEditMode(false) }}
                  style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:10, fontWeight:700,
                    color: hasSaved ? T.red : T.bg, padding:'9px',
                    background: hasSaved ? T.redD : T.amber,
                    borderRadius:8, border:`1px solid ${hasSaved ? T.red+'40' : 'transparent'}`,
                    textAlign:'center' }}>
                  {hasSaved ? '↺ 取代' : '💾 儲存'}
                </div>
              </div>
            )}
          </>
        )}

        {hasSaved && !transcriptEditMode && (
          <div onClick={() => {
              if (!window.confirm('確定刪除已儲存的逐字稿？')) return
              saveDb({ ...db, movies: db.movies.map(m => m.id !== movieId ? m : { ...m, transcript: '' }) })
            }}
            style={{ textAlign:'center', fontFamily:MONO, fontSize:9, color:T.red, cursor:'pointer' }}>
            刪除已儲存的逐字稿
          </div>
        )}
      </div>

      {/* ── 區塊二：時間範圍 + AI 解析 ── */}
      <div style={{ background:T.surf, border:`1px solid ${canParse ? T.amber+'40' : T.bdr}`,
        borderRadius:13, padding:'14px 16px', display:'flex', flexDirection:'column', gap:10,
        transition:'border-color 0.2s' }}>
        <span style={{ fontFamily:MONO, fontSize:10, color:T.amber, fontWeight:700 }}>
          ⚡ 選取時間範圍 → AI 解析新場景
        </span>
        <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
          {[['開始','05:57',startTime,setStartTime],['結束','07:59',endTime,setEndTime]].map(([lbl,ph,val,set]) => (
            <div key={lbl} style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <span style={{ fontFamily:MONO, fontSize:9, color: val ? T.grn : T.txt3 }}>
                {lbl}{val ? ' ✓' : ''}
              </span>
              <input value={val} onChange={e => { set(e.target.value); setAddErr('') }}
                placeholder={ph}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                data-form-type="other"
                data-lpignore="true"
                inputMode="decimal"
                style={{ fontFamily:MONO, fontSize:12, background:T.surf2,
                  border:`1px solid ${val ? T.grn+'60' : T.bdr}`,
                  borderRadius:8, padding:'8px 10px', color:T.txt, outline:'none', width:110 }}/>
            </div>
          ))}
          {/* 預覽此段逐字稿 */}
          {startTime && endTime && hasSaved && (
            <div onClick={previewSceneTranscript}
              style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                color:T.blue, padding:'8px 10px', background:T.blueD,
                borderRadius:8, border:`1px solid ${T.blue}50`,
                display:'flex', alignItems:'center', gap:4, whiteSpace:'nowrap',
                alignSelf:'flex-end' }}>
              🔍 預覽
            </div>
          )}
        </div>
        {startTime && endTime && hasSaved && (
          <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
            🔍 預覽後可選擇複製方式，再貼至 ChatGPT
          </div>
        )}

        {/* 逐字稿匯出預覽面板 */}
        {exportPreview && (
          <div style={{ display:'flex', flexDirection:'column', gap:8, background:T.surf2,
            border:`1px solid ${T.blue}40`, borderRadius:12, padding:12 }} className="fadeUp">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontFamily:MONO, fontSize:10, color:T.blue, fontWeight:700 }}>
                📄 {exportPreview.lines.length} 行 · {startTime} ~ {endTime}
              </span>
              <span onClick={() => setExportPreview(null)}
                style={{ fontFamily:MONO, fontSize:10, color:T.txt3, cursor:'pointer', padding:'2px 6px' }}>✕</span>
            </div>
            {/* 文字預覽 */}
            <div style={{ maxHeight:180, overflowY:'auto', background:T.bg,
              borderRadius:8, padding:'8px 10px', border:`1px solid ${T.bdr}` }}>
              {exportPreview.lines.map((l, i) => (
                <div key={i} style={{ display:'flex', gap:8, marginBottom:4 }}>
                  <span style={{ fontFamily:MONO, fontSize:9, color:T.amber, flexShrink:0, marginTop:1 }}>
                    {secsToTimeStr(l.startSecs)}
                  </span>
                  <span style={{ fontFamily:MONO, fontSize:11, color:T.txt, lineHeight:1.5 }}>
                    {l.text}
                  </span>
                </div>
              ))}
            </div>
            {/* 複製按鈕 */}
            <div style={{ display:'flex', gap:8 }}>
              <div onClick={copyTranscriptOnly}
                style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:10, fontWeight:700,
                  color:T.grn, padding:'9px 10px', background:T.grnD,
                  borderRadius:8, border:`1px solid ${T.grn}50`,
                  display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                📋 純文字
              </div>
              <div onClick={copyTranscriptWithPrompt}
                style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:10, fontWeight:700,
                  color:T.amber, padding:'9px 10px', background:T.amberD,
                  borderRadius:8, border:`1px solid ${T.amber}50`,
                  display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                ✨ 含分析指令
              </div>
            </div>
            <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
              純文字：只有台詞，自己下指令｜含分析指令：自動附上 Jerry Maguire 英文分析 prompt
            </div>
          </div>
        )}

        {addErr && (
          <div style={{ fontFamily:MONO, fontSize:10, color:T.red, background:T.redD,
            borderRadius:8, padding:'7px 10px' }}>{addErr}</div>
        )}

        {/* 預覽結果 */}
        {addPreview && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }} className="fadeUp">
            <div style={{ fontFamily:MONO, fontSize:11, color:T.amber }}>
              「{addPreview.name}」· {addPreview.phrases.length} 句
              {addPreview.phrases.filter(p=>p.starred).length > 0 && (
                <span style={{ color:T.txt3, marginLeft:8 }}>
                  ⭐ {addPreview.phrases.filter(p=>p.starred).length} 句已標星
                </span>
              )}
            </div>
            <div style={{ maxHeight:200, overflowY:'auto', display:'flex', flexDirection:'column', gap:5,
              border:`1px solid ${T.bdr}`, borderRadius:10, padding:10 }}>
              {addPreview.phrases.map((p,i) => (
                <div key={i} style={{ background:T.surf2, borderRadius:8, padding:'7px 10px',
                  border:`1px solid ${p.starred ? T.amber+'50' : 'transparent'}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2 }}>
                    {p.starred && <span style={{ fontSize:11, color:T.amber }}>⭐</span>}
                    <div style={{ fontFamily:MONO, fontSize:11, color:T.txt }}>{p.en}</div>
                  </div>
                  <div style={{ fontFamily:MONO, fontSize:10, color:T.txt3 }}>{p.zh}</div>
                </div>
              ))}
            </div>
            <div onClick={confirmAddScene}
              style={{ background:T.amber, borderRadius:10, padding:'11px', textAlign:'center',
                fontFamily:MONO, fontSize:12, fontWeight:700, color:T.bg, cursor:'pointer' }}>
              ✓ 確認加入場景
            </div>
            <div onClick={() => setAddPreview(null)}
              style={{ textAlign:'center', fontFamily:MONO, fontSize:10, color:T.txt3, cursor:'pointer' }}>
              重新解析
            </div>
          </div>
        )}

        {!addPreview && (
          <div onClick={addBusy ? undefined : parseScene}
            style={{ background: addBusy ? T.surf2 : canParse ? T.amber : T.surf2,
              borderRadius:10, padding:'12px', textAlign:'center',
              fontFamily:MONO, fontSize:12, fontWeight:700,
              color: addBusy ? T.txt3 : canParse ? T.bg : T.txt3,
              cursor: (addBusy || !canParse) ? 'default' : 'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {addBusy && <span style={{ display:'inline-block', width:10, height:10,
              border:'2px solid transparent', borderTopColor:T.txt3,
              borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>}
            {addBusy ? 'AI 解析中…' : !hasSaved ? '請先儲存逐字稿' : !canParse ? '請填入時間範圍' : '⚡ AI 解析'}
          </div>
        )}
      </div>
    </div>
  )}

  // ══════════════════════════════════════════════════════════════
  // PLAY VIEW
  // ══════════════════════════════════════════════════════════════
  if (view === 'play') {
    const cur = activePhrases[playIdx]
    const pct = activePhrases.length ? Math.round((playedCount / activePhrases.length) * 100) : 0
    return (
      <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:14 }} className="fadeUp">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <BackBtn label="← 返回句子" to="scene"/>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {starFilter && <span style={{ fontFamily:MONO, fontSize:9, color:T.amber, background:T.amberD, padding:'2px 8px', borderRadius:8 }}>⭐ 重點模式</span>}
            <span style={{ fontFamily:MONO, fontSize:10, color:T.txt3 }}>{playIdx+1} / {activePhrases.length}</span>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ flex:1, background:T.bdr, borderRadius:4, height:6, overflow:'hidden' }}>
            <div style={{ width:`${pct}%`, height:'100%', background:T.amber, transition:'width 0.4s' }}/>
          </div>
          <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>{playedCount}/{activePhrases.length}</span>
        </div>
        {/* Card */}
        {cur && (
          <div style={{ background:T.surf, border:`1px solid ${playing ? T.amber+'50' : T.bdr2}`,
            borderRadius:18, padding:'32px 22px', display:'flex', flexDirection:'column', gap:16,
            minHeight:170, transition:'border-color 0.3s' }}>
            <div style={{ fontFamily:MONO, fontSize:16, color:T.txt, lineHeight:1.9, fontWeight:500 }}>
              {cur.en}
            </div>
            <div style={{ height:1, background:T.bdr }}/>
            <div style={{ fontFamily:MONO, fontSize:12, color:T.txt3, lineHeight:1.8 }}>{cur.zh}</div>
          </div>
        )}
        {/* Main play button */}
        <div style={{ display:'flex', justifyContent:'center' }}>
          <div onClick={() => setPlaying(p => !p)}
            style={{ width:76, height:76, borderRadius:'50%', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              background: playing ? T.amber+'20' : T.surf,
              border:`2px solid ${playing ? T.amber : T.bdr2}`,
              boxShadow: playing ? `0 0 0 8px ${T.amber}12` : 'none',
              transition:'all 0.2s' }}>
            <span style={{ fontSize:30, color: playing ? T.amber : T.txt2 }}>{playing ? '⏸' : '▶'}</span>
          </div>
        </div>
        {/* Prev / Next */}
        <div style={{ display:'flex', gap:8 }}>
          <div onClick={() => { setPlayIdx(i => Math.max(0,i-1)); setPlaying(false) }}
            style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:10, color:T.txt2,
              padding:'10px', background:T.surf2, borderRadius:10, border:`1px solid ${T.bdr}`, textAlign:'center' }}>
            ◀ 上一句
          </div>
          <div onClick={() => { setPlayIdx(i => Math.min(activePhrases.length-1,i+1)); setPlaying(false) }}
            style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:10, color:T.txt2,
              padding:'10px', background:T.surf2, borderRadius:10, border:`1px solid ${T.bdr}`, textAlign:'center' }}>
            下一句 ▶
          </div>
        </div>
        {/* Loop / Reset */}
        <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
          <Chip on={looping} onClick={() => setLooping(l => !l)}>🔁 循環 {looping?'ON':'OFF'}</Chip>
          <Chip on={false} onClick={resetScene}>↺ 重置進度</Chip>
        </div>

        {/* ── 睡眠計時器 ── */}
        <div style={{ background:T.surf, border:`1px solid ${sleepMins ? T.blue+'60' : T.bdr}`,
          borderRadius:12, padding:'12px 16px', display:'flex', flexDirection:'column', gap:10,
          transition:'border-color 0.2s' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontFamily:MONO, fontSize:10, color: sleepMins ? T.blue : T.txt3 }}>
              😴 睡眠計時
            </span>
            {sleepSecs !== null && (
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontFamily:MONO, fontSize:13, color:T.blue, fontWeight:700 }}>
                  {fmtSleep(sleepSecs)}
                </span>
                <span onClick={cancelSleep}
                  style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.txt3,
                    padding:'2px 8px', background:T.surf2, borderRadius:6,
                    border:`1px solid ${T.bdr}` }}>取消</span>
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:7 }}>
            {[10, 20, 30].map(m => {
              const active = sleepMins === m
              return (
                <div key={m} onClick={() => active ? cancelSleep() : startSleep(m)}
                  style={{ flex:1, cursor:'pointer', textAlign:'center',
                    padding:'8px 0', borderRadius:9, fontFamily:MONO, fontSize:11, fontWeight:700,
                    transition:'all 0.15s',
                    background: active ? T.blueD : T.surf2,
                    border:`1px solid ${active ? T.blue+'80' : T.bdr}`,
                    color: active ? T.blue : T.txt3 }}>
                  {m}分
                  {active && sleepSecs !== null && (
                    <div style={{ fontSize:8, fontWeight:400, color:T.blue, marginTop:2 }}>
                      {fmtSleep(sleepSecs)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {sleepMins && (
            <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, textAlign:'center' }}>
              {fmtSleep(sleepSecs)} 後自動停止播放
            </div>
          )}
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════

  // REVERSE VIEW — v3.42 with countdown + quality check + collapsible hint
  // ══════════════════════════════════════════════════════════════
  if (view === 'reverse') {
    const cur = activePhrases[revIdx]
    const hasScene = activePhrases.some(p => p.sceneDesc)
    const displayText = revMode === 'scene' && cur?.sceneDesc ? cur.sceneDesc : cur?.zh
    const isDone = revIdx >= activePhrases.length

    // ── 完成畫面 ──
    if (isDone) return (
      <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:16 }} className="fadeUp">
        <BackBtn label="← 返回句子" to="scene"/>
        <div style={{ background:T.surf, border:`1px solid ${T.grn}50`,
          borderRadius:18, padding:'36px 22px', display:'flex', flexDirection:'column',
          alignItems:'center', gap:16 }}>
          <span style={{ fontSize:40 }}>🎉</span>
          <div style={{ fontFamily:DISP, fontSize:18, color:T.grn, textAlign:'center' }}>
            本輪練習完成！
          </div>
          <div style={{ fontFamily:MONO, fontSize:11, color:T.txt3, textAlign:'center', lineHeight:1.8 }}>
            {activePhrases.length} 句全部說過一遍<br/>
            語言 × 視覺 × 身體都啟動了
          </div>
        </div>
        <div onClick={() => { setRevIdx(0); setRevFlip(false) }}
          style={{ cursor:'pointer', background:T.amberD, border:`1px solid ${T.amber}60`,
            borderRadius:12, padding:'13px', textAlign:'center',
            fontFamily:MONO, fontSize:11, fontWeight:700, color:T.amber }}>
          🔄 再練一輪
        </div>
        <div onClick={() => goBack('scene')}
          style={{ cursor:'pointer', background:T.surf2, border:`1px solid ${T.bdr}`,
            borderRadius:12, padding:'13px', textAlign:'center',
            fontFamily:MONO, fontSize:11, color:T.txt3 }}>
          ← 返回句子列表
        </div>
      </div>
    )

    return (
      <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:12 }} className="fadeUp">

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <BackBtn label="← 返回句子" to="scene"/>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {starFilter && <span style={{ fontFamily:MONO, fontSize:9, color:T.amber, background:T.amberD, padding:'2px 8px', borderRadius:8 }}>⭐ 重點</span>}
            <span style={{ fontFamily:MONO, fontSize:10, color:T.txt3 }}>{revIdx+1} / {activePhrases.length}</span>
          </div>
        </div>

        {/* 模式切換 */}
        <div style={{ display:'flex', gap:6 }}>
          {[{id:'zh',label:'🈵 中文'},{id:'scene',label:'🎬 畫面'}].map(m => (
            <div key={m.id} onClick={() => setRevMode(m.id)}
              style={{ flex:1, cursor:'pointer', textAlign:'center', padding:'7px 8px',
                borderRadius:9, fontFamily:MONO, fontSize:10, fontWeight: revMode===m.id ? 700 : 400,
                transition:'all 0.15s',
                background: revMode===m.id ? (m.id==='scene' ? T.amberD : T.surf) : T.surf2,
                border:`1px solid ${revMode===m.id ? (m.id==='scene' ? T.amber+'60' : T.bdr2) : T.bdr}`,
                color: revMode===m.id ? (m.id==='scene' ? T.amber : T.txt) : T.txt3 }}>
              {m.label}
            </div>
          ))}
        </div>

        {/* ── 聯想 + 動作提示（可收起）── */}
        <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:13, overflow:'hidden' }}>
          {/* 標題列（點擊展開/收起）*/}
          <div onClick={toggleHint}
            style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'10px 14px', cursor:'pointer' }}>
            <span style={{ fontFamily:MONO, fontSize:10, color:T.txt2, fontWeight:700 }}>
              🧠 聯想 + 動作提示
            </span>
            <span style={{ fontFamily:MONO, fontSize:10, color:T.txt3 }}>
              {hintOpen ? '▲ 收起' : '▼ 展開'}
            </span>
          </div>
          {/* 提示內容 */}
          {hintOpen && (
            <div style={{ padding:'0 14px 14px', display:'flex', flexDirection:'column', gap:7,
              borderTop:`1px solid ${T.bdr}` }}>
              {[
                { icon:'🎬', bold:'想電影畫面',   sub:'回到那個場景' },
                { icon:'🧠', bold:'閉眼 2 秒',    sub:'想阿湯哥的神情與眼神' },
                { icon:'💨', bold:'深吸一口氣',   sub:'讓身體準備好' },
                { icon:'🏋', bold:'挺直肩膀',     sub:'加上手勢，進入角色' },
                { icon:'👄', bold:'翻牌，說出來', sub:'對著空氣，帶語調說' },
                { icon:'🔊', bold:'語速 0.6x 起', sub:'熟悉後升 1.0x' },
              ].map((s,i) => (
                <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', paddingTop: i===0?10:0 }}>
                  <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>{s.icon}</span>
                  <div>
                    <span style={{ fontFamily:MONO, fontSize:10, color:T.txt, fontWeight:700 }}>{s.bold}</span>
                    <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3, marginLeft:6 }}>{s.sub}</span>
                  </div>
                </div>
              ))}
              {/* 神經連結說明 */}
              <div style={{ marginTop:4, padding:'8px 10px', background:T.surf2,
                borderRadius:8, fontFamily:MONO, fontSize:9, color:T.txt3, fontStyle:'italic', lineHeight:1.7 }}>
                語言 × 視覺 × 身體 × 情緒 同時啟動<br/>
                → 大腦建立更深的神經連結，不是死背，是真正記住
              </div>
            </div>
          )}
        </div>

        {cur && (
          <>
            {/* 提示卡 */}
            <div style={{ background:T.surf, border:`1px solid ${revMode==='scene' ? T.amber+'40' : T.bdr2}`,
              borderRadius:16, padding:'28px 22px', minHeight:100,
              display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', gap:8 }}>
              {revMode === 'scene' && <span style={{ fontSize:18 }}>🎬</span>}
              <div style={{ fontFamily:MONO, fontSize:15,
                color: revMode==='scene' ? T.amber : T.txt,
                lineHeight:1.9, textAlign:'center' }}>
                {displayText}
              </div>
              {revMode === 'scene' && cur.sceneDesc && cur.zh && (
                <div style={{ fontFamily:MONO, fontSize:10, color:T.txt3, marginTop:4 }}>
                  {cur.zh}
                </div>
              )}
            </div>

            {/* 2 秒倒數 / 翻牌按鈕 */}
            {!revFlip && (
              flipCountdown > 0 ? (
                <div style={{ background:T.surf2, border:`1px solid ${T.bdr}`, borderRadius:12,
                  padding:'18px', textAlign:'center', display:'flex', flexDirection:'column', gap:6 }}>
                  <div style={{ fontFamily:DISP, fontSize:28, color:T.amber, fontWeight:700 }}>
                    {flipCountdown}
                  </div>
                  <div style={{ fontFamily:MONO, fontSize:10, color:T.txt3 }}>
                    閉眼…想畫面…
                  </div>
                </div>
              ) : (
                <div onClick={() => setRevFlip(true)}
                  style={{ background:T.surf2, border:`1px solid ${T.bdr2}`, borderRadius:12,
                    padding:'18px', textAlign:'center', cursor:'pointer',
                    fontFamily:MONO, fontSize:11, color:T.txt, fontWeight:700 }}>
                  準備好了 → 翻牌看英文
                </div>
              )
            )}

            {/* 翻牌後：英文 + 品質自評 */}
            {revFlip && (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }} className="fadeUp">
                <div style={{ background:T.amberD, border:`1px solid ${T.amber}50`,
                  borderRadius:16, padding:'24px 22px' }}>
                  <div style={{ fontFamily:MONO, fontSize:15, color:T.amber, lineHeight:1.9, fontWeight:500 }}>
                    {cur.en}
                  </div>
                  {/* 播放按鈕 */}
                  <div style={{ display:'flex', gap:8, marginTop:12 }}>
                    {[{rate:0.6,label:'🔊 0.6x'},{rate:1.0,label:'🔊 1.0x'}].map(({rate,label}) => (
                      <div key={rate} onClick={() => speakPhrase(cur.id, cur.en, rate)}
                        style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:10, color:T.amber,
                          padding:'7px', background:T.surf, borderRadius:8,
                          border:`1px solid ${T.amber}40`, textAlign:'center' }}>
                        {label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 品質自評 */}
                <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:12,
                  padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, textAlign:'center' }}>
                    這次有帶入畫面說出來嗎？
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <div onClick={() => {
                        const isLast = revIdx >= activePhrases.length - 1
                        if (isLast) {
                          // 最後一句完成 → 顯示完成畫面
                          setRevIdx(activePhrases.length) // 超出範圍作為完成標記
                          setRevFlip(false)
                        } else {
                          setRevIdx(i => i + 1)
                        }
                      }}
                      style={{ flex:2, cursor:'pointer', background:T.grnD,
                        border:`1px solid ${T.grn}50`, borderRadius:10, padding:'11px',
                        textAlign:'center', fontFamily:MONO, fontSize:10, fontWeight:700, color:T.grn }}>
                      {revIdx >= activePhrases.length - 1 ? '✓ 完成練習' : '✓ 有，下一句'}
                    </div>
                    <div onClick={retryPhrase}
                      style={{ flex:1, cursor:'pointer', background:T.surf2,
                        border:`1px solid ${T.bdr}`, borderRadius:10, padding:'11px',
                        textAlign:'center', fontFamily:MONO, fontSize:10, color:T.txt3 }}>
                      ↺ 再來
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 上一句（只在未翻牌時顯示）*/}
            {!revFlip && flipCountdown === 0 && (
              <div onClick={() => setRevIdx(i => Math.max(0,i-1))}
                style={{ cursor:'pointer', fontFamily:MONO, fontSize:10, color:T.txt3,
                  padding:'8px', background:T.surf2, borderRadius:10,
                  border:`1px solid ${T.bdr}`, textAlign:'center' }}>
                ◀ 上一句
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // SCENE VIEW (sentence list + word tap)
  // ══════════════════════════════════════════════════════════════
  if (view === 'scene' && scene) {
    const pct = phrases.length ? Math.round((playedCount / phrases.length) * 100) : 0
    return (
      <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:10 }} className="fadeUp">

        {/* 第一行：← 返回 + 語速 + 🌟AI評分 */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <BackBtn to="list"/>
          <div style={{ display:'flex', gap:5, marginLeft:'auto' }}>
            {[0.6, 0.8, 1.0].map(r => (
              <div key={r} onClick={() => {
                  setPlayRate(r); setSceneRate(r)
                  localStorage.setItem('fsi:movie:playRate', String(r))
                  if (scenePlaying && audioElRef.current) audioElRef.current.playbackRate = r
                }}
                style={{ cursor:'pointer', fontFamily:MONO, fontSize:10, fontWeight:700,
                  padding:'5px 9px', borderRadius:8,
                  background: playRate===r ? T.amberD : T.surf2,
                  border:`1px solid ${playRate===r ? T.amber+'60' : T.bdr}`,
                  color: playRate===r ? T.amber : T.txt3 }}>
                {r === 0.6 ? '0.6x' : r === 0.8 ? '0.8x' : '1.0x'}
              </div>
            ))}
            <div onClick={aiStarBusy ? undefined : aiRateScene}
              style={{ cursor: aiStarBusy ? 'default' : 'pointer',
                fontFamily:MONO, fontSize:10, padding:'5px 9px', borderRadius:8,
                background: T.surf2, border:`1px solid ${T.bdr}`,
                color: aiStarBusy ? T.txt3 : T.txt2,
                display:'flex', alignItems:'center', gap:3 }}>
              {aiStarBusy
                ? <span style={{ display:'inline-block', width:9, height:9,
                    border:'1.5px solid transparent', borderTopColor:T.txt3,
                    borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                : '✨'}
              {aiStarBusy ? '評分中…' : 'AI評分'}
            </div>
          </div>
        </div>

        {/* Scene info card */}
        <div style={{ background:T.surf, borderRadius:14, padding:'14px 16px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <div style={{ fontFamily:MONO, fontSize:13, color:T.amber, fontWeight:700, flex:1 }}>{scene.name}</div>
            <div onClick={() => setView('vocab')}
              style={{ cursor:'pointer', fontFamily:MONO, fontSize:10,
                color: db.vocab.length ? T.blue : T.txt3,
                background: db.vocab.length ? T.blueD : T.surf2,
                border:`1px solid ${db.vocab.length ? T.blue+'50' : T.bdr}`,
                borderRadius:7, padding:'3px 9px' }}>
              📖 {db.vocab.length}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
            <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>{scene.timeRange}</span>
            <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>已練習 {playedCount}/{activePhrases.length} · {pct}%</span>
          </div>
          <div style={{ background:T.bdr, borderRadius:4, height:4, overflow:'hidden' }}>
            <div style={{ width:`${pct}%`, height:'100%', background:T.amber, transition:'width 0.3s' }}/>
          </div>
        </div>

        {/* 第二行：全部 + ⭐重點 + 🔄反向 */}
        <div style={{ display:'flex', gap:6 }}>
          <div onClick={() => setStarFilter(false)}
            style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:10, textAlign:'center',
              padding:'8px', borderRadius:10, transition:'all 0.13s',
              background: !starFilter ? T.surf : T.surf2,
              border:`1px solid ${!starFilter ? T.bdr2 : T.bdr}`,
              color: !starFilter ? T.txt : T.txt3 }}>
            全部 ({phrases.length})
          </div>
          <div onClick={() => setStarFilter(true)}
            style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:10, textAlign:'center',
              padding:'8px', borderRadius:10, transition:'all 0.13s',
              background: starFilter ? T.amberD : T.surf2,
              border:`1px solid ${starFilter ? T.amber+'60' : T.bdr}`,
              color: starFilter ? T.amber : T.txt3 }}>
            ⭐ 重點 ({starredCount})
          </div>
          <div onClick={() => { setRevIdx(0); setRevFlip(false); setView('reverse') }}
            style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:10, textAlign:'center',
              padding:'8px', borderRadius:10, transition:'all 0.13s',
              background: T.surf2, border:`1px solid ${T.bdr2}`, color:T.txt2 }}>
            🔄 反向
          </div>
        </div>

        {/* 補充時間碼提示 */}
        {audioReady && phrases.every(p => !p.startSecs) && movie?.transcript && (
          <div onClick={() => {
              const n = patchTimestamps()
              if (n > 0) alert(`✅ 已為 ${n} 句補充時間碼，現在可用電影原音！`)
              else alert('⚠ 無法比對，請確認逐字稿與場景是否對應')
            }}
            style={{ background:T.blueD, border:`1px solid ${T.blue}50`, borderRadius:11,
              padding:'10px', textAlign:'center', cursor:'pointer',
              fontFamily:MONO, fontSize:10, color:T.blue, fontWeight:700 }}>
            🎵 補充時間碼（啟用電影原音）
          </div>
        )}

        {/* 第三行：播放整段 + 單次 + 循環 + 逐句 */}
        {(audioReady || audioMode === 'tts') && (
          <div style={{ display:'flex', flexDirection:'column', gap:8,
            background:T.surf, border:`1px solid ${scenePlaying || playing ? T.amber+'50' : T.bdr}`,
            borderRadius:12, padding:'10px 12px', transition:'border-color 0.2s' }}>
            <div style={{ display:'flex', gap:6 }}>
              <div onClick={scenePlaying ? stopSceneAudio : playSceneAudio}
                style={{ flex:2, cursor:'pointer', background: scenePlaying ? T.surf2 : T.amberD,
                  border:`1px solid ${T.amber}60`, borderRadius:9, padding:'9px',
                  textAlign:'center', fontFamily:MONO, fontSize:10, fontWeight:700, color:T.amber }}>
                {scenePlaying ? '⏹ 停止' : '🎬 播放整段'}
              </div>
              {[['single','▶ 單次'],['loop','🔁 循環']].map(([mode, label]) => (
                <div key={mode} onClick={() => {
                    const isLoop = mode === 'loop'
                    setSceneLoop(isLoop)
                    if (audioElRef.current) audioElRef.current._sceneLoop = isLoop
                  }}
                  style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                    padding:'9px 4px', borderRadius:9, textAlign:'center',
                    background: (sceneLoop ? 'loop' : 'single') === mode ? T.blueD : T.surf2,
                    border:`1px solid ${(sceneLoop ? 'loop' : 'single') === mode ? T.blue+'60' : T.bdr}`,
                    color: (sceneLoop ? 'loop' : 'single') === mode ? T.blue : T.txt3 }}>
                  {label}
                </div>
              ))}
              <div onClick={() => { setPlayIdx(0); setPlaying(false); setView('play') }}
                style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                  padding:'9px 4px', borderRadius:9, textAlign:'center',
                  background: T.amberD, border:`1px solid ${T.amber}50`, color:T.amber }}>
                ▶ 逐句
              </div>
            </div>

            {/* 進度條（播放中才顯示）*/}
            {audioMode === 'original' && scenePlaying && (
              <div style={{ background:T.bdr, borderRadius:4, height:4, overflow:'hidden' }}>
                <div style={{ width:`${scenePlayPos*100}%`, height:'100%',
                  background:T.amber, transition:'width 0.3s' }}/>
              </div>
            )}

            {/* 第四行：睡眠計時 */}
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>⏰</span>
              {[10,20,30].map(m => {
                const active = sleepMins === m
                return (
                  <div key={m} onClick={() => {
                      if (active) { setSleepMins(null); setSleepSecs(null) }
                      else startSleep(m)
                    }}
                    style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                      padding:'5px', borderRadius:7, textAlign:'center',
                      background: active ? T.blueD : T.surf2,
                      border:`1px solid ${active ? T.blue+'60' : T.bdr}`,
                      color: active ? T.blue : T.txt3 }}>
                    {active && sleepSecs !== null ? fmtSleep(sleepSecs) : `${m}分`}
                  </div>
                )
              })}
            </div>
            {sleepMins && sleepSecs !== null && (
              <div style={{ fontFamily:MONO, fontSize:9, color:T.blue, textAlign:'center' }}>
                {fmtSleep(sleepSecs)} 後自動停止
              </div>
            )}
          </div>
        )}
        {/* ── Speak / ChatGPT 課程按鈕 ── */}
        <div onClick={() => {
            if (scene?.speakEasy) { setSpeakOpen(o => !o) }
            else { generateSpeakCourses() }
          }}
          style={{ cursor:'pointer', fontFamily:MONO, fontSize:10, fontWeight:700,
            color:'#c084fc', padding:'10px', background:'#2d1a4a',
            borderRadius:10, border:'1px solid #c084fc50',
            display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          {speakBusy ? '⏳ 產生中…' : '📤 產生 Speak / ChatGPT 課程'}
        </div>

        {/* ── Speak / ChatGPT 課程面板 ── */}
        {speakOpen && (scene?.speakEasy || speakBusy) && (
          <div style={{ display:'flex', flexDirection:'column', gap:10, background:'#1a1025',
            border:'1px solid #c084fc40', borderRadius:14, padding:14 }} className="fadeUp">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontFamily:MONO, fontSize:10, color:'#c084fc', fontWeight:700 }}>
                📤 Speak / ChatGPT 課程
              </span>
              <span onClick={() => setSpeakOpen(false)}
                style={{ fontFamily:MONO, fontSize:10, color:'#888', cursor:'pointer', padding:'2px 8px' }}>✕</span>
            </div>
            {speakBusy ? (
              <div style={{ fontFamily:MONO, fontSize:10, color:'#888', textAlign:'center', padding:8 }}>
                ⏳ 產生中…
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ fontFamily:MONO, fontSize:9, color:'#888', lineHeight:1.6 }}>
                  複製後貼到對應 App 練習
                </div>

                {/* ChatGPT 含逐字稿（最推薦） */}
                <div style={{ display:'flex', flexDirection:'column', gap:6, background:'#0d1f35',
                  borderRadius:10, padding:'10px 12px', border:'2px solid #60a5fa60' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <span style={{ fontFamily:MONO, fontSize:10, color:'#60a5fa', fontWeight:700 }}>
                        🤖 ChatGPT 陪練（含逐字稿）
                      </span>
                      <span style={{ fontFamily:MONO, fontSize:8, color:'#888', marginLeft:6 }}>
                        最完整・場景原文＋追問＋糾正
                      </span>
                    </div>
                    <div onClick={copyChatGPTWithTranscript}
                      style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                        color: speakCopied==='cgpt_transcript' ? '#60a5fa' : '#888',
                        padding:'4px 10px', background: speakCopied==='cgpt_transcript' ? '#1a2a3a' : '#222',
                        borderRadius:7, border:'1px solid ' + (speakCopied==='cgpt_transcript' ? '#60a5fa60' : '#333'),
                        whiteSpace:'nowrap' }}>
                      {speakCopied==='cgpt_transcript' ? '✅ 已複製' : '📋 複製'}
                    </div>
                  </div>
                  <div style={{ fontFamily:MONO, fontSize:9, color:'#60a5fa80', lineHeight:1.6 }}>
                    {movie?.transcript ? '✓ 逐字稿已存入，可直接複製' : '⚠ 請先儲存逐字稿'}
                  </div>
                </div>

                {/* Speak 簡單組 + 進階組：三個獨立複製按鈕 */}
                {[
                  { type:'easy',     label:'🟢 Speak 簡單組', sub:'高頻短句，早晨練習', color:T.grn,   bg:T.grnD },
                  { type:'advanced', label:'🟡 Speak 進階組', sub:'完整重點句，挑戰用', color:T.amber, bg:T.amberD },
                ].map(({ type, label, sub, color, bg }) => {
                  const textMap = { easy: scene?.speakEasy, advanced: scene?.speakAdvanced }
                  const txt = textMap[type]
                  if (!txt) return null
                  return (
                    <div key={type} style={{ display:'flex', flexDirection:'column', gap:6, background:'#111',
                      borderRadius:10, padding:'10px 12px', border:`1px solid ${color}30` }}>
                      {/* 標題 */}
                      <div>
                        <span style={{ fontFamily:MONO, fontSize:10, color, fontWeight:700 }}>{label}</span>
                        <span style={{ fontFamily:MONO, fontSize:8, color:'#888', marginLeft:8 }}>{sub}</span>
                      </div>
                      {/* 三個複製按鈕 */}
                      <div style={{ display:'flex', gap:6 }}>
                        {[
                          { key:'my',  label:'你的角色', val: scene?.speakMyRole ?? 'Rod Tidwell, an NFL player' },
                          { key:'ai',  label:'AI 角色',  val: scene?.speakAIRole ?? 'Jerry Maguire, your sports agent' },
                          { key:'sit', label:'情境描述', val: txt },
                        ].map(({ key, label: btnLabel, val }) => {
                          const copyKey = type + '_' + key
                          return (
                            <div key={key} onClick={() => {
                                const fallback = () => { const el = document.createElement('textarea'); el.value = val; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el) }
                                if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(val).catch(fallback) } else { fallback() }
                                setSpeakCopied(copyKey); setTimeout(() => setSpeakCopied(null), 2000)
                              }}
                              style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                                color: speakCopied===copyKey ? color : '#888',
                                padding:'6px 4px', background: speakCopied===copyKey ? bg : '#222',
                                borderRadius:7, border:`1px solid ${speakCopied===copyKey ? color+'60' : '#333'}`,
                                textAlign:'center', lineHeight:1.4 }}>
                              {speakCopied===copyKey ? '✅' : '📋'}<br/>{btnLabel}
                            </div>
                          )
                        })}
                      </div>
                      {/* 情境預覽 */}
                      <div style={{ fontFamily:MONO, fontSize:9, color:'#666', lineHeight:1.7,
                        maxHeight:80, overflowY:'auto', whiteSpace:'pre-wrap',
                        WebkitOverflowScrolling:'touch' }}>
                        {txt.split('\n').slice(0, 4).join('\n')}…
                      </div>
                    </div>
                  )
                })}

                {/* ChatGPT 陪練指令 */}
                {scene?.chatgptEasy && (
                  <div style={{ display:'flex', flexDirection:'column', gap:6, background:'#111',
                    borderRadius:10, padding:'10px 12px', border:'1px solid #60a5fa30' }}>
                    <div>
                      <span style={{ fontFamily:MONO, fontSize:10, color:'#60a5fa', fontWeight:700 }}>🤖 ChatGPT 陪練指令</span>
                      <span style={{ fontFamily:MONO, fontSize:8, color:'#888', marginLeft:8 }}>場景導入，自由追問，糾正文法</span>
                    </div>
                    <div onClick={() => copySpeak('cgpt_easy')}
                      style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                        color: speakCopied==='cgpt_easy' ? '#60a5fa' : '#888',
                        padding:'7px', background: speakCopied==='cgpt_easy' ? '#1a2a3a' : '#222',
                        borderRadius:7, border:`1px solid ${speakCopied==='cgpt_easy' ? '#60a5fa60' : '#333'}`,
                        textAlign:'center' }}>
                      {speakCopied==='cgpt_easy' ? '✅ 已複製' : '📋 複製'}
                    </div>
                    <div style={{ fontFamily:MONO, fontSize:9, color:'#666', lineHeight:1.7,
                      maxHeight:80, overflowY:'auto', whiteSpace:'pre-wrap',
                      WebkitOverflowScrolling:'touch' }}>
                      {scene?.chatgptEasy?.split('\n').slice(0, 4).join('\n')}…
                    </div>
                  </div>
                )}

                <div onClick={() => generateSpeakCourses()}
                  style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:'#888',
                    textAlign:'center', padding:'6px', borderRadius:8,
                    background:'#222', border:'1px solid #333' }}>
                  🔄 重新產生（隨機換句子）
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>⭐ 收藏重點句 · 👆 點單字加入單字庫 · ✕ 刪除句子</div>
        {/* Sentence list */}
        {(starFilter ? phrases.filter(p=>p.starred) : phrases).map(p => (
          <div key={p.id} style={{ background:T.surf,
            border:`1px solid ${p.starred ? T.amber+'60' : p.played ? T.amber+'25' : T.bdr}`,
            borderRadius:12, padding:'14px 16px', position:'relative' }}>
            {/* EN tokens — 長按 1 秒觸發查詢，滑動自動取消 */}
            <div
              onPointerMove={e => {
                if (!tapStartRef.current) return
                const dx = Math.abs(e.clientX - tapStartRef.current.x)
                const dy = Math.abs(e.clientY - tapStartRef.current.y)
                if (dx > 8 || dy > 8) { clearTimeout(tapTimerRef.current); tapStartRef.current = null }
              }}
              onPointerUp={() => { clearTimeout(tapTimerRef.current); tapStartRef.current = null }}
              onPointerCancel={() => { clearTimeout(tapTimerRef.current); tapStartRef.current = null }}
              style={{ marginBottom:7, lineHeight:2.1, display:'flex', flexWrap:'wrap', gap:1,
                paddingRight:70, userSelect:'none', WebkitUserSelect:'none' }}>
              {p.en.split(/(\b)/).filter(Boolean).map((tok, j) => {
                const isWord = /^[a-zA-Z']+$/.test(tok)
                const cleanWord = tok.replace(/[^a-zA-Z']/g,'')
                const isActive = inlineLookup?.phraseId === p.id && inlineLookup?.word === cleanWord
                return (
                  <span key={j}
                    onPointerDown={e => {
                      if (!isWord) return
                      e.preventDefault(); e.stopPropagation()
                      // 關閉已開啟的查詢
                      if (inlineLookup?.phraseId === p.id && inlineLookup?.word === cleanWord) {
                        setInlineLookup(null); return
                      }
                      tapStartRef.current = { x: e.clientX, y: e.clientY }
                      clearTimeout(tapTimerRef.current)
                      tapTimerRef.current = setTimeout(() => {
                        lookupWord(p.id, cleanWord, p.en)
                        tapStartRef.current = null
                      }, 1000)
                    }}
                    style={{ fontFamily:MONO, fontSize:13,
                      color: isActive ? T.amber : isWord ? T.txt : T.txt3,
                      fontWeight: isWord ? 500 : 400,
                      cursor: isWord ? 'pointer' : 'default',
                      background: isActive ? T.amberD : 'transparent',
                      borderRadius: isActive ? 4 : 0,
                      borderBottom: isWord && !isActive ? `1px dashed ${T.bdr2}` : 'none',
                      padding:'0 2px',
                      userSelect:'none', WebkitUserSelect:'none', touchAction:'manipulation' }}>
                    {tok}
                  </span>
                )
              })}
            </div>
            {/* 中文翻譯（點擊可編輯）*/}
            {editingZhId === p.id ? (
              <div style={{ display:'flex', gap:6, alignItems:'center', paddingRight:38, marginTop:2 }}>
                <input
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                data-form-type="other"
                data-lpignore="true"
                  value={editingZhText}
                  onChange={e => setEditingZhText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveZh(p.id, editingZhText)
                    if (e.key === 'Escape') setEditingZhId(null)
                  }}
                  style={{ flex:1, fontFamily:MONO, fontSize:11, color:T.txt,
                    background:T.surf2, border:`1px solid ${T.amber}80`,
                    borderRadius:7, padding:'5px 9px', outline:'none' }}/>
                <div onClick={() => saveZh(p.id, editingZhText)}
                  style={{ cursor:'pointer', fontFamily:MONO, fontSize:10, color:T.bg,
                    padding:'4px 10px', background:T.amber, borderRadius:6,
                    fontWeight:700, whiteSpace:'nowrap' }}>✓</div>
                <div onClick={() => setEditingZhId(null)}
                  style={{ cursor:'pointer', fontFamily:MONO, fontSize:10, color:T.txt3,
                    padding:'4px 8px', background:T.surf2, borderRadius:6,
                    border:`1px solid ${T.bdr}` }}>✕</div>
              </div>
            ) : (
              <div
                onClick={() => { setEditingZhId(p.id); setEditingZhText(p.zh) }}
                title="點擊修改翻譯"
                style={{ fontFamily:MONO, fontSize:11, color:T.txt3, lineHeight:1.7,
                  paddingRight:38, cursor:'pointer',
                  borderBottom:`1px dashed transparent`,
                  transition:'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderBottomColor = T.bdr2}
                onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}>
                {p.zh}
                <span style={{ fontFamily:MONO, fontSize:8, color:T.txt3,
                  opacity:0.5, marginLeft:5 }}>✎</span>
              </div>
            )}
            {/* 評分星星（★4以上才顯示，放在翻譯下方）*/}
            {(Number(p.rating) >= 4) && (
              <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:3 }}>
                <span style={{ fontSize:13, letterSpacing:1 }}>
                  {'⭐'.repeat(Number(p.rating))}
                </span>
                {p.reason && (
                  <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>{p.reason}</span>
                )}
              </div>
            )}
            {/* 備註（📝）顯示區 */}
            {editingNoteId === p.id ? (
              <div style={{ display:'flex', gap:6, alignItems:'center', paddingRight:70, marginTop:4 }}>
                <input
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                data-form-type="other"
                data-lpignore="true"
                  value={editingNoteText}
                  onChange={e => setEditingNoteText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveNote(p.id, editingNoteText)
                    if (e.key === 'Escape') setEditingNoteId(null)
                  }}
                  placeholder="例：They-v-all-gone-out / said it 連音"
                  style={{ flex:1, fontFamily:MONO, fontSize:10, color:T.txt,
                    background:T.surf2, border:`1px solid ${T.blue}80`,
                    borderRadius:7, padding:'5px 9px', outline:'none' }}/>
                <div onClick={() => saveNote(p.id, editingNoteText)}
                  style={{ cursor:'pointer', fontFamily:MONO, fontSize:10, color:'#fff',
                    padding:'4px 9px', background:T.blue, borderRadius:6, fontWeight:700 }}>✓</div>
                <div onClick={() => setEditingNoteId(null)}
                  style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.txt3,
                    padding:'4px 7px', background:T.surf2, borderRadius:6,
                    border:`1px solid ${T.bdr}` }}>✕</div>
              </div>
            ) : p.note ? (
              <div onClick={() => { setEditingNoteId(p.id); setEditingNoteText(p.note) }}
                style={{ display:'flex', alignItems:'flex-start', gap:5, paddingRight:70,
                  marginTop:4, cursor:'pointer' }}>
                <span style={{ fontSize:10, flexShrink:0, marginTop:1 }}>📝</span>
                <span style={{ fontFamily:MONO, fontSize:10, color:T.blue,
                  fontStyle:'italic', lineHeight:1.7 }}>{p.note}</span>
              </div>
            ) : null}

            {/* ── 畫面描述（🎬）顯示區 ── */}
            {editingSceneDescId === p.id ? (
              <div style={{ display:'flex', flexDirection:'column', gap:6, paddingRight:70, marginTop:4 }}>
                <textarea
                  autoFocus
                  value={editingSceneDescText}
                  onChange={e => setEditingSceneDescText(e.target.value)}
                  rows={2}
                  placeholder="描述這句話的電影畫面情境…"
                  style={{ fontFamily:MONO, fontSize:10, color:T.txt, background:T.surf2,
                    border:`1px solid ${T.amber}80`, borderRadius:7, padding:'6px 9px',
                    outline:'none', resize:'none', lineHeight:1.6 }}/>
                <div style={{ display:'flex', gap:6 }}>
                  <div onClick={() => saveSceneDesc(p.id, editingSceneDescText)}
                    style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:9,
                      color:T.bg, padding:'5px', background:T.amber,
                      borderRadius:6, textAlign:'center', fontWeight:700 }}>✓ 儲存</div>
                  <div onClick={() => autoGenSceneDesc(p.id, p.en)}
                    style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:9,
                      color:T.amber, padding:'5px', background:T.amberD,
                      borderRadius:6, textAlign:'center',
                      border:`1px solid ${T.amber}50`,
                      opacity: autoGenSceneBusy === p.id ? 0.5 : 1 }}>
                    {autoGenSceneBusy === p.id ? 'AI中…' : '✨ AI生成'}
                  </div>
                  <div onClick={() => setEditingSceneDescId(null)}
                    style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.txt3,
                      padding:'5px 8px', background:T.surf2, borderRadius:6,
                      border:`1px solid ${T.bdr}` }}>✕</div>
                </div>
              </div>
            ) : p.sceneDesc ? (
              <div onClick={() => { setEditingSceneDescId(p.id); setEditingSceneDescText(p.sceneDesc) }}
                style={{ display:'flex', alignItems:'flex-start', gap:5, paddingRight:70,
                  marginTop:4, cursor:'pointer' }}>
                <span style={{ fontSize:10, flexShrink:0, marginTop:1 }}>🎬</span>
                <span style={{ fontFamily:MONO, fontSize:10, color:T.amber,
                  lineHeight:1.7 }}>{p.sceneDesc}</span>
              </div>
            ) : null}

            {/* ── 行內單字查詢結果（出現在句子卡片內）── */}
            {inlineLookup?.phraseId === p.id && (
              <div style={{ marginTop:8, background:T.surf2,
                border:`1px solid ${T.amber}50`, borderRadius:10,
                padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}
                className="fadeUp">
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontFamily:MONO, fontSize:15, color:T.amber, fontWeight:700 }}>
                    {inlineLookup.word}
                  </span>
                  {inlineLookup.info && (
                    <span style={{ fontFamily:MONO, fontSize:10, color:T.txt3 }}>
                      {inlineLookup.info.phonetic}
                    </span>
                  )}
                  {/* 🔊 系統 TTS 播放單字 */}
                  <span onClick={() => speak(inlineLookup.word, 0.8)}
                    style={{ cursor:'pointer', fontSize:14, padding:'2px 6px',
                      background:T.surf, borderRadius:6, border:`1px solid ${T.bdr}`,
                      userSelect:'none' }}
                    title="播放發音">
                    🔊
                  </span>
                  {inlineLookup.busy && (
                    <span style={{ display:'inline-block', width:8, height:8,
                      border:'1.5px solid transparent', borderTopColor:T.amber,
                      borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                  )}
                  <span onClick={() => setInlineLookup(null)}
                    style={{ marginLeft:'auto', cursor:'pointer', fontFamily:MONO,
                      fontSize:9, color:T.txt3, padding:'1px 6px',
                      background:T.surf, borderRadius:5, border:`1px solid ${T.bdr}` }}>✕</span>
                </div>
                {inlineLookup.info && (
                  <>
                    <div style={{ fontFamily:MONO, fontSize:12, color:T.txt2 }}>
                      {inlineLookup.info.zh}
                    </div>
                    <div onClick={() => {
                        addToVocab(inlineLookup.word, inlineLookup.info.phonetic,
                          inlineLookup.info.zh, inlineLookup.info.example)
                        setInlineLookup(null)
                      }}
                      style={{ cursor:'pointer', background:T.blue, borderRadius:8,
                        padding:'9px', textAlign:'center',
                        fontFamily:MONO, fontSize:10, fontWeight:700, color:'#fff' }}>
                      + 加入單字庫
                    </div>
                  </>
                )}
                {inlineLookup.busy && (
                  <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, textAlign:'center' }}>
                    AI 查詢中…
                  </div>
                )}
              </div>
            )}

            {/* 右側按鈕欄：⭐ ✕ 只在右上角 */}
            <div style={{ position:'absolute', top:10, right:10,
              display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5 }}>
              {deletingPhraseId === p.id ? (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5 }}>
                  <span style={{ fontFamily:MONO, fontSize:9, color:T.red }}>確定刪除？</span>
                  <div style={{ display:'flex', gap:4 }}>
                    <div onClick={() => { deletePhrase(p.id); setDeletingPhraseId(null) }}
                      style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:'#fff',
                        padding:'3px 8px', background:T.red, borderRadius:5 }}>刪除</div>
                    <div onClick={() => setDeletingPhraseId(null)}
                      style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.txt2,
                        padding:'3px 8px', background:T.surf2, borderRadius:5,
                        border:`1px solid ${T.bdr}` }}>取消</div>
                  </div>
                </div>
              ) : (
                <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                  <div onClick={() => {
                      const txt = p.en
                      const copy = (t) => {
                        if (navigator.clipboard?.writeText) {
                          navigator.clipboard.writeText(t).catch(() => {
                            const el = document.createElement('textarea'); el.value = t
                            document.body.appendChild(el); el.select()
                            document.execCommand('copy'); document.body.removeChild(el)
                          })
                        } else {
                          const el = document.createElement('textarea'); el.value = t
                          document.body.appendChild(el); el.select()
                          document.execCommand('copy'); document.body.removeChild(el)
                        }
                        showMovieToast('✅ 已複製')
                      }
                      copy(txt)
                    }}
                    style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.blue,
                      padding:'2px 5px', background:T.blueD, borderRadius:5,
                      border:`1px solid ${T.blue}50` }}>📋</div>
                  <div onClick={() => toggleStar(p.id)}
                    style={{ cursor:'pointer', fontSize:14,
                      opacity: p.starred ? 1 : 0.25,
                      transition:'opacity 0.15s, transform 0.15s',
                      transform: p.starred ? 'scale(1.15)' : 'scale(1)' }}>⭐</div>
                  <div onClick={() => setDeletingPhraseId(p.id)}
                    style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.txt3,
                      padding:'2px 5px', background:T.surf2, borderRadius:5,
                      border:`1px solid ${T.bdr}` }}>✕</div>
                </div>
              )}
            </div>

            {/* 底部按鈕列：📝 備註 | 🎬 畫面 | 🔄 重譯 | 🔊 播放 */}
            {deletingPhraseId !== p.id && (
              <div style={{ display:'flex', gap:6, marginTop:10, paddingRight:38 }}>
                <div onClick={() => { setEditingNoteId(p.id); setEditingNoteText(p.note ?? '') }}
                  style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                    padding:'5px 10px', borderRadius:7, flex:1, textAlign:'center',
                    background: p.note ? T.blueD : T.surf2,
                    border:`1px solid ${p.note ? T.blue+'60' : T.bdr}`,
                    color: p.note ? T.blue : T.txt3 }}>
                  📝 備註
                </div>
                <div onClick={() => { setEditingSceneDescId(p.id); setEditingSceneDescText(p.sceneDesc ?? '') }}
                  style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                    padding:'5px 10px', borderRadius:7, flex:1, textAlign:'center',
                    background: p.sceneDesc ? T.amberD : T.surf2,
                    border:`1px solid ${p.sceneDesc ? T.amber+'60' : T.bdr}`,
                    color: p.sceneDesc ? T.amber : T.txt3 }}>
                  🎬 畫面
                </div>
                <div onClick={() => retranslatingId !== p.id && retranslatePhrase(p.id, p.en)}
                  style={{ cursor: retranslatingId === p.id ? 'default' : 'pointer',
                    fontFamily:MONO, fontSize:9, fontWeight:700,
                    padding:'5px 10px', borderRadius:7, flex:1, textAlign:'center',
                    background: T.surf2,
                    border:`1px solid ${T.bdr}`,
                    color: retranslatingId === p.id ? T.txt3 : T.grn,
                    transition:'all 0.15s',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:3 }}>
                  {retranslatingId === p.id
                    ? <span style={{ display:'inline-block', width:8, height:8,
                        border:'1.5px solid transparent', borderTopColor:T.txt3,
                        borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                    : '🔄'}
                </div>
                <div onClick={() => speakPhrase(p.id, p.en)}
                  style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                    padding:'5px 10px', borderRadius:7, flex:1, textAlign:'center',
                    background: playingPhraseId===p.id ? T.amber+'22' : T.surf2,
                    border:`1px solid ${playingPhraseId===p.id ? T.amber : T.bdr}`,
                    color: playingPhraseId===p.id ? T.amber : T.txt3,
                    transition:'all 0.15s' }}>
                  {playingPhraseId===p.id ? '⏹' : '🔊'}
                </div>
              </div>
            )}
            {p.played && <span style={{ position:'absolute', bottom:8, right:10, fontSize:9, color:T.txt3 }}>✅</span>}
          </div>
        ))}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // MEMORY VIEW（背誦庫）
  // ══════════════════════════════════════════════════════════════
  // ── ⭐ 重點句 view ─────────────────────────────────────────
  // ── ⭐ 重點句 view ─────────────────────────────────────────
  if (view === 'starred') {
    const allScenes  = db.movies.flatMap(m => m.scenes ?? [])
    // 先按場景開始時間排，場景內按句子索引順序排
    const sortedScenes = [...allScenes].sort((a, b) => {
      const getStart = s => { try { return parseSceneTimeRange(s.timeRange).start ?? 0 } catch { return 0 } }
      return getStart(a) - getStart(b)
    })
    const allPhrases = sortedScenes
      .flatMap(s => (s.phrases ?? []).map((p, idx) => ({
        ...p, sceneName: s.name ?? s.title ?? '', sceneTimeRange: s.timeRange ?? '', _sceneIdx: idx
      })).filter(p => p.starred))

    const familiarList   = allPhrases.filter(p => starFamiliar[p.id])
    const unfamiliarList = allPhrases.filter(p => !starFamiliar[p.id])
    const practiceList   = starMode === 'familiar'   ? familiarList :
                           starMode === 'unfamiliar'  ? unfamiliarList : allPhrases
    const isReverse      = starReverse

    // 循環播放
    const stopStarLoop = () => {
      starLoopActiveRef.current = false
      starLoopPausedRef.current = false
      clearTimeout(starLoopRef.current)
      clearTimeout(starSleepRef.current)
      setStarSleepEnd(null)
      // 移除 timeupdate 監聽
      if (audioElRef.current && starTimeUpdateRef.current) {
        audioElRef.current.removeEventListener('timeupdate', starTimeUpdateRef.current)
        starTimeUpdateRef.current = null
      }
      // 停止電影音 + TTS
      if (audioElRef.current) audioElRef.current.pause()
      window.speechSynthesis?.cancel()
      setStarLoopMode(null)
      setStarLoopPaused(false)
    }

    const pauseStarLoop = () => {
      if (!starLoopActiveRef.current) return
      starLoopPausedRef.current = true
      setStarLoopPaused(true)
      clearTimeout(starLoopRef.current)
      window.speechSynthesis?.cancel()
      if (audioElRef.current) audioElRef.current.pause()
    }

    const resumeStarLoop = () => {
      if (!starLoopPausedRef.current) return
      starLoopPausedRef.current = false
      setStarLoopPaused(false)
      // 直接重播當前句（確保 timeupdate / _sceneEnd 正確設定）
      playStarPhrase(starLoopListRef.current, starLoopIdxRef.current)
    }
    // 每次 render 更新 FAB 的 fn refs（讓 FAB click handler 永遠拿到最新 function）
    pauseFnRef.current = pauseStarLoop
    resumeFnRef.current = resumeStarLoop

    const playStarPhrase = (list, idx) => {
      // 如果暫停中，不繼續播放
      if (starLoopPausedRef.current) return
      // 無限循環
      const realIdx = idx >= list.length ? 0 : idx
      const p = list[realIdx]
      starLoopIdxRef.current = realIdx
      setStarLoopIdx(realIdx)

      // 自動滾動到當前播放的卡片
      setTimeout(() => {
        const el = starCardRefs.current[p.id]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)

      // 如果 startSecs = 0（時間碼不準），改用 TTS
      const secs = p.startSecs ?? 0
      const useTTS = audioMode !== 'original' || secs === 0

      // ── 自動熟悉邏輯：播完一句累計次數，連續 3 次 → 靜默升熟悉 ──
      const markAutoFamiliar = (phraseId) => {
        if (starFamiliar[phraseId]) return // 已是熟悉，跳過
        const prev = starPlayCountRef.current[phraseId] ?? 0
        const next = prev + 1
        starPlayCountRef.current[phraseId] = next
        if (next >= 3) {
          // 自動升熟悉（靜默）
          setStarFamiliar(f => ({ ...f, [phraseId]: true }))
          starPlayCountRef.current[phraseId] = 0
        }
      }

      if (useTTS) {
        // TTS 模式：先確保電影音靜音，避免重疊
        if (audioElRef.current) audioElRef.current.pause()
        window.speechSynthesis?.cancel()

        const goNext = () => {
          if (!starLoopActiveRef.current || starLoopPausedRef.current) return
          markAutoFamiliar(p.id)
          starLoopRef.current = setTimeout(() => playStarPhrase(list, realIdx + 1), 600)
        }

        if (isReverse) {
          // 反向模式：先播中文 → 停頓 1.2 秒 → 再播英文
          const uttZh = new SpeechSynthesisUtterance(p.zh || p.en)
          uttZh.lang = 'zh-TW'; uttZh.rate = playRate
          uttZh.onend = () => {
            if (!starLoopActiveRef.current || starLoopPausedRef.current) return
            starLoopRef.current = setTimeout(() => {
              if (!starLoopActiveRef.current || starLoopPausedRef.current) return
              const uttEn = new SpeechSynthesisUtterance(p.en)
              uttEn.lang = 'en-US'; uttEn.rate = playRate
              uttEn.onend  = goNext
              uttEn.onerror = goNext
              window.speechSynthesis?.speak(uttEn)
            }, 1200)
          }
          uttZh.onerror = () => {
            // 中文 TTS 失敗，直接播英文
            if (!starLoopActiveRef.current || starLoopPausedRef.current) return
            const uttEn = new SpeechSynthesisUtterance(p.en)
            uttEn.lang = 'en-US'; uttEn.rate = playRate
            uttEn.onend = goNext; uttEn.onerror = goNext
            window.speechSynthesis?.speak(uttEn)
          }
          window.speechSynthesis?.speak(uttZh)
        } else {
          // 一般模式：只播英文
          const utt = new SpeechSynthesisUtterance(p.en)
          utt.lang = 'en-US'; utt.rate = playRate
          utt.onend  = goNext
          utt.onerror = goNext
          window.speechSynthesis?.speak(utt)
        }
        return
      }

      const el = audioElRef.current
      if (!el) return

      // 停止 TTS，避免與電影音重疊
      window.speechSynthesis?.cancel()

      const endSecs   = p.endSecs ?? (secs + 4)
      const phraseDur = endSecs - secs
      const targetFile = getJerryMp3(secs)

      // 清除舊的 timeupdate handler
      if (starTimeUpdateRef.current) {
        el.removeEventListener('timeupdate', starTimeUpdateRef.current)
        starTimeUpdateRef.current = null
      }
      clearTimeout(starLoopRef.current)

      const scheduleNext = () => {
        if (!starLoopActiveRef.current || starLoopPausedRef.current) return
        markAutoFamiliar(p.id)
        starLoopRef.current = setTimeout(() => playStarPhrase(list, realIdx + 1), 300)
      }

      const doPlay = () => {
        if (!starLoopActiveRef.current || starLoopPausedRef.current) return
        el.currentTime = secs - targetFile.start
        el.playbackRate = playRate

        el.play().catch(() => {
          // play() 被拒絕時（如背景限制），等一下再試
          starLoopRef.current = setTimeout(() => {
            if (!starLoopActiveRef.current || starLoopPausedRef.current) return
            el.play().catch(() => scheduleNext())
          }, 500)
        })

        // 主要觸發：timeupdate 監聽到達 endSecs
        const handler = () => {
          const pos = el.currentTime + targetFile.start
          if (pos >= endSecs - 0.08) {
            el.removeEventListener('timeupdate', handler)
            starTimeUpdateRef.current = null
            clearTimeout(starLoopRef.current)
            el.pause()
            scheduleNext()
          }
        }
        starTimeUpdateRef.current = handler
        el.addEventListener('timeupdate', handler)

        // 備用：setTimeout（比預期時間多 1.5 秒，只在 timeupdate 失效時觸發）
        starLoopRef.current = setTimeout(() => {
          if (!starTimeUpdateRef.current) return // timeupdate 已正常觸發，不重複
          el.removeEventListener('timeupdate', handler)
          starTimeUpdateRef.current = null
          el.pause()
          scheduleNext()
        }, (phraseDur / playRate) * 1000 + 1500)
      }

      // 判斷是否需要切換 MP3 檔案（用 audioSrcKeyRef 比對原始 URL，不受 blobURL 干擾）
      const needSwitch = audioSrcKeyRef.current !== targetFile.url

      if (needSwitch) {
        el.pause()
        // 清除舊 timeupdate 避免殘留
        if (starTimeUpdateRef.current) {
          el.removeEventListener('timeupdate', starTimeUpdateRef.current)
          starTimeUpdateRef.current = null
        }
        clearTimeout(starLoopRef.current)
        loadAudioUrl(targetFile.url, `征服情海 Part ${JERRY_MP3.indexOf(targetFile) + 1}`)
        // 等待 canplay 後再播（loadAudioUrl 是 async，canplay 由它觸發）
        el.addEventListener('canplay', doPlay, { once: true })
      } else {
        doPlay()
      }
    }

    const startStarLoop = (group) => {
      const list = group === 'familiar'   ? familiarList :
                   group === 'unfamiliar' ? unfamiliarList : allPhrases
      if (list.length === 0) {
        alert(group === 'familiar' ? '還沒有熟悉的句子' :
              group === 'unfamiliar' ? '所有句子都已熟悉！' : '沒有重點句子')
        return
      }
      stopStarLoop()
      starPlayCountRef.current = {}  // 重置播放計數
      starLoopListRef.current = list
      starLoopActiveRef.current = true
      setStarLoopMode(group)
      setStarLoopIdx(0)
      playStarPhrase(list, 0)
      // 睡眠計時器
      clearTimeout(starSleepRef.current)
      if (starSleepMins > 0) {
        const endTs = Date.now() + starSleepMins * 60 * 1000
        setStarSleepEnd(endTs)
        starSleepRef.current = setTimeout(() => {
          stopStarLoop()
          setStarSleepEnd(null)
        }, starSleepMins * 60 * 1000)
      } else {
        setStarSleepEnd(null)
      }
    }

    // 舊名稱相容
    const playStarAt = playStarPhrase

    const playSingle = (p) => {
      if (audioMode !== 'original') {
        // TTS 模式
        window.speechSynthesis?.cancel()
        const utt = new SpeechSynthesisUtterance(p.en)
        utt.lang = 'en-US'; utt.rate = playRate
        window.speechSynthesis?.speak(utt)
        return
      }
      if (!audioElRef.current) return
      const secs = p.startSecs ?? 0
      const end  = p.endSecs   ?? (secs + 4)
      const targetFile = getJerryMp3(secs)
      const el = audioElRef.current
      if (el.src !== targetFile.url) el.src = targetFile.url
      el.currentTime = secs - targetFile.start
      el.playbackRate = playRate
      el.play()
      clearTimeout(audioStopRef.current)
      audioStopRef.current = setTimeout(() => el.pause(), (end - secs) * 1000 / playRate + 300)
    }

    const copyTxt = (txt) => {
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).catch(() => {})
      else { const el = document.createElement('textarea'); el.value = txt; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el) }
      showMovieToast('✅ 已複製')
    }

    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100%' }} className="fadeUp">
        {/* Movie Toast 提示 */}
        {movieToast && (
          <div style={{ position:'fixed', top:70, left:'50%', transform:'translateX(-50%)',
            background:'#1a1a2e', border:`1px solid ${T.amber}60`, borderRadius:20,
            padding:'8px 18px', fontFamily:MONO, fontSize:11, color:T.amber,
            zIndex:9998, whiteSpace:'nowrap', animation:'fadeUp 0.2s ease', pointerEvents:'none' }}>
            {movieToast}
          </div>
        )}
        {/* ── 固定 Header 區（不 scroll）── */}
        <div style={{ flexShrink:0, background:T.bg, borderBottom:`1px solid ${T.bdr}`,
          padding:'46px 16px 12px', display:'flex', flexDirection:'column', gap:10 }}>
          {/* 篩選 + 反向 + 播放列（合併）*/}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          {[
            ['list',       `📋 全部(${allPhrases.length})`],
            ['familiar',   `✓ 熟悉(${familiarList.length})`],
            ['unfamiliar', `✗ 加強(${unfamiliarList.length})`],
          ].map(([mode, label]) => (
            <div key={mode} onClick={() => { setStarMode(mode); setStarFlip({}) }}
              style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                padding:'6px 10px', borderRadius:8,
                color: starMode===mode ? T.amber : T.txt3,
                background: starMode===mode ? T.amberD : T.surf2,
                border:`1px solid ${starMode===mode ? T.amber+'60' : T.bdr}` }}>
              {label}
            </div>
          ))}
          {/* 反向開關 */}
          <div onClick={() => { setStarReverse(r => !r); setStarFlip({}) }}
            style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
              padding:'6px 10px', borderRadius:8,
              color: starReverse ? T.blue : T.txt3,
              background: starReverse ? T.blueD : T.surf2,
              border:`1px solid ${starReverse ? T.blue+'60' : T.bdr}` }}>
            🔄 反向{starReverse ? ' ON' : ''}
          </div>
          {/* ▶ 播放當前篩選 / ⏹ 停止 */}
          {starLoopMode != null ? (
            <div onClick={stopStarLoop}
              style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                color:'#f87171', padding:'6px 10px', background:'#3a1a1a',
                borderRadius:8, border:'1px solid #f8717150', animation:'micPulse 1s infinite' }}>
              ⏹ 停止
            </div>
          ) : (
            <div onClick={() => {
              const group = starMode === 'familiar' ? 'familiar'
                          : starMode === 'unfamiliar' ? 'unfamiliar' : 'all'
              startStarLoop(group)
            }}
              style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                color:T.amber, padding:'6px 10px', background:T.amberD,
                borderRadius:8, border:`1px solid ${T.amber}50` }}>
              🔁 播放
            </div>
          )}
          {/* 語速選擇器 */}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>🔊 語速：</span>
            {[0.6, 0.8, 1.0].map(r => (
              <div key={r} onClick={() => {
                setPlayRate(r)
                localStorage.setItem('fsi:movie:playRate', String(r))
              }}
                style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                  padding:'4px 8px', borderRadius:7,
                  color: playRate===r ? T.amber : T.txt3,
                  background: playRate===r ? T.amberD : T.surf2,
                  border:`1px solid ${playRate===r ? T.amber+'60' : T.bdr}` }}>
                {r === 0.6 ? '0.6x' : r === 0.8 ? '0.8x' : '1.0x'}
              </div>
            ))}
          </div>
          {/* 睡眠計時器 */}
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>😴 睡眠計時：</span>
          {[0, 10, 20, 30].map(m => (
            <div key={m} onClick={() => setStarSleepMins(m)}
              style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                padding:'4px 8px', borderRadius:7,
                color: starSleepMins===m ? T.blue : T.txt3,
                background: starSleepMins===m ? T.blueD : T.surf2,
                border:`1px solid ${starSleepMins===m ? T.blue+'60' : T.bdr}` }}>
              {m === 0 ? '∞' : m+'分'}
            </div>
          ))}
          {starSleepRemain != null && starLoopMode != null && (
            <span style={{ fontFamily:MONO, fontSize:9, color:T.amber, fontWeight:700 }}>
              ⏱ {Math.floor(starSleepRemain/60)}:{String(starSleepRemain%60).padStart(2,'0')}
            </span>
          )}
          </div>
          {/* 循環播放進度 */}
          {starLoopMode != null && (
            <div style={{ fontFamily:MONO, fontSize:9,
              color: starLoopMode==='familiar' ? T.grn : starLoopMode==='unfamiliar' ? '#f87171' : T.amber,
              textAlign:'center', padding:'6px', background:T.surf2, borderRadius:8 }}>
              🔁 {starLoopMode==='familiar' ? '熟悉' : starLoopMode==='unfamiliar' ? '加強' : '全部'} 無限循環
              · 第 {starLoopIdx+1} / {(starLoopMode==='familiar' ? familiarList : starLoopMode==='unfamiliar' ? unfamiliarList : allPhrases).length} 句
            </div>
          )}
        </div>{/* end fixed header */}

        {/* ── Scroll 卡片區 ── */}
        <div style={{ flex:1, overflowY:'auto', padding:'12px 16px 80px', display:'flex', flexDirection:'column', gap:12 }}>
        {allPhrases.length === 0 ? (
          <div style={{ fontFamily:MONO, fontSize:11, color:T.txt3, textAlign:'center', padding:32 }}>
            還沒有收藏重點句，進入場景點 ⭐ 收藏
          </div>
        ) : practiceList.length === 0 ? (
          <div style={{ fontFamily:MONO, fontSize:11, color:T.txt3, textAlign:'center', padding:32 }}>
            {starMode === 'familiar' ? '還沒有標記熟悉的句子' : '所有句子都已熟悉！'}
          </div>
        ) : practiceList.map((p, idx) => {
          const flipped    = !!starFlip[p.id]
          const isFamiliar = !!starFamiliar[p.id]
          const loopList   = starLoopMode==='familiar' ? familiarList : starLoopMode==='unfamiliar' ? unfamiliarList : allPhrases
          const isPlaying  = starLoopMode != null && starLoopIdx === loopList.findIndex(x => x.id === p.id)
          return (
            <div key={p.id ?? idx}
              ref={el => { if (el) starCardRefs.current[p.id] = el }}
              style={{ background:T.surf, borderRadius:12, padding:'12px 14px',
              border:`2px solid ${isPlaying ? T.amber : isFamiliar ? T.grn+'50' : T.amber+'30'}`,
              display:'flex', flexDirection:'column', gap:6,
              boxShadow: isPlaying ? `0 0 12px ${T.amber}40` : 'none' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontFamily:MONO, fontSize:9, color:T.amber, opacity:0.7 }}>{p.sceneName}</span>
                <div style={{ display:'flex', gap:5 }}>
                  <div onClick={() => playSingle(p)}
                    style={{ cursor:'pointer', fontFamily:MONO, fontSize:10, color:T.txt2,
                      padding:'2px 7px', background:T.surf2, borderRadius:6, border:`1px solid ${T.bdr}` }}>
                    🔊
                  </div>
                  <div onClick={() => copyTxt(p.en)}
                    style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.blue,
                      padding:'2px 7px', background:T.blueD, borderRadius:6, border:`1px solid ${T.blue}40` }}>
                    📋
                  </div>
                  <div onClick={() => {
                      const cgpt =
                        'You are my FSI English Coach.\n\n' +
                        'Student Profile:\n' +
                        '- 55-year-old Taiwanese adult\n' +
                        '- English level: Intermediate-Beginner\n' +
                        '- Works in Vietnam factory management\n' +
                        '- Goal: Speak English automatically in meetings and daily conversations\n\n' +
                        'Teaching Method:\n' +
                        'Use FSI-style drills only.\n' +
                        'Do NOT explain grammar unless necessary.\n' +
                        'Do NOT ask discussion questions.\n' +
                        'Do NOT ask movie analysis questions.\n' +
                        'Do NOT ask personal opinion questions.\n\n' +
                        'Focus on: Repetition / Substitution / Transformation / Automatic speaking\n\n' +
                        'Rules:\n' +
                        '- Speak very slowly.\n' +
                        '- Use simple English only.\n' +
                        '- One instruction at a time.\n' +
                        '- Wait for my answer.\n' +
                        '- Correct only major mistakes.\n' +
                        '- Keep responses under 15 words.\n' +
                        '- No long explanations.\n' +
                        '- No Chinese.\n\n' +
                        'STEP 1 - Repeat: Read the sentence slowly. Ask me to repeat.\n\n' +
                        'STEP 2 - Substitution Drill: Change one word. Wait for my answer. Do 5-10 substitutions.\n\n' +
                        'STEP 3 - Transformation Drill: Change I / You / We / They / Present / Past / Future\n\n' +
                        'STEP 4 - Vietnam Factory Drill: Create 5 examples related to Quality / Customer complaint / Production / Meeting / Teamwork\n\n' +
                        'STEP 5 - Speed Round: Ask 5 rapid substitutions. Then move to the next phrase.\n\n' +
                        'Movie: Jerry Maguire\n' +
                        'Scene: ' + (p.sceneName ?? '') + '\n' +
                        'Phrase: ' + p.en + '\n\n' +
                        'Start immediately. Do not explain. Do not analyze. Only drill.'
                      copyTxt(cgpt)
                    }}
                    style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:'#c084fc',
                      padding:'2px 7px', background:'#2d1a4a', borderRadius:6, border:'1px solid #c084fc40' }}>
                    📤
                  </div>
                  {/* ★ Unstar 按鈕 */}
                  <div onClick={() => toggleStarGlobal(p.id)}
                    title="取消收藏"
                    style={{ cursor:'pointer', fontSize:13, lineHeight:1,
                      padding:'2px 6px', borderRadius:6,
                      background:'#2a1f00', border:`1px solid ${T.amber}40`,
                      color:T.amber, transition:'opacity 0.15s' }}>
                    ★
                  </div>
                </div>
              </div>

              {/* 反向模式：先顯示中文，點翻牌看英文 */}
              {isReverse ? (
                <>
                  <div style={{ fontFamily:MONO, fontSize:12, color:T.txt, lineHeight:1.6 }}>
                    {p.zh || '（無中文）'}
                  </div>
                  {flipped ? (
                    <div style={{ fontFamily:MONO, fontSize:13, color:T.amber, lineHeight:1.6,
                      background:T.amberD, borderRadius:8, padding:'8px 10px' }}>
                      {p.en}
                    </div>
                  ) : (
                    <div onClick={() => setStarFlip(prev => ({ ...prev, [p.id]: true }))}
                      style={{ cursor:'pointer', fontFamily:MONO, fontSize:10, color:T.txt3,
                        textAlign:'center', padding:'10px', background:T.surf2, borderRadius:8,
                        border:`1px solid ${T.bdr}` }}>
                      👆 點擊看英文
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontFamily:MONO, fontSize:13, color:T.txt, lineHeight:1.6 }}>{p.en}</div>
                  {p.zh && <div style={{ fontFamily:MONO, fontSize:10, color:T.txt3, lineHeight:1.5 }}>{p.zh}</div>}
                </>
              )}

              {p.reason && (
                <div style={{ fontFamily:MONO, fontSize:9, color:T.amber, opacity:0.8 }}>
                  {'★'.repeat(p.rating ?? 3)} {p.reason}
                </div>
              )}

              {/* 熟悉度標記 */}
              <div style={{ display:'flex', gap:6, marginTop:2 }}>
                <div onClick={() => {
                  setStarFamiliar(prev => ({ ...prev, [p.id]: true }))
                  // 同步寫入 movieDB（讓 Sheets 同步保留）
                  saveDb({ ...db, movies: db.movies.map(m => ({
                    ...m, scenes: (m.scenes ?? []).map(s => ({
                      ...s, phrases: (s.phrases ?? []).map(ph =>
                        ph.id === p.id ? { ...ph, familiar: true } : ph)
                    }))
                  })) })
                }}
                  style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                    color: isFamiliar ? T.grn : T.txt3,
                    padding:'4px 10px', background: isFamiliar ? T.grnD : T.surf2,
                    borderRadius:6, border:`1px solid ${isFamiliar ? T.grn+'50' : T.bdr}` }}>
                  ✓ 熟悉
                </div>
                <div onClick={() => {
                  setStarFamiliar(prev => ({ ...prev, [p.id]: false }))
                  saveDb({ ...db, movies: db.movies.map(m => ({
                    ...m, scenes: (m.scenes ?? []).map(s => ({
                      ...s, phrases: (s.phrases ?? []).map(ph =>
                        ph.id === p.id ? { ...ph, familiar: false } : ph)
                    }))
                  })) })
                }}
                  style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
                    color: !isFamiliar ? '#f87171' : T.txt3,
                    padding:'4px 10px', background: !isFamiliar ? '#3a1a1a' : T.surf2,
                    borderRadius:6, border:`1px solid ${!isFamiliar ? '#f8717150' : T.bdr}` }}>
                  ✗ 加強
                </div>
              </div>
            </div>
          )
        })}
        </div>
      </div>
    </div>
    )
  }

  if (view === 'memory') {
    const allScenes = db.movies.flatMap(m => m.scenes ?? [])
    const allPhrases = allScenes.flatMap(s =>
      (s.phrases ?? []).map(p => ({ ...p, sceneName: s.name }))
    )
    const memPhrases = allPhrases.filter(p =>
      memoryFilter === '5' ? Number(p.rating) === 5 :
      memoryFilter === '4' ? Number(p.rating) === 4 :
      (Number(p.rating) === 4 || Number(p.rating) === 5)
    )
    return (
      <div style={{ padding:'16px 16px 80px', display:'flex', flexDirection:'column', gap:12 }} className="fadeUp">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <BackBtn label="← 返回" to="list"/>
          <span style={{ fontFamily:MONO, fontSize:11, color:T.amber }}>📚 背誦庫</span>
        </div>
        {/* 篩選 */}
        <div style={{ display:'flex', gap:6 }}>
          {[['5','★5 必背'],['4','★4 推薦'],['all','全部 4+5']].map(([val, label]) => (
            <div key={val} onClick={() => setMemoryFilter(val)}
              style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:10, fontWeight:700,
                textAlign:'center', padding:'8px 4px', borderRadius:9,
                background: memoryFilter===val ? T.amberD : T.surf2,
                border:`1px solid ${memoryFilter===val ? T.amber+'60' : T.bdr}`,
                color: memoryFilter===val ? T.amber : T.txt3 }}>
              {label}
            </div>
          ))}
        </div>
        <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
          共 {memPhrases.length} 句
        </div>
        {memPhrases.length === 0 ? (
          <div style={{ fontFamily:MONO, fontSize:11, color:T.txt3, textAlign:'center',
            padding:'40px 20px', background:T.surf, borderRadius:13 }}>
            尚無符合條件的句子<br/>
            <span style={{ fontSize:9 }}>請先用「🌟 AI 評分」為場景評分</span>
          </div>
        ) : (
          <>
            {/* 反向練習入口 */}
            <div onClick={() => {
                setRevIdx(0); setRevFlip(false)
                setActivePhrases(memPhrases)
                setView('reverse')
              }}
              style={{ background:T.amber, borderRadius:11, padding:'12px',
                textAlign:'center', cursor:'pointer',
                fontFamily:MONO, fontSize:12, fontWeight:700, color:T.bg }}>
              🔄 開始反向練習（{memPhrases.length} 句）
            </div>
            {/* 句子列表 */}
            {memPhrases.map((p, i) => (
              <div key={p.id ?? i} style={{ background:T.surf, borderRadius:12,
                padding:'12px 14px', border:`1px solid ${p.rating===5 ? T.amber+'40' : T.bdr}` }}>
                <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, marginBottom:4 }}>
                  {p.sceneName}
                </div>
                <div style={{ fontFamily:MONO, fontSize:12, color:T.txt, lineHeight:1.7, marginBottom:4 }}>
                  {p.en}
                </div>
                <div style={{ fontFamily:MONO, fontSize:11, color:T.txt3, marginBottom:6 }}>
                  {p.zh}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:13, letterSpacing:1 }}>
                    {'⭐'.repeat(Number(p.rating) || 4)}
                  </span>
                  {p.reason && (
                    <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>{p.reason}</span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // LIST VIEW (default — scene list)
  // ══════════════════════════════════════════════════════════════
  const totalPhrases = movie?.scenes.reduce((a,s) => a+s.phrases.length, 0) ?? 0
  const totalPlayed  = movie?.scenes.reduce((a,s) => a+s.phrases.filter(p=>p.played).length, 0) ?? 0
  const totalPct     = totalPhrases ? Math.round((totalPlayed/totalPhrases)*100) : 0

  return (
    <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:12 }} className="fadeUp">
      {/* Movie header */}
      <div style={{ background:T.surf, borderRadius:14, padding:'18px 20px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <span style={{ fontSize:20 }}>🎬</span>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:DISP, fontSize:16, color:T.txt }}>{movie?.title}</div>
            <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>{movie?.titleEn} · {movie?.year}</div>
          </div>
          {/* 自動同步狀態 */}
          <div style={{ fontFamily:MONO, fontSize:8, color:
            autoSyncStatus === 'syncing' ? T.amber :
            autoSyncStatus === 'ok' ? T.grn : T.txt3 }}>
            {autoSyncStatus === 'syncing' ? '⟳ 同步中' :
             autoSyncStatus === 'ok' ? '✓ 已同步' : ''}
          </div>
          <div onClick={() => { setTranscriptDraft(''); setTranscriptEditMode(false); setStartTime(''); setEndTime(''); setAddPreview(null); setAddErr(''); setView('manageTranscript') }}
            style={{ cursor:'pointer', fontFamily:MONO, fontSize:10, fontWeight:700,
              color:T.amber, background:T.amberD, border:`1px solid ${T.amber}50`,
              borderRadius:8, padding:'5px 10px', whiteSpace:'nowrap' }}>
            ＋ 新增場景
          </div>
        </div>
        {/* 場景搜尋列 */}
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6,
          background:T.surf2, borderRadius:9, padding:'6px 10px',
          border:`1px solid ${sceneSearch ? T.amber+'50' : T.bdr}` }}>
          <span style={{ fontSize:12 }}>🔍</span>
          <input
            type="text"
            placeholder="搜尋場景標題…"
            value={sceneSearch}
            onChange={e => {
              const q = e.target.value
              setSceneSearch(q)
              if (q.trim()) {
                // 找到第一個符合的場景 → scroll 到該卡片
                setTimeout(() => {
                  const el = document.getElementById('scene-search-highlight')
                  if (el) el.scrollIntoView({ behavior:'smooth', block:'center' })
                }, 50)
              }
            }}
            style={{ flex:1, background:'transparent', border:'none', outline:'none',
              fontFamily:'monospace', fontSize:12, color:'#fff' }}
          />
          {sceneSearch && (
            <span onClick={() => setSceneSearch('')}
              style={{ cursor:'pointer', fontFamily:'monospace', fontSize:11,
                color:T.txt3, padding:'0 2px' }}>✕</span>
          )}
        </div>
        {/* MP3 狀態 + 重新選擇同一行 */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10,
          background:T.surf2, borderRadius:9, padding:'8px 12px',
          border:`1px solid ${audioReady ? T.grn+'50' : T.bdr}` }}>
          <span style={{ fontFamily:MONO, fontSize:9, flex:1, overflow:'hidden',
            textOverflow:'ellipsis', whiteSpace:'nowrap',
            color: audioReady ? T.grn : T.txt3 }}>
            {audioReady
              ? `☁️ ${audioFileName} ✅ 雲端已載入`
              : audioFileName?.startsWith('❌')
                ? '⚠️ 載入失敗，請重新載入'
                : audioFileName
                  ? `⏳ 載入中… ${audioFileName}`
                  : '⏳ 自動載入雲端 MP3…'}
          </span>
          {/* Part 2 狀態 */}
          <span style={{ fontFamily:MONO, fontSize:9, flexShrink:0,
            color: part2Status==='cached' ? T.grn : part2Status==='loading' ? T.amber : T.txt3 }}>
            {part2Status==='cached' ? '📦 P2 ✅'
             : part2Status==='loading' ? '⏳ P2…'
             : part2Status==='error'   ? '⚠️ P2'
             : '📦 P2 -'}
          </span>
          <div onClick={() => loadAudioUrl(JERRY_MP3[0].url, '征服情海 Part 1')}
            style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, fontWeight:700,
              color:T.grn, padding:'4px 10px', background:T.grnD,
              borderRadius:7, border:`1px solid ${T.grn}50`, whiteSpace:'nowrap', flexShrink:0 }}>
            ↺ 重新載入
          </div>
          <input id="fsi-audio-input" type="file" accept="audio/*" style={{ display:'none' }}
            onChange={e => e.target.files[0] && loadAudioFile(e.target.files[0], JERRY_MP3[0].url)}/>
          <input id="fsi-audio-input-p2" type="file" accept="audio/*" style={{ display:'none' }}
            onChange={e => e.target.files[0] && loadAudioFile(e.target.files[0], JERRY_MP3[1].url)}/>
        </div>
        <div style={{ background:T.bdr, borderRadius:4, height:6, overflow:'hidden', marginBottom:6 }}>
          <div style={{ width:`${totalPct}%`, height:'100%',
            background:`linear-gradient(90deg,${T.amber},${T.amber}cc)`, transition:'width 0.3s' }}/>
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
            總進度 {totalPlayed}/{totalPhrases} 句 · {totalPct}% · {movie?.scenes.length ?? 0} 個場景
          </span>
          <span onClick={() => { setTranscriptDraft(''); setTranscriptEditMode(false); setView('manageTranscript') }}
            style={{ cursor:'pointer', fontFamily:MONO, fontSize:9,
              color: movie?.transcript ? T.grn : T.txt3,
              background: movie?.transcript ? T.grnD : T.surf2,
              border:`1px solid ${movie?.transcript ? T.grn+'40' : T.bdr}`,
              padding:'2px 9px', borderRadius:8 }}>
            {movie?.transcript ? `📄 逐字稿已存` : '📄 存逐字稿'}
          </span>
        </div>
      </div>
      {/* 單字庫 + 背誦庫 並排 */}
      <div style={{ display:'flex', gap:8 }}>
        <div onClick={() => setView('vocab')}
          style={{ flex:1, border:`1px solid ${db.vocab.length ? T.blue+'50' : T.bdr}`, borderRadius:12, padding:'13px',
            display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer',
            background: db.vocab.length ? T.blueD : T.surf }}>
          <span style={{ fontFamily:MONO, fontSize:11, color: db.vocab.length ? T.blue : T.txt2 }}>📖 單字庫</span>
          <span style={{ fontFamily:MONO, fontSize:11, color:T.amber }}>{db.vocab.length} →</span>
        </div>
        {(() => {
          const allPhrases = (db.movies ?? []).flatMap(m => (m.scenes ?? []).flatMap(s => s.phrases ?? []))
          const memCount   = allPhrases.filter(p => Number(p.rating) === 4 || Number(p.rating) === 5).length
          const starCount  = allPhrases.filter(p => p.starred).length
          return (
            <>
              <div onClick={() => setView('memory')}
                style={{ flex:1, border:`1px solid ${memCount ? T.amber+'50' : T.bdr}`, borderRadius:12, padding:'13px',
                  display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer',
                  background: memCount ? T.amberD : T.surf }}>
                <span style={{ fontFamily:MONO, fontSize:11, color: memCount ? T.amber : T.txt2 }}>📚 背誦庫</span>
                <span style={{ fontFamily:MONO, fontSize:11, color:T.amber }}>{memCount} →</span>
              </div>
              <div onClick={() => setView('starred')}
                style={{ flex:1, border:`1px solid ${starCount ? T.amber+'50' : T.bdr}`, borderRadius:12, padding:'13px',
                  display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer',
                  background: starCount ? T.amberD : T.surf }}>
                <span style={{ fontFamily:MONO, fontSize:11, color: starCount ? T.amber : T.txt2 }}>⭐ 重點句</span>
                <span style={{ fontFamily:MONO, fontSize:11, color:T.amber }}>{starCount} →</span>
              </div>
            </>
          )
        })()}
      </div>
      {/* Scene cards（最新在最上面）*/}
      {[...(movie?.scenes ?? [])].reverse().map((s, idx) => {
        const sceneNo = (movie?.scenes?.length ?? 0) - idx  // 反向後第1個=最新=最大序號
        const sp  = s.phrases.filter(p=>p.played).length
        const spc = s.phrases.length ? Math.round((sp/s.phrases.length)*100) : 0
        const isDone = s.done === true
        const st  = isDone ? 'done' : spc===100 ? 'done' : spc>0 ? 'active' : 'new'
        const sceneName = s.name ?? s.title ?? ''
        const sceneNoStr = String(sceneNo).padStart(2,'0') // '01','02'…
        const q = sceneSearch.trim().toLowerCase()
        const isMatch = q !== '' && (
          sceneName.toLowerCase().includes(q) ||  // 標題符合
          sceneNoStr.includes(q) ||               // 序號符合（如 '01','18'）
          String(sceneNo) === q                   // 純數字直接符合（如 '1'）
        )
        const isFirstMatch = isMatch && [...(movie?.scenes ?? [])].reverse()
          .findIndex((sc, i2) => {
            const n2 = (sc.name ?? sc.title ?? '').toLowerCase()
            const no2 = String((movie?.scenes?.length ?? 0) - i2).padStart(2,'0')
            return n2.includes(q) || no2.includes(q) || String((movie?.scenes?.length ?? 0) - i2) === q
          }) === idx
        return (
          <div key={s.id}
            id={isFirstMatch ? 'scene-search-highlight' : undefined}
            onClick={() => { setSceneId(s.id); setView('scene') }}
            style={{ background: isMatch ? '#2a1f00' : T.surf,
              border:`1px solid ${isFirstMatch ? T.amber : isDone ? T.grn+'60' : st==='active' ? T.amber+'60' : T.bdr}`,
              boxShadow: isFirstMatch ? `0 0 0 2px ${T.amber}40` : 'none',
              borderRadius:13, padding:'15px 16px', cursor:'pointer', transition:'border-color 0.15s' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
              <div onClick={e => {
                  e.stopPropagation()
                  saveDb({ ...db, movies: db.movies.map(m => m.id !== movieId ? m : {
                    ...m, scenes: m.scenes.map(sc => sc.id !== s.id ? sc : { ...sc, done: !sc.done })
                  })})
                }}
                title={isDone ? '取消完成標記' : '標記為訓練完畢'}
                style={{ cursor:'pointer', fontSize:16, lineHeight:1,
                  opacity: isDone ? 1 : 0.3, transition:'opacity 0.15s', userSelect:'none' }}>
                {isDone ? '✅' : st==='active' ? '🟡' : '⭕'}
              </div>
              <span style={{ fontFamily:'monospace', fontSize:10, color:T.amber,
                background:'#2a1f00', border:`1px solid ${T.amber}40`,
                borderRadius:5, padding:'1px 5px', flexShrink:0, letterSpacing:'0.05em' }}>
                {String(sceneNo).padStart(2,'0')}
              </span>
              {editingSceneNameId === s.id ? (
                <input
                  autoFocus
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false"
                  value={editingSceneNameText}
                  onChange={e => setEditingSceneNameText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (editingSceneNameText.trim()) {
                        saveDb({ ...db, movies: db.movies.map(m => m.id !== movieId ? m : {
                          ...m, scenes: m.scenes.map(sc => sc.id !== s.id ? sc : { ...sc, name: editingSceneNameText.trim() })
                        })})
                      }
                      setEditingSceneNameId(null)
                    }
                    if (e.key === 'Escape') setEditingSceneNameId(null)
                  }}
                  onBlur={() => {
                    if (editingSceneNameText.trim()) {
                      saveDb({ ...db, movies: db.movies.map(m => m.id !== movieId ? m : {
                        ...m, scenes: m.scenes.map(sc => sc.id !== s.id ? sc : { ...sc, name: editingSceneNameText.trim() })
                      })})
                    }
                    setEditingSceneNameId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{ flex:1, fontFamily:MONO, fontSize:12, color:T.txt,
                    background:T.surf2, border:`1px solid ${T.amber}80`,
                    borderRadius:7, padding:'3px 8px', outline:'none' }}
                />
              ) : (
                <span style={{ fontFamily:MONO, fontSize:12, color: isDone ? T.grn : T.txt,
                  fontWeight:st==='active'?600:400, flex:1,
                  textDecoration: isDone ? 'line-through' : 'none' }}>
                  {s.name}
                </span>
              )}
              <div onClick={e => {
                  e.stopPropagation()
                  const sceneTitle = s.name ?? s.title ?? ''
                  const starred = (s.phrases ?? []).filter(p => p.starred)
                  const phraseList = starred.slice(0, 7).map((p, i) => (i+1) + '. ' + p.en).join('\n')
                  const firstPhrase = starred.length > 0 ? starred[0].en : (s.phrases?.[0]?.en ?? '')
                  const gptPrompt = 'You are my FSI English Coach.\n\n' +
                    'Student Profile:\n' +
                    '- 55-year-old Taiwanese adult\n' +
                    '- English level: Intermediate-Beginner\n' +
                    '- Works in Vietnam factory management\n' +
                    '- Goal: Speak English automatically in meetings and daily conversations\n\n' +
                    'Teaching Method:\n' +
                    'Use FSI-style drills only.\n' +
                    'Do NOT explain grammar unless necessary.\n' +
                    'Do NOT ask discussion questions.\n' +
                    'Do NOT ask movie analysis questions.\n' +
                    'Do NOT ask personal opinion questions.\n\n' +
                    'Focus on: Repetition / Substitution / Transformation / Automatic speaking\n\n' +
                    'Rules:\n' +
                    '- Speak very slowly.\n' +
                    '- Use simple English only.\n' +
                    '- One instruction at a time.\n' +
                    '- Wait for my answer.\n' +
                    '- Correct only major mistakes.\n' +
                    '- Keep responses under 15 words.\n' +
                    '- No long explanations.\n' +
                    '- No Chinese.\n\n' +
                    'STEP 1 - Repeat: Read the sentence slowly. Ask me to repeat.\n\n' +
                    'STEP 2 - Substitution Drill: Change one word. Wait for my answer. Do 5-10 substitutions.\n\n' +
                    'STEP 3 - Transformation Drill: Change I / You / We / They / Present / Past / Future\n\n' +
                    'STEP 4 - Vietnam Factory Drill: Create 5 examples related to Quality / Customer complaint / Production / Meeting / Teamwork\n\n' +
                    'STEP 5 - Speed Round: Ask 5 rapid substitutions. Then move to the next phrase.\n\n' +
                    'Movie: Jerry Maguire\n' +
                    'Scene: ' + sceneTitle + '\n' +
                    'Phrases:\n' + (phraseList || '（此場景尚無重點句）') + '\n\n' +
                    'Start immediately. Do not explain. Do not analyze. Only drill.'
                  const fallback = () => { const el = document.createElement('textarea'); el.value = gptPrompt; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el) }
                  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(gptPrompt).then(() => {}).catch(fallback)
                  else fallback()
                  showMovieToast('✅「' + sceneTitle + '」指令已複製')
                }}
                style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:'#c084fc',
                  padding:'2px 6px', background:'#2d1a4a', borderRadius:5,
                  border:'1px solid #c084fc50', marginRight:4, fontWeight:700 }}>🤖 GPT</div>
              <div onClick={e => { e.stopPropagation(); setEditingSceneNameId(s.id); setEditingSceneNameText(s.name) }}
                style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.txt3,
                  padding:'2px 6px', background:T.surf2, borderRadius:5, border:`1px solid ${T.bdr}`,
                  marginRight:4 }}>✏️</div>
              <div onClick={e=>{e.stopPropagation();deleteScene(s.id)}}
                style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:T.txt3,
                  padding:'2px 6px', background:T.surf2, borderRadius:5, border:`1px solid ${T.bdr}` }}>✕</div>
            </div>
            <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, marginBottom: spc>0?7:0 }}>
              {s.timeRange} · {s.phrases.length} 句
              {(() => {
                const starCount = s.phrases.filter(p => p.starred).length
                return starCount > 0
                  ? <span style={{ color:T.amber, marginLeft:4 }}>· ⭐{starCount} 重點</span>
                  : null
              })()}
              {isDone && <span style={{ color:T.grn, marginLeft:6 }}>✓ 訓練完畢</span>}
            </div>
          </div>
        )
      })}
            {/* ── 雲端 MP3 設定 ── */}
      <div style={{ display:'flex', flexDirection:'column', gap:8,
        background:T.surf, border:`1px solid ${audioReady ? T.grn+'50' : T.bdr}`, borderRadius:13, padding:'14px 16px' }}>
        <div style={{ fontFamily:MONO, fontSize:9, color:T.txt2, letterSpacing:'0.1em' }}>
          ☁️ 電影原音（GitHub）
        </div>
        <div style={{ fontFamily:MONO, fontSize:9, color: audioReady ? T.grn : T.txt3 }}>
          {audioReady
            ? `✅ ${audioFileName} 已載入`
            : audioFileName?.startsWith('❌')
              ? audioFileName
              : '⏳ 載入中…'}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <div onClick={() => loadAudioUrl(JERRY_MP3[0].url, '征服情海 Part 1')}
            style={{ flex:2, cursor:'pointer', fontFamily:MONO, fontSize:10, fontWeight:700,
              color:T.grn, padding:'9px', background:T.grnD,
              borderRadius:8, border:`1px solid ${T.grn}50`, textAlign:'center' }}>
            ↺ 重新載入雲端 MP3
          </div>
          <div onClick={() => pickAudioFile(JERRY_MP3[0].url)}
            style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:9,
              color: part1Status==='cached' ? T.grn : T.amber,
              padding:'9px', background: part1Status==='cached' ? T.grnD : T.amberD,
              borderRadius:8, border:`1px solid ${part1Status==='cached' ? T.grn : T.amber}50`,
              textAlign:'center' }}>
            {part1Status==='cached' ? '📦 P1 ✅' : '📁 P1 選檔'}
          </div>
          <div onClick={() => pickAudioFile(JERRY_MP3[1].url)}
            style={{ flex:1, cursor:'pointer', fontFamily:MONO, fontSize:9,
              color: part2Status==='cached' ? T.grn : T.amber,
              padding:'9px', background: part2Status==='cached' ? T.grnD : T.amberD,
              borderRadius:8, border:`1px solid ${part2Status==='cached' ? T.grn : T.amber}50`,
              textAlign:'center' }}>
            {part2Status==='cached' ? '📦 P2 ✅' : '📁 P2 選檔'}
          </div>
        </div>
      </div>

            {/* ── 電影資料同步 ── */}
      <div style={{ display:'flex', flexDirection:'column', gap:8,
        background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:13, padding:'14px 16px' }}>
        <div style={{ fontFamily:MONO, fontSize:9, color:T.txt2, letterSpacing:'0.1em' }}>
          🎬 電影資料同步 (Google Sheets)
        </div>
        <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, lineHeight:1.7 }}>
          同步範圍：場景、句子、⭐收藏、單字庫、逐字稿
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <div onClick={pushSyncing ? undefined : pushMovieDB}
            style={{ flex:1, cursor: pushSyncing ? 'default' : 'pointer',
              background: pushSyncing ? T.surf2 : T.blueD,
              border:`1px solid ${pushSyncing ? T.bdr : T.blue+'50'}`,
              borderRadius:9, padding:'10px', textAlign:'center',
              fontFamily:MONO, fontSize:10, color: pushSyncing ? T.txt3 : T.blue,
              display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            {pushSyncing && <span style={{ display:'inline-block', width:8, height:8,
              border:'1.5px solid transparent', borderTopColor:T.blue,
              borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>}
            ☁ 推送到 Sheets
          </div>
          <div onClick={pullSyncing ? undefined : pullMovieDB}
            style={{ flex:1, cursor: pullSyncing ? 'default' : 'pointer',
              background: pullSyncing ? T.surf2 : T.grnD,
              border:`1px solid ${pullSyncing ? T.bdr : T.grn+'50'}`,
              borderRadius:9, padding:'10px', textAlign:'center',
              fontFamily:MONO, fontSize:10, color: pullSyncing ? T.txt3 : T.grn,
              display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            {pullSyncing && <span style={{ display:'inline-block', width:8, height:8,
              border:'1.5px solid transparent', borderTopColor:T.grn,
              borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>}
            ⟳ 從 Sheets 讀入
          </div>
        </div>
        {movieSyncMsg && (
          <div style={{ fontFamily:MONO, fontSize:9, lineHeight:1.7,
            color: movieSyncMsg.startsWith('✓') ? T.grn : movieSyncMsg.startsWith('✗') ? T.red : T.txt3 }}>
            {movieSyncMsg}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ACHIEVEMENTS TAB
// ═══════════════════════════════════════════════════════════════
function AchieveTab({ stats, earned, sentences, vocab }) {
  const xp = stats?.xp ?? 0
  const lvlIdx = [...LEVELS].findIndex((l, i) => xp < l.min) - 1
  const level = LEVELS[Math.max(0, lvlIdx === -1 ? LEVELS.length - 1 : lvlIdx)]
  const nextLevel = LEVELS[LEVELS.indexOf(level) + 1]
  const pct = nextLevel ? Math.min(100, ((xp - level.min) / (nextLevel.min - level.min)) * 100) : 100
  
  const earnedSet = new Set(earned ?? [])
  const earnedCount = BADGES.filter(b => earnedSet.has(b.id)).length

  const STATS = [
    { lbl:'Total Drills', val: stats?.totalDrills ?? 0 },
    { lbl:'Correct',      val: stats?.correct ?? 0 },
    { lbl:'Sentences',    val: (sentences ?? []).length },
    { lbl:'Vocab Words',  val: (vocab ?? []).length },
  ]

  return (
    <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:16 }} className="fadeUp">
      {/* Level card */}
      <div style={{ background:T.surf, border:`1px solid ${level.clr}35`, borderRadius:16, padding:24, textAlign:'center' }}>
        <div style={{ fontFamily:DISP, fontSize:9.5, color:'#9aa5b0', letterSpacing:'0.18em', marginBottom:10 }}>CURRENT LEVEL</div>
        <div style={{ fontFamily:DISP, fontSize:28, color:level.clr, marginBottom:6 }}>{level.name}</div>
        <div style={{ fontFamily:MONO, fontSize:28, color:T.amber, fontWeight:600, marginBottom:18 }}>{xp.toLocaleString()} XP</div>
        <div style={{ background:T.bdr2, borderRadius:4, height:7, overflow:'hidden', marginBottom:9 }}>
          <div style={{ width:`${pct}%`, height:'100%', background:`linear-gradient(90deg, ${level.clr}cc, ${level.clr})`, borderRadius:4, transition:'width 0.9s ease' }}/>
        </div>
        {nextLevel
          ? <div style={{ fontFamily:MONO, fontSize:10, color:T.txt3 }}>{nextLevel.min - xp} XP to <span style={{ color:nextLevel.clr }}>{nextLevel.name}</span></div>
          : <div style={{ fontFamily:MONO, fontSize:10, color:T.grn }}>Max level reached!</div>
        }
      </div>

      {/* Stats grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {STATS.map(({ lbl, val }) => (
          <div key={lbl} style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:10, padding:'14px 12px', textAlign:'center' }}>
            <div style={{ fontFamily:MONO, fontSize:24, color:T.amber, fontWeight:600 }}>{val}</div>
            <div style={{ fontFamily:MONO, fontSize:8.5, color:'#9aa5b0', letterSpacing:'0.08em', marginTop:5 }}>{lbl.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Weakness stats */}
      {(() => {
        try {
          const drillProgress = JSON.parse(localStorage.getItem('fsi:drill') || '{}')
          const WEAKNESS_TAGS = [
            { id:'vocab',   label:'詞彙不足', icon:'📖', color:T.blue },
            { id:'fluency', label:'說不流暢', icon:'🗣️', color:T.amber },
            { id:'grammar', label:'文法錯誤', icon:'📝', color:'#a371f7' },
            { id:'blank',   label:'腦袋空白', icon:'🫥', color:T.red },
            { id:'stress',  label:'重音錯誤', icon:'🎵', color:T.grn },
          ]
          const counts = {}
          WEAKNESS_TAGS.forEach(t => { counts[t.id] = 0 })
          Object.values(drillProgress).forEach(p => {
            ;(p.weakTags ?? []).forEach(tag => { if (counts[tag] !== undefined) counts[tag]++ })
          })
          const total = Object.values(counts).reduce((a, b) => a + b, 0)
          if (total === 0) return null
          const sorted = WEAKNESS_TAGS.map(t => ({ ...t, count: counts[t.id] })).sort((a,b) => b.count - a.count)
          return (
            <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:14, padding:'16px 16px' }}>
              <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, letterSpacing:'0.12em', marginBottom:12 }}>⚑ 弱點分析</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {sorted.filter(t => t.count > 0).map(t => (
                  <div key={t.id} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ width:16, textAlign:'center' }}>{t.icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                        <span style={{ fontFamily:MONO, fontSize:9, color:T.txt2 }}>{t.label}</span>
                        <span style={{ fontFamily:MONO, fontSize:9, color:t.color }}>{t.count} 次</span>
                      </div>
                      <div style={{ background:T.bdr2, borderRadius:3, height:4, overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:3, background:t.color, width:`${Math.round(t.count/total*100)}%`, transition:'width 0.5s' }}/>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontFamily:MONO, fontSize:8, color:T.txt3, marginTop:8 }}>共標記 {total} 次（在 DRILL 評分後可選填）</div>
            </div>
          )
        } catch { return null }
      })()}

      {/* Badges */}
      <div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3, letterSpacing:'0.12em' }}>BADGES</span>
          <span style={{ fontFamily:MONO, fontSize:9, color:T.amber }}>{earnedCount} / {BADGES.length}</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {BADGES.map(b => {
            const done = earnedSet.has(b.id)
            return (
              <div key={b.id} style={{ background:T.surf, border:`1px solid ${done ? T.amber+'40' : T.bdr}`, borderRadius:11, padding:'14px 12px', opacity: done ? 1 : 0.55, transition:'all 0.3s', filter: done ? 'none' : 'grayscale(0.6)' }}>
                <div style={{ fontSize:22, marginBottom:6 }}>{b.icon}</div>
                <div style={{ fontFamily:MONO, fontSize:11, color: done ? T.amber : T.txt2, fontWeight:500, marginBottom:3 }}>{b.name}</div>
                <div style={{ fontFamily:SERIF, fontSize:11, color:T.txt3, lineHeight:1.4, marginBottom:5 }}>{b.desc}</div>
                <div style={{ fontFamily:MONO, fontSize:9, color: done ? T.amber : T.txt3 }}>+{b.xp} XP</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// TRANSLATE TEST COMPONENT
// ═══════════════════════════════════════════════════════════════
function GPT5Diagnose() {
  const [busy, setBusy] = useState(false)
  const MONO = "'JetBrains Mono',monospace"

  async function runDiagnose() {
    setBusy(true)
    try {
      await callAIRaw(
        [{ role:'user', content:'Say: OK' }],
        '',
        true  // debugMode=true → 列出所有 keys
      )
    } catch(e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
      <div style={{ fontFamily:MONO, fontSize:9, color:'#6b7785',
        padding:'8px 0', borderTop:'1px solid #2e3338', marginTop:8 }}>
        🔍 GPT-5 Response 診斷
      </div>
      <div onClick={busy ? undefined : runDiagnose}
        style={{ cursor: busy ? 'default' : 'pointer',
          background:'#22262b', borderRadius:10, padding:'10px',
          textAlign:'center', fontFamily:MONO, fontSize:10,
          fontWeight:700, color: busy ? '#6b7785' : '#10a37f',
          border:'1px solid #10a37f40' }}>
        {busy ? '診斷中…' : '🔍 列出所有 Response Keys'}
      </div>
      <div style={{ fontFamily:MONO, fontSize:9, color:'#6b7785', marginTop:4 }}>
        點後看 alert，找 gpt-5 實際輸出欄位
      </div>
    </div>
  )
}

function TranslateTest() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [results, setResults] = useState({}) // { anthropic, openai, gemini }
  const [busy, setBusy] = useState({})

  async function testOne(provider) {
    if (!input.trim()) return
    setBusy(b => ({ ...b, [provider]: true }))
    setResults(r => ({ ...r, [provider]: '...' }))
    const se = getAISettings()
    const origProvider = se.aiProvider
    try {
      // 暫時覆蓋 provider
      const tempSe = { ...se, aiProvider: provider }
      localStorage.setItem('fsi:se', JSON.stringify(tempSe))
      const prompt = `翻譯以下英文句子為自然流暢的繁體中文，只回傳翻譯結果，不要其他說明：\n${input.trim()}`
      const result = await callAI([{ role:'user', content:prompt }])
      setResults(r => ({ ...r, [provider]: result.trim() }))
    } catch(e) {
      setResults(r => ({ ...r, [provider]: `❌ ${e.message}` }))
    } finally {
      // 還原原本 provider
      const tempSe = { ...se, aiProvider: origProvider }
      localStorage.setItem('fsi:se', JSON.stringify(tempSe))
      setBusy(b => ({ ...b, [provider]: false }))
    }
  }

  async function testAll() {
    await Promise.all(['anthropic','openai','gemini'].map(p => testOne(p)))
  }

  const T = window._T || { surf:'#1a1d21', surf2:'#22262b', bdr:'#2e3338', txt:'#e8eaed', txt2:'#b0b8c4', txt3:'#6b7785', amber:'#f5a623', amberD:'#f5a62320', blue:'#4a9eff', blueD:'#4a9eff20', bg:'#12151a', grn:'#4caf84', grnD:'#4caf8420' }
  const MONO = "'JetBrains Mono',monospace"

  const providers = [
    { id:'anthropic', label:'Claude',  color:'#f5a623' },
    { id:'openai',    label:'GPT',     color:'#10a37f' },
    { id:'gemini',    label:'Gemini',  color:'#4285f4' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ cursor:'pointer', fontFamily:MONO, fontSize:9, color:'#6b7785',
          padding:'8px 0', display:'flex', alignItems:'center', gap:6,
          borderTop:'1px solid #2e3338', marginTop:8 }}>
        <span>{open ? '▲' : '▼'}</span>
        <span>🧪 翻譯比較測試</span>
      </div>
      {open && (
        <div style={{ display:'flex', flexDirection:'column', gap:10,
          background:'#1a1d21', borderRadius:12, padding:'14px',
          border:'1px solid #2e3338' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            rows={2}
            placeholder="輸入英文句子，例：He can't be alone."
            style={{ fontFamily:MONO, fontSize:11, background:'#22262b',
              border:'1px solid #2e3338', borderRadius:8, padding:'9px 11px',
              color:'#e8eaed', resize:'none', outline:'none',
              lineHeight:1.6, width:'100%', boxSizing:'border-box' }}
          />
          <div onClick={testAll}
            style={{ cursor:'pointer', background:'#f5a623', borderRadius:8,
              padding:'10px', textAlign:'center',
              fontFamily:MONO, fontSize:11, fontWeight:700, color:'#12151a' }}>
            ⚡ 三家同時翻譯
          </div>
          {providers.map(p => (
            <div key={p.id} style={{ background:'#22262b', borderRadius:10,
              padding:'10px 12px', border:`1px solid ${results[p.id] ? p.color+'40' : '#2e3338'}` }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                <span style={{ fontFamily:MONO, fontSize:9, fontWeight:700, color:p.color }}>{p.label}</span>
                {busy[p.id] && <span style={{ display:'inline-block', width:8, height:8,
                  border:'1.5px solid transparent', borderTopColor:p.color,
                  borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>}
              </div>
              <div style={{ fontFamily:MONO, fontSize:11, color:'#e8eaed', lineHeight:1.7, minHeight:20 }}>
                {results[p.id] || <span style={{ color:'#6b7785' }}>—</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SettingsTab({ sentences, vocab, updateSentences, updateVocab, settings, updateSettings, stats, earned, movieToast, showMovieToast }) {
  // 直接從 localStorage 讀取，避免 settings prop 非同步初始化問題
  const [key, setKey] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fsi:se') || '{}')?.apiKey ?? '' } catch { return '' }
  })
  const [geminiKey, setGeminiKey] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fsi:se') || '{}')?.geminiKey ?? '' } catch { return '' }
  })
  const [openaiKey, setOpenaiKey] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fsi:se') || '{}')?.openaiKey ?? '' } catch { return '' }
  })
  const [aiProvider, setAiProvider] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fsi:se') || '{}')?.aiProvider ?? 'anthropic' } catch { return 'anthropic' }
  })
  const [elevenKey, setElevenKey] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fsi:se') || '{}')?.elevenKey ?? '' } catch { return '' }
  })
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  useEffect(() => {
    if (settings?.apiKey)    setKey(settings.apiKey)
    if (settings?.geminiKey) setGeminiKey(settings.geminiKey)
    if (settings?.openaiKey) setOpenaiKey(settings.openaiKey)
    if (settings?.aiProvider) setAiProvider(settings.aiProvider)
    if (settings?.elevenKey) setElevenKey(settings.elevenKey)
  }, [settings?.apiKey, settings?.geminiKey, settings?.openaiKey, settings?.aiProvider, settings?.elevenKey])
  const [showKey, setShowKey] = useState(false)
  const [showElevenKey, setShowElevenKey] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const [elevenUsage, setElevenUsage] = useState(null) // { used, limit } | 'loading' | 'error'
  const [importPreview, setImportPreview] = useState(null)
  const fileInputRef = useRef(null)
  const [batchProgress, setBatchProgress] = useState(null)
  const batchStop = useRef(false)
  const [showScan, setShowScan] = useState(false)
  const [editingCardId, setEditingCardId] = useState(null)
  const [editDraftSubs, setEditDraftSubs] = useState([]) // string[][]
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  async function checkElevenUsage() {
    const k = elevenKey.trim() || settings?.elevenKey
    if (!k) { flash('✗ 請先輸入 ElevenLabs Key'); return }
    setElevenUsage('loading')
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': k }
      })
      if (!r.ok) throw new Error('status ' + r.status)
      const d = await r.json()
      const used = d.subscription?.character_count ?? 0
      const limit = d.subscription?.character_limit ?? 10000
      setElevenUsage({ used, limit })
    } catch {
      setElevenUsage('error')
    }
  }

  const LINKED_HINT_SYSTEM = `You are an English connected speech expert. Given a sentence template, produce a "linked_hint" showing how native speakers actually say it.\n\nRULES (apply ALL that apply):\n1. Consonant+Vowel liaison (MOST IMPORTANT): when a word ends in consonant and next word starts with vowel (A E I O U), merge with ·\n   e.g. "need it" -> "nee·dit", "pick it up" -> "pi·ki·tup"\n2. Weak "of" -> ə merged: "end of" -> "endə"\n3. Weak "and" -> ən merged: "black and white" -> "blackən white"\n4. Weak "to" -> tə: "need to go" -> "need tə go"\n5. Weak "a/the" -> ə: "at the" -> "ət ðə"\n6. Elision — t/d dropped before consonant: "last night" -> "las(t) night"\n7. Stressed syllables: CAPITALIZE. e.g. "production" -> "proDUCtion"\n8. {slot} is an INVISIBLE WALL — NEVER merge · across it. Words adjacent to {slot} are fully isolated.\n   WRONG: "need·{time}" or "{time}·at" — never cross the wall.\n   RIGHT: "need {time} ə(t)" — liaison stops and restarts around {slot}.\n\nEXAMPLE:\nInput:  I need it by {time} at the absolute latest.\nOutput: I nee·dit by {time} ə(t) ðə·ABsolute LAtest\n\nReturn ONLY the linked_hint string, no explanation, no quotes, no markdown.`

  async function batchGenLinkedHint(mode) {
    const apiKey = settings?.apiKey || (() => {
      try { return JSON.parse(localStorage.getItem('fsi:se') || '{}')?.apiKey ?? '' } catch { return '' }
    })()
    if (!apiKey) { flash('✗ 請先設定 Anthropic API Key'); return }
    const targets = (sentences ?? []).filter(s => mode === 'all' || !s.linked_hint)
    if (!targets.length) { flash(mode === 'missing' ? '✓ 所有卡片已有連音標注' : '✗ 沒有句子可處理'); return }
    batchStop.current = false
    setBatchProgress({ current: 0, total: targets.length, label: '', done: 0, errors: 0, stopped: false })
    let done = 0, errors = 0
    for (let i = 0; i < targets.length; i++) {
      if (batchStop.current) { setBatchProgress(p => ({ ...p, stopped: true })); break }
      const card = targets[i]
      setBatchProgress(p => ({ ...p, current: i + 1, label: card.template.slice(0, 42) + (card.template.length > 42 ? '…' : '') }))
      try {
        const raw = await callClaude(apiKey, [{ role:'user', content: card.template }], LINKED_HINT_SYSTEM)
        const hint = raw.trim().replace(/^["']|["']$/g, '')
        updateSentences(prev => prev.map(s => s.id === card.id ? { ...s, linked_hint: hint } : s))
        done++
      } catch { errors++ }
      setBatchProgress(p => ({ ...p, done, errors }))
      if (i < targets.length - 1) await new Promise(r => setTimeout(r, 400))
    }
    setBatchProgress(p => ({ ...p, current: p.stopped ? p.current : targets.length, done, errors }))
  }

  // ── 批次補全 VOCAB IPA + 中文 ─────────────────────────────────
  async function batchFillVocabMeta() {
    const apiKey = settings?.apiKey || (() => {
      try { return JSON.parse(localStorage.getItem('fsi:se') || '{}')?.apiKey ?? '' } catch { return '' }
    })()
    if (!apiKey) { flash('✗ 請先設定 Anthropic API Key'); return }
    const targets = (vocab ?? []).filter(v => !v.ipa_us || !v.zh)
    if (!targets.length) { flash('✓ 所有單字已有 IPA 和中文'); return }
    batchStop.current = false
    setBatchProgress({ current: 0, total: targets.length, label: '', done: 0, errors: 0, stopped: false, mode: 'vocab' })
    let done = 0, errors = 0
    for (let i = 0; i < targets.length; i++) {
      if (batchStop.current) { setBatchProgress(p => ({ ...p, stopped: true })); break }
      const w = targets[i]
      setBatchProgress(p => ({ ...p, current: i + 1, label: w.word, mode: 'vocab' }))
      try {
        const system = 'You are a dictionary API. Given an English word, return ONLY valid JSON (no markdown) with keys: ipa_us (IPA US pronunciation, e.g. /wɜːrd/), zh (Traditional Chinese translation, concise, e.g. 字詞). Example: {"ipa_us":"/ˈmæn.ɪdʒ/","zh":"管理"}'
        const raw = await callClaude(apiKey, [{ role:'user', content: w.word }], system)
        const clean = raw.trim().replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(clean)
        updateVocab(prev => prev.map(v => v.id === w.id ? {
          ...v,
          ipa_us: v.ipa_us || parsed.ipa_us || '',
          zh:     v.zh     || parsed.zh     || '',
        } : v))
        done++
      } catch { errors++ }
      setBatchProgress(p => ({ ...p, done, errors, mode: 'vocab' }))
      if (i < targets.length - 1) await new Promise(r => setTimeout(r, 300))
    }
    setBatchProgress(p => ({ ...p, current: p.stopped ? p.current : targets.length, done, errors, mode: 'vocab' }))
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!data.sentences && !data.vocab) { flash('✗ 格式錯誤：找不到 sentences 或 vocab'); return }
        setImportPreview({
          sentences: data.sentences ?? [],
          vocab: data.vocab ?? [],
          exportedAt: data.exportedAt ?? '未知'
        })
      } catch {
        flash('✗ 無法解析 JSON，請確認檔案格式')
      }
    }
    reader.readAsText(file)
  }

  function confirmImport() {
    if (!importPreview) return
    // 保留現有 SRS 進度（用 id 比對）
    const srsMapS = {}
    ;(sentences ?? []).forEach(c => {
      if (c.id) srsMapS[c.id] = { reps:c.reps, ease:c.ease, interval:c.interval, dueDate:c.dueDate, lastSeen:c.lastSeen }
    })
    const srsMapV = {}
    ;(vocab ?? []).forEach(v => {
      if (v.id) srsMapV[v.id] = { reps:v.reps, ease:v.ease, interval:v.interval, dueDate:v.dueDate, lastSeen:v.lastSeen }
    })
    const newSentences = importPreview.sentences.map(c => ({
      ...c, ...(srsMapS[c.id] ?? {})
    }))
    const newVocab = importPreview.vocab.map(v => ({
      ...v, ...(srsMapV[v.id] ?? {})
    }))
    updateSentences(() => newSentences)
    updateVocab(() => newVocab)
    setImportPreview(null)
    flash(`✓ 匯入完成：${newSentences.length} 句 + ${newVocab.length} 單字（SRS 進度已保留）`)
  }

  function exportJSON() {
    const data = { version:'2.1', exportedAt:new Date().toISOString(), sentences: sentences??[], vocab: vocab??[] }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `fsi-backup-${new Date().toISOString().slice(0,10)}.json`; a.click()
    URL.revokeObjectURL(url)
    flash('✓ JSON 備份已下載')
  }

  async function pushToSheets() {
    if (!(sentences??[]).length && !(vocab??[]).length) { flash('✗ 沒有資料可同步'); return }
    setSyncing(true); flash('推送中…')
    try {
      const extraPhrases = (() => { try { return JSON.parse(localStorage.getItem('fsi:ph:extra') ?? '[]') } catch { return [] } })()
      const allPhrases = [...PHRASE_DATA, ...extraPhrases]
      const movieDB    = (() => {
        try {
          const s = localStorage.getItem('fsi:movie:db')
          if (!s) return null
          const parsed = JSON.parse(s)
          const t0 = localStorage.getItem('fsi:movie:transcript:0') ?? ''
          if (t0 && parsed.movies?.[0]?.transcript === '__REF__') parsed.movies[0].transcript = t0
          return parsed
        } catch { return null }
      })()
      const form = new FormData()
      form.append('data', JSON.stringify({
        sentences: sentences ?? [],
        vocab:     vocab     ?? [],
        phrases:   allPhrases,
        movieDB:   movieDB,
      }))
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 60000)
      try {
        await fetch(APPS_SCRIPT_URL, { method:'POST', mode:'no-cors', body:form, signal: ctrl.signal })
      } finally { clearTimeout(t) }
      await new Promise(r => setTimeout(r, 2000))
      try {
        const check = await fetch(APPS_SCRIPT_URL)
        const json = await check.json()
        const sc = (json.sentences ?? []).length || (sentences??[]).length
        const vc = (json.vocab ?? []).length || (vocab??[]).length
        flash(`✓ 已推送（${sc} 句 + ${vc} 字）`)
      } catch {
        flash('✓ 已送出（請至 Sheets 確認）')
      }
    } catch(e) {
      flash('✗ ' + (e.message ?? '網路錯誤'))
    } finally { setSyncing(false) }
  }

  function save() {
    const newSettings = { apiKey: key.trim(), geminiKey: geminiKey.trim(), openaiKey: openaiKey.trim(), aiProvider, elevenKey: elevenKey.trim() }
    try { localStorage.setItem('fsi:se', JSON.stringify(newSettings)) } catch(e) {}
    updateSettings(() => newSettings)
    flash('✓ API Keys 已儲存')
  }

  async function syncSheets() {
    setSyncing(true); flash('')
    try {
      const r = await fetch(APPS_SCRIPT_URL)
      const json = await r.json()
      if (!json.ok) throw new Error(json.error ?? 'Sync failed')
      const cards = json.sentences ?? []
      const words = json.vocab ?? []
      if (!cards.length && !words.length) throw new Error('Sheets 沒有資料，請先推送。')

      // ── 以 Sheets 為主：完全覆蓋 localStorage，並清除 SEED 卡 ──
      // 句子：Sheets 資料完全取代，保留本地的 SRS 進度（用 id 或 template 比對）
      if (cards.length) {
        const SEED_IDS = new Set(SEED_S.map(c => c.id))
        updateSentences(prev => {
          // 建立本地 SRS 進度查表（以 id 和 template 兩種 key）
          const srsById = {}
          const srsByTemplate = {}
          ;(prev ?? []).forEach(s => {
            const srs = { reps: s.reps, ease: s.ease, interval: s.interval, dueDate: s.dueDate, lastSeen: s.lastSeen }
            srsById[s.id] = srs
            srsByTemplate[s.template] = srs
          })
          // 用 Sheets 資料，補回 SRS 進度，過濾掉 SEED id 避免污染
          const sheetsCards = cards
            .filter(c => !SEED_IDS.has(c.id))  // 防止 Sheets 裡混入 SEED id
            .map(c => {
              const srs = srsById[c.id] ?? srsByTemplate[c.template] ?? {}
              return {
                ...c,
                reps:      srs.reps      ?? 0,
                ease:      srs.ease      ?? 2.5,
                interval:  srs.interval  ?? 1,
                dueDate:   srs.dueDate   ?? 0,
                lastSeen:  srs.lastSeen  ?? 0,
              }
            })
          return sheetsCards
        })
      }

      // 單字：Sheets 資料完全取代，保留本地的 SRS 進度
      if (words.length) {
        updateVocab(prev => {
          const srsById = {}
          const srsByWord = {}
          ;(prev ?? []).forEach(v => {
            const srs = { reps: v.reps, ease: v.ease, interval: v.interval, dueDate: v.dueDate, lastSeen: v.lastSeen }
            srsById[v.id] = srs
            srsByWord[v.word] = srs
          })
          return words.map(w => {
            const srs = srsById[w.id] ?? srsByWord[w.word] ?? {}
            return {
              ...w,
              reps:      srs.reps      ?? 0,
              ease:      srs.ease      ?? 2.5,
              interval:  srs.interval  ?? 1,
              dueDate:   srs.dueDate   ?? 0,
              lastSeen:  srs.lastSeen  ?? 0,
            }
          })
        })
      }

      flash(`✓ 已從 Sheets 覆蓋：${cards.length} 句 + ${words.length} 單字（SRS 進度保留）`)

      // ── Phrases：只存 AI 新增的（非內建 PHRASE_DATA 的）到 fsi:ph:extra ──
      const builtinIds = new Set(PHRASE_DATA.map(p => p.id))
      const sheetPhrases = json.phrases ?? []
      const extraFromSheet = sheetPhrases.filter(p => !builtinIds.has(p.id))
      if (extraFromSheet.length) {
        localStorage.setItem('fsi:ph:extra', JSON.stringify(extraFromSheet))
        flash(`✓ 已從 Sheets 覆蓋：${cards.length} 句 + ${words.length} 單字 + ${extraFromSheet.length} AI Phrases`)
      }

      // ── 電影資料：從 Sheets 還原 movieDB（保護本機逐字稿）──
      if (json.movieDB) {
        const transcriptDB2 = json.transcriptDB ?? []
        const localRaw = (() => { try { return JSON.parse(localStorage.getItem('fsi:movie:db') ?? 'null') } catch { return null } })()
        const mergedMovieDB = {
          ...json.movieDB,
          movies: json.movieDB.movies?.map(m => {
            const localMovie  = localRaw?.movies?.find(lm => lm.id === m.id)
            const sheetsEntry = transcriptDB2.find(tr => tr.movieId === m.id)
            const localTs     = localMovie?.transcriptUpdatedAt ?? 0
            const sheetsTs    = sheetsEntry?.updatedAt ?? 0
            if (sheetsEntry?.transcript?.trim()) {
              if (sheetsTs >= localTs || !localMovie?.transcript?.trim()) {
                return { ...m, transcript: sheetsEntry.transcript, transcriptUpdatedAt: sheetsTs }
              }
              return { ...m, transcript: localMovie.transcript, transcriptUpdatedAt: localTs }
            }
            // Sheets 沒有逐字稿 → 保留本機
            if (localMovie?.transcript?.trim()) {
              return { ...m, transcript: localMovie.transcript, transcriptUpdatedAt: localTs }
            }
            return m
          }) ?? []
        }
        // 用分離邏輯存（避免逐字稿超過 5MB 再次消失）
        const t0merged = mergedMovieDB.movies?.[0]?.transcript ?? ''
        if (t0merged && t0merged !== '__REF__') {
          try { localStorage.setItem('fsi:movie:transcript:0', t0merged) } catch(e) {}
        }
        const mergedLight = {
          ...mergedMovieDB,
          movies: (mergedMovieDB.movies ?? []).map((m, i) =>
            i === 0 && m.transcript && m.transcript !== '__REF__'
              ? { ...m, transcript: '__REF__' } : m
          )
        }
        try {
          localStorage.setItem('fsi:movie:db', JSON.stringify(mergedLight))
        } catch(e) { console.warn('fromSheets quota exceeded:', e) }
        flash(`✓ 已從 Sheets 還原：含電影資料 ${json.movieDB.movies?.length ?? 0} 部`)
        window.dispatchEvent(new StorageEvent('storage', { key:'fsi:movie:db' }))
      }
    } catch(e) {
      flash('✗ ' + (e.message ?? 'Sync failed.'))
    } finally { setSyncing(false) }
  }

  return (
    <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:18 }} className="fadeUp">

      {/* ── MovieTab 全局 Toast（所有 view 共用）── */}
      {movieToast && (
        <div style={{ position:'fixed', top:70, left:'50%', transform:'translateX(-50%)',
          background:'#1a1a2e', border:`1px solid ${T.amber}60`, borderRadius:20,
          padding:'8px 18px', fontFamily:MONO, fontSize:11, color:T.amber,
          zIndex:9998, whiteSpace:'nowrap', animation:'fadeUp 0.2s ease', pointerEvents:'none' }}>
          {movieToast}
        </div>
      )}

      {/* ── AI 供應商切換 ── */}
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        <label style={{ fontFamily:MONO, fontSize:9, color:T.txt2, letterSpacing:'0.1em' }}>🤖 AI 供應商</label>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {[
            { id:'anthropic', label:'Anthropic Claude', sub:'claude-haiku',      color:T.amber },
            { id:'openai',    label:'OpenAI ChatGPT',   sub:'gpt-4o-mini (fast)',       color:'#10a37f' },
            { id:'gemini',    label:'Google Gemini',    sub:'gemini-2.5-flash',  color:'#4285f4' },
          ].map(p => {
            const active = aiProvider === p.id
            return (
              <div key={p.id} onClick={() => setAiProvider(p.id)}
                style={{ flex:1, minWidth:90, padding:'10px 12px', borderRadius:12, cursor:'pointer',
                  background: active ? p.color+'18' : T.surf2,
                  border:`2px solid ${active ? p.color+'90' : T.bdr}`,
                  display:'flex', flexDirection:'column', gap:3, transition:'all 0.14s' }}>
                <span style={{ fontFamily:MONO, fontSize:10, color: active ? p.color : T.txt2, fontWeight: active ? 700 : 400 }}>{p.label}</span>
                <span style={{ fontFamily:MONO, fontSize:8, color:T.txt3 }}>{p.sub}</span>
                {active && <span style={{ fontFamily:MONO, fontSize:8, color:p.color }}>✓ 使用中</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Anthropic API Key */}
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        <label style={{ fontFamily:MONO, fontSize:9, color:T.txt2, letterSpacing:'0.1em' }}>
          ANTHROPIC API KEY {aiProvider === 'anthropic' && <span style={{color:T.amber}}>★ 使用中</span>}
        </label>
        <div style={{ display:'flex', gap:8 }}>
          <input type={showKey ? 'text' : 'password'} value={key} onChange={e=>setKey(e.target.value)} placeholder="sk-ant-api03-…" style={{ flex:1 }}/>
          <button className="btn" onClick={()=>setShowKey(s=>!s)} style={{ background:T.bdr, color:T.txt2, padding:'10px 13px', fontSize:13 }}>
            {showKey ? '🙈' : '👁'}
          </button>
        </div>
        <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
          免費版：<a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{color:T.amber}}>console.anthropic.com</a> → API Keys
        </span>
      </div>

      {/* OpenAI API Key */}
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        <label style={{ fontFamily:MONO, fontSize:9, color:T.txt2, letterSpacing:'0.1em' }}>
          OPENAI API KEY {aiProvider === 'openai' && <span style={{color:'#10a37f'}}>★ 使用中</span>}
        </label>
        <div style={{ display:'flex', gap:8 }}>
          <input type={showOpenaiKey ? 'text' : 'password'} value={openaiKey} onChange={e=>setOpenaiKey(e.target.value)} placeholder="sk-proj-…" style={{ flex:1 }}/>
          <button className="btn" onClick={()=>setShowOpenaiKey(s=>!s)} style={{ background:T.bdr, color:T.txt2, padding:'10px 13px', fontSize:13 }}>
            {showOpenaiKey ? '🙈' : '👁'}
          </button>
        </div>
        <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" style={{color:'#10a37f'}}>platform.openai.com</a> → API Keys（使用 gpt-4o-mini）
        </span>
      </div>

      {/* Gemini API Key */}
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        <label style={{ fontFamily:MONO, fontSize:9, color:T.txt2, letterSpacing:'0.1em' }}>
          GEMINI API KEY {aiProvider === 'gemini' && <span style={{color:'#4285f4'}}>★ 使用中</span>}
        </label>
        <div style={{ display:'flex', gap:8 }}>
          <input type={showGeminiKey ? 'text' : 'password'} value={geminiKey} onChange={e=>setGeminiKey(e.target.value)} placeholder="AIza…" style={{ flex:1 }}/>
          <button className="btn" onClick={()=>setShowGeminiKey(s=>!s)} style={{ background:T.bdr, color:T.txt2, padding:'10px 13px', fontSize:13 }}>
            {showGeminiKey ? '🙈' : '👁'}
          </button>
        </div>
        <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>
          免費版：<a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{color:'#4285f4'}}>aistudio.google.com</a> → Get API Key
        </span>
      </div>

      {/* ElevenLabs Key */}
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        <label style={{ fontFamily:MONO, fontSize:9, color:T.txt2, letterSpacing:'0.1em' }}>ELEVENLABS API KEY <span style={{ color:T.amber }}>★ 高品質語音</span></label>
        <div style={{ display:'flex', gap:8 }}>
          <input type={showElevenKey ? 'text' : 'password'} value={elevenKey} onChange={e=>{ setElevenKey(e.target.value); setElevenUsage(null) }} placeholder="sk_xxxxxxxxxxxxxxxx…" style={{ flex:1 }}/>
          <button className="btn" onClick={()=>setShowElevenKey(s=>!s)} style={{ background:T.bdr, color:T.txt2, padding:'10px 13px', fontSize:13 }}>
            {showElevenKey ? '🙈' : '👁'}
          </button>
        </div>
        <button className="btn" onClick={checkElevenUsage} disabled={elevenUsage === 'loading'}
          style={{ background:T.surf2, border:`1px solid ${T.bdr2}`, color:T.txt2, fontSize:10 }}>
          {elevenUsage === 'loading' ? '查詢中…' : '📊 查詢剩餘用量'}
        </button>
        {elevenUsage && elevenUsage !== 'loading' && elevenUsage !== 'error' && (() => {
          const pct = Math.round((elevenUsage.used / elevenUsage.limit) * 100)
          const remaining = elevenUsage.limit - elevenUsage.used
          const color = pct > 85 ? T.red : pct > 60 ? T.amber : T.grn
          return (
            <div style={{ background:T.surf2, border:`1px solid ${T.bdr}`, borderRadius:9, padding:'11px 13px', display:'flex', flexDirection:'column', gap:7 }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontFamily:MONO, fontSize:9, color:T.txt2 }}>本月用量</span>
                <span style={{ fontFamily:MONO, fontSize:10, color }}>
                  {elevenUsage.used.toLocaleString()} / {elevenUsage.limit.toLocaleString()} 字元
                </span>
              </div>
              <div style={{ background:T.bdr, borderRadius:4, height:5, overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:4, background:color, width:`${pct}%`, transition:'width 0.4s' }}/>
              </div>
              <div style={{ fontFamily:MONO, fontSize:9, color }}>
                剩餘 {remaining.toLocaleString()} 字元（{100 - pct}%）
              </div>
            </div>
          )
        })()}
        {elevenUsage === 'error' && (
          <div style={{ fontFamily:MONO, fontSize:9, color:T.red }}>✗ 查詢失敗，請確認 Key 正確</div>
        )}
        <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, lineHeight:1.7 }}>
          用於 chunk 連音按鈕 + 單字騎車模式（自然真人語音）<br/>
          未設定時自動使用瀏覽器 TTS。免費版 10,000 字元/月。
        </div>
      </div>

      {/* ── Quick Save API Keys ── */}
      <button className="btn" onClick={save}
        style={{ background:T.amber, color:T.bg, width:'100%', letterSpacing:'0.08em', fontWeight:600 }}>
        💾 SAVE API KEYS
      </button>

      {/* ── 資料統計診斷 ── */}
      {(() => {
        const SEED_IDS = new Set(SEED_S.map(c => c.id))
        const all = sentences ?? []
        const seedCards = all.filter(c => SEED_IDS.has(c.id))
        const realCards = all.filter(c => !SEED_IDS.has(c.id))
        const countTplSlots = t => (t?.match(/\{[^}]+\}/g) ?? []).length
        const missingSubsCards = realCards.filter(c => countTplSlots(c.template) > (c.subs ?? []).length)
        const extraSubsCards   = realCards.filter(c => countTplSlots(c.template) < (c.subs ?? []).length)
        const incompleteCards  = [...new Set([...missingSubsCards, ...extraSubsCards])]
        const LIFE_CTX = ['Daily Life','Greeting','Travel','Shopping','Food','Health','Family','Hobby','Lifestyle','生活']
        const isLife = s => LIFE_CTX.some(k => (s.context??'').toLowerCase().includes(k.toLowerCase()))
        const workSimple = realCards.filter(s => s.mode==='simple' && !isLife(s)).length
        const lifeSimple = realCards.filter(s => s.mode==='simple' && isLife(s)).length
        const workHard   = realCards.filter(s => s.mode==='hard'   && !isLife(s)).length
        const lifeHard   = realCards.filter(s => s.mode==='hard'   && isLife(s)).length
        return (
          <div style={{ background:T.surf2, border:`1px solid ${T.bdr}`, borderRadius:10, padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ fontFamily:MONO, fontSize:9, color:T.txt2, letterSpacing:'0.1em' }}>📊 資料統計</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
              {[
                ['總計（含 SEED）', all.length, T.amber],
                ['真實資料（Sheets）', realCards.length, T.grn],
                ['SEED 預設卡', seedCards.length, seedCards.length > 0 ? T.red : T.txt3],
                ['⚠ Slot 缺少（需補）', missingSubsCards.length, missingSubsCards.length > 0 ? T.red : T.txt3],
                ['⚠ Slot 多餘（需修）', extraSubsCards.length,   extraSubsCards.length  > 0 ? T.amber : T.txt3],
                ['', '', ''],
                ['💼 WORK Simple', workSimple, T.txt],
                ['💼 WORK Hard', workHard, T.txt],
                ['🏠 LIFE Simple', lifeSimple, T.txt],
                ['🏠 LIFE Hard', lifeHard, T.txt],
              ].map(([label, val, color], i) => label ? (
                <div key={i} style={{ fontFamily:MONO, fontSize:9, color:T.txt3, display:'flex', justifyContent:'space-between', paddingRight:8 }}>
                  <span>{label}</span>
                  <span style={{ color, fontWeight: val > 0 ? 600 : 400 }}>{val}</span>
                </div>
              ) : <div key={i}/>)}
            </div>
            {seedCards.length > 0 && (
              <button className="btn" onClick={() => {
                updateSentences(prev => prev.filter(c => !SEED_IDS.has(c.id)))
                flash(`✓ 已清除 ${seedCards.length} 張 SEED 預設卡`)
              }} style={{ background:T.redD, border:`1px solid ${T.red}50`, color:T.red, fontSize:10, marginTop:2 }}>
                🗑 立即清除 {seedCards.length} 張 SEED 預設卡
              </button>
            )}
          </div>
        )
      })()}

      {/* ── 卡片完整性掃描 ── */}
      {(() => {
        const SEED_IDS = new Set(SEED_S.map(c => c.id))
        const countTplSlots = t => (t?.match(/\{[^}]+\}/g) ?? []).length
        const realCards = (sentences ?? []).filter(c => !SEED_IDS.has(c.id))
        const missingCards = realCards.filter(c => countTplSlots(c.template) > (c.subs ?? []).length)
        const extraCards   = realCards.filter(c => countTplSlots(c.template) < (c.subs ?? []).length)
        const allBadCards  = [...new Set([...missingCards, ...extraCards])]

        const startEdit = (c) => {
          const tplCount = countTplSlots(c.template)
          const existing = c.subs ?? []
          // Pad missing slots as empty arrays, trim extra slots
          const draft = Array.from({ length: tplCount }, (_, i) => existing[i] ?? [])
          setEditDraftSubs(draft)
          setEditingCardId(c.id)
          setDeleteConfirmId(null)
        }

        const saveEdit = () => {
          updateSentences(prev => prev.map(c =>
            c.id === editingCardId ? { ...c, subs: editDraftSubs } : c
          ))
          setEditingCardId(null)
          flash('✓ 卡片已更新')
        }

        const deleteCard = (id) => {
          updateSentences(prev => prev.filter(c => c.id !== id))
          setDeleteConfirmId(null)
          setEditingCardId(null)
          flash('🗑 已刪除')
        }

        const updateSlotOpt = (slotIdx, optIdx, val) => {
          setEditDraftSubs(prev => prev.map((group, gi) =>
            gi === slotIdx ? group.map((o, oi) => oi === optIdx ? val : o) : group
          ))
        }
        const addOpt = (slotIdx) => {
          setEditDraftSubs(prev => prev.map((group, gi) =>
            gi === slotIdx ? [...group, ''] : group
          ))
        }
        const removeOpt = (slotIdx, optIdx) => {
          setEditDraftSubs(prev => prev.map((group, gi) =>
            gi === slotIdx ? group.filter((_, oi) => oi !== optIdx) : group
          ))
        }
        const removeSlot = (slotIdx) => {
          setEditDraftSubs(prev => prev.filter((_, gi) => gi !== slotIdx))
        }

        if (allBadCards.length === 0) return (
          <div style={{ background:T.surf2, border:`1px solid ${T.grn}30`, borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontFamily:MONO, fontSize:9, color:T.grn }}>✓ 所有卡片 slot 結構正常</span>
          </div>
        )

        return (
          <div style={{ background:T.surf2, border:`1px solid ${T.red}40`, borderRadius:10, padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontFamily:MONO, fontSize:9, color:T.txt2, letterSpacing:'0.1em' }}>🔍 卡片完整性掃描</div>
              <button className="btn" onClick={() => { setShowScan(v => !v); setEditingCardId(null); setDeleteConfirmId(null) }}
                style={{ fontSize:9, padding:'3px 10px', background: showScan ? T.surf : T.amberD, border:`1px solid ${T.amber}50`, color:T.amber }}>
                {showScan ? '收起' : `查看 ${allBadCards.length} 張問題卡`}
              </button>
            </div>

            {showScan && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {allBadCards.map(c => {
                  const tplCount = countTplSlots(c.template)
                  const subsCount = (c.subs ?? []).length
                  const isMissing = tplCount > subsCount
                  const isEditing = editingCardId === c.id
                  const isDeleting = deleteConfirmId === c.id

                  return (
                    <div key={c.id} style={{ background:T.surf, border:`1px solid ${isEditing ? T.blue : isMissing ? T.red : T.amber}40`, borderRadius:10, padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>

                      {/* Card header */}
                      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                        <div style={{ display:'flex', flexDirection:'column', gap:3, flex:1 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{ fontFamily:MONO, fontSize:8, color: isMissing ? T.red : T.amber }}>
                              {isMissing ? '⚠ Slot 缺少' : '⚠ Slot 多餘'}
                            </span>
                            <span style={{ fontFamily:MONO, fontSize:8, color:T.txt3 }}>tpl {tplCount} / subs {subsCount}</span>
                          </div>
                          <div style={{ fontFamily:MONO, fontSize:9, color:T.txt2 }}>{c.context}</div>
                          <div style={{ fontFamily:SERIF, fontSize:11, color:T.txt3, fontStyle:'italic', lineHeight:1.4 }}>{c.template}</div>
                        </div>
                        {/* Action buttons */}
                        {!isEditing && !isDeleting && (
                          <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                            <button className="btn" onClick={() => startEdit(c)}
                              style={{ fontSize:9, padding:'3px 9px', background:T.blueD, border:`1px solid ${T.blue}50`, color:T.blue }}>
                              ✏ 編輯
                            </button>
                            <button className="btn" onClick={() => { setDeleteConfirmId(c.id); setEditingCardId(null) }}
                              style={{ fontSize:9, padding:'3px 9px', background:T.redD, border:`1px solid ${T.red}50`, color:T.red }}>
                              🗑
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Delete confirm */}
                      {isDeleting && (
                        <div style={{ background:T.redD, border:`1px solid ${T.red}50`, borderRadius:7, padding:'8px 10px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                          <span style={{ fontFamily:MONO, fontSize:9, color:T.red }}>確定刪除這張卡？</span>
                          <div style={{ display:'flex', gap:6 }}>
                            <button className="btn" onClick={() => deleteCard(c.id)}
                              style={{ fontSize:9, padding:'3px 10px', background:T.red, color:T.bg, border:'none' }}>確定刪除</button>
                            <button className="btn" onClick={() => setDeleteConfirmId(null)}
                              style={{ fontSize:9, padding:'3px 10px', background:T.surf2, border:`1px solid ${T.bdr}`, color:T.txt3 }}>取消</button>
                          </div>
                        </div>
                      )}

                      {/* Inline editor */}
                      {isEditing && (
                        <div style={{ display:'flex', flexDirection:'column', gap:10, borderTop:`1px solid ${T.bdr}`, paddingTop:10 }}>
                          {editDraftSubs.map((group, gi) => {
                            const isExtra = gi >= tplCount
                            return (
                              <div key={gi} style={{ display:'flex', flexDirection:'column', gap:5 }}>
                                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                                  <span style={{ fontFamily:MONO, fontSize:8.5, color: isExtra ? T.amber : T.txt2, letterSpacing:'0.1em' }}>
                                    SLOT {gi + 1}{isExtra ? ' ⚠ 多餘' : ''}
                                  </span>
                                  {isExtra && (
                                    <button className="btn" onClick={() => removeSlot(gi)}
                                      style={{ fontSize:8, padding:'1px 7px', background:T.amberD, border:`1px solid ${T.amber}40`, color:T.amber }}>
                                      刪除此 Slot
                                    </button>
                                  )}
                                </div>
                                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                                  {group.map((opt, oi) => (
                                    <div key={oi} style={{ display:'flex', gap:5, alignItems:'center' }}>
                                      <input
                                        value={opt}
                                        onChange={e => updateSlotOpt(gi, oi, e.target.value)}
                                        placeholder={`選項 ${oi + 1}`}
                                        style={{ flex:1, background:T.surf2, border:`1px solid ${T.bdr2}`, borderRadius:6, padding:'5px 8px', fontFamily:MONO, fontSize:11, color:T.txt, outline:'none' }}
                                      />
                                      <div onClick={() => removeOpt(gi, oi)}
                                        style={{ cursor:'pointer', color:T.txt3, padding:'4px 6px', borderRadius:5, background:T.surf2, fontFamily:MONO, fontSize:10, flexShrink:0 }}
                                        onMouseOver={e=>e.currentTarget.style.color=T.red}
                                        onMouseOut={e=>e.currentTarget.style.color=T.txt3}>✕</div>
                                    </div>
                                  ))}
                                  <button className="btn" onClick={() => addOpt(gi)}
                                    style={{ alignSelf:'flex-start', fontSize:9, padding:'3px 10px', background:T.surf2, border:`1px solid ${T.bdr}`, color:T.txt3 }}>
                                    + 新增選項
                                  </button>
                                </div>
                              </div>
                            )
                          })}

                          {/* Save / Cancel */}
                          <div style={{ display:'flex', gap:6, paddingTop:4 }}>
                            <button className="btn" onClick={saveEdit}
                              style={{ flex:1, background:T.grn, border:'none', color:T.bg, fontSize:10, fontWeight:600 }}>
                              ✓ 儲存
                            </button>
                            <button className="btn" onClick={() => { setEditingCardId(null); setDeleteConfirmId(null) }}
                              style={{ flex:1, background:T.surf2, border:`1px solid ${T.bdr}`, color:T.txt3, fontSize:10 }}>
                              取消
                            </button>
                            <button className="btn" onClick={() => { setDeleteConfirmId(c.id); setEditingCardId(null) }}
                              style={{ background:T.redD, border:`1px solid ${T.red}50`, color:T.red, fontSize:10, padding:'5px 12px' }}>
                              🗑 刪除
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* Sheets Sync */}
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        <label style={{ fontFamily:MONO, fontSize:9, color:T.txt2, letterSpacing:'0.1em' }}>GOOGLE SHEETS SYNC</label>
        <div style={{ background:T.surf2, borderRadius:9, padding:13, display:'flex', flexDirection:'column', gap:5 }}>
          <div style={{ fontFamily:MONO, fontSize:9, color:T.amber, letterSpacing:'0.08em' }}>FSI Practice Sentences + FSI Vocab</div>
          <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, lineHeight:1.7 }}>
            推送：App → Sheets（覆蓋 Sheets 舊資料）<br/>
            讀入：Sheets → App（<span style={{color:T.amber}}>完全覆蓋</span> localStorage，SRS 進度保留）
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn" onClick={pushToSheets} disabled={syncing}
            style={{ flex:1, background:T.blueD, border:`1px solid ${T.blue}50`, color:T.blue, fontSize:10 }}>
            {syncing ? '同步中…' : '☁ 推送到 Sheets'}
          </button>
          <button className="btn" onClick={syncSheets} disabled={syncing}
            style={{ flex:1, background:T.grnD, border:`1px solid ${T.grn}50`, color:T.grn, fontSize:10 }}>
            {syncing ? '讀取中…' : '⟳ 從 Sheets 讀入'}
          </button>
        </div>
      </div>

      <button className="btn" onClick={save} style={{ background:T.amber, color:T.bg, width:'100%', letterSpacing:'0.08em' }}>
        SAVE SETTINGS
      </button>

      {/* ── LINKED HINT BATCH ── */}
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        <label style={{ fontFamily:MONO, fontSize:9, color:T.txt2, letterSpacing:'0.1em' }}>LINKED HINT 批次產生</label>
        {(() => {
          const total = (sentences ?? []).length
          const missing = (sentences ?? []).filter(s => !s.linked_hint).length
          const isRunning = batchProgress && batchProgress.current < batchProgress.total && !batchProgress.stopped
          return (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, lineHeight:1.7 }}>
                目前：<span style={{color:T.txt}}>{total - missing}</span> / {total} 張有連音標注
                {missing > 0 && <span style={{color:T.amber}}>（{missing} 張空白）</span>}
              </div>
              {!isRunning ? (
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn"
                    onClick={() => batchGenLinkedHint('missing')}
                    disabled={missing === 0}
                    style={{ flex:1, background:T.blueD, border:`1px solid ${T.blue}50`, color:T.blue, fontSize:10 }}>
                    ✨ 補空白 ({missing})
                  </button>
                  <button className="btn"
                    onClick={() => batchGenLinkedHint('all')}
                    disabled={total === 0}
                    style={{ flex:1, background:T.amberD, border:`1px solid ${T.amber}50`, color:T.amber, fontSize:10 }}>
                    🔄 全部重新產生
                  </button>
                </div>
              ) : (
                <button className="btn" onClick={() => { batchStop.current = true }}
                  style={{ background:T.redD, border:`1px solid ${T.red}50`, color:T.red, fontSize:10 }}>
                  ■ 停止
                </button>
              )}
              {batchProgress && (
                <div style={{ background:T.surf2, border:`1px solid ${T.bdr}`, borderRadius:9, padding:'11px 13px', display:'flex', flexDirection:'column', gap:6 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontFamily:MONO, fontSize:9, color:T.txt2 }}>
                      {batchProgress.stopped ? '已停止' : batchProgress.current >= batchProgress.total ? '完成' : '處理中…'}
                    </span>
                    <span style={{ fontFamily:MONO, fontSize:10, color:T.amber }}>
                      {batchProgress.current} / {batchProgress.total}
                    </span>
                  </div>
                  {/* progress bar */}
                  <div style={{ background:T.bdr, borderRadius:4, height:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:4, background: batchProgress.stopped ? T.red : T.amber, width:`${(batchProgress.current/batchProgress.total)*100}%`, transition:'width 0.3s' }}/>
                  </div>
                  <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {batchProgress.label}
                  </div>
                  <div style={{ fontFamily:MONO, fontSize:9, display:'flex', gap:14 }}>
                    <span style={{color:T.grn}}>✓ {batchProgress.done}</span>
                    {batchProgress.errors > 0 && <span style={{color:T.red}}>✗ {batchProgress.errors}</span>}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* ── VOCAB 批次補全 IPA + 中文 ── */}
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        <label style={{ fontFamily:MONO, fontSize:9, color:T.txt2, letterSpacing:'0.1em' }}>📖 VOCAB 批次補全 IPA ＋ 中文</label>
        {(() => {
          const totalV = (vocab ?? []).length
          const missingV = (vocab ?? []).filter(v => !v.ipa_us || !v.zh).length
          const isRunningV = batchProgress && batchProgress.mode === 'vocab' && batchProgress.current < batchProgress.total && !batchProgress.stopped
          return (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, lineHeight:1.7 }}>
                目前：<span style={{color:T.txt}}>{totalV - missingV}</span> / {totalV} 個單字已有 IPA ＋ 中文
                {missingV > 0 && <span style={{color:T.amber}}>（{missingV} 個缺少）</span>}
              </div>
              {!isRunningV ? (
                <button className="btn"
                  onClick={batchFillVocabMeta}
                  disabled={missingV === 0}
                  style={{ background:T.blueD, border:`1px solid ${T.blue}50`, color:T.blue, fontSize:10 }}>
                  🤖 AI 批次補全 ({missingV} 個)
                </button>
              ) : (
                <button className="btn" onClick={() => { batchStop.current = true }}
                  style={{ background:T.redD, border:`1px solid ${T.red}50`, color:T.red, fontSize:10 }}>
                  ■ 停止
                </button>
              )}
              {batchProgress && batchProgress.mode === 'vocab' && (
                <div style={{ background:T.surf2, border:`1px solid ${T.bdr}`, borderRadius:9, padding:'11px 13px', display:'flex', flexDirection:'column', gap:6 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontFamily:MONO, fontSize:9, color:T.txt2 }}>
                      {batchProgress.stopped ? '已停止' : batchProgress.current >= batchProgress.total ? '完成！' : '補全中…'}
                    </span>
                    <span style={{ fontFamily:MONO, fontSize:10, color:T.blue }}>
                      {batchProgress.current} / {batchProgress.total}
                    </span>
                  </div>
                  <div style={{ background:T.bdr, borderRadius:4, height:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:4, background: batchProgress.stopped ? T.red : T.blue, width:`${(batchProgress.current/batchProgress.total)*100}%`, transition:'width 0.3s' }}/>
                  </div>
                  <div style={{ fontFamily:MONO, fontSize:9, color:T.blue, fontWeight:500 }}>
                    {batchProgress.label}
                  </div>
                  <div style={{ fontFamily:MONO, fontSize:9, display:'flex', gap:14 }}>
                    <span style={{color:T.grn}}>✓ {batchProgress.done}</span>
                    {batchProgress.errors > 0 && <span style={{color:T.red}}>✗ {batchProgress.errors}</span>}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* ── BACKUP / EXPORT ── */}
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        <label style={{ fontFamily:MONO, fontSize:9, color:T.txt2, letterSpacing:'0.1em' }}>DATA BACKUP</label>
        {(() => {
          const SEED_IDS = new Set(SEED_S.map(c => c.id))
          const seedCount = (sentences ?? []).filter(c => SEED_IDS.has(c.id)).length
          return seedCount > 0 ? (
            <button className="btn" onClick={() => {
              updateSentences(prev => prev.filter(c => !SEED_IDS.has(c.id)))
              flash(`✓ 已清除 ${seedCount} 張 SEED 預設卡`)
            }} style={{ background:T.redD, border:`1px solid ${T.red}50`, color:T.red, fontSize:10 }}>
              🗑 清除 {seedCount} 張 SEED 預設卡（保留 Sheets 資料）
            </button>
          ) : null
        })()}
        <button className="btn" onClick={exportJSON}
          style={{ background:T.grnD, border:`1px solid ${T.grn}50`, color:T.grn, fontSize:10 }}>
          ⬇ 備份 JSON（完整還原用）
        </button>
        <button className="btn" onClick={() => fileInputRef.current?.click()}
          style={{ background:T.blueD, border:`1px solid ${T.blue}50`, color:T.blue, fontSize:10 }}>
          ⬆ 從 JSON 匯入還原
        </button>
        <input ref={fileInputRef} type="file" accept=".json,application/json"
          onChange={handleImportFile} style={{ display:'none' }}/>
        <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, lineHeight:1.6 }}>
          JSON 備份包含所有資料與 SRS 進度，可完整還原。<br/>
          匯入時 SRS 進度自動保留，資料完全覆蓋。
        </div>
      </div>

      {/* ── 匯入確認 Modal ── */}
      {importPreview && (
        <div style={{ position:'fixed', inset:0, background:'#00000090', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ background:T.surf, border:`1px solid ${T.amber}50`, borderRadius:16, padding:24, width:'100%', maxWidth:400, display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ fontFamily:DISP, fontSize:13, color:T.amber, letterSpacing:'0.1em' }}>確認匯入？</div>
            <div style={{ fontFamily:MONO, fontSize:10, color:T.txt2, lineHeight:1.8 }}>
              <div>📅 備份時間：<span style={{color:T.txt}}>{importPreview.exportedAt.slice(0,10)}</span></div>
              <div>📝 句子：<span style={{color:T.txt}}>{importPreview.sentences.length} 筆</span></div>
              <div>📖 單字：<span style={{color:T.txt}}>{importPreview.vocab.length} 筆</span></div>
            </div>
            <div style={{ fontFamily:MONO, fontSize:9, color:T.red, lineHeight:1.7, background:T.redD, border:`1px solid ${T.red}30`, borderRadius:8, padding:'10px 12px' }}>
              ⚠ 目前資料將被完全覆蓋（{(sentences??[]).length} 句 + {(vocab??[]).length} 單字）<br/>
              SRS 進度（已有 id 的卡片）會自動保留。
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn" onClick={() => setImportPreview(null)}
                style={{ flex:1, background:T.bdr, color:T.txt2, fontSize:11 }}>
                取消
              </button>
              <button className="btn" onClick={confirmImport}
                style={{ flex:2, background:T.blue, color:'#fff', fontSize:11, fontWeight:600 }}>
                確認匯入
              </button>
            </div>
          </div>
        </div>
      )}

      {msg && (
        <div style={{ fontFamily:MONO, fontSize:11, color: msg.startsWith('✓') ? T.grn : msg.startsWith('✗') ? T.red : T.txt2, textAlign:'center', padding:6, animation:'fadeUp 0.2s ease' }}>
          {msg}
        </div>
      )}

      {/* PWA info */}
      <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:12, padding:16 }}>
        <div style={{ fontFamily:DISP, fontSize:11, color:T.amber, letterSpacing:'0.12em', marginBottom:8 }}>INSTALL AS PWA</div>
        <div style={{ fontFamily:SERIF, fontSize:13, color:T.txt2, lineHeight:1.65 }}>
          iOS Safari: tap Share → "Add to Home Screen"<br/>
          Android Chrome: tap ⋮ → "Add to Home Screen"
        </div>
        <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, marginTop:9, lineHeight:1.7 }}>
          All data is stored locally in your browser.<br/>
          Gmail integration: paste email text into the AI tab.
        </div>
      </div>

      {/* Sentence count */}
      <div style={{ textAlign:'center', fontFamily:MONO, fontSize:9, color:T.txt3, paddingBottom:4 }}>
        {(sentences??[]).length} sentences in practice library
      </div>

      {/* ── GPT-5 診斷 ── */}
      <GPT5Diagnose />

      {/* ── 翻譯測試（預設收合）── */}
      <TranslateTest />

      {/* ── Goals / Achievements (moved from tab) ── */}
      <AchieveTab stats={stats} earned={earned} sentences={sentences} vocab={vocab}/>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab]         = useState('movie')
  const [sentences, setSentences] = useState(null)
  const [vocab, setVocab]     = useState(null)
  const [stats, setStats]     = useState(null)
  const [settings, setSettings] = useState(null)
  const [earned, setEarned]   = useState(null)
  const [ready, setReady]     = useState(false)
  const [audioMode, setAudioMode] = useState(
    () => localStorage.getItem('fsi:movie:audioMode') ?? 'original'
  )
  const [movieToast, setMovieToast] = useState('')
  const showMovieToast = (msg) => {
    setMovieToast(msg)
    setTimeout(() => setMovieToast(''), 2000)
  }

  function toggleAudioMode() {
    const next = audioMode === 'original' ? 'tts' : 'original'
    setAudioMode(next)
    localStorage.setItem('fsi:movie:audioMode', next)
  }

  // ── 離開確認（避免誤觸關閉 App）──────────────────────────────
  useEffect(() => {
    const handler = e => {
      e.preventDefault()
      e.returnValue = '確定要離開嗎？離開後需重新選擇 MP3 檔案。'
      return e.returnValue
    }
    window.addEventListener('beforeunload', handler)
    // ── Service Worker：註冊輕量 App Shell 快取 SW ──
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/fsi-command/sw.js', { scope: '/fsi-command/' })
        .then(() => console.log('[SW] 已註冊'))
        .catch(e => console.warn('[SW] 註冊失敗', e))
    }
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    Promise.all([
      stor.get('fsi:s'), stor.get('fsi:v'), stor.get('fsi:st'),
      stor.get('fsi:se'), stor.get('fsi:ea')
    ]).then(([s, v, st, se, ea]) => {
      // SEED 管理：有真實資料（非 sv* 卡）時，自動清除所有 SEED 卡
      let sentences = s ?? SEED_S
      if (s && s.length > 0) {
        const seedIds = new Set(SEED_S.map(c => c.id))
        const hasRealCards = s.some(c => !seedIds.has(c.id))
        if (hasRealCards) {
          // 有真實 Sheets 資料 → 清掉所有 SEED 卡片
          const cleaned = s.filter(c => !seedIds.has(c.id))
          if (cleaned.length !== s.length) {
            sentences = cleaned
            stor.set('fsi:s', cleaned)
          }
        } else {
          // 全是 SEED → 補入尚未存在的新 SEED 卡
          const existingIds = new Set(s.map(c => c.id))
          const newCards = SEED_S.filter(c => !existingIds.has(c.id))
          if (newCards.length > 0) {
            sentences = [...s, ...newCards]
            stor.set('fsi:s', sentences)
          }
        }
      }
      setSentences(sentences)
      setVocab(v ?? SEED_V)
      setStats(st ?? { xp:0, streak:0, lastDate:'', totalDrills:0, correct:0, perfectStreak:0 })
      setSettings(se ?? { apiKey:'', sheetUrl:'' })
      setEarned(ea ?? [])
      setReady(true)
    })
  }, [])

  // Wake Lock — keep screen on while app is open
  useEffect(() => {
    let wakeLock = null
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen')
        }
      } catch(e) { /* user denied or not supported */ }
    }
    requestWakeLock()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requestWakeLock()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      wakeLock?.release()
    }
  }, [])

  const updateSentences = useCallback((fn) => setSentences(prev => { const n=fn(prev); stor.set('fsi:s',n); return n }), [])
  const updateVocab     = useCallback((fn) => setVocab(prev     => { const n=fn(prev); stor.set('fsi:v',n); return n }), [])
  const updateStats     = useCallback((fn) => setStats(prev     => { const n=fn(prev); stor.set('fsi:st',n); return n }), [])
  const updateSettings  = useCallback((fn) => setSettings(prev => {
    const n = fn(prev)
    try { localStorage.setItem('fsi:se', JSON.stringify(n)) } catch(e) { console.warn('settings save failed', e) }
    return n
  }), [])

  const awardBadge = useCallback((id) => {
    setEarned(prev => {
      if (!prev || prev.includes(id)) return prev
      const badge = BADGES.find(b => b.id === id)
      if (badge) updateStats(s => ({ ...s, xp: (s.xp??0) + badge.xp }))
      const next = [...prev, id]
      stor.set('fsi:ea', next)
      return next
    })
  }, [updateStats])

  if (!ready) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'#050810', gap:18 }}>
      <style>{G}</style>
      <AppIcon size={56}/>
      <div style={{ fontFamily:DISP, fontSize:15, color:'#f5a623', letterSpacing:'0.14em' }}>FSI COMMAND v3.46</div>
      <div style={{ fontFamily:MONO, fontSize:10, color:'#484f58', letterSpacing:'0.1em', animation:'pulse 1.5s infinite' }}>INITIALIZING…</div>
    </div>
  )

  const P = { sentences, vocab, stats, settings, earned, updateSentences, updateVocab, updateStats, updateSettings, awardBadge }

  return (
    <div style={{ background:T.bg, minHeight:'100vh', maxWidth:480, margin:'0 auto', display:'flex', flexDirection:'column', position:'relative' }}>
      <style>{G}</style>
      <Header stats={stats} audioMode={audioMode} toggleAudioMode={toggleAudioMode}/>
      <div style={{ flex:1, overflowY:'auto', paddingBottom:'calc(110px + env(safe-area-inset-bottom, 20px))' }}>
        {tab==='phrase'   && <PhraseTab   settings={settings}/>}
        {tab==='practice' && <PracticeTab {...P}/>}
        {tab==='drill'    && <DrillTab    {...P}/>}
        {tab==='vocab'    && <VocabTab    {...P}/>}
        {tab==='email'    && <EmailTab    {...P}/>}
        <div style={{display: tab==='movie' ? 'flex' : 'none', flexDirection:'column', flex:1, minHeight:0}}>
          <MovieTab audioMode={audioMode} setAudioMode={setAudioMode} movieToast={movieToast} showMovieToast={showMovieToast}/>
        </div>
        {tab==='settings' && <SettingsTab {...P} movieToast={movieToast} showMovieToast={showMovieToast}/>}
      </div>
      <BottomNav tab={tab} setTab={setTab}/>
    </div>
  )
}
