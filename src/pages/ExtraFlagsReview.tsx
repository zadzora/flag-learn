import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, ArrowRight, Check, ClipboardCopy, ExternalLink, Flag, RotateCcw } from "lucide-react"
import { EXTRA_PACKS, type ExtraFlag, type ExtraPack } from "../utils/extraFlags"
import sources from "../../data/extraFlags.sources.json"

/**
 * Dev only (/dev/extra-flags, `npm run dev`): every Extras flag, one at a time,
 * with what the game will accept for it and where the file came from. Verdicts
 * stay in this browser (`extra-flags-review-v1`); "Copy problems" puts the
 * flagged ones on the clipboard as a list to paste to Claude, who fixes them in
 * scripts/gen-extra-flags.mjs (never in the JSON).
 *
 * Keys: ← → move, K (or Enter) marks OK and moves on, P marks a problem and
 * focuses the note, U clears the verdict.
 */

type Verdict = { ok: boolean; note?: string }
type Item = { pack: ExtraPack; flag: ExtraFlag }
type Show = "all" | "todo" | "problems"

const KEY = "extra-flags-review-v1"
const SOURCES = sources as Record<string, { file: string; source: string; licence: string }>

function readVerdicts(): Record<string, Verdict> {
    try {
        return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Verdict>
    } catch {
        return {}
    }
}

function saveVerdicts(v: Record<string, Verdict>) {
    try {
        localStorage.setItem(KEY, JSON.stringify(v))
    } catch {
        // A full or blocked storage only loses the verdicts of this session.
    }
}

const ALL: Item[] = EXTRA_PACKS.flatMap(pack => pack.flags.map(flag => ({ pack, flag })))

export default function ExtraFlagsReview() {
    const [packId, setPackId] = useState<string>("all")
    const [show, setShow] = useState<Show>("all")
    const [verdicts, setVerdicts] = useState(readVerdicts)
    const [code, setCode] = useState<string>(ALL[0]?.flag.code ?? "")
    const [copied, setCopied] = useState(false)

    const list = useMemo(() => ALL.filter(({ pack, flag }) => {
        if (packId !== "all" && pack.id !== packId) return false
        const v = verdicts[flag.code]
        if (show === "todo") return !v || flag.code === code
        if (show === "problems") return (v && !v.ok) || flag.code === code
        return true
    }), [packId, show, verdicts, code])

    const index = Math.max(0, list.findIndex(i => i.flag.code === code))
    const item = list[index]
    const verdict = item ? verdicts[item.flag.code] : undefined
    const problems = ALL.filter(i => verdicts[i.flag.code] && !verdicts[i.flag.code].ok)
    const done = ALL.filter(i => verdicts[i.flag.code]).length

    function go(step: number) {
        const next = list[Math.min(list.length - 1, Math.max(0, index + step))]
        if (next) setCode(next.flag.code)
    }

    function mark(v: Verdict | null) {
        if (!item) return
        const next = { ...verdicts }
        if (v) next[item.flag.code] = v
        else delete next[item.flag.code]
        setVerdicts(next)
        saveVerdicts(next)
    }

    function markOk() {
        mark({ ok: true })
        go(1)
    }

    function markProblem() {
        mark({ ok: false, note: verdict?.note ?? "" })
        setTimeout(() => document.getElementById("review-note")?.focus(), 0)
    }

    function setNote(note: string) {
        mark({ ok: false, note })
    }

    async function copyProblems() {
        const lines = problems.map(({ pack, flag }) =>
            `- ${flag.code.toUpperCase()} ${flag.name[0]} (${pack.id}): ${verdicts[flag.code].note?.trim() || "?"}`)
        await navigator.clipboard.writeText(`Extras: oprav tieto vlajky\n${lines.join("\n")}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.target as HTMLElement).closest("textarea, input, select")) return
            if (e.key === "ArrowRight") go(1)
            else if (e.key === "ArrowLeft") go(-1)
            else if (e.key === "k" || e.key === "K" || e.key === "Enter") markOk()
            else if (e.key === "p" || e.key === "P") { e.preventDefault(); markProblem() }
            else if (e.key === "u" || e.key === "U") mark(null)
            else return
            e.preventDefault()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    })

    const source = item ? SOURCES[item.flag.code] : undefined
    const chip = (on: boolean) =>
        `rounded-md px-2.5 py-1 text-sm font-semibold ${on ? "bg-slate-900 text-white dark:bg-white dark:text-[#0A0E1A]" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`

    return (
        <div className="min-h-screen bg-[#F4F6FB] px-4 py-6 text-slate-900 dark:bg-[#0A0E1A] dark:text-[#E8ECF6]">
            <div className="mx-auto max-w-5xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-amber-600">Dev only</div>
                        <h1 className="!text-2xl font-bold">Extras review</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {done} / {ALL.length} checked · {problems.length} problems · ← → move · K ok · P problem · U clear
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={copyProblems} disabled={!problems.length} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-[#0A0E1A]">
                            <ClipboardCopy size={16} aria-hidden /> {copied ? "Copied" : `Copy problems (${problems.length})`}
                        </button>
                        <Link to="/extras" className="text-sm font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400">/extras</Link>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1">
                    <button type="button" className={chip(packId === "all")} onClick={() => setPackId("all")}>All</button>
                    {EXTRA_PACKS.map(p => (
                        <button key={p.id} type="button" className={chip(packId === p.id)} onClick={() => { setPackId(p.id); setCode(p.flags[0].code) }}>
                            {p.title} <span className="font-normal opacity-60">{p.flags.length}</span>
                        </button>
                    ))}
                    <span className="mx-2 h-5 w-px bg-slate-300 dark:bg-slate-700" />
                    {(["all", "todo", "problems"] as const).map(s => (
                        <button key={s} type="button" className={chip(show === s)} onClick={() => setShow(s)}>
                            {s === "all" ? "Every flag" : s === "todo" ? "Unchecked" : "Problems"}
                        </button>
                    ))}
                </div>

                {item ? (
                    <div className="mt-5 grid gap-5 md:grid-cols-[1fr_320px]">
                        <div className="rounded-[10px] border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
                            <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                                <span>{item.pack.title} · {index + 1} / {list.length}</span>
                                <span>difficulty {item.flag.difficulty}</span>
                            </div>
                            {/* The flag on light and on dark: a white flag with no border vanishes on one of them. */}
                            <div className="mt-4 grid grid-cols-[2fr_1fr] gap-3">
                                <div className="flex h-64 items-center justify-center rounded-lg bg-slate-100 p-4">
                                    <img src={item.flag.image} alt="" className="max-h-full max-w-full object-contain shadow-[0_2px_10px_rgba(10,14,26,0.18)]" />
                                </div>
                                <div className="flex h-64 flex-col gap-3">
                                    <div className="flex flex-1 items-center justify-center rounded-lg bg-[#0A0E1A] p-3">
                                        <img src={item.flag.image} alt="" className="max-h-full max-w-full object-contain" />
                                    </div>
                                    <div className="flex flex-1 items-center justify-center rounded-lg bg-slate-100 p-3">
                                        {/* The size the home and the collection show it at. */}
                                        <img src={item.flag.image} alt="" className="h-10 w-[60px] rounded-[3px] object-cover shadow" />
                                    </div>
                                </div>
                            </div>

                            <h2 className="mt-5 !text-2xl font-bold">
                                {item.flag.name[0]}
                                {item.flag.years && <span className="ml-2 text-base font-semibold text-slate-400">{item.flag.years.map(y => y ?? "?").join("–")}</span>}
                            </h2>
                            {item.flag.info && <p className="mt-1 text-slate-600 dark:text-slate-300">{item.flag.info}</p>}
                            <div className="mt-3 text-sm">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                    Accepted answers <span className="font-normal normal-case tracking-normal">- case and accents are ignored (Sao Paulo = São Paulo)</span>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                    {item.flag.name.map(n => <span key={n} className="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-700">{n}</span>)}
                                </div>
                            </div>
                            {source && (
                                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                                    <a href={source.source} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline">Commons: {source.file} <ExternalLink size={13} aria-hidden /></a>
                                    <span>{source.licence}</span>
                                    <a href={`https://www.wikidata.org/wiki/${item.flag.code.toUpperCase()}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline">{item.flag.code.toUpperCase()} <ExternalLink size={13} aria-hidden /></a>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-3">
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => go(-1)} className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-2.5 font-semibold dark:border-slate-700 dark:bg-slate-800"><ArrowLeft size={16} aria-hidden /> Prev</button>
                                <button type="button" onClick={() => go(1)} className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-2.5 font-semibold dark:border-slate-700 dark:bg-slate-800">Next <ArrowRight size={16} aria-hidden /></button>
                            </div>
                            <button type="button" onClick={markOk} className={`flex items-center justify-center gap-2 rounded-lg py-3 font-bold ${verdict?.ok ? "bg-emerald-600 text-white" : "border border-emerald-500 text-emerald-700 dark:text-emerald-300"}`}>
                                <Check size={18} aria-hidden /> OK <span className="text-xs font-normal opacity-70">K</span>
                            </button>
                            <button type="button" onClick={markProblem} className={`flex items-center justify-center gap-2 rounded-lg py-3 font-bold ${verdict && !verdict.ok ? "bg-red-600 text-white" : "border border-red-500 text-red-700 dark:text-red-300"}`}>
                                <Flag size={18} aria-hidden /> Problem <span className="text-xs font-normal opacity-70">P</span>
                            </button>
                            {verdict && !verdict.ok && (
                                <textarea
                                    id="review-note"
                                    value={verdict.note ?? ""}
                                    onChange={e => setNote(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur() }}
                                    placeholder="What is wrong? (wrong flag, wrong name, missing answer, remove it...) - Esc to leave"
                                    rows={4}
                                    className="rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                                />
                            )}
                            {verdict && (
                                <button type="button" onClick={() => mark(null)} className="flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400">
                                    <RotateCcw size={14} aria-hidden /> Clear verdict <span className="text-xs opacity-70">U</span>
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <p className="mt-8 text-slate-500">Nothing here - every flag in this view is checked.</p>
                )}

                {/* Every flag of the view: green checked, red a problem, plain unchecked. */}
                <div className="mt-6 grid grid-cols-6 gap-2 sm:grid-cols-10 lg:grid-cols-12">
                    {list.map(({ flag }) => {
                        const v = verdicts[flag.code]
                        return (
                            <button
                                key={flag.code}
                                type="button"
                                title={flag.name[0]}
                                onClick={() => setCode(flag.code)}
                                className={`min-h-0 overflow-hidden rounded p-0 ring-2 ${flag.code === code ? "ring-blue-500" : v ? (v.ok ? "ring-emerald-500/70" : "ring-red-500") : "ring-transparent"}`}
                            >
                                <img src={flag.image} alt={flag.name[0]} loading="lazy" className="aspect-[3/2] w-full bg-slate-100 object-cover" />
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
