import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
    BookOpen, ChevronDown, Globe, Landmark, Swords, Map, Star, Calendar, Trophy,
    MapPin, EyeOff, CircleDot, ArrowUpDown, Flame, Paintbrush, Scan, Moon, Sun,
    Heart, Coffee, ExternalLink, MessagesSquare,
} from "lucide-react"
import CountryDataCredit from "../components/CountryDataCredit"

const LAST_MODE_KEY = "flag-master-last-mode"

const GAME_MODES = [
    { mode: "world", label: "Countries", detail: "Guess countries from flags", icon: Globe, accent: "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400" },
    { mode: "us", label: "US States", detail: "Guess states from flags", icon: Map, accent: "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400" },
    { mode: "capitals", label: "World Capitals", detail: "Guess capitals from flags", icon: Landmark, accent: "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400" },
] as const

type Challenge = {
    to: string
    label: string
    detail: string
    icon: typeof Calendar
    accent: string
    hover: string
    streak?: boolean
    badge?: string
}

const CHALLENGES: Challenge[] = [
    { to: "/daily", label: "Daily Flagle", detail: "Guess today's flag — new challenge every day", icon: Calendar, accent: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400", hover: "hover:border-emerald-400 dark:hover:border-emerald-500", streak: true },
    { to: "/highscore", label: "Highscore", detail: "Speedrun flags, capitals, or states — global leaderboard", icon: Trophy, accent: "bg-orange-100 dark:bg-orange-900/50 text-orange-500 dark:text-orange-400", hover: "hover:border-orange-400 dark:hover:border-orange-500" },
    { to: "/pvp/create", label: "PvP Battle", detail: "Create or join a lobby — challenge friends in real-time", icon: Swords, accent: "bg-rose-100 dark:bg-rose-900/50 text-rose-500 dark:text-rose-400", hover: "hover:border-rose-400 dark:hover:border-rose-500" },
    { to: "/paint", label: "Paint the Flag", detail: "Color grayscale flags with the right colors", icon: Paintbrush, accent: "bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400", hover: "hover:border-purple-400 dark:hover:border-purple-500", badge: "NEW" },
    { to: "/border-guess", label: "Border Guess", detail: "Identify countries by their highlighted border shape", icon: Scan, accent: "bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-400", hover: "hover:border-teal-400 dark:hover:border-teal-500", badge: "NEW" },
    { to: "/ultimate", label: "Ultimate Mode", detail: "Locate the flag, then name the country and its capital", icon: Trophy, accent: "bg-amber-100 dark:bg-amber-900/50 text-amber-500 dark:text-amber-400", hover: "hover:border-amber-400 dark:hover:border-amber-500" },
    { to: "/daily-map", label: "Daily Map Hunt", detail: "Find the country by its heat-map colors", icon: MapPin, accent: "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400", hover: "hover:border-blue-400 dark:hover:border-blue-500" },
    { to: "/map", label: "Map Locator", detail: "Find countries on the world map", icon: Map, accent: "bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400", hover: "hover:border-sky-400 dark:hover:border-sky-500" },
    { to: "/higher-lower", label: "Higher or Lower", detail: "Population or area — guess which country is higher", icon: ArrowUpDown, accent: "bg-rose-100 dark:bg-rose-900/50 text-rose-500 dark:text-rose-400", hover: "hover:border-rose-400 dark:hover:border-rose-500" },
    { to: "/blur", label: "Blur Mode", detail: "Guess the flag as it slowly comes into focus", icon: EyeOff, accent: "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400", hover: "hover:border-indigo-400 dark:hover:border-indigo-500" },
    { to: "/word-wheel", label: "Country Wheel", detail: "Connect letters on the wheel to spell countries", icon: CircleDot, accent: "bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-400", hover: "hover:border-teal-400 dark:hover:border-teal-500" },
    { to: "/constellations", label: "Constellations", detail: "Map the stars of the night sky", icon: Star, accent: "bg-amber-100 dark:bg-amber-900/50 text-amber-500 dark:text-amber-400", hover: "hover:border-amber-400 dark:hover:border-amber-500" },
]

function getDailyStreak(): number {
    try {
        const saved = localStorage.getItem("flag-master-daily-streak")
        return saved ? (JSON.parse(saved).streak || 0) : 0
    } catch { return 0 }
}

export default function Home() {
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window !== 'undefined') return (localStorage.getItem("flag-master-theme") as 'light' | 'dark') || 'light'
        return 'light'
    })

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === 'dark') root.classList.add('dark')
        else root.classList.remove('dark')
        localStorage.setItem("flag-master-theme", theme)
    }, [theme])

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light')

    const [showModes, setShowModes] = useState(false)
    const [showMods, setShowMods] = useState(false)
    const dailyStreak = getDailyStreak()

    const navigate = useNavigate()

    function startMode(mode: string) {
        localStorage.setItem(LAST_MODE_KEY, mode)
        navigate("/play")
    }

    return (
        <div className="min-h-screen flex flex-col text-slate-800 dark:text-slate-100 transition-colors duration-500">

            {/* Theme Toggle */}
            <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className="absolute top-4 right-4 p-3 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl shadow-[0_12px_28px_rgba(15,23,42,0.14)] border border-white/70 dark:border-slate-700/70 text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform z-10"
            >
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>

            {/* Main Content */}
            <div className="flex-1 flex flex-col items-center justify-center w-full px-4 py-8">

                {/* Logo Section */}
                <div className="text-center mb-8 sm:mb-10">
                    <img src="/logo2.png" alt="Flag Learn" className="w-auto mx-auto mb-3 sm:mb-4 h-44 sm:h-56" />
                    <p className="text-slate-500 dark:text-slate-400 mt-1 sm:mt-2 font-medium text-sm sm:text-base max-w-xs mx-auto">Master geography one flag at a time.</p>
                </div>

                <div className="w-full max-w-md sm:max-w-2xl space-y-8">

                    {/* Learning Section */}
                    <div>
                        <h2 className="text-xs font-bold uppercase text-slate-400 tracking-widest mb-3 ml-1">Learning Path</h2>
                        <button
                            type="button"
                            onClick={() => setShowModes(prev => !prev)}
                            className="group relative flex w-full items-center gap-4 p-5 min-h-[4.5rem] bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl shadow-[0_16px_40px_rgba(15,23,42,0.12)] border border-white/70 dark:border-slate-700/70 hover:border-indigo-500 dark:hover:border-indigo-500 transition-all active:scale-[0.98] touch-manipulation text-left"
                        >
                            <div className="bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-xl text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform shrink-0">
                                <BookOpen size={32} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="font-bold text-lg">Single Player</h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">Pick what you want to learn</p>
                            </div>
                            <ChevronDown size={22} className={`shrink-0 text-slate-400 transition-transform ${showModes ? 'rotate-180' : ''}`} />
                        </button>

                        {showModes && (
                            <div className="mt-3 flex flex-col gap-2">
                                {GAME_MODES.map(({ mode, label, detail, icon: Icon, accent }) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => startMode(mode)}
                                        className="flex w-full items-center gap-3 p-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-[0_10px_24px_rgba(15,23,42,0.08)] border border-white/70 dark:border-slate-700/70 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all active:scale-[0.98] touch-manipulation text-left"
                                    >
                                        <div className={`p-2.5 rounded-xl shrink-0 ${accent}`}>
                                            <Icon size={22} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold">{label}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">{detail}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Challenges Section */}
                    <div>
                        <h2 className="text-xs font-bold uppercase text-slate-400 tracking-widest mb-3 ml-1">Challenges</h2>
                        <button
                            type="button"
                            onClick={() => setShowMods(prev => !prev)}
                            className="group relative flex w-full items-center gap-4 p-5 min-h-[4.5rem] bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl shadow-[0_16px_40px_rgba(15,23,42,0.12)] border border-white/70 dark:border-slate-700/70 hover:border-amber-400 dark:hover:border-amber-500 transition-all active:scale-[0.98] touch-manipulation text-left"
                        >
                            <div className="bg-amber-100 dark:bg-amber-900/50 p-3 rounded-xl text-amber-500 dark:text-amber-400 group-hover:scale-110 transition-transform shrink-0">
                                <Trophy size={32} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="font-bold text-lg">Challenges</h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">More ways to play</p>
                            </div>
                            <ChevronDown size={22} className={`shrink-0 text-slate-400 transition-transform ${showMods ? 'rotate-180' : ''}`} />
                        </button>

                        {showMods && (
                            <div className="mt-3 flex flex-col gap-2">
                                {CHALLENGES.map(({ to, label, detail, icon: Icon, accent, hover, streak, badge }) => (
                                    <Link
                                        key={to}
                                        to={to}
                                        className={`group flex items-center gap-3 p-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-[0_10px_24px_rgba(15,23,42,0.08)] border border-white/70 dark:border-slate-700/70 ${hover} transition-all active:scale-[0.98] touch-manipulation`}
                                    >
                                        <div className={`p-2.5 rounded-xl shrink-0 ${accent}`}>
                                            <Icon size={22} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold flex items-center gap-2">
                                                {label}
                                                {badge && (
                                                    <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500 text-white shrink-0">
                                                        {badge}
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">{detail}</p>
                                        </div>
                                        {streak && dailyStreak > 0 && (
                                            <div className="flex flex-col items-center shrink-0">
                                                <Flame size={16} className="text-orange-400" />
                                                <span className="text-xs font-black text-orange-400 leading-none">{dailyStreak}</span>
                                            </div>
                                        )}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="w-full py-6 border-t border-slate-200/60 dark:border-slate-700/60 bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-500 text-sm transition-colors flex flex-col items-center gap-2">
                <div className="flex flex-wrap items-center justify-center gap-3">
                    <p className="flex items-center gap-1">
                        Made with <Heart size={14} className="text-red-400 fill-red-400" /> for learning
                    </p>
                    <a href="https://discord.gg/qcwW5evMU9" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#5865F2] hover:bg-[#4752c4] text-white font-bold text-[10px] shadow-sm hover:scale-105 transition-transform active:scale-95">
                        <MessagesSquare size={14} />
                        <span>Discord</span>
                        <ExternalLink size={10} className="opacity-70" />
                    </a>
                    <a href="https://buymeacoffee.com/davidzadzora" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFDD00] text-black font-bold text-[10px] shadow-sm hover:scale-105 transition-transform active:scale-95 hover:bg-[#ffea5c]">
                        <Coffee size={14} className="text-black/80" />
                        <span>Buy me a coffee</span>
                        <ExternalLink size={10} className="opacity-60" />
                    </a>
                </div>
                <a href="https://flagpedia.net" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
                    Flags provided by Flagpedia.net <ExternalLink size={12} />
                </a>
                <p className="px-4 text-center text-[11px]">
                    <CountryDataCredit prefix="Country data from" />
                </p>
                <section className="max-w-2xl mx-auto mt-6 text-center text-slate-500 text-xs px-8 pb-2 opacity-70">
                    <p>
                        Flag Learn is a free educational <strong>geography quiz</strong> designed to help you <strong>learn world flags</strong>, capitals, and US state flags effectively.
                        Includes <strong>Daily Flagle</strong>, <strong>Daily Map Hunt</strong>, <strong>Paint the Flag</strong>, <strong>Border Guess</strong>, <strong>Map Locator</strong>, <strong>Higher or Lower</strong>, <strong>Ultimate</strong>, <strong>Blur</strong>, <strong>Constellations</strong>, <strong>PvP</strong>, and <strong>Highscore</strong> speedruns.
                        Perfect for students, travelers, and geography enthusiasts.
                    </p>
                </section>
            </footer>
        </div>
    )
}
