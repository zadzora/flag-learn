/**
 * Border Chain - one global table that is always mid-game.
 *
 * The board shows a country; anyone at the table may claim the next link by
 * naming a country that borders it and has not been used yet. First correct
 * answer takes it, the chain moves on, and the country just named becomes the
 * one everybody is now answering from.
 *
 * It is deliberately *not* turn-based. Ten seats taking ten-second turns would
 * put ninety seconds between your go and your next one, which is unplayable for
 * somebody who just opened the page. Free-for-all keeps every player in every
 * link, and the one rule that stops a fast typist soloing the whole chain is
 * that nobody may take two links in a row.
 *
 * Empty seats are filled by bots so the table is never dead. A bot's move is a
 * pure function of the leg state (`botAttempt`), which is what makes them work
 * without a server: every browser watching computes the same bot, the same
 * country and the same moment, so whichever one actually writes it, the table
 * agrees. Nothing runs while no browser is open - the first client to arrive
 * finds an expired leg and starts a fresh one.
 */
import { seededRng, seededShuffle } from "./dailySeed"
import { countryByCode } from "./countryPool"
import { TERRITORY_CODES, neighboursOf, isTerritory, colorForPlayer } from "./flagWars"
import { resolveTextAnswer } from "./textAnswerMatch"

/** Seats at the table. Bots fill whatever the humans present leave empty. */
export const TABLE_SEATS = 10

/**
 * How long a link may go unanswered before the chain breaks. This is also the
 * dead-end intermission: when the current country has no unused neighbours
 * nobody *can* answer, so the leg simply runs out its clock while the recap is
 * on screen. The rules cannot tell a dead end from a hard country - that needs
 * the neighbour graph - so one timer has to serve for both.
 */
export const LINK_MS = 22_000

/** A leg is capped so the chain string, and the recap, stay a sane size. */
export const MAX_LINKS = 80

/** A wrong guess locks the player out this long, so guessing cannot be spammed. */
export const WRONG_LOCKOUT_MS = 2_000

/** A non-conductor waits this long before covering a bot move the conductor missed. */
export const CONDUCTOR_GRACE_MS = 1_500

/** Presence older than this is treated as gone, in case onDisconnect never fired. */
export const PRESENCE_TTL_MS = 90_000

/** How often a client refreshes its own presence row. */
export const PRESENCE_PING_MS = 40_000

/** Highest points a single link can be worth. Mirrored in the database rules. */
export const MAX_MOVE_POINTS = 40

/** A link taken this long after the previous one earns no speed bonus at all. */
const SPEED_FADE_MS = 12_000

// --- The leg -----------------------------------------------------------------

/** One claimed link. Stored under `borderChain/moves/<legId>/<seq>`. */
export type ChainMove = {
    /** Its own index, because a database key is a string and the rules compare numbers. */
    i: number
    /** Country code claimed. */
    c: string
    /** Player uid, or a `bot_` id. */
    by: string
    /** Display name at the time, so the recap survives a rename. */
    n: string
    p: number
}

/**
 * The live chain. Everything a client needs to draw the table is here; the
 * per-link scoreboard is assembled from the separate `moves` node.
 *
 * `chain` is a comma-delimited string rather than a list, and that is not a
 * space optimisation: it is the only shape the database rules can actually
 * police. `newChain === oldChain + code + ','` proves the write only appends,
 * and `!oldChain.contains(',' + code + ',')` proves the country is new - both
 * out of reach for a list, whose indices the rules cannot address.
 */
export type Leg = {
    id: string
    /** Links claimed so far. The starting country is not a link. */
    seq: number
    current: string
    /** `,de,fr,es,` - leading and trailing commas so `contains` cannot half-match. */
    chain: string
    startedAt: number
    lastMoveAt: number
    /** Who took the last link; they may not take the next one. Empty on a fresh leg. */
    lastBy: string
    lastName: string
}

export type PresenceRow = { name: string; color: number; at: number }
export type PresenceMap = Record<string, PresenceRow>
export type MoveMap = Record<string, ChainMove>

export type ChainRecord = {
    length: number
    legId: string
    at: number
    /** Who took the last link of the record chain - the one who carried it home. */
    by: string
}

export function decodeChain(chain: string): string[] {
    return (chain || "").split(",").filter(Boolean)
}

export function usedSet(leg: Leg | null): Set<string> {
    return new Set(leg ? decodeChain(leg.chain) : [])
}

/** Neighbours of the current country that are still free - the legal answers. */
export function optionsFor(leg: Leg | null): string[] {
    if (!leg) return []
    const used = usedSet(leg)
    return neighboursOf(leg.current)
        .filter(code => isTerritory(code) && !used.has(code))
        .sort()
}

/** True when nobody can answer: every neighbour is already in the chain. */
export function isDeadEnd(leg: Leg | null): boolean {
    return !!leg && optionsFor(leg).length === 0
}

export function legDeadline(leg: Leg | null): number {
    return leg ? leg.lastMoveAt + LINK_MS : 0
}

export function legIsOver(leg: Leg | null, now: number): boolean {
    return !leg || now > legDeadline(leg) || leg.seq >= MAX_LINKS
}

/**
 * An obscure link is worth more than an obvious one and a fast one more than a
 * slow one, so steering the chain into hard country is a way to score rather
 * than a handicap.
 */
export function pointsFor(code: string, elapsedMs: number): number {
    const difficulty = countryByCode(code)?.difficulty ?? 2
    const knowledge = 6 + difficulty * 3
    const speed = Math.round(12 * Math.max(0, 1 - elapsedMs / SPEED_FADE_MS))
    return Math.max(1, Math.min(MAX_MOVE_POINTS, knowledge + speed))
}

function makeLegId(): string {
    return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Where a fresh chain begins. Well-connected and widely known, because a leg
 * that opens on a country with three obscure neighbours is over before anyone
 * has finished reading the page.
 */
function startingCountry(legId: string): string {
    const rng = seededRng(`start:${legId}`)
    const openers = TERRITORY_CODES.filter(code => {
        const entry = countryByCode(code)
        return neighboursOf(code).length >= 5 && (entry?.difficulty ?? 3) <= 1
    })
    const pool = openers.length ? openers : TERRITORY_CODES
    return pool[Math.floor(rng() * pool.length)]
}

/**
 * A brand new leg. `startedAt` and `lastMoveAt` are placeholders - the caller
 * replaces them with `serverTimestamp()`, because the rules pin both to `now`
 * and a client clock is not something the database will take on trust.
 */
export function openLeg(previousId?: string): Leg {
    let id = makeLegId()
    while (id === previousId) id = makeLegId()
    const start = startingCountry(id)
    return {
        id,
        seq: 0,
        current: start,
        chain: `,${start},`,
        startedAt: 0,
        lastMoveAt: 0,
        lastBy: "",
        lastName: "",
    }
}

/** The leg as it looks after `code` is claimed. Timestamps are the caller's job. */
export function extendLeg(leg: Leg, code: string, by: string, name: string): Leg {
    return {
        id: leg.id,
        seq: leg.seq + 1,
        current: code,
        chain: `${leg.chain}${code},`,
        startedAt: leg.startedAt,
        lastMoveAt: 0,
        lastBy: by,
        lastName: name,
    }
}

// --- Judging what somebody typed ---------------------------------------------

export type Attempt =
    /** A legal link. */
    | { kind: "link"; code: string }
    /** A real country, already somewhere in this chain. */
    | { kind: "used"; code: string }
    /** A real country that does not border the current one. */
    | { kind: "far"; code: string }
    /** Nearly a country - not counted either way, so it costs no lockout. */
    | { kind: "typo"; code: string }
    | { kind: "unknown" }

/**
 * Told apart deliberately: "already in the chain" and "does not border Peru"
 * are completely different mistakes, and a single "wrong" for both teaches
 * nothing. A typo is neither - it costs no lockout, matching every other mode.
 */
export function judge(input: string, leg: Leg | null): Attempt {
    if (!leg || !input.trim()) return { kind: "unknown" }

    let typo: string | null = null
    for (const code of TERRITORY_CODES) {
        const entry = countryByCode(code)
        if (!entry) continue
        const match = resolveTextAnswer(input, entry.names)
        if (match === "exact") {
            if (neighboursOf(leg.current).includes(code)) {
                return usedSet(leg).has(code) ? { kind: "used", code } : { kind: "link", code }
            }
            return { kind: "far", code }
        }
        if (match === "close" && !typo) typo = code
    }
    return typo ? { kind: "typo", code: typo } : { kind: "unknown" }
}

// --- Bots --------------------------------------------------------------------

export type Bot = {
    /** Always `bot_`-prefixed; the rules use that prefix to allow a proxy write. */
    id: string
    name: string
    /** 0..1. Drives both what it knows and how fast it answers. */
    skill: number
    color: number
}

/**
 * Named after people who actually had to work the borders out. More of them
 * than there are seats, so the line-up changes from leg to leg.
 */
export const BOT_ROSTER: Bot[] = [
    { id: "bot_mercator", name: "Mercator", skill: 0.93, color: 1 },
    { id: "bot_magellan", name: "Magellan", skill: 0.86, color: 0 },
    { id: "bot_zhenghe", name: "Zheng He", skill: 0.82, color: 2 },
    { id: "bot_battuta", name: "Ibn Battuta", skill: 0.79, color: 3 },
    { id: "bot_amundsen", name: "Amundsen", skill: 0.74, color: 4 },
    { id: "bot_polo", name: "Marco Polo", skill: 0.70, color: 5 },
    { id: "bot_cook", name: "Cook", skill: 0.66, color: 6 },
    { id: "bot_ptolemy", name: "Ptolemy", skill: 0.62, color: 7 },
    { id: "bot_bering", name: "Bering", skill: 0.57, color: 8 },
    { id: "bot_nansen", name: "Nansen", skill: 0.52, color: 9 },
    { id: "bot_vespucci", name: "Vespucci", skill: 0.47, color: 10 },
    { id: "bot_cabot", name: "Cabot", skill: 0.42, color: 11 },
    { id: "bot_hillary", name: "Hillary", skill: 0.37, color: 2 },
    { id: "bot_stanley", name: "Stanley", skill: 0.31, color: 5 },
]

const BOT_BY_ID = new Map(BOT_ROSTER.map(bot => [bot.id, bot]))

export function botById(id: string): Bot | undefined {
    return BOT_BY_ID.get(id)
}

export function isBot(id: string): boolean {
    return id.startsWith("bot_")
}

/** Whoever is filling the empty seats this leg. Same set on every client. */
export function activeBots(legId: string, humans: number): Bot[] {
    const seats = Math.max(0, TABLE_SEATS - humans)
    if (seats === 0) return []
    return seededShuffle(BOT_ROSTER, seededRng(`bots:${legId}`)).slice(0, seats)
}

/** Bots never answer faster than this, so a human always gets a look at the link. */
const BOT_FLOOR_MS = 3_000

/**
 * Each human at the table pushes every bot back by this much, so a busy table
 * is carried by the people at it. Capped: left uncapped, a full table pushed
 * the fastest bot past the 22s deadline and the chain broke on links the bots
 * could perfectly well have taken.
 */
const BOT_HUMAN_HANDICAP_MS = 1_200
const BOT_HANDICAP_CAP = 5

export type BotPlan = {
    bot: Bot
    code: string
    /** Absolute server time the move should land. */
    at: number
}

/**
 * Which bot answers this link, with what, and when.
 *
 * Deterministic in the leg state alone - no `Math.random()`, no wall clock, no
 * local state - so every browser at the table derives the same plan and any one
 * of them can write it. That is the whole trick that lets bots exist without a
 * server: they are not simulated anywhere, they are *agreed on* everywhere.
 *
 * Returns null at a dead end, and when no bot on this seat happens to know a
 * way out - which is the point where the chain becomes the humans' problem.
 */
export function botAttempt(leg: Leg | null, humans: number): BotPlan | null {
    if (!leg) return null
    const options = optionsFor(leg)
    if (options.length === 0) return null

    let best: BotPlan | null = null
    for (const bot of activeBots(leg.id, humans)) {
        // The no-two-in-a-row rule binds bots as well; without it a strong bot
        // and a soft graph would run the whole chain by itself.
        if (bot.id === leg.lastBy) continue

        const rng = seededRng(`${leg.id}:${leg.seq}:${bot.id}`)
        const known = options.filter(code => {
            const difficulty = countryByCode(code)?.difficulty ?? 2
            return rng() < Math.max(0.04, Math.min(0.97, bot.skill - difficulty * 0.18))
        })
        if (known.length === 0) continue

        const code = known[Math.floor(rng() * known.length)]
        const difficulty = countryByCode(code)?.difficulty ?? 2
        const delay =
            BOT_FLOOR_MS +
            (1 - bot.skill) * 5_000 +
            difficulty * 900 +
            rng() * 4_000 +
            Math.min(humans, BOT_HANDICAP_CAP) * BOT_HUMAN_HANDICAP_MS

        const at = leg.lastMoveAt + delay
        if (!best || at < best.at) best = { bot, code, at }
    }
    return best
}

// --- The table ---------------------------------------------------------------

export type TableRow = {
    id: string
    name: string
    color: string
    points: number
    links: number
    bot: boolean
    /** Present but not scoring yet, or a bot holding a seat. */
    idle: boolean
}

/** Humans whose presence row is recent enough to count as at the table. */
export function liveHumans(presence: PresenceMap, now: number): string[] {
    return Object.entries(presence || {})
        .filter(([, row]) => row && now - row.at < PRESENCE_TTL_MS)
        .map(([uid]) => uid)
}

/**
 * The scoreboard for the current leg: everyone at the table, scoring or not,
 * so an empty seat is visibly a seat rather than an absence. Points come from
 * the moves node alone - nothing keeps a running total that could drift from
 * the chain it is supposed to describe.
 */
export function tableFrom(
    leg: Leg | null,
    moves: MoveMap,
    presence: PresenceMap,
    now: number,
): TableRow[] {
    const totals = new Map<string, { points: number; links: number; name: string }>()
    for (const move of Object.values(moves || {})) {
        if (!move) continue
        const row = totals.get(move.by) || { points: 0, links: 0, name: move.n }
        row.points += move.p
        row.links += 1
        row.name = move.n
        totals.set(move.by, row)
    }

    const humans = liveHumans(presence, now)
    const rows: TableRow[] = humans.map(uid => {
        const total = totals.get(uid)
        return {
            id: uid,
            name: presence[uid]?.name || total?.name || "Player",
            color: colorForPlayer(presence[uid]?.color ?? 0),
            points: total?.points ?? 0,
            links: total?.links ?? 0,
            bot: false,
            idle: !total,
        }
    })

    for (const bot of activeBots(leg?.id ?? "", humans.length)) {
        const total = totals.get(bot.id)
        rows.push({
            id: bot.id,
            name: bot.name,
            color: colorForPlayer(bot.color),
            points: total?.points ?? 0,
            links: total?.links ?? 0,
            bot: true,
            idle: !total,
        })
    }

    // A player who scored this leg and then closed the tab still earned it.
    for (const [id, total] of totals) {
        if (rows.some(row => row.id === id)) continue
        rows.push({
            id,
            name: total.name,
            color: colorForPlayer(isBot(id) ? botById(id)?.color ?? 0 : 0),
            points: total.points,
            links: total.links,
            bot: isBot(id),
            idle: false,
        })
    }

    return rows.sort((a, b) => b.points - a.points || b.links - a.links || a.name.localeCompare(b.name))
}

/**
 * Who writes the bot moves and starts the next leg. Lowest uid among the
 * clients actually present - an arbitrary but stable choice every client agrees
 * on without an election. Everyone else covers after `CONDUCTOR_GRACE_MS`, so a
 * conductor whose tab is throttled or whose connection died costs the table a
 * second and a half, not the game.
 */
export function conductorOf(presence: PresenceMap, now: number, uid: string | null): string | null {
    const live = liveHumans(presence, now)
    if (uid && !live.includes(uid)) live.push(uid)
    if (live.length === 0) return null
    return live.sort()[0]
}
