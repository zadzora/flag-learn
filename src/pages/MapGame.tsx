import { useEffect, useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowLeft, ZoomIn, ZoomOut, Maximize, Trophy, Loader2, Check, Lock, RotateCcw, X, Unlock, Dumbbell, LogOut, Timer, Repeat, CheckSquare, Square, RefreshCw, Sun, Moon, Share2, Flame, ChevronRight } from "lucide-react"
import { BarButton } from "../components/TopBar"
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from "react-simple-maps"
import worldData from "../../data/flags.json"

const geoUrl = "/world-map.json"
const STORAGE_KEY_MAP = "flag-master-map-v1"
const TARGET_STREAK = 3
const BATCH_SIZE = 16
const THEME_KEY = "flag-master-theme" // Zdieľaný kľúč pre tému naprieč celou aplikáciou

const UNSUPPORTED_MAP_CODES = [
    "ad", "mc", "sm", "va", "li", "sg", "mt", "bh", "mv", "nr", "tv",
    "mh", "pw", "fm", "ws", "to", "ki", "st", "sc", "km", "bb", "vc",
    "gd", "ag", "kn", "lc", "dm", "hk", "mo", "pr", "aq","cv","mu","fo","gb-sct","gb-wls","gb-nir","gb-eng"
]

const OCEAN_LABELS = [
    { name: "North Atlantic Ocean", coordinates: [-40, 35] as [number, number], size: 5, rotate: 0 },
    { name: "South Atlantic Ocean", coordinates: [-20, -25] as [number, number], size: 5, rotate: 0 },
    { name: "North Pacific Ocean", coordinates: [-150, 25] as [number, number], size: 5, rotate: 0 },
    { name: "South Pacific Ocean", coordinates: [-130, -25] as [number, number], size: 5, rotate: 0 },
    { name: "Indian Ocean", coordinates: [80, -20] as [number, number], size: 5, rotate: 0 },
    { name: "Arctic Ocean", coordinates: [0, 80] as [number, number], size: 5 },
    { name: "Southern Ocean", coordinates: [0, -60] as [number, number], size: 5 },

    { name: "Mediterranean Sea", coordinates: [24, 33.5] as [number, number], size: 3 },
    { name: "Caribbean Sea", coordinates: [-75, 15] as [number, number], size: 2.5, rotate: 10 },
    { name: "Arabian Sea", coordinates: [65, 15] as [number, number], size: 2.5 },
    { name: "South China Sea", coordinates: [115, 15] as [number, number], size: 2.5, rotate: -30 },
    { name: "Bay of Bengal", coordinates: [90, 15] as [number, number], size: 2.5 },
    { name: "Bering Sea", coordinates: [177, 60] as [number, number], size: 3 },
    { name: "Tasman Sea", coordinates: [160, -40] as [number, number], size: 3, rotate: -45 },
    { name: "Coral Sea", coordinates: [155, -15] as [number, number], size: 3, rotate: -15 },
    { name: "Philippine Sea", coordinates: [135, 20] as [number, number], size: 3 },
    { name: "Hudson Bay", coordinates: [-85, 60] as [number, number], size: 2.5 },
    { name: "Gulf of Mexico", coordinates: [-90, 25] as [number, number], size: 2.5 },
    { name: "Gulf of Guinea", coordinates: [0, 0] as [number, number], size: 2.5 },
    { name: "Barents Sea", coordinates: [40, 75] as [number, number], size: 2.5 },
    { name: "Weddell Sea", coordinates: [-45, -72] as [number, number], size: 2.5 },

    { name: "Sea of Japan", coordinates: [135, 40] as [number, number], size: 1.8, rotate: -45 },
    { name: "Sea of Okhotsk", coordinates: [150, 55] as [number, number], size: 2.5, rotate: -30 },
    { name: "Black Sea", coordinates: [35, 43] as [number, number], size: 2 },
    { name: "Caspian Sea", coordinates: [51.5, 39.5] as [number, number], size: 1.5, rotate: -70 },
    { name: "Red Sea", coordinates: [38.2, 20] as [number, number], size: 2, rotate: 65 },
    { name: "North Sea", coordinates: [3, 56] as [number, number], size: 2.5 },
    { name: "Baltic Sea", coordinates: [20, 58] as [number, number], size: 2.5, rotate: -60 },
]

type Flag = { code: string; name: string | string[]; image: string }
type FlagProgress = { streak: number; seen: number }

function checkCountryMatch(geo: any, target: Flag | null) {
    if (!target || !geo.properties) return false;

    const geoName = (geo.properties.name || geo.properties.NAME || "").toLowerCase().replace(/[^a-z]/g, "");
    const flagNames = Array.isArray(target.name) ? target.name : [target.name];

    return flagNames.some(n => {
        const fName = n.toLowerCase().replace(/[^a-z]/g, "");

        if (geoName === fName) return true;

        if (geoName === "unitedstatesofamerica" && fName === "unitedstates") return true;
        if (geoName === "unitedrepublicoftanzania" && fName === "tanzania") return true;
        if (geoName === "demrepcongo" && fName === "drcongo") return true;
        if (geoName === "congo" && fName === "republicofthecongo") return true;
        if (geoName === "czechia" && fName === "czechrepublic") return true;
        if (geoName === "republicofserbia" && fName === "serbia") return true;
        if (geoName === "republicofkorea" && fName === "southkorea") return true;
        if (geoName === "dempeoplesrepofkorea" && fName === "northkorea") return true;
        if (geoName === "eswatini" && fName === "swaziland") return true;
        if (geoName === "northmacedonia" && fName === "macedonia") return true;
        if (geoName === "republicofmoldova" && fName === "moldova") return true;
        if (geoName === "thebahamas" && fName === "bahamas") return true;
        if (geoName === "myanmar" && fName === "myanmarburma") return true;
        if (geoName === "vatican" && fName === "vaticancity") return true;
        if (geoName === "palestine" && fName === "stateofpalestine") return true;
        if (geoName === "bosniaandherz" && fName === "bosnia") return true;
        if (geoName === "centralafricanrep" && fName === "car") return true;
        if (geoName === "eqguinea" && fName === "equatorialguinea") return true;
        if (geoName === "dominicanrep" && fName === "dominicana") return true;
        if (geoName === "ctedivoire" && fName === "ivorycoast") return true;
        if (geoName === "solomonis" && fName === "solomonislands") return true;
        if (geoName === "ssudan" && fName === "southsudan") return true;

        return false;
    });
}

export default function MapGame() {
    const activeData = useMemo(() => {
        return (worldData as unknown as Flag[]).filter(f => !UNSUPPORTED_MAP_CODES.includes(f.code));
    }, [])

    const [progress, setProgress] = useState<Record<string, FlagProgress>>({})
    const [current, setCurrent] = useState<Flag | null>(null)
    const [isLoaded, setIsLoaded] = useState(false)

    const [clickedGeo, setClickedGeo] = useState<string | null>(null)
    const [status, setStatus] = useState<'idle' | 'correct' | 'error' | 'mastered'>('idle')
    const [isReview, setIsReview] = useState(false)

    const [position, setPosition] = useState({ coordinates: [0, 0] as [number, number], zoom: 1 })

    const [showGallery, setShowGallery] = useState(false)
    const [showCheatConfirm, setShowCheatConfirm] = useState(false)
    const [selectedFlags, setSelectedFlags] = useState<string[]>([])
    const [hideMastery, setHideMastery] = useState(false) // Umozni hracovi skryt okno s trofejou

    const [isPracticeMode, setIsPracticeMode] = useState(false)
    const [hardMode, setHardMode] = useState(false)
    const [practicePool, setPracticePool] = useState<Flag[]>([])
    const [practiceMistakes, setPracticeMistakes] = useState(0)
    const [practiceStartTime, setPracticeStartTime] = useState<number>(0)
    const [practiceElapsedTime, setPracticeElapsedTime] = useState(0)
    const [practiceResults, setPracticeResults] = useState<{ mistakes: number, time: string, count: number } | null>(null)
    const [lastPracticePool, setLastPracticePool] = useState<Flag[]>([])

    const guessedPracticeFlags = useMemo(() => {
        if (!isPracticeMode) return [];
        return lastPracticePool.filter(f => !practicePool.some(p => p.code === f.code));
    }, [isPracticeMode, lastPracticePool, practicePool]);

    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window !== 'undefined') return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light'
        return 'light'
    })

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === 'dark') {
            root.classList.add('dark')
        } else {
            root.classList.remove('dark')
        }
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light')

    useEffect(() => {
        let interval: any
        if (isPracticeMode && practiceStartTime > 0) {
            interval = setInterval(() => {
                setPracticeElapsedTime(Math.floor((Date.now() - practiceStartTime) / 1000))
            }, 1000)
        }
        return () => clearInterval(interval)
    }, [isPracticeMode, practiceStartTime])

    function formatTime(seconds: number) {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    useEffect(() => {
        const savedData = localStorage.getItem(STORAGE_KEY_MAP)
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData)
                const mergedProgress = { ...parsed.progress }
                activeData.forEach(f => {
                    if (!mergedProgress[f.code]) mergedProgress[f.code] = { streak: 0, seen: 0 }
                })
                setProgress(mergedProgress)
            } catch (e) {
                initFresh()
            }
        } else {
            initFresh()
        }
        setIsLoaded(true)
    }, [activeData])

    function initFresh() {
        const initial: Record<string, FlagProgress> = {}
        activeData.forEach(f => { initial[f.code] = { streak: 0, seen: 0 } })
        setProgress(initial)
    }

    useEffect(() => {
        if (isLoaded && Object.keys(progress).length > 0) {
            localStorage.setItem(STORAGE_KEY_MAP, JSON.stringify({ progress }))
            if (!current && status === 'idle' && !isPracticeMode && !practiceResults) pickRandomCountry(progress)
        }
    }, [progress, isLoaded, isPracticeMode, practiceResults])

    const isFirstTime = current ? (progress[current.code]?.seen || 0) === 0 : false

    const totalStats = useMemo(() => {
        const total = activeData.length
        const mastered = Object.values(progress).filter(p => p.streak >= TARGET_STREAK).length
        return { total, mastered, percent: Math.round((mastered / total) * 100) }
    }, [progress, activeData])

    function pickRandomCountry(currentProgress: Record<string, FlagProgress>) {
        if (practiceResults) return

        const totalFlags = activeData.length
        const masteredFlags = activeData.filter(f => (currentProgress[f.code]?.streak || 0) >= TARGET_STREAK)

        if (masteredFlags.length === totalFlags) {
            setCurrent(null)
            setHideMastery(false) // Zobrazime okno po masterovani vsetkeho
            return
        }

        if (masteredFlags.length > 0 && Math.random() < 0.1) {
            const randomReviewFlag = masteredFlags[Math.floor(Math.random() * masteredFlags.length)]
            setCurrent(randomReviewFlag)
            setIsReview(true)
            setStatus('idle')
            setClickedGeo(null)
            setPosition({ coordinates: [0, 0], zoom: 1 })
            return
        }

        setIsReview(false)

        const inProgress: Flag[] = []
        const unseen: Flag[] = []

        activeData.forEach(f => {
            const p = currentProgress[f.code]
            if (p.streak < TARGET_STREAK && p.seen > 0) inProgress.push(f)
            if (p.seen === 0) unseen.push(f)
        })

        if (inProgress.length === 0 && unseen.length === 0) {
            setCurrent(null)
            return
        }

        let pool = [...inProgress]
        if (pool.length < BATCH_SIZE && unseen.length > 0) {
            const needed = BATCH_SIZE - pool.length
            pool = [...pool, ...unseen.slice(0, needed)]
        }

        const rnd = pool[Math.floor(Math.random() * pool.length)]
        setCurrent(rnd)
        setStatus('idle')
        setClickedGeo(null)
        setPosition({ coordinates: [0, 0], zoom: 1 })
    }

    function startPracticeMode(customPool?: Flag[]) {
        let poolToUse: Flag[] = []
        if (customPool && customPool.length > 0) {
            poolToUse = customPool
        } else {
            poolToUse = activeData.filter(f => progress[f.code]?.streak >= TARGET_STREAK)
        }

        if (poolToUse.length === 0) return

        setLastPracticePool([...poolToUse])
        const shuffled = [...poolToUse].sort(() => 0.5 - Math.random())
        setPracticePool(shuffled)
        setIsPracticeMode(true)
        setPracticeResults(null)
        setPracticeMistakes(0)
        setPracticeStartTime(Date.now())
        setPracticeElapsedTime(0)
        setShowGallery(false)
        setShowCheatConfirm(false)
        setHideMastery(false)
        pickPracticeFlag(shuffled)
    }

    function pickPracticeFlag(pool: Flag[]) {
        if (pool.length === 0) {
            const totalTime = Math.floor((Date.now() - practiceStartTime) / 1000)
            setPracticeResults({
                mistakes: practiceMistakes,
                time: formatTime(totalTime),
                count: lastPracticePool.length
            })
            setIsPracticeMode(false)
            setCurrent(null)
            setPracticeStartTime(0)
            return
        }
        const rnd = pool[Math.floor(Math.random() * pool.length)]
        setCurrent(rnd)
        setStatus('idle')
        setClickedGeo(null)
        setPosition({ coordinates: [0, 0], zoom: 1 })
    }

    function exitPracticeMode() {
        setIsPracticeMode(false)
        setPracticePool([])
        setCurrent(null)
        setPracticeMistakes(0)
        setPracticeStartTime(0)
        setPracticeResults(null)
        setStatus('idle')
        setClickedGeo(null)
        setTimeout(() => pickRandomCountry(progress), 100)
    }

    function handleZoomIn() {
        if (position.zoom >= 15) return
        setPosition(pos => ({ ...pos, zoom: pos.zoom * 1.5 }))
    }

    function handleZoomOut() {
        if (position.zoom <= 1) return
        setPosition(pos => ({ ...pos, zoom: pos.zoom / 1.5 }))
    }

    function handleResetZoom() {
        setPosition({ coordinates: [0, 0], zoom: 1 })
    }

    function handleCountryClick(geo: any) {
        if (status !== 'idle' || !current) return

        const isCorrect = checkCountryMatch(geo, current)

        if (isFirstTime && !isCorrect && !isPracticeMode && !isReview) {
            return;
        }

        setClickedGeo(geo.rsmKey)

        if (isReview && !isPracticeMode) {
            if (isCorrect) {
                setStatus('correct')
                setTimeout(() => pickRandomCountry(progress), 1500)
            } else {
                setPosition({ coordinates: [0, 0], zoom: 1 })
                setStatus('error')
                const currentP = progress[current.code]
                const newProgress = { ...progress }
                newProgress[current.code] = { ...currentP, streak: Math.max(0, TARGET_STREAK - 1) }
                setProgress(newProgress)
                setTimeout(() => pickRandomCountry(newProgress), 2500)
            }
            return
        }

        if (isPracticeMode) {
            if (isCorrect) {
                setStatus('correct')
                const newPool = practicePool.filter(f => f.code !== current.code)
                setPracticePool(newPool)
                setTimeout(() => pickPracticeFlag(newPool), 1500)
            } else {
                setPosition({ coordinates: [0, 0], zoom: 1 })
                setStatus('error')
                setPracticeMistakes(prev => prev + 1)
                setTimeout(() => {
                    setStatus('idle')
                    setClickedGeo(null)
                    pickPracticeFlag(practicePool)
                }, 2500)
            }
            return
        }

        const currentP = progress[current.code]
        const newProgress = { ...progress }

        if (isCorrect) {
            const newStreak = isFirstTime ? 0 : currentP.streak + 1
            const isMastered = newStreak >= TARGET_STREAK
            newProgress[current.code] = { ...currentP, seen: 1, streak: newStreak }

            setStatus(isMastered ? 'mastered' : 'correct')
            setProgress(newProgress)
            setTimeout(() => pickRandomCountry(newProgress), 1500)
        } else {
            setPosition({ coordinates: [0, 0], zoom: 1 })
            setStatus('error')
            newProgress[current.code] = { ...currentP, seen: 1, streak: 0 }
            setProgress(newProgress)
            setTimeout(() => pickRandomCountry(newProgress), 2500)
        }
    }

    function getCountryNameDisplay(f: Flag) {
        return Array.isArray(f.name) ? f.name[0] : f.name
    }

    function toggleFlagSelection(code: string) {
        setSelectedFlags(prev => {
            if (prev.includes(code)) return prev.filter(c => c !== code)
            return [...prev, code]
        })
    }

    function selectAllMastered() {
        const mastered = activeData.filter(f => (progress[f.code]?.streak || 0) >= TARGET_STREAK).map(f => f.code)
        setSelectedFlags(mastered)
    }

    function deselectAll() {
        setSelectedFlags([])
    }

    function handleCheatProgress() {
        if (!showCheatConfirm) {
            setShowCheatConfirm(true)
            setTimeout(() => setShowCheatConfirm(false), 5000)
        } else {
            const newProgress = { ...progress }
            activeData.forEach(f => {
                newProgress[f.code] = { streak: TARGET_STREAK, seen: 1 }
            })
            setProgress(newProgress)
            setShowCheatConfirm(false)
            setCurrent(null)
        }
    }

    function resetProgress() {
        if (confirm("Reset all progress for Map Mode?")) {
            localStorage.removeItem(STORAGE_KEY_MAP)
            window.location.reload()
        }
    }

    // --- FUNKCIA ZDIEĽANIA ---
    const handleShare = async () => {
        const shareData = {
            title: 'Map Master 🌍',
            text: `🏆 I just mapped all ${totalStats.total} countries in Flag Learn! Can you match me? 🔥`,
            url: 'https://www.flaglearn.eu/'
        }

        try {
            if (navigator.share) {
                await navigator.share(shareData)
            } else {
                await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`)
                alert("Link copied to clipboard! 📋")
            }
        } catch (err) {
            console.error("Error sharing:", err)
        }
    }

    // --- MEMOIZED MAP RENDERER ---
    const renderMap = useMemo(() => {
        return (
            <ComposableMap projection="geoMercator" projectionConfig={{ scale: 140 }} width={800} height={600} style={{ width: "100%", height: "100%", outline: "none" }}>
                <defs>
                    {activeData.map(f => (
                        <pattern
                            key={`pattern-${f.code}`}
                            id={`flag-${f.code}`}
                            patternUnits="objectBoundingBox"
                            width="1"
                            height="1"
                            viewBox="0 0 300 200"
                            preserveAspectRatio="xMidYMid slice"
                        >
                            <image
                                href={f.image}
                                x="0"
                                y="0"
                                width="300"
                                height="200"
                                preserveAspectRatio="xMidYMid slice"
                                opacity={theme === 'dark' ? "0.8" : "0.95"}
                            />
                        </pattern>
                    ))}
                </defs>

                <ZoomableGroup
                    zoom={position.zoom}
                    center={position.coordinates}
                    onMoveEnd={setPosition}
                    maxZoom={30}
                    translateExtent={[[-100, -100], [900, 700]]}
                >
                    <Geographies geography={geoUrl}>
                        {({ geographies }) =>
                            geographies.map((geo) => {
                                const isTarget = checkCountryMatch(geo, current)
                                const isClicked = geo.rsmKey === clickedGeo

                                const guessedTarget = guessedPracticeFlags.find(f => checkCountryMatch(geo, f));
                                const isGuessed = !!guessedTarget;

                                let fill = theme === 'dark' ? "#1A2135" : "#DDE3EE"
                                let stroke = theme === 'dark' ? "#2E3858" : "#A6B0C8"
                                let hoverFill = theme === 'dark' ? "#253050" : "#C9D2E3"
                                let hoverStroke = theme === 'dark' ? "#4A5680" : "#66718F"

                                if (isPracticeMode && isGuessed && status !== 'error') {
                                    if (!hardMode && guessedTarget) {
                                        fill = `url(#flag-${guessedTarget.code})`;
                                        hoverFill = fill;
                                    }
                                }

                                if (isFirstTime && isTarget && status === 'idle' && !isPracticeMode && !isReview) {
                                    fill = theme === 'dark' ? "#3b82f6" : "#60a5fa"
                                    stroke = theme === 'dark' ? "#60a5fa" : "#93c5fd"
                                    hoverFill = fill;
                                }

                                if (status === 'error') {
                                    if (isClicked) {
                                        fill = theme === 'dark' ? "#f43f5e" : "#fb7185"
                                        hoverFill = fill;
                                    }
                                    if (isTarget) {
                                        fill = theme === 'dark' ? "#10b981" : "#34d399"
                                        stroke = theme === 'dark' ? "#6ee7b7" : "#a7f3d0"
                                        hoverFill = fill;
                                    }
                                } else if (isClicked && (status === 'correct' || status === 'mastered')) {
                                    if (isPracticeMode) {
                                        if (!hardMode && current) {
                                            fill = `url(#flag-${current.code})`
                                        }
                                    } else {
                                        fill = theme === 'dark' ? "#10b981" : "#34d399"
                                    }
                                    hoverFill = fill;
                                }

                                // The shape to find is marked by colour and a heavier outline, not by pulsing.
                                const isHighlighted = (isFirstTime && isTarget && status === 'idle' && !isPracticeMode && !isReview) || (status === 'error' && isTarget)
                                const baseStrokeWidth = isHighlighted ? 0.6 : 0.15

                                return (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        onClick={() => handleCountryClick(geo)}
                                        style={{
                                            default: { fill, stroke, strokeWidth: baseStrokeWidth, outline: "none", transition: "fill 250ms" },
                                            hover: { fill: isClicked ? fill : hoverFill, stroke: isHighlighted ? stroke : hoverStroke, strokeWidth: Math.max(baseStrokeWidth, 0.3), outline: "none", cursor: "pointer" },
                                            pressed: { fill: isClicked ? fill : (theme === 'dark' ? "#3A4670" : "#A6B0C8"), strokeWidth: baseStrokeWidth, outline: "none" },
                                        }}
                                    />
                                )
                            })
                        }
                    </Geographies>
                    {OCEAN_LABELS.map(({ name, coordinates, size, rotate }) => (
                        <Marker key={name} coordinates={coordinates}>
                            <text
                                textAnchor="middle"
                                y={0}
                                transform={rotate ? `rotate(${rotate})` : undefined}
                                style={{
                                    fontFamily: "var(--font-sans)",
                                    fill: theme === 'dark' ? "#66718F" : "#8C97B3",
                                    fontSize: size,
                                    fontWeight: "600",
                                    pointerEvents: "none",
                                    opacity: theme === 'dark' ? 0.45 : 0.6,
                                    userSelect: "none",
                                    letterSpacing: "0.1em"
                                }}
                            >
                                {name.toUpperCase()}
                            </text>
                        </Marker>
                    ))}
                </ZoomableGroup>
            </ComposableMap>
        )
    }, [theme, position, current, clickedGeo, guessedPracticeFlags, status, hardMode, isFirstTime, isPracticeMode, isReview, activeData])


    if (!isLoaded) return <div className="flex h-screen items-center justify-center text-slate-500 dark:text-slate-400"><Loader2 className="animate-spin" /></div>

    const backClass = "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const primary = "rounded-lg bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const disabledBtn = "cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
    const dialog = "rounded-[10px] border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
    const badge = "inline-flex shrink-0 items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
    // Solid card colours on purpose: the global .bg-white rule would repaint the status border.
    const targetBorder =
        status === 'correct' || status === 'mastered' ? 'border-emerald-500 dark:border-emerald-500/70'
            : status === 'error' ? 'border-red-500 dark:border-red-500/70'
                : 'border-slate-200 dark:border-slate-700'
    const streakNow = current ? (progress[current.code]?.streak || 0) : 0

    return (
        <div className="relative flex h-screen w-full select-none flex-col overflow-hidden text-slate-900 dark:text-[#E8ECF6]">

            {/* --- HEADER (overlays the full-bleed map) --- */}
            <header className="absolute left-0 top-0 z-20 w-full border-b border-slate-200 bg-[#F4F6FB] dark:border-slate-700 dark:bg-[#0A0E1A]">
                <div className="mx-auto flex w-full max-w-[1120px] min-w-0 flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 sm:gap-x-3 sm:px-6 md:flex-nowrap">
                    {!isPracticeMode ? (
                        <>
                            <Link to="/" aria-label="Back" className={backClass}>
                                <ArrowLeft size={19} aria-hidden />
                            </Link>
                            <Link to="/" className="hidden shrink-0 items-center gap-2 font-bold lg:flex">
                                <img src="/logo2.png" alt="" className="h-8 w-8" />
                                Flag Learn
                            </Link>

                            {/* The country to find: second row on phones, centre of the bar from md up. */}
                            <div className="order-last flex w-full min-w-0 flex-col gap-1 md:order-none md:mx-2 md:w-auto md:flex-1">
                                {!practiceResults && (
                                    <span className={`text-[11px] font-bold uppercase tracking-wider ${isFirstTime && status === 'idle' && !isReview ? 'text-blue-600 dark:text-blue-400' : status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                        {isFirstTime && status === 'idle' && !isReview ? 'New! Find the blue shape' : status === 'error' ? 'Wrong! Find green shape' : 'Find this country'}
                                    </span>
                                )}

                                {current ? (
                                    <motion.div
                                        animate={status === 'error' ? { x: [-5, 5, -5, 5, 0] } : { x: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className={`flex w-full min-w-0 items-center gap-3 rounded-[10px] border bg-[#fff] px-2.5 py-2 transition-colors dark:bg-[#121829] ${targetBorder}`}
                                    >
                                        <img key={current.code} src={current.image} alt="Flag" className="fl-in h-9 w-14 shrink-0 rounded-[4px] object-cover shadow-[0_2px_10px_rgba(10,14,26,0.18)] sm:h-10 sm:w-[60px]" />
                                        <h2 className={`min-w-0 flex-1 break-words text-base font-bold leading-tight hyphens-auto sm:text-xl ${status === 'correct' || status === 'mastered' ? 'text-emerald-600 dark:text-emerald-400' : status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
                                            {getCountryNameDisplay(current)}
                                        </h2>
                                        {status === 'correct' && <span key="correct" className={`fl-in ${badge} bg-emerald-500/15 text-emerald-700 dark:text-emerald-300`}><Check size={12} strokeWidth={3} aria-hidden /> Correct!</span>}
                                        {status === 'mastered' && <span key="mastered" className={`fl-in ${badge} bg-amber-500/15 text-amber-700 dark:text-amber-300`}><Trophy size={12} aria-hidden /> Mastered!</span>}
                                        {status === 'error' && <span key="error" className={`fl-in ${badge} bg-red-500/15 text-red-700 dark:text-red-300`}><X size={12} strokeWidth={3} aria-hidden /> Wrong!</span>}
                                        {isReview && status === 'idle' && <span className={`${badge} bg-amber-500/15 text-amber-700 dark:text-amber-300`}><RefreshCw size={12} aria-hidden /> Review</span>}
                                    </motion.div>
                                ) : practiceResults ? (
                                    <div className="text-lg font-bold">Practice Over</div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setHideMastery(false)}
                                        title="Show Trophies"
                                        className="flex min-h-0 items-center gap-2 self-start p-0 text-lg font-bold text-amber-600 dark:text-amber-400"
                                    >
                                        <Trophy size={20} aria-hidden /> Map Mastered!
                                    </button>
                                )}
                            </div>

                            <div className="ml-auto flex shrink-0 items-center gap-2">
                                {current && !isReview && (
                                    <span className={`flex items-center gap-1 text-sm font-bold tabular-nums ${streakNow > 0 ? 'text-orange-500 dark:text-orange-400' : 'text-slate-400 dark:text-slate-500'}`} title="Streak">
                                        <Flame size={16} aria-hidden /> {streakNow}/3
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setShowGallery(true)}
                                    title="Open your map collection — browse mastered countries and practice selected regions."
                                    className={`${quiet} flex h-10 min-h-0 items-center gap-2 px-3 py-0 text-sm`}
                                >
                                    <span className="hidden font-semibold sm:inline">Collection</span>
                                    <span className="tabular-nums text-slate-500 dark:text-slate-400"><span className="font-bold text-slate-900 dark:text-white">{totalStats.mastered}</span> / {totalStats.total}</span>
                                    <ChevronRight size={15} aria-hidden className="text-slate-400" />
                                </button>
                                <BarButton onClick={toggleTheme} label={theme === 'light' ? 'Dark theme' : 'Light theme'}>
                                    {theme === 'light' ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
                                </BarButton>
                            </div>
                        </>
                    ) : (
                        /* PRACTICE MODE HEADER */
                        <>
                            <button onClick={exitPracticeMode} className={`${quiet} flex h-10 min-h-0 shrink-0 items-center gap-1.5 px-3 py-0 text-sm hover:text-red-600 dark:hover:text-red-400`}>
                                <LogOut size={16} className="shrink-0" aria-hidden /> <span className="hidden sm:inline">Exit</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setHardMode(!hardMode)}
                                title="Hard mode ON: countries you already guessed correctly stay as plain map shapes (no flag fill). OFF: those territories show their flags so you can use them as landmarks."
                                className={`flex h-10 min-h-0 shrink-0 items-center whitespace-nowrap rounded-lg border px-3 py-0 text-xs sm:text-sm ${hardMode ? 'border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-300' : 'border-slate-200 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:text-slate-200 dark:hover:border-[#3A4670]'}`}
                            >
                                <span className="sm:hidden">{hardMode ? 'Hard: ON' : 'Hard: OFF'}</span>
                                <span className="hidden sm:inline">{hardMode ? 'Hard Mode: ON' : 'Hard Mode: OFF'}</span>
                            </button>

                            <div className="order-last flex w-full min-w-0 flex-col gap-1 md:order-none md:mx-2 md:w-auto md:flex-1">
                                <span className={`text-[11px] font-bold uppercase tracking-wider ${status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                    {status === 'error' ? 'Wrong! Find green shape' : 'Find this country'}
                                </span>

                                {current && (
                                    <motion.div
                                        animate={status === 'error' ? { x: [-5, 5, -5, 5, 0] } : { x: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className={`flex w-full min-w-0 items-center gap-3 rounded-[10px] border bg-[#fff] px-2.5 py-2 transition-colors dark:bg-[#121829] ${targetBorder}`}
                                    >
                                        <img key={current.code} src={current.image} alt="Flag" className="fl-in h-9 w-14 shrink-0 rounded-[4px] object-cover shadow-[0_2px_10px_rgba(10,14,26,0.18)] sm:h-10 sm:w-[60px]" />
                                        <h2 className={`min-w-0 flex-1 break-words text-base font-bold leading-tight hyphens-auto sm:text-xl ${status === 'correct' ? 'text-emerald-600 dark:text-emerald-400' : status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
                                            {getCountryNameDisplay(current)}
                                        </h2>
                                        {status === 'correct' && <span key="correct" className={`fl-in ${badge} bg-emerald-500/15 text-emerald-700 dark:text-emerald-300`}><Check size={12} strokeWidth={3} aria-hidden /> Correct!</span>}
                                        {status === 'error' && <span key="error" className={`fl-in ${badge} bg-red-500/15 text-red-700 dark:text-red-300`}><X size={12} strokeWidth={3} aria-hidden /> Wrong!</span>}
                                        {status === 'idle' && <span className={`${badge} bg-blue-500/15 text-blue-700 dark:text-blue-300`}><Dumbbell size={12} aria-hidden /> Practice</span>}
                                    </motion.div>
                                )}
                            </div>

                            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
                                <span className="flex items-center gap-1 font-mono text-sm font-bold tabular-nums" title="Time"><Timer size={15} aria-hidden />{formatTime(practiceElapsedTime)}</span>
                                <span className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">Rem: <span className="font-bold text-slate-900 dark:text-white">{practicePool.length}</span></span>
                                <span className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-sm font-bold text-red-600 dark:text-red-300" title="Mistakes"><X size={14} aria-hidden /> {practiceMistakes}</span>
                                <BarButton onClick={toggleTheme} label={theme === 'light' ? 'Dark theme' : 'Light theme'}>
                                    {theme === 'light' ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
                                </BarButton>
                            </div>
                        </>
                    )}
                </div>
            </header>

            {/* --- FULL MAP MASTERY OVERLAY --- */}
            <AnimatePresence>
                {totalStats.percent === 100 && !isPracticeMode && !practiceResults && !current && !showGallery && !hideMastery && (
                    <div className="pointer-events-none absolute inset-0 z-[15] mt-20 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${dialog} pointer-events-auto relative flex w-full max-w-md flex-col gap-6 p-6 sm:p-8`}>
                            <button onClick={() => setHideMastery(true)} className="absolute right-3 top-3 flex h-9 min-h-0 w-9 items-center justify-center rounded-lg p-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" title="Hide window to view map" aria-label="Hide window to view map">
                                <X size={18} aria-hidden />
                            </button>
                            <div className="flex items-center gap-4 pr-8">
                                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700"><Trophy size={28} aria-hidden /></span>
                                <div>
                                    <h2 className="text-3xl font-bold">Map Master!</h2>
                                    <p className="mt-1 text-slate-500 dark:text-slate-400">Incredible! You have successfully mapped all <strong className="text-slate-900 dark:text-white">{totalStats.total}</strong> countries.</p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button onClick={handleShare} className={`${primary} flex flex-1 items-center justify-center gap-2 py-3.5 font-bold`}>
                                    <Share2 size={18} aria-hidden /> Share Success
                                </button>
                                <button onClick={() => startPracticeMode()} className={`${quiet} flex flex-1 items-center justify-center gap-2 py-3.5 font-bold`}>
                                    <Dumbbell size={18} aria-hidden /> Keep Practicing
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* --- PRACTICE RESULTS OVERLAY --- */}
            <AnimatePresence>
                {practiceResults && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
                        <div className={`${dialog} flex w-full max-w-md flex-col gap-6 p-6 sm:p-8`}>
                            <div>
                                <h2 className="text-3xl font-bold">Practice Complete!</h2>
                                <p className="mt-1 text-slate-500 dark:text-slate-400">You located <strong className="text-slate-900 dark:text-white">{practiceResults.count}</strong> countries on the map.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Mistakes</div>
                                    <div className={`mt-1 text-3xl font-bold ${practiceResults.mistakes ? 'text-red-500' : 'text-emerald-500'}`}>{practiceResults.mistakes}</div>
                                </div>
                                <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Time</div>
                                    <div className="mt-1 text-3xl font-bold tabular-nums">{practiceResults.time}</div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button onClick={() => startPracticeMode(lastPracticePool)} className={`${primary} flex flex-1 items-center justify-center gap-2 py-3.5 font-bold`}><Repeat size={18} aria-hidden /> Practice Again</button>
                                <button onClick={exitPracticeMode} className={`${quiet} flex-1 py-3.5 font-bold`}>Back to Map</button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- MAP CONTAINER --- */}
            <div className="relative h-full w-full cursor-grab outline-none active:cursor-grabbing">
                {renderMap}

                <div className="absolute bottom-6 right-4 z-20 flex flex-col gap-2 sm:bottom-8 sm:right-6">
                    <BarButton onClick={handleZoomIn} label="Zoom in"><ZoomIn size={19} aria-hidden /></BarButton>
                    <BarButton onClick={handleResetZoom} label="Reset zoom"><Maximize size={18} aria-hidden /></BarButton>
                    <BarButton onClick={handleZoomOut} label="Zoom out"><ZoomOut size={19} aria-hidden /></BarButton>
                </div>
            </div>

            {/* --- GALLERY MODAL --- */}
            <AnimatePresence>
                {showGallery && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setShowGallery(false)}>
                        <div className={`${dialog} flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden`} onClick={e => e.stopPropagation()}>
                            <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:p-6 dark:border-slate-700">
                                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                                    <div>
                                        <h2 className="text-2xl font-bold">Map Collection</h2>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">Review your mastered countries.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => { if (selectedFlags.length > 0) { const customPool = activeData.filter(f => selectedFlags.includes(f.code)); startPracticeMode(customPool) } else { startPracticeMode() } }}
                                            disabled={selectedFlags.length === 0 && totalStats.mastered < 5}
                                            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold ${selectedFlags.length > 0 || totalStats.mastered >= 5 ? primary : disabledBtn}`}
                                        >
                                            <Dumbbell size={16} aria-hidden /> {selectedFlags.length > 0 ? `Practice Selected (${selectedFlags.length})` : `Practice Mastered (${totalStats.mastered})`}
                                        </button>
                                        <div className="ml-1 flex gap-2 border-l border-slate-200 pl-3 dark:border-slate-700">
                                            <button onClick={resetProgress} className="flex h-10 min-h-0 w-10 items-center justify-center rounded-lg border border-slate-200 p-0 text-slate-500 hover:border-red-400 hover:text-red-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-500/60 dark:hover:text-red-400" title="Reset Progress" aria-label="Reset Progress"><RotateCcw size={18} aria-hidden /></button>
                                            <BarButton onClick={() => setShowGallery(false)} label="Close"><X size={20} aria-hidden /></BarButton>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
                                    <button onClick={selectAllMastered} className="flex min-h-0 items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"><CheckSquare size={16} aria-hidden /> Select All Mastered</button>
                                    <button onClick={deselectAll} className="flex min-h-0 items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-slate-600 hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400"><Square size={16} aria-hidden /> Clear Selection</button>

                                    <div className="ml-auto flex items-center">
                                        {showCheatConfirm ? (
                                            <button onClick={handleCheatProgress} className="flex min-h-0 items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1 font-bold text-red-600 dark:text-red-300">
                                                <Unlock size={16} aria-hidden /> Unlock all map progress? Click to confirm!
                                            </button>
                                        ) : (
                                            <button onClick={handleCheatProgress} className="flex min-h-0 items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400">
                                                <Unlock size={16} aria-hidden /> Cheat Progress
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
                                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-5">
                                    {activeData.map(flag => {
                                        const p = progress[flag.code] || { streak: 0, seen: 0 }
                                        const isMastered = p.streak >= TARGET_STREAK
                                        const isSeen = p.seen > 0
                                        const isLocked = !isSeen

                                        const displayName = getCountryNameDisplay(flag)
                                        const isSelected = selectedFlags.includes(flag.code)
                                        const canSelect = isMastered

                                        return (
                                            <div key={flag.code}
                                                 onClick={() => canSelect && toggleFlagSelection(flag.code)}
                                                 className={`group relative aspect-[4/3] overflow-hidden rounded-[6px] border
                                                     ${isSelected ? 'z-10 cursor-pointer border-blue-500 ring-2 ring-blue-500'
                                                     : (isMastered ? 'cursor-pointer border-emerald-500/60'
                                                         : (isLocked ? 'cursor-default border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-[#0F1424]' : 'cursor-default border-slate-200 opacity-80 dark:border-slate-700'))}
                                                 `}
                                            >
                                                {isLocked ? (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-600">
                                                        <Lock size={22} aria-hidden />
                                                        <span className="text-[10px] font-bold uppercase tracking-wider">Locked</span>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <img
                                                            src={flag.image}
                                                            alt={isMastered ? displayName : "Flag"}
                                                            className={`h-full w-full object-cover ${isSelected || isMastered ? '' : 'opacity-80 grayscale-[0.3]'}`}
                                                            loading="lazy"
                                                        />

                                                        {isSelected && <div className="absolute inset-0 flex items-center justify-center bg-blue-500/20"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white"><Check size={18} strokeWidth={3.5} aria-hidden /></span></div>}

                                                        {!isSelected && isMastered && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check size={12} strokeWidth={3.5} aria-hidden /></span>}

                                                        {!isSelected && !isMastered && isSeen && <div className="absolute bottom-0 w-full bg-slate-950/70 py-1 text-center text-[10px] font-bold text-white">{p.streak}/3</div>}
                                                    </>
                                                )}

                                                {!isLocked && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-2 opacity-0 transition-opacity group-hover:opacity-100">
                                                        <span className="text-center text-xs font-bold text-white">{isMastered ? displayName : "Yet to find"}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    )
}
