import { useState, useRef, useEffect } from "react"
import { Copy, Trash2, Undo, Move } from "lucide-react"
import TopBar from "../components/TopBar"
import constData from "../../data/constellations.json"

// (0/undefined=bright, 1=medium, 2=dim)
type StarPoint = [number, number, number?]

export default function ConstellationBuilder() {
    const allConstellations = [...constData].sort((a, b) => a.code.localeCompare(b.code))
    const [selectedCode, setSelectedCode] = useState<string>(allConstellations[0].code)
    const current = allConstellations.find(c => c.code === selectedCode) || allConstellations[0]

    const [bgImage, setBgImage] = useState<string>("")
    const [bgScale, setBgScale] = useState<number>(100)
    const [bgOffsetX, setBgOffsetX] = useState<number>(0)
    const [bgOffsetY, setBgOffsetY] = useState<number>(0)

    const [localStars, setLocalStars] = useState<StarPoint[]>([])
    const [localLines, setLocalLines] = useState<[number, number][]>([])
    const [connectingFrom, setConnectingFrom] = useState<number | null>(null)
    const [starBrush, setStarBrush] = useState<number>(0) // 0=Big, 1=Medium, 2=Small
    const svgRef = useRef<SVGSVGElement>(null)

    useEffect(() => {
        setLocalStars((current.stars as StarPoint[]) || [])
        setLocalLines((current.lines as [number, number][]) || [])
        setConnectingFrom(null)
    }, [current.code])

    const handleSvgClick = (e: React.MouseEvent) => {
        if (e.button !== 0 || !svgRef.current) return

        const rect = svgRef.current.getBoundingClientRect()
        const x = Math.round((e.clientX - rect.left) * (100 / rect.width))
        const y = Math.round((e.clientY - rect.top) * (100 / rect.height))

        const newStar: StarPoint = starBrush === 0 ? [x, y] : [x, y, starBrush]
        setLocalStars(prev => [...prev, newStar])
    }

    const handleStarRightClick = (e: React.MouseEvent, index: number) => {
        e.preventDefault()
        e.stopPropagation()

        if (connectingFrom === null) {
            setConnectingFrom(index)
        } else {
            if (connectingFrom !== index) {
                const exists = localLines.some(l => (l[0] === connectingFrom && l[1] === index) || (l[0] === index && l[1] === connectingFrom))
                if (!exists) setLocalLines(prev => [...prev, [connectingFrom, index]])
            }
            setConnectingFrom(null)
        }
    }

    const undoLastStar = () => {
        if (localStars.length === 0) return
        setLocalStars(prev => prev.slice(0, -1))
        setLocalLines(prev => prev.filter(l => l[0] !== localStars.length - 1 && l[1] !== localStars.length - 1))
        setConnectingFrom(null)
    }
    const undoLastLine = () => { if (localLines.length > 0) setLocalLines(prev => prev.slice(0, -1)) }
    const clearAll = () => { if(confirm("Clear all stars?")) { setLocalStars([]); setLocalLines([]); setConnectingFrom(null) } }

    const copyToClipboard = () => {
        const jsonToCopy = `"stars": ${JSON.stringify(localStars)},\n"lines": ${JSON.stringify(localLines)}`
        navigator.clipboard.writeText(jsonToCopy)
        alert("Copied to clipboard!")
    }

    const imgX = 50 - (bgScale / 2) + bgOffsetX;
    const imgY = 50 - (bgScale / 2) + bgOffsetY;

    const getStarRadius = (sizeParam?: number) => {
        if (sizeParam === 2) return 1.2;
        if (sizeParam === 1) return 1.8;
        return 2.8;
    }

    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const label = "mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500"
    const field = "w-full border border-slate-200 bg-slate-50 text-slate-900 outline-none transition-colors focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#4A5680]"
    const iconButton = "flex h-10 min-h-0 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 p-0 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-[#3A4670]"
    const brushes: { value: number; label: string; dot: string }[] = [
        { value: 0, label: "Big", dot: "h-3 w-3" },
        { value: 1, label: "Med", dot: "h-2 w-2" },
        { value: 2, label: "Dim", dot: "h-1 w-1" },
    ]

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Constellation Builder" />

            <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-6 px-4 pb-14 pt-6 sm:px-6 sm:pt-8 md:flex-row">

                <div className="flex min-w-0 flex-1 flex-col gap-4">
                    <section className={`${panel} p-5 sm:p-6`}>
                        <label htmlFor="builder-constellation" className={label}>1. Select Constellation</label>
                        <select id="builder-constellation" value={selectedCode} onChange={(e) => setSelectedCode(e.target.value)} className={`${field} mb-4 p-3 font-mono`}>
                            {allConstellations.map(c => <option key={c.code} value={c.code}>[{c.code.toUpperCase()}] {c.name.la[0]} {c.stars.length === 0 ? " (EMPTY)" : ` (${c.stars.length} stars)`}</option>)}
                        </select>

                        <label htmlFor="builder-bg" className={label}>2. Background Image</label>
                        <input
                            id="builder-bg"
                            type="text"
                            placeholder="Paste image URL here..."
                            value={bgImage}
                            onChange={(e) => {
                                setBgImage(e.target.value);
                                setBgScale(100);
                                setBgOffsetX(0);
                                setBgOffsetY(0);
                            }}
                            className={`${field} mb-4 p-3 text-sm`}
                        />

                        {bgImage && (
                            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                {/* SCALE */}
                                <div className="flex items-center gap-4">
                                    <label className="block w-12 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Scale</label>
                                    <input type="range" min="10" max="400" value={bgScale} onChange={(e) => setBgScale(parseInt(e.target.value))} className="h-5 min-h-0 flex-1 p-0 accent-blue-500" />
                                    <span className="w-10 text-right font-mono text-xs font-bold tabular-nums">{bgScale}%</span>
                                </div>
                                {/* OFFSET X */}
                                <div className="flex items-center gap-4">
                                    <label className="block w-12 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pan X</label>
                                    <input type="range" min="-150" max="150" value={bgOffsetX} onChange={(e) => setBgOffsetX(parseInt(e.target.value))} className="h-5 min-h-0 flex-1 p-0 accent-blue-500" />
                                    <span className="w-10 text-right font-mono text-xs font-bold tabular-nums">{bgOffsetX}</span>
                                </div>
                                {/* OFFSET Y */}
                                <div className="flex items-center gap-4">
                                    <label className="block w-12 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pan Y</label>
                                    <input type="range" min="-150" max="150" value={bgOffsetY} onChange={(e) => setBgOffsetY(parseInt(e.target.value))} className="h-5 min-h-0 flex-1 p-0 accent-blue-500" />
                                    <span className="w-10 text-right font-mono text-xs font-bold tabular-nums">{bgOffsetY}</span>
                                </div>
                                <button type="button" onClick={() => { setBgOffsetX(0); setBgOffsetY(0); setBgScale(100) }} className="mt-1 min-h-0 self-center px-2 py-1 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Reset Position & Scale</button>
                            </div>
                        )}
                    </section>

                    <section className={`${panel} flex max-h-[350px] flex-1 flex-col p-5 sm:p-6`}>
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="!text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Generated JSON</h2>
                            <button type="button" onClick={copyToClipboard} className="flex min-h-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"><Copy size={14} aria-hidden /> Copy Code</button>
                        </div>
                        <pre className="flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            "stars": {JSON.stringify(localStars)},<br/>
                            "lines": {JSON.stringify(localLines)}
                        </pre>
                    </section>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-4">

                    <section className={`${panel} flex flex-wrap items-center justify-between gap-4 p-3`}>
                        <div className="grid grid-cols-3 gap-1 rounded-[10px] border border-slate-200 p-1 dark:border-slate-700" role="group" aria-label="Star brush">
                            {brushes.map(b => (
                                <button
                                    key={b.value}
                                    type="button"
                                    onClick={() => setStarBrush(b.value)}
                                    aria-pressed={starBrush === b.value}
                                    className={`flex min-h-9 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${starBrush === b.value ? 'bg-slate-900 text-white dark:bg-white dark:text-[#0A0E1A]' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
                                >
                                    <span className={`${b.dot} shrink-0 rounded-full bg-current`} aria-hidden /> {b.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-2">
                            <button type="button" onClick={undoLastStar} className={iconButton} title="Undo Star" aria-label="Undo Star"><Undo size={18} aria-hidden /></button>
                            <button type="button" onClick={undoLastLine} className={iconButton} title="Undo Line" aria-label="Undo Line"><Move size={18} aria-hidden /></button>
                            <button type="button" onClick={clearAll} className={`${iconButton} text-red-500 hover:border-red-400 dark:text-red-400`} title="Clear All" aria-label="Clear All"><Trash2 size={18} aria-hidden /></button>
                        </div>
                    </section>

                    {/* SVG CANVAS - the night sky is content and stays dark. */}
                    <div className="relative aspect-square w-full overflow-hidden rounded-[10px] border border-slate-700 bg-[#05070F] p-2">
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-950 to-slate-950"></div>

                        <svg ref={svgRef} viewBox="0 0 100 100" className="relative z-10 h-full w-full cursor-crosshair overflow-visible drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" onClick={handleSvgClick} onContextMenu={(e) => e.preventDefault()}>

                            {bgImage && <image href={bgImage} x={imgX} y={imgY} height={bgScale} width={bgScale} preserveAspectRatio="xMidYMid meet" opacity="0.4" pointerEvents="none" />}

                            {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(n => (
                                <g key={`grid-${n}`} className="opacity-50" pointerEvents="none">
                                    <line x1={n} y1="0" x2={n} y2="100" stroke="#06b6d4" strokeWidth="0.2" strokeDasharray={n % 50 === 0 ? "" : "1,1"} />
                                    <line x1="0" y1={n} x2="100" y2={n} stroke="#06b6d4" strokeWidth="0.2" strokeDasharray={n % 50 === 0 ? "" : "1,1"} />
                                </g>
                            ))}

                            {localLines.map((line, i) => {
                                const start = localStars[line[0]]; const end = localStars[line[1]]
                                if (!start || !end) return null
                                return <line key={`line-${i}`} x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} stroke="rgba(255, 255, 255, 0.6)" strokeWidth="1" strokeLinecap="round" pointerEvents="none"/>
                            })}

                            {localStars.map((star, i) => {
                                const isConnecting = connectingFrom === i;
                                const radius = getStarRadius(star[2]); // Vypočítame veľkosť na základe 3. parametra
                                return (
                                    <g key={`star-${i}`} onContextMenu={(e) => handleStarRightClick(e, i)} className="cursor-pointer">
                                        <circle cx={star[0]} cy={star[1]} r="4" fill="transparent" /> {/* Hitbox */}
                                        {isConnecting && <circle cx={star[0]} cy={star[1]} r={radius + 1.4} fill="none" stroke="#4ade80" strokeWidth="0.5" pointerEvents="none" />}
                                        <circle cx={star[0]} cy={star[1]} r={radius} fill={isConnecting ? "#4ade80" : "white"} className={isConnecting ? "" : "hover:fill-blue-400"} />
                                        <text x={star[0] + 3} y={star[1] + 3} fontSize="3" fill={isConnecting ? "#4ade80" : "#fbbf24"} fontWeight="bold" pointerEvents="none">{i}</text>
                                    </g>
                                )
                            })}
                        </svg>
                    </div>
                </div>
            </main>
        </div>
    )
}
