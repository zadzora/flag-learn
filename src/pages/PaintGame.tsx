import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Lightbulb, RefreshCw, Flag, Check, X, ChevronRight } from 'lucide-react'
import flagsData from '../../data/flags.json'
import {
  PAINTABLE_CODES, applyStroke, isLightColor, loadPaintableFlag, refineInjectedRegions,
  type Region,
} from '../utils/flagPaint'

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'flags-paint-v1'
const HINTS_STORAGE_KEY = 'flags-paint-hints-v1'
const MAX_HINTS = 3
const HINT_REGEN_MS = 10 * 60 * 1000
const MARKER_OFFSET_Y = 22

// ─── Hints store ──────────────────────────────────────────────────────────────

interface HintsPersisted { hints: number; regenEpochs: number[] }

function defaultHints(): HintsPersisted { return { hints: MAX_HINTS, regenEpochs: [] } }

function readHintsPersisted(): HintsPersisted {
  try {
    const raw = localStorage.getItem(HINTS_STORAGE_KEY)
    if (!raw) return defaultHints()
    const o = JSON.parse(raw) as Partial<HintsPersisted>
    const hints = typeof o.hints === 'number' ? Math.min(MAX_HINTS, Math.max(0, o.hints)) : MAX_HINTS
    const regenEpochs = Array.isArray(o.regenEpochs)
      ? o.regenEpochs.filter((n): n is number => typeof n === 'number').sort((a, b) => a - b)
      : []
    return { hints, regenEpochs }
  } catch { return defaultHints() }
}

function writeHints(state: HintsPersisted): void {
  localStorage.setItem(HINTS_STORAGE_KEY, JSON.stringify(state))
}

function applyHintRegens(state: HintsPersisted, now = Date.now()): HintsPersisted {
  let { hints, regenEpochs } = state
  while (hints < MAX_HINTS && regenEpochs.length > 0 && regenEpochs[0] <= now) {
    hints++
    regenEpochs = regenEpochs.slice(1)
  }
  return { hints, regenEpochs }
}

function getHintsSnapshot(now = Date.now()): HintsPersisted {
  return applyHintRegens(readHintsPersisted(), now)
}

function consumeHint(): HintsPersisted {
  const state = getHintsSnapshot()
  if (state.hints <= 0) return state
  const lost = { hints: state.hints - 1, regenEpochs: state.regenEpochs }
  const last = lost.regenEpochs[lost.regenEpochs.length - 1] ?? Date.now()
  const next = Math.max(last, Date.now()) + HINT_REGEN_MS
  const newState = { hints: lost.hints, regenEpochs: [...lost.regenEpochs, next].sort((a, b) => a - b) }
  writeHints(newState)
  return newState
}

function secondsUntilNextHint(state: HintsPersisted, now = Date.now()): number | null {
  const s = applyHintRegens(state, now)
  if (s.hints >= MAX_HINTS || s.regenEpochs.length === 0) return null
  return Math.max(0, Math.ceil((s.regenEpochs[0] - now) / 1000))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getFlagName(code: string): string {
  const entry = (flagsData as { code: string; name: string | string[] }[]).find(f => f.code === code)
  if (!entry) return code.toUpperCase()
  return Array.isArray(entry.name) ? entry.name[0] : entry.name
}

interface SaveData { queue: string[]; completed: number; total: number; incorrectCount: number; streak?: number }
function loadSave(): SaveData | null {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
}
function writeSave(d: SaveData) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) }

// ─── Component ────────────────────────────────────────────────────────────────

type GameStatus = 'loading' | 'painting' | 'complete' | 'given-up' | 'unsupported'

export default function PaintGame() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const debugCode = searchParams.get('code')


  const [queue, setQueue] = useState<string[]>([])
  const [completed, setCompleted] = useState(0)
  const [incorrectCount, setIncorrectCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [cycleComplete, setCycleComplete] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [streak, setStreak] = useState(0)

  const [svgString, setSvgString] = useState('')
  const [regions, setRegions] = useState<Region[]>([])
  const [palette, setPalette] = useState<string[]>([])
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [paintedColors, setPaintedColors] = useState<Record<string, string>>({})
  const [hintsState, setHintsState] = useState<HintsPersisted>(() => getHintsSnapshot())
  const [gameStatus, setGameStatus] = useState<GameStatus>('loading')
  const [currentCode, setCurrentCode] = useState('')
  const [debugInput, setDebugInput] = useState(debugCode ?? '')
  const [wrongFeedback, setWrongFeedback] = useState(false)
  const [longPressMarker, setLongPressMarker] = useState<{ x: number; y: number } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialRidRef = useRef<string | null>(null)
  const currentRidRef = useRef<string | null>(null)
  const longPressActiveRef = useRef(false)

  const svgRef = useRef<HTMLDivElement>(null)
  const regionsRef = useRef<Region[]>([])
  const loadingCodeRef = useRef<string>('')
  useEffect(() => { regionsRef.current = regions }, [regions])

  // Poll hint regeneration every 1 s
  useEffect(() => {
    const id = setInterval(() => setHintsState(getHintsSnapshot()), 1_000)
    return () => clearInterval(id)
  }, [])

  function startNewCycle(codes = PAINTABLE_CODES) {
    const q = shuffle(codes)
    setQueue(q); setCompleted(0); setIncorrectCount(0); setTotal(q.length); setCycleComplete(false); setStreak(0)
    writeSave({ queue: q, completed: 0, total: q.length, incorrectCount: 0, streak: 0 })
  }

  async function loadFlag(code: string, fromQueue = false) {
    loadingCodeRef.current = code
    setGameStatus('loading')
    setSvgString(''); setRegions([]); setPalette([]); setPaintedColors({})
    setSelectedColor(null); setWrongFeedback(false); setAttempts(0)
    const result = await loadPaintableFlag(code)
    if (loadingCodeRef.current !== code) return
    if (!result) {
      if (fromQueue) setQueue(q => q.slice(1))
      else setGameStatus('unsupported')
      return
    }
    setSvgString(result.svgString); setRegions(result.regions); setPalette(result.palette)
    setGameStatus('painting')
  }

  // Mount-time hydration from localStorage. The setState calls below are the
  // pre-existing shape of this screen's boot sequence, not new behaviour - the
  // rule only started reaching them once the SVG engine moved to utils/flagPaint.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (debugCode) {
      setCurrentCode(debugCode)
      loadFlag(debugCode)
      return
    }
    const saved = loadSave()
    if (saved && saved.queue.length === 0 && (saved.total ?? 0) > 0) {
      setCompleted(saved.completed ?? 0); setTotal(saved.total); setIncorrectCount(saved.incorrectCount ?? 0)
      setStreak(saved.streak ?? 0); setCycleComplete(true)
    } else if (saved?.queue?.length) {
      setQueue(saved.queue); setCompleted(saved.completed ?? 0); setTotal(saved.total ?? saved.queue.length)
      setIncorrectCount(saved.incorrectCount ?? 0); setStreak(saved.streak ?? 0)
    } else { startNewCycle() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (queue.length === 0 && total > 0) { setCycleComplete(true); return }
    if (!queue.length) return
    const code = queue[0]
    setCurrentCode(code)
    loadFlag(code, true)
  }, [queue]) // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  // Inject SVG imperatively then split background regions with multiple visible strips
  useEffect(() => {
    if (!svgRef.current) return
    svgRef.current.innerHTML = svgString || ''
    if (!svgString) return
    const svgEl = svgRef.current.querySelector('svg') as SVGSVGElement | null
    if (!svgEl) return
    const current = regionsRef.current
    if (!current.length) return
    const updated = refineInjectedRegions(svgEl, current)
    if (updated.length !== current.length) {
      regionsRef.current = updated
      setRegions(updated)
    }
  }, [svgString])

  function applyPaint(rid: string) {
    if (gameStatus !== 'painting' || !selectedColor) return
    const region = regionsRef.current.find(r => r.id === rid)
    if (!region) return
    const rEl = svgRef.current?.querySelector(`[data-rid="${rid}"]`)
    if (rEl) rEl.setAttribute(region.colorAttr, selectedColor)
    setPaintedColors(prev => ({ ...prev, [rid]: selectedColor }))
  }

  function handleSvgPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (gameStatus !== 'painting' || !selectedColor) return
    const el = (e.target as Element).closest('[data-rid]')
    if (!el) return
    const rid = el.getAttribute('data-rid')!
    if (!regionsRef.current.find(r => r.id === rid)) return
    initialRidRef.current = rid
    currentRidRef.current = rid
    longPressActiveRef.current = false
    longPressTimerRef.current = setTimeout(() => {
      longPressActiveRef.current = true
      const hit = document.elementFromPoint(e.clientX, e.clientY - MARKER_OFFSET_Y)
      currentRidRef.current = hit?.closest('[data-rid]')?.getAttribute('data-rid') ?? null
      setLongPressMarker({ x: e.clientX, y: e.clientY })
    }, 1000)
  }

  function handleSvgPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!longPressActiveRef.current) return
    const hit = document.elementFromPoint(e.clientX, e.clientY - MARKER_OFFSET_Y)
    currentRidRef.current = hit?.closest('[data-rid]')?.getAttribute('data-rid') ?? null
    setLongPressMarker({ x: e.clientX, y: e.clientY })
  }

  function handleSvgPointerUp() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    const wasLongPress = longPressActiveRef.current
    const rid = wasLongPress ? currentRidRef.current : initialRidRef.current
    initialRidRef.current = null
    currentRidRef.current = null
    longPressActiveRef.current = false
    setLongPressMarker(null)
    if (rid) applyPaint(rid)
  }

  function handleSvgPointerCancel() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    initialRidRef.current = null
    currentRidRef.current = null
    longPressActiveRef.current = false
    setLongPressMarker(null)
  }

  function handleConfirm() {
    const regs = regionsRef.current
    if (!regs.length || !regs.every(r => r.id in paintedColors)) return
    if (regs.every(r => paintedColors[r.id] === r.primaryColor)) {
      setGameStatus('complete')
    } else {
      regs.forEach(r => {
        if (paintedColors[r.id] !== r.primaryColor) {
          const el = svgRef.current?.querySelector(`[data-rid="${r.id}"]`)
          if (!el) return
          const prev = paintedColors[r.id]
          el.setAttribute(r.colorAttr, '#f87171')
          setTimeout(() => el.setAttribute(r.colorAttr, prev), 700)
        }
      })
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      if (newAttempts >= 2) {
        setTimeout(() => {
          regionsRef.current.forEach(r => {
            const el = svgRef.current?.querySelector(`[data-rid="${r.id}"]`)
            if (el) el.setAttribute(r.colorAttr, r.primaryColor)
          })
          setGameStatus('given-up')
        }, 800)
      } else {
        setWrongFeedback(true)
        setTimeout(() => setWrongFeedback(false), 2200)
      }
    }
  }

  function advance(didComplete: boolean) {
    const newQ = queue.slice(1)
    const newDone = didComplete ? completed + 1 : completed
    const newIncorrect = didComplete ? incorrectCount : incorrectCount + 1
    setCompleted(newDone); setIncorrectCount(newIncorrect)
    const newStreak = didComplete ? streak + 1 : 0
    setStreak(newStreak)
    writeSave({ queue: newQ, completed: newDone, total, incorrectCount: newIncorrect, streak: newStreak })
    setQueue(newQ)
  }

  function handleGiveUp() {
    setGameStatus('given-up')
    regionsRef.current.forEach(r => {
      const el = svgRef.current?.querySelector(`[data-rid="${r.id}"]`)
      if (!el) return
      el.setAttribute(r.colorAttr, r.primaryColor)
    })
  }

  function handleRestart() {
    regionsRef.current.forEach(r => {
      const el = svgRef.current?.querySelector(`[data-rid="${r.id}"]`)
      if (!el) return
      el.setAttribute(r.colorAttr, r.grayColor)
      if (r.colorAttr === 'fill') applyStroke(el)
    })
    setPaintedColors({}); setGameStatus('painting'); setWrongFeedback(false)
  }

  function handleHint() {
    if (hintsState.hints <= 0 || gameStatus !== 'painting') return
    const target = regionsRef.current.find(r => paintedColors[r.id] !== r.primaryColor)
    if (!target) return
    const rEl = svgRef.current?.querySelector(`[data-rid="${target.id}"]`)
    if (rEl) {
      rEl.setAttribute(target.colorAttr, target.primaryColor)
      rEl.setAttribute('style', 'filter:brightness(1.7)')
      setTimeout(() => rEl.removeAttribute('style'), 550)
    }
    setPaintedColors(prev => ({ ...prev, [target.id]: target.primaryColor }))
    setHintsState(consumeHint())
  }

  const progressPct = total > 0 ? (completed / total) * 100 : 0
  const paintedCount = Object.keys(paintedColors).length
  const allPainted = regions.length > 0 && paintedCount >= regions.length
  const hintsCount = hintsState.hints
  const secsUntilHint = secondsUntilNextHint(hintsState)

  // ── Cycle-complete screen ──
  if (cycleComplete) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-5 bg-[#1a2744] text-white p-8">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }} className="text-7xl">🎨</motion.div>
        <h1 className="text-3xl font-black text-center">All Done!</h1>
        <p className="text-white/60 text-center">You painted all {total} flags.</p>
        <div className="flex gap-10 mt-2">
          <div className="flex flex-col items-center gap-1">
            <span className="text-4xl font-black text-emerald-400">{completed}</span>
            <span className="text-white/55 text-sm">Correct</span>
          </div>
          <div className="w-px bg-white/10" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-4xl font-black text-red-400">{incorrectCount}</span>
            <span className="text-white/55 text-sm">Incorrect</span>
          </div>
        </div>
        <button onClick={() => startNewCycle()} className="px-8 py-4 bg-indigo-500 hover:bg-indigo-400 rounded-2xl font-bold text-lg transition-all shadow-lg">Play Again</button>
        <button onClick={() => navigate(-1)} className="text-white/40 text-sm">Back to menu</button>
      </div>
    )
  }

  // ── Main game ──
  return (
    <>
    <div className="min-h-dvh flex flex-col bg-[#1a2744] text-white select-none">

      {/* Header */}
      <div className="flex justify-center px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-3 shrink-0">
        <div className="w-full max-w-lg flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 border border-white/70 dark:border-slate-700/70 shadow-md text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
              initial={false}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
          <div className="w-10 shrink-0 flex items-center justify-center">
            <AnimatePresence>
              {streak >= 2 && (
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className="text-xs font-black text-orange-400 tabular-nums drop-shadow-[0_0_6px_rgba(251,146,60,0.7)]"
                >
                  🔥{streak}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <span className="text-xs font-bold text-white/50 shrink-0 tabular-nums">{completed}/{total}</span>

        </div>
      </div>

      {/* Centered content: name + flag + palette + feedback */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4 min-h-0">

        {/* Country name + flags left */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentCode}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col items-center gap-0.5"
          >
            <h2
              className="text-2xl font-black tracking-wide uppercase text-center"
              style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
            >
              {getFlagName(currentCode)}
            </h2>
            <span className="text-xs text-white/35 tabular-nums">
              {queue.length} flag{queue.length !== 1 ? 's' : ''} left
            </span>
          </motion.div>
        </AnimatePresence>

        {/* Flag canvas */}
        <div className={`relative w-full max-w-lg rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.55)] bg-white/5 ring-[3px] ring-black/50${!svgString ? ' min-h-[180px]' : ''}`}>
          <div
            ref={svgRef}
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerCancel={handleSvgPointerCancel}
            onContextMenu={e => e.preventDefault()}
            className="w-full"
            style={{ cursor: selectedColor && gameStatus === 'painting' ? 'crosshair' : 'default', touchAction: 'none' }}
          />

          <AnimatePresence>
            {gameStatus === 'loading' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {gameStatus === 'unsupported' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-800/80 backdrop-blur-sm">
                <span className="text-white/50 text-sm font-semibold">Flag too complex to paint</span>
                <span className="text-white/30 text-xs">Too many colors or unsupported format</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {gameStatus === 'complete' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/88 backdrop-blur-sm gap-1">
                <motion.div initial={{ scale: 0, rotate: -15 }} animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 280, delay: 0.08 }}>
                  <Check size={60} strokeWidth={2.5} />
                </motion.div>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
                  className="text-2xl font-black">Correct!</motion.p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Color palette — always occupies space to prevent layout shift */}
        <div className={`flex flex-wrap gap-3 justify-center mt-[10px] min-h-[58px] transition-opacity duration-200 ${
          gameStatus === 'painting' && palette.length > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}>
          {palette.map(color => {
            const sel = color === selectedColor
            const light = isLightColor(color)
            return (
              <motion.button key={color} onClick={() => setSelectedColor(sel ? null : color)}
                animate={{ scale: sel ? 1.22 : 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="relative focus:outline-none" style={{ touchAction: 'manipulation' }}>
                <div className="w-12 h-12 rounded-full" style={{
                  backgroundColor: color,
                  border: sel ? '3px solid #fff' : light ? '3px solid rgba(0,0,0,0.2)' : '3px solid rgba(255,255,255,0.15)',
                  boxShadow: sel ? `0 0 0 2px ${color}, 0 5px 16px ${color}99` : '0 3px 8px rgba(0,0,0,0.4)',
                }} />
                {sel && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center shadow">
                    <X size={9} className="text-white" strokeWidth={3.5} style={{ marginLeft: '0px' }} />
                  </motion.span>
                )}
              </motion.button>
            )
          })}
        </div>

        {/* Feedback / instruction line */}
        <div className="h-5 flex items-center justify-center">
          {gameStatus === 'painting' && !wrongFeedback && (
            <p className="text-white/40 text-xs text-center">
              {selectedColor ? 'Click a region to color it' : 'Select a color above'}
            </p>
          )}
          {wrongFeedback && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="text-red-400 text-xs font-bold text-center">
              {attempts >= 1 ? 'Last attempt — choose carefully!' : 'Some colors are wrong — try again!'}
            </motion.p>
          )}
          {gameStatus === 'given-up' && (
            <p className="text-amber-300/80 text-xs text-center">Correct colors revealed</p>
          )}
        </div>

        {/* Debug panel — visible only when ?code= param is present */}
        {debugCode !== null && (
          <div className="w-full max-w-lg bg-black/40 border border-white/10 rounded-xl p-3 flex flex-col gap-2 text-xs font-mono">
            <div className="flex gap-2 items-center">
              <span className="text-white/40 shrink-0">code:</span>
              <input
                value={debugInput}
                onChange={e => setDebugInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && debugInput.trim()) {
                    const c = debugInput.trim().toLowerCase()
                    setCurrentCode(c)
                    loadFlag(c)
                  }
                }}
                className="flex-1 bg-transparent border border-white/20 rounded px-2 py-1 text-white outline-none focus:border-white/50"
                placeholder="e.g. cf"
                spellCheck={false}
              />
              <button
                onClick={() => { const c = debugInput.trim().toLowerCase(); if (c) { setCurrentCode(c); loadFlag(c) } }}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white transition-colors shrink-0"
              >Go</button>
            </div>
            <div className="flex gap-3 flex-wrap">
              <span className="text-white/40">regions: <span className="text-emerald-400">{regions.length}</span></span>
              <span className="text-white/40">palette: <span className="text-emerald-400">{palette.length}</span></span>
              <span className="text-white/40">painted: <span className="text-emerald-400">{Object.keys(paintedColors).length}</span></span>
            </div>
            {palette.length > 0 && (
              <div className="flex gap-1.5 flex-wrap items-center">
                {palette.map(c => (
                  <div key={c} className="flex items-center gap-1">
                    <div className="w-3.5 h-3.5 rounded-sm border border-white/20" style={{ backgroundColor: c }} />
                    <span className="text-white/50">{c}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="w-full px-4 pb-9 shrink-0 flex flex-col items-center gap-2 min-h-[240px]">

        {/* Painting controls */}
        {gameStatus === 'painting' && (
          <div className="w-full max-w-lg flex flex-col gap-2">
            {/* Button row: Give Up / Restart / Hint (with dots above hint) */}
            <div className="flex gap-2 items-end">
              <button onClick={handleGiveUp}
                className="flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-2xl bg-white/10 hover:bg-white/15 active:scale-95 transition-all text-sm font-semibold">
                <Flag size={18} className="opacity-80" />
                <span>Give Up</span>
              </button>
              <button onClick={handleRestart}
                className="flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-2xl bg-white/10 hover:bg-white/15 active:scale-95 transition-all text-sm font-semibold">
                <RefreshCw size={18} className="opacity-80" />
                <span>Restart</span>
              </button>

              {/* Hint column: dots on top, button below */}
              <div className="flex-1 flex flex-col items-center gap-1">
                {/* Hint count dots */}
                <div className="flex gap-1 items-center h-5">
                  {[0,1,2].map(i => (
                    <Lightbulb
                      key={i}
                      size={14}
                      className={i < hintsCount
                        ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.6)]'
                        : 'text-white/20'}
                    />
                  ))}
                </div>
                {/* Hint button (disabled while regenerating) */}
                <button onClick={handleHint} disabled={hintsCount <= 0}
                  className={`w-full flex flex-col items-center justify-center gap-1 py-3 rounded-2xl active:scale-95 transition-all text-sm font-semibold text-white ${
                    hintsCount > 0 ? 'bg-amber-500 hover:bg-amber-400' : 'bg-white/8 text-white/30 cursor-not-allowed'
                  }`}>
                  <Lightbulb size={18} />
                  <span>Hint</span>
                </button>
              </div>
            </div>

            {/* Regen timer */}
            {hintsCount < MAX_HINTS && secsUntilHint !== null && (
              <p className="text-center text-white/30 text-[11px]">
                Next hint in {Math.floor(secsUntilHint / 60)}:{String(secsUntilHint % 60).padStart(2, '0')}
              </p>
            )}

            {/* Attempts indicator */}
            <div className="flex items-center justify-center gap-1.5">
              {[0, 1].map(i => (
                <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i < 2 - attempts ? 'bg-emerald-400' : 'bg-red-400/40'}`} />
              ))}
              <span className="text-xs text-white/35 ml-1">
                {2 - attempts} attempt{2 - attempts !== 1 ? 's' : ''} left
              </span>
            </div>

            {/* Confirm */}
            <button onClick={handleConfirm} disabled={!allPainted}
              className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                allPainted
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/25'
                  : 'bg-white/8 text-white/30 cursor-not-allowed'
              }`}>
              {allPainted
                ? <><Check size={18} /> Confirm</>
                : `Color all regions  (${paintedCount} / ${regions.length})`}
            </button>
          </div>
        )}

        {/* Given-up controls */}
        {gameStatus === 'given-up' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-lg">
            <button onClick={() => advance(false)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-indigo-500 hover:bg-indigo-400 active:scale-95 transition-all font-bold shadow-lg">
              Next Flag <ChevronRight size={18} />
            </button>
          </motion.div>
        )}

        {/* Complete controls */}
        {gameStatus === 'complete' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="w-full max-w-lg">
            <button onClick={() => advance(true)}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-indigo-500 hover:bg-indigo-400 active:scale-[0.98] transition-all font-bold shadow-lg">
              Next Flag <ChevronRight size={18} />
            </button>
          </motion.div>
        )}
      </div>
    </div>

      {/* Long-press preview marker — floats above the touch point */}
      <AnimatePresence>
        {longPressMarker && selectedColor && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.12 }}
            className="fixed pointer-events-none z-50 flex items-center justify-center"
            style={{
              left: longPressMarker.x,
              top: longPressMarker.y - MARKER_OFFSET_Y,
              width: 24,
              height: 24,
              marginLeft: -12,
              marginTop: -12,
            }}
          >
            <X size={24} strokeWidth={5} className="absolute" style={{ color: 'rgba(0,0,0,0.6)' }} />
            <X size={24} strokeWidth={2.5} className="absolute" style={{ color: selectedColor }} />
            <div className="absolute w-2 h-2 rounded-full" style={{
              backgroundColor: selectedColor,
              boxShadow: '0 0 0 1.5px rgba(0,0,0,0.6)',
            }} />
          </motion.div>
        )}
      </AnimatePresence>
</>
  )
}
