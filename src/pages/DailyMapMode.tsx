import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowLeft, Calendar, Moon, Sun, MapPin, Check, ZoomIn, ZoomOut, Maximize } from "lucide-react"
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"
import worldData from "../../data/flags.json"

const geoUrl = "/world-map.json"
const THEME_KEY = "flag-master-theme"
const DAILY_MAP_STORAGE_KEY = "flag-master-daily-map-save"

const UNSUPPORTED_MAP_CODES = [
    "ad", "mc", "sm", "va", "li", "sg", "mt", "bh", "mv", "nr", "tv",
    "mh", "pw", "fm", "ws", "to", "ki", "st", "sc", "km", "bb", "vc",
    "gd", "ag", "kn", "lc", "dm", "hk", "mo", "pr", "aq", "cv", "mu", "fo", "gb-sct", "gb-wls", "gb-nir", "gb-eng"
]

type Flag = { code: string; name: string | string[]; image: string }
type Position = { coordinates: [number, number]; zoom: number }
type Geometry = { type?: string; coordinates?: any; geometries?: Geometry[] }
type GeoShape = { rsmKey: string; properties?: any; geometry?: Geometry }

function checkCountryMatch(geo: GeoShape, target: Flag | null) {
    if (!target || !geo.properties) return false

    const geoName = (geo.properties.name || geo.properties.NAME || "").toLowerCase().replace(/[^a-z]/g, "")
    const flagNames = Array.isArray(target.name) ? target.name : [target.name]

    return flagNames.some(n => {
        const fName = n.toLowerCase().replace(/[^a-z]/g, "")
        if (geoName === fName) return true
        if (geoName === "unitedstatesofamerica" && fName === "unitedstates") return true
        if (geoName === "unitedrepublicoftanzania" && fName === "tanzania") return true
        if (geoName === "demrepcongo" && fName === "drcongo") return true
        if (geoName === "congo" && fName === "republicofthecongo") return true
        if (geoName === "czechia" && fName === "czechrepublic") return true
        if (geoName === "republicofserbia" && fName === "serbia") return true
        if (geoName === "republicofkorea" && fName === "southkorea") return true
        if (geoName === "dempeoplesrepofkorea" && fName === "northkorea") return true
        if (geoName === "eswatini" && fName === "swaziland") return true
        if (geoName === "northmacedonia" && fName === "macedonia") return true
        if (geoName === "republicofmoldova" && fName === "moldova") return true
        if (geoName === "thebahamas" && fName === "bahamas") return true
        if (geoName === "myanmar" && fName === "myanmarburma") return true
        if (geoName === "vatican" && fName === "vaticancity") return true
        if (geoName === "palestine" && fName === "stateofpalestine") return true
        if (geoName === "bosniaandherz" && fName === "bosnia") return true
        if (geoName === "centralafricanrep" && fName === "car") return true
        if (geoName === "eqguinea" && fName === "equatorialguinea") return true
        if (geoName === "dominicanrep" && fName === "dominicana") return true
        if (geoName === "ctedivoire" && fName === "ivorycoast") return true
        if (geoName === "solomonis" && fName === "solomonislands") return true
        if (geoName === "ssudan" && fName === "southsudan") return true
        return false
    })
}

function collectLonLatPoints(geometry?: Geometry): [number, number][] {
    if (!geometry) return []

    if (geometry.type === "Polygon") {
        const rings = geometry.coordinates as [number, number][][]
        return rings ? rings.flat() : []
    }
    if (geometry.type === "MultiPolygon") {
        const polygons = geometry.coordinates as [number, number][][][]
        return polygons ? polygons.flat(2) : []
    }
    if (geometry.type === "GeometryCollection") {
        return (geometry.geometries || []).flatMap(g => collectLonLatPoints(g))
    }
    return []
}

function getGeoCentroid(geo: GeoShape): [number, number] | null {
    const points = collectLonLatPoints(geo.geometry)
    if (!points.length) return null

    let lonSum = 0
    let latSum = 0
    points.forEach(([lon, lat]) => {
        lonSum += lon
        latSum += lat
    })
    return [lonSum / points.length, latSum / points.length]
}

function toRad(value: number) {
    return (value * Math.PI) / 180
}

function distanceKm(a: [number, number], b: [number, number]) {
    const R = 6371
    const dLat = toRad(b[1] - a[1])
    const dLon = toRad(b[0] - a[0])
    const lat1 = toRad(a[1])
    const lat2 = toRad(b[1])
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(h))
}

function distanceToColor(distance: number, maxDistance: number) {
    const safeMax = Math.max(maxDistance, 1)
    const normalized = Math.min(Math.max(distance / safeMax, 0), 1)
    const hue = Math.round(120 * normalized) // 0 = red, 120 = green
    return `hsl(${hue} 85% 55%)`
}

export default function DailyMapMode() {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "UTC" })

    const activeData = useMemo(() => {
        return (worldData as unknown as Flag[]).filter(f => !UNSUPPORTED_MAP_CODES.includes(f.code))
    }, [])

    const dailyCountry = useMemo(() => {
        let hash = 0
        const key = `${todayStr}-daily-map`
        for (let i = 0; i < key.length; i++) {
            hash = (hash << 5) - hash + key.charCodeAt(i)
            hash |= 0
        }
        return activeData[Math.abs(hash) % activeData.length]
    }, [todayStr, activeData])

    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window !== "undefined") return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || "light"
        return "light"
    })
    const [status, setStatus] = useState<'playing' | 'won'>(() => {
        const saved = localStorage.getItem(DAILY_MAP_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (parsed.date === todayStr) return parsed.status || "playing"
            } catch {}
        }
        return "playing"
    })
    const [attemptCount, setAttemptCount] = useState<number>(() => {
        const saved = localStorage.getItem(DAILY_MAP_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (parsed.date === todayStr) return parsed.attemptCount || 0
            } catch {}
        }
        return 0
    })
    const [wrongSteps, setWrongSteps] = useState<number>(() => {
        const saved = localStorage.getItem(DAILY_MAP_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (parsed.date === todayStr) return parsed.wrongSteps || 0
            } catch {}
        }
        return 0
    })
    const [hintDistanceKm, setHintDistanceKm] = useState<number | null>(null)
    const [clickedColors, setClickedColors] = useState<Record<string, string>>(() => {
        const saved = localStorage.getItem(DAILY_MAP_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (parsed.date === todayStr) return parsed.clickedColors || {}
            } catch {}
        }
        return {}
    })
    const [position, setPosition] = useState<Position>({ coordinates: [0, 0], zoom: 1 })

    const geographiesRef = useRef<GeoShape[]>([])

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    useEffect(() => {
        localStorage.setItem(DAILY_MAP_STORAGE_KEY, JSON.stringify({
            date: todayStr,
            status,
            attemptCount,
            wrongSteps,
            clickedColors
        }))
    }, [todayStr, status, attemptCount, wrongSteps, clickedColors])

    const toggleTheme = () => setTheme(prev => (prev === "light" ? "dark" : "light"))
    const getCountryName = (f: Flag) => (Array.isArray(f.name) ? f.name[0] : f.name)

    function handleCountryClick(geo: GeoShape) {
        if (status !== "playing") return

        const isCorrect = checkCountryMatch(geo, dailyCountry)
        const nextAttempt = attemptCount + 1
        setAttemptCount(nextAttempt)

        if (isCorrect) {
            setStatus("won")
            setHintDistanceKm(0)
            return
        }
        setWrongSteps(prev => prev + 1)

        const targetGeo = geographiesRef.current.find(g => checkCountryMatch(g, dailyCountry))
        const clickedCentroid = getGeoCentroid(geo)
        const targetCentroid = targetGeo ? getGeoCentroid(targetGeo) : null
        if (!clickedCentroid || !targetCentroid) return

        const distance = distanceKm(clickedCentroid, targetCentroid)
        const maxDistance = 20037 // approx half earth circumference in km
        const color = distanceToColor(distance, maxDistance)
        setHintDistanceKm(Math.round(distance))
        setClickedColors(prev => ({ ...prev, [geo.rsmKey]: color }))
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

    return (
        <div className="h-screen w-full flex flex-col overflow-hidden relative select-none transition-colors duration-500 text-slate-800 dark:text-slate-100">
            <div className="absolute right-3 sm:right-4 top-3 sm:top-4 z-20">
                <button onClick={toggleTheme} className="p-2.5 rounded-full bg-white/80 dark:bg-slate-800/80 shadow-md border border-white/70 dark:border-slate-700/70 text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform">
                    {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
                </button>
            </div>

            <div className="absolute top-0 left-0 w-full z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 p-3 pt-4 sm:p-4 pr-14 shadow-lg">
                <div className="flex items-center gap-3">
                    <Link to="/" className="shrink-0 p-2.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition-colors">
                        <ArrowLeft size={20} />
                    </Link>
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold uppercase tracking-widest text-indigo-500 flex items-center gap-1">
                            <Calendar size={14} /> Daily Map Hunt
                        </div>
                        <h1 className="text-base sm:text-xl font-black text-slate-800 dark:text-white truncate">Find today's country</h1>
                        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">{todayStr}</div>
                    </div>
                </div>
            </div>

            <div className="absolute top-[5.2rem] sm:top-[5.6rem] left-0 w-full z-10 flex justify-center px-4">
                <div className="w-full max-w-xl rounded-xl border px-4 py-2.5 text-center shadow-md bg-white/90 dark:bg-slate-900/90 border-slate-200 dark:border-slate-700">
                    {status === "playing" ? (
                        <div className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2">
                            <MapPin size={14} className="text-indigo-500" />
                            Click countries: more green = farther, more red = closer.
                        </div>
                    ) : (
                        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-sm sm:text-base font-bold text-red-600 dark:text-red-400 flex items-center justify-center gap-2">
                            <Check size={16} /> Correct! Today's country: {getCountryName(dailyCountry)}
                        </motion.div>
                    )}
                    {status === "playing" && hintDistanceKm !== null && (
                        <div className="text-[11px] sm:text-xs mt-1 text-slate-500 dark:text-slate-400">
                            Last click was about {hintDistanceKm.toLocaleString("en-US")} km from the target.
                        </div>
                    )}
                    <div className="mt-2 flex items-center justify-center gap-2">
                        <div className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                            Attempts: <span className="text-indigo-500">{attemptCount}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="w-full h-full pt-36 sm:pt-40 relative">
                <ComposableMap projection="geoMercator" projectionConfig={{ scale: 140 }} width={800} height={600} style={{ width: "100%", height: "100%", outline: "none" }}>
                    <ZoomableGroup
                        zoom={position.zoom}
                        center={position.coordinates}
                        onMoveEnd={(p) => setPosition(p as Position)}
                        maxZoom={30}
                        translateExtent={[[-100, -100], [900, 700]]}
                    >
                        <Geographies geography={geoUrl}>
                            {({ geographies }) => {
                                geographiesRef.current = geographies as GeoShape[]

                                return geographies.map((geo) => {
                                    const isTarget = checkCountryMatch(geo as GeoShape, dailyCountry)
                                    const guessedColor = clickedColors[(geo as GeoShape).rsmKey]

                                    let fill = theme === "dark" ? "#1e293b" : "#e2e8f0"
                                    if (guessedColor) fill = guessedColor
                                    if (status === "won" && isTarget) fill = "#ef4444"

                                    const stroke = theme === "dark" ? "#334155" : "#94a3b8"
                                    const hoverFill = guessedColor || (theme === "dark" ? "#334155" : "#cbd5e1")

                                    return (
                                        <Geography
                                            key={(geo as GeoShape).rsmKey}
                                            geography={geo}
                                            onClick={() => handleCountryClick(geo as GeoShape)}
                                            style={{
                                                default: { fill, stroke, strokeWidth: 0.15, outline: "none", transition: "fill 300ms" },
                                                hover: { fill: status === "won" && isTarget ? fill : hoverFill, stroke, strokeWidth: 0.3, outline: "none", cursor: "pointer" },
                                                pressed: { fill, stroke, strokeWidth: 0.15, outline: "none" },
                                            }}
                                        />
                                    )
                                })
                            }}
                        </Geographies>
                    </ZoomableGroup>
                </ComposableMap>

                <div className="absolute bottom-8 right-8 flex flex-col gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl z-20">
                    <button onClick={handleZoomIn} className="p-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white rounded-xl transition-colors"><ZoomIn size={24} /></button>
                    <button onClick={handleResetZoom} className="p-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white rounded-xl transition-colors"><Maximize size={24} /></button>
                    <button onClick={handleZoomOut} className="p-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white rounded-xl transition-colors"><ZoomOut size={24} /></button>
                </div>
            </div>

            <AnimatePresence>
                {status === "won" && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pointer-events-none absolute inset-0 bg-red-500/10" />
                )}
            </AnimatePresence>
        </div>
    )
}
