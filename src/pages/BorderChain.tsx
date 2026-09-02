/**
 * Border Chain - the always-on table.
 *
 * One global chain that is already running when you arrive: name a country
 * bordering the one on the board, first correct answer takes the link, and the
 * chain moves on. Empty seats are held by bots, so the table is never waiting
 * for a second player.
 *
 * Two things about this page are deliberate and easy to "fix" by mistake:
 *
 * 1. It signs in on mount, unlike World Conqueror. The table only moves because
 *    a signed-in browser writes the bot moves, so a spectator who cannot write
 *    would sit watching a frozen chain and conclude the mode is broken. Every
 *    visitor's session is load-bearing here in a way it never is over there.
 *
 * 2. The map never marks which countries are legal answers. Knowing what
 *    borders what is the entire game; an outline around every option would be
 *    the answer sheet. It shows where the chain has been, and nothing else.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ComposableMap, Geographies, Geography, Line, ZoomableGroup } from "react-simple-maps"
import {
    ArrowLeft, Bot as BotIcon, Link2, Loader2, Moon, Sun, Trophy, Users,
    WifiOff, Flag, Ban, Sparkles,
} from "lucide-react"
import { onDisconnect, onValue, ref, remove, serverTimestamp, set, update } from "firebase/database"
import { db, ensureSignedIn } from "../../lib/firebase"
import { centroidOf, countryByCode } from "../utils/countryPool"
import { codeForGeoName, pickColorIndex, seaRoutesOf } from "../utils/flagWars"
import {
    CONDUCTOR_GRACE_MS, LINK_MS, MAX_LINKS, PRESENCE_PING_MS, TABLE_SEATS, WRONG_LOCKOUT_MS,
    botAttempt, conductorOf, decodeChain, extendLeg, judge, legDeadline, legIsOver,
    liveHumans, openLeg, optionsFor, pointsFor, tableFrom,
    type ChainRecord, type Leg, type MoveMap, type PresenceMap,
} from "../utils/borderChain"

const geoUrl = "/world-map.json"
const MAP_WIDTH = 800
const MAP_HEIGHT = 600
const THEME_KEY = "flag-master-theme"
const NAME_KEY = "flag-master-nickname"

/** How much of the chain still glows behind the current country. */
const TRAIL_LENGTH = 12

type Feedback = { text: string; tone: "good" | "bad" | "warn" }

export default function BorderChain() {
    const [theme, setTheme] = useState<'light' | 'dark'>(
        () => (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light',
    )

    const [uid, setUid] = useState<string | null>(null)
    const [offline, setOffline] = useState(false)
    const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || "")
    const [seated, setSeated] = useState(false)
    const [nameDraft, setNameDraft] = useState(() => localStorage.getItem(NAME_KEY) || "")

    const [leg, setLeg] = useState<Leg | null>(null)
    const [moves, setMoves] = useState<MoveMap>({})
    const [presence, setPresence] = useState<PresenceMap>({})
    const [record, setRecord] = useState<ChainRecord | null>(null)
    const [loaded, setLoaded] = useState(false)

    const [input, setInput] = useState("")
    const [feedback, setFeedback] = useState<Feedback | null>(null)
    const [lockedUntil, setLockedUntil] = useState(0)
    const [gained, setGained] = useState<{ points: number; at: number } | null>(null)

    const [zoom, setZoom] = useState(2)

    /**
     * Every deadline in this mode is a server timestamp, so a client with a
     * skewed clock would either fire its bot moves early or think a live chain
     * had already expired. Firebase publishes the difference; everything below
     * measures time with it.
     */
    const [skew, setSkew] = useState(0)
    const [now, setNow] = useState(() => Date.now())

    const inputRef = useRef<HTMLInputElement>(null)
    /** Which (leg, link) this client has already tried to write, so a rejected write is not retried every tick. */
    const attempted = useRef<string>("")
    const writing = useRef(false)

    useEffect(() => {
        const root = document.documentElement
        if (theme === 'dark') root.classList.add('dark')
        else root.classList.remove('dark')
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    // --- Session -------------------------------------------------------------

    useEffect(() => {
        let alive = true
        ensureSignedIn()
            .then(user => { if (alive) setUid(user.uid) })
            .catch(() => { if (alive) setOffline(true) })
        return () => { alive = false }
    }, [])

    // --- Subscriptions -------------------------------------------------------

    useEffect(() => {
        const stopSkew = onValue(ref(db, ".info/serverTimeOffset"), snap => {
            setSkew(typeof snap.val() === "number" ? snap.val() : 0)
        })
        const stopLeg = onValue(
            ref(db, "borderChain/leg"),
            snap => { setLeg(snap.val() as Leg | null); setLoaded(true) },
            () => setOffline(true),
        )
        const stopPresence = onValue(ref(db, "borderChain/presence"), snap => {
            setPresence((snap.val() as PresenceMap) || {})
        })
        const stopRecord = onValue(ref(db, "borderChain/record"), snap => {
            setRecord(snap.val() as ChainRecord | null)
        })
        return () => { stopSkew(); stopLeg(); stopPresence(); stopRecord() }
    }, [])

    const legId = leg?.id ?? ""
    const currentCode = leg?.current ?? ""
    const chainString = leg?.chain ?? ""

    useEffect(() => {
        if (!legId) return
        // Not cleared first: that would be a setState straight out of an effect
        // body, and the subscription replaces the map on its first callback
        // anyway - one round trip of the previous chain's feed, not a bug.
        return onValue(ref(db, `borderChain/moves/${legId}`), snap => {
            setMoves((snap.val() as MoveMap) || {})
        })
    }, [legId])

    useEffect(() => {
        const tick = setInterval(() => setNow(Date.now()), 100)
        return () => clearInterval(tick)
    }, [])

    const serverNow = now + skew

    // --- Taking a seat -------------------------------------------------------

    const colorIndex = useMemo(() => (uid ? pickColorIndex(uid) : 0), [uid])

    useEffect(() => {
        if (!uid || !seated || !name) return
        const row = ref(db, `borderChain/presence/${uid}`)
        const announce = () => {
            set(row, { name, color: colorIndex, at: serverTimestamp() }).catch(() => {})
        }
        announce()
        // onDisconnect covers a closed tab; the refresh covers the case where it
        // never fires - a killed process, a laptop lid - and the row would
        // otherwise hold a seat for ever.
        onDisconnect(row).remove().catch(() => {})
        const ping = setInterval(announce, PRESENCE_PING_MS)
        return () => { clearInterval(ping); remove(row).catch(() => {}) }
    }, [uid, seated, name, colorIndex])

    function takeSeat(e: React.FormEvent) {
        e.preventDefault()
        const trimmed = nameDraft.trim().slice(0, 24)
        if (!trimmed) return
        localStorage.setItem(NAME_KEY, trimmed)
        setName(trimmed)
        setSeated(true)
        setTimeout(() => inputRef.current?.focus(), 50)
    }

    // --- Derived table state -------------------------------------------------

    /**
     * Presence expiry is checked on a coarse clock. On the 100ms tick the head
     * count would flicker the moment a row aged out, and the bot line-up is
     * derived from it - the table would visibly reshuffle between two links.
     */
    const coarse = Math.floor(serverNow / 10_000)
    const humans = useMemo(
        () => liveHumans(presence, coarse * 10_000).length,
        [presence, coarse],
    )
    const table = useMemo(
        () => tableFrom(leg, moves, presence, coarse * 10_000),
        [leg, moves, presence, coarse],
    )

    const options = useMemo(() => optionsFor(leg), [leg])
    const deadEnd = options.length === 0 && !!leg
    const over = legIsOver(leg, serverNow)
    const chain = useMemo(() => decodeChain(chainString), [chainString])
    const current = leg ? countryByCode(leg.current) : undefined
    const msLeft = Math.max(0, legDeadline(leg) - serverNow)

    const conductor = useMemo(
        () => conductorOf(presence, coarse * 10_000, uid),
        [presence, coarse, uid],
    )
    const amConductor = !!uid && conductor === uid
    const botPlan = useMemo(
        () => botAttempt(leg, humans),
        [leg, humans],
    )

    const justMoved = !!uid && leg?.lastBy === uid
    const locked = serverNow < lockedUntil
    const canAnswer = !!uid && seated && !!leg && !over && !deadEnd && !justMoved && !locked

    // --- Writing -------------------------------------------------------------

    const claim = useCallback(async (
        code: string,
        by: string,
        byName: string,
        at: number,
    ): Promise<boolean> => {
        if (!leg || writing.current) return false
        writing.current = true
        const next = extendLeg(leg, code, by, byName)
        const points = pointsFor(code, Math.max(0, at - leg.lastMoveAt))
        try {
            await update(ref(db, "borderChain"), {
                leg: { ...next, lastMoveAt: serverTimestamp() },
                [`moves/${leg.id}/${next.seq}`]: { i: next.seq, c: code, by, n: byName, p: points },
            })
            return true
        } catch {
            return false
        } finally {
            writing.current = false
        }
    }, [leg])

    /**
     * Retires the finished chain and opens the next one. The record goes in
     * first, while the finished leg is still the one in the database - the
     * rules check the claimed length against it, which is the only way they can
     * tell a real record from a number somebody typed.
     */
    const rollLeg = useCallback(async (finished: Leg | null) => {
        if (writing.current) return
        writing.current = true
        try {
            const length = (finished?.seq ?? 0) + 1
            if (finished && finished.seq > 0 && length > (record?.length ?? 0)) {
                await set(ref(db, "borderChain/record"), {
                    length,
                    legId: finished.id,
                    at: serverTimestamp(),
                    by: finished.lastName || "Anonymous",
                }).catch(() => {})
            }
            const fresh = openLeg(finished?.id)
            await set(ref(db, "borderChain/leg"), {
                ...fresh,
                startedAt: serverTimestamp(),
                lastMoveAt: serverTimestamp(),
            })
            if (finished) remove(ref(db, `borderChain/moves/${finished.id}`)).catch(() => {})
        } catch {
            // Somebody else opened the next chain first; their write is the one
            // that counts and this client is already watching it.
        } finally {
            writing.current = false
        }
    }, [record])

    /**
     * The engine room. Every client runs it, the conductor acts first and the
     * rest cover after a grace period, and the database rules make the losers
     * of that race no-ops: a move must be exactly one link on from what is
     * stored, so a duplicate is rejected rather than applied twice.
     */
    useEffect(() => {
        if (!uid || !loaded || writing.current) return
        const grace = amConductor ? 0 : CONDUCTOR_GRACE_MS

        if (!leg) {
            if (attempted.current === "open") return
            attempted.current = "open"
            void rollLeg(null)
            return
        }

        if (over) {
            // A full chain is over the moment the last link lands; an expired
            // one only once its clock has run out.
            const readyAt = leg.seq >= MAX_LINKS ? leg.lastMoveAt : legDeadline(leg)
            if (serverNow < readyAt + grace) return
            // Bucketed, so a roll that failed for a reason nothing here can see
            // is retried every ten seconds rather than once. Without it a table
            // where every client had already tried would stay frozen for good.
            const key = `roll:${leg.id}:${Math.floor(serverNow / 10_000)}`
            if (attempted.current === key) return
            attempted.current = key
            void rollLeg(leg)
            return
        }

        if (botPlan && serverNow >= botPlan.at + grace) {
            const key = `${leg.id}:${leg.seq}:${botPlan.bot.id}`
            if (attempted.current === key) return
            attempted.current = key
            void claim(botPlan.code, botPlan.bot.id, botPlan.bot.name, botPlan.at)
        }
    }, [uid, loaded, leg, over, serverNow, amConductor, botPlan, claim, rollLeg])

    // --- Answering -----------------------------------------------------------

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        if (!canAnswer || !leg || !uid) return
        const verdict = judge(input, leg)

        if (verdict.kind === "typo") {
            setFeedback({ text: "So close - check your spelling. ✏️", tone: "warn" })
            return
        }
        if (verdict.kind === "used") {
            setFeedback({
                text: `${countryByCode(verdict.code)?.name} is already in the chain.`,
                tone: "warn",
            })
            setInput("")
            return
        }
        if (verdict.kind === "far") {
            setFeedback({
                text: `${countryByCode(verdict.code)?.name} does not border ${current?.name}.`,
                tone: "bad",
            })
            setInput("")
            setLockedUntil(serverNow + WRONG_LOCKOUT_MS)
            return
        }
        if (verdict.kind === "unknown") {
            setFeedback({ text: "No country by that name.", tone: "bad" })
            setLockedUntil(serverNow + WRONG_LOCKOUT_MS)
            return
        }

        setInput("")
        const points = pointsFor(verdict.code, Math.max(0, serverNow - leg.lastMoveAt))
        const won = await claim(verdict.code, uid, name, serverNow)
        if (won) {
            setFeedback({ text: `${countryByCode(verdict.code)?.name} linked!`, tone: "good" })
            setGained({ points, at: Date.now() })
        } else {
            setFeedback({ text: "Too slow - somebody else took that link.", tone: "warn" })
        }
    }

    useEffect(() => {
        if (!feedback) return
        const clear = setTimeout(() => setFeedback(null), 3200)
        return () => clearTimeout(clear)
    }, [feedback])

    useEffect(() => {
        if (!gained) return
        const clear = setTimeout(() => setGained(null), 1400)
        return () => clearTimeout(clear)
    }, [gained])

    // --- Board ---------------------------------------------------------------

    const chainIndex = useMemo(() => {
        const index = new Map<string, number>()
        chain.forEach((code, i) => index.set(code, i))
        return index
    }, [chain])

    const center = useMemo<[number, number]>(
        () => centroidOf(currentCode) ?? [10, 25],
        [currentCode],
    )

    const neutralFill = theme === 'dark' ? "#334458" : "#eef3f8"
    const neutralStroke = theme === 'dark' ? "#54677e" : "#a9bccd"

    const board = useMemo(() => (
        <ComposableMap
            projection="geoMercator"
            projectionConfig={{ scale: 140 }}
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            style={{ width: "100%", height: "100%", outline: "none" }}
        >
            <Ocean theme={theme} />
            <ZoomableGroup
                center={center}
                zoom={zoom}
                onMoveEnd={next => setZoom(next.zoom)}
                maxZoom={10}
                minZoom={1}
                translateExtent={[[-100, -100], [900, 700]]}
            >
                <Geographies geography={geoUrl}>
                    {({ geographies }) =>
                        geographies.map(geo => {
                            const code = codeForGeoName(geo.properties?.name || "")
                            const position = code ? chainIndex.get(code) : undefined
                            const isCurrent = !!code && code === leg?.current
                            // Older links fade out so the chain reads as a path
                            // with a direction, not a blob of claimed land.
                            const age = position === undefined
                                ? 0
                                : Math.max(0, 1 - (chain.length - 1 - position) / TRAIL_LENGTH)

                            const fill = isCurrent
                                ? "#f59e0b"
                                : position !== undefined
                                    ? (theme === 'dark' ? "#7c3aed" : "#8b5cf6")
                                    : neutralFill

                            return (
                                <Geography
                                    key={geo.rsmKey}
                                    geography={geo}
                                    style={{
                                        default: {
                                            fill,
                                            fillOpacity: isCurrent ? 1 : position !== undefined ? 0.35 + age * 0.6 : 1,
                                            stroke: isCurrent ? (theme === 'dark' ? "#fef3c7" : "#78350f") : neutralStroke,
                                            strokeWidth: isCurrent ? 0.6 : 0.15,
                                            outline: "none",
                                            transition: "fill 400ms, fill-opacity 400ms",
                                        },
                                        hover: { fill, stroke: neutralStroke, strokeWidth: 0.2, outline: "none" },
                                        pressed: { fill, stroke: neutralStroke, strokeWidth: 0.2, outline: "none" },
                                    }}
                                />
                            )
                        })
                    }
                </Geographies>

                {/*
                  * The crossings out of the current country. A political map
                  * shows land borders and hides everything else, so without
                  * these the board would quietly claim Indonesia has no way
                  * out to Australia. They are drawn unlabelled: that a sea
                  * route exists is fair information, which country sits at the
                  * far end is the answer.
                  */}
                {leg && seaRoutesOf(leg.current).map(route => (
                    <Line
                        key={`${leg.current}-${route.to}`}
                        from={route.from}
                        to={route.at}
                        stroke="#0ea5e9"
                        strokeWidth={1.4 / zoom}
                        strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                        strokeLinecap="round"
                        opacity={0.85}
                        fill="none"
                    />
                ))}
            </ZoomableGroup>
        </ComposableMap>
    ), [theme, center, zoom, chainIndex, chain.length, leg, neutralFill, neutralStroke])

    // --- Screens -------------------------------------------------------------

    if (offline) {
        return (
            <Shell theme={theme} onTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
                <div className="mx-auto mt-24 max-w-md rounded-3xl border border-white/70 bg-white/80 p-8 text-center shadow-xl backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-800/80">
                    <WifiOff className="mx-auto mb-4 text-slate-400" size={40} />
                    <h2 className="text-xl font-bold">The table is unreachable</h2>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        Border Chain needs Firebase anonymous auth and the <code>borderChain</code> rules.
                        Every other mode works without them.
                    </p>
                </div>
            </Shell>
        )
    }

    if (!loaded) {
        return (
            <Shell theme={theme} onTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
                <div className="mt-32 flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
                    <Loader2 className="animate-spin" size={32} />
                    <p>Finding the table...</p>
                </div>
            </Shell>
        )
    }

    const timerPct = Math.max(0, Math.min(100, (msLeft / LINK_MS) * 100))

    return (
        <Shell theme={theme} onTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
            <div className="mx-auto w-full max-w-6xl px-4 pb-12">
                <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Border Chain</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Name a country that borders the last one. Always running - empty seats play themselves.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 font-semibold shadow-sm ring-1 ring-white/70 dark:bg-slate-800/80 dark:ring-slate-700/70">
                            <Users size={15} className="text-sky-500" />
                            {humans} / {TABLE_SEATS}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 font-semibold shadow-sm ring-1 ring-white/70 dark:bg-slate-800/80 dark:ring-slate-700/70">
                            <Trophy size={15} className="text-amber-500" />
                            Record {record?.length ?? "-"}
                            {record?.by ? <span className="font-normal text-slate-400">· {record.by}</span> : null}
                        </span>
                    </div>
                </header>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                    <section className="relative h-[46vh] min-h-[280px] overflow-hidden rounded-3xl border border-white/70 shadow-[0_18px_40px_rgba(15,23,42,0.16)] lg:h-[calc(100vh-13rem)] dark:border-slate-700/70">
                        {board}
                        <div className="pointer-events-none absolute bottom-3 left-3 rounded-2xl bg-white/85 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm backdrop-blur dark:bg-slate-900/85 dark:text-slate-300">
                            {chain.length} {chain.length === 1 ? "country" : "countries"} in this chain
                        </div>
                    </section>

                    <aside className="flex flex-col gap-3">
                        <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/85 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-800/85">
                            <div className="flex items-center gap-3">
                                {current && (
                                    <img
                                        src={current.image}
                                        alt=""
                                        className="h-10 w-14 rounded-md object-cover shadow ring-1 ring-black/10"
                                    />
                                )}
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                        Link from
                                    </p>
                                    <p className="truncate text-xl font-bold">{current?.name ?? "-"}</p>
                                </div>
                                <div className="ml-auto text-right">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                        Ways out
                                    </p>
                                    <p className="text-xl font-bold tabular-nums">{options.length}</p>
                                </div>
                            </div>

                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                <div
                                    className={`h-full rounded-full transition-[width] duration-100 ease-linear ${timerPct < 30 ? "bg-rose-500" : "bg-sky-500"}`}
                                    style={{ width: `${timerPct}%` }}
                                />
                            </div>

                            {leg?.lastName && (
                                <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">
                                    Last link by <span className="font-semibold">{leg.lastName}</span>
                                </p>
                            )}

                            <AnimatePresence>
                                {gained && (
                                    <motion.span
                                        key={gained.at}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: -14 }}
                                        exit={{ opacity: 0 }}
                                        className="pointer-events-none absolute right-4 top-10 text-2xl font-black text-emerald-500"
                                    >
                                        +{gained.points}
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </div>

                        {deadEnd ? (
                            <DeadEnd chain={chain} seconds={Math.ceil(msLeft / 1000)} />
                        ) : !seated ? (
                            <form
                                onSubmit={takeSeat}
                                className="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-800/85"
                            >
                                <p className="mb-2 text-sm font-semibold">Take a seat to play</p>
                                <div className="flex gap-2">
                                    <input
                                        value={nameDraft}
                                        onChange={e => setNameDraft(e.target.value)}
                                        maxLength={24}
                                        placeholder="Your name"
                                        className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-sky-400 dark:border-slate-600 dark:bg-slate-900"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!nameDraft.trim() || !uid}
                                        className="rounded-xl bg-sky-500 px-4 py-2 font-semibold text-white shadow disabled:opacity-40"
                                    >
                                        Sit
                                    </button>
                                </div>
                                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                    You can watch without sitting - the chain keeps moving either way.
                                </p>
                            </form>
                        ) : (
                            <form
                                onSubmit={submit}
                                className="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-800/85"
                            >
                                <input
                                    ref={inputRef}
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    disabled={!canAnswer}
                                    placeholder={
                                        justMoved ? "You took the last link - somebody else's turn"
                                            : locked ? "Locked out for a moment..."
                                                : `A country bordering ${current?.name ?? "..."}`
                                    }
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-lg outline-none focus:border-sky-400 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                />
                                <div className="mt-2 flex min-h-[1.25rem] items-center gap-2 text-xs">
                                    {justMoved && (
                                        <span className="inline-flex items-center gap-1 font-medium text-slate-500 dark:text-slate-400">
                                            <Ban size={13} /> No two links in a row
                                        </span>
                                    )}
                                    {feedback && (
                                        <span className={
                                            feedback.tone === "good" ? "font-semibold text-emerald-600 dark:text-emerald-400"
                                                : feedback.tone === "warn" ? "font-semibold text-amber-600 dark:text-amber-400"
                                                    : "font-semibold text-rose-600 dark:text-rose-400"
                                        }>
                                            {feedback.text}
                                        </span>
                                    )}
                                </div>
                            </form>
                        )}

                        <div className="rounded-3xl border border-white/70 bg-white/85 p-2 shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-800/85">
                            {table.map((row, index) => (
                                <div
                                    key={row.id}
                                    className={`flex items-center gap-2 rounded-2xl px-2.5 py-1.5 text-sm ${row.id === uid ? "bg-sky-50 dark:bg-sky-900/30" : ""}`}
                                >
                                    <span className="w-4 text-right text-xs font-semibold tabular-nums text-slate-400">
                                        {index + 1}
                                    </span>
                                    <span
                                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                                        style={{ background: row.color }}
                                    />
                                    <span className={`min-w-0 flex-1 truncate ${row.idle ? "text-slate-400" : "font-semibold"}`}>
                                        {row.name}
                                        {row.id === uid && <span className="ml-1 text-xs text-sky-500">you</span>}
                                    </span>
                                    {row.bot && <BotIcon size={13} className="shrink-0 text-slate-400" />}
                                    <span className="w-8 text-right text-xs tabular-nums text-slate-400">
                                        {row.links}
                                    </span>
                                    <span className="w-10 text-right font-bold tabular-nums">{row.points}</span>
                                </div>
                            ))}
                        </div>

                        <ChainFeed moves={moves} />
                    </aside>
                </div>
            </div>
        </Shell>
    )
}

// --- Pieces ------------------------------------------------------------------

function Shell({
    theme, onTheme, children,
}: { theme: 'light' | 'dark'; onTheme: () => void; children: React.ReactNode }) {
    return (
        <div className="min-h-screen pt-4 font-sans text-slate-800 transition-colors duration-500 dark:text-slate-100">
            <Link
                to="/"
                className="fixed left-4 top-4 z-20 rounded-full border border-white/70 bg-white/80 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-transform hover:scale-110 dark:border-slate-700/70 dark:bg-slate-800/80"
            >
                <ArrowLeft size={20} />
            </Link>
            <button
                onClick={onTheme}
                className="fixed right-4 top-4 z-20 rounded-full border border-white/70 bg-white/80 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-transform hover:scale-110 dark:border-slate-700/70 dark:bg-slate-800/80"
                aria-label="Toggle theme"
            >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <div className="pt-14">{children}</div>
        </div>
    )
}

/**
 * The end of a chain, and the only pause this mode has. Nobody can answer -
 * every neighbour is already used - so the link clock simply runs down while
 * the chain is on screen, and the next one opens when it hits zero.
 */
function DeadEnd({ chain, seconds }: { chain: string[]; seconds: number }) {
    return (
        <div className="rounded-3xl border border-amber-200 bg-amber-50/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-amber-700/50 dark:bg-amber-900/30">
            <p className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-300">
                <Sparkles size={16} /> Dead end - {chain.length} countries
            </p>
            <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-200/80">
                Every neighbour is already in the chain. New chain in {seconds}s.
            </p>
            <div className="mt-3 flex flex-wrap gap-1">
                {chain.map((code, i) => (
                    <span
                        key={`${code}-${i}`}
                        className="rounded-md bg-white/70 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-black/20 dark:text-amber-100"
                    >
                        {countryByCode(code)?.name ?? code}
                    </span>
                ))}
            </div>
        </div>
    )
}

function ChainFeed({ moves }: { moves: MoveMap }) {
    const recent = useMemo(
        () => Object.values(moves || {}).filter(Boolean).sort((a, b) => b.i - a.i).slice(0, 6),
        [moves],
    )
    if (recent.length === 0) {
        return (
            <p className="px-3 text-xs text-slate-400">
                <Flag size={12} className="mr-1 inline" />
                A fresh chain - take the first link.
            </p>
        )
    }
    return (
        <ul className="rounded-3xl border border-white/70 bg-white/70 p-2 text-xs shadow-sm backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-800/70">
            {recent.map(move => (
                <li key={move.i} className="flex items-center gap-2 px-2 py-1">
                    <Link2 size={12} className="shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">{countryByCode(move.c)?.name ?? move.c}</span>
                        <span className="text-slate-400"> by {move.n}</span>
                    </span>
                    <span className="tabular-nums text-slate-400">+{move.p}</span>
                </li>
            ))}
        </ul>
    )
}

function Ocean({ theme }: { theme: 'light' | 'dark' }) {
    const dark = theme === 'dark'
    const cover = { x: -MAP_WIDTH, y: -MAP_HEIGHT, width: MAP_WIDTH * 3, height: MAP_HEIGHT * 3 }
    return (
        <g pointerEvents="none">
            <defs>
                <linearGradient
                    id="bc-ocean"
                    gradientUnits="userSpaceOnUse"
                    x1={0} y1={-MAP_HEIGHT * 0.75} x2={0} y2={MAP_HEIGHT * 1.75}
                >
                    {dark ? (
                        <>
                            <stop offset="0%" stopColor="#05131f" />
                            <stop offset="60%" stopColor="#08243c" />
                            <stop offset="100%" stopColor="#0e4a75" />
                        </>
                    ) : (
                        <>
                            <stop offset="0%" stopColor="#e4f4fd" />
                            <stop offset="60%" stopColor="#bfe4f8" />
                            <stop offset="100%" stopColor="#8ecae6" />
                        </>
                    )}
                </linearGradient>
            </defs>
            <rect {...cover} fill="url(#bc-ocean)" />
        </g>
    )
}
