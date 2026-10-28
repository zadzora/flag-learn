import { RANKS, TIER_FRAMES } from "../utils/achievements"

/*
 * Geometry of the sprites cut by scripts/gen-badge-sprites.py: every frame is a
 * 192px square whose medal ring spans the middle ~71% and whose cream disc is
 * 44% wide, centred. The frame is drawn larger than the box so the ring itself
 * fills it; whatever hangs off the ring (a star, a ribbon) overflows on purpose.
 */
const FRAME_SCALE = 1.4
/** The emblem's share of the box - it sits inside the disc with a little air round it. */
const EMBLEM_SCALE = 0.54

type MedalProps = {
    /** Track id - also the emblem's file name. */
    id: string
    /** 0 = locked, 1-4 = bronze to platinum, 5 = the navy "special" frame. */
    tier: number
    size: number
    className?: string
}

/** A badge: the tier's frame with the track's emblem on its disc. Locked shows the emblem faded, so the goal is visible. */
export function BadgeMedal({ id, tier, size, className = "" }: MedalProps) {
    const frame = tier === 5 ? "frame-special" : TIER_FRAMES[Math.max(0, Math.min(4, tier))]
    const frameSize = size * FRAME_SCALE
    const emblemSize = size * EMBLEM_SCALE
    return (
        <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden>
            <img
                src={`/badges/${frame}.webp`}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none select-none"
                style={{ width: frameSize, height: frameSize, left: (size - frameSize) / 2, top: (size - frameSize) / 2 }}
            />
            <img
                src={`/badges/${id}.webp`}
                alt=""
                draggable={false}
                className={`pointer-events-none absolute max-w-none select-none ${tier === 0 ? "opacity-40 grayscale" : ""}`}
                style={{ width: emblemSize, height: emblemSize, left: (size - emblemSize) / 2, top: (size - emblemSize) / 2 }}
            />
        </span>
    )
}

/** The rank insignia: 0 (unranked) to 7 (Atlas). */
export function RankShield({ rank, size, className = "" }: { rank: number; size: number; className?: string }) {
    const r = Math.max(0, Math.min(RANKS.length - 1, rank))
    return (
        <img
            src={`/badges/rank-${r}.webp`}
            alt={RANKS[r].name}
            draggable={false}
            className={`shrink-0 select-none ${className}`}
            style={{ width: size, height: size }}
        />
    )
}
