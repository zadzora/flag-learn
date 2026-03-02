import { useEffect, useState, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, ZoomIn, ZoomOut, Maximize, Trophy, X, Timer, Repeat, Sun, Moon, MapPin, Flag as FlagIcon, Landmark, AlertTriangle } from "lucide-react"
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from "react-simple-maps"
import worldData from "../../data/flags.json"

const geoUrl = "/world-map.json"
const THEME_KEY = "flag-master-theme"

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
]

type Flag = { code: string; name: string | string[]; capital?: (string | null)[] | null; image: string }
type GameStep = 'map' | 'country' | 'capital'

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

function normalize(str: string) {
    return str.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim()
}

function getPrimaryName(flag: Flag) {
    return Array.isArray(flag.name) ? flag.name[0] : flag.name;
}

function getPrimaryCapital(flag: Flag) {
    return (flag.capital && flag.capital[0]) ? flag.capital[0] : "";
}

export default function UltimateGame() {
    const navigate = useNavigate(); // Pridaný hook pre presmerovanie

    const activeData = useMemo(() => {
        return (worldData as unknown as Flag[]).filter(f => !UNSUPPORTED_MAP_CODES.includes(f.code) && f.capital && f.capital[0] !== null);
    }, [])

    const [pool, setPool] = useState<Flag[]>([])
    const [guessedIds, setGuessedIds] = useState<string[]>([])
    const [current, setCurrent] = useState<Flag | null>(null)

    const [step, setStep] = useState<GameStep>('map')
    const [status, setStatus] = useState<'idle' | 'correct' | 'error'>('idle')
    const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)
    const [clickedGeo, setClickedGeo] = useState<string | null>(null)

    const [input, setInput] = useState("")
    const inputRef = useRef<HTMLInputElement>(null)

    const [mistakes, setMistakes] = useState(0)
    const [streak, setStreak] = useState(0)
    const [startTime, setStartTime] = useState<number>(0)
    const [elapsedTime, setElapsedTime] = useState(0)
    const [gameFinished, setGameFinished] = useState(false)
    const [showExitConfirm, setShowExitConfirm] = useState(false) // Nový stav pre exit modal
    const [position, setPosition] = useState({ coordinates: [0, 0] as [number, number], zoom: 1 })

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

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light')

    useEffect(() => { startGame() }, [])

    useEffect(() => {
        let interval: any
        if (startTime > 0 && !gameFinished) {
            interval = setInterval(() => setElapsedTime(Math.floor((Date.now() - startTime) / 1000)), 1000)
        }
        return () => clearInterval(interval)
    }, [startTime, gameFinished])

    useEffect(() => {
        if ((step === 'country' || step === 'capital') && status === 'idle' && !showExitConfirm) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [step, status, showExitConfirm])

    function startGame() {
        const shuffled = [...activeData].sort(() => 0.5 - Math.random());
        setPool(shuffled);
        setGuessedIds([]);
        setMistakes(0);
        setStreak(0);
        setStartTime(Date.now());
        setElapsedTime(0);
        setGameFinished(false);
        pickNext(shuffled);
    }

    function formatTime(seconds: number) {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    function pickNext(currentPool: Flag[]) {
        if (currentPool.length === 0) {
            setGameFinished(true);
            setCurrent(null);
            return;
        }
        setCurrent(currentPool[0]);
        setStep('map');
        setStatus('idle');
        setFeedbackMsg(null);
        setClickedGeo(null);
        setInput("");
        setPosition({ coordinates: [0, 0], zoom: 1 });
    }

    function finalizeStep(success: boolean) {
        if (!current) return;

        let newPool = [...pool];

        if (success) {
            if (step === 'map') {
                setStep('country');
            } else if (step === 'country') {
                setStep('capital');
            } else {
                newPool.shift();
                setGuessedIds(prev => [...prev, current.code]);
                setPool(newPool);
                pickNext(newPool);
                return;
            }
        } else {
            newPool.shift();
            let insertIndex = 0;
            if (newPool.length > 0) {
                insertIndex = Math.floor(Math.random() * newPool.length) + 1;
            }
            newPool.splice(insertIndex, 0, current);
            setPool(newPool);
            pickNext(newPool);
            return;
        }

        setStatus('idle');
        setFeedbackMsg(null);
        setInput("");
        setClickedGeo(null);
    }

    function handleCountryClick(geo: any) {
        if (step !== 'map' || status !== 'idle' || !current || showExitConfirm) return;

        const isCorrect = checkCountryMatch(geo, current);

        if (isCorrect) {
            setStatus('correct');
            setStreak(s => s + 1);
            setFeedbackMsg("Perfect location! ✅");
            setTimeout(() => finalizeStep(true), 1000);
        } else {
            setClickedGeo(geo.rsmKey);
            setStatus('error');
            setMistakes(m => m + 1);
            setStreak(0);
            setFeedbackMsg("Wrong location! ❌ Moving on...");
            setTimeout(() => finalizeStep(false), 2500);
        }
    }

    function handleTextSubmit() {
        if (status !== 'idle' || (step !== 'country' && step !== 'capital') || !current || !input.trim() || showExitConfirm) return;

        const userAns = normalize(input);
        let isCorrect = false;
        let correctDisplay = "";

        if (step === 'country') {
            isCorrect = Array.isArray(current.name) ? current.name.some(n => normalize(n) === userAns) : normalize(current.name) === userAns;
            correctDisplay = getPrimaryName(current);
        } else {
            isCorrect = current.capital!.some(c => typeof c === 'string' && normalize(c) === userAns);
            correctDisplay = getPrimaryCapital(current);
        }

        if (isCorrect) {
            setStatus('correct');
            setStreak(s => s + 1);
            setFeedbackMsg("Correct! ✅");
            setTimeout(() => finalizeStep(true), 1000);
        } else {
            setStatus('error');
            setMistakes(m => m + 1);
            setStreak(0);
            setFeedbackMsg(`Wrong ❌ It was: ${correctDisplay}. Moving on...`);
            setTimeout(() => finalizeStep(false), 2500);
        }
    }

    function handleZoomIn() { if (position.zoom >= 15) return; setPosition(pos => ({ ...pos, zoom: pos.zoom * 1.5 })) }
    function handleZoomOut() { if (position.zoom <= 1) return; setPosition(pos => ({ ...pos, zoom: pos.zoom / 1.5 })) }
    function handleResetZoom() { setPosition({ coordinates: [0, 0], zoom: 1 }) }

    const renderMap = useMemo(() => {
        return (
            <ComposableMap projection="geoMercator" projectionConfig={{ scale: 140 }} width={800} height={600} style={{ width: "100%", height: "100%", outline: "none" }}>
                <defs>
                    {activeData.map(f => (
                        <pattern key={`pattern-${f.code}`} id={`flag-${f.code}`} patternUnits="objectBoundingBox" width="1" height="1" viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice">
                            <image href={f.image} x="0" y="0" width="300" height="200" preserveAspectRatio="xMidYMid slice" opacity={theme === 'dark' ? "0.85" : "0.95"} />
                        </pattern>
                    ))}
                </defs>

                <ZoomableGroup zoom={position.zoom} center={position.coordinates} onMoveEnd={setPosition} maxZoom={30} translateExtent={[[-100, -100], [900, 700]]}>
                    <Geographies geography={geoUrl}>
                        {({ geographies }) =>
                            geographies.map((geo) => {
                                const isTarget = checkCountryMatch(geo, current)
                                const isClicked = geo.rsmKey === clickedGeo
                                const isGuessed = guessedIds.includes(activeData.find(f => checkCountryMatch(geo, f))?.code || "")

                                let fill = theme === 'dark' ? "#1e293b" : "#e2e8f0"
                                let stroke = theme === 'dark' ? "#334155" : "#94a3b8"
                                let hoverFill = theme === 'dark' ? "#334155" : "#cbd5e1"
                                let hoverStroke = theme === 'dark' ? "#64748b" : "#64748b"

                                if (isGuessed && status !== 'error') {
                                    const guessedFlag = activeData.find(f => checkCountryMatch(geo, f));
                                    if (guessedFlag) {
                                        fill = `url(#flag-${guessedFlag.code})`;
                                        hoverFill = fill;
                                    }
                                }

                                if (step === 'map' && status === 'error') {
                                    if (isClicked) {
                                        fill = theme === 'dark' ? "#ef4444" : "#f87171"
                                        hoverFill = fill;
                                    }
                                    if (isTarget) {
                                        fill = theme === 'dark' ? "#10b981" : "#34d399"
                                        stroke = theme === 'dark' ? "#6ee7b7" : "#a7f3d0"
                                        hoverFill = fill;
                                    }
                                }

                                return (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        onClick={() => handleCountryClick(geo)}
                                        style={{
                                            default: { fill, stroke, strokeWidth: 0.15, outline: "none", transition: "fill 250ms" },
                                            hover: { fill: isClicked ? fill : hoverFill, stroke: hoverStroke, strokeWidth: 0.3, outline: "none", cursor: step === 'map' && status === 'idle' ? "pointer" : "default" },
                                            pressed: { fill: step === 'map' && status === 'idle' ? (theme === 'dark' ? "#cbd5e1" : "#94a3b8") : hoverFill, strokeWidth: 0.15, outline: "none" },
                                        }}
                                    />
                                )
                            })
                        }
                    </Geographies>
                    {OCEAN_LABELS.map(({ name, coordinates, size, rotate }) => (
                        <Marker key={name} coordinates={coordinates}>
                            <text textAnchor="middle" y={0} transform={rotate ? `rotate(${rotate})` : undefined} style={{ fontFamily: "system-ui, sans-serif", fill: theme === 'dark' ? "#64748b" : "#94a3b8", fontSize: size, fontWeight: "600", pointerEvents: "none", opacity: theme === 'dark' ? 0.3 : 0.6, userSelect: "none", letterSpacing: "0.1em" }}>
                                {name.toUpperCase()}
                            </text>
                        </Marker>
                    ))}
                </ZoomableGroup>
            </ComposableMap>
        )
    }, [theme, position, current, clickedGeo, guessedIds, step, status, activeData])

    return (
        <div className={`h-screen w-full flex flex-col overflow-hidden relative select-none transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0f172a] text-slate-100' : 'bg-[#f8fafc] text-slate-800'}`}>

            {/* --- UI LAYER --- */}
            <div className="absolute top-0 left-0 w-full z-20 flex flex-col pointer-events-none">

                {/* Top Header Bar */}
                <div className="w-full bg-indigo-600 dark:bg-indigo-900/90 backdrop-blur-md text-white p-2 flex justify-between items-center px-4 sm:px-8 shadow-md pointer-events-auto">

                    {/* Tlačidlo späť v štýle ako inde, s potvrdzovacím kontajnerom */}
                    <button
                        onClick={() => setShowExitConfirm(true)}
                        className="p-2 sm:p-2.5 rounded-full bg-white text-indigo-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700 shadow-sm hover:scale-105"
                        title="Back to Menu"
                    >
                        <ArrowLeft size={20} />
                    </button>

                    <div className="flex items-center gap-2 sm:gap-4 font-bold text-sm sm:text-lg">
                        <span className="hidden sm:inline">🌍 Ultimate Mode 🌍</span>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-4">
                        <button onClick={toggleTheme} className="p-1.5 rounded-full bg-indigo-700 dark:bg-indigo-800 hover:bg-indigo-800 transition-colors">
                            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                        </button>
                        <div className="flex items-center gap-1 font-mono text-indigo-100"><Timer size={16} />{formatTime(elapsedTime)}</div>
                        <div className="text-sm font-bold text-orange-300 flex items-center gap-1">🔥 {streak}</div>
                        <div className="w-px h-5 bg-indigo-500 dark:bg-indigo-700"></div>
                        <div className="text-sm font-medium opacity-80 hidden sm:block">Rem: {pool.length}</div>
                        <div className="text-sm font-bold text-red-200 bg-red-900/30 px-2 py-0.5 rounded flex items-center gap-1 border border-red-500/30"><X size={14} /> {mistakes}</div>
                    </div>
                </div>

                {/* Game Control Panel (Floating below header) */}
                <div className="w-full flex justify-center mt-3 px-2 sm:px-4 pointer-events-none">
                    <AnimatePresence mode="wait">
                        {current && !gameFinished && (
                            <motion.div key={current.code} initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-3 sm:px-6 sm:py-3 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-4xl pointer-events-auto flex flex-col sm:flex-row items-center gap-4 sm:gap-8">

                                {/* 1. Flag & Stepper Section */}
                                <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto">
                                    {/* Flag */}
                                    <div className="h-12 sm:h-16 shrink-0 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-inner flex items-center justify-center">
                                        <img src={current.image} alt="Target Flag" className="h-full w-auto max-w-[5rem] sm:max-w-[7rem] object-contain rounded" />
                                    </div>

                                    {/* Compact Stepper */}
                                    <div className="flex items-center gap-1.5 sm:gap-3 text-[10px] sm:text-xs font-bold shrink-0">
                                        <div className={`flex flex-col items-center gap-1 ${step === 'map' ? 'text-indigo-600 dark:text-indigo-400' : 'text-emerald-500'}`}>
                                            <div className={`p-1.5 rounded-full ${step === 'map' ? 'bg-indigo-100 dark:bg-indigo-900/50 shadow-sm' : 'bg-emerald-100 dark:bg-emerald-900/50'}`}><MapPin size={14}/></div>
                                            <span>Map</span>
                                        </div>
                                        <div className={`w-3 sm:w-6 h-0.5 rounded-full ${step === 'country' || step === 'capital' ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}></div>
                                        <div className={`flex flex-col items-center gap-1 ${step === 'country' ? 'text-indigo-600 dark:text-indigo-400' : step === 'capital' ? 'text-emerald-500' : 'text-slate-400'}`}>
                                            <div className={`p-1.5 rounded-full ${step === 'country' ? 'bg-indigo-100 dark:bg-indigo-900/50 shadow-sm' : step === 'capital' ? 'bg-emerald-100 dark:bg-emerald-900/50' : 'bg-slate-100 dark:bg-slate-700'}`}><FlagIcon size={14}/></div>
                                            <span>Country</span>
                                        </div>
                                        <div className={`w-3 sm:w-6 h-0.5 rounded-full ${step === 'capital' ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}></div>
                                        <div className={`flex flex-col items-center gap-1 ${step === 'capital' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
                                            <div className={`p-1.5 rounded-full ${step === 'capital' ? 'bg-indigo-100 dark:bg-indigo-900/50 shadow-sm' : 'bg-slate-100 dark:bg-slate-700'}`}><Landmark size={14}/></div>
                                            <span>Capital</span>
                                        </div>
                                    </div>
                                </div>

                                {/* 2. Input / Feedback Section */}
                                <div className="flex-1 w-full flex flex-col justify-center relative min-h-[3rem]">
                                    {step === 'map' && status === 'idle' && (
                                        <div className="w-full text-center font-bold text-slate-500 dark:text-slate-400 py-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800 animate-pulse">
                                            Click the country on the map
                                        </div>
                                    )}
                                    {(step === 'country' || step === 'capital') && status === 'idle' && (
                                        <input
                                            ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleTextSubmit() }} disabled={status !== 'idle' || showExitConfirm}
                                            placeholder={step === 'country' ? "Name the country..." : "Name the capital city..."}
                                            className="w-full px-4 py-2 sm:py-3 text-center text-base sm:text-lg font-bold rounded-xl border-2 outline-none transition-colors border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:border-indigo-500 dark:focus:border-indigo-500 shadow-inner"
                                        />
                                    )}

                                    <AnimatePresence mode="wait">
                                        {status !== 'idle' && feedbackMsg && (
                                            <motion.div key={feedbackMsg} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={`absolute inset-0 flex items-center justify-center font-bold text-sm sm:text-base rounded-xl border-2 shadow-sm ${status === 'error' ? 'bg-red-50 border-red-400 text-red-600 dark:bg-red-900/50 dark:border-red-600 dark:text-red-400' : 'bg-emerald-50 border-emerald-400 text-emerald-600 dark:bg-emerald-900/50 dark:border-emerald-600 dark:text-emerald-400'}`}>
                                                {feedbackMsg}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* --- EXIT CONFIRMATION MODAL --- */}
            <AnimatePresence>
                {showExitConfirm && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl text-center flex flex-col items-center gap-6 max-w-sm border border-slate-200 dark:border-slate-700 w-full pointer-events-auto">
                            <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-full text-red-500 dark:text-red-400">
                                <AlertTriangle size={48} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Quit Ultimate Mode?</h2>
                                <p className="text-slate-500 dark:text-slate-400">If you leave now, all your current progress and painted flags will be lost.</p>
                            </div>
                            <div className="w-full flex flex-col gap-3 mt-2">
                                <button onClick={() => navigate('/')} className="w-full py-3.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-red-500/20 transition-all active:scale-95">Yes, Quit</button>
                                <button onClick={() => setShowExitConfirm(false)} className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-lg transition-all active:scale-95">Cancel</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- END SCREEN --- */}
            <AnimatePresence>
                {gameFinished && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl text-center flex flex-col items-center gap-6 max-w-md border border-slate-200 dark:border-slate-700 w-full pointer-events-auto">
                            <div className="bg-yellow-100 dark:bg-yellow-900/30 p-4 rounded-full text-yellow-500 dark:text-yellow-400 animate-bounce"><Trophy size={64} /></div>
                            <div>
                                <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">Ultimate Master!</h2>
                                <p className="text-slate-500 dark:text-slate-400">You conquered the world map with flying colors.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 w-full">
                                <div className="bg-red-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-red-100 dark:border-red-900/30">
                                    <div className="text-xs uppercase font-bold text-red-500 mb-1">Mistakes</div>
                                    <div className="text-3xl font-bold text-red-600 dark:text-red-400">{mistakes}</div>
                                </div>
                                <div className="bg-indigo-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
                                    <div className="text-xs uppercase font-bold text-indigo-500 mb-1">Time</div>
                                    <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{formatTime(elapsedTime)}</div>
                                </div>
                            </div>
                            <div className="w-full flex flex-col gap-3">
                                <button onClick={() => startGame()} className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"><Repeat size={20} /> Play Again</button>
                                <Link to="/" className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-lg transition-all active:scale-95 text-center">Back to Menu</Link>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- MAP --- */}
            <div className="w-full flex-1 relative cursor-grab active:cursor-grabbing outline-none">
                {renderMap}

                {/* Map Controls */}
                <div className="absolute bottom-8 right-8 flex flex-col gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl z-20 pointer-events-auto">
                    <button onClick={handleZoomIn} className="p-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white rounded-xl transition-colors"><ZoomIn size={24}/></button>
                    <button onClick={handleResetZoom} className="p-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white rounded-xl transition-colors"><Maximize size={24}/></button>
                    <button onClick={handleZoomOut} className="p-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white rounded-xl transition-colors"><ZoomOut size={24}/></button>
                </div>
            </div>

        </div>
    )
}