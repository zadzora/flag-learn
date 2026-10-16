import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Swords, Loader2, Clock, Users, User, EyeOff } from "lucide-react"
import TopBar from "../components/TopBar"
import SiteFooter from "../components/SiteFooter"
import { db } from "../../lib/firebase"
import { ref, set } from "firebase/database"
import worldData from "../../data/flags.json"
import usData from "../../data/us_states.json"

export default function CreateGame() {
    const navigate = useNavigate()
    const [isCreating, setIsCreating] = useState(false)
    const [roundCount, setRoundCount] = useState(10)
    const [timeLimit, setTimeLeft] = useState(60)
    const [maxPlayers, setMaxPlayers] = useState(2)
    const [region, setRegion] = useState<'world' | 'us' | 'capitals'>('world')
    const [isBlurMode, setIsBlurMode] = useState(false)
    const [nickname, setNickname] = useState("")
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== "undefined") return (localStorage.getItem("flag-master-theme") as "light" | "dark") || "light"
        return "light"
    })

    // A fresh load of this page must still honour the saved theme.
    useEffect(() => {
        const root = window.document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem("flag-master-theme", theme)
    }, [theme])

    const toggleTheme = () => setTheme(prev => (prev === "light" ? "dark" : "light"))

    useEffect(() => {
        const savedName = localStorage.getItem("flag-master-nickname")
        if (savedName) setNickname(savedName)
    }, [])

    async function handleCreateGame() {
        if (!nickname.trim()) {
            alert("Please enter your name")
            return
        }

        localStorage.setItem("flag-master-nickname", nickname)
        setIsCreating(true)

        const gameId = Math.random().toString(36).substring(2, 8)
        const hostId = "host_" + Math.random().toString(36).substring(2, 9)
        localStorage.setItem("flag-master-my-id", hostId)

        let dataSet: any[] = []
        if (region === 'us') {
            dataSet = usData
        } else if (region === 'capitals') {
            dataSet = worldData.filter((f: any) => f.capital && f.capital[0] !== null)
        } else {
            dataSet = worldData
        }

        const shuffled = [...dataSet].sort(() => 0.5 - Math.random())
        const selectedFlags = shuffled.slice(0, roundCount).map(f => f.code)

        const gameData = {
            id: gameId,
            hostId: hostId,
            settings: {
                roundCount,
                region,
                timeLimit,
                maxPlayers,
                isBlurMode
            },
            flags: selectedFlags,
            status: 'waiting',
            startTime: 0,
            players: {
                [hostId]: {
                    name: nickname,
                    score: 0,
                    currentIndex: 0,
                    finished: false,
                    finishedAt: 0,
                    left: false
                }
            },
            createdAt: Date.now()
        }

        try {
            await set(ref(db, 'games/' + gameId), gameData)
            navigate(`/pvp/${gameId}`)
        } catch (error) {
            console.error("Error creating game:", error)
            alert("Failed to create game.")
        } finally {
            setIsCreating(false)
        }
    }

    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const label = "mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500"
    const segmented = "grid gap-1 rounded-[10px] border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
    const segment = (on: boolean) =>
        `min-h-10 rounded-md px-2 text-sm font-semibold ${on ? "bg-slate-900 text-white dark:bg-white dark:text-[#0A0E1A]" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            {/* Back and the battle icon share the bar, so the page keeps one header row. */}
            <TopBar
                title={<span className="flex items-center gap-2"><Swords size={17} aria-hidden className="shrink-0 text-orange-500" /> PvP Battle</span>}
                theme={theme}
                onToggleTheme={toggleTheme}
            />

            <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-14 pt-6 sm:px-6 sm:pt-8">
                <div className="mb-6">
                    <h1 className="!text-3xl font-bold">Create Battle</h1>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">Setup your multiplayer arena.</p>
                </div>

                <section className={`${panel} space-y-6 p-5 sm:p-6`}>

                    {/* Nickname */}
                    <div>
                        <label htmlFor="pvp-nickname" className={label}><User size={14} aria-hidden /> Your Name</label>
                        <input
                            id="pvp-nickname"
                            type="text"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            placeholder="Enter your nickname..."
                            className="w-full border border-slate-200 bg-slate-50 px-4 py-3 font-bold outline-none transition-colors focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-[#4A5680]"
                            maxLength={15}
                        />
                    </div>

                    {/* Max Players */}
                    <div>
                        <div className={label}><Users size={14} aria-hidden /> Max Players</div>
                        <div className={`${segmented} grid-cols-4`}>
                            {[2, 3, 4, 5].map(num => (
                                <button key={num} type="button" onClick={() => setMaxPlayers(num)} className={segment(maxPlayers === num)}>{num}</button>
                            ))}
                        </div>
                    </div>

                    {/* Region */}
                    <div>
                        <div className={label}>Game Mode</div>
                        <div className={`${segmented} grid-cols-3`}>
                            <button type="button" onClick={() => setRegion('world')} className={segment(region === 'world')}>World</button>
                            <button type="button" onClick={() => setRegion('us')} className={segment(region === 'us')}>USA</button>
                            <button type="button" onClick={() => setRegion('capitals')} className={segment(region === 'capitals')}>Capitals</button>
                        </div>
                    </div>

                    {/* Rounds */}
                    <div>
                        <div className={label}>Number of Flags</div>
                        <div className={`${segmented} grid-cols-3`}>
                            {[5, 10, 20].map(num => (
                                <button key={num} type="button" onClick={() => setRoundCount(num)} className={segment(roundCount === num)}>{num} Flags</button>
                            ))}
                        </div>
                    </div>

                    {/* Time Limit */}
                    <div>
                        <div className={label}><Clock size={14} aria-hidden /> Time Limit</div>
                        <div className={`${segmented} grid-cols-3`}>
                            {[30, 60, 120].map(sec => (
                                <button key={sec} type="button" onClick={() => setTimeLeft(sec)} className={segment(timeLimit === sec)}>{sec}s</button>
                            ))}
                        </div>
                    </div>

                    {/* Blur Mode Toggle */}
                    <div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={isBlurMode}
                            onClick={() => setIsBlurMode(!isBlurMode)}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left font-semibold ${isBlurMode ? 'border-slate-500 text-slate-900 dark:border-[#4A5680] dark:text-white' : 'border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-[#3A4670]'}`}
                        >
                            <span className="flex items-center gap-2"><EyeOff size={18} aria-hidden /> Blur Challenge Mode</span>
                            <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${isBlurMode ? 'bg-slate-900 dark:bg-white' : 'bg-slate-200 dark:bg-slate-700'}`}>
                                <span className={`absolute top-1 h-4 w-4 rounded-full transition-[left] duration-200 ${isBlurMode ? 'left-5 bg-[#fff] dark:bg-[#0A0E1A]' : 'left-1 bg-[#fff] dark:bg-slate-400'}`}></span>
                            </span>
                        </button>
                        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Flags start blurry and clear up over time.</p>
                    </div>

                    <button
                        type="button"
                        onClick={handleCreateGame}
                        disabled={isCreating}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-4 text-lg font-bold text-white hover:bg-slate-700 disabled:cursor-wait disabled:opacity-80 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
                    >
                        {isCreating ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <Swords size={20} aria-hidden />}
                        Create Game Lobby
                    </button>

                </section>
            </main>

            <SiteFooter />
        </div>
    )
}
