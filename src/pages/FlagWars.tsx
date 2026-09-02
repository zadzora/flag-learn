import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ComposableMap, Geographies, Geography, Line, Marker, ZoomableGroup } from "react-simple-maps"
import {
    ArrowLeft, Crown, Loader2, Moon, Sun, Swords, Shield, Flag, X,
    Trophy, AlertTriangle, Timer, Sparkles, ChevronDown,
} from "lucide-react"
import { ref, get, onValue, set, update, remove, runTransaction, serverTimestamp } from "firebase/database"
import { db, ensureSignedIn, observeSession } from "../../lib/firebase"
import { countryByCode } from "../utils/countryPool"
import { getTodayString, mulberry32 } from "../utils/dailySeed"
import { resolveTextAnswer, typoFeedbackForStreak } from "../utils/textAnswerMatch"
import { recordDailyResult, STREAK_KEYS } from "../utils/dailyStreak"
import {
    ALL_SEA_ROUTES, DAILY_ATTACKS, MAX_SCORE, SIEGE_HOURS, attacksLeft, attackableCodes, buildRound,
    canAttack, codeForGeoName, colorForPlayer, empireLabels, msUntilRefill, nameKey, nameTaken,
    pickColorIndex,
    defenceHeld, finishedSeasons, hallOfFameEntry, hallOfFameSeasons, resultFor, scoreForTime,
    seaRoutesOf, seasonForDate,
    siegeState, siegeTimeLeft, siegesAgainst, siegesBy,
    standingsFrom, territoriesOf,
    type HallOfFameEntry, type SeaRoute, type SeasonArchive, type SeasonResult, type Siege, type SiegeMap,
    type Standing, type TerritoryMap, type WarPlayer, type WarRound,
} from "../utils/flagWars"

const geoUrl = "/world-map.json"

/** The map's own coordinate space, before it is scaled to fit the page. */
const MAP_WIDTH = 800
const MAP_HEIGHT = 600
const THEME_KEY = "flag-master-theme"
const NAME_KEY = "flag-master-nickname"
const INTRO_KEY = "flag-master-wars-intro-seen"
/** One key per season, so last season's table is shown exactly once. */
const RESULTS_SEEN_KEY = (id: string) => `flag-master-wars-results-${id}`

/** How long the result of an attack stays on screen before the board returns. */
const RESULT_MS = 2600

/**
 * Firebase reports a rules rejection as PERMISSION_DENIED. That is a completely
 * different problem from a dropped connection - it means the write was well
 * formed and the database refused it - so it must not be reported as "check
 * your connection", which sends people looking in the wrong place entirely.
 */
function isPermissionDenied(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code ?? ""
    return /permission[_ -]?denied/i.test(code) || /permission[_ -]?denied/i.test(String(error))
}

type Outcome = {
    code: string
    kind:
        /** Empty land answered correctly - it is yours. */
        | "claimed"
        /** Empty land, wrong answer. */
        | "claim-failed"
        /** Held land - the challenge is now with its owner. */
        | "siege-opened"
        | "siege-failed"
        /** You held your ground. */
        | "defended"
        /** You were outscored and the land changed hands. */
        | "lost"
        /** The holder never answered in time. */
        | "claimed-unopposed"
        | "write-failed"
        | "write-refused"
        /** Someone else got to the same territory first. */
        | "race-claimed"
        | "race-besieged"
        /** The defence arrived after the window closed, or was no longer needed. */
        | "defence-too-late"
        | "defence-moot"
    score?: number
    otherScore?: number
    otherName?: string
}

export default function FlagWars() {
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window !== 'undefined') return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light'
        return 'light'
    })

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === 'dark') root.classList.add('dark')
        else root.classList.remove('dark')
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const season = useMemo(() => seasonForDate(), [])
    const today = useMemo(() => getTodayString(), [])

    const [uid, setUid] = useState<string | null>(null)
    const [fatalError, setFatalError] = useState<string | null>(null)
    /** Whether Firebase has reported back on any stored session yet. */
    const [authChecked, setAuthChecked] = useState(false)
    const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || "")
    const [nameDraft, setNameDraft] = useState(() => localStorage.getItem(NAME_KEY) || "")
    const [joined, setJoined] = useState(false)
    const [nameError, setNameError] = useState<string | null>(null)

    const [territories, setTerritories] = useState<TerritoryMap>({})
    const [players, setPlayers] = useState<Record<string, WarPlayer>>({})
    const [playersLoaded, setPlayersLoaded] = useState(false)
    const [usedToday, setUsedToday] = useState(0)
    const [attacksLoaded, setAttacksLoaded] = useState(false)
    const [loading, setLoading] = useState(true)

    const [selected, setSelected] = useState<string | null>(null)
    const [sieges, setSieges] = useState<SiegeMap>({})
    const [attack, setAttack] = useState<{
        code: string
        round: WarRound
        seed: number
        playerId: string
        playerName: string
        /** Empty land, held land, or answering back for land of your own. */
        mode: "claim" | "siege" | "defend"
        /** The challenge being answered, when defending. */
        siege?: Siege
    } | null>(null)
    /** A territory the player asked for before they had a name - resumed once they have one. */
    const [pendingAttack, setPendingAttack] = useState<string | null>(null)
    const [outcome, setOutcome] = useState<Outcome | null>(null)
    const [busy, setBusy] = useState(false)
    const [writeError, setWriteError] = useState<string | null>(null)

    const [showIntro, setShowIntro] = useState(() => !localStorage.getItem(INTRO_KEY))
    const [searchParams, setSearchParams] = useSearchParams()
    const [lastResult, setLastResult] = useState<SeasonResult | null>(null)
    const [hallOfFame, setHallOfFame] = useState<HallOfFameEntry[] | null>(null)
    const [loadingHall, setLoadingHall] = useState(false)
    const [showStandings, setShowStandings] = useState(false)
    const [position, setPosition] = useState({ coordinates: [10, 25] as [number, number], zoom: 1.1 })

    /**
     * How many SVG units one screen pixel is worth right now. The map is drawn
     * in a fixed 800x600 viewBox that is then scaled to fit its container, so
     * without this a label sized in units comes out twice as big on a desktop
     * as on a phone - and unreadable on the phone.
     */
    const [unitsPerPx, setUnitsPerPx] = useState(1)
    const observed = useRef<ResizeObserver | null>(null)
    // A callback ref, not an effect: the board is not in the DOM during the
    // loading spinner, so an effect that ran once on mount would find nothing
    // to observe and never look again - leaving every label sized for an
    // 800px-wide board whatever the screen actually is.
    const measureBoard = useCallback((node: HTMLDivElement | null) => {
        observed.current?.disconnect()
        observed.current = null
        if (!node) return
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect
            if (!width || !height) return
            // preserveAspectRatio defaults to "meet", so the smaller ratio wins.
            setUnitsPerPx(1 / Math.min(width / MAP_WIDTH, height / MAP_HEIGHT))
        })
        observer.observe(node)
        observed.current = observer
    }, [])

    /** Screen pixels to SVG units at the current size and zoom. */
    const px = useMemo(() => {
        const factor = unitsPerPx / position.zoom
        return (pixels: number) => pixels * factor
    }, [unitsPerPx, position.zoom])

    // --- Sign in -------------------------------------------------------------

    /**
     * Deliberately not called on mount. Reading the board is public, so someone
     * who only wants to look at the map should not have an account created for
     * them - most visitors never attack, and every one of those accounts would
     * sit in Firebase Auth forever. The identity is created on the first act
     * that actually needs one.
     */
    /**
     * Picks the existing session back up on load. This creates nothing - it only
     * reports what Firebase already restored - so a visitor who never attacks
     * still never gets an account, while a returning player is not shown an
     * empty map and a full attack budget that are both wrong.
     */
    useEffect(() => observeSession(user => {
        setUid(user ? user.uid : null)
        setAuthChecked(true)
    }), [])

    async function signIn(): Promise<string | null> {
        if (uid) return uid
        try {
            const user = await ensureSignedIn()
            setUid(user.uid)
            return user.uid
        } catch {
            setFatalError("Could not sign in. Anonymous sign-in has to be enabled for this Firebase project.")
            return null
        }
    }

    // --- Live board ----------------------------------------------------------

    useEffect(() => {
        // Without an error handler a rejected read never clears `loading`, and the
        // page sits on its spinner forever - which is exactly what happens until
        // the flagWars rules are deployed.
        const onReadFailure = () => {
            setFatalError("Could not read the board. The database rules for this mode have to be deployed for this project.")
            setLoading(false)
        }
        const stopTerritories = onValue(
            ref(db, `flagWars/${season.id}/territories`),
            snapshot => {
                setTerritories((snapshot.val() as TerritoryMap) || {})
                setLoading(false)
            },
            onReadFailure,
        )
        const stopSieges = onValue(
            ref(db, `flagWars/${season.id}/sieges`),
            snapshot => setSieges((snapshot.val() as SiegeMap) || {}),
            onReadFailure,
        )
        const stopPlayers = onValue(
            ref(db, `flagWars/${season.id}/players`),
            snapshot => {
                setPlayers((snapshot.val() as Record<string, WarPlayer>) || {})
                setPlayersLoaded(true)
            },
            onReadFailure,
        )
        return () => { stopTerritories(); stopSieges(); stopPlayers() }
    }, [season.id])

    useEffect(() => {
        if (!uid) return
        const stop = onValue(ref(db, `flagWars/${season.id}/attacks/${uid}/${today}`), snapshot => {
            setUsedToday(snapshot.val() || 0)
            setAttacksLoaded(true)
        })
        return stop
    }, [uid, season.id, today])

    const myPlayer = uid ? players[uid] : undefined
    const needsName = !!uid && !!pendingAttack && playersLoaded && !myPlayer && !joined

    const mine = useMemo(() => (uid ? territoriesOf(territories, uid) : []), [territories, uid])
    const hasEmpire = mine.length > 0
    const reachable = useMemo(() => (uid ? attackableCodes(territories, uid) : new Set<string>()), [territories, uid])
    const standings = useMemo(() => standingsFrom(territories, players), [territories, players])
    const empires = useMemo(() => empireLabels(territories, players), [territories, players])

    // One clock for the whole page, ticking on its own so the siege countdowns
    // move on an idle tab, and shared so every panel agrees on the time.
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30_000)
        return () => clearInterval(timer)
    }, [])

    /** Land of mine somebody is challenging for, and challenges I started. */
    const toDefend = useMemo(
        () => (uid ? siegesAgainst(sieges, territories, uid, now) : []),
        [sieges, territories, uid, now],
    )
    const mySieges = useMemo(() => (uid ? siegesBy(sieges, uid) : []), [sieges, uid])
    // A signed-out visitor has spent nothing, so the full budget is the honest
    // number. Once there is an account, wait for its real count rather than
    // flashing 10/10 and letting the player click an attack the rules will reject.
    const budgetKnown = authChecked && (!uid || attacksLoaded)
    const left = budgetKnown ? attacksLeft(usedToday) : 0

    const colorOf = (ownerId: string) => {
        const player = players[ownerId]
        return colorForPlayer(player ? player.color : pickColorIndex(ownerId))
    }

    // --- Finished seasons ----------------------------------------------------

    useEffect(() => {
        if (season.number < 2) return
        const previous = `s${season.number - 1}`
        if (localStorage.getItem(RESULTS_SEEN_KEY(previous))) return

        let alive = true
        get(ref(db, `flagWars/${previous}`))
            .then(async snapshot => {
                if (!alive || !snapshot.exists()) return
                const result = resultFor(previous, snapshot.val() as SeasonArchive)
                if (!result?.winner) return
                setLastResult(result)

                // Copy the final table into the permanent record on the way past.
                // Whoever opens the game first after a season ends writes it; the
                // rules take only the first write, and only from someone who
                // played, so everybody after this is harmlessly refused.
                const entry = hallOfFameEntry(result)
                if (!entry) return
                await set(ref(db, `flagWars/hallOfFame/${previous}`), {
                    ...entry,
                    endedAt: serverTimestamp(),
                }).catch(() => {
                    // Already recorded, or this player did not play that season.
                })
            })
            .catch(() => {
                // Nothing to show is a perfectly fine outcome here.
            })
        return () => { alive = false }
    }, [season.number])

    function dismissResults() {
        if (lastResult) localStorage.setItem(RESULTS_SEEN_KEY(lastResult.id), "1")
        setLastResult(null)
    }

    // Arriving from the home screen's Hall of Fame button. The parameter is
    // cleared straight away so closing the panel does not reopen it.
    useEffect(() => {
        if (searchParams.get("hall") !== "1") return
        setSearchParams({}, { replace: true })
        void openHallOfFame()
        // openHallOfFame is redefined every render; re-running on that would loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams])

    async function openHallOfFame() {
        setLoadingHall(true)
        try {
            // The record alone, which stays small however many weeks have been
            // played, and is all that is needed once every season has one.
            const snapshot = await get(ref(db, "flagWars/hallOfFame"))
            const recorded = hallOfFameSeasons(snapshot.val() as Record<string, HallOfFameEntry>)

            // A season only gets its record when somebody who played it opens the
            // game afterwards. Until that happens - or for seasons finished before
            // there was a record at all - fill the gaps from the season data, which
            // is still there. This is the expensive read, so it only runs when
            // something is actually missing.
            if (recorded.length < season.number - 1) {
                const known = new Set(recorded.map(entry => entry.number))
                const archives = await get(ref(db, "flagWars"))
                const computed = finishedSeasons(
                    (archives.val() as Record<string, SeasonArchive>) || {},
                    season.number,
                )
                for (const result of computed) {
                    const entry = hallOfFameEntry(result)
                    if (entry && !known.has(entry.number)) recorded.push({ ...entry, endedAt: 0 })
                }
                recorded.sort((a, b) => b.number - a.number)
            }
            setHallOfFame(recorded)
        } catch {
            setHallOfFame([])
        } finally {
            setLoadingHall(false)
        }
    }

    // --- Joining -------------------------------------------------------------

    async function handleJoin() {
        const trimmed = nameDraft.trim().slice(0, 24)
        if (!trimmed || !uid) return

        if (nameTaken(trimmed, players, uid)) {
            setNameError("Somebody is already flying that name this season. Pick another.")
            return
        }

        setBusy(true)
        setNameError(null)
        try {
            // The player row and the claim on the name go together: if the name
            // is taken the whole join fails, so two empires can never end up
            // sharing one. The index is what the rules check - a client-side
            // look at `players` alone would lose a race between two joiners.
            await update(ref(db, `flagWars/${season.id}`), {
                [`players/${uid}`]: {
                    name: trimmed,
                    color: pickColorIndex(uid, Object.values(players).map(p => p.color)),
                    joinedAt: Date.now(),
                },
                [`nameIndex/${nameKey(trimmed)}`]: uid,
            })
            localStorage.setItem(NAME_KEY, trimmed)
            setName(trimmed)
            setJoined(true)
        } catch (error) {
            if (isPermissionDenied(error)) {
                setNameError("That name was taken a moment before you. Pick another.")
            } else {
                setWriteError("Could not join the season. Check your connection and try again.")
                setPendingAttack(null)
            }
            return
        } finally {
            setBusy(false)
        }
        // Naming the empire was a detour on the way to a territory - carry on to it
        // rather than dropping the player back on the map to click twice.
        if (pendingAttack) {
            const code = pendingAttack
            setPendingAttack(null)
            await startAttack(code, uid, trimmed)
        }
    }

    // --- Attacking and defending ---------------------------------------------

    /** Gets an identity and a name in place, then attacks. */
    async function requestAttack(code: string) {
        const id = await signIn()
        if (!id) return
        if (!players[id] && !joined) {
            setPendingAttack(code)
            return
        }
        await startAttack(code, id, players[id]?.name || name)
    }

    async function startAttack(code: string, playerId: string, playerName: string) {
        const check = canAttack(code, territories, sieges, playerId, left, Date.now())
        if (!check.ok) return

        // A fresh seed per attack, kept with the siege so the defender is asked
        // exactly what the attacker was asked.
        const seed = Math.floor(Math.random() * 0xffffffff)
        const round = buildRound(code, mulberry32(seed))
        if (!round) return

        setBusy(true)
        setWriteError(null)
        try {
            // Spend the attack before the round starts, so reloading mid-round
            // cannot hand out a free retry.
            const result = await runTransaction(
                ref(db, `flagWars/${season.id}/attacks/${playerId}/${today}`),
                current => (current || 0) + 1,
            )
            if (!result.committed) {
                setWriteError("Out of attacks for today.")
                return
            }
            recordDailyResult(STREAK_KEYS.wars, today, true)
            setSelected(null)
            // The identity rides along with the round: it may have been created
            // moments ago and not be in state yet when the round is resolved.
            setAttack({ code, round, seed, playerId, playerName, mode: check.besieges ? "siege" : "claim" })
        } catch {
            setWriteError("Could not start the attack. Check your connection and try again.")
        } finally {
            setBusy(false)
        }
    }

    /** Defending costs nothing and is not rationed - it is forced on you. */
    async function startDefence(siege: Siege) {
        const id = await signIn()
        if (!id) return
        const round = buildRound(siege.code, mulberry32(siege.seed))
        if (!round) return
        setSelected(null)
        setAttack({
            code: siege.code,
            round,
            seed: siege.seed,
            playerId: id,
            playerName: players[id]?.name || name,
            mode: "defend",
            siege,
        })
    }

    async function resolveRound(
        correct: boolean,
        elapsedMs: number,
        pending: NonNullable<typeof attack>,
    ) {
        const { code, round, seed, playerId, playerName, mode, siege } = pending
        const score = correct ? scoreForTime(elapsedMs, round.timeLimitMs) : 0
        setAttack(null)

        try {
            if (mode === "claim") {
                if (!correct) return setOutcome({ code, kind: "claim-failed" })
                await set(ref(db, `flagWars/${season.id}/territories/${code}`), {
                    ownerId: playerId, ownerName: playerName,
                    score: MAX_SCORE, timeMs: Math.round(elapsedMs), takenAt: serverTimestamp(),
                })
                return setOutcome({ code, kind: "claimed", score: MAX_SCORE })
            }

            if (mode === "siege") {
                if (!correct) return setOutcome({ code, kind: "siege-failed" })
                await set(ref(db, `flagWars/${season.id}/sieges/${code}`), {
                    code, attackerId: playerId, attackerName: playerName,
                    score, seed, startedAt: serverTimestamp(),
                })
                return setOutcome({
                    code, kind: "siege-opened", score,
                    otherName: territories[code]?.ownerName,
                })
            }

            // Defending. A wrong answer scores nothing, which loses the land.
            if (!siege) return
            const held = score > siege.score
            // Recording the result and handing the land over have to be one
            // write. As two, an attacker clearing the siege in between would
            // leave the defender holding land they had just lost.
            await update(ref(db, `flagWars/${season.id}`), {
                [`sieges/${code}/defenceScore`]: score,
                [`sieges/${code}/defenderName`]: playerName,
                [`sieges/${code}/resolvedAt`]: serverTimestamp(),
                ...(held ? {} : {
                    [`territories/${code}`]: {
                        ownerId: siege.attackerId, ownerName: siege.attackerName,
                        score: siege.score, timeMs: 0, takenAt: serverTimestamp(),
                    },
                }),
            })
            setOutcome({
                code, kind: held ? "defended" : "lost",
                score, otherScore: siege.score, otherName: siege.attackerName,
            })
        } catch (error) {
            if (!isPermissionDenied(error)) return setOutcome({ code, kind: "write-failed" })
            // The rules serialise simultaneous attacks correctly - the second
            // write simply loses - but "the database refused that" is a terrible
            // way to say "somebody beat you to it by two seconds". Read back
            // what actually happened and say which it was.
            setOutcome(await diagnoseRefusal(code, playerId, mode))
        }
    }

    /**
     * Turns a rejected write into the reason the player actually needs.
     *
     * What a rejection means depends entirely on what was being attempted. A
     * siege sitting on the territory is a lost race to an attacker and the
     * expected state of the world to its defender, so diagnosing without the
     * mode told defenders that their own land was "already contested".
     */
    async function diagnoseRefusal(
        code: string,
        playerId: string,
        mode: "claim" | "siege" | "defend",
    ): Promise<Outcome> {
        try {
            const [territorySnap, siegeSnap] = await Promise.all([
                get(ref(db, `flagWars/${season.id}/territories/${code}`)),
                get(ref(db, `flagWars/${season.id}/sieges/${code}`)),
            ])
            const holder = territorySnap.val() as TerritoryMap[string] | null
            const siege = siegeSnap.val() as Siege | null

            if (mode === "defend") {
                // The only race a defender can lose is against their own clock.
                if (siege && siegeState(siege, Date.now()) === "expired") {
                    return { code, kind: "defence-too-late", otherName: siege.attackerName }
                }
                if (!siege || holder?.ownerId !== playerId) {
                    return { code, kind: "defence-moot" }
                }
                return { code, kind: "write-refused" }
            }

            if (mode === "siege" && siege && siege.attackerId !== playerId
                && siegeState(siege, Date.now()) === "awaiting-defence") {
                return { code, kind: "race-besieged", otherName: siege.attackerName, score: siege.score }
            }
            if (holder && holder.ownerId !== playerId) {
                return { code, kind: "race-claimed", otherName: holder.ownerName }
            }
        } catch {
            // Fall through - a failed read tells us nothing useful either way.
        }
        return { code, kind: "write-refused" }
    }

    /** Nobody answered in time, so the attacker collects. */
    async function claimExpiredSiege(siege: Siege) {
        const id = await signIn()
        if (!id || id !== siege.attackerId) return
        setBusy(true)
        try {
            await set(ref(db, `flagWars/${season.id}/territories/${siege.code}`), {
                ownerId: siege.attackerId, ownerName: siege.attackerName,
                score: siege.score, timeMs: 0, takenAt: serverTimestamp(),
            })
            await remove(ref(db, `flagWars/${season.id}/sieges/${siege.code}`))
            setOutcome({ code: siege.code, kind: "claimed-unopposed", score: siege.score })
        } catch (error) {
            setWriteError(isPermissionDenied(error)
                ? "The database refused that - the rules may not be deployed."
                : "Could not collect that territory. Try again in a moment.")
        } finally {
            setBusy(false)
        }
    }

    /** The attacker has seen how their siege ended; clear it off the board. */
    async function dismissSiege(siege: Siege) {
        try {
            await remove(ref(db, `flagWars/${season.id}/sieges/${siege.code}`))
        } catch {
            setWriteError("Could not clear that result.")
        }
    }

    useEffect(() => {
        if (!outcome) return
        const timer = setTimeout(() => setOutcome(null), RESULT_MS)
        return () => clearTimeout(timer)
    }, [outcome])

    // --- Board ---------------------------------------------------------------

    /*
     * Unclaimed land, picked against the ocean rather than against the page:
     * the old slate greys were close enough to the water in both themes that
     * coastlines stopped reading as coastlines.
     */
    const neutralFill = theme === 'dark' ? "#3a4a5e" : "#f4f7fa"
    const neutralStroke = theme === 'dark' ? "#5d6f85" : "#9fb3c6"

    const board = useMemo(() => (
        <ComposableMap
            projection="geoMercator"
            projectionConfig={{ scale: 140 }}
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            style={{ width: "100%", height: "100%", outline: "none" }}
        >
            <OceanBackdrop theme={theme} />

            <ZoomableGroup
                zoom={position.zoom}
                center={position.coordinates}
                onMoveEnd={setPosition}
                maxZoom={12}
                translateExtent={[[-100, -100], [900, 700]]}
            >
                <Geographies geography={geoUrl}>
                    {({ geographies }) =>
                        geographies.map(geo => {
                            const code = codeForGeoName(geo.properties?.name || "")
                            const owner = code ? territories[code] : undefined
                            const isMine = !!owner && owner.ownerId === uid
                            const isReachable = !!code && hasEmpire && reachable.has(code)
                            const isSelected = !!code && code === selected

                            const ownerColor = owner
                                ? colorForPlayer(players[owner.ownerId]?.color ?? pickColorIndex(owner.ownerId))
                                : null
                            const fill = ownerColor || neutralFill
                            const stroke = isSelected
                                ? (theme === 'dark' ? "#f8fafc" : "#0f172a")
                                : isReachable
                                    ? "#f59e0b"
                                    : isMine
                                        ? (theme === 'dark' ? "#f1f5f9" : "#ffffff")
                                        : neutralStroke

                            return (
                                <Geography
                                    key={geo.rsmKey}
                                    geography={geo}
                                    onClick={() => code && setSelected(code)}
                                    style={{
                                        default: {
                                            fill,
                                            fillOpacity: owner ? (isMine ? 0.95 : 0.75) : 1,
                                            stroke,
                                            strokeWidth: isSelected ? 0.8 : isReachable ? 0.5 : 0.15,
                                            outline: "none",
                                            transition: "fill 300ms, stroke 200ms",
                                        },
                                        hover: {
                                            fill,
                                            fillOpacity: 1,
                                            stroke,
                                            strokeWidth: 0.7,
                                            outline: "none",
                                            cursor: code ? "pointer" : "default",
                                        },
                                        pressed: { fill, stroke, strokeWidth: 0.8, outline: "none" },
                                    }}
                                />
                            )
                        })
                    }
                </Geographies>

                {/*
                  * Sea links are invisible on a political map, which makes the
                  * board lie: Russia and Alaska are neighbours here and nothing
                  * says so. Every crossing is drawn faintly, and the selected
                  * country's are picked out with a port marker at each landfall.
                  */}
                {ALL_SEA_ROUTES.map(route => {
                    const active = selected === route.code || selected === route.to
                    return (
                        <Line
                            key={`${route.code}-${route.to}`}
                            from={route.from}
                            to={route.at}
                            stroke={active ? "#0ea5e9" : (theme === 'dark' ? "#64748b" : "#94a3b8")}
                            strokeWidth={px(active ? 2.6 : 1)}
                            strokeDasharray={active ? `${px(4)} ${px(3)}` : `${px(2)} ${px(3)}`}
                            strokeLinecap="round"
                            opacity={active ? 1 : 0.45}
                            fill="none"
                        />
                    )
                })}

                {/*
                  * Who holds what, said once per empire. Countries are too small
                  * and too many to letter individually, so each player is named
                  * over their largest bloc, at a size that spans it.
                  */}
                {empires.map(empire => (
                    <Marker key={empire.uid} coordinates={empire.at}>
                        <EmpireName
                            name={empire.name}
                            color={colorForPlayer(empire.color)}
                            fitDegrees={empire.fitDegrees}
                            px={px}
                            dark={theme === 'dark'}
                        />
                    </Marker>
                ))}

                {selected && (() => {
                    const routes = seaRoutesOf(selected)
                    const named = labelledRoutes(routes, px)
                    return routes.flatMap((route: SeaRoute) => [
                        <Marker key={`${selected}-${route.to}-a`} coordinates={route.from}>
                            <PortMark px={px} />
                        </Marker>,
                        <Marker key={`${selected}-${route.to}-b`} coordinates={route.at}>
                            <PortMark
                                px={px}
                                label={named.has(route.to) ? countryByCode(route.to)?.name : undefined}
                            />
                        </Marker>,
                    ])
                })()}
            </ZoomableGroup>
        </ComposableMap>
    ), [territories, players, empires, uid, reachable, hasEmpire, selected, theme, position, px, neutralFill, neutralStroke])

    // --- Screens -------------------------------------------------------------

    if (fatalError) {
        return (
            <Shell theme={theme} onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="max-w-sm text-center bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl p-6 border border-white/70 dark:border-slate-700/70">
                        <AlertTriangle className="mx-auto text-amber-500 mb-3" size={32} />
                        <p className="font-bold mb-1">World Conqueror is offline</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{fatalError}</p>
                    </div>
                </div>
            </Shell>
        )
    }

    if (loading) {
        return (
            <Shell theme={theme} onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="animate-spin text-slate-400" size={32} />
                </div>
            </Shell>
        )
    }

    return (
        <Shell theme={theme} onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
            {/* Header */}
            <div className="px-4 pt-4 pb-2 flex items-center gap-2 flex-wrap">
                <div className="px-3 py-1.5 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/70 dark:border-slate-700/70 text-xs font-bold">
                    Season {season.number}
                    <span className="text-slate-400 font-medium"> · {season.daysLeft}d left</span>
                </div>
                <div className="px-3 py-1.5 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/70 dark:border-slate-700/70 text-xs font-bold flex items-center gap-1.5">
                    <Swords size={13} className={left > 0 ? "text-rose-500" : "text-slate-400"} />
                    {budgetKnown ? `${left}/${DAILY_ATTACKS}` : `-/${DAILY_ATTACKS}`}
                    {budgetKnown && left === 0 && <RefillCountdown />}
                </div>
                <div className="px-3 py-1.5 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/70 dark:border-slate-700/70 text-xs font-bold flex items-center gap-1.5">
                    <Flag size={13} style={{ color: myPlayer ? colorForPlayer(myPlayer.color) : undefined }} />
                    {mine.length}
                </div>
            </div>

            {/* Board */}
            <div ref={measureBoard} className="flex-1 relative min-h-0">
                {board}

                <SiegePanel
                    now={now}
                    toDefend={toDefend}
                    mine={mySieges}
                    busy={busy}
                    onDefend={startDefence}
                    onCollect={claimExpiredSiege}
                    onDismiss={dismissSiege}
                />

                {authChecked && !hasEmpire && !needsName && toDefend.length === 0 && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-white/70 dark:border-slate-700/70 text-xs font-bold shadow-lg whitespace-nowrap">
                        Pick any country - it becomes your homeland
                    </div>
                )}

                {/* Standings */}
                <div className="absolute left-3 bottom-3 w-56 max-w-[60vw]">
                    <button
                        type="button"
                        onClick={() => setShowStandings(v => !v)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/85 dark:bg-slate-800/85 backdrop-blur-xl border border-white/70 dark:border-slate-700/70 text-xs font-bold shadow-lg"
                    >
                        <Trophy size={14} className="text-amber-500" />
                        Empires
                        <span className="ml-auto text-slate-400 font-medium">{standings.length}</span>
                        <ChevronDown size={14} className={`text-slate-400 transition-transform ${showStandings ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                            type="button"
                            onClick={openHallOfFame}
                            disabled={loadingHall}
                            className="mt-1.5 w-full flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/85 dark:bg-slate-800/85 backdrop-blur-xl border border-white/70 dark:border-slate-700/70 text-[11px] font-bold shadow-lg disabled:opacity-60"
                        >
                            {loadingHall
                                ? <Loader2 size={12} className="animate-spin text-slate-400" />
                                : <Crown size={12} className="text-amber-500" />}
                            Hall of Fame
                    </button>
                    {showStandings && (
                        <div className="mt-1.5 rounded-2xl bg-white/85 dark:bg-slate-800/85 backdrop-blur-xl border border-white/70 dark:border-slate-700/70 p-2 shadow-lg max-h-56 overflow-y-auto">
                            {standings.length === 0 && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 p-2">
                                    Nobody has claimed anything yet. The whole map is up for grabs.
                                </p>
                            )}
                            {standings.map((row, index) => (
                                <div
                                    key={row.uid}
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded-xl text-xs ${row.uid === uid ? 'bg-slate-100 dark:bg-slate-700/60' : ''}`}
                                >
                                    <span className="w-4 text-slate-400 font-bold">{index + 1}</span>
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorForPlayer(row.color) }} />
                                    <span className="truncate font-semibold flex-1">{row.name}</span>
                                    {index === 0 && <Crown size={12} className="text-amber-500 shrink-0" />}
                                    <span className="font-black tabular-nums">{row.territories}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Legend */}
                <div className="absolute right-3 bottom-3 px-3 py-2 rounded-2xl bg-white/85 dark:bg-slate-800/85 backdrop-blur-xl border border-white/70 dark:border-slate-700/70 text-[10px] font-medium shadow-lg space-y-1">
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-2 rounded-sm border-2 border-amber-500" />
                        Can attack
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-2 rounded-sm" style={{ background: myPlayer ? colorForPlayer(myPlayer.color) : "#94a3b8" }} />
                        Yours
                    </div>
                </div>
            </div>

            {writeError && (
                <div className="px-4 pb-2">
                    <p className="text-xs text-rose-500 font-semibold text-center">{writeError}</p>
                </div>
            )}

            {/* Territory detail */}
            <AnimatePresence>
                {selected && !attack && !outcome && (
                    <TerritorySheet
                        code={selected}
                        territories={territories}
                        sieges={sieges}
                        now={now}
                        uid={uid || ""}
                        attacksLeft={left}
                        busy={busy}
                        ownerColor={territories[selected] ? colorOf(territories[selected].ownerId) : undefined}
                        onClose={() => setSelected(null)}
                        onAttack={() => requestAttack(selected)}
                        onDefend={() => sieges[selected] && startDefence(sieges[selected])}
                    />
                )}
            </AnimatePresence>

            {/* Attack round */}
            <AnimatePresence>
                {attack && (
                    <AttackRound
                        key={`${attack.code}-${attack.seed}-${attack.mode}`}
                        round={attack.round}
                        mode={attack.mode}
                        scoreToBeat={attack.siege?.score}
                        rivalName={attack.mode === "defend" ? attack.siege?.attackerName : territories[attack.code]?.ownerName}
                        onDone={(correct, elapsedMs) => resolveRound(correct, elapsedMs, attack)}
                    />
                )}
            </AnimatePresence>

            {/* Result */}
            <AnimatePresence>
                {outcome && <OutcomeBanner outcome={outcome} onClose={() => setOutcome(null)} />}
            </AnimatePresence>

            {/* Name prompt */}
            <AnimatePresence>
                {needsName && !showIntro && (
                    <Backdrop>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl p-6 border border-white/70 dark:border-slate-700/70"
                        >
                            <h2 className="font-black text-lg mb-1">Name your empire</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                                This is what other players see on the territories you hold.
                            </p>
                            <input
                                value={nameDraft}
                                onChange={e => { setNameDraft(e.target.value); setNameError(null) }}
                                onKeyDown={e => { if (e.key === "Enter") handleJoin() }}
                                maxLength={24}
                                autoFocus
                                placeholder="Your name"
                                className={`w-full px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-900 outline-none font-semibold ${nameError ? 'ring-2 ring-rose-400' : ''}`}
                            />
                            <p className={`text-xs font-semibold mt-2 mb-3 ${nameError ? 'text-rose-500' : 'text-transparent'}`}>
                                {nameError || "placeholder"}
                            </p>
                            <button
                                type="button"
                                onClick={handleJoin}
                                disabled={!nameDraft.trim() || busy}
                                className="w-full py-3 rounded-2xl bg-rose-500 text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                                {busy ? <Loader2 size={18} className="animate-spin" /> : <Swords size={18} />}
                                Enter the war
                            </button>
                        </motion.div>
                    </Backdrop>
                )}
            </AnimatePresence>

            {/* The finished season's table, shown once */}
            <AnimatePresence>
                {lastResult && (
                    <SeasonResults result={lastResult} uid={uid} onClose={dismissResults} />
                )}
            </AnimatePresence>

            {/* Hall of fame */}
            <AnimatePresence>
                {hallOfFame && (
                    <HallOfFame seasons={hallOfFame} onClose={() => setHallOfFame(null)} />
                )}
            </AnimatePresence>

            {/* Intro */}
            <AnimatePresence>
                {showIntro && (
                    <Backdrop>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl p-6 border border-white/70 dark:border-slate-700/70"
                        >
                            <h2 className="font-black text-lg mb-3">World Conqueror</h2>
                            <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-2.5 mb-5">
                                <li className="flex gap-2"><span className="text-rose-500 font-black">1.</span> Claim any free country as your homeland.</li>
                                <li className="flex gap-2"><span className="text-rose-500 font-black">2.</span> From then on you can only attack countries bordering your empire.</li>
                                <li className="flex gap-2"><span className="text-rose-500 font-black">3.</span> To take a country, name its capital or spot its flag - faster than its current owner managed.</li>
                                <li className="flex gap-2"><span className="text-rose-500 font-black">4.</span> {DAILY_ATTACKS} attacks a day. The season ends in {season.daysLeft} days and the map resets.</li>
                            </ul>
                            <button
                                type="button"
                                onClick={() => { localStorage.setItem(INTRO_KEY, "1"); setShowIntro(false) }}
                                className="w-full py-3 rounded-2xl bg-rose-500 text-white font-bold"
                            >
                                Let's go
                            </button>
                        </motion.div>
                    </Backdrop>
                )}
            </AnimatePresence>
        </Shell>
    )
}

// --- Layout ------------------------------------------------------------------

function Shell({ theme, onToggleTheme, children }: {
    theme: 'light' | 'dark'
    onToggleTheme: () => void
    children: ReactNode
}) {
    return (
        <div className="h-screen flex flex-col text-slate-800 dark:text-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4">
                <Link
                    to="/"
                    className="p-2.5 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/70 dark:border-slate-700/70"
                    aria-label="Back home"
                >
                    <ArrowLeft size={18} />
                </Link>
                <h1 className="font-black tracking-tight">World Conqueror</h1>
                <button
                    type="button"
                    onClick={onToggleTheme}
                    aria-label="Toggle theme"
                    className="p-2.5 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/70 dark:border-slate-700/70"
                >
                    {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                </button>
            </div>
            {children}
        </div>
    )
}

function Backdrop({ children }: { children: ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
            {children}
        </motion.div>
    )
}

/** Counts down to the UTC midnight that hands the attacks back. */
function RefillCountdown() {
    const [ms, setMs] = useState(() => msUntilRefill())

    useEffect(() => {
        const timer = setInterval(() => setMs(msUntilRefill()), 1000)
        return () => clearInterval(timer)
    }, [])

    const hours = Math.floor(ms / 3_600_000)
    const minutes = Math.floor((ms % 3_600_000) / 60_000)
    return <span className="text-slate-400 font-medium">· {hours}h {minutes}m</span>
}

/**
 * The sea the board floats on.
 *
 * It is drawn inside the map's own <svg> rather than as a div behind it: the
 * map is letterboxed to fit its container, so a separate layer could never be
 * relied on to line up with it. It sits *outside* <ZoomableGroup> so panning
 * slides the continents across a still ocean instead of dragging the water
 * along with them.
 *
 * Every rect deliberately reaches far past the 800x600 viewBox. Scaling to fit
 * leaves the visible svg wider or taller than the projection on almost every
 * screen, and a sea that stopped at the viewBox edge would show bare page down
 * two sides. The gradients are pinned to user space instead, so the colour ramp
 * still follows the map and the overflow just carries the end colour.
 */
function OceanBackdrop({ theme }: { theme: 'light' | 'dark' }) {
    const dark = theme === 'dark'
    const cover = { x: -MAP_WIDTH, y: -MAP_HEIGHT, width: MAP_WIDTH * 3, height: MAP_HEIGHT * 3 }

    return (
        <g pointerEvents="none">
            <defs>
                {/* The ramp runs well past the top and bottom of the viewBox:
                    a narrow screen letterboxes the map, and a gradient that
                    ended at the projection would cap those bands with one flat
                    colour instead of open water. */}
                <linearGradient
                    id="fw-ocean"
                    gradientUnits="userSpaceOnUse"
                    x1={0} y1={-MAP_HEIGHT * 0.75} x2={0} y2={MAP_HEIGHT * 1.75}
                >
                    {dark ? (
                        <>
                            <stop offset="0%" stopColor="#05131f" />
                            <stop offset="30%" stopColor="#06192b" />
                            <stop offset="70%" stopColor="#0a3757" />
                            <stop offset="100%" stopColor="#0e4a75" />
                        </>
                    ) : (
                        <>
                            <stop offset="0%" stopColor="#dff2fd" />
                            <stop offset="30%" stopColor="#d5edfc" />
                            <stop offset="70%" stopColor="#a9dcf6" />
                            <stop offset="100%" stopColor="#7cc0e8" />
                        </>
                    )}
                </linearGradient>

                {/* Same off-canvas glow the page background uses, so the board
                    reads as part of it rather than a window cut into it. */}
                <radialGradient
                    id="fw-ocean-glow"
                    gradientUnits="userSpaceOnUse"
                    cx={MAP_WIDTH * 0.14} cy={-30} r={MAP_WIDTH * 0.75}
                >
                    <stop offset="0%" stopColor={dark ? "#38bdf8" : "#ffffff"} stopOpacity={dark ? 0.16 : 0.55} />
                    <stop offset="100%" stopColor={dark ? "#38bdf8" : "#ffffff"} stopOpacity={0} />
                </radialGradient>
            </defs>

            <rect {...cover} fill="url(#fw-ocean)" />
            <rect {...cover} fill="url(#fw-ocean-glow)" />
        </g>
    )
}

/**
 * A landfall on a sea route.
 *
 * Everything is divided by the zoom so the marker keeps a constant size on
 * screen: drawn in projected units it would either vanish at world zoom - a
 * real strait like Bering is 79km wide - or swell to cover a continent when
 * zoomed in.
 */
function PortMark({ px, label }: { px: (pixels: number) => number; label?: string }) {
    return (
        <g>
            <circle r={px(9)} fill="#0ea5e9" fillOpacity={0.18} />
            <circle r={px(4)} fill="#0ea5e9" stroke="#fff" strokeWidth={px(1.5)} />
            {label && (
                <text
                    y={px(-9)}
                    textAnchor="middle"
                    style={{ fontSize: px(11), fontWeight: 800, fill: "#0284c7", paintOrder: "stroke" }}
                    stroke="#fff"
                    strokeWidth={px(1.8)}
                    strokeLinejoin="round"
                >
                    {label}
                </text>
            )}
        </g>
    )
}

/** SVG units per degree of longitude for geoMercator at scale 140. */
const UNITS_PER_DEGREE = 2.44

/**
 * An empire's name, written inside the country it is anchored to.
 *
 * The size is in map units, derived from that country's own width and height,
 * which is what keeps the name inside its borders: it scales with the map, so
 * a fit at one zoom is a fit at every zoom. Only a fraction of each dimension
 * is used, because countries are not rectangles and a name filling the bounding
 * box would hang over the coast wherever the shape narrows.
 *
 * A small country therefore gets a small name - too small to read at world
 * zoom, where it is hidden rather than drawn as a smudge, and where zooming in
 * brings it back at a readable size.
 */
function EmpireName({ name, color, fitDegrees, px, dark }: {
    name: string
    color: string
    fitDegrees: [number, number]
    px: (pixels: number) => number
    dark: boolean
}) {
    const [widthDegrees, heightDegrees] = fitDegrees
    // A character is roughly 0.55 of the font size wide.
    const fromWidth = (widthDegrees * UNITS_PER_DEGREE * 0.4) / (Math.max(name.length, 3) * 0.55)
    const fromHeight = heightDegrees * UNITS_PER_DEGREE * 0.28
    const size = Math.min(fromWidth, fromHeight)

    // Below a few pixels the letters are mush; hiding is better than a smear,
    // and it costs nothing because zooming in restores it.
    if (size < px(6)) return null

    // The halo has to stay a hairline on small text or it eats the letterforms,
    // so it is capped in pixels rather than left proportional all the way down.
    const halo = Math.min(size * 0.16, px(2.5))
    return (
        <text
            textAnchor="middle"
            dominantBaseline="central"
            style={{
                fontSize: size,
                fontWeight: 900,
                fill: color,
                letterSpacing: size * 0.06,
                paintOrder: "stroke",
                pointerEvents: "none",
                textTransform: "uppercase",
            }}
            stroke={dark ? "#0f172a" : "#ffffff"}
            strokeWidth={halo}
            strokeLinejoin="round"
            opacity={0.92}
        >
            {name}
        </text>
    )
}

/**
 * Which landfalls are far enough apart to be worth naming.
 *
 * Around the Caribbean half a dozen crossings land within a few degrees of each
 * other, and labelling them all buries the islands they are meant to describe.
 * So a label is only kept when nothing already labelled is within a label's
 * width of it on screen - and since the labels hold a constant screen size,
 * zooming in separates them and the rest appear.
 */
function labelledRoutes(routes: SeaRoute[], px: (pixels: number) => number): Set<string> {
    const kept = new Set<string>()
    const placed: [number, number][] = []
    // A label is roughly 70px wide; convert that to degrees at the current zoom.
    const spacing = px(70) / UNITS_PER_DEGREE

    for (const route of routes) {
        const [lon, lat] = route.at
        const x = lon * Math.cos((lat * Math.PI) / 180)
        const clash = placed.some(([px, py]) =>
            Math.abs(px - x) < spacing && Math.abs(py - lat) < spacing * 0.45)
        if (clash) continue
        placed.push([x, lat])
        kept.add(route.to)
    }
    return kept
}

// --- Sieges in progress ------------------------------------------------------

/**
 * The only part of the board that demands something of the player. A siege on
 * your land expires in `SIEGE_HOURS`, so it has to be impossible to miss; and
 * the attacker has to be told how theirs ended, since a siege they won looks
 * exactly like one they lost until somebody says so.
 */
function SiegePanel({ now, toDefend, mine, busy, onDefend, onCollect, onDismiss }: {
    now: number
    toDefend: Siege[]
    mine: Siege[]
    busy: boolean
    onDefend: (siege: Siege) => void
    onCollect: (siege: Siege) => void
    onDismiss: (siege: Siege) => void
}) {
    const settled = mine.filter(s => siegeState(s, now) !== "awaiting-defence")
    const waiting = mine.filter(s => siegeState(s, now) === "awaiting-defence")
    if (toDefend.length === 0 && settled.length === 0 && waiting.length === 0) return null

    const nameOf = (siege: Siege) => countryByCode(siege.code)?.name ?? siege.code
    const timeLeft = (siege: Siege) => {
        const ms = siegeTimeLeft(siege, now)
        const hours = Math.floor(ms / 3_600_000)
        return hours >= 1 ? `${hours}h` : `${Math.max(1, Math.floor(ms / 60_000))}m`
    }

    // One line per siege, scrolling past about eight, so ten at once still sits
    // in the corner instead of burying the map.
    return (
        <div className="absolute top-2 right-2 w-56 max-w-[70vw] z-20 rounded-2xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-white/70 dark:border-slate-700/70 shadow-lg overflow-hidden">
            <div className="max-h-[46vh] overflow-y-auto divide-y divide-slate-200/70 dark:divide-slate-700/70">
                {toDefend.map(siege => (
                    <div key={siege.code} className="flex items-center gap-1.5 pl-2 pr-1.5 py-1.5">
                        <Shield size={12} className="text-amber-500 shrink-0" />
                        <div className="min-w-0 flex-1 leading-tight">
                            <p className="text-[11px] font-bold truncate">{nameOf(siege)}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {siege.attackerName} · {siege.score} · {timeLeft(siege)}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => onDefend(siege)}
                            className="shrink-0 px-2 py-1 rounded-xl bg-amber-500 text-white text-[10px] font-black"
                        >
                            Defend
                        </button>
                    </div>
                ))}

                {settled.map(siege => {
                    const expired = siegeState(siege, now) === "expired"
                    const won = expired || !defenceHeld(siege)
                    return (
                        <div key={siege.code} className="flex items-center gap-1.5 pl-2 pr-1.5 py-1.5">
                            {won
                                ? <Sparkles size={12} className="text-emerald-500 shrink-0" />
                                : <Shield size={12} className="text-slate-400 shrink-0" />}
                            <div className="min-w-0 flex-1 leading-tight">
                                <p className="text-[11px] font-bold truncate">{nameOf(siege)}</p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                    {expired
                                        ? "unanswered - yours"
                                        : won
                                            ? `won ${siege.score}-${siege.defenceScore}`
                                            : `${siege.defenderName} held it`}
                                </p>
                            </div>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => expired ? onCollect(siege) : onDismiss(siege)}
                                className={`shrink-0 px-2 py-1 rounded-xl text-[10px] font-black disabled:opacity-50 ${
                                    expired ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700'
                                }`}
                            >
                                {expired ? "Collect" : "OK"}
                            </button>
                        </div>
                    )
                })}

                {waiting.map(siege => (
                    <div key={siege.code} className="flex items-center gap-1.5 px-2 py-1.5">
                        <Swords size={12} className="text-rose-500 shrink-0" />
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight">
                            {nameOf(siege)} · you scored {siege.score} · {timeLeft(siege)} left
                        </p>
                    </div>
                ))}
            </div>
        </div>
    )
}

// --- Territory detail --------------------------------------------------------

function TerritorySheet({ code, territories, sieges, now, uid, attacksLeft: left, busy, ownerColor, onClose, onAttack, onDefend }: {
    code: string
    territories: TerritoryMap
    sieges: SiegeMap
    now: number
    uid: string
    attacksLeft: number
    busy: boolean
    ownerColor?: string
    onClose: () => void
    onAttack: () => void
    onDefend: () => void
}) {
    const country = countryByCode(code)
    const held = territories[code]
    const siege = sieges[code]
    const check = canAttack(code, territories, sieges, uid, left, now)
    const isMine = held?.ownerId === uid
    const mustDefend = !!siege && isMine && siegeState(siege, now) === "awaiting-defence"
    const seaRoutes = seaRoutesOf(code)

    if (!country) return null

    const blockedText: Record<string, string> = {
        owned: "You already hold this territory.",
        unreachable: "Too far - you can only attack countries bordering your empire.",
        "no-attacks": "No attacks left today. They refill at midnight UTC.",
        "not-a-territory": "This country is not part of the board.",
        "under-siege": "This territory is already being fought over. Wait for that to settle.",
    }

    return (
        <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed left-0 right-0 bottom-0 z-40 p-3"
        >
            <div className="mx-auto max-w-md bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-3xl border border-white/70 dark:border-slate-700/70 shadow-2xl p-4">
                <div className="flex items-center gap-3">
                    <img src={country.image} alt="" className="w-14 h-9 object-cover rounded-md shadow" />
                    <div className="min-w-0 flex-1">
                        <p className="font-black truncate">{country.name}</p>
                        {held ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ownerColor }} />
                                {isMine ? "Yours" : held.ownerName}
                            </p>
                        ) : (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Unclaimed</p>
                        )}
                        {siege && (
                            <p className="text-[11px] text-amber-500 font-semibold truncate">
                                Under siege by {siege.attackerName} · {siege.score} to beat
                            </p>
                        )}
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                {mustDefend ? (
                    <button
                        type="button"
                        onClick={onDefend}
                        className="mt-4 w-full py-3 rounded-2xl bg-amber-500 text-white font-bold flex items-center justify-center gap-2"
                    >
                        <Shield size={18} />
                        Defend · beat {siege.score}
                    </button>
                ) : check.ok ? (
                    <button
                        type="button"
                        onClick={onAttack}
                        disabled={busy}
                        className="mt-4 w-full py-3 rounded-2xl bg-rose-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {busy ? <Loader2 size={18} className="animate-spin" /> : <Swords size={18} />}
                        {check.besieges ? `Lay siege to ${country.name}` : "Claim it"}
                    </button>
                ) : (
                    <p className="mt-4 text-xs text-center text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5 py-2">
                        {isMine ? <Shield size={14} className="text-emerald-500" /> : <AlertTriangle size={14} className="text-amber-500" />}
                        {blockedText[check.reason]}
                    </p>
                )}

                {seaRoutes.length > 0 && (
                    <p className="mt-2 text-[11px] text-center text-sky-600 dark:text-sky-400">
                        Reached by sea from {seaRoutes.map((r: SeaRoute) => countryByCode(r.to)?.name ?? r.to).join(", ")}
                    </p>
                )}

                {check.ok && check.besieges && (
                    <p className="mt-2 text-[11px] text-center text-slate-400">
                        {held?.ownerName} gets {SIEGE_HOURS}h to answer the same questions. Outscore them and the land is yours.
                    </p>
                )}
            </div>
        </motion.div>
    )
}

// --- The round ---------------------------------------------------------------

function AttackRound({ round, mode, scoreToBeat, rivalName, onDone }: {
    round: WarRound
    mode: "claim" | "siege" | "defend"
    /** Only when defending: what the attacker scored. */
    scoreToBeat?: number
    rivalName?: string
    onDone: (correct: boolean, elapsedMs: number) => void
}) {
    const startedAt = useRef(performance.now())
    const settled = useRef(false)
    const [elapsed, setElapsed] = useState(0)
    const [step, setStep] = useState(0)
    const [input, setInput] = useState("")
    const [hint, setHint] = useState<string | null>(null)
    const [shake, setShake] = useState(0)

    const question = round.questions[step]

    // Everyone gets the whole clock: taking land is settled by the defender's
    // reply, not by racing a stored number, so there is nothing to cut it short.
    const deadline = round.timeLimitMs

    const finish = (correct: boolean) => {
        if (settled.current) return
        settled.current = true
        onDone(correct, performance.now() - startedAt.current)
    }

    /** Right answer: on to the next question, or the attack lands. */
    function advance() {
        if (step + 1 >= round.questions.length) return finish(true)
        setStep(step + 1)
        setInput("")
        setHint(null)
    }

    useEffect(() => {
        const timer = setInterval(() => {
            const now = performance.now() - startedAt.current
            setElapsed(now)
            if (now >= deadline) finish(false)
        }, 50)
        return () => clearInterval(timer)
        // `finish` is a stable closure over refs; re-running the timer would reset it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deadline])

    const remaining = Math.max(0, 1 - elapsed / deadline)
    const liveScore = scoreForTime(elapsed, round.timeLimitMs)

    function submitTyped() {
        if (question.kind !== "typed") return
        const match = resolveTextAnswer(input, [question.answer])
        if (match === "exact") return advance()
        if (match === "close") {
            setHint(typoFeedbackForStreak(false))
            return
        }
        setHint(null)
        setShake(n => n + 1)
    }

    return (
        <Backdrop>
            <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl p-5 border border-white/70 dark:border-slate-700/70"
            >
                {/* Clock */}
                <div className="flex items-center gap-2 mb-1 text-xs font-bold">
                    <Timer size={14} className={mode === "defend" ? "text-amber-500" : "text-rose-500"} />
                    <span className={`tabular-nums ${mode === "defend" && scoreToBeat !== undefined && liveScore <= scoreToBeat ? "text-rose-500" : ""}`}>
                        {liveScore}
                    </span>
                    {scoreToBeat !== undefined && (
                        <span className="text-slate-400 font-medium truncate">
                            · beat {scoreToBeat}{rivalName ? ` (${rivalName})` : ""}
                        </span>
                    )}
                    <span className="ml-auto text-slate-400 font-medium shrink-0">
                        {step + 1} / {round.questions.length}
                    </span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-4">
                    <div
                        className={`h-full rounded-full ${
                            scoreToBeat !== undefined && liveScore <= scoreToBeat ? 'bg-rose-500'
                            : remaining > 0.35 ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${remaining * 100}%` }}
                    />
                </div>

                {/* No flag here: it used to answer the flag question outright. */}
                <p className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-1">
                    {mode === "defend" ? `Defending ${round.target.name}` : `Attacking ${round.target.name}`}
                </p>
                <p className="font-bold text-sm mb-3">{question.prompt}</p>

                {question.kind === "name-flag" && (
                    <img
                        src={question.shown.image}
                        alt=""
                        className="w-full max-w-[13rem] mx-auto aspect-[3/2] object-cover rounded-xl shadow mb-3"
                    />
                )}

                {question.kind === "typed" && (
                    <motion.div key={shake} animate={shake ? { x: [0, -8, 8, -4, 0] } : undefined} transition={{ duration: 0.25 }}>
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") submitTyped() }}
                            autoFocus
                            autoComplete="off"
                            placeholder="Type your answer"
                            className="w-full px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-900 outline-none font-semibold"
                        />
                        {hint && <p className="mt-2 text-xs text-amber-500 font-semibold">{hint}</p>}
                        <button
                            type="button"
                            onClick={submitTyped}
                            className="mt-3 w-full py-3 rounded-2xl bg-rose-500 text-white font-bold"
                        >
                            Answer
                        </button>
                    </motion.div>
                )}

                {question.kind === "flag" && (
                    <div className="grid grid-cols-3 gap-2">
                        {question.options.map(option => (
                            <button
                                key={option.code}
                                type="button"
                                onClick={() => option.code === question.answerCode ? advance() : finish(false)}
                                className="aspect-[3/2] rounded-xl overflow-hidden border-2 border-transparent hover:border-rose-400 transition-colors"
                            >
                                <img src={option.image} alt="" className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                )}

                {(question.kind === "choice" || question.kind === "name-flag") && (
                    <div className="grid grid-cols-2 gap-2">
                        {question.options.map(option => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => option === question.answer ? advance() : finish(false)}
                                className="px-3 py-3 rounded-xl bg-slate-100 dark:bg-slate-900 text-sm font-semibold hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors text-left leading-tight"
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                )}

                <p className="mt-3 text-xs text-center text-slate-400">
                    {question.kind === "typed"
                        ? "Typos are forgiven - a wrong answer only costs you time."
                        : "One shot - a wrong pick loses the attack."}
                </p>
            </motion.div>
        </Backdrop>
    )
}

// --- Finished seasons --------------------------------------------------------

function StandingsTable({ standings, uid }: { standings: Standing[]; uid: string | null }) {
    return (
        <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-900/60 text-[10px] font-black uppercase tracking-wider text-slate-400">
                <span className="w-4">#</span>
                <span className="flex-1">Empire</span>
                <span className="w-10 text-right">Land</span>
                <span className="w-14 text-right">Strength</span>
            </div>
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                {standings.map((row, index) => (
                    <div
                        key={row.uid}
                        className={`flex items-center gap-2 px-3 py-1.5 text-xs ${row.uid === uid ? 'bg-sky-50 dark:bg-sky-900/30 font-bold' : ''}`}
                    >
                        <span className="w-4 text-slate-400 font-bold">{index + 1}</span>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorForPlayer(row.color) }} />
                        <span className="flex-1 truncate">{row.name}</span>
                        {index === 0 && <Crown size={12} className="text-amber-500 shrink-0" />}
                        <span className="w-10 text-right tabular-nums">{row.territories}</span>
                        <span className="w-14 text-right tabular-nums text-slate-400">{row.strength}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

/** The table everyone who played sees once, the first time they open a new season. */
function SeasonResults({ result, uid, onClose }: {
    result: SeasonResult
    uid: string | null
    onClose: () => void
}) {
    const mine = result.standings.findIndex(row => row.uid === uid)
    return (
        <Backdrop>
            <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl p-5 border border-white/70 dark:border-slate-700/70"
            >
                <div className="text-center mb-4">
                    <Crown className="mx-auto text-amber-500 mb-1" size={30} />
                    <p className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">
                        Season {result.number} is over
                    </p>
                    <p className="font-black text-lg leading-tight">{result.winner?.name} wins</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        {result.winner?.territories} territories held at the end
                    </p>
                </div>

                <StandingsTable standings={result.standings} uid={uid} />

                <p className="mt-3 text-xs text-center text-slate-500 dark:text-slate-400">
                    {mine >= 0
                        ? `You finished ${mine + 1} of ${result.standings.length}. The map has been wiped - everyone starts from nothing.`
                        : "The map has been wiped. Claim a homeland and start again."}
                </p>
                <button
                    type="button"
                    onClick={onClose}
                    className="mt-4 w-full py-3 rounded-2xl bg-rose-500 text-white font-bold"
                >
                    Start the new season
                </button>
            </motion.div>
        </Backdrop>
    )
}

function HallOfFame({ seasons, onClose }: { seasons: HallOfFameEntry[]; onClose: () => void }) {
    return (
        <Backdrop>
            <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl p-5 border border-white/70 dark:border-slate-700/70"
            >
                <div className="flex items-center gap-2 mb-3">
                    <Crown className="text-amber-500" size={20} />
                    <h2 className="font-black text-lg flex-1">Hall of Fame</h2>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                {seasons.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
                        No season has finished yet. The first name here is still up for grabs.
                    </p>
                ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                        {seasons.map(entry => (
                            <div key={entry.number} className="flex items-center gap-2.5 py-2">
                                <span className="w-16 text-[11px] font-black text-slate-400 shrink-0">
                                    Season {entry.number}
                                </span>
                                <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ background: colorForPlayer(entry.winnerColor) }}
                                />
                                <span className="flex-1 truncate font-bold text-sm">{entry.winnerName}</span>
                                <span className="text-xs text-slate-400 tabular-nums shrink-0">
                                    {entry.territories} land
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </motion.div>
        </Backdrop>
    )
}

// --- Result ------------------------------------------------------------------

/**
 * Every way a round can end, said plainly. A siege in particular has to explain
 * itself: the attacker walks away without the land and needs to know that is
 * expected, and the defender needs to know their land just changed hands.
 */
function OutcomeBanner({ outcome, onClose }: { outcome: Outcome; onClose: () => void }) {
    const country = countryByCode(outcome.code)
    const where = country?.name ?? outcome.code

    const copy: Record<Outcome["kind"], { icon: ReactNode; title: string; body: string }> = {
        claimed: {
            icon: <Sparkles className="text-amber-500" size={30} />,
            title: `${where} is yours`,
            body: "Unclaimed land, taken outright. Hold it and someone will come for it.",
        },
        "claim-failed": {
            icon: <X className="text-slate-400" size={30} />,
            title: `${where} slipped away`,
            body: "Wrong answer - the attack failed. That attack is spent.",
        },
        "siege-opened": {
            icon: <Swords className="text-rose-500" size={30} />,
            title: `You scored ${outcome.score} on ${where}`,
            body: `${outcome.otherName ?? "The holder"} has ${SIEGE_HOURS}h to answer the same questions. Beat your score and they keep it; fall short or never show, and it is yours.`,
        },
        "siege-failed": {
            icon: <X className="text-slate-400" size={30} />,
            title: `The siege of ${where} collapsed`,
            body: "Wrong answer, so there is nothing for the holder to answer. That attack is spent.",
        },
        defended: {
            icon: <Shield className="text-emerald-500" size={30} />,
            title: `${where} held`,
            body: `You scored ${outcome.score} against ${outcome.otherName}'s ${outcome.otherScore}. The land stays yours.`,
        },
        lost: {
            icon: <Flag className="text-rose-500" size={30} />,
            title: `${where} is lost`,
            body: `${outcome.otherName} scored ${outcome.otherScore}, you managed ${outcome.score}. The territory is theirs.`,
        },
        "claimed-unopposed": {
            icon: <Sparkles className="text-amber-500" size={30} />,
            title: `${where} fell without a fight`,
            body: `Nobody answered inside ${SIEGE_HOURS} hours, so the territory is yours.`,
        },
        "write-failed": {
            icon: <AlertTriangle className="text-amber-500" size={30} />,
            title: "That did not save",
            body: "The result could not be written. Check your connection - the attack was spent, but nothing changed hands.",
        },
        "defence-too-late": {
            icon: <Timer className="text-rose-500" size={30} />,
            title: `${where} ran out of time`,
            body: `The ${SIEGE_HOURS} hours were up before your answer landed, so ${outcome.otherName ?? "the attacker"} takes it. Defences have to be in before the clock stops.`,
        },
        "defence-moot": {
            icon: <Shield className="text-slate-400" size={30} />,
            title: `Nothing left to defend at ${where}`,
            body: "That siege has already been settled, or the territory changed hands while you were playing.",
        },
        "race-claimed": {
            icon: <Flag className="text-slate-400" size={30} />,
            title: `${where} was taken first`,
            body: `${outcome.otherName} claimed it moments before you finished. Your attack is spent, but the land is theirs now - you can lay siege to it next.`,
        },
        "race-besieged": {
            icon: <Swords className="text-slate-400" size={30} />,
            title: `${where} is already contested`,
            body: `${outcome.otherName} opened a siege on it first, scoring ${outcome.score}. Only one challenge at a time - wait for that one to settle.`,
        },
        "write-refused": {
            icon: <AlertTriangle className="text-rose-500" size={30} />,
            title: "The database refused that",
            body: "Your connection is fine - the write was rejected by the security rules. They probably have not been deployed yet. Nothing changed hands.",
        },
    }

    const { icon, title, body } = copy[outcome.kind]

    return (
        <Backdrop>
            <motion.button
                type="button"
                onClick={onClose}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-xs bg-white dark:bg-slate-800 rounded-3xl p-6 border border-white/70 dark:border-slate-700/70 text-center"
            >
                <div className="flex justify-center mb-2">{icon}</div>
                <p className="font-black text-lg">{title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{body}</p>
                <p className="text-[11px] text-slate-400 mt-3">Tap to dismiss</p>
            </motion.button>
        </Backdrop>
    )
}
