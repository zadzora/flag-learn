import { useMemo } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Check } from "lucide-react"
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
            <div className="w-full flex flex-col items-center gap-2 py-2">
                <div className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    <Check size={16} strokeWidth={3} /> All of today&apos;s dailies are done
                </div>
                <Link to="/" className="text-xs font-bold text-slate-400 hover:text-indigo-500 transition-colors">
                    Back to menu
                </Link>
            </div>
        )
    }

    return (
        <Link
            to={next.to}
            className="group w-full flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm hover:border-indigo-400 dark:hover:border-indigo-500 active:scale-[0.98] transition-all"
        >
            <div className={`p-2.5 rounded-xl shrink-0 ${next.accent}`}>
                <next.icon size={22} />
            </div>
            <div className="min-w-0 flex-1 text-left">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Next daily</p>
                <p className="font-bold">{next.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{next.tagline}</p>
            </div>
            <ArrowRight
                size={20}
                className="shrink-0 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all"
            />
        </Link>
    )
}
