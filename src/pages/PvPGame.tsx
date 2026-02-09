import { useEffect, useState, useRef } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { db } from "../../lib/firebase"
import { ref, onValue, update, onDisconnect, get, set } from "firebase/database"
import { ArrowLeft, Copy, Check, Users, Trophy, Play, Home, Clock, X, Timer, Loader2, UserX, AlertTriangle, WifiOff, Moon, Sun } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import worldData from "../../data/flags.json"
import usData from "../../data/us_states.json"

type PlayerState = {
    name: string
    score: number
    currentIndex: number
    finished: boolean
    finishedAt: number
    left: boolean
}

type GameData = {
    id: string
    hostId: string
    status: 'waiting' | 'playing' | 'finished' | 'aborted'
    startTime: number
    flags: string[]
    settings: {
        roundCount: number
        region: 'world' | 'us'
        timeLimit: number
        maxPlayers: number
    }
    players: Record<string, PlayerState>
}

export default function PvPGame() {
    const { gameId } = useParams()
    const navigate = useNavigate()

    const [gameData, setGameData] = useState<GameData | null>(null)

    const [myId, setMyId] = useState<string | null>(() => localStorage.getItem("flag-master-my-id"))
    const [myName, setMyName] = useState<string>(() => localStorage.getItem("flag-master-nickname") || "")
    const [needsName, setNeedsName] = useState(!localStorage.getItem("flag-master-nickname"))

    // THEME STATE
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window !== 'undefined') return (localStorage.getItem("flag-master-theme") as 'light' | 'dark') || 'light'
        return 'light'
    })

    const [input, setInput] = useState("")
    const [feedback, setFeedback] = useState<string | null>(null)
    const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'correct' | 'error'>('idle')
    const [copied, setCopied] = useState(false)
    const [timeLeft, setTimeLeft] = useState(0)

    const [gameFull, setGameFull] = useState(false)
    const [gameAborted, setGameAborted] = useState(false)

    const inputRef = useRef<HTMLInputElement>(null)
    const hasJoinedRef = useRef(false)

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === 'dark') root.classList.add('dark')
        else root.classList.remove('dark')
        localStorage.setItem("flag-master-theme", theme)
    }, [theme])

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light')

    // --- 1. PRIPOJENIE ---
    useEffect(() => {
        if (!gameId) return

        if (!myId) {
            const newId = "player_" + Math.random().toString(36).substring(2, 9)
            localStorage.setItem("flag-master-my-id", newId)
            setMyId(newId)
        }

        const gameRef = ref(db, `games/${gameId}`)

        get(gameRef).then((snapshot) => {
            if (!snapshot.exists()) {
                alert("Game not found!")
                navigate("/")
                return
            }
            const data = snapshot.val() as GameData

            if (needsName) return

            tryJoinGame(data, myId!)
        })

        const unsubscribe = onValue(gameRef, (snapshot) => {
            const data = snapshot.val() as GameData
            if (data) {
                setGameData(data)

                const players = Object.values(data.players || {})
                const anyoneLeft = players.some(p => p.left)

                if (data.status === 'aborted' || anyoneLeft) {
                    setGameAborted(true)
                    if (data.hostId === myId && data.status !== 'aborted' && anyoneLeft) {
                        update(ref(db, `games/${gameId}`), { status: 'aborted' })
                    }
                }
            }
        })

        return () => unsubscribe()
    }, [gameId, needsName])


    const tryJoinGame = (data: GameData, playerId: string) => {
        if (hasJoinedRef.current) return

        const anyoneLeft = Object.values(data.players || {}).some(p => p.left)
        if (data.status === 'aborted' || anyoneLeft) {
            setGameAborted(true)
            return
        }

        if (data.players[playerId]) {
            hasJoinedRef.current = true
            setupPresence(playerId)
            return
        }

        const activePlayers = Object.keys(data.players || {}).length
        if (activePlayers >= data.settings.maxPlayers) {
            setGameFull(true)
            return
        }

        if (data.status !== 'waiting') {
            alert("Game already started!")
            navigate("/")
            return
        }

        hasJoinedRef.current = true
        const playerRef = ref(db, `games/${gameId}/players/${playerId}`)

        set(playerRef, {
            name: myName,
            score: 0,
            currentIndex: 0,
            finished: false,
            finishedAt: 0,
            left: false
        }).then(() => {
            setupPresence(playerId)
        })
    }

    const setupPresence = (playerId: string) => {
        const myLeftRef = ref(db, `games/${gameId}/players/${playerId}/left`)
        onDisconnect(myLeftRef).set(true)
        update(ref(db, `games/${gameId}/players/${playerId}`), { left: false })
    }

    const handleJoinWithName = () => {
        if (!myName.trim()) return
        localStorage.setItem("flag-master-nickname", myName)
        setNeedsName(false)
    }

    // --- 2. ČASOVAČ ---
    useEffect(() => {
        if (!gameData || gameData.status !== 'playing') return

        const interval = setInterval(() => {
            const now = Date.now()
            const elapsed = Math.floor((now - gameData.startTime) / 1000)
            const remaining = Math.max(0, gameData.settings.timeLimit - elapsed)

            setTimeLeft(remaining)

            if (remaining === 0 && myId && gameData.players[myId] && !gameData.players[myId].finished) {
                finishMyGame(false)
            }
        }, 1000)

        return () => clearInterval(interval)
    }, [gameData, myId])


    // --- HELPERY ---
    const activeData = gameData?.settings.region === 'us' ? usData : worldData

    function normalize(str: string) {
        return str.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim()
    }

    function getFlagObject(code: string) {
        return activeData.find(f => f.code === code)
    }

    function getFlagDisplayName(code: string) {
        const flag = getFlagObject(code)
        if (!flag) return "Unknown"
        return Array.isArray(flag.name) ? flag.name[0] : flag.name
    }

    function getFlagImage(code: string) {
        return activeData.find(f => f.code === code)?.image
    }

    // --- LOGIKA ---
    const copyLink = () => {
        const url = window.location.origin + `/pvp/${gameId}`
        navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const startGame = () => {
        update(ref(db, `games/${gameId}`), {
            status: 'playing',
            startTime: Date.now()
        })
    }

    const leaveGame = async () => {
        if(confirm("Leave game? This will cancel the match for everyone.")) {
            if (myId) {
                const myLeftRef = ref(db, `games/${gameId}/players/${myId}/left`)
                await onDisconnect(myLeftRef).cancel()
                await update(ref(db, `games/${gameId}/players/${myId}`), { left: true })
            }
            navigate("/")
        }
    }

    const finishMyGame = (completedAll: boolean) => {
        if (!myId || !gameData) return

        const updates: any = {}
        updates[`players/${myId}/finished`] = true
        updates[`players/${myId}/finishedAt`] = Date.now()

        update(ref(db, `games/${gameId}`), updates)

        const allPlayers = Object.values(gameData.players)
        const activePlayers = allPlayers.filter(p => !p.left)
        const finishedPlayers = activePlayers.filter(p => p.finished)

        if (finishedPlayers.length >= allPlayers.length) {
            update(ref(db, `games/${gameId}`), { status: 'finished' })
        }
    }

    const handleCheck = () => {
        if (!gameData || !myId || feedbackStatus !== 'idle') return

        const myPlayer = gameData.players[myId]
        const currentFlagCode = gameData.flags[myPlayer.currentIndex]

        const flagObject = getFlagObject(currentFlagCode)
        const displayName = getFlagDisplayName(currentFlagCode)
        const userAns = normalize(input)

        let isCorrect = false
        if (flagObject) {
            if (Array.isArray(flagObject.name)) {
                isCorrect = flagObject.name.some(n => normalize(n) === userAns)
            } else {
                isCorrect = normalize(flagObject.name) === userAns
            }
        }

        if (isCorrect) {
            setFeedback("Correct! ✅")
            setFeedbackStatus('correct')
        } else {
            setFeedback(`Wrong ❌ It was: ${displayName}`)
            setFeedbackStatus('error')
        }

        // ZMENA: Rýchlejšia odozva (600ms namiesto 1500ms)
        setTimeout(() => {
            if (!gameData || !myId) return

            const newIndex = gameData.players[myId].currentIndex + 1
            const finished = newIndex >= gameData.flags.length
            const currentScore = gameData.players[myId].score

            const updates: any = {}
            updates[`players/${myId}/currentIndex`] = newIndex
            if (isCorrect) updates[`players/${myId}/score`] = currentScore + 1

            update(ref(db, `games/${gameId}`), updates).then(() => {
                setFeedback(null)
                setFeedbackStatus('idle')
                setInput("")
                setTimeout(() => inputRef.current?.focus(), 50)

                if (finished) {
                    finishMyGame(true)
                }
            })
        }, 600) // <--- TU JE ZMENA ČASU
    }

    // --- RENDER ---

    if (needsName) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-4 transition-colors duration-500">
                <button
                    onClick={toggleTheme}
                    className="absolute top-4 right-4 p-3 rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform"
                >
                    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
                <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl max-w-sm w-full border border-slate-200 dark:border-slate-700">
                    <h1 className="text-2xl font-bold mb-4 text-center">Join Game</h1>
                    <label className="block text-sm font-bold mb-2">Enter your nickname</label>
                    <input
                        type="text"
                        value={myName}
                        onChange={(e) => setMyName(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-900 border-2 border-transparent focus:border-indigo-500 outline-none font-bold mb-4"
                        placeholder="Your Name"
                        autoFocus
                    />
                    <button
                        onClick={handleJoinWithName}
                        disabled={!myName.trim()}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold disabled:opacity-50"
                    >
                        Join Lobby
                    </button>
                </div>
            </div>
        )
    }

    if (gameAborted) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-4">
                <div className="bg-white dark:bg-slate-800 p-10 rounded-3xl shadow-2xl text-center max-w-md w-full border border-slate-200 dark:border-slate-700">
                    <div className="bg-red-100 dark:bg-red-900/30 p-5 rounded-full inline-block mb-6 text-red-500">
                        <WifiOff size={64} />
                    </div>
                    <h1 className="text-3xl font-bold mb-2">Connection Lost</h1>
                    <p className="text-slate-500 mb-8">
                        A player has disconnected or left the game.<br/>
                        The match has been cancelled.
                    </p>
                    <Link to="/" className="block w-full py-4 bg-slate-900 dark:bg-slate-700 text-white rounded-xl font-bold hover:scale-105 transition-transform flex items-center justify-center gap-2">
                        <Home size={20} /> Return to Menu
                    </Link>
                </div>
            </div>
        )
    }

    if (gameFull) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-4">
                <div className="bg-white dark:bg-slate-800 p-10 rounded-3xl shadow-xl text-center max-w-md w-full border border-slate-200 dark:border-slate-700">
                    <div className="bg-red-100 dark:bg-red-900/30 p-5 rounded-full inline-block mb-6 text-red-500"><AlertTriangle size={64} /></div>
                    <h1 className="text-3xl font-bold mb-2">Game Full</h1>
                    <p className="text-slate-500 mb-8">This lobby has reached maximum capacity.</p>
                    <Link to="/" className="block w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold">Back to Menu</Link>
                </div>
            </div>
        )
    }

    if (!gameData || !myId) return <div className="min-h-screen flex items-center justify-center text-slate-500"><Loader2 className="animate-spin mr-2"/> Connecting...</div>

    const isMeHost = gameData.hostId === myId
    const allPlayers = Object.entries(gameData.players).map(([id, p]) => ({ ...p, id }))
    const myPlayer = gameData.players[myId]

    if (gameData.status === 'waiting') {
        const activePlayersCount = allPlayers.filter(p => !p.left).length
        const canStart = activePlayersCount >= 2

        return (
            <div className="min-h-screen flex flex-col items-center pt-20 px-4 bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-500">
                <button onClick={leaveGame} className="absolute top-4 left-4 p-3 rounded-full bg-white dark:bg-slate-800 shadow-md text-red-500 hover:bg-red-50"><X size={20} /></button>

                <button
                    onClick={toggleTheme}
                    className="absolute top-4 right-4 p-3 rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform"
                >
                    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>

                <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl text-center max-w-md w-full border border-slate-200 dark:border-slate-700">
                    <div className="bg-indigo-100 dark:bg-indigo-900/30 p-4 rounded-full inline-block mb-4 text-indigo-600 dark:text-indigo-400">
                        <Users size={48} />
                    </div>
                    <h1 className="text-3xl font-bold mb-2">Game Lobby</h1>
                    <div className="flex justify-center items-center gap-4 text-slate-500 dark:text-slate-400 mb-6 text-sm">
                        <span className="flex items-center gap-1"><Users size={14}/> {activePlayersCount}/{gameData.settings.maxPlayers}</span>
                        <span className="flex items-center gap-1"><Trophy size={14}/> {gameData.settings.roundCount} Flags</span>
                        <span className="flex items-center gap-1"><Clock size={14}/> {gameData.settings.timeLimit}s</span>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-3 rounded-xl mb-6 border border-slate-200 dark:border-slate-700">
                        <span className="text-xs text-slate-400 truncate flex-1">{window.location.origin}/pvp/{gameId}</span>
                        <button onClick={copyLink} className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm hover:scale-105 transition-transform">
                            {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                        </button>
                    </div>

                    <div className="space-y-3 mb-8 text-left">
                        {allPlayers.map((p) => (
                            <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border ${p.id === myId ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${p.left ? 'bg-red-500' : 'bg-green-500'}`}></div>
                                    <span className={`font-bold ${p.id === myId ? 'text-indigo-600 dark:text-indigo-400' : ''}`}>
                                        {p.name} {p.id === myId && "(You)"}
                                    </span>
                                    {p.id === gameData.hostId && <span className="text-[10px] bg-yellow-100 text-yellow-600 px-1.5 py-0.5 rounded font-bold">HOST</span>}
                                </div>
                            </div>
                        ))}
                        {Array.from({ length: Math.max(0, gameData.settings.maxPlayers - allPlayers.length) }).map((_, i) => (
                            <div key={i} className="p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-center text-sm">
                                Waiting for player...
                            </div>
                        ))}
                    </div>

                    {isMeHost ? (
                        <button
                            onClick={startGame}
                            disabled={!canStart}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2"
                        >
                            <Play size={20} /> Start Battle
                        </button>
                    ) : (
                        <div className="text-sm text-slate-500 animate-pulse">Waiting for host to start...</div>
                    )}
                </div>
            </div>
        )
    }

    if (gameData.status === 'finished' || (myPlayer?.finished && allPlayers.every(p => p.finished))) {

        const sortedPlayers = [...allPlayers].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score
            const timeA = (a.finishedAt || Infinity) - gameData.startTime
            const timeB = (b.finishedAt || Infinity) - gameData.startTime
            return timeA - timeB
        })

        const myRank = sortedPlayers.findIndex(p => p.id === myId) + 1
        const isWinner = myRank === 1

        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-4">
                <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl text-center max-w-md w-full border border-slate-200 dark:border-slate-700 relative">
                    <div className={`p-5 rounded-full inline-block mb-4 ${isWinner ? 'bg-yellow-100 text-yellow-500' : 'bg-slate-100 text-slate-500'}`}>
                        <Trophy size={64} />
                    </div>

                    <h1 className="text-4xl font-black mb-2 uppercase tracking-tight">{isWinner ? "Victory!" : `#${myRank} Place`}</h1>
                    <p className="text-slate-500 mb-6">{isWinner ? "You are the champion!" : "Good game!"}</p>

                    <div className="space-y-3 mb-8">
                        {sortedPlayers.map((p, index) => {
                            const time = p.finishedAt ? ((p.finishedAt - gameData.startTime) / 1000).toFixed(1) + 's' : 'DNF'
                            return (
                                <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border ${p.id === myId ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' : 'bg-slate-50 border-slate-100 dark:bg-slate-900 dark:border-slate-800'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-yellow-400 text-white' : 'bg-slate-300 text-slate-600'}`}>
                                            {index + 1}
                                        </div>
                                        <span className={`font-bold ${p.id === myId ? 'text-indigo-600 dark:text-indigo-400' : ''} ${p.left ? 'line-through text-slate-400' : ''}`}>{p.name} {p.left && "(Left)"}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold">{p.score} pts</div>
                                        <div className="text-[10px] text-slate-400">{time}</div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <Link to="/" className="block w-full py-4 bg-slate-900 dark:bg-slate-700 text-white rounded-xl font-bold hover:scale-105 transition-transform flex items-center justify-center gap-2">
                        <Home size={20} /> Back to Menu
                    </Link>
                </div>
            </div>
        )
    }

    if (myPlayer?.finished) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-4">
                <button onClick={leaveGame} className="absolute top-4 left-4 p-3 rounded-full bg-white dark:bg-slate-800 shadow-md text-red-500"><X size={20} /></button>
                <div className="text-center animate-pulse">
                    <h1 className="text-3xl font-bold mb-2">Finished! 🎉</h1>
                    <p className="text-slate-500">Waiting for others to finish...</p>
                    <div className="mt-6 p-4 bg-white dark:bg-slate-800 rounded-xl shadow-lg inline-block">
                        <div className="text-xs text-slate-400 uppercase font-bold">Your Score</div>
                        <div className="text-3xl font-bold text-indigo-600">{myPlayer.score} / {gameData.flags.length}</div>
                    </div>
                </div>
            </div>
        )
    }

    const currentFlagCode = gameData.flags[myPlayer.currentIndex]
    const otherPlayers = allPlayers.filter(p => p.id !== myId).sort((a,b) => b.score - a.score)

    return (
        <div className="min-h-screen flex flex-col items-center pt-8 font-sans bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-500">

            <div className="w-full px-4 flex justify-between items-center mb-4">
                <button onClick={leaveGame} className="p-2 rounded-full bg-white dark:bg-slate-800 shadow-sm text-slate-400 hover:text-red-500"><X size={20}/></button>
                <div className={`flex items-center gap-1 font-mono font-bold text-lg ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-slate-600 dark:text-slate-300'}`}>
                    <Timer size={18}/> {timeLeft}s
                </div>

                <button
                    onClick={toggleTheme}
                    className="p-2 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform"
                >
                    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
            </div>

            <div className="w-full max-w-lg px-4 mb-2">
                <div className="flex justify-between items-end mb-2">
                    <div>
                        <div className="text-xs font-bold uppercase text-slate-400">You ({myPlayer.name})</div>
                        <div className="text-2xl font-bold text-indigo-600">{myPlayer.score}</div>
                    </div>
                    <div className="text-sm font-bold bg-white dark:bg-slate-800 px-3 py-1 rounded-full shadow-sm text-slate-500">
                        {myPlayer.currentIndex + 1} / {gameData.flags.length}
                    </div>
                </div>

                <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-3">
                    <motion.div
                        className="h-full bg-indigo-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${(myPlayer.currentIndex / gameData.flags.length) * 100}%` }}
                        transition={{ duration: 0.3 }} // ZMENA: Rýchlejšia animácia
                    />
                </div>

                <div className="space-y-1">
                    {otherPlayers.map(p => (
                        <div key={p.id} className="flex items-center gap-2 text-xs">
                            <span className={`w-20 truncate ${p.left ? 'text-red-400 line-through' : 'text-slate-500'}`}>
                                {p.name}
                            </span>
                            <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                <motion.div
                                    className={`h-full ${p.finished ? 'bg-green-500' : 'bg-orange-400'}`}
                                    animate={{ width: `${(p.currentIndex / gameData.flags.length) * 100}%` }}
                                    transition={{ duration: 0.3 }} // ZMENA: Rýchlejšia animácia
                                />
                            </div>
                            <span className="w-4 text-right text-slate-400">{p.score}</span>
                        </div>
                    ))}
                </div>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={currentFlagCode}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }} // ZMENA: Rýchlejšia animácia karty
                    className="bg-white dark:bg-slate-800 p-6 sm:p-10 rounded-t-xl rounded-b-3xl shadow-xl border border-white/50 dark:border-slate-700/50 w-full max-w-lg flex flex-col items-center gap-8 relative mx-4 mt-4"
                >
                    <div className="w-full h-48 sm:h-56 flex justify-center">
                        <img src={getFlagImage(currentFlagCode)} alt="Flag" className="h-full w-auto object-contain rounded-lg shadow-md border border-slate-100 dark:border-slate-700" />
                    </div>

                    <div className="w-full space-y-4">
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleCheck()}
                            disabled={feedbackStatus !== 'idle'}
                            placeholder="Type country name..."
                            className={`w-full px-5 py-4 text-center text-xl font-medium rounded-xl border-2 outline-none transition-all
                                dark:bg-slate-900 dark:text-white
                                ${feedbackStatus === 'error' ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600 text-red-900 dark:text-red-200' : ''}
                                ${feedbackStatus === 'correct' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-600 text-emerald-900 dark:text-emerald-200' : 'border-slate-200 dark:border-slate-700'}
                            `}
                            autoFocus
                            autoComplete="off"
                        />

                        <div className="h-6 text-center font-bold">
                            <AnimatePresence mode="wait">
                                {feedback && (
                                    <motion.span
                                        key={feedback}
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className={feedbackStatus === 'correct' ? 'text-emerald-500' : 'text-red-500'}
                                    >
                                        {feedback}
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </div>

                        <button
                            onClick={handleCheck}
                            disabled={!input || feedbackStatus !== 'idle'}
                            className={`w-full py-4 rounded-xl font-bold shadow-lg transition-all text-white
                                ${feedbackStatus !== 'idle' ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'}
                            `}
                        >
                            {feedbackStatus === 'idle' ? 'Submit Answer' : 'Wait...'}
                        </button>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    )
}