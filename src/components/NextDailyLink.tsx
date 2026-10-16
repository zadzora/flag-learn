import { useMemo } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Check, ChevronRight } from "lucide-react"
import { nextUnfinishedDaily, type DailyModeKey } from "../utils/dailyModes"

type Props = {
    /** The mode the player just finished. */
    current: DailyModeKey
    /** Today in UTC, YYYY-MM-DD. */
    today: string
}

/**
 * "Play the next daily" hand-off, shown once a daily mode is over. Skips
 * dailies already finished today, and turns into a done-for-today note when
 * there is nothing left to play.
 */
export default function NextDailyLink({ current, today }: Props) {
    const next = useMemo(() => nextUnfinishedDaily(current, today), [current, today])

    if (!next) {
        return (
            <div className="flex w-full flex-col items-center gap-2 py-2">
                <div className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    <Check size={16} strokeWidth={3} aria-hidden /> All of today&apos;s dailies are done
                </div>
                <Link to="/" className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                    Back to menu
                </Link>
            </div>
        )
    }

    return (
        <Link
            to={next.to}
            className="group flex w-full items-center gap-4 rounded-[10px] border border-slate-200 bg-white p-3.5 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#3A4670]"
        >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors group-hover:border-slate-400 group-hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:group-hover:border-[#4A5680] dark:group-hover:text-white">
                <next.icon size={19} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-left">
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Next daily</span>
                <span className="block text-[15px] font-semibold">{next.label}</span>
                <span className="block truncate text-[13px] text-slate-500 dark:text-slate-400">{next.tagline}</span>
            </span>
            <span className="hidden items-center gap-1 text-sm font-semibold sm:flex">
                Play <ArrowRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
            </span>
            <ChevronRight size={18} aria-hidden className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 sm:hidden dark:text-slate-500" />
        </Link>
    )
}
