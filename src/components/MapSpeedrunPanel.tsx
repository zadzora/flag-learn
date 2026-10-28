import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Medal, Repeat, Timer, X } from "lucide-react"
import { BarButton } from "./TopBar"
import {
    MAP_REGIONS, PENALTY_SECONDS, formatRunTime, getPlayerId, loadPlayerName, normalizePlayerName,
    saveRun, subscribeLeaderboard, type MapLeaderboardRecord, type MapRegion, type SaveOutcome,
} from "../utils/mapSpeedrun"

export type MapRunResult = { region: MapRegion; seconds: number; mistakes: number; count: number }

type Props = {
    region: MapRegion
    /** How many countries each region asks, for the region picker. */
    counts: Record<MapRegion, number>
    /** Set once a run has finished: the panel shows the result and the save form. */
    result: MapRunResult | null
    onRegionChange: (region: MapRegion) => void
    onStart: (region: MapRegion) => void
    onClose: () => void
}

const NOTICE: Record<SaveOutcome | "failed", string> = {
    first: "Saved! Your first record for this region is on the board.",
    improved: "Saved! Your personal record was improved.",
    "not-better": "Not saved. Your previous record is still better.",
    failed: "Save failed. Check the connection and try again.",
}

const dialog = "rounded-[10px] border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
const primary = "rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
const rankColor = ["text-amber-500", "text-slate-400", "text-orange-600 dark:text-orange-400"]

export default function MapSpeedrunPanel({ region, counts, result, onRegionChange, onStart, onClose }: Props) {
    const boardRegion = result ? result.region : region
    const [board, setBoard] = useState<{ region: MapRegion; entries: MapLeaderboardRecord[] } | null>(null)
    const [playerId] = useState(getPlayerId)
    const [name, setName] = useState(loadPlayerName)
    const [notice, setNotice] = useState<SaveOutcome | "failed" | null>(null)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    useEffect(() => subscribeLeaderboard(boardRegion, entries => setBoard({ region: boardRegion, entries })), [boardRegion])

    // A board still showing the previous region would rank the run against the wrong table.
    const entries = board?.region === boardRegion ? board.entries : null

    async function handleSave() {
        const cleaned = normalizePlayerName(name)
        if (!result || !cleaned || !entries || saving) return
        setSaving(true)
        try {
            const outcome = await saveRun(result.region, entries, cleaned, result.seconds, result.mistakes)
            setNotice(outcome)
            setSaved(outcome !== "not-better")
        } catch {
            setNotice("failed")
        } finally {
            setSaving(false)
        }
    }

    const regionLabel = MAP_REGIONS.find(r => r.id === boardRegion)?.label ?? "World"

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <div className={`${dialog} flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden`}>
                <div className="flex items-start justify-between gap-3 p-5 pb-0 sm:p-6 sm:pb-0">
                    <div>
                        <h2 className="!text-2xl font-bold">{result ? "Run complete!" : "Map Speedrun"}</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {result
                                ? <>You located all <strong className="text-slate-900 dark:text-white">{result.count}</strong> countries of {regionLabel === "World" ? "the world" : regionLabel}.</>
                                : <>Click every country as fast as you can. A wrong click adds <strong className="text-slate-900 dark:text-white">+{PENALTY_SECONDS}s</strong> and the country comes back later.</>}
                        </p>
                    </div>
                    <BarButton onClick={onClose} label="Close"><X size={20} aria-hidden /></BarButton>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 sm:p-6">
                    {result ? (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Your time</div>
                                    <div className="mt-1 font-mono text-3xl font-bold tabular-nums">{formatRunTime(result.seconds)}</div>
                                </div>
                                <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Mistakes</div>
                                    <div className={`mt-1 text-3xl font-bold ${result.mistakes ? "text-red-500 dark:text-red-400" : "text-emerald-500"}`}>{result.mistakes}</div>
                                </div>
                            </div>
                            {!saved && (
                                <div className="flex gap-2">
                                    <input
                                        value={name}
                                        onChange={e => { setName(e.target.value); setNotice(null) }}
                                        onKeyDown={e => { if (e.key === "Enter") handleSave() }}
                                        maxLength={24}
                                        placeholder="Choose your name..."
                                        aria-label="Your name"
                                        className="min-w-0 flex-1 border border-slate-200 bg-slate-50 px-4 py-2 outline-none transition-colors focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-[#4A5680]"
                                    />
                                    <button type="button" onClick={handleSave} disabled={!normalizePlayerName(name) || !entries || saving} className={`${primary} shrink-0 px-5 disabled:cursor-not-allowed disabled:opacity-50`}>Save</button>
                                </div>
                            )}
                            {notice && (
                                <p className={`-mt-2 text-sm font-bold ${notice === "first" || notice === "improved" ? "text-emerald-600 dark:text-emerald-400" : notice === "failed" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                                    {NOTICE[notice]}
                                </p>
                            )}
                        </>
                    ) : (
                        <div className="grid grid-cols-3 gap-1 rounded-[10px] border border-slate-200 p-1 sm:grid-cols-5 dark:border-slate-700" role="tablist" aria-label="Region">
                            {MAP_REGIONS.map(r => {
                                const selected = r.id === region
                                return (
                                    <button
                                        key={r.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={selected}
                                        onClick={() => onRegionChange(r.id)}
                                        className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 text-center ${selected ? "bg-slate-900 text-white dark:bg-white dark:text-[#0A0E1A]" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
                                    >
                                        <span className="text-sm font-semibold">{r.label}</span>
                                        <span className={`text-[11px] tabular-nums ${selected ? "text-slate-300 dark:text-slate-500" : "text-slate-400 dark:text-slate-500"}`}>{counts[r.id]}</span>
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    <section>
                        <h3 className="mb-2 !text-base font-bold">{regionLabel} leaderboard</h3>
                        {entries === null ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
                        ) : entries.length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">No records yet. Be the first.</p>
                        ) : (
                            <ol className="divide-y divide-slate-200 dark:divide-slate-700">
                                {entries.slice(0, 20).map((entry, idx) => (
                                    <li key={entry.playerId} className={`flex items-center justify-between gap-3 py-2 ${entry.playerId === playerId ? "-mx-2 rounded-md bg-blue-500/10 px-2" : ""}`}>
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className={`flex w-8 shrink-0 items-center gap-0.5 text-xs font-bold tabular-nums ${idx < 3 ? rankColor[idx] : "text-slate-400 dark:text-slate-500"}`}>
                                                {idx < 3 ? <Medal size={14} aria-hidden /> : "#"}{idx + 1}
                                            </span>
                                            <span className="truncate font-semibold">{entry.name}</span>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-3">
                                            <span className="flex items-center gap-0.5 text-xs font-semibold text-red-500 dark:text-red-400" title="Mistakes">
                                                <X size={12} strokeWidth={3} aria-hidden /> {entry.mistakes}
                                            </span>
                                            <span className="font-mono font-bold tabular-nums">{formatRunTime(entry.bestTimeSeconds)}</span>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 p-5 sm:flex-row sm:p-6 dark:border-slate-700">
                    {result ? (
                        <>
                            <button type="button" onClick={() => onStart(result.region)} className={`${primary} flex flex-1 items-center justify-center gap-2 py-3.5`}><Repeat size={18} aria-hidden /> Run again</button>
                            <button type="button" onClick={onClose} className={`${quiet} flex-1 py-3.5`}>Change region</button>
                        </>
                    ) : (
                        <button type="button" onClick={() => onStart(region)} className={`${primary} flex w-full items-center justify-center gap-2 py-3.5`}><Timer size={18} aria-hidden /> Start {regionLabel}</button>
                    )}
                </div>
            </div>
        </motion.div>
    )
}
