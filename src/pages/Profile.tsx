import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Check, Crown, PencilLine } from "lucide-react"
import { AtomIcon, CapitalSpeedrunIcon, HighscoreIcon, MapSpeedrunIcon, UltimateSpeedrunIcon, WorldConquerorIcon, type ModeIcon } from "../components/ModeIcons"
import { formatRunTime } from "../utils/mapSpeedrun"
import { installProfileTest, RECORD_GAMES, useRecordsHeld, type HeldRecord, type RecordGame } from "../utils/recordsHeld"
import TopBar from "../components/TopBar"
import SnowCap from "../components/SnowCap"
import SiteFooter from "../components/SiteFooter"
import Overlay from "../components/Overlay"
import AccountPanel, { AccountLine } from "../components/AccountPanel"
import { SupporterCard } from "../components/SupporterName"
import { BadgeMedal, RankShield } from "../components/BadgeArt"
import {
    AREAS, ATLAS, LEARNED_POINTS, RANKS, TIER_NAMES, TIER_POINTS, TRACKS, WORLD,
    pointsOf, rankOf, readSnapshot, tierOf, unitFor, type Track,
} from "../utils/achievements"
import { CONTINENTS } from "../utils/roadTripGoals"
import { loadLog } from "../utils/roadTripLog"
import { readStreak, STREAK_KEYS } from "../utils/dailyStreak"
import { PROFILE_EVENT, emptyStore, readStore, setAvatar, todayUtc, type ProfileStore } from "../utils/profileStore"
import { formatShare, installBadgeStatsTest, rarityOf, useBadgeStats, type BadgeStats } from "../utils/badgeStats"
import { asset } from "../utils/asset"
import { isNameOffensive, NAME_REFUSED } from "../utils/nameFilter"

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

const EMPTY: ProfileStore = emptyStore()

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
    // How rare each badge is; null (and nothing drawn) until enough players are counted.
    const stats = useBadgeStats()
    useEffect(() => installBadgeStatsTest(), []) // dev server only - see badgeStats.ts

    const points = pointsOf(store)
    const rank = rankOf(points)
    const next = RANKS[rank + 1]
    const earnedCount = Object.keys(store.earned).length
    const tiersCount = Object.values(store.earned).reduce((n, e) => n + e.tier, 0)
    const avatar = store.avatar && snapshot.worldMastered.has(store.avatar) ? WORLD.find(f => f.code === store.avatar) : undefined
    const owned = WORLD.filter(f => snapshot.worldMastered.has(f.code))

    function saveName() {
        const clean = draftName.trim().slice(0, 24)
        // The profile name seeds every leaderboard and room, so it goes through the same filter.
        if (isNameOffensive(clean)) return
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
                <section className={`${panel} relative mt-8 p-5 sm:p-6`}>
                    <SnowCap seed="profile-hero" />
                    <div className="flex flex-col gap-6 md:flex-row md:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-5">
                            <button
                                type="button"
                                onClick={() => setPickingAvatar(true)}
                                aria-label="Choose your flag"
                                title={owned.length ? "Choose your flag" : "Master a flag to wear it here"}
                                className="group relative flex h-[84px] w-[126px] min-h-0 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-slate-200 bg-slate-100 p-0 dark:border-[#2A3352] dark:bg-[#121829]"
                            >
                                {/* A flag-shaped frame, and contain rather than cover: a square crop cut the
                                    hoist off Slovakia and pushed Bangladesh's disc to the edge. Flags that are
                                    not 3:2 (Nepal, Switzerland, Qatar) letterbox instead of losing a part. */}
                                {avatar ? (
                                    <img src={avatar.image} alt="" className="h-full w-full object-contain" />
                                ) : (
                                    <img src={asset("/badges/flags.webp")} alt="" className="mx-auto h-14 w-14" />
                                )}
                                <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white opacity-0 transition-opacity group-hover:opacity-100">Change</span>
                            </button>
                            <div className="min-w-0">
                                {editingName ? (
                                    <>
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
                                    {isNameOffensive(draftName) && <p className="mt-1 text-sm font-semibold text-red-600 dark:text-red-400" role="alert">{NAME_REFUSED}</p>}
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDraftName(name)
                                            setEditingName(true)
                                        }}
                                        title="Change your name"
                                        className="group flex min-h-0 items-center gap-2 p-0 text-left"
                                    >
                                        <span className="truncate text-[26px] font-extrabold tracking-[-0.02em]">{name || "Traveller"}</span>
                                        <PencilLine size={16} className="shrink-0 text-slate-400 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
                                    </button>
                                )}
                                <p className={`mt-0.5 text-xs ${muted}`}>
                                    {name ? "Click your name to change it." : "Click the name to set yours."}
                                </p>
                                <p className={`mt-1 text-sm ${muted}`}>
                                    Collecting since {shortDate(store.since)} · {Object.keys(store.days).length} active {Object.keys(store.days).length === 1 ? "day" : "days"}
                                </p>
                                <p className={`mt-0.5 text-sm ${muted}`}>
                                    <strong className="text-slate-900 dark:text-white">{earnedCount}</strong> of {TRACKS.length} badges · {tiersCount} of {TRACKS.length * 4} tiers
                                </p>
                                <AccountLine />
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

                <SupporterCard name={name} />

                {/* --- The atlas: the flags you hold, continent by continent --- */}
                <SectionHead
                    title="Your atlas"
                    aside={`${snapshot.worldMastered.size} of ${WORLD.length} flags · ${snapshot.continentsDone.length} of ${CONTINENTS.length} continents`}
                />
                <div className={`${panel} relative divide-y divide-slate-200 dark:divide-[#1C2338]`}>
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
                                            <img key={f.code} src={f.image} alt="" title={Array.isArray(f.name) ? f.name[0] : f.name} loading="lazy" className="h-4 w-6 rounded-[2px] object-contain" />
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
                    {/* Last, not first: divide-y draws a line under every child but the last. */}
                    <SnowCap seed="profile-atlas" />
                </div>

                {/* --- Titles held against everybody else --- */}
                <Titles />

                {/* --- Badges --- */}
                <SectionHead
                    title="Badges"
                    aside={
                        stats?.test ? (
                            <span className="font-bold text-rose-500">Test data · badgeStatsTest.clear()</span>
                        ) : stats ? (
                            `Tap one to see every tier · % of ${stats.players.toLocaleString()} players with a badge`
                        ) : (
                            "Tap one to see every tier"
                        )
                    }
                />
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
                                <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 lg:grid-cols-7">
                                    {tracks.map(track => (
                                        <li key={track.id}>
                                            <BadgeCard track={track} value={store.peaks[track.id] ?? 0} stats={stats} onOpen={() => setOpenTrack(track)} />
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
                    <div className={`${panel} relative p-5`}>
                        <SnowCap seed="profile-journal" />
                        <Activity days={store.days} dailies={store.dailies} since={store.since} />
                        <Milestones store={store} />
                    </div>
                    <Records store={store} />
                </div>

                {/* --- Where the progress is kept --- */}
                <SectionHead title="Your progress" />
                <AccountPanel />
            </main>

            <SiteFooter />

            {openTrack && <TrackSheet track={openTrack} store={store} stats={stats} onClose={() => setOpenTrack(null)} />}
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

const RECORD_ICONS: Record<RecordGame, ModeIcon> = {
    highscore: HighscoreIcon,
    map: MapSpeedrunIcon,
    capital: CapitalSpeedrunIcon,
    ultimate: UltimateSpeedrunIcon,
    elements: AtomIcon,
}

// Full-colour art for the cards (graphic/icons_4.png, icons_5.png and icons_7.png, cut by
// scripts/gen-badge-sprites.py). A game without art keeps its line icon on a dark tile.
const RECORD_ART: Partial<Record<RecordGame, string>> = {
    highscore: asset("/badges/title-highscore.webp"),
    map: asset("/badges/title-map-speedrun.webp"),
    capital: asset("/badges/title-capital-speedrun.webp"),
    ultimate: asset("/badges/title-ultimate-speedrun.webp"),
}
const CONQUEROR_ART: string | undefined = asset("/badges/title-conqueror.webp")

/**
 * First places on the global boards and World Conqueror seasons won. Read live
 * from the boards each visit (utils/recordsHeld.ts) - somebody else can take a
 * record at any moment, so a stored copy would brag about one already lost.
 */
function Titles() {
    const held = useRecordsHeld()
    useEffect(() => installProfileTest(), []) // dev server only - see recordsHeld.ts
    const { records, wins } = held
    const count = records.length + (wins.length > 0 ? 1 : 0)
    const aside = held.status === "loading" ? "Checking the leaderboards…" : held.status === "offline" ? "Leaderboards unavailable" : `${records.length} ${records.length === 1 ? "record" : "records"} held${wins.length ? ` · ${wins.length} ${wins.length === 1 ? "season" : "seasons"} won` : ""}`

    return (
        <>
            <SectionHead
                title="Titles"
                aside={held.test ? <span className="font-bold text-rose-500">Test data · profileTest.clear()</span> : aside}
            />
            {held.status === "ready" && count === 0 ? (
                <div className={`${panel} flex flex-col gap-4 p-5 sm:flex-row sm:items-center`}>
                    <p className={`flex-1 text-sm ${muted}`}>
                        Set the fastest time on a global leaderboard, or hold the most land when a World Conqueror season ends, and the title shows here - for as long as nobody takes it.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {[...(Object.keys(RECORD_GAMES) as RecordGame[]).map(g => ({ to: RECORD_GAMES[g].to, title: RECORD_GAMES[g].title, Icon: RECORD_ICONS[g] })), { to: "/world-conqueror", title: "World Conqueror", Icon: WorldConquerorIcon }].map(({ to, title, Icon }) => (
                            <Link key={to} to={to} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold hover:border-slate-400 dark:border-[#1C2338] dark:hover:border-[#3A4670]">
                                <Icon size={15} aria-hidden /> {title}
                            </Link>
                        ))}
                    </div>
                </div>
            ) : held.status !== "ready" ? (
                <div className={`${panel} h-[104px] ${held.status === "loading" ? "animate-pulse" : ""}`} />
            ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {wins.length > 0 && (
                        <li className="sm:col-span-2 lg:col-span-1">
                            <Link
                                to="/world-conqueror?hall=1"
                                className={`${panel} flex h-full items-center gap-4 !border-amber-400/70 bg-gradient-to-br from-amber-50 to-white p-4 hover:!border-amber-500 dark:!border-amber-500/40 dark:from-amber-500/10 dark:to-[#0F1424]`}
                            >
                                <span className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${CONQUEROR_ART ? "bg-amber-100 dark:bg-amber-500/15" : "bg-amber-500 text-white shadow-sm dark:bg-amber-400 dark:text-[#0A0E1A]"}`}>
                                    {CONQUEROR_ART ? <img src={CONQUEROR_ART} alt="" className="h-12 w-12" /> : <WorldConquerorIcon size={30} aria-hidden />}
                                    <Crown size={18} className="absolute -right-2 -top-2.5 rotate-12 fill-amber-300 text-amber-600 dark:fill-amber-200 dark:text-amber-500" aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300">World Conqueror</span>
                                    <span className="block text-lg font-extrabold leading-tight">
                                        Season champion
                                    </span>
                                    <span className={`block truncate text-xs ${muted}`}>
                                        {wins.length === 1 ? "Season" : "Seasons"} {wins.map(w => w.number).sort((a, b) => a - b).join(", ")}
                                    </span>
                                    <span className={`block truncate text-xs ${muted}`}>
                                        Best: {Math.max(...wins.map(w => w.territories))} territories
                                    </span>
                                </span>
                                <span className="text-3xl font-extrabold tabular-nums text-amber-600 dark:text-amber-300">×{wins.length}</span>
                            </Link>
                        </li>
                    )}
                    {records.map(r => (
                        <li key={r.board}>
                            <RecordCard record={r} />
                        </li>
                    ))}
                </ul>
            )}
        </>
    )
}

function RecordCard({ record }: { record: HeldRecord }) {
    const game = RECORD_GAMES[record.game]
    const Icon = RECORD_ICONS[record.game]
    const art = RECORD_ART[record.game]
    return (
        <Link to={game.to} className={`${panel} flex h-full items-center gap-4 p-4 hover:border-slate-400 dark:hover:border-[#3A4670]`}>
            <span className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${art ? "bg-slate-100 dark:bg-[#1C2338]" : "bg-slate-900 text-white dark:bg-white dark:text-[#0A0E1A]"}`}>
                {art ? <img src={art} alt="" className="h-12 w-12" /> : <Icon size={28} aria-hidden />}
                <span className="absolute -bottom-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-amber-500 px-1 text-[11px] font-extrabold text-white dark:border-[#0F1424]">1</span>
            </span>
            <span className="min-w-0 flex-1">
                <span className={`block text-[11px] font-bold uppercase tracking-[0.08em] ${muted}`}>{game.title}</span>
                <span className="block truncate text-lg font-extrabold leading-tight">{record.label}</span>
                <span className={`block text-xs ${muted}`}>
                    {record.field > 1 ? `1st of ${record.field}` : "Only entry"} · {record.mistakes} {record.mistakes === 1 ? "mistake" : "mistakes"}
                </span>
            </span>
            <span className="font-mono text-xl font-bold tabular-nums">{formatRunTime(record.seconds, game.tenths)}</span>
        </Link>
    )
}

/** Under 5% of players: worth pointing out. */
const RARE_SHARE = 0.05

/**
 * "4.2% of players" - for the tier held, or bronze while it is locked, the way
 * Steam shows every achievement's share whether you have it or not.
 */
function Rarity({ share, label, className = "" }: { share: number | null; label: string; className?: string }) {
    if (share === null) return null
    const rare = share < RARE_SHARE
    return (
        <span
            title={`${formatShare(share)} of players have ${label}`}
            className={`block text-[10px] tabular-nums ${rare ? "font-bold text-slate-900 dark:text-white" : muted} ${className}`}
        >
            {formatShare(share)} of players
        </span>
    )
}

function BadgeCard({ track, value, stats, onOpen }: { track: Track; value: number; stats: BadgeStats | null; onOpen: () => void }) {
    const tier = tierOf(track, value)
    const target = track.tiers[Math.min(tier, 3)]
    const complete = tier >= 4
    const shown = Math.max(tier, 1)
    return (
        <button
            type="button"
            onClick={onOpen}
            className={`${panel} flex h-full min-h-0 w-full flex-col items-center p-2 pb-2.5 text-center font-normal hover:border-slate-400 dark:hover:border-[#3A4670] ${tier === 0 ? "border-dashed" : ""}`}
        >
            <BadgeMedal id={track.id} tier={tier} size={44} className="my-1" />
            <span className="mt-0.5 block text-xs font-bold leading-tight">{track.title}</span>
            <span className={`mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.06em] ${muted}`}>{TIER_NAMES[tier]}</span>
            <span className="mt-1.5 block w-full">
                <Bar share={complete ? 1 : value / target} tone={complete ? "bg-amber-500 dark:bg-amber-400" : undefined} />
            </span>
            <span className={`mt-1 block text-[10px] tabular-nums ${muted}`}>
                {complete ? "Complete" : `${value.toLocaleString()} / ${target.toLocaleString()}`}
            </span>
            <Rarity
                share={rarityOf(stats, track.id, shown)}
                label={`${track.title} ${TIER_NAMES[shown]}`}
                className="mt-1 w-full border-t border-slate-200 pt-1 dark:border-[#1C2338]"
            />
        </button>
    )
}

function TrackSheet({ track, store, stats, onClose }: { track: Track; store: ProfileStore; stats: BadgeStats | null; onClose: () => void }) {
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
                            <Rarity share={rarityOf(stats, track.id, i + 1)} label={`${track.title} ${TIER_NAMES[i + 1]}`} className="mt-1" />
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
                            <img src={f.image} alt="" loading="lazy" className="aspect-[3/2] w-full object-contain" />
                        </button>
                    ))}
                </div>
            )}
        </Overlay>
    )
}

const DAY_MS = 86_400_000
/** The calendar never grows past half a year; older weeks drop off the left. */
const MAX_WEEKS = 26
const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""]

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`

/**
 * What the player did and when. The raw number per day is a count of progress
 * events - meaningless to read - so the numbers shown are days played, this
 * week, the run of days in a row and dailies finished; the calendar only says
 * "a little" or "a lot". It starts the week the profile did (nothing before was
 * recorded) and sits left, under its title, growing to the right.
 */
function Activity({ days, dailies, since }: { days: Record<string, number>; dailies: Record<string, string[]>; since: string }) {
    const view = useMemo(() => {
        const today = todayUtc()
        const end = Date.parse(`${today}T00:00:00Z`)
        const monday = (ms: number) => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS
        const sinceMs = Date.parse(`${since}T00:00:00Z`)
        const lastWeek = monday(end)
        const firstWeek = Math.max(Number.isNaN(sinceMs) ? lastWeek : monday(Math.min(sinceMs, end)), lastWeek - (MAX_WEEKS - 1) * 7 * DAY_MS)
        const weeks = Math.round((lastWeek - firstWeek) / (7 * DAY_MS)) + 1

        const cells: { date: string; level: number; hidden: boolean; done: number }[] = []
        const months: { col: number; label: string }[] = []
        for (let w = 0; w < weeks; w++) {
            const weekStart = firstWeek + w * 7 * DAY_MS
            // A month is labelled over the first week that holds its 1st (or over the first week shown).
            const firstOfMonth = Array.from({ length: 7 }, (_, d) => new Date(weekStart + d * DAY_MS)).find(d => d.getUTCDate() === 1)
            const labelDay = firstOfMonth ?? (w === 0 ? new Date(weekStart) : undefined)
            if (labelDay) months.push({ col: w, label: labelDay.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }) })
            for (let d = 0; d < 7; d++) {
                const t = weekStart + d * DAY_MS
                const date = dayOf(t)
                const n = days[date] ?? 0
                cells.push({ date, level: n === 0 ? 0 : n < 3 ? 1 : n < 8 ? 2 : n < 20 ? 3 : 4, hidden: t > end || date < since, done: dailies[date]?.length ?? 0 })
            }
        }
        // Two labels in neighbouring columns would overprint each other; the later month wins.
        const monthLabels = months.filter((m, i) => !months[i + 1] || months[i + 1].col - m.col >= 3)

        const active = new Set(Object.keys(days).filter(d => (days[d] ?? 0) > 0))
        let thisWeek = 0
        for (let t = lastWeek; t <= end; t += DAY_MS) if (active.has(dayOf(t))) thisWeek++
        // Today not played yet does not break the run - the day is not over.
        let streak = 0
        for (let t = active.has(today) ? end : end - DAY_MS; active.has(dayOf(t)); t -= DAY_MS) streak++
        let best = 0
        let run = 0
        let prev = NaN
        for (const d of [...active].sort()) {
            const t = Date.parse(`${d}T00:00:00Z`)
            run = t - prev === DAY_MS ? run + 1 : 1
            best = Math.max(best, run)
            prev = t
        }
        const dailyCount = Object.values(dailies).reduce((sum, list) => sum + list.length, 0)
        return { cells, weeks, monthLabels, played: active.size, thisWeek, daysThisWeek: Math.round((end - lastWeek) / DAY_MS) + 1, streak, best, dailyCount }
    }, [days, dailies, since])

    const tone = ["bg-slate-200 dark:bg-[#1C2338]", "bg-blue-200 dark:bg-[#1d3a6b]", "bg-blue-400 dark:bg-[#2559a8]", "bg-blue-500 dark:bg-blue-500", "bg-blue-700 dark:bg-blue-300"]
    const stats: [string, string, string?][] = [
        ["Days played", view.played.toLocaleString()],
        ["This week", `${view.thisWeek} / ${view.daysThisWeek}`, "days"],
        ["In a row", view.streak.toLocaleString(), view.best > view.streak ? `best ${plural(view.best, "day")}` : view.streak === 1 ? "day" : "days"],
        ["Dailies done", view.dailyCount.toLocaleString()],
    ]
    const cell = 13
    const gap = 3
    return (
        <div>
            <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold">Activity</span>
                <span className={`text-xs ${muted}`}>since {shortDate(since)}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {stats.map(([label, value, unit]) => (
                    <div key={label} className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-[#141A2C]">
                        <dt className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${muted}`}>{label}</dt>
                        <dd className="text-lg font-extrabold tabular-nums leading-tight">
                            {value} {unit && <span className={`text-xs font-semibold ${muted}`}>{unit}</span>}
                        </dd>
                    </div>
                ))}
            </dl>
            <div className="mt-4 overflow-x-auto">
                <div className="inline-grid gap-x-2" style={{ gridTemplateColumns: "auto auto" }}>
                    <span />
                    <div className="relative h-4" style={{ width: view.weeks * (cell + gap) - gap }}>
                        {view.monthLabels.map(m => (
                            <span key={m.col} className={`absolute top-0 text-[11px] leading-none ${muted}`} style={{ left: m.col * (cell + gap) }}>
                                {m.label}
                            </span>
                        ))}
                    </div>
                    <div className={`grid text-[10px] leading-none ${muted}`} style={{ gridTemplateRows: `repeat(7, ${cell}px)`, rowGap: gap }}>
                        {WEEKDAY_LABELS.map((l, i) => (
                            <span key={i} className="flex items-center">{l}</span>
                        ))}
                    </div>
                    <div className="grid grid-flow-col" style={{ gridTemplateRows: `repeat(7, ${cell}px)`, gridAutoColumns: `${cell}px`, gap }}>
                        {view.cells.map(c => (
                            <span
                                key={c.date}
                                title={c.hidden ? undefined : `${shortDate(c.date)} · ${c.level === 0 ? "not played" : "played"}${c.done ? ` · ${c.done} ${c.done === 1 ? "daily" : "dailies"}` : ""}`}
                                className={`rounded-[3px] ${c.hidden ? "opacity-0" : tone[c.level]}`}
                            />
                        ))}
                    </div>
                </div>
            </div>
            <div className={`mt-2 flex items-center gap-1 text-[11px] ${muted}`}>
                <span className="mr-1">Less</span>
                {tone.map(t => (
                    <span key={t} className={`h-[11px] w-[11px] rounded-[2px] ${t}`} />
                ))}
                <span className="ml-1">More</span>
            </div>
        </div>
    )
}

/** Milestones shown before the list starts to scroll. */
const MILESTONES_SHOWN = 5

/**
 * Caps the scroll box at the bottom of its fifth entry, measured rather than
 * guessed, so exactly five show whatever the font does. A callback ref, as the
 * list mounts only once there is a badge.
 */
function fitMilestones(box: HTMLDivElement | null) {
    if (!box) return
    const fit = () => {
        const items = box.querySelectorAll<HTMLElement>("ol > li")
        if (items.length <= MILESTONES_SHOWN) {
            box.style.maxHeight = ""
            return
        }
        const bottom = items[MILESTONES_SHOWN - 1].getBoundingClientRect().bottom
        box.style.maxHeight = `${Math.ceil(bottom - box.getBoundingClientRect().top + box.scrollTop) + 6}px`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(box)
    return () => observer.disconnect()
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
        <div className="mt-8">
            <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold">Milestones</span>
                {dated.length + (before.length ? 1 : 0) > MILESTONES_SHOWN && <span className={`text-xs ${muted}`}>Scroll for older</span>}
            </div>
            {/* The scroll box wraps the list, not the other way round: the timeline line is drawn on the
                list, and on the scroll box itself it would be only as tall as the visible part. */}
            <div
                ref={fitMilestones}
                tabIndex={0}
                aria-label="Milestones"
                className="mt-3 overflow-y-auto overscroll-contain pr-1 outline-none [scrollbar-width:thin] focus-visible:ring-2 focus-visible:ring-blue-500"
            >
                <ol className="relative flex flex-col gap-4 pl-6 before:absolute before:bottom-1 before:left-[7px] before:top-1 before:w-0.5 before:bg-slate-200 dark:before:bg-[#1C2338]">
                    {dated.map(e => (
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
        ["Daily Trivia streak", readStreak(STREAK_KEYS.trivia).best, days],
        ["Rally streak", readStreak(STREAK_KEYS.rally).best, days],
        ["Landmarks streak", readStreak(STREAK_KEYS.landmarks).best, days],
        ["World Trivia best score", store.records.trivia ?? 0, n => `${n.toLocaleString()} pts`],
        ["Right answers in a row", store.records["sharp-eye"] ?? 0, n => n.toLocaleString()],
        ["Higher or Lower run", store.records["higher-lower"] ?? 0, n => n.toLocaleString()],
        ["Capitals in range in a row", store.records.pinpoint ?? 0, n => n.toLocaleString()],
        ["Flags named in a row (Road Trip)", log.streak.best, n => n.toLocaleString()],
        ["Best drift", Math.round(log.drift.best), n => `${n.toLocaleString()} pts`],
    ]
    const rows = all.filter(([, n]) => n > 0).map(([label, n, format]) => [label, format(n)])
    return (
        <div className={`${panel} relative p-5`}>
            <SnowCap seed="profile-records" />
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
