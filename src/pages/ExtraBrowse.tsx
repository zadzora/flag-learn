import { useEffect, useMemo, useState } from "react"
import { Link, Navigate, useParams } from "react-router-dom"
import { Check, ChevronLeft, ChevronRight, Play, Search } from "lucide-react"
import TopBar from "../components/TopBar"
import SiteFooter from "../components/SiteFooter"
import ExtrasCredit from "../components/ExtrasCredit"
import Overlay from "../components/Overlay"
import { extraPack, masteredCodes, packPhrase, type ExtraFlag, type ExtraPack } from "../utils/extraFlags"
import { normalizeAnswer } from "../utils/textAnswerMatch"

/**
 * Every flag of one Extras pack, to look at and read about - no questions, no
 * progress. Play (/play?deck=<id>) is for learning them; many of these flags are
 * hard, and somebody may only want to see them. Learned ones carry a tick.
 */

const THEME_KEY = "flag-master-theme"

type Sort = "az" | "known" | "year"

const yearsOf = (flag: ExtraFlag) => flag.years?.map(y => y ?? "?").join("–")

function sorted(flags: ExtraFlag[], sort: Sort): ExtraFlag[] {
    // The data is ordered best known first, which is what "known" means.
    if (sort === "known") return flags
    const list = [...flags]
    if (sort === "year") return list.sort((a, b) => (a.years?.[0] ?? 9999) - (b.years?.[0] ?? 9999) || a.name[0].localeCompare(b.name[0]))
    return list.sort((a, b) => a.name[0].localeCompare(b.name[0]))
}

/** The flag in a fixed frame, whole - a crop would cut off the arms of half these flags. */
function FlagFrame({ flag, large = false }: { flag: ExtraFlag; large?: boolean }) {
    return (
        <span className={`flex items-center justify-center rounded-md bg-slate-100 dark:bg-[#141A2E] ${large ? "aspect-[3/2] p-4" : "aspect-[3/2] p-2.5"}`}>
            <img
                src={flag.image}
                alt={large ? `Flag of ${flag.name[0]}` : ""}
                loading={large ? "eager" : "lazy"}
                className="max-h-full max-w-full object-contain shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
            />
        </span>
    )
}

function FlagSheet({ flag, pack, learned, onClose, onStep }: {
    flag: ExtraFlag
    pack: ExtraPack
    learned: boolean
    onClose: () => void
    onStep: (by: number) => void
}) {
    const others = flag.name.slice(1)
    const stepClass = "flex h-9 min-h-0 w-9 items-center justify-center rounded-lg border border-slate-200 p-0 text-slate-500 hover:text-slate-900 dark:border-[#1C2338] dark:text-slate-400 dark:hover:text-white"
    return (
        <Overlay onClose={onClose} label={flag.name[0]}>
            <div className="pr-8">
                <h2 className="!text-xl font-bold">
                    {flag.name[0]}
                    {flag.years && <span className="ml-2 text-base font-semibold text-slate-400">{yearsOf(flag)}</span>}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-[#8C97B3]">
                    {pack.title}
                    {learned && <span className="ml-2 inline-flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400"><Check size={12} aria-hidden /> Learned</span>}
                </p>
            </div>
            <div className="mt-4"><FlagFrame flag={flag} large /></div>
            {flag.info && <p className="mt-4 text-[15px] leading-6 text-slate-700 dark:text-slate-200">{flag.info}</p>}
            {others.length > 0 && (
                <p className="mt-3 text-sm text-slate-500 dark:text-[#8C97B3]">
                    <span className="font-semibold">Also called</span> {others.join(", ")}
                </p>
            )}
            <div className="mt-5 flex items-center justify-between">
                <button type="button" onClick={() => onStep(-1)} aria-label="Previous flag" className={stepClass}><ChevronLeft size={18} aria-hidden /></button>
                <span className="text-xs text-slate-400">← → to move</span>
                <button type="button" onClick={() => onStep(1)} aria-label="Next flag" className={stepClass}><ChevronRight size={18} aria-hidden /></button>
            </div>
        </Overlay>
    )
}

export default function ExtraBrowse() {
    const { id } = useParams()
    const pack = extraPack(id)
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window === "undefined") return "dark"
        return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "dark"
    })
    const [learned] = useState(() => (pack ? masteredCodes(pack) : new Set<string>()))
    const [query, setQuery] = useState("")
    const [sort, setSort] = useState<Sort>("az")
    const [open, setOpen] = useState<string | null>(null)

    useEffect(() => {
        const root = document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const shown = useMemo(() => {
        if (!pack) return []
        const q = normalizeAnswer(query)
        const hits = q ? pack.flags.filter(f => f.name.some(n => normalizeAnswer(n).includes(q))) : pack.flags
        return sorted(hits, sort)
    }, [pack, query, sort])

    const index = shown.findIndex(f => f.code === open)
    const step = (by: number) => {
        if (index < 0 || !shown.length) return
        setOpen(shown[(index + by + shown.length) % shown.length].code)
    }

    useEffect(() => {
        if (index < 0) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault()
                const next = shown[(index + (e.key === "ArrowLeft" ? -1 : 1) + shown.length) % shown.length]
                setOpen(next.code)
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [index, shown])

    if (!pack) return <Navigate to="/extras" replace />

    const sorts: { key: Sort; label: string }[] = [
        { key: "az", label: "A–Z" },
        { key: "known", label: "Best known" },
        ...(pack.group === "historical" ? [{ key: "year" as const, label: "By year" }] : []),
    ]
    const current = index >= 0 ? shown[index] : null

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Extras" back="/extras" theme={theme} onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))} />

            <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-16 sm:px-6">
                <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
                    <div className="max-w-[560px]">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Extras · Browse</div>
                        <h1 className="!text-[clamp(2rem,4vw,2.75rem)] font-extrabold !leading-[1.05] !tracking-[-0.03em]">{pack.title}</h1>
                        <p className="mt-3 text-[15px] text-slate-500 dark:text-[#8C97B3]">
                            All {pack.flags.length} {packPhrase(pack)}, to look through at your own pace. Nothing here is a
                            question - Play is where you learn them.
                        </p>
                    </div>
                    <Link
                        to={`/play?deck=${pack.id}`}
                        className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
                    >
                        <Play size={15} aria-hidden /> {learned.size > 0 ? "Continue learning" : "Learn this pack"}
                    </Link>
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <label className="relative flex-1">
                        <span className="sr-only">Search</span>
                        <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder={`Search ${pack.flags.length} ${pack.unit}...`}
                            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-[15px] outline-none focus:border-slate-400 dark:border-[#1C2338] dark:bg-[#0F1424] dark:focus:border-[#3A4670]"
                        />
                    </label>
                    <div className="flex gap-1 rounded-[10px] border border-slate-200 bg-white p-1 dark:border-[#1C2338] dark:bg-[#0F1424]" role="radiogroup" aria-label="Sort">
                        {sorts.map(s => (
                            <button
                                key={s.key}
                                type="button"
                                role="radio"
                                aria-checked={sort === s.key}
                                onClick={() => setSort(s.key)}
                                className={`min-h-0 flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold ${sort === s.key
                                    ? "bg-slate-900 text-white dark:bg-white dark:text-[#0A0E1A]"
                                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"}`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>

                {shown.length === 0 ? (
                    <p className="mt-10 text-center text-slate-500 dark:text-[#8C97B3]">Nothing in this pack matches "{query}".</p>
                ) : (
                    <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {shown.map(flag => (
                            <li key={flag.code}>
                                <button
                                    type="button"
                                    onClick={() => setOpen(flag.code)}
                                    className="flex h-full min-h-0 w-full flex-col gap-2.5 rounded-[10px] border border-slate-200 bg-white p-2.5 text-left font-normal hover:border-slate-400 dark:border-[#1C2338] dark:bg-[#0F1424] dark:hover:border-[#3A4670]"
                                >
                                    <FlagFrame flag={flag} />
                                    <span className="min-w-0 px-0.5">
                                        <span className="flex items-start gap-1">
                                            <span className="min-w-0 flex-1 text-sm font-bold leading-5">{flag.name[0]}</span>
                                            {learned.has(flag.code) && (
                                                <Check size={14} aria-label="Learned" className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                            )}
                                        </span>
                                        {flag.years && <span className="block text-xs text-slate-400">{yearsOf(flag)}</span>}
                                        {flag.info && (
                                            <span className="mt-1 line-clamp-3 block text-xs leading-[1.1rem] text-slate-500 dark:text-[#8C97B3]">{flag.info}</span>
                                        )}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </main>

            {current && (
                <FlagSheet flag={current} pack={pack} learned={learned.has(current.code)} onClose={() => setOpen(null)} onStep={step} />
            )}

            <SiteFooter about={<ExtrasCredit />} />
        </div>
    )
}
