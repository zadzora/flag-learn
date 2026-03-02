import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { Swords, Moon, Sun, Heart, Map, Star, Coffee, ExternalLink, EyeOff, BookOpen, Calendar, Trophy} from "lucide-react"

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

    return (
        <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-500">

            {/* Theme Toggle */}
            <button
                onClick={toggleTheme}
                className="absolute top-4 right-4 p-3 rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform z-10"
            >
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>

            {/* Main Content */}
            <div className="flex-1 flex flex-col items-center justify-center w-full px-4 py-8">

                {/* Logo Section */}
                <div className="text-center mb-10">
                    <img src="/logo_white.png" alt="Logo" className="h-24 w-auto mx-auto mb-4 dark:hidden" />
                    <img src="/logo_dark.png" alt="Logo" className="h-24 w-auto mx-auto mb-4 hidden dark:block" />
                    <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium">Master geography one flag at a time.</p>
                </div>

                <div className="w-full max-w-md sm:max-w-2xl space-y-8">

                    {/* Learning Section */}
                    <div>
                        <h2 className="text-xs font-bold uppercase text-slate-400 tracking-widest mb-3 ml-1">Learning Path</h2>
                        <Link to="/play" className="group relative flex items-center gap-4 p-5 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 transition-all hover:-translate-y-1">
                            <div className="bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-xl text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                                <BookOpen size={32} />
                            </div>
                            <div>
                                <h2 className="font-bold text-lg">Single Player</h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Practice World & US flags with timer</p>
                            </div>
                        </Link>
                    </div>

                    {/* Challenges Section */}
                    <div>
                        <h2 className="text-xs font-bold uppercase text-slate-400 tracking-widest mb-3 ml-1">Challenge Mods</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                            {/* Daily Flagle Card */}
                            <Link to="/daily" className="group flex flex-col p-4 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-2xl shadow-lg text-white hover:scale-105 transition-all">
                                <div className="bg-white/20 p-3 rounded-xl text-white w-fit mb-3 backdrop-blur-sm group-hover:scale-110 transition-transform">
                                    <Calendar size={24} />
                                </div>
                                <h3 className="font-bold text-base">Daily Flagle</h3>
                                <p className="text-[10px] text-emerald-100/90">New flag every day</p>
                            </Link>

                            {/* Map Mode Card */}
                            <Link to="/map" className="group flex flex-col p-4 bg-gradient-to-br from-blue-600 to-indigo-800 rounded-2xl shadow-lg text-white hover:scale-105 transition-all">
                                <div className="bg-white/20 p-3 rounded-xl text-white w-fit mb-3 backdrop-blur-sm group-hover:scale-110 transition-transform">
                                    <Map size={24} />
                                </div>
                                <h3 className="font-bold text-base">Map Locator</h3>
                                <p className="text-[10px] text-blue-100/90">Find countries on map</p>
                            </Link>

                            {/* PvP Card */}
                            <Link to="/pvp/create" className="group flex flex-col p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 hover:border-orange-500 dark:hover:border-orange-500 transition-all hover:-translate-y-1">
                                <div className="bg-orange-100 dark:bg-orange-900/50 p-3 rounded-xl text-orange-500 w-fit mb-3 group-hover:scale-110 transition-transform">
                                    <Swords size={24} />
                                </div>
                                <h3 className="font-bold text-base">PvP Battle</h3>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">Challenge friends</p>
                            </Link>

                            {/* Blur Mode Card */}
                            <Link to="/blur" className="group flex flex-col p-4 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl shadow-lg text-white hover:shadow-indigo-500/25 transition-all hover:-translate-y-1">
                                <div className="bg-white/20 p-3 rounded-xl text-white w-fit mb-3 backdrop-blur-sm group-hover:scale-110 transition-transform">
                                    <EyeOff size={24} />
                                </div>
                                <h3 className="font-bold text-base">Blur Mode</h3>
                                <p className="text-[10px] text-indigo-100/80">Guess blurry flags</p>
                            </Link>

                            {/* --- ULTIMATE MODE CARD (Horizontálna širšia karta) --- */}
                            <Link to="/ultimate" className="sm:col-span-2 group flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all hover:-translate-y-1 hover:shadow-2xl">
                                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 sm:p-5 rounded-2xl text-white group-hover:scale-110 transition-transform shadow-md shrink-0 mt-1">
                                    <Trophy size={36} />
                                </div>
                                <div className="flex flex-col text-center sm:text-left">
                                    <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white mb-2">Ultimate Mode</h2>
                                    <p className="text-[12px] text-indigo-100/80">
                                        The ultimate test! Locate the flag on the map, then name the country and its capital to conquer the world.
                                    </p>
                                </div>
                            </Link>

                        </div>

                    </div>
                    {/* EXTRAS SECTION */}
                    <section className="w-full mt-4">
                        <div className="flex items-center gap-2 mb-4 px-2">
                            <Star size={20} className="text-indigo-400" />
                            <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Extras</h2>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <Link to="/constellations" className="group flex items-center p-4 bg-slate-900 rounded-2xl shadow-md hover:scale-[1.02] transition-all border border-slate-800">
                                <div className="bg-indigo-900/50 p-3 rounded-xl text-indigo-400 mr-4 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                    <Star size={24} className="fill-current" />
                                </div>
                                <div className="flex flex-col text-left">
                                    <h3 className="font-bold text-lg text-white">Constellations</h3>
                                    <p className="text-xs text-slate-400">Map the night sky stars</p>
                                </div>
                            </Link>
                        </div>
                    </section>
                </div>
            </div>

            {/* Footer */}
            <footer className="w-full py-6 border-t border-slate-200/60 dark:border-slate-700/60 bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-500 text-sm transition-colors flex flex-col items-center gap-2">
                <div className="flex items-center gap-3">
                    <p className="flex items-center gap-1">
                        Made with <Heart size={14} className="text-red-400 fill-red-400" /> for learning
                    </p>
                    <a href="https://buymeacoffee.com/davidzadzora" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFDD00] text-black font-bold text-[10px] shadow-sm hover:scale-105 transition-transform active:scale-95 hover:bg-[#ffea5c]">
                        <Coffee size={14} className="text-black/80" />
                        <span>Buy me a coffee</span>
                        <ExternalLink size={10} className="opacity-60" />
                    </a>
                </div>
                <a href="https://flagpedia.net" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
                    Flags provided by Flagpedia.net <ExternalLink size={12} />
                </a>
                <section className="max-w-2xl mx-auto mt-6 text-center text-slate-500 text-xs px-8 pb-2 opacity-70">
                    <p>
                        Flag Learn is a free educational <strong>geography quiz</strong> designed to help you <strong>learn world flags</strong> and US state flags effectively.
                        Test your knowledge in Single Player or challenge friends in real-time <strong>PvP battles</strong> to see who knows more!
                        Perfect for students, travelers, and geography enthusiasts.
                    </p>
                </section>
            </footer>
        </div>
    )
}