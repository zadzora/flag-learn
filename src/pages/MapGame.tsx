import { useEffect, useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowLeft, ZoomIn, ZoomOut, Maximize, Trophy, Loader2, Check, Lock, RotateCcw, X, Unlock, Dumbbell, LogOut, Timer, Repeat, CheckSquare, Square, RefreshCw, Sun, Moon, Share2 } from "lucide-react"
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

    function handleMoveEnd(pos: any) {
        setPosition(pos)
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
    // Toto zabezpečuje extrémnu plynulosť, mapa sa prekreslí, len keď sa zmenia dôležité stavy!
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

                                let fill = theme === 'dark' ? "#1e293b" : "#e2e8f0"
                                let stroke = theme === 'dark' ? "#334155" : "#94a3b8"
                                let hoverFill = theme === 'dark' ? "#334155" : "#cbd5e1"
                                let hoverStroke = theme === 'dark' ? "#64748b" : "#64748b"

                                // LOGIKA 1: Zobrazovanie už uhádnutých vlajok v Practice Mode
                                if (isPracticeMode && isGuessed && status !== 'error') {
                                    if (!hardMode && guessedTarget) {
                                        fill = `url(#flag-${guessedTarget.code})`;
                                        hoverFill = fill;
                                    }
                                }

                                // LOGIKA 2: Zvýraznenie hľadaného (Pulsing), ak to hrá prvýkrát
                                if (isFirstTime && isTarget && status === 'idle' && !isPracticeMode && !isReview) {
                                    fill = theme === 'dark' ? "#3b82f6" : "#60a5fa"
                                    stroke = theme === 'dark' ? "#60a5fa" : "#93c5fd"
                                    hoverFill = fill;
                                }

                                // LOGIKA 3: Reakcie na kliknutie hráča
                                if (status === 'error') {
                                    if (isClicked) {
                                        fill = theme === 'dark' ? "#ef4444" : "#f87171"
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

                                const isPulsing = (isFirstTime && isTarget && status === 'idle' && !isPracticeMode && !isReview) || (status === 'error' && isTarget)

                                return (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        onClick={() => handleCountryClick(geo)}
                                        style={{
                                            default: { fill, stroke, strokeWidth: 0.15, outline: "none", transition: "fill 250ms" },
                                            hover: { fill: isClicked ? fill : hoverFill, stroke: hoverStroke, strokeWidth: 0.3, outline: "none", cursor: "pointer" },
                                            pressed: { fill: isClicked ? fill : (theme === 'dark' ? "#cbd5e1" : "#94a3b8"), strokeWidth: 0.15, outline: "none" },
                                        }}
                                        className={isPulsing ? "animate-pulse" : ""}
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
                                    fontFamily: "system-ui, sans-serif",
                                    fill: theme === 'dark' ? "#64748b" : "#94a3b8",
                                    fontSize: size,
                                    fontWeight: "600",
                                    pointerEvents: "none",
                                    opacity: theme === 'dark' ? 0.3 : 0.6,
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


    if (!isLoaded) return <div className="h-screen flex items-center justify-center bg-white dark:bg-slate-900 text-slate-800 dark:text-white"><Loader2 className="animate-spin" /></div>

    return (
        <div className={`h-screen w-full flex flex-col overflow-hidden relative select-none transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0f172a] text-slate-100' : 'bg-[#f8fafc] text-slate-800'}`}>

            {/* --- THEME TOGGLE --- */}
            <div className={`absolute right-4 z-20 transition-all ${isPracticeMode ? 'top-20' : 'top-4'}`}>
                <button
                    onClick={toggleTheme}
                    className="p-2.5 rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform"
                >
                    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
            </div>

            {/* --- HEADER --- */}
            <div className="absolute top-0 left-0 w-full z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 p-4 flex justify-between items-center shadow-lg pointer-events-auto">
                {!isPracticeMode ? (
                    <>
                        <Link to="/" className="p-3 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-transparent text-slate-600 dark:text-slate-300">
                            <ArrowLeft size={20} />
                        </Link>

                        <div className="flex flex-col items-center flex-1 mx-4">
                            <div className="h-5 flex items-center justify-center mb-1">
                                {!practiceResults && (
                                    isFirstTime && status === 'idle' && !isPracticeMode && !isReview ? (
                                        <span className="text-xs font-bold text-blue-500 dark:text-blue-400 uppercase tracking-widest animate-pulse">New! Find pulsing shape</span>
                                    ) : status === 'error' ? (
                                        <span className="text-xs font-bold text-red-500 dark:text-red-400 uppercase tracking-widest">Wrong! Find green shape</span>
                                    ) : (
                                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Find this country</span>
                                    )
                                )}
                            </div>

                            {current ? (
                                <motion.div
                                    animate={
                                        status === 'correct' || status === 'mastered' ? { scale: [1, 1.05, 1], borderColor: '#10b981' } :
                                            status === 'error' ? { x: [-5, 5, -5, 5, 0], borderColor: '#ef4444' } :
                                                { borderColor: theme === 'dark' ? '#334155' : '#cbd5e1' }
                                    }
                                    transition={{ duration: 0.3 }}
                                    className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 p-2 pr-6 rounded-xl border shadow-xl relative transition-colors"
                                >
                                    <img src={current.image} alt="Flag" className="h-10 w-16 object-cover rounded-md shadow-sm border border-slate-200 dark:border-transparent" />
                                    <h2 className={`text-xl sm:text-2xl font-black text-center ${status === 'correct' || status === 'mastered' ? 'text-emerald-500 dark:text-emerald-400' : status === 'error' ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-white'}`}>
                                        {getCountryNameDisplay(current)}
                                    </h2>

                                    <AnimatePresence>
                                        {status !== 'idle' && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.5, y: 10 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.5 }}
                                                className={`absolute -right-4 -top-3 px-3 py-1 rounded-full text-xs font-bold shadow-lg z-20 ${
                                                    status === 'correct' ? 'bg-emerald-500 text-white' :
                                                        status === 'mastered' ? 'bg-yellow-400 text-yellow-900' :
                                                            'bg-red-500 text-white'
                                                }`}
                                            >
                                                {status === 'correct' && 'Correct!'}
                                                {status === 'mastered' && 'Mastered! 🏆'}
                                                {status === 'error' && 'Wrong!'}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {isReview && status === 'idle' && (
                                        <div className="absolute -top-3 -right-3 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md flex items-center gap-1">
                                            <RefreshCw size={12} /> Review
                                        </div>
                                    )}
                                </motion.div>
                            ) : practiceResults ? (
                                <div className="text-xl font-black text-indigo-500 dark:text-indigo-400">Practice Over</div>
                            ) : (
                                <div
                                    className="text-xl font-black text-yellow-500 dark:text-yellow-400 cursor-pointer hover:scale-105 transition-transform"
                                    onClick={() => setHideMastery(false)}
                                    title="Show Trophies"
                                >
                                    Map Mastered! 🏆
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-3 mr-12">
                            <button onClick={() => setShowGallery(true)} className="group flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 px-4 py-2 rounded-xl font-bold border border-slate-200 dark:border-slate-700 transition-colors">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase group-hover:text-slate-600 dark:group-hover:text-slate-300">Collection</span>
                                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                    {totalStats.mastered} / {totalStats.total}
                                </div>
                            </button>

                            {current && !isReview && (
                                <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2 rounded-xl font-bold border border-slate-200 dark:border-slate-700 flex flex-col items-center">
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Streak</span>
                                    <span className={`text-lg leading-none ${progress[current.code]?.streak > 0 ? 'text-orange-500 dark:text-orange-400' : 'text-slate-400 dark:text-slate-300'}`}>
                                        🔥 {progress[current.code]?.streak || 0}/3
                                    </span>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    /* PRACTICE MODE HEADER */
                    <div className="w-full flex justify-between items-center text-slate-800 dark:text-white">

                        <div className="flex items-center gap-2">
                            <button onClick={exitPracticeMode} className="flex items-center gap-1.5 text-sm bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-500 dark:bg-slate-800 dark:hover:bg-red-900/50 dark:text-slate-300 dark:hover:text-red-400 px-3 py-2 sm:px-4 rounded-xl transition-colors font-bold border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-900/50">
                                <LogOut size={16} /> <span className="hidden sm:inline">Exit</span>
                            </button>

                            <button onClick={() => setHardMode(!hardMode)} className={`flex items-center gap-1 text-sm px-3 py-2 sm:px-4 rounded-xl transition-colors font-bold border shadow-sm ${hardMode ? 'bg-red-100 hover:bg-red-200 text-red-600 border-red-300 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 dark:border-red-800' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-600 border-emerald-300 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 dark:text-emerald-400 dark:border-emerald-800'}`}>
                                {hardMode ? 'Hard Mode: ON' : 'Hard Mode: OFF'}
                            </button>
                        </div>

                        <div className="flex flex-col items-center flex-1 mx-4">
                            <div className="h-5 flex items-center justify-center mb-1">
                                {status === 'error' ? (
                                    <span className="text-xs font-bold text-red-500 dark:text-red-400 uppercase tracking-widest">Wrong! Find green shape</span>
                                ) : (
                                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Find this country</span>
                                )}
                            </div>

                            {current && (
                                <motion.div
                                    animate={
                                        status === 'correct' ? { scale: [1, 1.05, 1], borderColor: '#10b981' } :
                                            status === 'error' ? { x: [-5, 5, -5, 5, 0], borderColor: '#ef4444' } :
                                                { borderColor: theme === 'dark' ? 'rgba(67, 56, 202, 0.5)' : '#c7d2fe' }
                                    }
                                    transition={{ duration: 0.3 }}
                                    className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-900/50 p-2 pr-6 rounded-xl border border-indigo-200 dark:border-indigo-700/50 shadow-xl relative"
                                >
                                    <img src={current.image} alt="Flag" className="h-10 w-16 object-cover rounded-md shadow-sm border border-slate-200 dark:border-transparent" />
                                    <h2 className={`text-xl sm:text-2xl font-black ${status === 'correct' ? 'text-emerald-500 dark:text-emerald-400' : status === 'error' ? 'text-red-500 dark:text-red-400' : 'text-indigo-900 dark:text-indigo-100'}`}>
                                        {getCountryNameDisplay(current)}
                                    </h2>

                                    <AnimatePresence>
                                        {status !== 'idle' && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.5, y: 10 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.5 }}
                                                className={`absolute -right-4 -top-3 px-3 py-1 rounded-full text-xs font-bold text-white shadow-lg z-20 ${
                                                    status === 'correct' ? 'bg-emerald-500' : 'bg-red-500'
                                                }`}
                                            >
                                                {status === 'correct' ? 'Correct!' : 'Wrong!'}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {status === 'idle' && (
                                        <div className="absolute -top-3 -right-3 bg-indigo-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md flex items-center gap-1">
                                            <Dumbbell size={12} /> Practice
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </div>

                        <div className="flex items-center gap-3 sm:gap-4 bg-slate-50 dark:bg-slate-800 px-3 sm:px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 mr-12">
                            <div className="flex items-center gap-1 font-mono text-sm sm:text-base font-bold text-slate-700 dark:text-slate-300"><Timer size={16} className="text-indigo-500 dark:text-indigo-400"/>{formatTime(practiceElapsedTime)}</div>
                            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700"></div>
                            <div className="text-sm font-medium text-slate-500 dark:text-slate-300">Rem: <span className="text-slate-800 dark:text-white font-bold">{practicePool.length}</span></div>
                            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700"></div>
                            <div className="text-sm font-bold text-red-500 dark:text-red-400 flex items-center gap-1"><X size={16} /> {practiceMistakes}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* --- FULL MAP MASTERY OVERLAY --- */}
            <AnimatePresence>
                {totalStats.percent === 100 && !isPracticeMode && !practiceResults && !current && !showGallery && !hideMastery && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[5] p-4 mt-20">
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl text-center flex flex-col items-center gap-6 max-w-md border border-slate-200 dark:border-slate-700 w-full pointer-events-auto relative">

                            <button onClick={() => setHideMastery(true)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors bg-slate-100 dark:bg-slate-700 rounded-full" title="Hide window to view map">
                                <X size={16} />
                            </button>

                            <div className="bg-yellow-100 dark:bg-yellow-900/30 p-4 rounded-full text-yellow-500 dark:text-yellow-400 animate-bounce mt-2">
                                <Trophy size={64} />
                            </div>
                            <div>
                                <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">Map Master! 🌍</h2>
                                <p className="text-slate-500 dark:text-slate-400">Incredible! You have successfully mapped all <strong className="text-indigo-600 dark:text-indigo-400">{totalStats.total}</strong> countries.</p>
                            </div>
                            <div className="w-full flex flex-col gap-3">
                                <button onClick={handleShare} className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                                    <Share2 size={20} /> Share Success
                                </button>
                                <button onClick={() => startPracticeMode()} className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                                    <Dumbbell size={20} /> Keep Practicing
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* --- PRACTICE RESULTS OVERLAY --- */}
            <AnimatePresence>
                {practiceResults && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl text-center flex flex-col items-center gap-6 max-w-md border border-slate-200 dark:border-slate-700 w-full">
                            <div className="bg-indigo-100 dark:bg-indigo-900/50 p-4 rounded-full text-indigo-500 dark:text-indigo-400"><Dumbbell size={64} /></div>
                            <div>
                                <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">Practice Complete!</h2>
                                <p className="text-slate-500 dark:text-slate-400">You located <strong className="text-indigo-600 dark:text-indigo-400">{practiceResults.count}</strong> countries on the map.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 w-full">
                                <div className="bg-red-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-red-100 dark:border-red-900/30">
                                    <div className="text-xs uppercase font-bold text-red-500 mb-1">Mistakes</div>
                                    <div className="text-3xl font-bold text-red-600 dark:text-red-400">{practiceResults.mistakes}</div>
                                </div>
                                <div className="bg-indigo-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
                                    <div className="text-xs uppercase font-bold text-indigo-500 mb-1">Time</div>
                                    <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{practiceResults.time}</div>
                                </div>
                            </div>
                            <div className="w-full flex flex-col gap-3">
                                <button onClick={() => startPracticeMode(lastPracticePool)} className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"><Repeat size={20} /> Practice Again</button>
                                <button onClick={exitPracticeMode} className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-lg transition-all active:scale-95">Back to Map</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- MAP CONTAINER --- */}
            <div className={`w-full h-full relative cursor-grab active:cursor-grabbing outline-none transition-colors duration-500 ${theme === 'light' ? 'bg-[#f8fafc]' : 'bg-[#0f172a]'}`}>
                {renderMap}

                {/* Ovládanie priblíženia */}
                <div className="absolute bottom-8 right-8 flex flex-col gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl z-20">
                    <button onClick={handleZoomIn} className="p-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white rounded-xl transition-colors"><ZoomIn size={24}/></button>
                    <button onClick={handleResetZoom} className="p-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white rounded-xl transition-colors"><Maximize size={24}/></button>
                    <button onClick={handleZoomOut} className="p-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white rounded-xl transition-colors"><ZoomOut size={24}/></button>
                </div>
            </div>

            {/* --- GALLERY MODAL --- */}
            <AnimatePresence>
                {showGallery && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setShowGallery(false)}>
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col bg-slate-50 dark:bg-slate-900 gap-4">
                                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                                    <div>
                                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Map Collection</h2>
                                        <p className="text-slate-500 dark:text-slate-400 text-sm">Review your mastered countries.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => { if (selectedFlags.length > 0) { const customPool = activeData.filter(f => selectedFlags.includes(f.code)); startPracticeMode(customPool) } else { startPracticeMode() } }} disabled={selectedFlags.length === 0 && totalStats.mastered < 5} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm shadow-md transition-all ${selectedFlags.length > 0 ? 'bg-blue-600 hover:bg-blue-700 text-white' : (totalStats.mastered >= 5 ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-300 dark:border-slate-700 cursor-not-allowed')}`}><Dumbbell size={16} /> {selectedFlags.length > 0 ? `Practice Selected (${selectedFlags.length})` : `Practice Mastered (${totalStats.mastered})`}</button>
                                        <div className="flex gap-1 ml-2 border-l border-slate-300 dark:border-slate-700 pl-3">
                                            <button onClick={resetProgress} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 rounded-full transition-colors" title="Reset Progress"><RotateCcw size={20} /></button>
                                            <button onClick={() => setShowGallery(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"><X size={24} className="text-slate-500 dark:text-slate-400" /></button>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-sm pt-2 border-t border-slate-200 dark:border-slate-800">
                                    <button onClick={selectAllMastered} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"><CheckSquare size={16} /> Select All Mastered</button>
                                    <button onClick={deselectAll} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 font-medium px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"><Square size={16} /> Clear Selection</button>

                                    <div className="ml-auto flex items-center">
                                        {showCheatConfirm ? (
                                            <button onClick={handleCheatProgress} className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-bold px-3 py-1 rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors animate-pulse">
                                                <Unlock size={16} /> Unlock all map progress? Click to confirm!
                                            </button>
                                        ) : (
                                            <button onClick={handleCheatProgress} className="flex items-center gap-1.5 text-slate-500 dark:text-slate-500 hover:text-amber-500 dark:hover:text-amber-400 font-medium px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                                                <Unlock size={16} /> Cheat Progress
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950">
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
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
                                                 className={`relative aspect-[4/3] rounded-xl overflow-hidden shadow-sm border transition-all duration-200 group 
                                                     ${isSelected ? 'ring-4 ring-blue-500 border-blue-600 z-10 scale-[1.02] cursor-pointer'
                                                     : (isMastered ? 'border-emerald-300 dark:border-emerald-800 ring-2 ring-emerald-500/20 cursor-pointer'
                                                         : (isLocked ? 'bg-slate-200 dark:bg-slate-900 border-slate-300 dark:border-slate-800 cursor-default' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-80 cursor-default'))}
                                                 `}
                                            >
                                                {isLocked ? (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 gap-2">
                                                        <Lock size={24} />
                                                        <span className="text-xs font-bold uppercase tracking-widest opacity-50">Locked</span>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <img
                                                            src={flag.image}
                                                            alt={isMastered ? displayName : "Flag"}
                                                            className={`w-full h-full object-cover transition-all ${isSelected ? 'opacity-100' : (isMastered ? 'opacity-100' : 'opacity-80 grayscale-[0.3]')}`}
                                                            loading="lazy"
                                                        />

                                                        {isSelected && <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center"><div className="bg-blue-500 text-white rounded-full p-1.5 shadow-lg"><Check size={20} strokeWidth={4} /></div></div>}

                                                        {!isSelected && isMastered && <div className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full p-1 shadow-sm"><Check size={12} strokeWidth={4} /></div>}

                                                        {!isSelected && !isMastered && isSeen && <div className="absolute bottom-0 w-full bg-slate-900/50 text-white text-[10px] text-center py-1 backdrop-blur-sm">{p.streak}/3</div>}
                                                    </>
                                                )}

                                                {!isLocked && (
                                                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-2">
                                                        <span className="text-white text-xs font-bold text-center">{isMastered ? displayName : "Yet to find"}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    )
}