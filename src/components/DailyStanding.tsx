import { motion } from "framer-motion"
import { BarChart3, Users } from "lucide-react"
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
}: Props) {
    const maxBucketCount = distribution
        ? Math.max(...distribution.solved, distribution.failed, 1)
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
              {
                  key: "fail",
                  label: "X",
                  count: distribution.failed,
                  isMine: myBucket === null,
                  won: false,
              },
          ]
        : []

    return (
        <div className="w-full rounded-[10px] border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
            <h3 className="mb-4 flex items-center gap-2 !text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    You are the first player today - come back later to see how you compare.
                </p>
            ) : (
                <>
                    <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                        <span className={`text-4xl font-extrabold tracking-[-0.02em] ${accentClass}`}>Top {standing.topPercent}%</span>
                        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">of today&apos;s players</span>
                    </div>
                    <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                        You finished ahead of{" "}
                        <strong className="text-slate-900 dark:text-white">{standing.beatPercent}%</strong> of them
                        {standing.tiedCount > 1 && <> - {standing.tiedCount} players got the same result</>}.
                    </p>

                    <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        <span className="flex items-center gap-1.5">
                            <Users size={13} aria-hidden /> {distribution.total} {distribution.total === 1 ? "player" : "players"} today
                        </span>
                        <span>
                            {Math.round(standing.solveRate * 100)}% {solvedWord}
                        </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        {rows.map(row => (
                            <div key={row.key} className="flex items-center gap-2">
                                <span
                                    className={`w-9 text-center text-xs font-bold tabular-nums ${
                                        row.isMine ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500"
                                    }`}
                                >
                                    {row.label}
                                </span>
                                <div className="h-5 flex-1 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-900">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{
                                            width: `${Math.max(row.count > 0 ? 8 : 0, (row.count / maxBucketCount) * 100)}%`,
                                        }}
                                        transition={{ duration: 0.5, ease: "easeOut" }}
                                        className={`flex h-full items-center justify-end rounded-sm pr-2 text-[10px] font-bold ${
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
                        <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{footnote}</p>
                    )}
                </>
            )}
        </div>
    )
}
