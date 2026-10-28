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
import { motion, AnimatePresence } from "framer-motion"
import { ComposableMap, Geographies, Geography, Line, ZoomableGroup } from "react-simple-maps"
import {
    Bot as BotIcon, Link2, Loader2, Trophy, Users,
    WifiOff, Flag, Ban, Sparkles,
} from "lucide-react"
import TopBar from "../components/TopBar"
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
import { bumpCounter } from "../utils/profileStore"

const geoUrl = "/world-map.json"
const MAP_WIDTH = 800
const MAP_HEIGHT = 600
const THEME_KEY = "flag-master-theme"
const NAME_KEY = "flag-master-nickname"

/** How much of the chain still glows behind the current country. */
const TRAIL_LENGTH = 12

type Feedback = { text: string; tone: "good" | "bad" | "warn" }

/* The flag-wall chrome: flat panels and quiet controls, so the map and the flags stay the colour. */
const PANEL = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
const CHIP = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold dark:border-slate-700 dark:bg-slate-800"
const INPUT = "w-full rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-[#4A5680]"
const LABEL = "text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500"

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
            setFeedback({ text: "So close - check your spelling.", tone: "warn" })
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
            bumpCounter("border-chain")
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
                <div className={`${PANEL} mx-4 mt-16 p-8 text-center sm:mx-auto sm:max-w-md`}>
                    <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        <WifiOff size={24} aria-hidden />
                    </span>
                    <h2 className="!text-xl font-bold">The table is unreachable</h2>
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
            <div className="mx-auto w-full max-w-[1120px] px-4 pb-12 pt-6 sm:px-6">
                <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="!text-[clamp(1.75rem,3.5vw,2.25rem)] font-extrabold !leading-[1.05] !tracking-[-0.03em]">Border Chain</h1>
                        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                            Name a country that borders the last one. Always running - empty seats play themselves.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className={CHIP} title="Players at the table">
                            <Users size={15} aria-hidden className="text-slate-500 dark:text-slate-400" />
                            <span className="tabular-nums">{humans} / {TABLE_SEATS}</span>
                        </span>
                        <span className={CHIP}>
                            <Trophy size={15} aria-hidden className="text-amber-500" />
                            Record {record?.length ?? "-"}
                            {record?.by ? <span className="font-normal text-slate-500 dark:text-slate-400">· {record.by}</span> : null}
                        </span>
                    </div>
                </header>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                    <section className="relative h-[46vh] min-h-[280px] overflow-hidden rounded-[10px] border border-slate-200 lg:h-[calc(100vh-14rem)] dark:border-slate-700">
                        {board}
                        <div className={`${PANEL} pointer-events-none absolute bottom-3 left-3 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300`}>
                            {chain.length} {chain.length === 1 ? "country" : "countries"} in this chain
                        </div>
                    </section>

                    <aside className="flex flex-col gap-3">
                        <div className={`${PANEL} relative overflow-hidden p-4`}>
                            <div className="flex items-center gap-3">
                                {current && (
                                    <img
                                        key={current.image}
                                        src={current.image}
                                        alt=""
                                        className="fl-in h-11 w-16 shrink-0 rounded-[4px] object-cover shadow-[0_2px_10px_rgba(10,14,26,0.18)]"
                                    />
                                )}
                                <div className="min-w-0">
                                    <p className={LABEL}>
                                        Link from
                                    </p>
                                    <p className="truncate text-xl font-bold">{current?.name ?? "-"}</p>
                                </div>
                                <div className="ml-auto text-right">
                                    <p className={LABEL}>
                                        Ways out
                                    </p>
                                    <p className="text-xl font-bold tabular-nums">{options.length}</p>
                                </div>
                            </div>

                            <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700">
                                <div
                                    className={`h-full rounded-sm transition-[width] duration-100 ease-linear ${timerPct < 30 ? "bg-red-500" : "bg-blue-500"}`}
                                    style={{ width: `${timerPct}%` }}
                                />
                            </div>

                            {leg?.lastName && (
                                <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">
                                    Last link by <span className="font-semibold text-slate-700 dark:text-slate-200">{leg.lastName}</span>
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
                                className={`${PANEL} p-4`}
                            >
                                <p className="mb-2.5 text-sm font-semibold">Take a seat to play</p>
                                <div className="flex gap-2">
                                    <input
                                        value={nameDraft}
                                        onChange={e => setNameDraft(e.target.value)}
                                        maxLength={24}
                                        placeholder="Your name"
                                        className={`${INPUT} min-w-0 flex-1 px-3 py-2 font-medium`}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!nameDraft.trim() || !uid}
                                        className="rounded-lg bg-slate-900 px-5 py-2 font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2] dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
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
                                className={`${PANEL} p-4`}
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
                                    className={`${INPUT} px-4 py-3 text-lg font-medium disabled:cursor-not-allowed disabled:opacity-60`}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                />
                                <div className="mt-2 flex min-h-[1.25rem] items-center gap-2 text-xs">
                                    {justMoved && (
                                        <span className="inline-flex items-center gap-1 font-medium text-slate-500 dark:text-slate-400">
                                            <Ban size={13} aria-hidden /> No two links in a row
                                        </span>
                                    )}
                                    {feedback && (
                                        <span key={feedback.text} className={`fl-in ${
                                            feedback.tone === "good" ? "font-semibold text-emerald-600 dark:text-emerald-400"
                                                : feedback.tone === "warn" ? "font-semibold text-amber-600 dark:text-amber-400"
                                                    : "font-semibold text-red-600 dark:text-red-400"
                                        }`}>
                                            {feedback.text}
                                        </span>
                                    )}
                                </div>
                            </form>
                        )}

                        <div className={`${PANEL} p-1.5`}>
                            {table.map((row, index) => (
                                <div
                                    key={row.id}
                                    className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${row.id === uid ? "bg-slate-50 dark:bg-slate-700/50" : ""}`}
                                >
                                    <span className="w-4 text-right text-xs font-semibold tabular-nums text-slate-400 dark:text-slate-500">
                                        {index + 1}
                                    </span>
                                    <span
                                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                                        style={{ background: row.color }}
                                    />
                                    <span className={`min-w-0 flex-1 truncate ${row.idle ? "text-slate-400 dark:text-slate-500" : "font-semibold"}`}>
                                        {row.name}
                                        {row.id === uid && <span className="ml-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">you</span>}
                                    </span>
                                    {row.bot && <BotIcon size={13} aria-label="Bot" className="shrink-0 text-slate-400 dark:text-slate-500" />}
                                    <span className="w-8 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
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
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Border Chain" theme={theme} onToggleTheme={onTheme} />
            {children}
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
        <div className="rounded-[10px] border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-300">
                <Sparkles size={16} aria-hidden /> Dead end - {chain.length} countries
            </p>
            <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
                Every neighbour is already in the chain. New chain in <span className="tabular-nums">{seconds}</span>s.
            </p>
            <div className="mt-3 flex flex-wrap gap-1">
                {chain.map((code, i) => (
                    <span
                        key={`${code}-${i}`}
                        className="rounded-[5px] border border-amber-500/25 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:text-amber-100"
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
            <p className="flex items-center gap-1.5 px-1 text-xs text-slate-500 dark:text-slate-400">
                <Flag size={12} aria-hidden />
                A fresh chain - take the first link.
            </p>
        )
    }
    return (
        <ul className={`${PANEL} divide-y divide-slate-200 px-1.5 py-1 text-xs dark:divide-slate-700`}>
            {recent.map(move => (
                <li key={move.i} className="flex items-center gap-2 px-2 py-1.5">
                    <Link2 size={12} aria-hidden className="shrink-0 text-slate-400 dark:text-slate-500" />
                    <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">{countryByCode(move.c)?.name ?? move.c}</span>
                        <span className="text-slate-500 dark:text-slate-400"> by {move.n}</span>
                    </span>
                    <span className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">+{move.p}</span>
                </li>
            ))}
        </ul>
    )
}

/**
 * Flat water, reaching far past the viewBox so a letterboxed map never shows
 * bare page down its sides. One colour, like the rest of the chrome.
 */
function Ocean({ theme }: { theme: 'light' | 'dark' }) {
    const cover = { x: -MAP_WIDTH, y: -MAP_HEIGHT, width: MAP_WIDTH * 3, height: MAP_HEIGHT * 3 }
    return (
        <g pointerEvents="none">
            <rect {...cover} fill={theme === 'dark' ? "#0B1626" : "#CFE2F3"} />
        </g>
    )
}
