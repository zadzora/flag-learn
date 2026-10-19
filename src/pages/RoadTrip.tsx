/**
 * Road Trip - drive a little car across the world map; wherever it goes, the
 * cover lifts and the flags underneath show through.
 *
 * The page is one canvas and a progress bar, on purpose. The world's rules live
 * in `utils/roadTrip.ts` and the sprites in `utils/roadTripDraw.ts`; this file
 * is the loop that reads the controls, moves the car, and paints the frame:
 *
 *   ocean -> covered land -> flags (through the uncover mask) -> borders ->
 *   skid marks -> sea routes and ports -> smoke -> the car
 *
 * The flags are drawn into a second canvas and cut by the mask there, so the
 * cover never needs repainting: it is simply what shows where the flag layer
 * is empty.
 *
 * The car drives like a car, not like a cursor: W/S are throttle and brake
 * (reverse once stopped), A/D steer relative to where the car points. Its
 * velocity is kept apart from its heading, and grip only pulls the sideways
 * part of the velocity back in over time - so a hard turn at speed slides, and
 * once the slide is big enough the grip drops and the car drifts until the
 * player straightens up or counter-steers.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { BookOpen, Globe2, Loader2, Warehouse, Map as MapIcon, Navigation, RotateCcw, Volume2, VolumeX } from "lucide-react"
import TopBar, { BarButton } from "../components/TopBar"
import {
    CELL, GEO_URL, GRID_H, GRID_W, REVEAL_RADIUS, TRAIL_BREAK, TRAIL_SPACING, WORLD_H, WORLD_W,
    buildWorld, countSeen, countSeenByCountry, flagBitmap, flagRaster, flagRect, isRoad, loadFlagImage, loadTrip, onLand,
    maskFromGrid, pointOnRoute, randomStart, routeLength, saveTrip, trailWriter, uncover, uncoverCountry,
    type FlagBitmap, type FlagRaster, type Port, type Trip, type World,
} from "../utils/roadTrip"
import { CAR_UNITS, PALETTES, drawBoat, drawCar, drawFlames, drawPort, wavePattern } from "../utils/roadTripDraw"
import {
    ACHIEVEMENTS, CONTINENTS, MODELS, PAINTS, achievementById, allowedLook, continentOf, unlocksOf,
    type CarLook, type Continent, type Progress,
} from "../utils/roadTripGoals"
import { CountryCard, DriftMeter, Garage, NitroMeter, Passport, QuizCard, RallyPanel, RallyResult, TripToast, type Celebration, type DriftView, type GarageView, type NitroView, type RallyResultView, type RallyView, type PassportView, type Quiz, type Toast } from "../components/RoadTripUi"
import { createTripAudio, type TripAudio } from "../utils/roadTripAudio"
import {
    LANDMARK_PALETTES, buildLandmarks, discoverAt, drawHiddenLandmarks, drawLakes, drawLandmarkLabels, lakeRings, loadLandmarkData,
    type LandmarkKind, type Landmarks,
} from "../utils/roadTripLandmarks"
import {
    RALLY_BUCKET_LABELS, RALLY_GAME_KEY, RALLY_TARGETS, RALLY_TRIP_KEY, buildRally, loadRallySave, rallyBucket, saveRallySave,
} from "../utils/roadTripRally"
import { getTodayString } from "../utils/dailySeed"
import { activeStreak, readStreak, recordDailyResult, STREAK_KEYS } from "../utils/dailyStreak"
import { computeStanding, submitDailyResult, subscribeDailyStats, type DailyDistribution } from "../utils/dailyStats"
import DailyStanding from "../components/DailyStanding"
import { capitalOf, capitalPoints, emptyLog, loadLog, quizChoices, saveLog, type Choice } from "../utils/roadTripLog"

const THEME_KEY = "flag-master-theme"

/** The car's length on the map, in world pixels (one is ~10 km). */
const CAR_LENGTH = 3.2
/** Every speed and force below is in car lengths, so resizing the car keeps how it drives. */
const L = CAR_LENGTH

// Driving, in world pixels and seconds.
const MAX_SPEED = 13 * L
const REVERSE_SPEED = 4 * L
const ENGINE = 22.7 * L
const BRAKE = 34.5 * L
const ROLLING = 5.1 * L
const HANDBRAKE_DRAG = 7.3 * L
/** Yaw rate at full lock, radians per second. */
const STEER_RATE = 3.7
/** How quickly the wheel follows the keys - keys are on/off, a wheel is not. */
const STEER_RESPONSE = 8
/** How fast sideways velocity is pulled back in, per second. */
const GRIP = 9
const DRIFT_GRIP = 2.1
const HANDBRAKE_GRIP = 0.8
/** Sideways speed at which a slide becomes a drift, and below which it ends. */
const DRIFT_ENTER = 2.2 * L
const DRIFT_EXIT = 0.65 * L
/** Share of the speed into the coast that comes back out of a bounce. */
const BOUNCE = 0.6
/** Below this speed into the coast the car slides along it instead of bouncing. */
const BOUNCE_MIN = 1.5 * L
/** Spin a full-speed off-centre hit gives the car, radians per second, and how fast it wears off. */
const SPIN_KICK = 5
const SPIN_DECAY = 4
/** The car's nose, tail and corners, as (along, across) in half-lengths and half-widths. */
const BODY_POINTS = [[1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [-1, 0]] as const
/** Blocked this long while the player is steering or on the pedals counts as stuck... */
const STUCK_S = 0.45
/** ...and buys this long with only the centre of the car held to land. */
const UNSTICK_S = 0.9
/** Blocked this long, the car may turn on the spot. */
const PIVOT_AFTER_S = 0.12
/** How long a bounce is remembered when counting bounces in a row. */
const BOUNCE_MEMORY_S = 1.2
/** How long a full-speed bounce rolls free before the throttle bites again, seconds. */
const STUN_S = 0.3
/** Camera shake of a full-speed hit, in screen pixels. */
const SHAKE_PX = 7

/** Smallest the car gets, on the smallest islands. */
const MIN_CAR_SCALE = 0.4
/** Side of a square landmass (world pixels) at which the car is full size; Ireland is about 28, Japan's main island 75. */
const FULL_SIZE_SIDE = 70

/** How close the car has to come to a port to board. */
const PORT_RADIUS = 3
/** How close to a capital counts as driving through it, world pixels at full car size. */
const STAMP_RADIUS = 2.5
/** Sailing time is the route's length at this speed, held between the two bounds below. */
const SAIL_SPEED = 300
const SAIL_MIN_S = 1.1
const SAIL_MAX_S = 2.6
/** Time budget per frame for cutting flags to their countries, so a pan never stutters. */
const BITMAP_BUDGET_MS = 6
/** Above this zoom the flags are cut live from a sharp raster instead of drawn from the small bitmaps. */
const CLOSE_ZOOM = 2.4
/** Close-up flag rasters kept around; each is a few megabytes. */
const RASTER_CACHE = 24

/** Share of a country's road that uncovers the rest of it. The last scraps of coast are a chore, not a game. */
const COUNTRY_DONE = 0.98
/** The wipe that uncovers a finished country, and how long its card stays up. */
const REVEAL_MS = 1400
const CELEBRATE_MS = 3600
/** How far past the screen edge flags are prepared, as a share of the screen. */
const PREFETCH_MARGIN = 0.4
/** How often the trip is saved. Cheap now, but nothing needs it more often. */
const SAVE_EVERY_MS = 8000

/** How long a drift combo waits for the next slide before it is banked. */
const DRIFT_GRACE_S = 0.9
/** Seconds of sliding per step up the multiplier, and the highest it goes. */
const DRIFT_STEP_S = 1.2
const DRIFT_MAX_MULT = 5
/** Combos below this are not worth a toast. */
const DRIFT_MIN_BANK = 50
const SOUND_KEY = "road-trip-sound"

/** Nitro: charged by drifting (a full tank from about four seconds of hard sliding), spent while held. */
const NITRO_CHARGE = 0.28
const NITRO_DRAIN = 0.45
const NITRO_ACCEL = 30 * L
/** Top speed on nitro, as a multiple of the normal one. */
const NITRO_TOP = 1.55

const SKID_LIFE_S = 9
const MAX_SKIDS = 1600
const MAX_PUFFS = 90

/** Kept out of the component body: react-hooks/purity rejects Math.random and the clock there. */
function randomHeading(): number {
    return Math.random() * Math.PI * 2
}

function chance(p: number): boolean {
    return Math.random() < p
}

function clock(): number {
    return performance.now()
}

/** Wall-clock time, for the rally's clock that has to survive a reload. */
function wallClock(): number {
    return Date.now()
}

/** Today's finished rally, if there is one, as the result card shows it. */
function finishedRally(date: string): RallyResultView | null {
    const save = loadRallySave(date)
    if (save.status !== "done" || save.finishedMs === null) return null
    return { ms: save.finishedMs, bucket: rallyBucket(save.finishedMs), streak: activeStreak(readStreak(STREAK_KEYS.rally), date) }
}

function wrapAngle(a: number): number {
    while (a > Math.PI) a -= Math.PI * 2
    while (a < -Math.PI) a += Math.PI * 2
    return a
}

/** The country under the car, as the second bar shows it. */
type HereView = { index: number; label: string; code?: string; percent: number; done: boolean }
type Skid = { ax: number; ay: number; bx: number; by: number; t: number }
type Puff = { x: number; y: number; vx: number; vy: number; t: number; life: number }

/**
 * `mode="rally"` is the Daily Rally: the same map and car, but a fixed start
 * nobody is told, three countries to reach against the clock, no world view,
 * and nothing saved to the trip, the passport or the drift record.
 */
export default function RoadTrip({ mode = "trip" }: { mode?: "trip" | "rally" }) {
    const rallyMode = mode === "rally"
    const [today] = useState(getTodayString)
    const [theme, setTheme] = useState<"light" | "dark">(
        () => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light",
    )
    const [ready, setReady] = useState(false)
    const [failed, setFailed] = useState(false)
    const [percent, setPercent] = useState(0)
    const [overview, setOverview] = useState(false)
    const [moved, setMoved] = useState(false)
    const [here, setHere] = useState<HereView | null>(null)
    const [celebration, setCelebration] = useState<Celebration | null>(null)
    const [quiz, setQuiz] = useState<Quiz | null>(null)
    const [toast, setToast] = useState<Toast | null>(null)
    const [passport, setPassport] = useState<PassportView | null>(null)
    const [garage, setGarage] = useState<GarageView | null>(null)
    const [drift, setDrift] = useState<DriftView | null>(null)
    const [nitro, setNitro] = useState<NitroView>({ charge: 0, active: false })
    const [muted, setMuted] = useState(() => localStorage.getItem(SOUND_KEY) === "off")
    const [rally, setRally] = useState<RallyView | null>(null)
    const [rallyResult, setRallyResult] = useState<RallyResultView | null>(() => (rallyMode ? finishedRally(today) : null))
    const [resultOpen, setResultOpen] = useState(true)
    const [distribution, setDistribution] = useState<DailyDistribution | null>(null)
    const [statsError, setStatsError] = useState(false)

    const canvasRef = useRef<HTMLCanvasElement>(null)
    const worldRef = useRef<World | null>(null)
    const landmarksRef = useRef<Landmarks | null>(null)
    const overviewRef = useRef(false)
    const themeRef = useRef(theme)
    const resetRef = useRef<() => void>(() => {})
    /** Hands the quiz answer back to the loop, which finishes the country. */
    const answerRef = useRef<(index: number, correct: boolean) => void>(() => {})
    /** Reads the passport off the loop's state. */
    const passportRef = useRef<() => PassportView | null>(() => null)
    /** Pauses the loop while the passport is open. */
    const pausedRef = useRef(false)
    /** Held by the on-screen nitro button, for touch. */
    const nitroHeldRef = useRef(false)
    /** Hands a garage pick to the loop, and reads the garage off it. */
    const garageRef = useRef<(look: CarLook) => void>(() => {})
    const garageViewRef = useRef<() => GarageView | null>(() => null)
    const audioRef = useRef<TripAudio | null>(null)
    const mutedRef = useRef(muted)

    useEffect(() => {
        mutedRef.current = muted
        audioRef.current?.setMuted(muted)
        localStorage.setItem(SOUND_KEY, muted ? "off" : "on")
    }, [muted])

    useEffect(() => {
        const root = document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
        themeRef.current = theme
    }, [theme])

    useEffect(() => {
        overviewRef.current = overview
    }, [overview])

    // --- The world, built once -------------------------------------------------

    useEffect(() => {
        let alive = true
        // The landmarks come with the map because the lakes in them are water the
        // world is built around. Without them the game still runs, just with no lakes.
        Promise.all([
            fetch(GEO_URL).then(r => r.json()),
            loadLandmarkData().catch(() => null),
        ])
            .then(([topo, landmarkData]) => {
                if (!alive) return
                worldRef.current = buildWorld(topo, landmarkData ? lakeRings(landmarkData) : [])
                landmarksRef.current = landmarkData ? buildLandmarks(landmarkData) : null
                setReady(true)
            })
            .catch(() => { if (alive) setFailed(true) })
        return () => { alive = false }
    }, [])

    // --- The loop ----------------------------------------------------------------

    useEffect(() => {
        const world = worldRef.current
        const canvas = canvasRef.current
        if (!ready || !world || !canvas) return
        const ctx = canvas.getContext("2d")!
        const audio = createTripAudio(mutedRef.current)
        audioRef.current = audio
        const layer = document.createElement("canvas")
        const lctx = layer.getContext("2d")!
        /** The uncover mask for the current frame: the saved history plus this session's trail. */
        const cut = document.createElement("canvas")
        const cctx = cut.getContext("2d")!

        // The rally save goes first: on a new day it clears yesterday's rally ground before it is loaded.
        const rallyPlan = rallyMode ? buildRally(world, today) : null
        const rallyRun = rallyMode ? loadRallySave(today) : null
        const saved = loadTrip(world, rallyMode ? RALLY_TRIP_KEY : undefined)
        const startAt = saved ?? (rallyPlan ? { ...rallyPlan.start } : { ...randomStart(world), heading: randomHeading() })
        const trip: Trip = saved ?? { seen: new Uint8Array(GRID_W * GRID_H), trail: [], ...startAt }
        const car = {
            x: trip.x, y: trip.y, heading: trip.heading,
            vx: 0, vy: 0, steer: 0, drifting: false, braking: false,
            /** Yaw left over from a bounce, radians per second; it dies away on its own. */
            spin: 0,
            /** Seconds left in which a bounce rolls freely, throttle and brake ignored. */
            stun: 0,
            /** How long the car has been blocked while the player tries to move it, and the relaxed-collision time that buys. */
            stuckFor: 0,
            unstick: 0,
            /** Recent bounces, decaying - several in a row mean the car is ping-ponging in a corner. */
            bounces: 0,
            /** Nitro in the tank, 0..1, whether it is firing, and a smoothed 0..1 of that for the flames and camera. */
            nitro: 0,
            boosting: false,
            boost: 0,
            /** 1 on a continent, down to MIN_CAR_SCALE on a small island. */
            scale: 1,
        }

        /**
         * How big the car should be where (x, y) is: by the size of the landmass,
         * so Jamaica gets a small car and a close camera instead of a car that
         * crosses it in a blink. Measured by area, not by the room around the
         * car - shrinking in every narrow valley of a continent would be noise.
         */
        const scaleAt = (x: number, y: number): number => {
            const m = world.landmass[Math.floor(y) * WORLD_W + Math.floor(x)]
            if (!m) return car.scale
            return Math.max(MIN_CAR_SCALE, Math.min(1, Math.sqrt(world.landmassArea[m - 1]) / FULL_SIZE_SIDE))
        }
        car.scale = scaleAt(car.x, car.y)

        /**
         * The uncovered map, kept twice. Up close it is drawn from the trail - the
         * line the car drove, stroked as wide as the uncover circle with round
         * ends, which is exactly the ground it swept and stays smooth at any zoom
         * however sparsely the saved points sit. Zoomed out it is drawn from a
         * raster of the grid: there one world pixel is under a screen pixel, so
         * the raster is exact, and a long trip would otherwise be stroked whole
         * every frame. Finished countries are filled whole in both.
         */
        let history = maskFromGrid(trip.seen)
        let seenCount = countSeen(world, trip.seen)
        let perCountry = countSeenByCountry(world, trip.seen)
        let dirty = false

        const countryPaths = new Map<number, Path2D>()
        const countryPath = (index: number): Path2D => {
            let path = countryPaths.get(index)
            if (!path) {
                path = new Path2D()
                for (const part of world.parts) if (part.country === index) path.addPath(part.path)
                countryPaths.set(index, path)
            }
            return path
        }

        // --- Finishing a country -------------------------------------------------

        const completed = new Set<number>()
        /** The wipe running across a country that was just finished. */
        let reveal: { country: number; x: number; y: number; radius: number; start: number } | null = null
        let celebrateTimer = 0
        let celebrateKey = 0
        let log = rallyMode ? emptyLog() : loadLog()
        /** The rally scores nothing into the trip's passport. */
        const keepLog = (l: typeof log) => { if (!rallyMode) saveLog(l) }
        /** The country whose question is on screen; the game holds still until it is answered. */
        let asking = -1
        /** Every country with a flag and road, as quiz choices. */
        const choicePool: Choice[] = world.countries
            .filter(c => c.code && c.roadCells > 0)
            .map(c => ({ code: c.code!, label: c.label }))

        // --- Continents and badges ------------------------------------------------

        /** The countries of each continent that the car can reach. */
        const continentMembers = Object.fromEntries(CONTINENTS.map(c => [c, [] as number[]])) as Record<Continent, number[]>
        world.countries.forEach((c, i) => {
            const ct = c.code && c.roadCells > 0 ? continentOf(c.code) : undefined
            if (ct) continentMembers[ct].push(i)
        })
        const continentDone = (ct: Continent) => continentMembers[ct].length > 0 && continentMembers[ct].every(i => completed.has(i))
        /** Assigned once the toasts exist; completing a country can run before that, on load. */
        let checkGoals: (announce?: boolean) => void = () => {}
        /** The car as picked in the garage - kept even in a rally, which otherwise saves nothing. */
        const savedLog = loadLog()
        let look = allowedLook(savedLog.car, savedLog.achievements)

        const completeCountry = (index: number, celebrate: boolean, correct: boolean | null = null) => {
            completed.add(index)
            seenCount += uncoverCountry(world, trip.seen, index, perCountry)
            const hctx = history.getContext("2d")!
            hctx.fillStyle = "#fff"
            hctx.fill(countryPath(index), "evenodd")
            if (!celebrate) return

            // The wipe starts under the car and runs out to the country's furthest corner.
            let radius = 0
            for (const part of world.parts) {
                if (part.country !== index) continue
                for (const [x, y] of [[part.x, part.y], [part.x + part.w, part.y], [part.x, part.y + part.h], [part.x + part.w, part.y + part.h]]) {
                    radius = Math.max(radius, Math.hypot(x - car.x, y - car.y))
                }
            }
            reveal = { country: index, x: car.x, y: car.y, radius, start: clock() }
            const country = world.countries[index]
            setCelebration({ key: ++celebrateKey, label: country.label, code: country.code, correct })
            audio.complete()
            clearTimeout(celebrateTimer)
            celebrateTimer = window.setTimeout(() => setCelebration(null), CELEBRATE_MS)
            // The last country of a continent: its own, bigger moment once the country's card has had its turn.
            const ct = country.code ? continentOf(country.code) : undefined
            if (ct && continentDone(ct)) {
                celebrateTimer = window.setTimeout(() => {
                    setCelebration({ key: ++celebrateKey, label: ct, correct: null, kind: "continent" })
                    audio.badge()
                    celebrateTimer = window.setTimeout(() => setCelebration(null), CELEBRATE_MS + 800)
                }, CELEBRATE_MS - 400)
            }
            checkGoals()
        }
        const checkDone = (index: number, celebrate: boolean) => {
            if (rallyMode) return
            const country = world.countries[index]
            if (completed.has(index) || index === asking || !country.roadCells) return
            if (perCountry[index] < country.roadCells * COUNTRY_DONE) return
            // A country finished while driving asks its name first: the flag is nearly all
            // uncovered by now, and naming it is the point of having driven it.
            if (celebrate && country.code && asking < 0) {
                asking = index
                // Not stopCar(): this can run from the very first uncover, before that is defined.
                car.vx = car.vy = car.spin = 0
                const answer = { code: country.code, label: country.label }
                setQuiz({ index, code: country.code, label: country.label, choices: quizChoices(answer, choicePool, Math.random), picked: null })
                return
            }
            completeCountry(index, celebrate)
        }
        answerRef.current = (index, correct) => {
            const code = world.countries[index].code
            if (code) log.known[code] = correct
            log.streak.current = correct ? log.streak.current + 1 : 0
            log.streak.best = Math.max(log.streak.best, log.streak.current)
            keepLog(log)
            asking = -1
            completeCountry(index, true, correct)
        }
        // Countries finished on an earlier visit come back finished, without the fanfare.
        world.countries.forEach((_, i) => checkDone(i, false))

        // --- The trail -----------------------------------------------------------

        // Saved points as segments, bucketed by area so a frame only strokes the ones near the screen.
        // The stretch from the last saved point to the car is drawn live each frame instead.
        const BUCKET = 32
        const BREAK = TRAIL_BREAK
        const trail = new Map<number, number[]>()
        const addSegment = (ax: number, ay: number, bx: number, by: number) => {
            const key = Math.floor(by / BUCKET) * 1000 + Math.floor(bx / BUCKET)
            let bucket = trail.get(key)
            if (!bucket) trail.set(key, (bucket = []))
            bucket.push(ax, ay, bx, by)
        }
        for (let i = 0; i < trip.trail.length; i += 2) {
            const x = trip.trail[i], y = trip.trail[i + 1]
            const joined = i >= 2 && Math.hypot(x - trip.trail[i - 2], y - trip.trail[i - 1]) <= BREAK
            if (joined) addSegment(trip.trail[i - 2], trip.trail[i - 1], x, y)
            else addSegment(x, y, x, y)
        }
        /** The last point written to the saved trail, which is thinned to TRAIL_SPACING. */
        let lastKept = trip.trail.length
            ? { x: trip.trail[trip.trail.length - 2], y: trip.trail[trip.trail.length - 1] }
            : { x: Infinity, y: Infinity }

        const touched = new Set<number>()
        const stamp = { x: Infinity, y: Infinity }
        const uncoverHere = () => {
            touched.clear()
            seenCount += uncover(world, trip.seen, car.x, car.y, perCountry, touched)
            if (Math.hypot(car.x - lastKept.x, car.y - lastKept.y) >= TRAIL_SPACING) {
                const x = Math.round(car.x * 4) / 4, y = Math.round(car.y * 4) / 4
                if (Math.hypot(x - lastKept.x, y - lastKept.y) <= BREAK) addSegment(lastKept.x, lastKept.y, x, y)
                else addSegment(x, y, x, y)
                trip.trail.push(x, y)
                lastKept = { x, y }
            }
            const hctx = history.getContext("2d")!
            hctx.fillStyle = "#fff"
            hctx.beginPath()
            hctx.arc(car.x, car.y, REVEAL_RADIUS, 0, Math.PI * 2)
            hctx.fill()
            stamp.x = car.x
            stamp.y = car.y
            dirty = true
            for (const index of touched) checkDone(index, true)
        }
        uncoverHere()

        // --- Capitals -----------------------------------------------------------
        //
        // Each capital sits on the nearest road, since the coarse map puts a few
        // coastal ones (Lisbon, Copenhagen) a pixel out to sea. Driving through one stamps it.

        const capitals = capitalPoints().flatMap(cap => {
            for (let r = 0; r <= 8; r++) {
                for (let a = 0; a < Math.max(1, r * 8); a++) {
                    const x = cap.x + Math.cos((a / Math.max(1, r * 8)) * Math.PI * 2) * r
                    const y = cap.y + Math.sin((a / Math.max(1, r * 8)) * Math.PI * 2) * r
                    if (isRoad(world, x, y)) return [{ ...cap, x, y }]
                }
            }
            return []
        })
        let toastTimer = 0
        let toastKey = 0
        const showToast = (text: string, tone: Toast["tone"]) => {
            setToast({ key: ++toastKey, text, tone })
            clearTimeout(toastTimer)
            toastTimer = window.setTimeout(() => setToast(null), 2200)
        }
        const stampCapitals = () => {
            if (rallyMode) return
            for (const cap of capitals) {
                if (Math.abs(cap.x - car.x) > STAMP_RADIUS || Math.abs(cap.y - car.y) > STAMP_RADIUS) continue
                if (Math.hypot(cap.x - car.x, cap.y - car.y) > STAMP_RADIUS * car.scale + 1) continue
                if (log.stamps.includes(cap.code)) continue
                log.stamps.push(cap.code)
                keepLog(log)
                showToast(`Capital stamped · ${cap.name}`, "stamp")
                audio.stamp()
                checkGoals()
            }
        }

        // --- Landmarks ------------------------------------------------------------
        //
        // The first time the car reaches a river, range, lake or peak it is
        // discovered: a toast, a sound, and a line in the passport. Several at once
        // (a river through a range) share one toast rather than queue up.

        const discoverLandmarks = () => {
            const lm = landmarksRef.current
            if (!lm || rallyMode) return
            const found = discoverAt(lm, car.x, car.y, REVEAL_RADIUS, key => log.landmarks.includes(key))
            if (!found.length) return
            for (const f of found) log.landmarks.push(f.key)
            keepLog(log)
            showToast(`Discovered · ${found.map(f => f.name).join(", ")}`, "discover")
            audio.stamp()
            checkGoals()
        }

        // --- Drift combos --------------------------------------------------------
        //
        // Sliding scores by how hard the car is going sideways, and the multiplier
        // climbs the longer a combo lasts. A pause shorter than DRIFT_GRACE_S
        // keeps it alive; bouncing off the coast throws the whole combo away.

        const combo = { points: 0, time: 0, grace: 0, mult: 1 }
        let shownDrift = -1
        let lastDriftAt = 0
        const publishDrift = () => {
            const value = Math.round(combo.points)
            const now = clock()
            if (value === shownDrift || (value && now - lastDriftAt < 100)) return
            shownDrift = value
            lastDriftAt = now
            setDrift(value ? { points: value, mult: combo.mult } : null)
        }
        let shownNitro = { charge: -1, active: false }
        const publishNitro = () => {
            const charge = Math.round(car.nitro * 50) / 50
            if (charge === shownNitro.charge && car.boosting === shownNitro.active) return
            shownNitro = { charge, active: car.boosting }
            setNitro(shownNitro)
        }
        const endCombo = () => {
            combo.points = combo.time = combo.grace = 0
            combo.mult = 1
        }
        const bankDrift = () => {
            const points = Math.round(combo.points)
            endCombo()
            if (points < DRIFT_MIN_BANK) return
            log.drift.total += points
            log.drift.best = Math.max(log.drift.best, points)
            keepLog(log)
            showToast(`Drift +${points.toLocaleString()}`, "drift")
            audio.driftBanked()
            checkGoals()
        }
        const loseDrift = () => {
            if (combo.points >= DRIFT_MIN_BANK) {
                showToast("Drift lost", "crash")
                audio.driftLost()
            }
            endCombo()
        }

        // --- The rally -----------------------------------------------------------

        const publishRally = () => {
            if (!rallyPlan || !rallyRun) return
            setRally({
                number: rallyPlan.number,
                targets: rallyPlan.targets.map(t => ({ ...t, reached: rallyRun.reached.includes(t.code) })),
                startedAt: rallyRun.startedAt,
                finishedMs: rallyRun.finishedMs,
            })
        }
        const startRallyClock = () => {
            if (!rallyRun || rallyRun.startedAt !== null || rallyRun.status === "done") return
            rallyRun.startedAt = wallClock()
            saveRallySave(rallyRun)
            publishRally()
        }
        const checkRally = () => {
            if (!rallyPlan || !rallyRun || rallyRun.status === "done" || rallyRun.startedAt === null) return
            const here = world.cellCountry[Math.floor(car.y / CELL) * GRID_W + Math.floor(car.x / CELL)] - 1
            const target = rallyPlan.targets.find(t => t.index === here && !rallyRun.reached.includes(t.code))
            if (!target) return
            rallyRun.reached.push(target.code)
            audio.complete()
            if (rallyRun.reached.length < RALLY_TARGETS) {
                showToast(`Reached ${target.label}`, "stamp")
            } else {
                const ms = wallClock() - rallyRun.startedAt
                rallyRun.finishedMs = ms
                rallyRun.status = "done"
                const streak = activeStreak(recordDailyResult(STREAK_KEYS.rally, today, true), today)
                submitDailyResult(RALLY_GAME_KEY, today, 9, rallyBucket(ms)).catch(() => {})
                setRallyResult({ ms, bucket: rallyBucket(ms), streak })
            }
            saveRallySave(rallyRun)
            publishRally()
        }
        publishRally()

        const progress = (): Progress => {
            const found = (kind: string) => log.landmarks.filter(k => k.startsWith(kind + ":")).length
            return {
                countries: world.countries.filter((c, i) => c.code && completed.has(i)).length,
                named: Object.values(log.known).filter(Boolean).length,
                namedInARow: log.streak.best,
                stamps: log.stamps.length,
                rivers: found("river"),
                ranges: found("range"),
                peaks: found("peak"),
                lakes: found("lake"),
                driftBest: log.drift.best,
                crossings: log.crossings,
                boosts: log.boosts,
                continentsDone: CONTINENTS.filter(continentDone),
            }
        }
        /**
         * Awards whatever badges the progress now meets. A badge that opens a car
         * or a paint says so in its toast. Silent on load, where anything already
         * met is simply marked earned.
         */
        checkGoals = (announce = true) => {
            if (rallyMode) return
            const p = progress()
            const fresh = ACHIEVEMENTS.filter(a => !log.achievements.includes(a.id) && a.test(p))
            if (!fresh.length) return
            for (const a of fresh) log.achievements.push(a.id)
            keepLog(log)
            if (!announce) return
            const unlocked = fresh.flatMap(a => unlocksOf(a.id))
            const more = fresh.length > 1 ? ` +${fresh.length - 1}` : ""
            showToast(`Badge · ${fresh[0].title}${more}${unlocked.length ? ` - ${unlocked.join(", ")} unlocked` : ""}`, "badge")
            audio.badge()
        }
        checkGoals(false)

        garageRef.current = picked => {
            log.car = picked
            look = allowedLook(picked, log.achievements)
            keepLog(log)
        }

        /** How many of each landmark there are to find; a range in several pieces counts once. */
        const landmarkTotals = (): Record<LandmarkKind, number> => {
            const lm = landmarksRef.current
            if (!lm) return { river: 0, lake: 0, range: 0, peak: 0 }
            return {
                river: new Set(lm.rivers.map(r => r.key)).size,
                lake: new Set(lm.lakes.map(l => l.key)).size,
                range: new Set(lm.ranges.map(r => r.key)).size,
                peak: new Set(lm.peaks.map(p => p.key)).size,
            }
        }

        passportRef.current = () => {
            const entries = world.countries
                .map((c, i) => ({ c, i }))
                .filter(({ c, i }) => c.code && completed.has(i))
                .map(({ c }) => ({
                    code: c.code!,
                    label: c.label,
                    capital: capitalOf(c.code!),
                    stamped: log.stamps.includes(c.code!),
                    known: c.code! in log.known ? log.known[c.code!] : null,
                }))
                .sort((a, b) => a.label.localeCompare(b.label))
            const drivable = world.countries.filter(c => c.code && c.roadCells > 0).length
            return {
                entries,
                remaining: drivable - entries.length,
                stamps: log.stamps.length,
                known: Object.values(log.known).filter(Boolean).length,
                drift: { ...log.drift },
                landmarks: log.landmarks.map(key => {
                    const at = key.indexOf(":")
                    return { kind: key.slice(0, at) as LandmarkKind, name: key.slice(at + 1) }
                }),
                landmarkTotals: landmarkTotals(),
                continents: CONTINENTS.map(ct => {
                    const members = continentMembers[ct]
                    let seenCells = 0, cells = 0
                    for (const i of members) { seenCells += perCountry[i]; cells += world.countries[i].roadCells }
                    return {
                        name: ct,
                        done: members.filter(i => completed.has(i)).length,
                        total: members.length,
                        percent: cells ? Math.min(100, (seenCells / cells) * 100) : 0,
                    }
                }),
                achievements: ACHIEVEMENTS.map(a => ({ id: a.id, title: a.title, detail: a.detail, earned: log.achievements.includes(a.id) })),
            }
        }

        garageViewRef.current = () => ({
            selected: look,
            models: MODELS.map(m => ({ id: m.id, label: m.label, unlocked: !m.unlock || log.achievements.includes(m.unlock), requirement: m.unlock ? achievementById(m.unlock)?.detail : undefined })),
            paints: PAINTS.map(p => ({ id: p.id, label: p.label, colour: p.colours.top, unlocked: !p.unlock || log.achievements.includes(p.unlock), requirement: p.unlock ? achievementById(p.unlock)?.detail : undefined })),
        })

        const portsById = new Map(world.ports.map(p => [p.id, p]))
        const onDryLine = (ax: number, ay: number, bx: number, by: number) => {
            const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2)
            for (let i = 0; i <= n; i++) {
                const t = n ? i / n : 0
                if (!onLand(world, ax + (bx - ax) * t, ay + (by - ay) * t)) return false
            }
            return true
        }
        /** The port the car just came off, which stays quiet until the car drives away from it. */
        let landedAt: string | null = null
        let sail: { legs: [number, number][][]; length: number; travelled: number; duration: number; to: Port; leg: number } | null = null

        const skids: Skid[] = []
        const puffs: Puff[] = []
        /** Where each rear tyre was last frame, so a skid mark is a line, not a dotted trail. */
        let lastTyres: [number, number, number, number] | null = null

        // Flags, loaded in the background and cut to shape as they come into view.
        const images = new Map<string, HTMLImageElement | null>()
        const bitmaps = new Map<number, FlagBitmap | null>()
        let alive = true
        const codes = [...new Set(world.countries.map(c => c.code).filter((c): c is string => !!c))]
        for (const code of codes) {
            loadFlagImage(code).then(image => { if (alive) images.set(code, image) })
        }

        // Sharp close-up rasters, made off the frame and ahead of the car (see flagRaster).
        //
        // `wanted` is the nearest RASTER_CACHE countries, and nothing in it is ever
        // evicted. Without that rule a crowded view (Europe) asked for more flags
        // than the cache holds, every new one pushed out one still on screen, that
        // one was asked for again - and the GPU spent every frame making and
        // throwing away bitmaps, down to one frame a second.
        const rasters = new Map<string, FlagRaster>()
        const pending = new Set<string>()
        let wanted = new Set<string>()
        const release = (raster: FlagRaster) => { if ("close" in raster) raster.close() }
        const requestRaster = (code: string) => {
            if (rasters.has(code) || pending.has(code) || pending.size >= 2) return
            const image = images.get(code)
            if (!image || !image.naturalWidth) return
            pending.add(code)
            flagRaster(image).then(raster => {
                pending.delete(code)
                if (!alive || !wanted.has(code)) { release(raster); return }
                rasters.set(code, raster)
                for (const old of [...rasters.keys()]) {
                    if (rasters.size <= RASTER_CACHE) break
                    if (wanted.has(old)) continue
                    release(rasters.get(old)!)
                    rasters.delete(old)
                }
            })
        }
        /** Re-picks the flags worth having sharp: the nearest countries to the camera, on screen or about to be. */
        const pickWanted = (left: number, top: number, right: number, bottom: number) => {
            const mw = (right - left) * PREFETCH_MARGIN, mh = (bottom - top) * PREFETCH_MARGIN
            const cx = (left + right) / 2, cy = (top + bottom) / 2
            const nearest = new Map<string, number>()
            for (const part of world.parts) {
                const code = world.countries[part.country].code
                if (!code) continue
                if (part.x > right + mw || part.x + part.w < left - mw || part.y > bottom + mh || part.y + part.h < top - mh) continue
                const dx = Math.max(part.x - cx, 0, cx - part.x - part.w), dy = Math.max(part.y - cy, 0, cy - part.y - part.h)
                const d = Math.hypot(dx, dy)
                if (d < (nearest.get(code) ?? Infinity)) nearest.set(code, d)
            }
            const order = [...nearest.entries()].sort((a, b) => a[1] - b[1]).slice(0, RASTER_CACHE).map(([code]) => code)
            wanted = new Set(order)
            for (const code of order) requestRaster(code)
        }

        // Size
        let cw = 1, ch = 1, dpr = 1
        const resize = () => {
            const box = canvas.parentElement!.getBoundingClientRect()
            dpr = Math.min(2, window.devicePixelRatio || 1)
            cw = Math.max(1, box.width)
            ch = Math.max(1, box.height)
            canvas.width = layer.width = cut.width = Math.round(cw * dpr)
            canvas.height = layer.height = cut.height = Math.round(ch * dpr)
        }
        resize()
        const observer = new ResizeObserver(resize)
        observer.observe(canvas.parentElement!)

        // A smaller car gets a closer camera, so it is the same size on screen and drives the same.
        // On nitro the camera pulls back a little, so the speed reads.
        const driveZoom = () => (Math.min(11, Math.max(6, Math.max(cw, ch) / 160)) / car.scale) * (1 - 0.12 * car.boost)
        const overviewZoom = () => Math.min(cw / WORLD_W, (ch - 130) / WORLD_H) * 0.96
        /** The bar sits over the bottom of the canvas, so the camera aims a little above the middle. */
        const focusY = () => (ch - 104) / 2

        const cam = { x: car.x, y: car.y, zoom: overviewRef.current ? overviewZoom() : driveZoom() }

        // Controls. Physical keys (e.code), so WASD sits in the same place on every layout.
        const keys = new Set<string>()
        let pointer: { x: number; y: number } | null = null
        const DRIVE_KEYS = new Set([
            "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight",
        ])
        const onKeyDown = (e: KeyboardEvent) => {
            audio.unlock()
            const target = e.target as HTMLElement | null
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return
            if (DRIVE_KEYS.has(e.code)) {
                keys.add(e.code)
                e.preventDefault()
            } else if (e.code === "KeyM" && !rallyMode) {
                e.preventDefault()
                if (!e.repeat) setOverview(v => !v)
            }
        }
        const onKeyUp = (e: KeyboardEvent) => { keys.delete(e.code) }
        const onBlur = () => { keys.clear(); pointer = null }
        const local = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect()
            return { x: e.clientX - rect.left, y: e.clientY - rect.top }
        }
        const onPointerDown = (e: PointerEvent) => {
            audio.unlock()
            canvas.setPointerCapture(e.pointerId)
            pointer = local(e)
        }
        const onPointerMove = (e: PointerEvent) => { if (pointer) pointer = local(e) }
        const onPointerUp = () => { pointer = null }
        window.addEventListener("keydown", onKeyDown)
        window.addEventListener("keyup", onKeyUp)
        window.addEventListener("blur", onBlur)
        canvas.addEventListener("pointerdown", onPointerDown)
        canvas.addEventListener("pointermove", onPointerMove)
        canvas.addEventListener("pointerup", onPointerUp)
        canvas.addEventListener("pointercancel", onPointerUp)

        // Saving. Only the trail is written, encoded as it grows, so a save costs the
        // last few seconds of driving rather than the whole map - and it waits for an
        // idle moment. Encoding the full grid every 4 s was a ~20 ms jolt in the driving.
        let writer = trailWriter()
        const save = () => {
            if (!dirty) return
            trip.x = car.x
            trip.y = car.y
            trip.heading = car.heading
            saveTrip(trip, writer.write(trip.trail), rallyMode ? RALLY_TRIP_KEY : undefined)
            dirty = false
        }
        const whenIdle = (fn: () => void) => {
            if ("requestIdleCallback" in window) window.requestIdleCallback(fn, { timeout: 2000 })
            else setTimeout(fn, 0)
        }
        const saveTimer = setInterval(() => whenIdle(save), SAVE_EVERY_MS)
        const onHidden = () => { if (document.visibilityState === "hidden") save() }
        window.addEventListener("pagehide", save)
        document.addEventListener("visibilitychange", onHidden)

        // The country under the car, for the second bar.
        let currentCountry = -1
        let shownCountry: HereView | null = null
        let lastCountryAt = 0
        const publishCountry = () => {
            const under = sail ? 0 : world.cellCountry[Math.floor(car.y / CELL) * GRID_W + Math.floor(car.x / CELL)] ?? 0
            // On a border pixel or at sea, keep showing the last country.
            if (under && world.countries[under - 1].roadCells) currentCountry = under - 1
            if (currentCountry < 0) return
            const country = world.countries[currentCountry]
            const done = completed.has(currentCountry)
            const percent = done ? 100 : Math.min(100, (perCountry[currentCountry] / country.roadCells) * 100)
            const now = clock()
            if (shownCountry && shownCountry.index === currentCountry && shownCountry.done === done
                && (Math.abs(percent - shownCountry.percent) < 0.05 || now - lastCountryAt < 150)) return
            lastCountryAt = now
            shownCountry = { index: currentCountry, label: country.label, code: country.code, percent, done }
            setHere(shownCountry)
        }

        let shownPercent = -1
        let lastPercentAt = 0
        let announcedMove = false
        const publishPercent = (force = false) => {
            const value = world.roadCellCount ? (seenCount / world.roadCellCount) * 100 : 0
            const now = clock()
            if (value === shownPercent || (!force && now - lastPercentAt < 200)) return
            shownPercent = value
            lastPercentAt = now
            setPercent(value)
        }
        publishPercent(true)

        const stopCar = () => {
            car.vx = car.vy = 0
            car.steer = 0
            car.drifting = false
            car.spin = 0
            car.stun = 0
            car.stuckFor = car.unstick = car.bounces = 0
            lastTyres = null
        }

        // --- Bouncing off the coast ----------------------------------------------

        /**
         * The way into land at (x, y), from the shape of the coast around it: the
         * directions that lead into water, summed and turned round. Reading it
         * off the raster rather than the axes is what lets a bounce off a
         * diagonal coastline go diagonally.
         */
        const coastNormal = (x: number, y: number): [number, number] => {
            let wx = 0, wy = 0
            // The car's centre now stops half a car short of the water, so look from there outwards.
            const reach = halfLength()
            for (const r of [reach * 0.8 + 1, reach + 2.5]) {
                for (let k = 0; k < 16; k++) {
                    const a = (k / 16) * Math.PI * 2
                    const dx = Math.cos(a), dy = Math.sin(a)
                    if (!onLand(world, x + dx * r, y + dy * r)) { wx += dx; wy += dy }
                }
            }
            const len = Math.hypot(wx, wy)
            if (len < 1e-6) {
                // Water all round or nowhere: push straight back against the motion.
                const v = Math.hypot(car.vx, car.vy) || 1
                return [-car.vx / v, -car.vy / v]
            }
            return [-wx / len, -wy / len]
        }

        // --- The car's body against the coast ----------------------------------------

        const halfLength = () => CAR_LENGTH * car.scale * 0.5
        /**
         * Whether the whole car is on land at (x, y) facing `heading` - its nose,
         * its tail and its four corners. Holding only the centre to land let half
         * the car hang out over the sea before anything stopped it.
         */
        const bodyFits = (x: number, y: number, heading: number): boolean => {
            if (!onLand(world, x, y)) return false
            const hl = halfLength(), hw = CAR_LENGTH * car.scale * 0.28
            const fx = Math.cos(heading), fy = Math.sin(heading)
            const rx = -fy, ry = fx
            let cornersOut = 0
            for (const [a, b] of BODY_POINTS) {
                if (onLand(world, x + fx * hl * a + rx * hw * b, y + fy * hl * a + ry * hw * b)) continue
                // Nose and tail must be on land; a corner may hang over the edge. Holding all four
                // corners too wedged the car in every sharp cape and at the tip of a narrow island,
                // where any move or turn put one corner over the water.
                if (b === 0) return false
                if (++cornersOut > 2) return false
            }
            return true
        }

        /** How hard the camera is shaking, 0 to 1; a bounce sets it, it settles by itself. */
        let shake = 0

        /** Spray thrown back off the water where the car hit it. */
        const splash = (x: number, y: number, lx: number, ly: number, hit: number, time: number) => {
            const count = Math.round(4 + hit * 8)
            for (let i = 0; i < count && puffs.length < MAX_PUFFS; i++) {
                const spread = (Math.random() - 0.5) * 2.2
                const along = Math.atan2(-ly, -lx) + spread
                const speed = (1.5 + Math.random() * 3) * L * car.scale * (0.5 + hit)
                puffs.push({
                    x, y,
                    vx: Math.cos(along) * speed,
                    vy: Math.sin(along) * speed,
                    t: time, life: 0.35 + Math.random() * 0.35,
                })
            }
        }

        resetRef.current = () => {
            trip.seen.fill(0)
            seenCount = 0
            log = emptyLog()
            keepLog(log)
            asking = -1
            const start = randomStart(world)
            car.x = start.x
            car.y = start.y
            car.heading = randomHeading()
            stopCar()
            car.nitro = 0
            sail = null
            landedAt = null
            skids.length = 0
            puffs.length = 0
            history = maskFromGrid(trip.seen)
            perCountry = new Uint32Array(world.countries.length)
            completed.clear()
            reveal = null
            trail.clear()
            trip.trail = []
            writer = trailWriter()
            lastKept = { x: Infinity, y: Infinity }
            stamp.x = stamp.y = Infinity
            currentCountry = -1
            cam.x = car.x
            cam.y = car.y
            uncoverHere()
            save()
            publishPercent(true)
        }

        // --- One frame -----------------------------------------------------------

        const leaveMarks = (time: number, dt: number, sliding: boolean) => {
            const fx = Math.cos(car.heading), fy = Math.sin(car.heading)
            const rx = -fy, ry = fx
            const back = CAR_LENGTH * car.scale * 0.3, side = CAR_LENGTH * car.scale * 0.22
            const tyres: [number, number, number, number] = [
                car.x - fx * back + rx * side, car.y - fy * back + ry * side,
                car.x - fx * back - rx * side, car.y - fy * back - ry * side,
            ]
            if (sliding && lastTyres) {
                skids.push(
                    { ax: lastTyres[0], ay: lastTyres[1], bx: tyres[0], by: tyres[1], t: time },
                    { ax: lastTyres[2], ay: lastTyres[3], bx: tyres[2], by: tyres[3], t: time },
                )
                if (skids.length > MAX_SKIDS) skids.splice(0, skids.length - MAX_SKIDS)
                if (puffs.length < MAX_PUFFS && chance(dt * 26)) {
                    const which = chance(0.5) ? 0 : 2
                    puffs.push({
                        x: tyres[which], y: tyres[which + 1],
                        vx: -car.vx * 0.15 + (Math.random() - 0.5) * 1.1 * L * car.scale,
                        vy: -car.vy * 0.15 + (Math.random() - 0.5) * 1.1 * L * car.scale,
                        t: time, life: 0.7 + Math.random() * 0.5,
                    })
                }
            }
            lastTyres = sliding ? tyres : null
        }

        const step = (dt: number, time: number) => {
            if (sail) {
                audio.drive(0, 0, 0, true)
                sail.travelled += (sail.length / sail.duration) * dt
                const at = pointOnRoute(sail.legs, Math.min(sail.travelled, sail.length))
                car.x = at.x
                car.y = at.y
                car.heading = at.heading
                if (at.leg !== sail.leg) {
                    // Off one edge of the map and in at the other: cut, do not pan across the world.
                    sail.leg = at.leg
                    cam.x = car.x
                    cam.y = car.y
                }
                if (sail.travelled >= sail.length) {
                    car.x = sail.to.x
                    car.y = sail.to.y
                    stopCar()
                    landedAt = sail.to.id
                    sail = null
                    uncoverHere()
                }
                return
            }

            // What the player is asking for.
            const held = (...codes: string[]) => codes.some(c => keys.has(c))
            let throttle = held("KeyW", "ArrowUp") ? 1 : 0
            let brake = held("KeyS", "ArrowDown") ? 1 : 0
            let steerIn = (held("KeyD", "ArrowRight") ? 1 : 0) - (held("KeyA", "ArrowLeft") ? 1 : 0)
            const handbrake = held("Space")

            if (pointer && !throttle && !brake && !steerIn) {
                // Touch and mouse: hold a point and the car steers itself towards it.
                const z = cam.zoom
                const wx = cam.x + (pointer.x - cw / 2) / z
                const wy = cam.y + (pointer.y - focusY()) / z
                if (Math.hypot(wx - car.x, wy - car.y) * z > 18) {
                    const off = wrapAngle(Math.atan2(wy - car.y, wx - car.x) - car.heading)
                    steerIn = Math.max(-1, Math.min(1, off * 2.2))
                    throttle = Math.abs(off) < 2 ? 1 : 0.45
                } else {
                    brake = 1
                }
            }
            if ((throttle || brake || steerIn) && !announcedMove) { announcedMove = true; setMoved(true) }
            if (throttle || brake || steerIn) startRallyClock()
            /** The car's size right now: smaller on small islands, and every speed and force with it. */
            const S = car.scale
            if (car.stun > 0) {
                // Just bounced: the wheels have no say for a moment, or a held throttle would
                // brake the rebound to nothing and press the car straight back into the coast.
                car.stun -= dt
                throttle = 0
                brake = 0
            }

            car.steer += (steerIn - car.steer) * (1 - Math.exp(-STEER_RESPONSE * dt))

            // Yaw first, from the speed along the old heading: steering does nothing at a standstill,
            // turns the other way in reverse, and loses a little bite at top speed.
            const oldForward = car.vx * Math.cos(car.heading) + car.vy * Math.sin(car.heading)
            const bite = Math.min(1, Math.abs(oldForward) / (2.9 * L * S)) * (1 - 0.25 * Math.min(1, Math.abs(oldForward) / (MAX_SPEED * S)))
            let yaw = car.steer * STEER_RATE * bite * (oldForward < 0 ? -1 : 1)
            if (car.drifting) yaw *= 1.3
            if (handbrake) yaw *= 1.6
            // Nosed into a cape the car cannot move, and a car that does not move cannot steer -
            // so a blocked car pivots on the spot instead, and can always turn back inland.
            // The same while a bounce is rolling it backwards, and once it has bounced a few times
            // running: otherwise the bounce reversed the steering (as reversing does) and undid each
            // turn, and the car ping-ponged against the shore without ever coming round.
            car.bounces *= Math.exp(-dt / BOUNCE_MEMORY_S)
            if (car.stuckFor > PIVOT_AFTER_S || car.unstick > 0 || car.stun > 0 || car.bounces > 2) {
                yaw = car.steer * STEER_RATE * 0.75
            }
            // A car that does not fit where it is (just off a ferry, an old save) is held by its
            // centre alone until it drives clear, or it could never move again.
            // And a car the player has been trying to move for a while without getting anywhere
            // gets the same leniency for a moment: whatever the coast does, it can never be stuck.
            if (car.unstick > 0) car.unstick -= dt
            const fits = car.unstick <= 0 && bodyFits(car.x, car.y, car.heading)
            const canBe = (x: number, y: number, heading: number) => (fits ? bodyFits(x, y, heading) : onLand(world, x, y))
            const turned = wrapAngle(car.heading + (yaw + car.spin) * dt)
            // Nose against the shore: it cannot swing out over the water either.
            let blocked = false
            if (canBe(car.x, car.y, turned)) car.heading = turned
            else {
                car.spin = 0
                if (Math.abs(yaw) > 0.05) blocked = true
            }
            car.spin *= Math.exp(-SPIN_DECAY * dt)

            // Then split the velocity against the new heading - the velocity lags behind, which is the slide.
            const fx = Math.cos(car.heading), fy = Math.sin(car.heading)
            const rx = -fy, ry = fx
            let forward = car.vx * fx + car.vy * fy
            let lateral = car.vx * rx + car.vy * ry

            car.braking = false
            if (throttle) {
                if (forward < 0) forward = Math.min(0, forward + BRAKE * S * dt)
                else forward += (ENGINE * S * throttle - forward * (ENGINE / MAX_SPEED)) * dt
            }
            if (brake) {
                if (forward > 1) { forward = Math.max(0, forward - BRAKE * S * dt); car.braking = true }
                else forward = Math.max(-REVERSE_SPEED * S, forward - ENGINE * S * 0.45 * dt)
            }
            if (!throttle && !brake) forward -= Math.sign(forward) * Math.min(Math.abs(forward), ROLLING * S * dt)
            if (handbrake) {
                forward -= Math.sign(forward) * Math.min(Math.abs(forward), HANDBRAKE_DRAG * S * dt)
                car.braking = true
            }

            // Nitro: Shift (or the on-screen button) while there is some in the tank.
            const boosting = (held("ShiftLeft", "ShiftRight") || nitroHeldRef.current) && car.nitro > 0.02 && car.stun <= 0 && forward > -1
            if (boosting) {
                if (!car.boosting) {
                    audio.boost()
                    if (!rallyMode) {
                        log.boosts++
                        keepLog(log)
                        checkGoals()
                    }
                }
                car.nitro = Math.max(0, car.nitro - NITRO_DRAIN * dt)
                forward = Math.min(MAX_SPEED * S * NITRO_TOP, forward + NITRO_ACCEL * S * dt)
            }
            car.boosting = boosting

            // Grip. A big enough slide becomes a drift and holds on to itself until it dies down.
            const speed = Math.hypot(forward, lateral)
            if (Math.abs(lateral) > DRIFT_ENTER * S || (handbrake && speed > 2.5 * L * S)) car.drifting = true
            else if (Math.abs(lateral) < DRIFT_EXIT * S) car.drifting = false
            let grip = car.drifting ? DRIFT_GRIP + (1 - Math.abs(car.steer)) * 2.6 : GRIP
            if (handbrake) grip = HANDBRAKE_GRIP
            const keep = Math.exp(-grip * dt)
            const caught = Math.abs(lateral) * (1 - keep)
            lateral *= keep
            // Tyres that catch a slide throw some of it forward, so a drift does not just bleed speed away...
            forward += caught * 0.45 * (forward < 0 ? -1 : 1)
            // ...but sliding still scrubs some.
            forward -= Math.sign(forward) * Math.min(Math.abs(forward), Math.abs(lateral) * 0.25 * dt)

            car.vx = fx * forward + rx * lateral
            car.vy = fy * forward + ry * lateral

            // The ocean is a wall the car bounces off: the velocity is mirrored about the
            // coastline, so a head-on hit throws it straight back and a glancing one
            // sends it skating along the shore. A touch too soft to bounce just slides.
            const nx = car.x + car.vx * dt, ny = car.y + car.vy * dt
            if (canBe(nx, ny, car.heading)) {
                car.x = nx
                car.y = ny
            } else {
                const [lx, ly] = coastNormal(car.x, car.y)
                const into = car.vx * lx + car.vy * ly
                if (into < 0) {
                    const impact = -into
                    const bounce = impact > BOUNCE_MIN * S ? BOUNCE : 0
                    car.vx -= (1 + bounce) * into * lx
                    car.vy -= (1 + bounce) * into * ly
                    car.vx *= 0.92
                    car.vy *= 0.92
                    if (bounce) {
                        const hit = Math.min(1, impact / (MAX_SPEED * S))
                        // A hit off-centre twists the car: which way depends on the side the coast is on.
                        const side = Math.cos(car.heading) * ly - Math.sin(car.heading) * lx
                        car.spin += -side * hit * SPIN_KICK
                        car.stun = STUN_S * (0.4 + hit)
                        car.bounces += 1
                        shake = Math.max(shake, hit)
                        splash(car.x - lx * (halfLength() + 1), car.y - ly * (halfLength() + 1), lx, ly, hit, time)
                        audio.splash(hit)
                        if (hit > 0.2) loseDrift()
                    }
                }
                const bx = car.x + car.vx * dt, by = car.y + car.vy * dt
                if (canBe(bx, by, car.heading)) {
                    car.x = bx
                    car.y = by
                } else {
                    blocked = true
                }
            }

            // Wedged: the player keeps asking and nothing moves. After STUCK_S the collision
            // relaxes to the centre of the car for UNSTICK_S, enough to turn round and drive out.
            if (blocked && (throttle || brake || steerIn)) {
                car.stuckFor += dt
                if (car.stuckFor > STUCK_S) {
                    car.unstick = UNSTICK_S
                    car.stuckFor = 0
                    car.stun = 0
                }
            } else {
                car.stuckFor = 0
            }

            const sliding = (car.drifting || (car.braking && Math.abs(forward) > 3.6 * L * S)) && speed > 1.1 * L * S
            leaveMarks(time, dt, sliding)
            // The engine works hardest pulling away and goes quiet at cruising speed:
            // most of a trip is spent flat out, and a full-throttle drone wore on the ears.
            const revs = Math.min(NITRO_TOP, speed / (MAX_SPEED * S))
            audio.drive(
                revs, throttle > 0 ? Math.max(0, 1 - revs * 1.1) : 0,
                sliding ? Math.min(1, Math.abs(lateral) / (MAX_SPEED * S * 0.5)) : 0, false,
            )

            if (car.drifting && speed > 2 * L * S && !car.boosting) {
                // Sliding fills the nitro, harder slides faster.
                car.nitro = Math.min(1, car.nitro + dt * NITRO_CHARGE * Math.min(1, Math.max(0.3, Math.abs(lateral) / (MAX_SPEED * S * 0.35))))
            }
            if (car.drifting && speed > 2 * L * S) {
                combo.time += dt
                combo.grace = DRIFT_GRACE_S
                combo.mult = 1 + Math.min(DRIFT_MAX_MULT - 1, Math.floor(combo.time / DRIFT_STEP_S))
                // Per screen, not per world pixel: a small car on a small island scores the same.
                combo.points += (Math.abs(lateral) / S) * dt * combo.mult * 4
            } else if (combo.points > 0) {
                combo.grace -= dt
                if (combo.grace <= 0) bankDrift()
            }

            if (Math.hypot(car.x - stamp.x, car.y - stamp.y) >= 1) {
                uncoverHere()
                stampCapitals()
                discoverLandmarks()
                checkRally()
            }

            for (const port of world.ports) {
                const d = Math.hypot(port.x - car.x, port.y - car.y)
                if (port.id === landedAt) {
                    // Quiet only until the car leaves the boarding circle: turning straight round
                    // and driving back in sails back, without first having to wander off.
                    if (d > PORT_RADIUS + halfLength() + 0.5) landedAt = null
                    continue
                }
                // Calais and Dover are a few pixels apart: a port across the water must not board the car.
                if (d < PORT_RADIUS + halfLength() && speed > 0.5 * L * S && onDryLine(car.x, car.y, port.x, port.y)) {
                    const to = portsById.get(port.to)
                    if (!to) continue
                    const length = routeLength(port.legs)
                    sail = {
                        legs: port.legs, length, travelled: 0, to, leg: 0,
                        duration: Math.min(SAIL_MAX_S, Math.max(SAIL_MIN_S, length / SAIL_SPEED)),
                    }
                    lastTyres = null
                    if (!rallyMode) {
                        log.crossings++
                        keepLog(log)
                        checkGoals()
                    }
                    break
                }
            }
        }

        const moveCamera = (dt: number) => {
            // The car grows or shrinks towards the size of the land it is on - during a crossing, the land it is heading for.
            const target = sail ? scaleAt(sail.to.x, sail.to.y) : scaleAt(car.x, car.y)
            car.scale += (target - car.scale) * (1 - Math.exp(-dt * 2.5))
            car.boost += ((car.boosting && !sail ? 1 : 0) - car.boost) * (1 - Math.exp(-dt * 8))
            const over = overviewRef.current
            const targetZoom = over ? overviewZoom() : driveZoom()
            // A little ahead of the car, so there is room to see where it is going.
            const tx = over ? WORLD_W / 2 : car.x + (sail ? 0 : car.vx * 0.35)
            const ty = over ? WORLD_H / 2 : car.y + (sail ? 0 : car.vy * 0.35)
            const k = 1 - Math.exp(-dt * 7)
            cam.x += (tx - cam.x) * k
            cam.y += (ty - cam.y) * k
            cam.zoom = Math.exp(Math.log(cam.zoom) + (Math.log(targetZoom) - Math.log(cam.zoom)) * (1 - Math.exp(-dt * 5)))
            shake *= Math.exp(-dt * 9)
            if (shake < 0.01) shake = 0
        }

        let framesSincePick = Infinity
        const draw = (time: number) => {
            const p = PALETTES[themeRef.current]
            const s = cam.zoom * dpr
            // A bounce shakes the whole view - two out-of-step waves, so it rattles rather than sways.
            const jolt = shake * SHAKE_PX * dpr
            const ox = (cw / 2) * dpr - cam.x * s + Math.sin(time * 0.083) * jolt
            const oy = focusY() * dpr - cam.y * s + Math.cos(time * 0.067) * jolt
            const left = -ox / s, top = -oy / s
            const right = (canvas.width - ox) / s, bottom = (canvas.height - oy) / s
            const inView = (x: number, y: number, w: number, h: number) =>
                x < right && x + w > left && y < bottom && y + h > top
            const close = cam.zoom >= CLOSE_ZOOM

            // The sea: flat colour, wave marks pinned to the map so they travel with it, and a
            // band of shallows round every coast. Flat colour alone was too close to the
            // covered land - the coastline was there, but you had to look for it.
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.fillStyle = p.ocean
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            const waves = wavePattern(ctx, p.wave)
            if (waves) {
                waves.setTransform(new DOMMatrix().translate(ox % (48 * dpr), oy % (28 * dpr)).scale(dpr))
                ctx.fillStyle = waves
                ctx.fillRect(0, 0, canvas.width, canvas.height)
            }
            // Stroked before the land is filled, so only the half on the water side shows.
            ctx.setTransform(s, 0, 0, s, ox, oy)
            ctx.strokeStyle = p.shore
            ctx.lineWidth = (cam.zoom > 1 ? 8 : 4) * dpr / s
            ctx.lineJoin = "round"
            for (const part of world.parts) {
                if (inView(part.x - 4, part.y - 4, part.w + 8, part.h + 8)) ctx.stroke(part.path)
            }

            // The cover.
            ctx.setTransform(s, 0, 0, s, ox, oy)
            for (const part of world.parts) {
                if (!inView(part.x, part.y, part.w, part.h)) continue
                ctx.fillStyle = part.drivable ? p.land : p.island
                ctx.fill(part.path, "evenodd")
            }

            // Lakes are water like the sea, on the base map from the start.
            const landmarks = landmarksRef.current
            const lmView = { s, ox, oy, dpr, left, top, right, bottom, zoom: cam.zoom }
            const lmPalette = LANDMARK_PALETTES[themeRef.current]
            if (landmarks) drawLakes(ctx, landmarks, lmView, p.ocean, p.shore, waves, lmPalette)

            // The flags, cut by the mask, laid over the cover.
            lctx.setTransform(1, 0, 0, 1, 0, 0)
            lctx.globalCompositeOperation = "source-over"
            lctx.clearRect(0, 0, layer.width, layer.height)
            lctx.setTransform(s, 0, 0, s, ox, oy)
            lctx.imageSmoothingEnabled = true
            const budgetEnd = clock() + BITMAP_BUDGET_MS

            // Get the sharp flags ready for whatever is just off screen, before the car gets there.
            if (close && ++framesSincePick >= 8) {
                framesSincePick = 0
                pickWanted(left, top, right, bottom)
            }

            world.parts.forEach((part, i) => {
                if (!inView(part.x, part.y, part.w, part.h)) return
                const code = world.countries[part.country].code
                const image = code ? images.get(code) : null
                // Still downloading: try again next frame.
                if (code && image === undefined) return

                if (close) {
                    // Up close only a handful of countries are on screen, so cut them live from a sharp raster.
                    const raster = code ? rasters.get(code) : undefined
                    if (raster && image) {
                        lctx.save()
                        lctx.clip(part.path, "evenodd")
                        const r = flagRect(part, image.naturalWidth / image.naturalHeight)
                        lctx.drawImage(raster, r.x, r.y, r.w, r.h)
                        lctx.restore()
                        return
                    }
                    if (!code || !image || !image.naturalWidth) {
                        lctx.fillStyle = p.fallback
                        lctx.fill(part.path, "evenodd")
                        return
                    }
                    // The sharp one is still being made: the small bitmap stands in for a frame or two.
                }

                let bitmap = bitmaps.get(i)
                if (bitmap === undefined) {
                    if (clock() > budgetEnd) return
                    bitmap = flagBitmap(part, image ?? null, p.fallback)
                    bitmaps.set(i, bitmap)
                }
                if (bitmap) lctx.drawImage(bitmap.canvas, bitmap.x, bitmap.y, bitmap.w, bitmap.h)
            })
            if (landmarks) {
                // A country's flag runs straight over its lakes; cut them back out so the water shows.
                lctx.globalCompositeOperation = "destination-out"
                lctx.fill(landmarks.allLakes, "evenodd")
                lctx.globalCompositeOperation = "source-over"
                // Under the cover with the flags: a river or a range shows up where the car has been.
                drawHiddenLandmarks(lctx, landmarks, lmView, lmPalette)
                lctx.setTransform(s, 0, 0, s, ox, oy)
            }
            // The mask for this frame: zoomed out, the part of the raster on screen
            // (the whole world is 7 million pixels); up close, finished countries and
            // the trail near the screen.
            cctx.setTransform(1, 0, 0, 1, 0, 0)
            cctx.clearRect(0, 0, cut.width, cut.height)
            cctx.setTransform(s, 0, 0, s, ox, oy)
            cctx.imageSmoothingEnabled = true
            cctx.fillStyle = "#fff"
            const wipe = reveal ? Math.min(1, (clock() - reveal.start) / REVEAL_MS) : 1
            if (!close) {
                const mx = Math.max(0, Math.floor(left)), my = Math.max(0, Math.floor(top))
                const mw = Math.min(WORLD_W, Math.ceil(right)) - mx, mh = Math.min(WORLD_H, Math.ceil(bottom)) - my
                if (mw > 0 && mh > 0) cctx.drawImage(history, mx, my, mw, mh, mx, my, mw, mh)
            } else {
                for (const part of world.parts) {
                    if (!completed.has(part.country) || part.country === reveal?.country) continue
                    if (inView(part.x, part.y, part.w, part.h)) cctx.fill(part.path, "evenodd")
                }
                if (reveal) {
                    // The finished country floods out from where the car stood.
                    const eased = 1 - Math.pow(1 - wipe, 3)
                    cctx.save()
                    cctx.clip(countryPath(reveal.country), "evenodd")
                    cctx.beginPath()
                    cctx.arc(reveal.x, reveal.y, Math.max(0.01, reveal.radius * eased), 0, Math.PI * 2)
                    cctx.fill()
                    cctx.restore()
                }

                const r = REVEAL_RADIUS
                cctx.strokeStyle = "#fff"
                cctx.lineWidth = r * 2
                cctx.lineCap = "round"
                cctx.beginPath()
                // From the last saved point to the car.
                if (Number.isFinite(lastKept.x) && Math.hypot(car.x - lastKept.x, car.y - lastKept.y) <= BREAK) {
                    cctx.moveTo(lastKept.x, lastKept.y)
                    cctx.lineTo(car.x, car.y)
                } else if (!sail) {
                    cctx.moveTo(car.x, car.y)
                    cctx.lineTo(car.x, car.y)
                }
                // A segment is filed under its end point, so look one bucket further out than the radius.
                for (let by = Math.floor((top - r) / BUCKET) - 1; by <= Math.floor((bottom + r) / BUCKET) + 1; by++) {
                    for (let bx = Math.floor((left - r) / BUCKET) - 1; bx <= Math.floor((right + r) / BUCKET) + 1; bx++) {
                        const bucket = trail.get(by * 1000 + bx)
                        if (!bucket) continue
                        for (let i = 0; i < bucket.length; i += 4) {
                            cctx.moveTo(bucket[i], bucket[i + 1])
                            cctx.lineTo(bucket[i + 2], bucket[i + 3])
                        }
                    }
                }
                cctx.stroke()
            }
            lctx.setTransform(1, 0, 0, 1, 0, 0)
            lctx.globalCompositeOperation = "destination-in"
            lctx.drawImage(cut, 0, 0)
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.drawImage(layer, 0, 0)

            // Borders over both, so the flags read as countries.
            ctx.setTransform(s, 0, 0, s, ox, oy)
            ctx.strokeStyle = p.border
            ctx.lineWidth = (cam.zoom > 1 ? 1 : 0.7) * dpr / s
            ctx.lineJoin = "round"
            if (close) {
                // Only what is on screen; stroking the whole world's outline every frame is wasted work up close.
                for (const part of world.parts) if (inView(part.x, part.y, part.w, part.h)) ctx.stroke(part.path)
            } else {
                ctx.stroke(world.borders)
            }

            // The edge of the wipe across a just-finished country, a bright line that fades as it spreads.
            if (reveal && close) {
                ctx.save()
                ctx.clip(countryPath(reveal.country), "evenodd")
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * (1 - wipe)})`
                ctx.lineWidth = 4 * dpr / s
                ctx.beginPath()
                ctx.arc(reveal.x, reveal.y, Math.max(0.01, reveal.radius * (1 - Math.pow(1 - wipe, 3))), 0, Math.PI * 2)
                ctx.stroke()
                ctx.restore()
            }
            if (reveal && wipe >= 1) reveal = null

            if (landmarks) {
                // A name appears once the ground under it has been uncovered.
                const seenAt = (x: number, y: number) => trip.seen[Math.floor(y / CELL) * GRID_W + Math.floor(x / CELL)] === 1
                drawLandmarkLabels(ctx, landmarks, lmView, lmPalette, seenAt)
                ctx.setTransform(s, 0, 0, s, ox, oy)
            }

            // Skid marks, fading out; bucketed by age so it is a few strokes, not hundreds.
            while (skids.length && time - skids[0].t > SKID_LIFE_S * 1000) skids.shift()
            if (skids.length) {
                ctx.strokeStyle = p.skid
                ctx.lineWidth = CAR_LENGTH * car.scale * 0.11
                ctx.lineCap = "round"
                const BUCKETS = 6
                for (let b = 0; b < BUCKETS; b++) {
                    ctx.beginPath()
                    let any = false
                    for (const m of skids) {
                        const age = (time - m.t) / (SKID_LIFE_S * 1000)
                        if (Math.min(BUCKETS - 1, Math.floor(age * BUCKETS)) !== b) continue
                        ctx.moveTo(m.ax, m.ay)
                        ctx.lineTo(m.bx, m.by)
                        any = true
                    }
                    if (!any) continue
                    ctx.globalAlpha = 1 - b / BUCKETS
                    ctx.stroke()
                }
                ctx.globalAlpha = 1
                ctx.lineCap = "butt"
            }

            // Sea routes, each drawn once.
            ctx.strokeStyle = p.route
            ctx.lineWidth = 1.5 * dpr / s
            ctx.setLineDash([5 * dpr / s, 5 * dpr / s])
            for (const port of world.ports) {
                if (port.id > port.to) continue
                // The generated island ferries are many; they stay quieter than the named crossings.
                ctx.globalAlpha = port.ferry ? 0.45 : 1
                ctx.beginPath()
                for (const leg of port.legs) {
                    leg.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
                }
                ctx.stroke()
            }
            ctx.setLineDash([])
            ctx.globalAlpha = 1

            const screen = (x: number, y: number) => [x * s + ox, y * s + oy] as const
            const near = cam.zoom > 1

            for (const port of world.ports) {
                const [sx, sy] = screen(port.x, port.y)
                if (sx < -60 * dpr || sy < -60 * dpr || sx > canvas.width + 60 * dpr || sy > canvas.height + 60 * dpr) continue
                ctx.setTransform(dpr, 0, 0, dpr, sx, sy)
                if (!near && port.ferry) {
                    // Zoomed out, ninety-odd anchors would bury the map: a ferry is a dot until you are near it.
                    ctx.fillStyle = p.portFill
                    ctx.beginPath()
                    ctx.arc(0, 0, 2, 0, Math.PI * 2)
                    ctx.fill()
                    continue
                }
                if (!near || port.ferry) ctx.scale(0.75, 0.75)
                drawPort(ctx, p)
                if (near && !port.ferry && !rallyMode) {
                    const to = portsById.get(port.to)
                    const text = to ? `${port.name} → ${to.name}` : port.name
                    ctx.font = "600 11px Sora Variable, Sora, system-ui, sans-serif"
                    ctx.textBaseline = "middle"
                    ctx.lineWidth = 3
                    ctx.strokeStyle = p.halo
                    ctx.strokeText(text, 13, 0)
                    ctx.fillStyle = p.label
                    ctx.fillText(text, 13, 0)
                }
            }

            // Capitals: a ring until driven through, then a stamp with the name beside it.
            // Not in a rally, where a capital's position would tell you where you are.
            if (near && !rallyMode) {
                for (const cap of capitals) {
                    const [sx, sy] = screen(cap.x, cap.y)
                    if (sx < -80 * dpr || sy < -20 * dpr || sx > canvas.width + 20 * dpr || sy > canvas.height + 20 * dpr) continue
                    const stamped = log.stamps.includes(cap.code)
                    ctx.setTransform(dpr, 0, 0, dpr, sx, sy)
                    ctx.lineWidth = 1.6
                    ctx.strokeStyle = p.portRing
                    ctx.fillStyle = stamped ? "#0EA5E9" : p.portFill
                    ctx.beginPath()
                    if (stamped) {
                        for (let k = 0; k < 10; k++) {
                            const r = k % 2 ? 2.6 : 6
                            const a = -Math.PI / 2 + (k * Math.PI) / 5
                            if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
                            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
                        }
                        ctx.closePath()
                    } else {
                        ctx.arc(0, 0, 4, 0, Math.PI * 2)
                    }
                    ctx.fill()
                    ctx.stroke()
                    if (stamped) {
                        ctx.font = "600 11px Sora Variable, Sora, system-ui, sans-serif"
                        ctx.textBaseline = "middle"
                        ctx.lineWidth = 3
                        ctx.strokeStyle = p.halo
                        ctx.strokeText(cap.name, 10, 0)
                        ctx.fillStyle = p.label
                        ctx.fillText(cap.name, 10, 0)
                    }
                }
            }

            // Tyre smoke.
            for (let i = puffs.length - 1; i >= 0; i--) {
                if ((time - puffs[i].t) / 1000 > puffs[i].life) puffs.splice(i, 1)
            }
            if (puffs.length) {
                ctx.setTransform(s, 0, 0, s, ox, oy)
                ctx.fillStyle = p.smoke
                for (const puff of puffs) {
                    const age = (time - puff.t) / 1000
                    const k = age / puff.life
                    ctx.globalAlpha = 0.5 * (1 - k)
                    ctx.beginPath()
                    ctx.arc(puff.x + puff.vx * age, puff.y + puff.vy * age, CAR_LENGTH * car.scale * (0.12 + k * 0.35), 0, Math.PI * 2)
                    ctx.fill()
                }
                ctx.globalAlpha = 1
            }

            // The car: its true size on the map up close, never smaller than a readable marker.
            const [cx, cy] = screen(car.x, car.y)
            const unit = Math.max(0.6, (CAR_LENGTH * car.scale * cam.zoom) / CAR_UNITS) * dpr
            if (!near) {
                const pulse = 16 + Math.sin(time / 260) * 4
                ctx.setTransform(dpr, 0, 0, dpr, cx, cy)
                ctx.strokeStyle = "#E5484D"
                ctx.lineWidth = 2
                ctx.beginPath()
                ctx.arc(0, 0, pulse, 0, Math.PI * 2)
                ctx.stroke()
            }
            if (sail) drawBoat(ctx, cx, cy, unit, car.heading)
            else {
                drawFlames(ctx, cx, cy, unit, car.heading, car.boost, time, look.model)
                drawCar(ctx, cx, cy, unit, car.heading, {
                    steer: car.steer,
                    braking: car.braking,
                    moving: car.vx !== 0 || car.vy !== 0,
                }, look)
            }
        }

        let frame = 0
        let last = clock()
        const loop = (time: number) => {
            // A tab in the background can come back after seconds; never simulate that in one step.
            const dt = Math.min(0.05, Math.max(0, (time - last) / 1000))
            last = time
            // A question or the passport holds the world still; the map keeps drawing behind it.
            if (asking < 0 && !pausedRef.current) step(dt, time)
            else audio.drive(0, 0, 0, false)
            moveCamera(dt)
            draw(time)
            publishPercent()
            publishCountry()
            publishDrift()
            publishNitro()
            frame = requestAnimationFrame(loop)
        }
        frame = requestAnimationFrame(loop)

        return () => {
            alive = false
            cancelAnimationFrame(frame)
            audio.dispose()
            audioRef.current = null
            observer.disconnect()
            clearInterval(saveTimer)
            save()
            window.removeEventListener("pagehide", save)
            document.removeEventListener("visibilitychange", onHidden)
            clearTimeout(celebrateTimer)
            for (const raster of rasters.values()) release(raster)
            window.removeEventListener("keydown", onKeyDown)
            window.removeEventListener("keyup", onKeyUp)
            window.removeEventListener("blur", onBlur)
            canvas.removeEventListener("pointerdown", onPointerDown)
            canvas.removeEventListener("pointermove", onPointerMove)
            canvas.removeEventListener("pointerup", onPointerUp)
            canvas.removeEventListener("pointercancel", onPointerUp)
        }
    }, [ready, rallyMode, today])

    function newTrip() {
        if (!window.confirm("Start a new trip? The map you have uncovered, your passport and your stamps will all be cleared.")) return
        resetRef.current()
    }

    const pickAnswer = useCallback((code: string) => {
        if (!quiz || quiz.picked) return
        const asked = quiz
        setQuiz({ ...asked, picked: code })
        audioRef.current?.answer(code === asked.code)
        // Long enough to see a wrong pick beside the right one, then the country uncovers itself.
        window.setTimeout(() => {
            setQuiz(null)
            answerRef.current(asked.index, code === asked.code)
        }, 1300)
    }, [quiz])

    function openPassport() {
        const view = passportRef.current()
        if (!view) return
        pausedRef.current = true
        setPassport(view)
    }

    function openGarage() {
        const view = garageViewRef.current()
        if (!view) return
        pausedRef.current = true
        setGarage(view)
    }

    /** A garage pick goes to the loop, and the garage is read again to show it. */
    function pickLook(look: CarLook) {
        garageRef.current(look)
        setGarage(garageViewRef.current())
    }

    const closeGarage = useCallback(() => {
        pausedRef.current = false
        setGarage(null)
    }, [])

    const closePassport = useCallback(() => {
        pausedRef.current = false
        setPassport(null)
    }, [])

    const shown = percent < 1 ? percent.toFixed(2) : percent.toFixed(1)

    // Today's standing, live, once the rally is over.
    const finished = rallyMode && rallyResult !== null
    useEffect(() => {
        if (!finished) return
        return subscribeDailyStats(RALLY_GAME_KEY, today, RALLY_BUCKET_LABELS.length, setDistribution, () => setStatsError(true))
    }, [finished, today])
    const standing = useMemo(
        () => (distribution && rallyResult ? computeStanding(distribution, rallyResult.bucket) : null),
        [distribution, rallyResult],
    )

    return (
        <div className="flex h-[100dvh] flex-col overflow-hidden text-slate-900 dark:text-[#E8ECF6]">
            <TopBar
                title={rallyMode ? `Daily Rally${rally ? ` #${rally.number}` : ""}` : "Road Trip"}
                theme={theme}
                onToggleTheme={() => setTheme(t => (t === "light" ? "dark" : "light"))}
            >
                <BarButton onClick={() => setMuted(m => !m)} label={muted ? "Sound on" : "Sound off"}>
                    {muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
                </BarButton>
                {!rallyMode && (
                    <>
                        <BarButton onClick={openGarage} label="Garage">
                            <Warehouse size={18} aria-hidden />
                        </BarButton>
                        <BarButton onClick={openPassport} label="Passport">
                            <BookOpen size={18} aria-hidden />
                        </BarButton>
                        <BarButton onClick={newTrip} label="New trip">
                            <RotateCcw size={18} aria-hidden />
                        </BarButton>
                    </>
                )}
            </TopBar>

            <main className="relative min-h-0 flex-1 overflow-hidden">
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 h-full w-full touch-none select-none"
                    aria-label="World map. W and S for throttle and brake, A and D to steer, Space to drift, M for the whole map. On touch, hold the map to drive towards that point."
                />

                {!ready && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        {failed ? (
                            <p className="text-sm text-slate-500 dark:text-[#8C97B3]">The world map could not be loaded.</p>
                        ) : (
                            <Loader2 className="animate-spin text-slate-400" size={28} aria-label="Loading the map" />
                        )}
                    </div>
                )}

                {ready && (
                    <p
                        className={`pointer-events-none absolute inset-x-4 top-4 mx-auto w-fit max-w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-center text-sm font-medium text-slate-600 transition-opacity duration-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 ${moved || celebration || quiz ? "opacity-0" : "opacity-100"}`}
                    >
                        {rallyMode ? (
                            <span>Nobody tells you where you start. Drive, read the flags, reach all three.</span>
                        ) : (
                            <>
                                <span className="hidden sm:inline">W / S gas and brake · A / D steer · Space handbrake · Shift nitro · M map</span>
                                <span className="sm:hidden">Hold the map to drive towards it</span>
                            </>
                        )}
                    </p>
                )}

                <AnimatePresence>
                    {celebration && <CountryCard key={celebration.key} celebration={celebration} />}
                </AnimatePresence>
                <AnimatePresence>
                    {toast && <TripToast key={toast.key} toast={toast} />}
                </AnimatePresence>
                <AnimatePresence>
                    {drift && <DriftMeter drift={drift} />}
                </AnimatePresence>
                {ready && <NitroMeter nitro={nitro} onHold={held => { nitroHeldRef.current = held }} />}
                <AnimatePresence>
                    {quiz && <QuizCard key={quiz.index} quiz={quiz} onPick={pickAnswer} />}
                </AnimatePresence>
                <AnimatePresence>
                    {passport && <Passport view={passport} onClose={closePassport} />}
                </AnimatePresence>
                <AnimatePresence>
                    {garage && <Garage view={garage} onClose={closeGarage} onPickLook={pickLook} />}
                </AnimatePresence>
                <AnimatePresence>
                    {rallyResult && resultOpen && (
                        <RallyResult
                            result={rallyResult}
                            number={rally?.number ?? 0}
                            onClose={() => setResultOpen(false)}
                            standing={
                                <DailyStanding
                                    distribution={distribution}
                                    standing={standing}
                                    statsError={statsError}
                                    myBucket={rallyResult.bucket}
                                    bucketLabels={RALLY_BUCKET_LABELS}
                                    accentClass="text-[#E5484D]"
                                    footnote="Finish time - everyone drove the same start today"
                                    solvedWord="finished"
                                />
                            }
                        />
                    )}
                </AnimatePresence>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-4">
                    <div className="pointer-events-auto flex w-full max-w-[520px] items-center gap-3 rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                        {rallyMode ? (rally && <RallyPanel rally={rally} />) : (
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <ProgressRow
                                badge={<FlagSlot here={here} />}
                                label={here ? (here.done ? here.label : "Unknown country") : "…"}
                                value={here ? `${Math.floor(here.percent)}%` : ""}
                                percent={here?.percent ?? 0}
                                barClass={here?.done ? "bg-emerald-500" : "bg-amber-400"}
                                ariaLabel="This country uncovered"
                            />
                            <ProgressRow
                                badge={
                                    <span className="flex h-7 w-10 items-center justify-center rounded-[4px] border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                        <Globe2 size={16} aria-hidden />
                                    </span>
                                }
                                label="World"
                                value={`${shown}%`}
                                percent={percent}
                                barClass="bg-[#E5484D]"
                                ariaLabel="World uncovered"
                            />
                        </div>
                        )}
                        {!rallyMode && <button
                            type="button"
                            onClick={e => { setOverview(v => !v); e.currentTarget.blur() }}
                            aria-label={overview ? "Back to the car" : "Show the whole world"}
                            title={overview ? "Back to the car (M)" : "Show the whole world (M)"}
                            className="flex h-10 min-h-0 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-0 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
                        >
                            {overview ? <Navigation size={18} aria-hidden /> : <MapIcon size={18} aria-hidden />}
                        </button>}
                    </div>
                </div>
            </main>
        </div>
    )
}

function ProgressRow({ badge, label, value, percent, barClass, ariaLabel }: {
    badge: ReactNode
    label: string
    value: string
    percent: number
    barClass: string
    ariaLabel: string
}) {
    return (
        <div className="flex items-center gap-3">
            {badge}
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate font-semibold text-slate-600 dark:text-slate-300">{label}</span>
                    <span className="shrink-0 font-bold tabular-nums">{value}</span>
                </div>
                <div
                    className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900"
                    role="progressbar"
                    aria-label={ariaLabel}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(percent * 10) / 10}
                >
                    <div
                        className={`h-full rounded-full transition-[width,background-color] duration-300 ${barClass}`}
                        style={{ width: `${Math.min(100, percent)}%` }}
                    />
                </div>
            </div>
        </div>
    )
}

/** The current country's flag - a question mark until the country is finished, then the flag turns over. */
function FlagSlot({ here }: { here: HereView | null }) {
    const known = !!here?.done && !!here.code
    return (
        <span className="relative block h-7 w-10 shrink-0" style={{ perspective: 400 }}>
            <AnimatePresence initial={false} mode="wait">
                <motion.span
                    key={known ? `flag-${here!.code}` : `unknown-${here?.index ?? -1}`}
                    initial={{ rotateY: 90, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    exit={{ rotateY: -90, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="absolute inset-0 overflow-hidden rounded-[4px] border border-slate-200 dark:border-slate-700"
                >
                    {known ? (
                        <img src={`/flags/${here!.code}.svg`} alt={`Flag of ${here!.label}`} className="h-full w-full object-cover" />
                    ) : (
                        <span className="flex h-full w-full items-center justify-center bg-slate-100 text-sm font-bold text-slate-400 dark:bg-slate-900 dark:text-slate-500">?</span>
                    )}
                </motion.span>
            </AnimatePresence>
        </span>
    )
}
