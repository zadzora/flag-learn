import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Lightbulb, RefreshCw, Flag, Check, X, ChevronRight, Flame, Loader2, Paintbrush } from 'lucide-react'
import TopBar from '../components/TopBar'
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

  // This page has no theme switch of its own and always plays on the night ground:
  // the `dark` class turns on every dark: variant below, whatever the app theme is.
  const pageClass = 'dark flex min-h-[100dvh] flex-col bg-[#0A0E1A] text-slate-900 select-none dark:text-[#E8ECF6]'
  const panel = 'rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
  const primary = 'rounded-lg bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]'
  const quiet = 'rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]'
  const disabledButton = 'cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500'

  // ── Cycle-complete screen ──
  if (cycleComplete) {
    return (
      <div className={pageClass}>
        <TopBar title="Paint the Flag" back={() => navigate(-1)} />
        <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-14 pt-6 sm:pt-8">
          <section className={`${panel} flex flex-col gap-6 p-6 sm:p-8`}>
            <div className="flex items-center gap-4">
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700 dark:text-amber-400">
                <Paintbrush size={28} aria-hidden />
              </motion.span>
              <div>
                <h1 className="!text-3xl font-bold">All Done!</h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">You painted all {total} flags.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Correct</div>
                <div className="mt-1 text-3xl font-bold tabular-nums text-emerald-500 dark:text-emerald-400">{completed}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Incorrect</div>
                <div className="mt-1 text-3xl font-bold tabular-nums text-red-500 dark:text-red-400">{incorrectCount}</div>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button onClick={() => startNewCycle()} className={`${primary} flex flex-1 items-center justify-center gap-2 py-3.5 font-bold`}>
                <RefreshCw size={18} aria-hidden /> Play Again
              </button>
              <button onClick={() => navigate(-1)} className={`${quiet} flex-1 py-3.5 font-bold`}>Back to menu</button>
            </div>
          </section>
        </main>
      </div>
    )
  }

  // ── Main game ──
  return (
    <>
    <div className={pageClass}>
      <TopBar title="Paint the Flag" back={() => navigate(-1)}>
        {streak >= 2 && (
          <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-orange-500 dark:text-orange-400" title="Painted in a row">
            <Flame size={15} aria-hidden /> {streak}
          </span>
        )}
        <span className="text-sm font-semibold tabular-nums text-slate-500 dark:text-slate-400" title="Flags painted">{completed}/{total}</span>
      </TopBar>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-5">
        {/* Cycle progress */}
        <div className="h-1.5 w-full shrink-0 overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700">
          <motion.div
            className="h-full bg-emerald-500"
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        {/* Centered content: name + flag + palette + feedback */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 py-5">

          {/* Country name + flags left - swapped in place, never faded out */}
          <div key={currentCode} className="fl-in flex flex-col items-center gap-0.5">
            <h2 className="text-center !text-2xl font-bold uppercase tracking-wide">
              {getFlagName(currentCode)}
            </h2>
            <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {queue.length} flag{queue.length !== 1 ? 's' : ''} left
            </span>
          </div>

          {/* Flag canvas */}
          <div className={`relative w-full overflow-hidden rounded-[4px] shadow-[0_2px_10px_rgba(10,14,26,0.18)]${!svgString ? ' min-h-[180px] bg-slate-50 dark:bg-slate-800' : ''}`}>
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

            {gameStatus === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="animate-spin text-slate-400 dark:text-slate-500" size={30} aria-hidden />
              </div>
            )}

            {gameStatus === 'unsupported' && (
              <div className="fl-in absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50 dark:bg-slate-800">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Flag too complex to paint</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Too many colors or unsupported format</span>
              </div>
            )}

            <AnimatePresence>
              {gameStatus === 'complete' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-emerald-500/90 text-white">
                  <Check size={56} strokeWidth={2.5} aria-hidden />
                  <p className="text-2xl font-bold">Correct!</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Color palette - always occupies space to prevent layout shift. The swatches stay round: they are paint pots. */}
          <div className={`mt-[10px] flex min-h-[58px] flex-wrap justify-center gap-4 transition-opacity duration-200 ${
            gameStatus === 'painting' && palette.length > 0 ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}>
            {palette.map(color => {
              const sel = color === selectedColor
              const light = isLightColor(color)
              return (
                <motion.button key={color} onClick={() => setSelectedColor(sel ? null : color)}
                  animate={{ scale: sel ? 1.18 : 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  aria-label={`Use color ${color}`}
                  aria-pressed={sel}
                  className="relative min-h-0 p-0 text-slate-900 focus:outline-none dark:text-white" style={{ touchAction: 'manipulation' }}>
                  <div className="h-12 w-12 rounded-full" style={{
                    backgroundColor: color,
                    border: sel ? '3px solid currentColor' : light ? '3px solid rgba(0,0,0,0.2)' : '3px solid rgba(255,255,255,0.15)',
                    boxShadow: sel ? `0 0 0 2px ${color}` : 'none',
                  }} />
                  {sel && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500">
                      <X size={9} className="text-white" strokeWidth={3.5} aria-hidden />
                    </span>
                  )}
                </motion.button>
              )
            })}
          </div>

          {/* Feedback / instruction line */}
          <div className="flex h-5 items-center justify-center">
            {gameStatus === 'painting' && !wrongFeedback && (
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                {selectedColor ? 'Click a region to color it' : 'Select a color above'}
              </p>
            )}
            {wrongFeedback && (
              <p className="fl-in text-center text-xs font-bold text-red-600 dark:text-red-400">
                {attempts >= 1 ? 'Last attempt — choose carefully!' : 'Some colors are wrong — try again!'}
              </p>
            )}
            {gameStatus === 'given-up' && (
              <p className="text-center text-xs font-semibold text-amber-600 dark:text-amber-400">Correct colors revealed</p>
            )}
          </div>

          {/* Debug panel — visible only when ?code= param is present */}
          {debugCode !== null && (
            <div className={`${panel} flex w-full flex-col gap-2 p-3 font-mono text-xs`}>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-slate-500 dark:text-slate-400">code:</span>
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
                  className="min-w-0 flex-1 border border-slate-200 bg-slate-50 px-2 py-1 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#4A5680]"
                  placeholder="e.g. cf"
                  spellCheck={false}
                />
                <button
                  onClick={() => { const c = debugInput.trim().toLowerCase(); if (c) { setCurrentCode(c); loadFlag(c) } }}
                  className={`${primary} shrink-0 px-3 py-1`}
                >Go</button>
              </div>
              <div className="flex flex-wrap gap-3">
                <span className="text-slate-500 dark:text-slate-400">regions: <span className="text-emerald-600 dark:text-emerald-400">{regions.length}</span></span>
                <span className="text-slate-500 dark:text-slate-400">palette: <span className="text-emerald-600 dark:text-emerald-400">{palette.length}</span></span>
                <span className="text-slate-500 dark:text-slate-400">painted: <span className="text-emerald-600 dark:text-emerald-400">{Object.keys(paintedColors).length}</span></span>
              </div>
              {palette.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {palette.map(c => (
                    <div key={c} className="flex items-center gap-1">
                      <div className="h-3.5 w-3.5 rounded-sm border border-slate-300 dark:border-slate-600" style={{ backgroundColor: c }} />
                      <span className="text-slate-500 dark:text-slate-400">{c}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom controls */}
        <div className="flex min-h-[240px] w-full shrink-0 flex-col items-center gap-2 pb-9">

          {/* Painting controls */}
          {gameStatus === 'painting' && (
            <div className="flex w-full flex-col gap-2">
              {/* Button row: Give Up / Restart / Hint (with bulbs above hint) */}
              <div className="flex items-end gap-2">
                <button onClick={handleGiveUp}
                  className={`${quiet} flex flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold`}>
                  <Flag size={18} aria-hidden />
                  <span>Give Up</span>
                </button>
                <button onClick={handleRestart}
                  className={`${quiet} flex flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold`}>
                  <RefreshCw size={18} aria-hidden />
                  <span>Restart</span>
                </button>

                {/* Hint column: count on top, button below */}
                <div className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-5 items-center gap-1" aria-label={`${hintsCount} of ${MAX_HINTS} hints left`}>
                    {[0,1,2].map(i => (
                      <Lightbulb
                        key={i}
                        size={14}
                        aria-hidden
                        className={i < hintsCount
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300 dark:text-slate-600'}
                      />
                    ))}
                  </div>
                  {/* Hint button (disabled while regenerating) */}
                  <button onClick={handleHint} disabled={hintsCount <= 0}
                    className={`flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold ${
                      hintsCount > 0 ? quiet : disabledButton
                    }`}>
                    <Lightbulb size={18} aria-hidden className={hintsCount > 0 ? 'text-amber-500 dark:text-amber-400' : ''} />
                    <span>Hint</span>
                  </button>
                </div>
              </div>

              {/* Regen timer */}
              {hintsCount < MAX_HINTS && secsUntilHint !== null && (
                <p className="text-center text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                  Next hint in {Math.floor(secsUntilHint / 60)}:{String(secsUntilHint % 60).padStart(2, '0')}
                </p>
              )}

              {/* Attempts indicator */}
              <div className="flex items-center justify-center gap-1.5">
                {[0, 1].map(i => (
                  <div key={i} className={`h-2 w-2 rounded-full transition-colors ${i < 2 - attempts ? 'bg-emerald-500' : 'bg-red-500/40'}`} />
                ))}
                <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                  {2 - attempts} attempt{2 - attempts !== 1 ? 's' : ''} left
                </span>
              </div>

              {/* Confirm */}
              <button onClick={handleConfirm} disabled={!allPainted}
                className={`flex w-full items-center justify-center gap-2 py-4 text-base font-bold ${allPainted ? primary : disabledButton}`}>
                {allPainted
                  ? <><Check size={18} aria-hidden /> Confirm</>
                  : `Color all regions  (${paintedCount} / ${regions.length})`}
              </button>
            </div>
          )}

          {/* Given-up controls */}
          {gameStatus === 'given-up' && (
            <div className="fl-in w-full">
              <button onClick={() => advance(false)}
                className={`${primary} flex w-full items-center justify-center gap-2 py-3.5 font-bold`}>
                Next Flag <ChevronRight size={18} aria-hidden />
              </button>
            </div>
          )}

          {/* Complete controls */}
          {gameStatus === 'complete' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="w-full">
              <button onClick={() => advance(true)}
                className={`${primary} flex w-full items-center justify-center gap-2 py-4 font-bold`}>
                Next Flag <ChevronRight size={18} aria-hidden />
              </button>
            </motion.div>
          )}
        </div>
      </main>
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
