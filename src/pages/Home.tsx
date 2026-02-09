import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { Globe, Swords, Moon, Sun, Heart, Coffee, ExternalLink } from "lucide-react"

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

            <button
                onClick={toggleTheme}
                className="absolute top-4 right-4 p-3 rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform z-10"
            >
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>

            <div className="flex-1 flex flex-col items-center justify-center w-full px-4 py-12">
                <div className="text-center mb-12">
                    <img src="/logo_white.png" alt="Logo" className="h-24 w-auto mx-auto mb-4 dark:hidden" />
                    <img src="/logo_dark.png" alt="Logo" className="h-24 w-auto mx-auto mb-4 hidden dark:block" />
                    <p className="text-slate-500 dark:text-slate-400 mt-2">Master geography one flag at a time.</p>
                </div>

                <div className="grid gap-4 w-full max-w-sm">
                    <Link to="/play" className="group relative flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 transition-all hover:-translate-y-1">
                        <div className="bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-xl text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                            <Globe size={32} />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg">Single Player</h2>
                            <p className="text-xs text-slate-500">Learn World & US flags</p>
                        </div>
                    </Link>

                    <Link to="/pvp/create" className="group relative flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 hover:border-orange-500 dark:hover:border-orange-500 transition-all hover:-translate-y-1">
                        <div className="bg-orange-100 dark:bg-orange-900/50 p-3 rounded-xl text-orange-500 group-hover:scale-110 transition-transform">
                            <Swords size={32} />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg">PvP Battle</h2>
                            <p className="text-xs text-slate-500">Challenge friends</p>
                        </div>
                    </Link>
                </div>
            </div>

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