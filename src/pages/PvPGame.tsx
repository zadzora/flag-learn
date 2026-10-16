import { useEffect, useState, useRef, useMemo } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { db } from "../../lib/firebase"
import { ref, onValue, update, onDisconnect, get, set } from "firebase/database"
import { Copy, Check, Users, Trophy, Play, Home, Clock, X, Timer, Loader2, AlertTriangle, WifiOff, Landmark, EyeOff, PartyPopper, PencilLine } from "lucide-react"
import { motion } from "framer-motion"
import TopBar from "../components/TopBar"
import worldData from "../../data/flags.json"
import usData from "../../data/us_states.json"
import { resolveTextAnswer, typoFeedbackForStreak } from "../utils/textAnswerMatch"

type Flag = {
    code: string
    name: string | string[]
    capital?: (string | null)[] | null
    image: string
}

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
        region: 'world' | 'us' | 'capitals'
        timeLimit: number
        maxPlayers: number
        isBlurMode?: boolean
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
    const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'correct' | 'error' | 'warn'>('idle')
    const [copied, setCopied] = useState(false)
    const [timeLeft, setTimeLeft] = useState(0)

    const [blurAmount, setBlurAmount] = useState(0)

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

    // --- 1. Connect ---
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
                const activePlayers = players.filter(p => !p.left)
                const activeCount = activePlayers.length

                if (data.status === 'aborted') {
                    setGameAborted(true)
                } else if (data.status === 'playing') {
                    if (activeCount < 2) {
                        setGameAborted(true)
                        if (data.hostId === myId) {
                            update(ref(db, `games/${gameId}`), { status: 'aborted' })
                        }
                    } else {
                        const allActiveFinished = activePlayers.every(p => p.finished)
                        if (allActiveFinished && activePlayers.length > 0) {
                            if (data.hostId === myId) {
                                update(ref(db, `games/${gameId}`), { status: 'finished' })
                            }
                        }
                    }
                }
            }
        })

        return () => unsubscribe()
    }, [gameId, needsName, myId])


    const tryJoinGame = (data: GameData, playerId: string) => {
        if (hasJoinedRef.current) return

        if (data.status === 'aborted') {
            setGameAborted(true)
            return
        }

        const isReconnecting = !!data.players[playerId]

        if (!isReconnecting) {
            if (data.status !== 'waiting') {
                alert("Game already started! You cannot join now.")
                navigate("/")
                return
            }

            const currentCount = Object.keys(data.players || {}).length
            if (currentCount >= data.settings.maxPlayers) {
                setGameFull(true)
                return
            }
        }

        hasJoinedRef.current = true

        if (isReconnecting) {
            setupPresence(playerId)
            update(ref(db, `games/${gameId}/players/${playerId}`), { left: false })
            return
        }

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

    // --- 2. Timer ---
    useEffect(() => {
        if (!gameData || gameData.status !== 'playing') return

        const interval = setInterval(() => {
            const now = Date.now()
            const elapsed = Math.floor((now - gameData.startTime) / 1000)
            const remaining = Math.max(0, gameData.settings.timeLimit - elapsed)

            setTimeLeft(remaining)

            if (remaining === 0 && myId && gameData.players[myId] && !gameData.players[myId].finished) {
                finishMyGame()
            }
        }, 1000)

        return () => clearInterval(interval)
    }, [gameData, myId])


    // --- HELPERS ---
    const activeData = useMemo(() => {
        if (!gameData) return []
        if (gameData.settings.region === 'us') return usData as unknown as Flag[]
        if (gameData.settings.region === 'capitals') {
            return (worldData as unknown as Flag[]).filter(f => f.capital && f.capital[0] !== null)
        }
        return worldData as unknown as Flag[]
    }, [gameData])

    function getFlagObject(code: string) {
        return activeData.find(f => f.code === code)
    }

    function getFlagImage(code: string) {
        return activeData.find(f => f.code === code)?.image
    }

    function getCorrectAnswerDisplay(code: string) {
        const flag = getFlagObject(code)
        if (!flag) return "Unknown"

        if (gameData?.settings.region === 'capitals' && flag.capital) {
            return flag.capital[0] || "Unknown"
        }

        return Array.isArray(flag.name) ? flag.name[0] : flag.name
    }

    function getCountryName(code: string) {
        const flag = getFlagObject(code)
        if (!flag) return "Unknown"
        return Array.isArray(flag.name) ? flag.name[0] : flag.name
    }

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
        const activePlayersCount = gameData ? Object.values(gameData.players).filter(p => !p.left).length : 0
        const msg = activePlayersCount <= 2
            ? "Leave game? Since there are only 2 players, the game will be cancelled."
            : "Leave game? The game will continue without you."

        if(confirm(msg)) {
            if (myId) {
                const myLeftRef = ref(db, `games/${gameId}/players/${myId}/left`)
                await onDisconnect(myLeftRef).cancel()
                await update(ref(db, `games/${gameId}/players/${myId}`), { left: true })
            }
            navigate("/")
        }
    }

    const finishMyGame = () => {
        if (!myId || !gameData) return

        const updates: any = {}
        updates[`players/${myId}/finished`] = true
        updates[`players/${myId}/finishedAt`] = Date.now()

        update(ref(db, `games/${gameId}`), updates)

        const allPlayers = Object.values(gameData.players)
        const activePlayers = allPlayers.filter(p => !p.left)
        const othersActive = activePlayers.filter(p => p.name !== myName)
        const othersFinished = othersActive.every(p => p.finished)

        if (othersFinished) {
            update(ref(db, `games/${gameId}`), { status: 'finished' })
        }
    }

    // Helper variables
    const myPlayer = gameData && myId ? gameData.players[myId] : null
    const currentFlagCode = myPlayer && gameData ? gameData.flags[myPlayer.currentIndex] : null

    // Logic to handle Blur Mode
    useEffect(() => {
        if (!gameData?.settings.isBlurMode) {
            setBlurAmount(0)
            return
        }

        if (gameData.status === 'playing' && (feedbackStatus === 'idle' || feedbackStatus === 'warn')) {
            setBlurAmount(20)

            const interval = setInterval(() => {
                setBlurAmount(prev => {
                    if (prev <= 0) {
                        clearInterval(interval)
                        return 0
                    }
                    return Math.max(0, prev - 0.25)
                })
            }, 100)
            return () => clearInterval(interval)
        } else {
            setBlurAmount(0)
        }
    }, [currentFlagCode, feedbackStatus, gameData?.settings.isBlurMode, gameData?.status])


    const handleCheck = () => {
        if (!gameData || !myId || !currentFlagCode) return
        if (feedbackStatus === 'correct' || feedbackStatus === 'error') return

        const flagObject = getFlagObject(currentFlagCode)
        const accept: string[] =
            flagObject && gameData.settings.region === 'capitals' && flagObject.capital && Array.isArray(flagObject.capital)
                ? flagObject.capital.filter((c): c is string => typeof c === 'string')
                : flagObject
                    ? Array.isArray(flagObject.name)
                        ? [...flagObject.name]
                        : [flagObject.name]
                    : []

        const match = resolveTextAnswer(input, accept)
        setBlurAmount(0)

        if (match === 'close') {
            setFeedback(typoFeedbackForStreak(false))
            setFeedbackStatus('warn')
            setTimeout(() => {
                setFeedback(null)
                setFeedbackStatus('idle')
            }, 2800)
            return
        }

        const isCorrect = match === 'exact'

        if (isCorrect) {
            setFeedback("Correct! ✅")
            setFeedbackStatus('correct')
        } else {
            setFeedback(`Wrong ❌ It was: ${getCorrectAnswerDisplay(currentFlagCode)}`)
            setFeedbackStatus('error')
        }

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
                    finishMyGame()
                }
            })
        }, 1500)
    }

    // --- RENDER ---

    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const primary = "rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const disabledButton = "cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 text-slate-400 font-bold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
    const textInput = "w-full border border-slate-200 bg-slate-50 outline-none transition-colors focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-[#4A5680]"
    const iconBox = "flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700"
    const tag = "inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
    const page = "flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]"
    const themeProps = { theme, onToggleTheme: toggleTheme }

    if (needsName) {
        return (
            <div className={page}>
                <TopBar title="PvP Battle" {...themeProps} />
                <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10 sm:px-6">
                    <section className={`${panel} mx-auto w-full max-w-sm p-6 sm:p-7`}>
                        <h1 className="mb-5 text-center !text-2xl font-bold">Join Game</h1>
                        <label htmlFor="pvp-join-name" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Enter your nickname</label>
                        <input
                            id="pvp-join-name"
                            type="text"
                            value={myName}
                            onChange={(e) => setMyName(e.target.value)}
                            className={`${textInput} mb-4 px-4 py-3 font-bold`}
                            placeholder="Your Name"
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={handleJoinWithName}
                            disabled={!myName.trim()}
                            className={`w-full py-3.5 ${myName.trim() ? primary : disabledButton}`}
                        >
                            Join Lobby
                        </button>
                    </section>
                </main>
            </div>
        )
    }

    if (gameAborted) {
        return (
            <div className={page}>
                <TopBar title="PvP Battle" {...themeProps} />
                <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10 sm:px-6">
                    <section className={`${panel} flex flex-col items-center p-7 text-center sm:p-9`}>
                        <span className={`${iconBox} mb-5 text-red-500 dark:text-red-400`}><WifiOff size={28} aria-hidden /></span>
                        <h1 className="mb-2 !text-3xl font-bold">Connection Lost</h1>
                        <p className="mb-7 text-slate-500 dark:text-slate-400">
                            Not enough players to continue.<br/>
                            The match has been cancelled.
                        </p>
                        <Link to="/" className={`${primary} flex w-full items-center justify-center gap-2 py-3.5`}>
                            <Home size={18} aria-hidden /> Return to Menu
                        </Link>
                    </section>
                </main>
            </div>
        )
    }

    if (gameFull) {
        return (
            <div className={page}>
                <TopBar title="PvP Battle" {...themeProps} />
                <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10 sm:px-6">
                    <section className={`${panel} flex flex-col items-center p-7 text-center sm:p-9`}>
                        <span className={`${iconBox} mb-5 text-red-500 dark:text-red-400`}><AlertTriangle size={28} aria-hidden /></span>
                        <h1 className="mb-2 !text-3xl font-bold">Game Full</h1>
                        <p className="mb-7 text-slate-500 dark:text-slate-400">This lobby has reached maximum capacity.</p>
                        <Link to="/" className={`${primary} flex w-full items-center justify-center py-3.5`}>Back to Menu</Link>
                    </section>
                </main>
            </div>
        )
    }

    if (!gameData || !myId) {
        return (
            <div className={page}>
                <TopBar title="PvP Battle" {...themeProps} />
                <main className="flex flex-1 items-center justify-center gap-2 px-4 py-16 text-slate-500 dark:text-slate-400"><Loader2 className="animate-spin" aria-hidden /> Connecting...</main>
            </div>
        )
    }

    const isMeHost = gameData.hostId === myId
    const allPlayers = Object.entries(gameData.players).map(([id, p]) => ({ ...p, id }))

    if (gameData.status === 'waiting') {
        const activePlayersCount = allPlayers.filter(p => !p.left).length
        const canStart = activePlayersCount >= 2

        return (
            <div className={page}>
                <TopBar title="Game Lobby" back={leaveGame} {...themeProps} />

                <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-14 pt-6 sm:px-6 sm:pt-8">
                    <section className={`${panel} flex flex-col p-5 text-center sm:p-7`}>
                        <span className={`${iconBox} mx-auto mb-4 text-slate-500 dark:text-slate-300`}>
                            {gameData.settings.region === 'capitals' ? <Landmark size={28} aria-hidden /> : <Users size={28} aria-hidden />}
                        </span>
                        <h1 className="mb-3 !text-3xl font-bold">Game Lobby</h1>

                        <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
                            <span className={`${tag} bg-blue-500/15 text-blue-700 dark:text-blue-300`}>
                                {gameData.settings.region === 'capitals' ? 'Capitals Mode' : (gameData.settings.region === 'us' ? 'USA Mode' : 'World Mode')}
                            </span>
                            {/* Blur mode indicator */}
                            {gameData.settings.isBlurMode && (
                                <span className={`${tag} bg-slate-500/15 text-slate-600 dark:text-slate-300`}>
                                    <EyeOff size={11} aria-hidden /> Blur
                                </span>
                            )}
                        </div>

                        <div className="mb-6 flex items-center justify-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1"><Users size={14} aria-hidden /> {activePlayersCount}/{gameData.settings.maxPlayers}</span>
                            <span className="flex items-center gap-1"><Trophy size={14} aria-hidden /> {gameData.settings.roundCount} Flags</span>
                            <span className="flex items-center gap-1"><Clock size={14} aria-hidden /> {gameData.settings.timeLimit}s</span>
                        </div>

                        <div className="mb-6 flex items-center gap-2 rounded-lg border border-slate-200 py-1.5 pl-3 pr-1.5 dark:border-slate-700">
                            <span className="min-w-0 flex-1 truncate text-left text-xs text-slate-500 dark:text-slate-400">{window.location.origin}/pvp/{gameId}</span>
                            <button
                                type="button"
                                onClick={copyLink}
                                aria-label="Copy invite link"
                                title="Copy invite link"
                                className="flex h-9 min-h-0 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 p-0 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:text-slate-200 dark:hover:border-[#3A4670]"
                            >
                                {copied ? <Check size={16} className="text-emerald-500" aria-hidden /> : <Copy size={16} aria-hidden />}
                            </button>
                        </div>

                        <ul className="mb-7 space-y-2 text-left">
                            {allPlayers.map((p) => (
                                <li key={p.id} className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${p.id === myId ? 'border-slate-400 dark:border-[#4A5680]' : 'border-slate-200 dark:border-slate-700'}`}>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className={`h-2 w-2 shrink-0 rounded-full ${p.left ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                                        <span className="truncate font-bold">
                                            {p.name} {p.id === myId && <span className="font-normal text-slate-500 dark:text-slate-400">(You)</span>}
                                        </span>
                                        {p.id === gameData.hostId && <span className={`${tag} bg-amber-500/15 text-amber-700 dark:text-amber-300`}>HOST</span>}
                                    </div>
                                </li>
                            ))}
                            {Array.from({ length: Math.max(0, gameData.settings.maxPlayers - allPlayers.length) }).map((_, i) => (
                                <li key={i} className="rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
                                    Waiting for player...
                                </li>
                            ))}
                        </ul>

                        {isMeHost ? (
                            <button
                                type="button"
                                onClick={startGame}
                                disabled={!canStart}
                                className={`flex w-full items-center justify-center gap-2 py-4 text-lg ${canStart ? primary : disabledButton}`}
                            >
                                <Play size={20} aria-hidden /> Start Battle
                            </button>
                        ) : (
                            <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Loader2 size={15} className="animate-spin" aria-hidden /> Waiting for host to start...</div>
                        )}
                    </section>
                </main>
            </div>
        )
    }

    if (gameData.status === 'finished' || (myPlayer?.finished && Object.values(gameData.players).filter(p=>!p.left).every(p => p.finished))) {
        const sortedPlayers = [...allPlayers].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score
            const timeA = (a.finishedAt || Infinity) - gameData.startTime
            const timeB = (b.finishedAt || Infinity) - gameData.startTime
            return timeA - timeB
        })

        const myRank = sortedPlayers.findIndex(p => p.id === myId) + 1
        const isWinner = myRank === 1

        return (
            <div className={page}>
                <TopBar title="PvP Battle" {...themeProps} />

                <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-14 pt-6 sm:px-6 sm:pt-8">
                    <section className={`${panel} flex flex-col p-6 text-center sm:p-8`}>
                        <span className={`${iconBox} mx-auto mb-4 ${isWinner ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}`}>
                            <Trophy size={28} aria-hidden />
                        </span>

                        <h1 className="mb-2 !text-4xl font-extrabold uppercase">{isWinner ? "Victory!" : `#${myRank} Place`}</h1>
                        <p className="mb-6 text-slate-500 dark:text-slate-400">{isWinner ? "You are the champion!" : "Good game!"}</p>

                        <ol className="mb-7 space-y-2 text-left">
                            {sortedPlayers.map((p, index) => {
                                const time = p.finishedAt ? ((p.finishedAt - gameData.startTime) / 1000).toFixed(1) + 's' : 'DNF'
                                return (
                                    <li key={p.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${p.id === myId ? 'border-slate-400 dark:border-[#4A5680]' : 'border-slate-200 dark:border-slate-700'}`}>
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${index === 0 ? 'bg-amber-500 text-white' : 'border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400'}`}>
                                                {index + 1}
                                            </span>
                                            <span className={`truncate font-bold ${p.left ? 'text-slate-400 line-through dark:text-slate-500' : ''}`}>
                                                {p.name} {p.left && "(Left)"}
                                                {p.id === myId && !p.left && <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">(You)</span>}
                                            </span>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <div className="font-bold tabular-nums">{p.score} pts</div>
                                            <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{time}</div>
                                        </div>
                                    </li>
                                )
                            })}
                        </ol>

                        <Link to="/" className={`${primary} flex w-full items-center justify-center gap-2 py-3.5`}>
                            <Home size={18} aria-hidden /> Back to Menu
                        </Link>
                    </section>
                </main>
            </div>
        )
    }

    if (myPlayer?.finished) {
        return (
            <div className={page}>
                <TopBar title="PvP Battle" back={leaveGame} {...themeProps} />
                <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10 sm:px-6">
                    <section className={`${panel} flex flex-col items-center p-7 text-center sm:p-9`}>
                        <span className={`${iconBox} mb-4 text-emerald-500`}><PartyPopper size={28} aria-hidden /></span>
                        <h1 className="mb-2 !text-3xl font-bold">Finished!</h1>
                        <p className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Loader2 size={15} className="animate-spin" aria-hidden /> Waiting for others to finish...</p>
                        <div className="mt-6 rounded-lg border border-slate-200 px-6 py-4 dark:border-slate-700">
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Your Score</div>
                            <div className="mt-1 text-3xl font-bold tabular-nums">{myPlayer.score} / {gameData.flags.length}</div>
                        </div>
                    </section>
                </main>
            </div>
        )
    }

    const otherPlayers = allPlayers.filter(p => p.id !== myId).sort((a,b) => b.score - a.score)

    //Guard clause to prevent rendering if data is missing
    if (!myPlayer || !currentFlagCode) {
        return (
            <div className={page}>
                <TopBar title="PvP Battle" {...themeProps} />
                <main className="flex flex-1 items-center justify-center gap-2 px-4 py-16 text-slate-500 dark:text-slate-400">
                    <Loader2 className="animate-spin" aria-hidden /> Connecting to game...
                </main>
            </div>
        )
    }

    const answerLocked = feedbackStatus === 'correct' || feedbackStatus === 'error'
    // The feedback copy carries emoji; the line shows a lucide icon in their place.
    const feedbackText = feedback
        ? feedback.replace(/\s*\p{Extended_Pictographic}️?\s*$/u, "").replace(/\s*\p{Extended_Pictographic}️?\s+/gu, ". ")
        : ""

    return (
        <div className={page}>
            <TopBar title="PvP Battle" back={leaveGame} {...themeProps}>
                <span className={`flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums ${timeLeft < 10 ? 'text-red-600 dark:text-red-400' : ''}`} title="Time left">
                    <Timer size={16} aria-hidden /> {timeLeft}s
                </span>
            </TopBar>

            <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-14 pt-6 sm:px-6 sm:pt-8">
                <div className="mb-2 flex items-end justify-between">
                    <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">You ({myPlayer.name})</div>
                        <div className="text-2xl font-bold tabular-nums">{myPlayer.score}</div>
                    </div>
                    <div className="text-sm font-bold tabular-nums text-slate-500 dark:text-slate-400">
                        {myPlayer.currentIndex + 1} / {gameData.flags.length}
                    </div>
                </div>

                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700">
                    <motion.div
                        className="h-full bg-blue-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${(myPlayer.currentIndex / gameData.flags.length) * 100}%` }}
                        transition={{ duration: 0.3 }}
                    />
                </div>

                <div className="space-y-1.5">
                    {otherPlayers.map(p => (
                        <div key={p.id} className="flex items-center gap-2 text-xs">
                            <span className={`w-20 truncate ${p.left ? 'text-red-500 line-through dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                {p.name}
                            </span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700">
                                <motion.div
                                    className={`h-full ${p.finished ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500'}`}
                                    animate={{ width: `${(p.currentIndex / gameData.flags.length) * 100}%` }}
                                    transition={{ duration: 0.3 }}
                                />
                            </div>
                            <span className="w-4 text-right tabular-nums text-slate-500 dark:text-slate-400">{p.score}</span>
                        </div>
                    ))}
                </div>

                {/* The card stays put between questions; only the flag inside it changes. */}
                <section className={`${panel} mt-6 flex flex-col gap-5 p-5 sm:p-7`}>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {gameData.settings.region === 'capitals' ? `Capital of ${getCountryName(currentFlagCode)}` : "Identify the Flag"}
                    </div>

                    <div className="flex h-48 w-full items-center justify-center sm:h-56">
                        <img
                            key={currentFlagCode}
                            src={getFlagImage(currentFlagCode)}
                            alt="Flag"
                            style={{
                                filter: `blur(${blurAmount}px) grayscale(${(blurAmount / 20) * 100}%)`,
                                transition: 'filter 0.1s linear'
                            }}
                            className="fl-in h-full w-auto max-w-full rounded-[4px] object-contain shadow-[0_2px_10px_rgba(10,14,26,0.18)]"
                        />
                    </div>

                    <div className="flex w-full flex-col gap-3">
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleCheck()}
                            disabled={answerLocked}
                            aria-label={gameData.settings.region === 'capitals' ? 'Capital' : 'Answer'}
                            placeholder={gameData.settings.region === 'capitals' ? "Type capital city..." : "Type country name..."}
                            className={`w-full border px-5 py-4 text-center text-xl font-medium outline-none transition-colors duration-150 dark:text-white
                                ${feedbackStatus === 'error' ? 'border-red-400 bg-red-500/10 text-red-900 dark:border-red-500/60 dark:text-red-100' : ''}
                                ${feedbackStatus === 'correct' ? 'border-emerald-400 bg-emerald-500/10 text-emerald-900 dark:border-emerald-500/60 dark:text-emerald-100' : ''}
                                ${feedbackStatus === 'warn' ? 'border-amber-400 bg-amber-500/10 text-amber-950 dark:border-amber-500/60 dark:text-amber-100' : ''}
                                ${feedbackStatus === 'idle' ? 'border-slate-200 bg-slate-50 focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-[#4A5680]' : ''}
                            `}
                            autoFocus
                            autoComplete="off"
                        />

                        <div className="flex min-h-[4.5rem] flex-col items-center justify-center px-1 py-2 text-center font-bold">
                            {feedback && (
                                <span
                                    key={feedback}
                                    className={`fl-in flex max-w-[98%] items-start justify-center gap-1.5 text-sm leading-snug sm:text-base ${
                                        feedbackStatus === 'correct'
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : feedbackStatus === 'warn'
                                                ? 'text-amber-600 dark:text-amber-400'
                                                : 'text-red-600 dark:text-red-400'
                                    }`}
                                >
                                    {feedbackStatus === 'correct' && <Check size={18} strokeWidth={3} aria-hidden className="mt-0.5 shrink-0" />}
                                    {feedbackStatus === 'warn' && <PencilLine size={17} aria-hidden className="mt-0.5 shrink-0" />}
                                    {feedbackStatus === 'error' && <X size={18} strokeWidth={3} aria-hidden className="mt-0.5 shrink-0" />}
                                    <span>{feedbackText}</span>
                                </span>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={handleCheck}
                            disabled={!input || answerLocked}
                            className={`w-full py-4 text-lg ${!input || answerLocked ? disabledButton : primary}`}
                        >
                            {answerLocked ? 'Wait...' : 'Submit Answer'}
                        </button>
                    </div>
                </section>
            </main>
        </div>
    )
}
