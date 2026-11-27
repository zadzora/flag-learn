import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { LayoutGrid, Play } from "lucide-react"
import TopBar from "../components/TopBar"
import SiteFooter from "../components/SiteFooter"
import ExtrasCredit from "../components/ExtrasCredit"
import { EXTRA_PACKS, packProgress, type ExtraPack, type PackProgress } from "../utils/extraFlags"

/**
 * The Learn mode's Extras: flags that are not countries, in packs. Each pack
 * is an ordinary Learn deck (/play?deck=<id>) with its own progress; this page
 * only lists them. The packs come from data/extraFlags.json, so a pack the
 * generator adds shows up here on its own.
 */

const THEME_KEY = "flag-master-theme"

type Row = { pack: ExtraPack; progress: PackProgress }

const readRows = (): Row[] => EXTRA_PACKS.map(pack => ({ pack, progress: packProgress(pack) }))

function SectionHead({ title, aside }: { title: string; aside?: string }) {
    return (
        <div className="mb-4 mt-12 flex items-baseline justify-between gap-4">
            <h2 className="!text-2xl font-bold tracking-[-0.02em] sm:!text-[26px]">{title}</h2>
            {aside && <span className="text-right text-sm text-slate-500 dark:text-[#8C97B3]">{aside}</span>}
        </div>
    )
}

/**
 * The home screen's deck card: a small hand of flags, the pack, its progress.
 * Play learns the pack; Browse only shows it - many of these flags are hard,
 * and somebody may just want to look at them and read about them.
 */
function PackCard({ pack, progress }: Row) {
    const { mastered, total, sample } = progress
    return (
        <div className="group flex w-full flex-col gap-3.5 rounded-[10px] border border-slate-200 bg-white p-3.5 text-left font-normal hover:border-slate-400 dark:border-[#1C2338] dark:bg-[#0F1424] dark:hover:border-[#3A4670]">
            <Link to={`/play?deck=${pack.id}`} className="flex w-full items-center gap-4 font-normal text-inherit" tabIndex={-1} aria-hidden>
                <span className="relative h-[52px] w-[76px] shrink-0" aria-hidden>
                    {sample.map((src, i) => (
                        <img
                            key={src}
                            src={src}
                            alt=""
                            loading="lazy"
                            className="absolute h-10 w-[60px] rounded-[3px] bg-white object-cover shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-[rotate,translate] duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1.25)] [rotate:var(--r)] group-hover:[rotate:var(--hr)] group-hover:[translate:var(--hx)_var(--hy)]"
                            style={{
                                left: i * 7,
                                top: 10 - i * 4,
                                ["--r" as string]: `${[-8, -2, 5][i]}deg`,
                                ["--hr" as string]: `${[-18, -4, 12][i]}deg`,
                                ["--hx" as string]: `${[-7, 0, 9][i]}px`,
                                ["--hy" as string]: `${[2, -4, -7][i]}px`,
                            }}
                        />
                    ))}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold">{pack.title}</span>
                    {pack.group !== "country" && (
                        <span className="mt-0.5 block text-[13px] leading-5 text-slate-600 dark:text-[#A6B0C8]">{pack.detail}</span>
                    )}
                    <span className="mt-1 block text-xs text-slate-500 dark:text-[#8C97B3]">
                        {mastered} / {total} {pack.unit} mastered
                    </span>
                    <span className="mt-1.5 block h-1 rounded-sm bg-slate-200 dark:bg-[#1C2338]">
                        <span
                            className="block h-full rounded-sm bg-blue-500 dark:bg-blue-400"
                            style={{ width: `${total ? Math.max((mastered / total) * 100, mastered ? 1.5 : 0) : 0}%` }}
                        />
                    </span>
                </span>
            </Link>
            <span className="flex gap-2">
                <Link
                    to={`/play?deck=${pack.id}`}
                    aria-label={`${mastered > 0 ? "Continue" : "Play"}: ${pack.title}`}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
                >
                    <Play size={15} aria-hidden /> {mastered > 0 ? "Continue" : "Play"}
                </Link>
                <Link
                    to={`/extras/${pack.id}`}
                    aria-label={`Browse all: ${pack.title}`}
                    className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900 dark:border-[#2A3350] dark:text-[#C9D1E4] dark:hover:border-[#3A4670] dark:hover:text-white"
                >
                    <LayoutGrid size={15} aria-hidden /> Browse
                </Link>
            </span>
        </div>
    )
}

export default function Extras() {
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window === "undefined") return "dark"
        return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "dark"
    })
    const [rows] = useState(readRows)

    useEffect(() => {
        const root = document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const featured = rows.filter(r => r.pack.group !== "country")
    const countries = rows.filter(r => r.pack.group === "country")
    const flags = rows.reduce((n, r) => n + r.progress.total, 0)

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Extras" theme={theme} onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))} />

            <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-16 sm:px-6">
                <div className="mt-10 max-w-[560px]">
                    <h1 className="!text-[clamp(2rem,4vw,2.75rem)] font-extrabold !leading-[1.05] !tracking-[-0.03em]">Extras</h1>
                    <p className="mt-3 text-[15px] text-slate-500 dark:text-[#8C97B3]">
                        {flags} more flags, beyond the countries: overseas territories and breakaway
                        states, countries that no longer exist, and every region of a country. Same
                        spaced repetition as the main decks, each pack on its own - or browse a pack
                        just to look at its flags and read about them.
                    </p>
                </div>

                <SectionHead title="Regions and history" />
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {featured.map(r => <li key={r.pack.id}><PackCard {...r} /></li>)}
                </ul>

                {countries.length > 0 && (
                    <>
                        <SectionHead title="Country packs" aside="Every region of one country" />
                        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {countries.map(r => <li key={r.pack.id}><PackCard {...r} /></li>)}
                        </ul>
                    </>
                )}
            </main>

            <SiteFooter about={<ExtrasCredit />} />
        </div>
    )
}
