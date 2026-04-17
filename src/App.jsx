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
// STORAGE  (window.storage with in-memory fallback)
// ═══════════════════════════════════════════════════════════════
const memCache = {}
const stor = {
  async get(k) {
    try {
      const r = await window.storage?.get(k)
      if (r) return JSON.parse(r.value)
    } catch {}
    return memCache[k] ?? null
  },
  async set(k, v) {
    memCache[k] = v
    try { await window.storage?.set(k, JSON.stringify(v)) } catch {}
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
function speak(text, rate = 0.88) {
  const clean = text.replace(/\{[^}]+\}/g, '...').replace(/[ABCD]:/g, '')
  window.speechSynthesis?.cancel()
  const u = new SpeechSynthesisUtterance(clean)
  u.lang = 'en-US'; u.rate = rate
  window.speechSynthesis?.speak(u)
}

// ═══════════════════════════════════════════════════════════════
// CLAUDE API
// ═══════════════════════════════════════════════════════════════
async function callClaude(apiKey, messages, system = '') {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system, messages })
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error?.message ?? 'API error')
  return d.content?.[0]?.text ?? ''
}

// ═══════════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════════
const SEED_S = [
  { id:'s1', mode:'simple', context:'Production Status', hint:'Daily standup — reporting line output',
    template:'The {line} is running at {capacity}% capacity today.',
    subs:[['SMD line','packaging line','assembly line','coating line'],['85','90','72','100','65']],
    reps:0,ease:2.5,interval:1,dueDate:0,lastSeen:0 },
  { id:'s2', mode:'simple', context:'Gross Margin', hint:'Presenting Q results to management',
    template:'Our gross margin {changed} by {amount}% due to {reason}.',
    subs:[['declined','improved','remained stable'],['2.3','1.5','4.1','0.8'],['higher silver paste cost','product mix shift','volume scale-up','ASP pressure','inventory write-down']],
    reps:0,ease:2.5,interval:1,dueDate:0,lastSeen:0 },
  { id:'s3', mode:'simple', context:'Yield Report', hint:'Presenting process quality results',
    template:'We achieved a {yield}% yield rate on the {product} line this {period}.',
    subs:[['98.2','96.5','99.1','94.3'],['0603','beads','CLH','inductor'],['week','month','quarter']],
    reps:0,ease:2.5,interval:1,dueDate:0,lastSeen:0 },
  { id:'s4', mode:'simple', context:'Quality Issue', hint:'Reporting a defect finding in QC meeting',
    template:'We found {count} defective units in the {batch}, with a defect rate of {rate}%.',
    subs:[['3','12','47','156'],['latest shipment','incoming lot','Q2 batch','sampling group'],['0.3','1.2','2.8','0.05']],
    reps:0,ease:2.5,interval:1,dueDate:0,lastSeen:0 },
  { id:'s5', mode:'hard', context:'Customer Call', hint:'Negotiating delivery schedule',
    template:'A: When can we expect the delivery?\nB: We can {deliver} the order by {date}.\nA: Can you {guarantee} that schedule?\nB: Let me {check} with our {team} and confirm by EOD.',
    subs:[['deliver','ship','dispatch','complete'],['end of this week','next Monday','the 25th','Friday'],['confirm','guarantee','commit to','ensure'],['check','verify','confirm','follow up'],['production team','plant manager','logistics team','scheduling team']],
    reps:0,ease:2.5,interval:1,dueDate:0,lastSeen:0 },
  { id:'s6', mode:'hard', context:'RCA Meeting', hint:'Root cause analysis discussion',
    template:'A: What caused the margin drop?\nB: The primary driver was {cause}.\nA: When did this start?\nB: We first {noticed} the issue in {period}.\nA: What\'s the {action}?\nB: We\'re {measure} to address it.',
    subs:[['higher raw material cost','unfavorable product mix','ASP erosion','volume underabsorption'],['noticed','identified','detected','flagged'],['early March','Q1','last month','Week 10'],['corrective action','mitigation plan','recovery roadmap'],['renegotiating supplier contracts','optimizing product mix','raising ASP','reducing fixed cost allocation']],
    reps:0,ease:2.5,interval:1,dueDate:0,lastSeen:0 },
]

const SEED_V = [
  { id:'v1', word:'yield', ipa_us:'/jiːld/', def:'Production output as % of total input', ex:'The SMD line yield improved to 98.5% after process tuning.', reps:0,ease:2.5,interval:1,dueDate:0,lastSeen:0 },
  { id:'v2', word:'gross margin', ipa_us:'/ɡroʊs ˈmɑːrdʒɪn/', def:'(Revenue − COGS) ÷ Revenue × 100%', ex:'A 2% decline in gross margin triggered a root cause analysis.', reps:0,ease:2.5,interval:1,dueDate:0,lastSeen:0 },
  { id:'v3', word:'capacity utilization', ipa_us:'/kəˈpæsɪti ˌjuːtɪlaɪˈzeɪʃn/', def:'Actual output ÷ maximum possible output', ex:'Capacity utilization rose to 94% during peak season.', reps:0,ease:2.5,interval:1,dueDate:0,lastSeen:0 },
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
        <div style={{ fontFamily:DISP, fontSize:12, color:T.amber, letterSpacing:'0.14em', lineHeight:1 }}>FSI COMMAND</div>
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
  { id:'practice', label:'Practice', svg: <svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M10 3L3 10h3v7h8v-7h3L10 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M8 14v-3h4v3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> },
  { id:'vocab',    label:'Vocab',    svg: <svg width="19" height="19" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M7 7h6M7 10.5h6M7 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { id:'email',    label:'AI',       svg: <svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M10 3a7 7 0 100 14A7 7 0 0010 3z" stroke="currentColor" strokeWidth="1.5"/><path d="M7 10h6M10 7v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { id:'achieve',  label:'Goals',    svg: <svg width="19" height="19" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 3V1.5M10 18.5V17M3 10H1.5M18.5 10H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { id:'settings', label:'Setup',    svg: <svg width="19" height="19" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.34 4.34l1.41 1.41M14.25 14.25l1.41 1.41M15.66 4.34l-1.41 1.41M5.75 14.25l-1.41 1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
]
function BottomNav({ tab, setTab }) {
  return (
    <nav style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:480, background:T.surf, borderTop:`1px solid ${T.bdr}`, display:'flex', paddingBottom:'env(safe-area-inset-bottom,0px)', zIndex:20 }}>
      {NAV.map(n => {
        const on = tab === n.id
        return (
          <div key={n.id} onClick={() => setTab(n.id)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, cursor:'pointer', padding:'9px 0 7px', color: on ? T.amber : '#8a95a0', transition:'color 0.14s' }}>
            {n.svg}
            <span style={{ fontFamily:MONO, fontSize:8.5, letterSpacing:'0.08em', fontWeight: on ? 600 : 400 }}>{n.label.toUpperCase()}</span>
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
      <span style={{ fontFamily:MONO, fontSize:9, color, letterSpacing:'0.12em' }}>{children}</span>
      <div style={{ flex:1, height:1, background:T.bdr }}/>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// PRACTICE TAB
// ═══════════════════════════════════════════════════════════════
function PracticeTab({ sentences, vocab, stats, settings, updateSentences, updateStats, awardBadge }) {
  const [mode, setMode] = useState('simple')
  const [idx, setIdx] = useState(0)
  const [sels, setSels] = useState({})
  const [revealed, setRevealed] = useState(false)
  const [toast, setToast] = useState('')

  const queue = useMemo(() => {
    const filtered = (sentences ?? []).filter(s => mode === 'simple' ? s.mode === 'simple' : true)
    return srsSort(filtered)
  }, [sentences, mode])

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
  const allFilled = Object.keys(sels).length >= totalBlanks

  function buildFilled() {
    return tplParts.map(p => p.t === 'txt' ? p.text : (sels[p.bi] ?? `[${p.label}]`)).join('')
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 1800) }

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
    setIdx(i => i + 1); setSels({}); setRevealed(false)
    showToast(q === 5 ? '✓ Easy +5 XP' : q === 3 ? '◎ Hard +3 XP' : '↺ Again +1 XP')
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
      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:70, left:'50%', transform:'translateX(-50%)', background:T.surf2, border:`1px solid ${T.bdr2}`, borderRadius:20, padding:'8px 18px', fontFamily:MONO, fontSize:11, color:T.amber, zIndex:50, whiteSpace:'nowrap', animation:'fadeUp 0.2s ease' }}>{toast}</div>
      )}

      {/* Mode toggle */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div style={{ display:'flex', background:T.surf2, borderRadius:9, padding:3, gap:2, flex:1 }}>
          <ModeBtn id="simple" label="SIMPLE"/>
          <ModeBtn id="hard" label="HARD MODE"/>
        </div>
        <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, whiteSpace:'nowrap' }}>
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
          <SectionLabel color={T.amber}>{card.context.toUpperCase()}</SectionLabel>

          {/* Drill card */}
          <div style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:14, padding:20, position:'relative' }}>
            {card.hint && (
              <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:13, color:T.txt2, marginBottom:14, lineHeight:1.6, paddingBottom:14, borderBottom:`1px solid ${T.bdr}` }}>
                "{card.hint}"
              </div>
            )}
            {/* Template with blanks */}
            <div style={{ fontFamily:MONO, fontSize:13.5, lineHeight:2.1, color:T.txt, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
              {tplParts.map((p, i) => {
                if (p.t === 'txt') return <span key={i}>{p.text}</span>
                const sel = sels[p.bi]
                return (
                  <span key={i} style={{ display:'inline-block', minWidth:70, borderBottom:`2px solid ${sel ? T.amber : T.bdr2}`, color: sel ? T.amber : T.txt3, padding:'0 5px', transition:'all 0.15s', fontWeight: sel ? 500 : 300 }}>
                    {sel || '___'}
                  </span>
                )
              })}
            </div>
            {/* TTS */}
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:10 }}>
              <div onClick={() => speak(buildFilled())} title="Listen" style={{ cursor:'pointer', color:T.txt3, padding:5, borderRadius:6, transition:'color 0.14s' }}
                onMouseOver={e=>e.currentTarget.style.color=T.amber} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M10.5 5a3 3 0 010 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M12 2.5a6 6 0 010 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </div>
            </div>
          </div>

          {/* Substitution chips */}
          {!revealed && (card.subs ?? []).map((group, gi) => (
            <div key={gi}>
              <div style={{ fontFamily:MONO, fontSize:8.5, color:'#9aa5b0', letterSpacing:'0.1em', marginBottom:6 }}>SLOT {gi + 1}</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {group.map((opt, oi) => (
                  <div key={oi} className={`chip${sels[gi] === opt ? ' sel' : ''}`}
                    onClick={() => setSels(prev => prev[gi] === opt ? (({ [gi]:_, ...rest }) => rest)(prev) : { ...prev, [gi]: opt })}>
                    {opt}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Action */}
          {!revealed ? (
            <button className="btn" onClick={handleReveal} disabled={!allFilled}
              style={{ background: allFilled ? T.amber : T.bdr, color: allFilled ? T.bg : T.txt3, width:'100%', marginBottom:4, fontSize:11, letterSpacing:'0.1em' }}>
              ▶&nbsp;&nbsp;SPEAK &amp; REVEAL
            </button>
          ) : (
            <div style={{ display:'flex', gap:8, marginBottom:4 }}>
              {[{l:'Again',q:0,c:T.red},{l:'Hard',q:3,c:T.blue},{l:'Easy',q:5,c:T.grn}].map(({ l, q, c }) => (
                <button key={l} className="btn" onClick={() => handleRate(q)}
                  style={{ flex:1, background:`${c}18`, border:`1px solid ${c}55`, color:c }}>
                  {l}
                </button>
              ))}
            </div>
          )}
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
  const [adding, setAdding] = useState(false)
  const [newWord, setNewWord] = useState('')
  const [loading, setLoading] = useState(false)
  const [flipIdx, setFlipIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [fillAns, setFillAns] = useState('')
  const [fillRes, setFillRes] = useState(null)

  const sorted = useMemo(() => srsSort(vocab ?? []), [vocab])
  const cur = sorted.length > 0 ? sorted[flipIdx % sorted.length] : null

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
    setLoading(true)
    const extra = await lookupIPA(newWord)
    const entry = { id:`v${Date.now()}`, word:newWord.trim(), ipa_us:extra.ipa_us||`/${newWord}/`, def:extra.def||'', ex:extra.ex||'', reps:0,ease:2.5,interval:1,dueDate:0,lastSeen:0 }
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

  return (
    <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:14 }} className="fadeUp">
      <div style={{ display:'flex', background:T.surf2, borderRadius:9, padding:3, gap:2 }}>
        <SubBtn id="list" lbl="LIST"/><SubBtn id="flash" lbl="FLASHCARD"/><SubBtn id="fill" lbl="FILL-IN"/>
      </div>

      {sub === 'list' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
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
          {(vocab??[]).length === 0 && <div style={{ textAlign:'center', color:T.txt3, fontFamily:SERIF, fontSize:13, padding:'24px 0' }}>No words yet. Add some!</div>}
          {(vocab??[]).map(w => (
            <div key={w.id} style={{ background:T.surf, border:`1px solid ${T.bdr}`, borderRadius:11, padding:15 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:w.def ? 6 : 0 }}>
                <div>
                  <span style={{ fontFamily:MONO, fontSize:15, color:T.amber, fontWeight:500 }}>{w.word}</span>
                  {w.ipa_us && <span style={{ fontFamily:MONO, fontSize:10, color:'#9aa5b0', marginLeft:10 }}>{w.ipa_us}</span>}
                </div>
                <div onClick={()=>speak(w.word)} style={{ cursor:'pointer', color:T.txt3, padding:5, transition:'color 0.14s' }}
                  onMouseOver={e=>e.currentTarget.style.color=T.amber} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M10.5 5a3 3 0 010 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
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
              <div onClick={() => setFlipped(f=>!f)} style={{ background:T.surf, border:`1px solid ${flipped ? T.amber+'70' : T.bdr}`, borderRadius:16, padding:'36px 24px', minHeight:190, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, transition:'border-color 0.25s', animation: flipped ? 'glow 1.5s ease' : 'none' }}>
                {!flipped ? (
                  <>
                    <div style={{ fontFamily:DISP, fontSize:26, color:T.amber, textAlign:'center' }}>{cur.word}</div>
                    {cur.ipa_us && <div style={{ fontFamily:MONO, fontSize:11, color:'#9aa5b0' }}>{cur.ipa_us}</div>}
                    <div style={{ fontFamily:MONO, fontSize:9, color:'#9aa5b0', marginTop:8, letterSpacing:'0.1em' }}>TAP TO REVEAL</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily:MONO, fontSize:11, color:T.amber, marginBottom:4 }}>{cur.word}</div>
                    <div style={{ fontFamily:SERIF, fontSize:15, color:T.txt, textAlign:'center', lineHeight:1.65 }}>{cur.def}</div>
                    {cur.ex && <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:13, color:T.txt2, textAlign:'center', lineHeight:1.5 }}>"{cur.ex}"</div>}
                    <div onClick={e=>{e.stopPropagation();speak(cur.word)}} style={{ cursor:'pointer', color:T.txt3, marginTop:8, padding:4 }}
                      onMouseOver={e=>e.currentTarget.style.color=T.amber} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
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
                <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, letterSpacing:'0.1em', marginBottom:10 }}>FILL IN THE BLANK</div>
                <div style={{ fontFamily:SERIF, fontSize:14, color:T.txt, lineHeight:1.75, marginBottom:14 }}>
                  {cur.ex
                    ? cur.ex.replace(new RegExp(`\\b${cur.word.replace(/\s/g,'\\s')}\\b`, 'gi'), '＿＿＿＿＿')
                    : cur.def.replace(new RegExp(`\\b${cur.word.split(' ')[0]}\\w*\\b`, 'gi'), '＿＿＿＿＿')
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
function EmailTab({ settings, updateSentences, updateVocab, updateStats, awardBadge }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const [addedS, setAddedS] = useState([])
  const [addedV, setAddedV] = useState([])

  async function analyze() {
    if (!settings?.apiKey) { setErr('Please add your Anthropic API key in Settings first.'); return }
    if (!text.trim()) { setErr('Please paste some text to analyze.'); return }
    setBusy(true); setErr(''); setRes(null)
    try {
      const system = `You are an FSI English teaching assistant for a Taiwanese electronics manufacturing professional (SMD/inductor division, financial analysis role).
Analyze the text and extract:
- 3-5 FSI substitution drill sentences using manufacturing/business vocabulary
- 3-5 vocabulary words worth learning

Return ONLY valid JSON (no markdown), format:
{"sentences":[{"template":"...with {blank} for substitution","context":"Short context name","hint":"When you'd say this","subs":[["opt1","opt2","opt3"]]}],"vocab":[{"word":"word","def":"concise definition","ex":"example sentence from the text or invented"}]}`
      const raw = await callClaude(settings.apiKey, [{ role:'user', content: text }], system)
      const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim())
      setRes(parsed)
      awardBadge('email_done')
      updateStats(s => ({ ...s, xp: (s.xp??0) + 15 }))
    } catch(e) {
      setErr(e.message?.includes('API') ? e.message : 'Analysis failed. Please check your API key and try again.')
    } finally { setBusy(false) }
  }

  function addSentence(s) {
    const id = `ai_${Date.now()}`
    updateSentences(prev => [...(prev??[]), { id, mode:'simple', context:s.context||'AI', hint:s.hint||'', template:s.template, subs:s.subs||[], reps:0,ease:2.5,interval:1,dueDate:0,lastSeen:0 }])
    setAddedS(a => [...a, s.template])
    updateStats(st => ({ ...st, xp: (st.xp??0) + 5 }))
  }

  function addVocab(v) {
    const id = `av_${Date.now()}`
    updateVocab(prev => [...(prev??[]), { id, word:v.word, ipa_us:'', def:v.def, ex:v.ex, reps:0,ease:2.5,interval:1,dueDate:0,lastSeen:0 }])
    setAddedV(a => [...a, v.word])
    updateStats(st => ({ ...st, xp: (st.xp??0) + 3 }))
  }

  return (
    <div style={{ padding:'16px 16px 0', display:'flex', flexDirection:'column', gap:14 }} className="fadeUp">
      <div style={{ fontFamily:MONO, fontSize:9, color:T.txt3, letterSpacing:'0.1em' }}>PASTE EMAIL OR BUSINESS TEXT</div>
      <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Paste an email, meeting notes, or any business English text here…" style={{ minHeight:130, lineHeight:1.6 }}/>
      {err && (
        <div style={{ background:T.redD, border:`1px solid ${T.red}50`, borderRadius:8, padding:11, fontFamily:MONO, fontSize:11, color:T.red, lineHeight:1.5 }}>{err}</div>
      )}
      <button className="btn" onClick={analyze} disabled={busy || !text.trim()} style={{ background: busy ? T.bdr : T.amber, color: busy ? T.txt2 : T.bg, width:'100%', letterSpacing:'0.08em' }}>
        {busy
          ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}><span style={{ display:'inline-block', width:10, height:10, border:'2px solid transparent', borderTopColor:T.txt2, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/> ANALYZING…</span>
          : '⚡ AI ANALYSIS'
        }
      </button>

      {res && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }} className="fadeUp">
          {(res.sentences ?? []).length > 0 && (
            <>
              <SectionLabel color={T.amber}>FSI DRILL SENTENCES</SectionLabel>
              {res.sentences.map((s, i) => {
                const done = addedS.includes(s.template)
                return (
                  <div key={i} style={{ background:T.surf, border:`1px solid ${done ? T.grn+'50' : T.bdr}`, borderRadius:11, padding:15, transition:'border-color 0.3s' }}>
                    <div style={{ fontFamily:MONO, fontSize:11.5, color:T.txt, marginBottom:4, lineHeight:1.6 }}>{s.template}</div>
                    <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:12, color:T.txt3, marginBottom:12 }}>{s.context} — {s.hint}</div>
                    <button className="btn" onClick={() => addSentence(s)} disabled={done}
                      style={{ background: done ? T.grnD : T.amberD, border:`1px solid ${done ? T.grn+'50' : T.amber+'50'}`, color: done ? T.grn : T.amber, fontSize:11 }}>
                      {done ? '✓ Added to Practice' : '+ Add to Practice'}
                    </button>
                  </div>
                )
              })}
            </>
          )}
          {(res.vocab ?? []).length > 0 && (
            <>
              <SectionLabel color={T.blue}>VOCABULARY SUGGESTIONS</SectionLabel>
              {res.vocab.map((v, i) => {
                const done = addedV.includes(v.word)
                return (
                  <div key={i} style={{ background:T.surf, border:`1px solid ${done ? T.grn+'50' : T.bdr}`, borderRadius:11, padding:15, transition:'border-color 0.3s' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                      <span style={{ fontFamily:MONO, fontSize:14, color:T.blue, fontWeight:500 }}>{v.word}</span>
                      <div onClick={()=>speak(v.word)} style={{ cursor:'pointer', color:T.txt3, padding:4 }}
                        onMouseOver={e=>e.currentTarget.style.color=T.blue} onMouseOut={e=>e.currentTarget.style.color=T.txt3}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h3l4-3v11l-4-3H2z" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M10.5 5a3 3 0 010 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      </div>
                    </div>
                    <div style={{ fontFamily:SERIF, fontSize:13, color:T.txt2, marginBottom:v.ex?5:12, lineHeight:1.5 }}>{v.def}</div>
                    {v.ex && <div style={{ fontFamily:SERIF, fontStyle:'italic', fontSize:12, color:T.txt3, marginBottom:12, lineHeight:1.45 }}>"{v.ex}"</div>}
                    <button className="btn" onClick={() => addVocab(v)} disabled={done}
                      style={{ background: done ? T.grnD : T.blueD, border:`1px solid ${done ? T.grn+'50' : T.blue+'50'}`, color: done ? T.grn : T.blue, fontSize:11 }}>
                      {done ? '✓ Added to Vocab' : '+ Add to Vocab'}
                    </button>
                  </div>
                )
              })}
            </>
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
function SettingsTab({ sentences, updateSentences, settings, updateSettings }) {
  const [key, setKey] = useState(settings?.apiKey ?? '')
  const [url, setUrl] = useState(settings?.sheetUrl ?? '')
  const [showKey, setShowKey] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  function save() {
    updateSettings(() => ({ apiKey: key.trim(), sheetUrl: url.trim() }))
    flash('✓ Settings saved.')
  }

  async function syncSheets() {
    if (!url.trim()) { flash('✗ Please enter a Sheets URL.'); return }
    setSyncing(true); flash('')
    try {
      let csvUrl = url.trim()
      // Convert edit URL to CSV export URL
      const match = csvUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)
      if (match) csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`
      
      const r = await fetch(csvUrl)
      if (!r.ok) throw new Error('Cannot fetch. Make sure the sheet is set to Anyone → Viewer.')
      const csv = await r.text()
      const rows = csv.trim().split('\n').filter((l,i) => i > 0 && l.trim())
      const cards = rows.map((row, i) => {
        // Support both comma (CSV) and ｜ delimited
        const sep = row.includes('｜') ? '｜' : ','
        const cols = row.split(sep).map(c => c.trim().replace(/^"|"$/g,''))
        const [mode, context, hint, template, ...rest] = cols
        const subs = rest.filter(s => s).map(s => s.split('|').filter(Boolean))
        return { id:`sh${i}_${Date.now()}`, mode:(mode||'simple').toLowerCase().trim(), context:context||'General', hint:hint||'', template:template||'', subs, reps:0,ease:2.5,interval:1,dueDate:0,lastSeen:0 }
      }).filter(c => c.template)
      if (!cards.length) throw new Error('No valid sentences found. Check the sheet format.')
      updateSentences(prev => [...(prev??[]).filter(s=>!s.id.startsWith('sh')), ...cards])
      flash(`✓ Synced ${cards.length} sentences from Sheets.`)
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

      {/* Sheet URL */}
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        <label style={{ fontFamily:MONO, fontSize:9, color:T.txt2, letterSpacing:'0.1em' }}>GOOGLE SHEETS URL</label>
        <input type="text" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…"/>
        <div style={{ background:T.surf2, borderRadius:9, padding:13, display:'flex', flexDirection:'column', gap:5 }}>
          <div style={{ fontFamily:MONO, fontSize:9, color:T.amber, letterSpacing:'0.08em' }}>COLUMN FORMAT  (use ｜ separator)</div>
          <div style={{ fontFamily:MONO, fontSize:9.5, color:T.txt3, lineHeight:1.7 }}>
            模式 ｜ 情境名稱 ｜ 情境提示 ｜ 句子模板 ｜ 選項欄1 ｜ 選項欄2 …
          </div>
          <div style={{ fontFamily:MONO, fontSize:9, color:T.txt2, lineHeight:1.7 }}>
            ▸ 模式: simple 或 hard<br/>
            ▸ 選項欄: 用 | 分隔同欄選項<br/>
            ▸ e.g. SMD line|packaging line|assembly line
          </div>
        </div>
        <button className="btn" onClick={syncSheets} disabled={syncing} style={{ background: syncing ? T.bdr : T.blueD, border:`1px solid ${T.blue}50`, color:T.blue }}>
          {syncing
            ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}><span style={{ display:'inline-block', width:9, height:9, border:'2px solid transparent', borderTopColor:T.blue, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/> SYNCING…</span>
            : '⟳ SYNC FROM SHEETS'
          }
        </button>
      </div>

      <button className="btn" onClick={save} style={{ background:T.amber, color:T.bg, width:'100%', letterSpacing:'0.08em' }}>
        SAVE SETTINGS
      </button>

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
      setSentences(s ?? SEED_S)
      setVocab(v ?? SEED_V)
      setStats(st ?? { xp:0, streak:0, lastDate:'', totalDrills:0, correct:0, perfectStreak:0 })
      setSettings(se ?? { apiKey:'', sheetUrl:'' })
      setEarned(ea ?? [])
      setReady(true)
    })
  }, [])

  const updateSentences = useCallback((fn) => setSentences(prev => { const n=fn(prev); stor.set('fsi:s',n); return n }), [])
  const updateVocab     = useCallback((fn) => setVocab(prev     => { const n=fn(prev); stor.set('fsi:v',n); return n }), [])
  const updateStats     = useCallback((fn) => setStats(prev     => { const n=fn(prev); stor.set('fsi:st',n); return n }), [])
  const updateSettings  = useCallback((fn) => setSettings(prev  => { const n=fn(prev); stor.set('fsi:se',n); return n }), [])

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
      <div style={{ fontFamily:DISP, fontSize:15, color:'#f5a623', letterSpacing:'0.14em' }}>FSI COMMAND</div>
      <div style={{ fontFamily:MONO, fontSize:10, color:'#484f58', letterSpacing:'0.1em', animation:'pulse 1.5s infinite' }}>INITIALIZING…</div>
    </div>
  )

  const P = { sentences, vocab, stats, settings, earned, updateSentences, updateVocab, updateStats, updateSettings, awardBadge }

  return (
    <div style={{ background:T.bg, minHeight:'100vh', maxWidth:480, margin:'0 auto', display:'flex', flexDirection:'column', position:'relative' }}>
      <style>{G}</style>
      <Header stats={stats}/>
      <div style={{ flex:1, overflowY:'auto', paddingBottom:80 }}>
        {tab==='practice' && <PracticeTab {...P}/>}
        {tab==='vocab'    && <VocabTab    {...P}/>}
        {tab==='email'    && <EmailTab    {...P}/>}
        {tab==='achieve'  && <AchieveTab  {...P}/>}
        {tab==='settings' && <SettingsTab {...P}/>}
      </div>
      <BottomNav tab={tab} setTab={setTab}/>
    </div>
  )
}
