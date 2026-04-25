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
async function callClaude(apiKey, messages, system = '') {
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
function Header({ stats }) {
  const xp = stats?.xp ?? 0
  const lvl = [...LEVELS].reverse().find(l => xp >= l.min) ?? LEVELS[0]
  const nxt = LEVELS[LEVELS.indexOf(lvl) + 1]
  const pct = nxt ? Math.min(100, ((xp - lvl.min) / (nxt.min - lvl.min)) * 100) : 100
  return (
    <header style={{ background:T.surf, borderBottom:`1px solid ${T.bdr}`, padding:'10px 16px', display:'flex', alignItems:'center', gap:10, position:'sticky', top:0, zIndex:10 }}>
      <AppIcon size={30} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:DISP, fontSize:12, color:T.amber, letterSpacing:'0.14em', lineHeight:1 }}>FSI COMMAND v3.13</div>
        <div style={{ display:'flex', alignItems:'center', gap:7, marginTop:5 }}>
          <span style={{ fontFamily:MONO, fontSize:9, color:T.txt2, whiteSpace:'nowrap' }}>{lvl.name}</span>
          <div style={{ flex:1, height:3, background:T.bdr2, borderRadius:2, overflow:'hidden' }}>
            <div style={{ width:`${pct}%`, height:'100%', background:lvl.clr, borderRadius:2, transition:'width 0.7s ease' }}/>
          </div>
          <span style={{ fontFamily:MONO, fontSize:9, color:T.amber, whiteSpace:'nowrap' }}>{xp} XP</span>
        </div>
      </div>
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
  { id:'achieve',  label:'Goals',   svg: <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 3V1.5M10 18.5V17M3 10H1.5M18.5 10H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
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

async function generateQuestions(card, apiKey) {
  const cacheKey = 'fsi:dq:' + card.id
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) return JSON.parse(cached)
  } catch {}

  const type = detectCardType(card)
  const fallback = Q_TEMPLATES[type]

  if (!apiKey) return fallback

  try {
    const prompt = `Factory meeting context. Generate exactly 3 short questions (under 12 words each) that someone might ask in a meeting, where the answer would be:
"${card.template}"
Scenario: ${card.context}${card.hint ? ' — ' + card.hint : ''}

Return ONLY a JSON array of 3 strings, no markdown, no explanation.
Example: ["Question 1?","Question 2?","Question 3?"]`

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    const d = await r.json()
    const text = d.content?.[0]?.text ?? ""
    const questions = JSON.parse(text.replace(/```json|```/g, "").trim())
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
  const stages = ['shadow','respond','pressure']
  const labels = ['SHADOW','RESPOND','PRESSURE']
  const colors = [T.blue, T.amber, T.red]
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
      generateQuestions(card, settings?.apiKey).then(qs => {
        setQuestions(qs); setLoadingQ(false)
      })
    } else {
      // Silent background generation during shadow stage
      generateQuestions(card, settings?.apiKey).then(qs => setQuestions(qs))
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
      // PRESSURE: 70/30 rotation
      if (stage === 'pressure') {
        const rotate = Math.random() < 0.3 ? 'respond' : 'pressure'
        saveProgress(card.id, { stage: rotate, qIndex: nextQIndex })
      } else {
        saveProgress(card.id, { respondOk: newOk, qIndex: nextQIndex })
      }
    }
    nextCard()
  }

  function nextCard() {
    setCardIdx(i => (i + 1) % Math.max(1, cards.length))
    setPhase('question')
    setTimedOut(false)
    setTimerRunning(false)
    setShowHint(false)
    setShowKw(false)
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
            <b style={{color:T.red}}>PRESSURE</b> — 3秒倒數，超時只顯示關鍵詞，模擬會議壓力
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

              {/* Weakness tag placeholder */}
              <div style={{ fontFamily:MONO, fontSize:8, color:T.txt3, textAlign:'center', opacity:0.5 }}>
                WEAKNESS TAGS — coming soon
              </div>
            </div>
          )}
        </div>
      )}

      {/* BOSS placeholder */}
      <div style={{ marginTop:4, padding:'10px 14px', background:T.surf2, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3, letterSpacing:'0.1em' }}>STAGE 4 — BOSS FOLLOW-UP</span>
        <span style={{ fontFamily:MONO, fontSize:8, color:T.txt3, background:T.bdr, padding:'2px 8px', borderRadius:10 }}>COMING SOON</span>
      </div>
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
        <div style={{ display:'flex', alignItems:'center', fontFamily:MONO, fontSize:9, color:T.txt3, whiteSpace:'nowrap', paddingLeft:4 }}>
          {queue.length} cards
        </div>
      </div>

      {!card ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:T.txt3, fontFamily:SERIF, fontSize:14 }}>
          No sentences in this mode yet.<br/>
          <span style={{ fontSize:12, color:T.txt3 }}>Add via AI Analysis or Settings.</span>
        </div>
      ) : (
        <>
          <SectionLabel color={T.amber}>{card.context}</SectionLabel>

          {/* Drill card */}
          <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:14, padding:20, position:'relative' }}>
            {card.hint && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:12, paddingBottom:12, borderBottom:`1px solid ${T.bdr}` }}>
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
    const d = DIFF[diff ?? 'mid']
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
const PHRASE_CATS = [
  { id:'all',      label:'全部' },
  { id:'opening',  label:'開場/進度' },
  { id:'capacity', label:'產能/稼動' },
  { id:'quality',  label:'良率/品質' },
  { id:'cost',     label:'成本/毛利' },
  { id:'action',   label:'行動/決策' },
]
const PHRASE_DATA = [
  // 一、會議開場 / 進度更新
  { id:'ph01', cat:'opening', en:'Let me give a quick update on the current status.', zh:'讓我快速更新一下目前狀況。' },
  { id:'ph02', cat:'opening', en:"Let's start with the production update.", zh:'我們先從生產狀況開始。' },
  { id:'ph03', cat:'opening', en:'The overall performance is stable.', zh:'整體績效目前穩定。' },
  { id:'ph04', cat:'opening', en:'Production is running normally today.', zh:'今天生產運作正常。' },
  { id:'ph05', cat:'opening', en:'The current status is under control.', zh:'目前狀況在控制之中。' },
  { id:'ph06', cat:'opening', en:'We are making steady progress.', zh:'我們正在穩定推進。' },
  { id:'ph07', cat:'opening', en:'Let me summarize the key points.', zh:'我來總結一下重點。' },
  { id:'ph08', cat:'opening', en:'We will review the details later.', zh:'細節我們稍後再檢視。' },
  { id:'ph09', cat:'opening', en:'I will walk you through the main issues.', zh:'我來說明主要問題。' },
  { id:'ph10', cat:'opening', en:"Let's move on to the next topic.", zh:'我們進入下一個議題。' },
  // 二、生產 / 產能 / 稼動率
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
  // 三、良率 / 品質 / 問題分析
  { id:'ph21', cat:'quality', en:'The yield has improved compared to last month.', zh:'良率比上月有所改善。' },
  { id:'ph22', cat:'quality', en:'The yield is still below our target.', zh:'良率仍低於目標。' },
  { id:'ph23', cat:'quality', en:'We are investigating the root cause.', zh:'我們正在調查根本原因。' },
  { id:'ph24', cat:'quality', en:'We identified the main issue in the process.', zh:'我們已找到製程的主要問題。' },
  { id:'ph25', cat:'quality', en:'Corrective actions are being implemented.', zh:'正在執行矯正措施。' },
  { id:'ph26', cat:'quality', en:'We need to prevent this issue from happening again.', zh:'我們需要防止問題再次發生。' },
  { id:'ph27', cat:'quality', en:'The defect rate has decreased significantly.', zh:'不良率明顯下降。' },
  { id:'ph28', cat:'quality', en:'Quality performance is improving steadily.', zh:'品質表現正在穩定改善。' },
  { id:'ph29', cat:'quality', en:'The issue has been contained.', zh:'問題已經被控制。' },
  { id:'ph30', cat:'quality', en:'We will continue to monitor the situation.', zh:'我們會持續監控狀況。' },
  // 四、成本 / 毛利 / 策略
  { id:'ph31', cat:'cost', en:'We need to mitigate the cost impact.', zh:'我們需要減輕成本衝擊。' },
  { id:'ph32', cat:'cost', en:'Several cost reduction projects are underway.', zh:'多個降成本專案正在進行。' },
  { id:'ph33', cat:'cost', en:'The gross margin needs improvement.', zh:'毛利需要改善。' },
  { id:'ph34', cat:'cost', en:'We need to review the pricing strategy.', zh:'我們需要檢討定價策略。' },
  { id:'ph35', cat:'cost', en:'The current cost structure needs adjustment.', zh:'目前成本結構需要調整。' },
  { id:'ph36', cat:'cost', en:'This product currently has a negative margin.', zh:'這個產品目前毛利為負。' },
  { id:'ph37', cat:'cost', en:'We need to optimize the product portfolio.', zh:'我們需要優化產品組合。' },
  { id:'ph38', cat:'cost', en:'The price gap with competitors is still large.', zh:'與競爭對手仍有價格差距。' },
  { id:'ph39', cat:'cost', en:'We need to close the gap as soon as possible.', zh:'我們需要盡快縮小差距。' },
  { id:'ph40', cat:'cost', en:'This will have a significant impact on our margin.', zh:'這會對毛利產生明顯影響。' },
  // 五、行動 / 決策 / 管理
  { id:'ph41', cat:'action', en:'This issue should be our top priority.', zh:'這個問題應該是我們的首要優先事項。' },
  { id:'ph42', cat:'action', en:'We need to take action immediately.', zh:'我們需要立即採取行動。' },
  { id:'ph43', cat:'action', en:'Please coordinate with the engineering team.', zh:'請與工程團隊協調。' },
  { id:'ph44', cat:'action', en:"Let's follow up on this next week.", zh:'我們下週再追蹤。' },
  { id:'ph45', cat:'action', en:'We need a clear action plan.', zh:'我們需要一個清楚的行動計畫。' },
  { id:'ph46', cat:'action', en:'Please provide justification for this request.', zh:'請提供這項需求的理由。' },
  { id:'ph47', cat:'action', en:'We will evaluate this proposal.', zh:'我們會評估這個提案。' },
  { id:'ph48', cat:'action', en:"Let's align with the team before making a decision.", zh:'我們先與團隊對齊再做決定。' },
  { id:'ph49', cat:'action', en:'We need to monitor this closely.', zh:'我們需要密切監控。' },
  { id:'ph50', cat:'action', en:"Let's keep this as a key focus.", zh:'這件事我們持續重點關注。' },
]

// ═══════════════════════════════════════════════════════════════
// PHRASE TAB
// ═══════════════════════════════════════════════════════════════
function PhraseTab({ settings }) {
  const [cat, setCat]           = useState('all')
  const [idx, setIdx]           = useState(0)
  const [phase, setPhase]       = useState('listen')
  const [doneIds, setDoneIds]   = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('fsi:ph:done') ?? '[]')) } catch { return new Set() }
  })
  const [autoPlayed, setAutoPlayed] = useState(false)
  const [extraPhrases, setExtraPhrases] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fsi:ph:extra') ?? '[]') } catch { return [] }
  })

  // Reload extra phrases when tab becomes visible
  useEffect(() => {
    const all = [...PHRASE_DATA, ...extraPhrases]
    // no-op, just ensures re-render when extra changes
  }, [extraPhrases])

  const allPhrases = [...PHRASE_DATA, ...extraPhrases]
  const queue = cat === 'all' ? allPhrases : allPhrases.filter(p => p.cat === cat)
  const card   = queue[idx] ?? queue[0]
  const total  = queue.length
  const doneCount = queue.filter(p => doneIds.has(p.id)).length

  // Auto-play on card change
  useEffect(() => {
    if (!card) return
    setPhase('listen')
    setAutoPlayed(false)
  }, [idx, cat])

  useEffect(() => {
    if (phase === 'listen' && !autoPlayed && card) {
      const t = setTimeout(() => {
        speakCard(0.85)
        setAutoPlayed(true)
      }, 400)
      return () => clearTimeout(t)
    }
  }, [phase, autoPlayed, card])

  function speakCard(rate = 1) {
    if (!card) return
    const u = new SpeechSynthesisUtterance(card.en)
    u.lang = 'en-US'; u.rate = rate
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }

  function markDone() {
    const next = new Set(doneIds)
    next.add(card.id)
    setDoneIds(next)
    localStorage.setItem('fsi:ph:done', JSON.stringify([...next]))
    goNext()
  }

  function goNext() {
    setIdx(i => (i + 1) % total)
  }

  function goAgain() {
    setPhase('listen')
    setAutoPlayed(false)
  }

  const catColors = { opening:'#58a6ff', capacity:'#f5a623', quality:'#3fb950', cost:'#f85149', action:'#a371f7' }
  const cc = catColors[card?.cat] ?? T.amber

  return (
    <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:12, minHeight:'80vh' }} className="fadeUp">

      {/* Category filter */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {PHRASE_CATS.map(c => (
          <div key={c.id} onClick={() => { setCat(c.id); setIdx(0) }}
            style={{ padding:'4px 11px', borderRadius:12, fontFamily:MONO, fontSize:9, cursor:'pointer', letterSpacing:'0.06em',
              background: cat===c.id ? T.amber : T.surf2,
              border: '1px solid ' + (cat===c.id ? T.amber : T.bdr),
              color: cat===c.id ? T.bg : T.txt3, fontWeight: cat===c.id ? 700 : 400,
              transition:'all 0.14s' }}>
            {c.label}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ flex:1, height:4, background:T.surf2, borderRadius:4, overflow:'hidden' }}>
          <div style={{ height:'100%', width: (doneCount/total*100)+'%', background:T.grn, borderRadius:4, transition:'width 0.4s' }}/>
        </div>
        <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3, flexShrink:0 }}>{doneCount}/{total}</span>
      </div>

      {/* Card number */}
      <div style={{ fontFamily:MONO, fontSize:8.5, color:T.txt3, textAlign:'center', letterSpacing:'0.08em' }}>
        {idx+1} / {total}
      </div>

      {/* Main card */}
      {card && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:0 }}>

          {/* Category badge */}
          <div style={{ display:'flex', justifyContent:'center', marginBottom:12 }}>
            <span style={{ fontFamily:MONO, fontSize:8, color:cc, background:cc+'18', border:'1px solid '+cc+'40', padding:'3px 12px', borderRadius:10, letterSpacing:'0.08em' }}>
              {PHRASE_CATS.find(c => c.id === card.cat)?.label ?? card.cat}
            </span>
          </div>

          {/* LISTEN phase */}
          {phase === 'listen' && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:24 }}>

              {/* Speaker + speed buttons in one row */}
              <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                <div onClick={() => speakCard(1)}
                  style={{ width:72, height:72, borderRadius:'50%', background:cc+'15', border:'1px solid '+cc+'50', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0, gap:4 }}>
                  <span style={{ fontSize:20 }}>🔊</span>
                  <span style={{ fontFamily:MONO, fontSize:8, color:cc }}>1.0x</span>
                </div>

                <div style={{ width:72, height:72, borderRadius:'50%', background:cc+'18', border:'2px solid '+cc+'40', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <path d="M3 9h4l5-5v16l-5-5H3z" stroke={cc} strokeWidth="1.5" fill={cc+'30'}/>
                    <path d="M16 6.5a5.5 5.5 0 010 11" stroke={cc} strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M13.5 9a2.5 2.5 0 010 5" stroke={cc} strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>

                <div onClick={() => speakCard(0.7)}
                  style={{ width:72, height:72, borderRadius:'50%', background:cc+'15', border:'1px solid '+cc+'50', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0, gap:4 }}>
                  <span style={{ fontSize:20 }}>🐢</span>
                  <span style={{ fontFamily:MONO, fontSize:8, color:cc }}>0.7x</span>
                </div>
              </div>

              <div style={{ fontFamily:SERIF, fontSize:13, color:T.txt2, fontStyle:'italic', textAlign:'center', lineHeight:1.6, padding:'0 8px' }}>
                仔細聽，然後在紙上寫下英文句子
              </div>

              {/* Next step button */}
              <button className="btn" onClick={() => setPhase('reveal')}
                style={{ background:T.amber, color:T.bg, width:'100%', padding:'15px', fontSize:13, fontWeight:700, letterSpacing:'0.1em' }}>
                ✏️ 我寫好了 → 對答案
              </button>
            </div>
          )}

          {/* REVEAL phase */}
          {phase === 'reveal' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }} className="fadeUp">

              {/* English answer — big */}
              <div style={{ background:T.surf, border:'1px solid '+cc+'50', borderRadius:14, padding:'20px 18px', display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ fontFamily:MONO, fontSize:15, color:T.txt, lineHeight:1.7, letterSpacing:'0.01em' }}>
                  {card.en}
                </div>
                <div style={{ height:1, background:T.bdr }}/>
                <div style={{ fontFamily:SERIF, fontSize:13, color:T.txt2, fontStyle:'italic', lineHeight:1.6 }}>
                  {card.zh}
                </div>
              </div>

              {/* TTS buttons */}
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn" onClick={() => speakCard(0.75)}
                  style={{ flex:1, background:cc+'15', border:'1px solid '+cc+'50', color:cc, padding:'11px 0', fontSize:11 }}>
                  🐢 跟我念（慢）
                </button>
                <button className="btn" onClick={() => speakCard(1)}
                  style={{ flex:1, background:cc+'15', border:'1px solid '+cc+'50', color:cc, padding:'11px 0', fontSize:11 }}>
                  🔊 跟我念（正常）
                </button>
              </div>

              {/* Rating */}
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button className="btn" onClick={goAgain}
                  style={{ flex:1, background:T.redD, border:'1px solid '+T.red+'55', color:T.red, padding:'13px 0', fontSize:13, letterSpacing:'0.06em' }}>
                  ↺ 再來一次
                </button>
                <button className="btn" onClick={markDone}
                  style={{ flex:2, background:T.grnD, border:'1px solid '+T.grn+'55', color:T.grn, padding:'13px 0', fontSize:13, fontWeight:700, letterSpacing:'0.06em' }}>
                  ✓ 我會了 →
                </button>
              </div>

            </div>
          )}
        </div>
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

  useEffect(() => {
    const h = () => setIsDesktop(window.innerWidth > 640)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

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
        '   - Include def (concise) and ex (example sentence).',
        '   - Extract 2-4 words.\n',
        'Return ONLY valid JSON, no markdown:',
        '{"phrases":[{"en":"...","zh":"...","cat":"opening"}],',
        '"fsi":[{"template":"...{slot}...","context":"Short name","hint":"When to say this","linked_hint":"annotated","subs":[["opt1","opt2","opt3"]]}],',
        '"vocab":[{"word":"...","def":"...","ex":"..."}]}'
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
    const id = 'ph_ai_' + Date.now()
    const cat = catId || p.cat || 'action'
    const newPhrase = { id, cat, en: p.en, zh: p.zh }
    localStorage.setItem('fsi:ph:extra', JSON.stringify([...existing, newPhrase]))
    setAddedP(a => [...a, p.en])
    updateStats(st => ({ ...st, xp: (st.xp??0) + 3 }))
  }

  function addFsi(s, cat) {
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
    const id = 'av_' + Date.now()
    updateVocab(prev => [...(prev??[]), {
      id, word:v.word, ipa_us:'', def:v.def, ex:v.ex,
      reps:0, ease:2.5, interval:1, dueDate:0, lastSeen:0
    }])
    setAddedV(a => [...a, v.word])
    updateStats(st => ({ ...st, xp: (st.xp??0) + 3 }))
  }

  function addAll() {
    ;(res?.phrases ?? []).forEach((p,i) => { if (!addedP.includes(p.en)) addPhrase(p, phraseCats[i]) })
    ;(res?.fsi     ?? []).forEach((s,i) => { if (!addedS.includes(s.template)) addFsi(s, fsiCats[i] ?? 'work') })
    ;(res?.vocab   ?? []).forEach(v => { if (!addedV.includes(v.word)) addVocab(v) })
  }

  const totalAdded  = addedP.length + addedS.length + addedV.length
  const totalItems  = (res?.phrases?.length??0) + (res?.fsi?.length??0) + (res?.vocab?.length??0)

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
    const done = addedP.includes(p.en)
    return (
      <div style={{ background:T.surf, border:'1px solid '+(done ? T.grn+'50' : T.bdr), borderRadius:10, padding:12, display:'flex', flexDirection:'column', gap:7, transition:'border-color 0.3s' }}>
        <div style={{ fontFamily:SERIF, fontSize: desktop?12:13, color:T.txt, lineHeight:1.6 }}>{p.en}</div>
        <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize: desktop?11:12, color:T.txt2 }}>{p.zh}</div>
        <PhraseCatSelect idx={i} done={done}/>
        <button className="btn" onClick={() => addPhrase(p, phraseCats[i])} disabled={done}
          style={{ background: done ? T.grnD : T.blueD, border:'1px solid '+(done ? T.grn+'50' : T.blue+'50'), color: done ? T.grn : T.blue, fontSize:9, padding:'5px 0', marginTop:2 }}>
          {done ? '✓ 已加入 PHRASE' : '+ 加入 PHRASE 練習'}
        </button>
      </div>
    )
  }

  function FsiCard({ s, i, desktop }) {
    const done = addedS.includes(s.template)
    return (
      <div style={{ background:T.surf, border:'1px solid '+(done ? T.grn+'50' : T.bdr), borderRadius:10, padding:12, display:'flex', flexDirection:'column', gap:7, transition:'border-color 0.3s' }}>
        <div style={{ fontFamily:MONO, fontSize: desktop?11:12, color:T.txt, lineHeight:1.6 }}>{s.template}</div>
        <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:11, color:T.txt3 }}>{s.context} — {s.hint}</div>
        {s.linked_hint && <div style={{ fontFamily:MONO, fontSize:10, color:T.amber, background:T.amberD, borderRadius:6, padding:'4px 8px' }}>{s.linked_hint}</div>}
        {(s.subs??[]).map((g,gi) => (
          <div key={gi} style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
            {g.map((o,oi) => <span key={oi} style={{ fontFamily:MONO, fontSize:9, background:T.surf2, border:'1px solid '+T.bdr, borderRadius:10, padding:'2px 7px', color:T.txt3 }}>{o}</span>)}
          </div>
        ))}
        <WLSelect idx={i} done={done}/>
        <button className="btn" onClick={() => addFsi(s, fsiCats[i]??'work')} disabled={done}
          style={{ background: done ? T.grnD : T.amberD, border:'1px solid '+(done ? T.grn+'50' : T.amber+'50'), color: done ? T.grn : T.amber, fontSize:9, padding:'5px 0', marginTop:2 }}>
          {done ? '✓ 已加入 FSI' : '+ 加入 FSI 練習'}
        </button>
      </div>
    )
  }

  function VocabCard({ v }) {
    const done = addedV.includes(v.word)
    return (
      <div style={{ background:T.surf, border:'1px solid '+(done ? T.grn+'50' : T.bdr), borderRadius:10, padding:12, display:'flex', flexDirection:'column', gap:6 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:MONO, fontSize:13, color:T.blue, fontWeight:500 }}>{v.word}</span>
          <div onClick={() => speak(v.word)} style={{ cursor:'pointer', color:T.txt3 }}
            onMouseOver={e=>e.currentTarget.style.color=T.blue} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M10.5 5a3 3 0 010 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          </div>
        </div>
        <div style={{ fontFamily:SERIF, fontSize:12, color:T.txt2, lineHeight:1.4 }}>{v.def}</div>
        {v.ex && <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:11, color:T.txt3 }}>"{v.ex}"</div>}
        <button className="btn" onClick={() => addVocab(v)} disabled={done}
          style={{ background: done ? T.grnD : T.blueD, border:'1px solid '+(done ? T.grn+'50' : T.blue+'50'), color: done ? T.grn : T.blue, fontSize:9, padding:'5px 0', marginTop:2 }}>
          {done ? '✓ 已加入 VOCAB' : '+ 加入 VOCAB'}
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

  // ── DESKTOP layout ──────────────────────────────────────────
  if (isDesktop) {
    return (
      <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:T.bg, display:'flex', flexDirection:'column', zIndex:5 }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 24px', borderBottom:'1px solid '+T.bdr, background:T.surf, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <AppIcon size={28}/>
            <span style={{ fontFamily:DISP, fontSize:13, color:T.amber, letterSpacing:'0.12em' }}>FSI COMMAND — AI 三分類分析</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {res && (
              <button className="btn" onClick={addAll}
                style={{ background:T.grnD, border:'1px solid '+T.grn+'50', color:T.grn, fontSize:10, padding:'5px 14px' }}>
                ✓ 全部加入（{totalAdded}/{totalItems}）
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
            <button className="btn" onClick={addAll}
              style={{ background:T.grnD, border:'1px solid '+T.grn+'50', color:T.grn, fontSize:9, padding:'4px 12px' }}>
              全部加入 ({totalAdded}/{totalItems})
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
function SettingsTab({ sentences, vocab, updateSentences, updateVocab, settings, updateSettings }) {
  const [key, setKey] = useState(settings?.apiKey ?? '')
  const [elevenKey, setElevenKey] = useState(settings?.elevenKey ?? '')
  // Sync when settings prop changes (e.g. after Sheets read-in)
  useEffect(() => {
    if (settings?.apiKey    !== undefined) setKey(settings.apiKey ?? '')
    if (settings?.elevenKey !== undefined) setElevenKey(settings.elevenKey ?? '')
  }, [settings?.apiKey, settings?.elevenKey])
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

  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_xBUsiWvvoF8Qz9OczKniddNVENSz8W0ToTrzIw7VVCG3V0MlM85vl8Z1VmuNPS8STg/exec'

  async function pushToSheets() {
    if (!(sentences??[]).length && !(vocab??[]).length) { flash('✗ 沒有資料可同步'); return }
    setSyncing(true); flash('推送中…')
    try {
      // 合併內建 + AI 新增的 phrases
      const extraPhrases = (() => { try { return JSON.parse(localStorage.getItem('fsi:ph:extra') ?? '[]') } catch { return [] } })()
      const allPhrases = [...PHRASE_DATA, ...extraPhrases]

      const form = new FormData()
      form.append('data', JSON.stringify({
        sentences: sentences ?? [],
        vocab:     vocab     ?? [],
        phrases:   allPhrases,
      }))
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: form,
      })
      await new Promise(r => setTimeout(r, 2000))
      try {
        const check = await fetch(APPS_SCRIPT_URL)
        const json  = await check.json()
        const sc = (json.sentences ?? []).length
        const vc = (json.vocab     ?? []).length
        const pc = (json.phrases   ?? []).length
        flash(sc || vc ? `✓ Sheets 已確認：${sc} 句 + ${vc} 單字 + ${pc} Phrases` : '✓ 已推送（請至 Sheets 手動確認）')
      } catch {
        flash('✓ 已推送（網路限制，請至 Sheets 確認）')
      }
    } catch(e) {
      flash('✗ ' + (e.message ?? '網路錯誤'))
    } finally { setSyncing(false) }
  }

  function save() {
    const newSettings = { apiKey: key.trim(), elevenKey: elevenKey.trim() }
    updateSettings(() => newSettings)
    try { localStorage.setItem('fsi:se', JSON.stringify(newSettings)) } catch(e) {}
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
    } catch(e) {
      flash('✗ ' + (e.message ?? 'Sync failed.'))
    } finally { setSyncing(false) }
  }

  return (
    <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:18 }} className="fadeUp">
      {/* API Key */}
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        <label style={{ fontFamily:MONO, fontSize:9, color:T.txt2, letterSpacing:'0.1em' }}>ANTHROPIC API KEY</label>
        <div style={{ display:'flex', gap:8 }}>
          <input type={showKey ? 'text' : 'password'} value={key} onChange={e=>setKey(e.target.value)} placeholder="sk-ant-api03-…" style={{ flex:1 }}/>
          <button className="btn" onClick={()=>setShowKey(s=>!s)} style={{ background:T.bdr, color:T.txt2, padding:'10px 13px', fontSize:13 }}>
            {showKey ? '🙈' : '👁'}
          </button>
        </div>
        <span style={{ fontFamily:MONO, fontSize:9, color:T.txt3 }}>Required for AI Analysis tab and auto-generated context hints.</span>
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
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab]         = useState('practice')
  const [sentences, setSentences] = useState(null)
  const [vocab, setVocab]     = useState(null)
  const [stats, setStats]     = useState(null)
  const [settings, setSettings] = useState(null)
  const [earned, setEarned]   = useState(null)
  const [ready, setReady]     = useState(false)

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
      <div style={{ fontFamily:DISP, fontSize:15, color:'#f5a623', letterSpacing:'0.14em' }}>FSI COMMAND v3.13</div>
      <div style={{ fontFamily:MONO, fontSize:10, color:'#484f58', letterSpacing:'0.1em', animation:'pulse 1.5s infinite' }}>INITIALIZING…</div>
    </div>
  )

  const P = { sentences, vocab, stats, settings, earned, updateSentences, updateVocab, updateStats, updateSettings, awardBadge }

  return (
    <div style={{ background:T.bg, minHeight:'100vh', maxWidth:480, margin:'0 auto', display:'flex', flexDirection:'column', position:'relative' }}>
      <style>{G}</style>
      <Header stats={stats}/>
      <div style={{ flex:1, overflowY:'auto', paddingBottom:'calc(110px + env(safe-area-inset-bottom, 20px))' }}>
        {tab==='phrase'   && <PhraseTab   settings={settings}/>}
        {tab==='practice' && <PracticeTab {...P}/>}
        {tab==='drill'    && <DrillTab    {...P}/>}
        {tab==='vocab'    && <VocabTab    {...P}/>}
        {tab==='email'    && <EmailTab    {...P}/>}
        {tab==='achieve'  && <AchieveTab  {...P}/>}
        {tab==='settings' && <SettingsTab {...P}/>}
      </div>
      <BottomNav tab={tab} setTab={setTab}/>
    </div>
  )
}
