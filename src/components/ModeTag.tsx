/**
 * The short coloured labels beside a mode's name - on the home screen and in
 * the Science hub alike, so a colour means the same thing everywhere:
 *
 * - new       green  - recently added
 * - daily     amber  - a new puzzle or budget every day
 * - speedrun  rose   - a time on a global leaderboard
 * - live      violet - played with other people in real time
 *
 * A single-player game carries no kind tag; leaving it off keeps the lists
 * quiet. A new kind gets its own colour here, never a reused one.
 */
export type ModeTagKind = "new" | "daily" | "speedrun" | "live"

const TAGS: Record<ModeTagKind, { label: string; tone: string }> = {
    new: { label: "New", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
    daily: { label: "Daily", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
    speedrun: { label: "Speedrun", tone: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
    live: { label: "Live", tone: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
}

export default function ModeTag({ kind }: { kind: ModeTagKind }) {
    const { label, tone } = TAGS[kind]
    return (
        <span className={`shrink-0 rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}>
            {label}
        </span>
    )
}
