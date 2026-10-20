import { motion } from "framer-motion"
import { BarChart3, Users } from "lucide-react"
import type { ReactNode } from "react"
import type { DailyDistribution, DailyStanding as Standing } from "../utils/dailyStats"

type Props = {
    /** Live global distribution, or null while it is still loading. */
    distribution: DailyDistribution | null
    standing: Standing | null
    statsError: boolean
    /** This player's 1-based bucket, or null when they did not finish/solve. */
    myBucket: number | null
    /** One label per success bucket, best first. The failure row is added after. */
    bucketLabels: string[]
    /** Tailwind classes for the big "Top X%" number - each mode has its own hue. */
    accentClass: string
    /** What the bucket axis means, e.g. "Guesses used - X did not solve it". */
    footnote?: string
    /** Wording for the share of players who did not land in the failure bucket. */
    solvedWord?: string
    /** Label of the failure row; null leaves it out, for a mode nobody can fail. */
    failLabel?: string | null
    /** Thinner rows and a wider label column, for a long axis inside a dialog. */
    compact?: boolean
    /** Shown above the bars - e.g. the day's best time - and to the first player too. */
    record?: ReactNode
}

/**
 * "Today's Standing" panel: where this result lands among everyone who played
 * today. Shared by every daily mode so the three of them stay in step.
 */
export default function DailyStanding({
    distribution,
    standing,
    statsError,
    myBucket,
    bucketLabels,
    accentClass,
    footnote,
    solvedWord = "solved it",
    failLabel = "X",
    compact = false,
    record,
}: Props) {
    const maxBucketCount = distribution
        ? Math.max(...distribution.solved, failLabel === null ? 0 : distribution.failed, 1)
        : 0

    const rows = distribution
        ? [
              ...bucketLabels.map((label, i) => ({
                  key: `g${i + 1}`,
                  label,
                  count: distribution.solved[i] ?? 0,
                  isMine: myBucket === i + 1,
                  won: true,
              })),
              ...(failLabel === null
                  ? []
                  : [{
                        key: "fail",
                        label: failLabel,
                        count: distribution.failed,
                        isMine: myBucket === null,
                        won: false,
                    }]),
          ]
        : []

    return (
        <div className={`w-full rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 ${compact ? "p-4" : "p-5"}`}>
            <h3 className={`flex items-center gap-2 !text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${compact ? "mb-2" : "mb-4"}`}>
                <BarChart3 size={14} aria-hidden /> Today&apos;s Standing
            </h3>

            {statsError ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Global stats are unavailable right now.
                </p>
            ) : !distribution ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Loading today&apos;s results...
                </p>
            ) : !standing || distribution.total < 2 ? (
                <>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        You are the first player today - come back later to see how you compare.
                    </p>
                    {record && <div className="mt-3">{record}</div>}
                </>
            ) : (
                <>
                    <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                        <span className={`${compact ? "text-3xl" : "text-4xl"} font-extrabold tracking-[-0.02em] ${accentClass}`}>Top {standing.topPercent}%</span>
                        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">of today&apos;s players</span>
                    </div>
                    <p className={`text-sm text-slate-500 dark:text-slate-400 ${compact ? "mb-2" : "mb-4"}`}>
                        You finished ahead of{" "}
                        <strong className="text-slate-900 dark:text-white">{standing.beatPercent}%</strong> of them
                        {standing.tiedCount > 1 && <> - {standing.tiedCount} players got the same result</>}.
                    </p>

                    <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${compact ? "mb-2" : "mb-4"}`}>
                        <span className="flex items-center gap-1.5">
                            <Users size={13} aria-hidden /> {distribution.total} {distribution.total === 1 ? "player" : "players"} today
                        </span>
                        <span>
                            {Math.round(standing.solveRate * 100)}% {solvedWord}
                        </span>
                    </div>

                    {record && <div className={compact ? "mb-2" : "mb-3"}>{record}</div>}

                    <div className={`flex flex-col ${compact ? "gap-1" : "gap-1.5"}`}>
                        {rows.map(row => (
                            <div key={row.key} className="flex items-center gap-2">
                                <span
                                    className={`shrink-0 text-center font-bold tabular-nums ${compact ? "w-12 whitespace-nowrap text-[11px]" : "w-9 text-xs"} ${
                                        row.isMine ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500"
                                    }`}
                                >
                                    {row.label}
                                </span>
                                <div className={`${compact ? "h-4" : "h-5"} flex-1 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-900`}>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{
                                            width: `${Math.max(row.count > 0 ? 8 : 0, (row.count / maxBucketCount) * 100)}%`,
                                        }}
                                        transition={{ duration: 0.5, ease: "easeOut" }}
                                        className={`flex h-full items-center justify-end rounded-sm text-[10px] font-bold ${row.count > 0 ? "pr-2" : ""} ${
                                            row.isMine
                                                ? row.won
                                                    ? "bg-emerald-500 text-white"
                                                    : "bg-red-500 text-white"
                                                : "bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                                        }`}
                                    >
                                        {row.count > 0 && row.count}
                                    </motion.div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {footnote && (
                        <p className={`text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${compact ? "mt-2" : "mt-3"}`}>{footnote}</p>
                    )}
                </>
            )}
        </div>
    )
}
