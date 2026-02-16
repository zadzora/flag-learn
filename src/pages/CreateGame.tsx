import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { ArrowLeft, Swords, Loader2, Clock, Users, User, EyeOff } from "lucide-react" // Pridane EyeOff
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

    return (
        <div className="min-h-screen flex flex-col items-center pt-8 px-4 bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans transition-colors duration-500 overflow-y-auto pb-10">

            <Link to="/" className="absolute top-4 left-4 p-3 rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 hover:scale-110 transition-transform">
                <ArrowLeft size={20} />
            </Link>

            <div className="w-full max-w-md mt-12">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center p-4 bg-orange-100 dark:bg-orange-900/30 rounded-full text-orange-500 mb-4">
                        <Swords size={40} />
                    </div>
                    <h1 className="text-3xl font-bold">Create Battle</h1>
                    <p className="text-slate-500 dark:text-slate-400">Setup your multiplayer arena.</p>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 space-y-5">

                    {/* Nickname */}
                    <div>
                        <label className="block text-sm font-bold mb-2 ml-1 flex items-center gap-2"><User size={16}/> Your Name</label>
                        <input
                            type="text"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            placeholder="Enter your nickname..."
                            className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-900 border-2 border-transparent focus:border-indigo-500 outline-none font-bold"
                            maxLength={15}
                        />
                    </div>

                    <div className="h-px bg-slate-200 dark:bg-slate-700 my-2"></div>

                    {/* Max Players */}
                    <div>
                        <label className="block text-sm font-bold mb-2 ml-1 flex items-center gap-2"><Users size={16}/> Max Players</label>
                        <div className="grid grid-cols-4 gap-2">
                            {[2, 3, 4, 5].map(num => (
                                <button key={num} onClick={() => setMaxPlayers(num)} className={`py-2 rounded-xl font-bold text-sm transition-all border-2 ${maxPlayers === num ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300' : 'border-transparent bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>{num}</button>
                            ))}
                        </div>
                    </div>

                    {/* Region */}
                    <div>
                        <label className="block text-sm font-bold mb-2 ml-1">Game Mode</label>
                        <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => setRegion('world')} className={`py-2 rounded-xl font-bold text-xs sm:text-sm transition-all border-2 ${region === 'world' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300' : 'border-transparent bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>World</button>
                            <button onClick={() => setRegion('us')} className={`py-2 rounded-xl font-bold text-xs sm:text-sm transition-all border-2 ${region === 'us' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300' : 'border-transparent bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>USA</button>
                            <button onClick={() => setRegion('capitals')} className={`py-2 rounded-xl font-bold text-xs sm:text-sm transition-all border-2 ${region === 'capitals' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300' : 'border-transparent bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>Capitals</button>
                        </div>
                    </div>

                    {/* Rounds */}
                    <div>
                        <label className="block text-sm font-bold mb-2 ml-1">Number of Flags</label>
                        <div className="grid grid-cols-3 gap-2">
                            {[5, 10, 20].map(num => (
                                <button key={num} onClick={() => setRoundCount(num)} className={`py-2 rounded-xl font-bold text-sm transition-all border-2 ${roundCount === num ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300' : 'border-transparent bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>{num} Flags</button>
                            ))}
                        </div>
                    </div>

                    {/* Time Limit */}
                    <div>
                        <label className="block text-sm font-bold mb-2 ml-1 flex items-center gap-2"><Clock size={16}/> Time Limit</label>
                        <div className="grid grid-cols-3 gap-2">
                            {[30, 60, 120].map(sec => (
                                <button key={sec} onClick={() => setTimeLeft(sec)} className={`py-2 rounded-xl font-bold text-sm transition-all border-2 ${timeLimit === sec ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300' : 'border-transparent bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>{sec}s</button>
                            ))}
                        </div>
                    </div>

                    {/* Blur Mode Toggle */}
                    <div>
                        <button
                            onClick={() => setIsBlurMode(!isBlurMode)}
                            className={`w-full py-3 px-4 rounded-xl font-bold flex items-center justify-between border-2 transition-all ${isBlurMode ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500'}`}
                        >
                            <span className="flex items-center gap-2"><EyeOff size={18} /> Blur Challenge Mode</span>
                            <div className={`w-10 h-6 rounded-full relative transition-colors ${isBlurMode ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${isBlurMode ? 'left-5' : 'left-1'}`}></div>
                            </div>
                        </button>
                        <p className="text-xs text-slate-400 mt-1 ml-1">Flags start blurry and clear up over time.</p>
                    </div>

                    <button
                        onClick={handleCreateGame}
                        disabled={isCreating}
                        className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-orange-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        {isCreating ? <Loader2 className="animate-spin" /> : <Swords />}
                        Create Game Lobby
                    </button>

                </div>
            </div>
        </div>
    )
}