import { useEffect, useState, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link, useNavigate } from "react-router-dom"
import { ZoomIn, ZoomOut, Maximize, Trophy, X, Timer, Repeat, MapPin, Flag as FlagIcon, Landmark, AlertTriangle, Flame } from "lucide-react"
import TopBar, { BarButton } from "../components/TopBar"
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from "react-simple-maps"
import worldData from "../../data/flags.json"
import { resolveTextAnswer, typoFeedbackForStreak } from "../utils/textAnswerMatch"

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

        let correctDisplay = "";
        const accept =
            step === 'country'
                ? Array.isArray(current.name)
                    ? [...current.name]
                    : [current.name]
                : current.capital!.filter((c): c is string => typeof c === 'string');

        if (step === 'country') correctDisplay = getPrimaryName(current);
        else correctDisplay = getPrimaryCapital(current);

        const match = resolveTextAnswer(input, accept);
        if (match === 'close') {
            setFeedbackMsg(typoFeedbackForStreak(streak > 0));
            setTimeout(() => setFeedbackMsg(null), 2800);
            return;
        }

        const isCorrect = match === 'exact';

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

                                let fill = theme === 'dark' ? "#1A2135" : "#DDE3EE"
                                let stroke = theme === 'dark' ? "#2E3858" : "#A6B0C8"
                                let hoverFill = theme === 'dark' ? "#253050" : "#C9D2E3"
                                let hoverStroke = theme === 'dark' ? "#4A5680" : "#66718F"

                                if (isGuessed && status !== 'error') {
                                    const guessedFlag = activeData.find(f => checkCountryMatch(geo, f));
                                    if (guessedFlag) {
                                        fill = `url(#flag-${guessedFlag.code})`;
                                        hoverFill = fill;
                                    }
                                }

                                if (step === 'map' && status === 'error') {
                                    if (isClicked) {
                                        fill = theme === 'dark' ? "#f43f5e" : "#fb7185"
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
                                            pressed: { fill: step === 'map' && status === 'idle' ? (theme === 'dark' ? "#3A4670" : "#A6B0C8") : hoverFill, strokeWidth: 0.15, outline: "none" },
                                        }}
                                    />
                                )
                            })
                        }
                    </Geographies>
                    {OCEAN_LABELS.map(({ name, coordinates, size, rotate }) => (
                        <Marker key={name} coordinates={coordinates}>
                            <text textAnchor="middle" y={0} transform={rotate ? `rotate(${rotate})` : undefined} style={{ fontFamily: "var(--font-sans)", fill: theme === 'dark' ? "#66718F" : "#8C97B3", fontSize: size, fontWeight: "600", pointerEvents: "none", opacity: theme === 'dark' ? 0.45 : 0.6, userSelect: "none", letterSpacing: "0.1em" }}>
                                {name.toUpperCase()}
                            </text>
                        </Marker>
                    ))}
                </ZoomableGroup>
            </ComposableMap>
        )
    }, [theme, position, current, clickedGeo, guessedIds, step, status, activeData])

    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const dialog = `${panel} shadow-xl`
    const primary = "rounded-lg bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const stepState = (s: GameStep) => {
        const order: GameStep[] = ['map', 'country', 'capital']
        const at = order.indexOf(step), me = order.indexOf(s)
        return me === at ? 'current' : me < at ? 'done' : 'todo'
    }
    const stepClass = (s: GameStep) => {
        const st = stepState(s)
        return st === 'current' ? 'text-blue-600 dark:text-blue-400' : st === 'done' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
    }

    return (
        <div className="relative flex h-screen w-full select-none flex-col overflow-hidden text-slate-900 dark:text-[#E8ECF6]">

            <TopBar title="Ultimate Mode" back={() => setShowExitConfirm(true)} theme={theme} onToggleTheme={toggleTheme}>
                <span className="flex items-center gap-1 font-mono text-sm font-bold tabular-nums" title="Time"><Timer size={16} aria-hidden />{formatTime(elapsedTime)}</span>
                <span className={`flex items-center gap-1 text-sm font-bold ${streak > 0 ? 'text-orange-500 dark:text-orange-400' : 'text-slate-400 dark:text-slate-500'}`} title="Streak"><Flame size={15} aria-hidden /> {streak}</span>
                <span className="hidden text-sm text-slate-500 sm:block dark:text-slate-400">Rem: {pool.length}</span>
                <span className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-sm font-bold text-red-600 dark:text-red-300" title="Mistakes"><X size={14} aria-hidden /> {mistakes}</span>
            </TopBar>

            {/* --- MAP --- */}
            <div className="relative w-full flex-1 cursor-grab outline-none active:cursor-grabbing">
                {renderMap}

                {/* Game Control Panel (floating over the top of the map). The card stays put; only its content changes. */}
                {current && !gameFinished && (
                    <div className="pointer-events-none absolute left-0 top-0 z-20 flex w-full justify-center px-3 pt-3 sm:px-4">
                        <div className={`${panel} pointer-events-auto flex w-full max-w-4xl flex-col items-center gap-3 p-3 sm:flex-row sm:gap-6 sm:px-5`}>

                            {/* Flag & Stepper Section */}
                            <div className="flex w-full items-center gap-4 sm:w-auto sm:gap-6">
                                <div className="flex h-12 shrink-0 items-center justify-center sm:h-16">
                                    <img key={current.code} src={current.image} alt="Target Flag" className="fl-in h-full w-auto max-w-[5rem] rounded-[4px] object-contain shadow-[0_2px_10px_rgba(10,14,26,0.18)] sm:max-w-[7rem]" />
                                </div>

                                {/* Compact Stepper */}
                                <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider sm:gap-3 sm:text-[11px]">
                                    <div className={`flex flex-col items-center gap-1 ${stepClass('map')}`}>
                                        <MapPin size={16} aria-hidden />
                                        <span>Map</span>
                                    </div>
                                    <div className={`h-0.5 w-3 rounded-sm sm:w-6 ${step === 'country' || step === 'capital' ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}></div>
                                    <div className={`flex flex-col items-center gap-1 ${stepClass('country')}`}>
                                        <FlagIcon size={16} aria-hidden />
                                        <span>Country</span>
                                    </div>
                                    <div className={`h-0.5 w-3 rounded-sm sm:w-6 ${step === 'capital' ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}></div>
                                    <div className={`flex flex-col items-center gap-1 ${stepClass('capital')}`}>
                                        <Landmark size={16} aria-hidden />
                                        <span>Capital</span>
                                    </div>
                                </div>
                            </div>

                            {/* Input / Feedback Section */}
                            <div className="relative flex min-h-[3rem] w-full flex-1 flex-col justify-center">
                                {step === 'map' && status === 'idle' && (
                                    <div className="w-full rounded-lg border border-dashed border-slate-300 py-3 text-center font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                        Click the country on the map
                                    </div>
                                )}
                                {(step === 'country' || step === 'capital') && status === 'idle' && (
                                    <input
                                        ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleTextSubmit() }} disabled={status !== 'idle' || showExitConfirm}
                                        placeholder={step === 'country' ? "Name the country..." : "Name the capital city..."}
                                        className="w-full border border-slate-200 bg-slate-50 px-4 py-2 text-center text-base font-semibold text-slate-900 outline-none transition-colors focus:border-slate-500 sm:py-3 sm:text-lg dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#4A5680]"
                                    />
                                )}

                                {feedbackMsg && (
                                    <div
                                        key={feedbackMsg}
                                        className={`fl-in absolute inset-0 z-10 flex items-center justify-center rounded-lg border bg-[#fff] px-2 text-center text-sm font-bold sm:text-base dark:bg-[#121829] ${
                                            status === 'error'
                                                ? 'border-red-400 text-red-600 dark:border-red-500/60 dark:text-red-400'
                                                : status === 'correct'
                                                    ? 'border-emerald-400 text-emerald-600 dark:border-emerald-500/60 dark:text-emerald-400'
                                                    : 'pointer-events-none border-amber-400 text-amber-700 dark:border-amber-500/60 dark:text-amber-300'
                                        }`}
                                    >
                                        {feedbackMsg}
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                )}

                {/* Map Controls */}
                <div className="pointer-events-auto absolute bottom-6 right-4 z-20 flex flex-col gap-2 sm:bottom-8 sm:right-6">
                    <BarButton onClick={handleZoomIn} label="Zoom in"><ZoomIn size={19} aria-hidden /></BarButton>
                    <BarButton onClick={handleResetZoom} label="Reset zoom"><Maximize size={18} aria-hidden /></BarButton>
                    <BarButton onClick={handleZoomOut} label="Zoom out"><ZoomOut size={19} aria-hidden /></BarButton>
                </div>
            </div>

            {/* --- EXIT CONFIRMATION MODAL --- */}
            <AnimatePresence>
                {showExitConfirm && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
                        <div className={`${dialog} pointer-events-auto flex w-full max-w-sm flex-col gap-6 p-6 sm:p-8`}>
                            <div className="flex items-start gap-4">
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-red-500 dark:border-slate-700 dark:text-red-400"><AlertTriangle size={24} aria-hidden /></span>
                                <div>
                                    <h2 className="text-2xl font-bold">Quit Ultimate Mode?</h2>
                                    <p className="mt-1 text-slate-500 dark:text-slate-400">If you leave now, all your current progress and painted flags will be lost.</p>
                                </div>
                            </div>
                            <div className="flex w-full flex-col gap-3">
                                <button onClick={() => navigate('/')} className="w-full rounded-lg bg-red-600 py-3.5 font-bold text-white hover:bg-red-700">Yes, Quit</button>
                                <button onClick={() => setShowExitConfirm(false)} className={`${quiet} w-full py-3.5 font-bold`}>Cancel</button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- END SCREEN --- */}
            <AnimatePresence>
                {gameFinished && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
                        <div className={`${dialog} pointer-events-auto flex w-full max-w-md flex-col gap-6 p-6 sm:p-8`}>
                            <div className="flex items-center gap-4">
                                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700"><Trophy size={28} aria-hidden /></span>
                                <div>
                                    <h2 className="text-3xl font-bold">Ultimate Master!</h2>
                                    <p className="mt-1 text-slate-500 dark:text-slate-400">You conquered the world map with flying colors.</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Mistakes</div>
                                    <div className={`mt-1 text-3xl font-bold ${mistakes ? 'text-red-500' : 'text-emerald-500'}`}>{mistakes}</div>
                                </div>
                                <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Time</div>
                                    <div className="mt-1 text-3xl font-bold tabular-nums">{formatTime(elapsedTime)}</div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button onClick={() => startGame()} className={`${primary} flex flex-1 items-center justify-center gap-2 py-3.5 font-bold`}><Repeat size={18} aria-hidden /> Play Again</button>
                                <Link to="/" className={`${quiet} flex flex-1 items-center justify-center py-3.5 font-bold`}>Back to Menu</Link>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    )
}
