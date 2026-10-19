import { useState, useEffect, useRef, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
    ArrowRight, Car, Check, ChevronRight, Crown, Flame, Moon, Sun, Play,
} from "lucide-react"
import {
    AtomIcon, BlurModeIcon, BorderChainIcon, BorderGuessIcon, ConstellationsIcon, CountryWheelIcon, HighscoreIcon,
    HigherLowerIcon, MapLocatorIcon, PaintFlagIcon, PvpBattleIcon, UltimateIcon, WorldConquerorIcon, type ModeIcon,
} from "../components/ModeIcons"
import worldData from "../../data/flags.json"
import usData from "../../data/us_states.json"
import SiteFooter from "../components/SiteFooter"
import { activeStreak, readStreak, STREAK_KEYS } from "../utils/dailyStreak"
import { DAILY_MODES, isDailyFinished } from "../utils/dailyModes"

const LAST_MODE_KEY = "flag-master-last-mode"
const TARGET_STREAK = 3

type FlagRow = { code: string; image: string; difficulty?: number; capital?: (string | null)[] }
const WORLD = worldData as FlagRow[]
const US = usData as unknown as FlagRow[]

/** Well-known flags only: the wall should read as "flags" at a glance, not as a quiz. */
const WALL_POOL = WORLD.filter(f => f.difficulty === 0 && !f.code.includes("-") && f.code !== "aq").map(f => f.image)

type DeckMode = "world" | "us" | "capitals"
type Deck = { mode: DeckMode; label: string; storageKey: string; items: FlagRow[] }

const DECKS: Deck[] = [
    { mode: "world", label: "Countries", storageKey: "flag-master-v1", items: WORLD },
    { mode: "us", label: "US States", storageKey: "flag-master-us-v1", items: US },
    { mode: "capitals", label: "World Capitals", storageKey: "flag-master-capitals-v1", items: WORLD.filter(f => f.capital && f.capital[0] !== null) },
]

type Entry = { to: string; label: string; detail: string; icon: ModeIcon; badge?: string; streakKey?: string; action?: { to: string; label: string } }

const MULTIPLAYER: Entry[] = [
    { to: "/world-conqueror", label: "World Conqueror", detail: "Conquer the world map - take countries off other players", icon: WorldConquerorIcon, badge: "New", streakKey: STREAK_KEYS.wars, action: { to: "/world-conqueror?hall=1", label: "Hall of Fame" } },
    { to: "/border-chain", label: "Border Chain", detail: "One live table, always running - name a country bordering the last", icon: BorderChainIcon, badge: "New" },
    { to: "/pvp/create", label: "PvP Battle", detail: "Create or join a lobby - challenge friends in real time", icon: PvpBattleIcon },
    { to: "/highscore", label: "Highscore", detail: "Speedrun flags, capitals or states - global leaderboard", icon: HighscoreIcon },
]

const MORE_MODES: Entry[] = [
    { to: "/road-trip", label: "Road Trip", detail: "Drive around the world map and uncover the flags beneath it", icon: Car, badge: "New" },
    { to: "/paint", label: "Paint the Flag", detail: "Color grayscale flags with the right colors", icon: PaintFlagIcon },
    { to: "/border-guess", label: "Border Guess", detail: "Identify countries by their highlighted border", icon: BorderGuessIcon },
    { to: "/higher-lower", label: "Higher or Lower", detail: "Population or area - which country is higher", icon: HigherLowerIcon },
    { to: "/ultimate", label: "Ultimate Mode", detail: "Locate the flag, then name the country and its capital", icon: UltimateIcon },
    { to: "/map", label: "Map Locator", detail: "Find countries on the world map", icon: MapLocatorIcon },
    { to: "/blur", label: "Blur Mode", detail: "Guess the flag as it slowly comes into focus", icon: BlurModeIcon },
    { to: "/word-wheel", label: "Country Wheel", detail: "Connect letters on the wheel to spell countries", icon: CountryWheelIcon },
    { to: "/constellations", label: "Constellations", detail: "Map the stars of the night sky", icon: ConstellationsIcon },
]

function todayUtc(): string {
    return new Date().toLocaleDateString("en-CA", { timeZone: "UTC" })
}

/** Small seeded shuffle, so the wall and the card art change daily but not on every render. */
function seeded<T>(items: T[], seed: string): T[] {
    let h = 2166136261
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
        h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
        const j = h % (i + 1)
        ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
}

function deckProgress(deck: Deck): { mastered: number; total: number; started: boolean; sample: string[] } {
    const total = deck.items.length
    let masteredCodes: string[] = []
    let started = false
    try {
        const parsed = JSON.parse(localStorage.getItem(deck.storageKey) ?? "null") as { progress?: Record<string, { streak: number; seen?: number }> } | null
        const entries = Object.entries(parsed?.progress ?? {})
        masteredCodes = entries.filter(([, p]) => p.streak >= TARGET_STREAK).map(([code]) => code)
        started = entries.some(([, p]) => (p.seen ?? 0) > 0 || p.streak > 0)
    } catch {
        // Unreadable save - show the deck as untouched.
    }
    // The stack shows flags the player already owns; a fresh deck shows its first three.
    const byCode = new Map(deck.items.map(f => [f.code, f.image]))
    const owned = masteredCodes.map(c => byCode.get(c)).filter((x): x is string => !!x)
    const sample = owned.length >= 3 ? owned.slice(-3) : deck.items.slice(0, 3).map(f => f.image)
    return { mastered: masteredCodes.length, total, started, sample }
}

/**
 * The deck the hero offers. Countries and Capitals are the main road: whichever
 * of them the player has started (the last one played wins a tie), Countries for
 * a newcomer. US States only once both of those are finished.
 */
function heroDeck<T extends { mode: DeckMode; mastered: number; total: number; started: boolean }>(decks: T[]): DeckMode {
    const open = decks.filter(d => (d.mode === "world" || d.mode === "capitals") && d.mastered < d.total)
    if (open.length === 0) return "us"
    let last: string | null = null
    try {
        last = localStorage.getItem(LAST_MODE_KEY)
    } catch {
        // No preference stored.
    }
    const lastOpen = open.find(d => d.mode === last && d.started)
    return (lastOpen ?? open.find(d => d.started) ?? open[0]).mode
}

function readSnapshot() {
    const today = todayUtc()
    const streaks = Object.fromEntries(Object.values(STREAK_KEYS).map(key => [key, activeStreak(readStreak(key), today)])) as Record<string, number>
    const dailies = DAILY_MODES.map(mode => ({
        mode,
        done: isDailyFinished(mode, today),
        streak: streaks[mode.streakKey] ?? 0,
    }))
    const decks = DECKS.map(deck => ({ ...deck, ...deckProgress(deck) }))
    return { streaks, dailies, decks, hero: heroDeck(decks), wall: seeded(WALL_POOL, `${today}-wall`) }
}

function Badge({ children }: { children: ReactNode }) {
    return (
        <span className="rounded-[5px] bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            {children}
        </span>
    )
}

function SectionHead({ id, title, aside }: { id: string; title: string; aside?: string }) {
    return (
        <div className="mb-4 mt-14 flex items-baseline justify-between gap-4">
            <h2 id={id} className="scroll-mt-6 !text-2xl font-bold tracking-[-0.02em] sm:!text-[26px]">{title}</h2>
            {aside && <span className="text-right text-sm text-slate-500 dark:text-[#8C97B3]">{aside}</span>}
        </div>
    )
}

function EntryList({ items, streaks }: { items: Entry[]; streaks: Record<string, number> }) {
    return (
        <ul className="grid grid-cols-1 md:grid-cols-2 md:gap-x-8">
            {items.map(({ to, label, detail, icon: Icon, badge, streakKey, action }) => (
                <li key={to} className="flex items-stretch border-b border-slate-200 dark:border-[#1C2338]">
                    <Link to={to} className="group flex min-w-0 flex-1 items-center gap-4 py-3.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors group-hover:border-slate-400 group-hover:text-slate-900 dark:border-[#2A3350] dark:text-[#A6B0C8] dark:group-hover:border-[#4A5680] dark:group-hover:text-white">
                            <Icon size={19} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 text-[15px] font-semibold">{label}{badge && <Badge>{badge}</Badge>}</span>
                            <span className="block truncate text-[13px] text-slate-500 dark:text-[#8C97B3]">{detail}</span>
                        </span>
                        {streakKey && (streaks[streakKey] ?? 0) > 0 && (
                            <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-orange-500 dark:text-orange-400" title="Day streak">
                                <Flame size={15} aria-hidden /> {streaks[streakKey]}
                            </span>
                        )}
                        <ChevronRight size={18} aria-hidden className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-[#556080]" />
                    </Link>
                    {action && (
                        <Link
                            to={action.to}
                            className="ml-2 flex shrink-0 items-center gap-1.5 self-center rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold text-amber-700 hover:border-amber-400 dark:border-[#2A3350] dark:text-amber-300 dark:hover:border-amber-400/60"
                            title={action.label}
                        >
                            <Crown size={15} aria-hidden />
                            <span className="hidden sm:inline">{action.label}</span>
                            <span className="sr-only sm:hidden">{action.label}</span>
                        </Link>
                    )}
                </li>
            ))}
        </ul>
    )
}

export default function Home() {
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== "undefined") return (localStorage.getItem("flag-master-theme") as "light" | "dark") || "light"
        return "light"
    })

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem("flag-master-theme", theme)
    }, [theme])

    const toggleTheme = () => setTheme(prev => (prev === "light" ? "dark" : "light"))

    // The flag wall only moves while it is on screen: a hundred-odd images sliding
    // under the rest of the page cost the GPU for nothing once you scroll past them.
    const heroRef = useRef<HTMLElement>(null)
    useEffect(() => {
        const hero = heroRef.current
        if (!hero || typeof IntersectionObserver === "undefined") return
        const observer = new IntersectionObserver(([entry]) => hero.classList.toggle("fl-wall-paused", !entry.isIntersecting))
        observer.observe(hero)
        return () => observer.disconnect()
    }, [])

    const navigate = useNavigate()
    // A snapshot of the day: the home screen is read once per visit, not watched.
    const [{ streaks, dailies, decks, hero, wall }] = useState(readSnapshot)

    const solved = dailies.filter(d => d.done).length
    const lastDeck = decks.find(d => d.mode === hero) ?? decks[0]

    function startMode(mode: DeckMode) {
        localStorage.setItem(LAST_MODE_KEY, mode)
        navigate("/play")
    }

    // Five rows, each the same list started at a different point, doubled so the slide loops seamlessly.
    const rows = [0, 9, 17, 4, 22].map(offset => {
        const row = wall.slice(offset).concat(wall.slice(0, offset)).slice(0, 14)
        return row.concat(row)
    })

    return (
        <div className="flex min-h-screen flex-col bg-[#F4F6FB] text-slate-900 dark:bg-[#0A0E1A] dark:text-[#E8ECF6]">
            <style>{`
                @keyframes fl-wall-slide { from { transform: translateX(0) } to { transform: translateX(-50%) } }
                .fl-wall-row { animation: fl-wall-slide 110s linear infinite; will-change: transform; backface-visibility: hidden; }
                .fl-wall-paused .fl-wall-row { animation-play-state: paused; }
                .fl-wall-row:nth-child(even) { animation-direction: reverse; animation-duration: 140s; }
                @media (prefers-reduced-motion: reduce) { .fl-wall-row { animation: none; } }
            `}</style>

            {/* Hero: the flags are the picture. */}
            <header ref={heroRef} className="relative overflow-hidden border-b border-slate-200 dark:border-[#1C2338]">
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 right-0 flex flex-col gap-2.5 py-2.5 opacity-20 [mask-image:linear-gradient(90deg,transparent,#000_22%)] sm:left-[46%] sm:opacity-100"
                >
                    {rows.map((row, r) => (
                        <div key={r} className="fl-wall-row flex w-max gap-2.5">
                            {row.map((src, i) => (
                                <img key={i} src={src} alt="" className="h-[84px] w-[126px] rounded-[4px] object-cover" />
                            ))}
                        </div>
                    ))}
                </div>

                <nav className="relative z-10 mx-auto flex max-w-[1120px] items-center justify-between px-5 pt-4 sm:px-6">
                    <Link to="/" className="flex items-center gap-2.5 font-bold tracking-[0.01em]">
                        <img src="/logo2.png" alt="" className="h-11 w-11" />
                        Flag Learn
                    </Link>
                    <div className="flex items-center gap-1 rounded-xl bg-[#F4F6FB]/85 p-1.5 text-sm text-slate-600 dark:bg-[#0A0E1A]/80 dark:text-[#A6B0C8]">
                        <a href="#learn" className="hidden rounded-lg px-3 py-1.5 hover:text-slate-900 md:block dark:hover:text-white">Learn</a>
                        <a href="#today" className="hidden rounded-lg px-3 py-1.5 hover:text-slate-900 md:block dark:hover:text-white">Daily</a>
                        <a href="#multiplayer" className="hidden rounded-lg px-3 py-1.5 hover:text-slate-900 md:block dark:hover:text-white">Multiplayer</a>
                        <Link to="/science" className="hidden rounded-lg px-3 py-1.5 hover:text-slate-900 md:block dark:hover:text-white">Science</Link>
                        <button
                            type="button"
                            onClick={toggleTheme}
                            aria-label="Toggle theme"
                            className="ml-1 flex h-9 min-h-0 w-9 items-center justify-center rounded-lg border border-slate-300 p-0 text-slate-700 hover:border-slate-500 dark:border-[#2A3350] dark:text-[#E8ECF6] dark:hover:border-[#4A5680]"
                        >
                            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
                        </button>
                    </div>
                </nav>

                <div className="relative z-10 mx-auto flex min-h-[420px] max-w-[1120px] items-center px-5 pb-14 pt-10 sm:min-h-[440px] sm:px-6">
                    <div className="max-w-[520px]">
                        <h1 className="!text-[clamp(2.4rem,5.2vw,4rem)] font-extrabold !leading-[1] !tracking-[-0.035em]">
                            Every flag on Earth, one at a time.
                        </h1>
                        <p className="mt-5 max-w-[30em] text-[17px] font-light text-slate-600 dark:text-[#A6B0C8]">
                            Learn them a few at a time, and actually remember them.
                            {lastDeck.mastered > 0 && <> {lastDeck.mastered} of {lastDeck.total} {lastDeck.label.toLowerCase()} are already yours.</>}
                        </p>
                        <button
                            type="button"
                            onClick={() => startMode(lastDeck.mode)}
                            className="mt-7 inline-flex items-center gap-3 rounded-lg bg-slate-900 px-5 py-3.5 font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
                        >
                            <Play size={18} aria-hidden />
                            {lastDeck.mastered > 0 ? `Continue ${lastDeck.label}` : `Start with ${lastDeck.label}`}
                            <span className="font-normal text-slate-400 dark:text-slate-500">{lastDeck.mastered} / {lastDeck.total}</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pb-16 sm:px-6">
                <SectionHead id="learn" title="Learn" />
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {decks.map(deck => (
                        <li key={deck.mode}>
                            <button
                                type="button"
                                onClick={() => startMode(deck.mode)}
                                className="group flex w-full flex-col gap-3.5 rounded-[10px] border border-slate-200 bg-white p-3.5 text-left font-normal hover:border-slate-400 dark:border-[#1C2338] dark:bg-[#0F1424] dark:hover:border-[#3A4670]"
                            >
                                <span className="flex w-full items-center gap-4">
                                {/* A small hand of cards: on hover it fans out, the top card lifting off the pile. */}
                                <span className="relative h-[52px] w-[76px] shrink-0" aria-hidden>
                                    {deck.sample.map((src, i) => (
                                        <img
                                            key={src}
                                            src={src}
                                            alt=""
                                            className="absolute h-10 w-[60px] rounded-[3px] object-cover shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-[rotate,translate] duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1.25)] [rotate:var(--r)] group-hover:[rotate:var(--hr)] group-hover:[translate:var(--hx)_var(--hy)]"
                                            style={{
                                                left: i * 7,
                                                top: 10 - i * 4,
                                                ["--r" as string]: `${[-8, -2, 5][i]}deg`,
                                                ["--hr" as string]: `${[-18, -4, 12][i]}deg`,
                                                ["--hx" as string]: `${[-7, 0, 9][i]}px`,
                                                ["--hy" as string]: `${[2, -4, -7][i]}px`,
                                            }}
                                        />
                                    ))}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-base font-bold">{deck.label}</span>
                                    <span className="mt-1 block text-xs text-slate-500 dark:text-[#8C97B3]">{deck.mastered} / {deck.total} mastered</span>
                                    <span className="mt-1.5 block h-1 rounded-sm bg-slate-200 dark:bg-[#1C2338]">
                                        <span className="block h-full rounded-sm bg-blue-500 dark:bg-blue-400" style={{ width: `${deck.total ? Math.max((deck.mastered / deck.total) * 100, deck.mastered ? 1.5 : 0) : 0}%` }} />
                                    </span>
                                </span>
                                </span>
                                <span className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-bold text-white transition-colors group-hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:group-hover:bg-[#DCE3F2]">
                                    <Play size={15} aria-hidden /> {deck.mastered > 0 ? "Continue" : "Play"}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
                <SectionHead id="today" title="Today" aside={`${solved} of ${dailies.length} solved · resets 00:00 UTC`} />
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    {dailies.map(({ mode, done, streak }) => (
                        <li key={mode.key}>
                            <Link
                                to={mode.to}
                                className="group flex h-full flex-col overflow-hidden rounded-[10px] border border-slate-200 bg-white transition-[border-color,translate] duration-200 hover:-translate-y-0.5 hover:border-slate-400 dark:border-[#1C2338] dark:bg-[#121829] dark:hover:border-[#3A4670]"
                            >
                                <div className="relative flex h-[118px] items-center justify-center border-b border-slate-200 bg-slate-50 dark:border-[#1C2338] dark:bg-[#0F1424]">
                                    <mode.icon size={84} aria-hidden />
                                    {done && (
                                        <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-md bg-emerald-500 px-2 py-1 text-xs font-bold text-white">
                                            <Check size={13} strokeWidth={3} aria-hidden /> Solved
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">
                                    <h3 className="flex items-center gap-2 !text-base font-bold">
                                        {mode.label}
                                        {mode.badge && <Badge>{mode.badge}</Badge>}
                                    </h3>
                                    <p className="mt-1 flex-1 text-[13px] text-slate-500 dark:text-[#8C97B3]">{mode.detail}</p>
                                    <div className="mt-3 flex items-center justify-between text-[13px]">
                                        {done ? (
                                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">See your result</span>
                                        ) : (
                                            <span className="flex items-center gap-1.5 font-semibold">Play <ArrowRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" /></span>
                                        )}
                                        {streak > 0 && (
                                            <span className="flex items-center gap-1 font-semibold text-orange-500 dark:text-orange-400" title="Day streak">
                                                <Flame size={15} aria-hidden /> {streak}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>

                <SectionHead id="multiplayer" title="Play with others" aside="Live or async" />
                <EntryList items={MULTIPLAYER} streaks={streaks} />

                <SectionHead id="more" title="More modes" />
                <EntryList items={MORE_MODES} streaks={streaks} />

                <Link
                    id="science"
                    to="/science"
                    className="group mt-14 flex items-center gap-4 rounded-[10px] border border-slate-200 bg-white p-3.5 hover:border-slate-400 dark:border-[#1C2338] dark:bg-[#0F1424] dark:hover:border-[#3A4670]"
                >
                    <span className="flex h-[52px] w-[76px] shrink-0 items-center justify-center text-cyan-600 dark:text-cyan-400">
                        <AtomIcon size={30} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-base font-bold">Science <Badge>New</Badge></span>
                        <span className="mt-1 block text-[13px] text-slate-500 dark:text-[#8C97B3]">The periodic table, physical quantities and formulas, learned the same way as flags</span>
                    </span>
                    <ChevronRight size={18} aria-hidden className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-[#556080]" />
                </Link>
            </main>

            <SiteFooter
                about={
                    <p>
                        Flag Learn is a free educational <strong>geography quiz</strong> designed to help you <strong>learn world flags</strong>, capitals, and US state flags effectively.
                        Includes <strong>Daily Connections</strong>, <strong>Daily Flagle</strong>, <strong>Daily Gauntlet</strong>, <strong>Paint the Flag</strong>, <strong>Border Guess</strong>, <strong>Map Locator</strong>, <strong>Higher or Lower</strong>, <strong>Ultimate</strong>, <strong>Blur</strong>, <strong>Constellations</strong>, <strong>PvP</strong>, and <strong>Highscore</strong> speedruns.
                        The <strong>Science</strong> wing applies the same spaced repetition to the <strong>periodic table</strong> - all 118 element symbols, names, families and positions.
                        Perfect for students, travelers, and geography enthusiasts.
                    </p>
                }
            />
        </div>
    )
}
