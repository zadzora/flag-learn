import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Check, PencilLine, X } from "lucide-react"
import TopBar from "../components/TopBar"
import SiteFooter from "../components/SiteFooter"
import { BadgeMedal, RankShield } from "../components/BadgeArt"
import {
    AREAS, ATLAS, LEARNED_POINTS, RANKS, TIER_NAMES, TIER_POINTS, TRACKS, WORLD,
    pointsOf, rankOf, readSnapshot, tierOf, unitFor, type Track,
} from "../utils/achievements"
import { CONTINENTS } from "../utils/roadTripGoals"
import { loadLog } from "../utils/roadTripLog"
import { readStreak, STREAK_KEYS } from "../utils/dailyStreak"
import { PROFILE_EVENT, readStore, setAvatar, todayUtc, type ProfileStore } from "../utils/profileStore"

/**
 * The player's own page: rank, the flags they hold continent by continent, every
 * badge with what the next tier takes, and their records and milestones.
 *
 * It only reads. The toast watcher (components/AchievementToasts.tsx) is what
 * folds new progress into the profile; reading and awarding here as well would
 * race it and swallow the toasts. The page re-reads on `PROFILE_EVENT`.
 */

const THEME_KEY = "flag-master-theme"
const NAME_KEY = "flag-master-nickname"

const EMPTY: ProfileStore = { since: todayUtc(), earned: {}, peaks: {}, days: {}, dailies: {}, counters: {}, records: {}, once: {}, continents: [], rank: 0 }

function load() {
    const stored = readStore()
    return { store: stored ?? EMPTY, snapshot: readSnapshot(stored) }
}

function readName(): string {
    try {
        return localStorage.getItem(NAME_KEY) ?? ""
    } catch {
        return ""
    }
}

function shortDate(date: string): string {
    const ms = Date.parse(`${date}T00:00:00Z`)
    if (Number.isNaN(ms)) return date
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}

const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-[#1C2338] dark:bg-[#0F1424]"
const muted = "text-slate-500 dark:text-[#8C97B3]"

function SectionHead({ title, aside }: { title: string; aside?: ReactNode }) {
    return (
        <div className="mb-4 mt-12 flex items-baseline justify-between gap-4">
            <h2 className="!text-2xl font-bold tracking-[-0.02em] sm:!text-[26px]">{title}</h2>
            {aside && <span className={`text-right text-sm ${muted}`}>{aside}</span>}
        </div>
    )
}

function Bar({ share, tone = "bg-blue-500 dark:bg-blue-400" }: { share: number; tone?: string }) {
    return (
        <span className="block h-1.5 overflow-hidden rounded-sm bg-slate-200 dark:bg-[#1C2338]">
            <span className={`block h-full rounded-sm ${tone}`} style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} />
        </span>
    )
}

export default function Profile() {
    const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light")
    useEffect(() => {
        const root = document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const [{ store, snapshot }, setData] = useState(load)
    useEffect(() => {
        const reload = () => setData(load())
        window.addEventListener(PROFILE_EVENT, reload)
        return () => window.removeEventListener(PROFILE_EVENT, reload)
    }, [])

    const [name, setName] = useState(readName)
    const [editingName, setEditingName] = useState(false)
    const [draftName, setDraftName] = useState("")
    const [pickingAvatar, setPickingAvatar] = useState(false)
    const [openTrack, setOpenTrack] = useState<Track | null>(null)

    const points = pointsOf(store)
    const rank = rankOf(points)
    const next = RANKS[rank + 1]
    const earnedCount = Object.keys(store.earned).length
    const tiersCount = Object.values(store.earned).reduce((n, e) => n + e.tier, 0)
    const avatar = store.avatar && snapshot.worldMastered.has(store.avatar) ? WORLD.find(f => f.code === store.avatar) : undefined
    const owned = WORLD.filter(f => snapshot.worldMastered.has(f.code))

    function saveName() {
        const clean = draftName.trim().slice(0, 24)
        if (clean) {
            localStorage.setItem(NAME_KEY, clean)
            setName(clean)
        }
        setEditingName(false)
    }

    // The three tiers closest to falling, so the page always says what to do next.
    const goals = useMemo(() => {
        return TRACKS.map(track => {
            const value = store.peaks[track.id] ?? 0
            const tier = tierOf(track, value)
            return { track, value, tier, target: track.tiers[tier] }
        })
            .filter(g => g.tier < 4 && g.value > 0)
            .sort((a, b) => b.value / b.target - a.value / a.target)
            .slice(0, 3)
    }, [store])

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Profile" theme={theme} onToggleTheme={() => setTheme(t => (t === "light" ? "dark" : "light"))} />

            <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-16 sm:px-6">
                {/* --- Who you are and where you stand --- */}
                <section className={`${panel} mt-8 p-5 sm:p-6`}>
                    <div className="flex flex-col gap-6 md:flex-row md:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-5">
                            <button
                                type="button"
                                onClick={() => setPickingAvatar(true)}
                                aria-label="Choose your flag"
                                title={owned.length ? "Choose your flag" : "Master a flag to wear it here"}
                                className="group relative h-[84px] w-[84px] min-h-0 shrink-0 overflow-hidden rounded-[10px] border border-slate-200 bg-slate-100 p-0 dark:border-[#2A3352] dark:bg-[#121829]"
                            >
                                {avatar ? (
                                    <img src={avatar.image} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <img src="/badges/flags.webp" alt="" className="mx-auto h-14 w-14" />
                                )}
                                <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white opacity-0 transition-opacity group-hover:opacity-100">Change</span>
                            </button>
                            <div className="min-w-0">
                                {editingName ? (
                                    <form
                                        className="flex items-center gap-2"
                                        onSubmit={e => {
                                            e.preventDefault()
                                            saveName()
                                        }}
                                    >
                                        <input
                                            autoFocus
                                            value={draftName}
                                            maxLength={24}
                                            onChange={e => setDraftName(e.target.value)}
                                            className="w-48 rounded-lg border border-slate-300 bg-transparent px-2.5 py-1.5 text-lg font-bold outline-none focus:border-blue-500 dark:border-[#2A3352]"
                                        />
                                        <button type="submit" aria-label="Save name" className="flex h-9 min-h-0 w-9 items-center justify-center rounded-lg bg-slate-900 p-0 text-white dark:bg-white dark:text-[#0A0E1A]">
                                            <Check size={16} aria-hidden />
                                        </button>
                                    </form>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDraftName(name)
                                            setEditingName(true)
                                        }}
                                        className="group flex min-h-0 items-center gap-2 p-0 text-left"
                                    >
                                        <span className="truncate text-[26px] font-extrabold tracking-[-0.02em]">{name || "Traveller"}</span>
                                        <PencilLine size={16} className="shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                                    </button>
                                )}
                                <p className={`mt-1 text-sm ${muted}`}>
                                    Collecting since {shortDate(store.since)} · {Object.keys(store.days).length} active {Object.keys(store.days).length === 1 ? "day" : "days"}
                                </p>
                                <p className={`mt-0.5 text-sm ${muted}`}>
                                    <strong className="text-slate-900 dark:text-white">{earnedCount}</strong> of {TRACKS.length} badges · {tiersCount} of {TRACKS.length * 4} tiers
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 border-t border-slate-200 pt-5 md:w-[360px] md:border-l md:border-t-0 md:pl-6 md:pt-0 dark:border-[#1C2338]">
                            <RankShield rank={rank} size={76} />
                            <div className="min-w-0 flex-1">
                                <span className={`block text-[11px] font-bold uppercase tracking-[0.08em] ${muted}`}>Rank {rank} of {RANKS.length - 1}</span>
                                <span className="block text-xl font-extrabold">{RANKS[rank].name}</span>
                                <span className={`mb-1.5 mt-1 flex justify-between text-xs ${muted}`}>
                                    <span className="tabular-nums">{points.toLocaleString()} pts</span>
                                    {next ? <span>{(next.points - points).toLocaleString()} to {next.name}</span> : <span>Top rank</span>}
                                </span>
                                <Bar
                                    share={next ? (points - RANKS[rank].points) / (next.points - RANKS[rank].points) : 1}
                                    tone="bg-amber-500 dark:bg-amber-400"
                                />
                            </div>
                        </div>
                    </div>

                    {goals.length > 0 && (
                        <div className="mt-6 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-3 dark:border-[#1C2338]">
                            {goals.map(g => (
                                <button
                                    key={g.track.id}
                                    type="button"
                                    onClick={() => setOpenTrack(g.track)}
                                    className="flex min-h-0 items-center gap-3 rounded-lg border border-slate-200 p-2.5 text-left font-normal hover:border-slate-400 dark:border-[#1C2338] dark:hover:border-[#3A4670]"
                                >
                                    <BadgeMedal id={g.track.id} tier={g.tier} size={40} />
                                    <span className="min-w-0 flex-1">
                                        <span className={`block text-[11px] font-bold uppercase tracking-[0.06em] ${muted}`}>Next: {TIER_NAMES[g.tier + 1]}</span>
                                        <span className="block truncate text-sm font-bold">{g.track.title}</span>
                                        <span className={`mb-1 block text-xs ${muted}`}>
                                            {(g.target - g.value).toLocaleString()} more {unitFor(g.track, g.target - g.value)}
                                        </span>
                                        <Bar share={g.value / g.target} />
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                {/* --- The atlas: the flags you hold, continent by continent --- */}
                <SectionHead
                    title="Your atlas"
                    aside={`${snapshot.worldMastered.size} of ${WORLD.length} flags · ${snapshot.continentsDone.length} of ${CONTINENTS.length} continents`}
                />
                <div className={`${panel} divide-y divide-slate-200 dark:divide-[#1C2338]`}>
                    {CONTINENTS.map(c => {
                        const flags = ATLAS[c]
                        const have = flags.filter(f => snapshot.worldMastered.has(f.code)).length
                        const done = have === flags.length && flags.length > 0
                        return (
                            <div key={c} className="grid gap-3 p-4 sm:grid-cols-[150px_1fr_64px] sm:items-center">
                                <div className="flex items-center gap-2 font-bold">
                                    {c}
                                    {done && <Check size={16} className="text-amber-500" aria-label="Complete" />}
                                </div>
                                <div className="flex flex-wrap gap-[3px]">
                                    {flags.map(f =>
                                        snapshot.worldMastered.has(f.code) ? (
                                            <img key={f.code} src={f.image} alt="" title={Array.isArray(f.name) ? f.name[0] : f.name} loading="lazy" className="h-4 w-6 rounded-[2px] object-cover" />
                                        ) : (
                                            <span key={f.code} className="h-4 w-6 rounded-[2px] bg-slate-200 dark:bg-[#1C2338]" />
                                        ),
                                    )}
                                </div>
                                <div className={`text-sm tabular-nums sm:text-right ${muted}`}>
                                    <strong className="text-slate-900 dark:text-white">{have}</strong>/{flags.length}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* --- Badges --- */}
                <SectionHead title="Badges" aside="Tap one to see every tier" />
                <div className="flex flex-col gap-8">
                    {AREAS.map(area => {
                        const tracks = TRACKS.filter(t => t.area === area.key)
                        const done = tracks.filter(t => store.earned[t.id]).length
                        return (
                            <section key={area.key}>
                                <h3 className={`mb-3 flex justify-between text-sm font-semibold ${muted}`}>
                                    <span>{area.label}</span>
                                    <span className="tabular-nums">{done} / {tracks.length}</span>
                                </h3>
                                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                                    {tracks.map(track => (
                                        <li key={track.id}>
                                            <BadgeCard track={track} value={store.peaks[track.id] ?? 0} onOpen={() => setOpenTrack(track)} />
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )
                    })}
                </div>

                {/* --- Ranks --- */}
                <SectionHead title="Ranks" aside={`${TIER_POINTS.slice(1).join(" / ")} pts per badge tier · ${LEARNED_POINTS} per thing learned`} />
                <ol className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                    {RANKS.map((r, i) => (
                        <li
                            key={r.name}
                            className={`${panel} flex flex-col items-center p-2.5 text-center ${i === rank ? "!border-amber-500 outline outline-1 outline-amber-500" : ""} ${i > rank ? "opacity-60" : ""}`}
                        >
                            <RankShield rank={i} size={52} className={i > rank ? "grayscale" : ""} />
                            <span className="mt-1 text-xs font-bold">{r.name}</span>
                            <span className={`text-[11px] tabular-nums ${muted}`}>{r.points.toLocaleString()}</span>
                        </li>
                    ))}
                </ol>

                {/* --- Journal --- */}
                <SectionHead title="Journal" />
                <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
                    <div className={`${panel} p-5`}>
                        <Activity days={store.days} since={store.since} />
                        <Milestones store={store} />
                    </div>
                    <Records store={store} />
                </div>
            </main>

            <SiteFooter />

            {openTrack && <TrackSheet track={openTrack} store={store} onClose={() => setOpenTrack(null)} />}
            {pickingAvatar && (
                <AvatarPicker
                    owned={owned}
                    current={avatar?.code}
                    onPick={code => {
                        setAvatar(code)
                        setPickingAvatar(false)
                        setData(load())
                    }}
                    onClose={() => setPickingAvatar(false)}
                />
            )}
        </div>
    )
}

function BadgeCard({ track, value, onOpen }: { track: Track; value: number; onOpen: () => void }) {
    const tier = tierOf(track, value)
    const target = track.tiers[Math.min(tier, 3)]
    const complete = tier >= 4
    return (
        <button
            type="button"
            onClick={onOpen}
            className={`${panel} flex h-full min-h-0 w-full flex-col items-center p-3 pb-3.5 text-center font-normal hover:border-slate-400 dark:hover:border-[#3A4670] ${tier === 0 ? "border-dashed" : ""}`}
        >
            <BadgeMedal id={track.id} tier={tier} size={64} className="my-1.5" />
            <span className="mt-1 block text-sm font-bold leading-tight">{track.title}</span>
            <span className={`mt-0.5 block text-[11px] font-semibold uppercase tracking-[0.06em] ${muted}`}>{TIER_NAMES[tier]}</span>
            <span className="mt-2 block w-full">
                <Bar share={complete ? 1 : value / target} tone={complete ? "bg-amber-500 dark:bg-amber-400" : undefined} />
            </span>
            <span className={`mt-1 block text-[11px] tabular-nums ${muted}`}>
                {complete ? "Complete" : `${value.toLocaleString()} / ${target.toLocaleString()}`}
            </span>
        </button>
    )
}

function Overlay({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onClose])
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0A0E1A]/60 p-4 sm:items-center" onClick={onClose} role="dialog" aria-label={label}>
            <div className={`${panel} relative max-h-[85vh] w-full max-w-[520px] overflow-y-auto p-5 sm:p-6`} onClick={e => e.stopPropagation()}>
                <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-8 min-h-0 w-8 items-center justify-center rounded-lg p-0 text-slate-400 hover:text-slate-800 dark:hover:text-white">
                    <X size={18} aria-hidden />
                </button>
                {children}
            </div>
        </div>
    )
}

function TrackSheet({ track, store, onClose }: { track: Track; store: ProfileStore; onClose: () => void }) {
    const value = store.peaks[track.id] ?? 0
    const tier = tierOf(track, value)
    const earned = store.earned[track.id]
    return (
        <Overlay onClose={onClose} label={track.title}>
            <div className="flex items-center gap-4">
                <BadgeMedal id={track.id} tier={tier} size={72} />
                <div>
                    <h3 className="text-xl font-extrabold">{track.title}</h3>
                    <p className={`text-sm ${muted}`}>{track.detail}</p>
                    <p className="mt-1 text-sm">
                        <strong className="tabular-nums">{value.toLocaleString()}</strong> <span className={muted}>{unitFor(track, value)} so far</span>
                    </p>
                </div>
            </div>
            <ol className="mt-5 grid grid-cols-4 gap-2">
                {track.tiers.map((t, i) => {
                    const reached = tier > i
                    return (
                        <li key={i} className={`flex flex-col items-center rounded-lg border p-2 text-center ${reached ? "border-slate-300 dark:border-[#2A3352]" : "border-dashed border-slate-200 dark:border-[#1C2338]"}`}>
                            <BadgeMedal id={track.id} tier={reached ? i + 1 : 0} size={44} />
                            <span className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.06em]">{TIER_NAMES[i + 1]}</span>
                            <span className={`text-xs tabular-nums ${muted}`}>{t.toLocaleString()}</span>
                        </li>
                    )
                })}
            </ol>
            {earned && (
                <p className={`mt-4 text-sm ${muted}`}>
                    {TIER_NAMES[earned.tier]} {earned.retro ? `earned before ${shortDate(store.since)}` : `earned ${shortDate(earned.at)}`}
                </p>
            )}
            {track.to && (
                <Link to={track.to} className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]">
                    {tier >= 4 ? "Play again" : "Go for the next tier"} <ArrowRight size={15} aria-hidden />
                </Link>
            )}
        </Overlay>
    )
}

function AvatarPicker({ owned, current, onPick, onClose }: { owned: typeof WORLD; current?: string; onPick: (code: string) => void; onClose: () => void }) {
    return (
        <Overlay onClose={onClose} label="Choose your flag">
            <h3 className="text-xl font-extrabold">Your flag</h3>
            <p className={`mb-4 text-sm ${muted}`}>Any flag you have mastered. Learn more to widen the choice.</p>
            {owned.length === 0 ? (
                <Link to="/play" className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-[#0A0E1A]">
                    Master your first flag <ArrowRight size={15} aria-hidden />
                </Link>
            ) : (
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
                    {owned.map(f => (
                        <button
                            key={f.code}
                            type="button"
                            onClick={() => onPick(f.code)}
                            title={Array.isArray(f.name) ? f.name[0] : f.name}
                            className={`min-h-0 overflow-hidden rounded-md border-2 p-0 ${f.code === current ? "border-amber-500" : "border-transparent hover:border-slate-400"}`}
                        >
                            <img src={f.image} alt="" loading="lazy" className="aspect-[3/2] w-full object-cover" />
                        </button>
                    ))}
                </div>
            )}
        </Overlay>
    )
}

const WEEKS = 20

/** Days with progress, GitHub style. It starts the day the profile did; nothing before was recorded. */
function Activity({ days, since }: { days: Record<string, number>; since: string }) {
    const cells = useMemo(() => {
        const end = Date.parse(`${todayUtc()}T00:00:00Z`)
        const endDow = new Date(end).getUTCDay()
        const start = end - ((WEEKS - 1) * 7 + endDow) * 86_400_000
        const out: { date: string; level: number; future: boolean }[] = []
        for (let t = start; t < start + WEEKS * 7 * 86_400_000; t += 86_400_000) {
            const date = new Date(t).toISOString().slice(0, 10)
            const n = days[date] ?? 0
            out.push({ date, level: n === 0 ? 0 : n < 3 ? 1 : n < 8 ? 2 : n < 20 ? 3 : 4, future: t > end })
        }
        return out
    }, [days])
    const tone = ["bg-slate-200 dark:bg-[#1C2338]", "bg-blue-200 dark:bg-[#1d3a6b]", "bg-blue-400 dark:bg-[#2559a8]", "bg-blue-500 dark:bg-blue-500", "bg-blue-700 dark:bg-blue-300"]
    return (
        <div>
            <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-bold">Activity</span>
                <span className={`text-xs ${muted}`}>since {shortDate(since)}</span>
            </div>
            {/* Pushed right, so the newest week sits under "since" and the empty past trails off to the left. */}
            <div className="flex overflow-x-auto">
                <div className="ml-auto grid grid-flow-col grid-rows-[repeat(7,12px)] gap-[3px]" style={{ gridAutoColumns: "12px" }}>
                    {cells.map(c => (
                        <span key={c.date} title={c.future ? undefined : `${shortDate(c.date)}: ${days[c.date] ?? 0}`} className={`rounded-[2px] ${c.future ? "opacity-0" : tone[c.level]}`} />
                    ))}
                </div>
            </div>
        </div>
    )
}

function Milestones({ store }: { store: ProfileStore }) {
    const entries = Object.entries(store.earned)
        .map(([id, e]) => ({ track: TRACKS.find(t => t.id === id), ...e }))
        .filter((e): e is typeof e & { track: Track } => !!e.track)
    const dated = entries.filter(e => !e.retro).sort((a, b) => b.at.localeCompare(a.at))
    const before = entries.filter(e => e.retro)
    if (entries.length === 0) {
        return <p className={`mt-6 text-sm ${muted}`}>Your first badge will start the story here.</p>
    }
    return (
        <div className="mt-6">
            <span className="text-sm font-bold">Milestones</span>
            <ol className="relative mt-3 flex flex-col gap-4 pl-6 before:absolute before:bottom-1 before:left-[7px] before:top-1 before:w-0.5 before:bg-slate-200 dark:before:bg-[#1C2338]">
                {dated.slice(0, 12).map(e => (
                    <li key={e.track.id} className="relative flex items-center gap-3">
                        <span className={`absolute -left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 bg-white dark:bg-[#0F1424] ${e.tier >= 3 ? "border-amber-500 !bg-amber-500" : "border-blue-500"}`} />
                        <BadgeMedal id={e.track.id} tier={e.tier} size={34} />
                        <span className="min-w-0">
                            <span className={`block text-[11px] font-semibold uppercase tracking-[0.06em] ${muted}`}>{shortDate(e.at)}</span>
                            <span className="block text-sm font-semibold">
                                {e.track.title} <span className={muted}>· {TIER_NAMES[e.tier]}</span>
                            </span>
                        </span>
                    </li>
                ))}
                {before.length > 0 && (
                    <li className="relative">
                        <span className="absolute -left-6 top-2 h-3.5 w-3.5 rounded-full border-2 border-slate-400 bg-white dark:bg-[#0F1424]" />
                        <span className={`block text-[11px] font-semibold uppercase tracking-[0.06em] ${muted}`}>Before {shortDate(store.since)}</span>
                        <span className="mb-2 block text-sm font-semibold">{before.length} badges you had already earned</span>
                        <span className="flex flex-wrap gap-1.5">
                            {before.map(e => (
                                <span key={e.track.id} title={`${e.track.title} · ${TIER_NAMES[e.tier]}`}>
                                    <BadgeMedal id={e.track.id} tier={e.tier} size={30} />
                                </span>
                            ))}
                        </span>
                    </li>
                )}
            </ol>
        </div>
    )
}

function Records({ store }: { store: ProfileStore }) {
    const log = loadLog()
    const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`
    const all: [string, number, (n: number) => string][] = [
        ["Flagle streak", readStreak(STREAK_KEYS.flagle).best, days],
        ["Connections streak", readStreak(STREAK_KEYS.connections).best, days],
        ["Deduction streak", readStreak(STREAK_KEYS.deduction).best, days],
        ["Gauntlet streak", readStreak(STREAK_KEYS.gauntlet).best, days],
        ["Rally streak", readStreak(STREAK_KEYS.rally).best, days],
        ["Right answers in a row", store.records["sharp-eye"] ?? 0, n => n.toLocaleString()],
        ["Higher or Lower run", store.records["higher-lower"] ?? 0, n => n.toLocaleString()],
        ["Flags named in a row (Road Trip)", log.streak.best, n => n.toLocaleString()],
        ["Best drift", Math.round(log.drift.best), n => `${n.toLocaleString()} pts`],
    ]
    const rows = all.filter(([, n]) => n > 0).map(([label, n, format]) => [label, format(n)])
    return (
        <div className={`${panel} p-5`}>
            <span className="text-sm font-bold">Personal records</span>
            {rows.length === 0 ? (
                <p className={`mt-3 text-sm ${muted}`}>Records appear as you play.</p>
            ) : (
                <dl className="mt-3 divide-y divide-slate-200 dark:divide-[#1C2338]">
                    {rows.map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-3 py-2 text-sm">
                            <dt className={muted}>{label}</dt>
                            <dd className="font-bold tabular-nums">{value}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    )
}
