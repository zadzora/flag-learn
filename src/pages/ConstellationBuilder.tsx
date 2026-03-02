import { useState, useRef, useEffect } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Copy, Trash2, Undo, Move } from "lucide-react"
import constData from "../../data/constellations.json"

// Typ pre hviezdu: [x, y, velkost?] (0/undefined=bright, 1=medium, 2=dim)
type StarPoint = [number, number, number?]

export default function ConstellationBuilder() {
    const allConstellations = [...constData].sort((a, b) => a.code.localeCompare(b.code))
    const [selectedCode, setSelectedCode] = useState<string>(allConstellations[0].code)
    const current = allConstellations.find(c => c.code === selectedCode) || allConstellations[0]

    // --- OVLÁDANIE OBRÁZKA (Teraz aj s X a Y) ---
    const [bgImage, setBgImage] = useState<string>("")
    const [bgScale, setBgScale] = useState<number>(100)
    const [bgOffsetX, setBgOffsetX] = useState<number>(0)
    const [bgOffsetY, setBgOffsetY] = useState<number>(0)

    // --- INTERAKTÍVNE STAVY ---
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

    // --- FUNKCIA: Ľavý klik = Nová hviezda s vybranou veľkosťou ---
    const handleSvgClick = (e: React.MouseEvent) => {
        if (e.button !== 0 || !svgRef.current) return

        const rect = svgRef.current.getBoundingClientRect()
        const x = Math.round((e.clientX - rect.left) * (100 / rect.width))
        const y = Math.round((e.clientY - rect.top) * (100 / rect.height))

        // Uložíme hviezdu (ak je brush 0, tretie číslo tam ani nedáme pre čistejší JSON)
        const newStar: StarPoint = starBrush === 0 ? [x, y] : [x, y, starBrush]
        setLocalStars(prev => [...prev, newStar])
    }

    // --- FUNKCIA: Pravý klik = Spájanie ---
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

    // --- NÁSTROJE ---
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

    // VÝPOČET POLOHY OBRÁZKA
    const imgX = 50 - (bgScale / 2) + bgOffsetX;
    const imgY = 50 - (bgScale / 2) + bgOffsetY;

    // Vizuálna veľkosť hviezdy na základe jej parametra
    const getStarRadius = (sizeParam?: number) => {
        if (sizeParam === 2) return 1.2; // Malá
        if (sizeParam === 1) return 1.8; // Stredná
        return 2.8; // Veľká (default)
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-4 sm:p-8 font-sans">
            <div className="flex items-center gap-4 mb-8">
                <Link to="/" className="p-3 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors"><ArrowLeft size={20} /></Link>
                <h1 className="text-2xl font-bold text-indigo-400">Constellation Builder</h1>
            </div>

            <div className="flex flex-col md:flex-row gap-8 max-w-6xl mx-auto w-full">

                {/* ĽAVÝ PANEL */}
                <div className="flex-1 flex flex-col gap-4 min-w-0">
                    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
                        <label className="block text-sm font-bold text-slate-400 mb-2 uppercase tracking-wide">1. Select Constellation</label>
                        <select value={selectedCode} onChange={(e) => setSelectedCode(e.target.value)} className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-xl outline-none focus:border-indigo-500 font-mono mb-4">
                            {allConstellations.map(c => <option key={c.code} value={c.code}>[{c.code.toUpperCase()}] {c.name.la[0]} {c.stars.length === 0 ? " (EMPTY)" : ` (${c.stars.length} stars)`}</option>)}
                        </select>

                        <label className="block text-sm font-bold text-slate-400 mb-2 uppercase tracking-wide">2. Background Image</label>
                        <input
                            type="text"
                            placeholder="Paste image URL here..."
                            value={bgImage}
                            onChange={(e) => {
                                setBgImage(e.target.value);
                                // Automatický reset pri vložení nového obrázka
                                setBgScale(100);
                                setBgOffsetX(0);
                                setBgOffsetY(0);
                            }}
                            className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-xl outline-none focus:border-indigo-500 text-sm mb-4"
                        />

                        {bgImage && (
                            <div className="flex flex-col gap-3 bg-slate-950 p-4 rounded-xl border border-slate-700">
                                {/* SCALE */}
                                <div className="flex items-center gap-4">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide w-12">Scale</label>
                                    <input type="range" min="10" max="400" value={bgScale} onChange={(e) => setBgScale(parseInt(e.target.value))} className="flex-1 h-1 bg-slate-700 rounded-full appearance-none accent-indigo-500" />
                                    <span className="text-xs font-bold text-indigo-400 font-mono w-10 text-right">{bgScale}%</span>
                                </div>
                                {/* OFFSET X */}
                                <div className="flex items-center gap-4">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide w-12">Pan X</label>
                                    <input type="range" min="-150" max="150" value={bgOffsetX} onChange={(e) => setBgOffsetX(parseInt(e.target.value))} className="flex-1 h-1 bg-slate-700 rounded-full appearance-none accent-emerald-500" />
                                    <span className="text-xs font-bold text-emerald-400 font-mono w-10 text-right">{bgOffsetX}</span>
                                </div>
                                {/* OFFSET Y */}
                                <div className="flex items-center gap-4">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide w-12">Pan Y</label>
                                    <input type="range" min="-150" max="150" value={bgOffsetY} onChange={(e) => setBgOffsetY(parseInt(e.target.value))} className="flex-1 h-1 bg-slate-700 rounded-full appearance-none accent-emerald-500" />
                                    <span className="text-xs font-bold text-emerald-400 font-mono w-10 text-right">{bgOffsetY}</span>
                                </div>
                                <button onClick={() => { setBgOffsetX(0); setBgOffsetY(0); setBgScale(100) }} className="text-xs text-slate-500 hover:text-white mt-1">Reset Position & Scale</button>
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl flex-1 flex flex-col max-h-[350px]">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide">Generated JSON</h2>
                            <button onClick={copyToClipboard} className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors font-bold"><Copy size={14} /> Copy Code</button>
                        </div>
                        <pre className="text-xs text-indigo-300 font-mono bg-slate-950 p-4 rounded-xl overflow-y-auto whitespace-pre-wrap break-words border border-slate-800 flex-1">
                            "stars": {JSON.stringify(localStars)},<br/>
                            "lines": {JSON.stringify(localLines)}
                        </pre>
                    </div>
                </div>

                {/* PRAVÝ PANEL */}
                <div className="flex-1 flex flex-col gap-4 min-w-0">

                    {/* HORNÝ PANEL NÁSTROJOV (Štetec a Undo) */}
                    <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl flex flex-wrap gap-4 items-center justify-between">
                        {/* Výber veľkosti hviezdy */}
                        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                            <button onClick={() => setStarBrush(0)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${starBrush === 0 ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-800'}`}>
                                <circle cx="5" cy="5" r="5" className="w-3 h-3 fill-current rounded-full" /> Big
                            </button>
                            <button onClick={() => setStarBrush(1)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${starBrush === 1 ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-800'}`}>
                                <circle cx="5" cy="5" r="3" className="w-2 h-2 fill-current rounded-full" /> Med
                            </button>
                            <button onClick={() => setStarBrush(2)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${starBrush === 2 ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-800'}`}>
                                <circle cx="5" cy="5" r="1.5" className="w-1 h-1 fill-current rounded-full" /> Dim
                            </button>
                        </div>

                        <div className="flex gap-2">
                            <button onClick={undoLastStar} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors text-slate-300" title="Undo Star"><Undo size={18}/></button>
                            <button onClick={undoLastLine} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors text-slate-300" title="Undo Line"><Move size={18}/></button>
                            <button onClick={clearAll} className="p-2 bg-red-900/30 hover:bg-red-900/60 text-red-400 rounded-xl transition-colors" title="Clear All"><Trash2 size={18}/></button>
                        </div>
                    </div>

                    {/* SVG CANVAS */}
                    <div className="w-full aspect-square bg-slate-950 rounded-2xl border border-slate-700 shadow-2xl relative overflow-hidden p-2">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-950 to-slate-950 pointer-events-none"></div>

                        <svg ref={svgRef} viewBox="0 0 100 100" className="w-full h-full overflow-visible drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] z-10 relative cursor-crosshair" onClick={handleSvgClick} onContextMenu={(e) => e.preventDefault()}>

                            {bgImage && <image href={bgImage} x={imgX} y={imgY} height={bgScale} width={bgScale} preserveAspectRatio="xMidYMid meet" opacity="0.4" pointerEvents="none" />}

                            {/* Mriežka */}
                            {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(n => (
                                <g key={`grid-${n}`} className="opacity-50" pointerEvents="none">
                                    <line x1={n} y1="0" x2={n} y2="100" stroke="#06b6d4" strokeWidth="0.2" strokeDasharray={n % 50 === 0 ? "" : "1,1"} />
                                    <line x1="0" y1={n} x2="100" y2={n} stroke="#06b6d4" strokeWidth="0.2" strokeDasharray={n % 50 === 0 ? "" : "1,1"} />
                                </g>
                            ))}

                            {/* Čiary */}
                            {localLines.map((line, i) => {
                                const start = localStars[line[0]]; const end = localStars[line[1]]
                                if (!start || !end) return null
                                return <line key={`line-${i}`} x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} stroke="rgba(255, 255, 255, 0.6)" strokeWidth="1" strokeLinecap="round" pointerEvents="none"/>
                            })}

                            {/* Hviezdy (s rôznymi veľkosťami) */}
                            {localStars.map((star, i) => {
                                const isConnecting = connectingFrom === i;
                                const radius = getStarRadius(star[2]); // Vypočítame veľkosť na základe 3. parametra
                                return (
                                    <g key={`star-${i}`} onContextMenu={(e) => handleStarRightClick(e, i)} className="cursor-pointer">
                                        <circle cx={star[0]} cy={star[1]} r="4" fill="transparent" /> {/* Hitbox */}
                                        <circle cx={star[0]} cy={star[1]} r={radius} fill={isConnecting ? "#4ade80" : "white"} className={isConnecting ? "animate-pulse" : "hover:fill-indigo-400"} />
                                        <text x={star[0] + 3} y={star[1] + 3} fontSize="3" fill={isConnecting ? "#4ade80" : "#fbbf24"} fontWeight="bold" pointerEvents="none">{i}</text>
                                    </g>
                                )
                            })}
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    )
}