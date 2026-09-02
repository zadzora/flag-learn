/**
 * Flag Wars - asynchronous conquest of the world map.
 *
 * The board is one territory per country. Empty land is claimed outright by
 * answering its questions in time. Land somebody already holds cannot be taken
 * that way: attacking it opens a siege, and the owner has a day to answer the
 * same questions and score higher. Beat them, or fail to show up, and the land
 * changes hands.
 *
 * That is what makes the mode asynchronous without being lifeless - there is a
 * real opponent on the other side of every conquest, but nobody has to be
 * online at the same time. Attacks are limited per day and constrained to the
 * border of your own empire; defending your land costs nothing.
 */
import { seededShuffle, hashString, getTodayString } from "./dailySeed"
import { POOL, centroidOf, countryByCode, type CountryEntry } from "./countryPool"
import warBoardData from "../../data/warBoard.json"

/**
 * Day 1 of season 1. Moving this restarts the numbering, so the `flagWars/<id>`
 * node for any season it renumbers has to be cleared in the console first -
 * the rules deliberately give no client a way to delete a territory.
 */
export const WARS_EPOCH = "2026-09-02"

/** A season runs this long, then the map is wiped and everyone starts over. */
export const SEASON_LENGTH_DAYS = 7

/** Attacks a player may launch per UTC day. */
export const DAILY_ATTACKS = 10

/** Highest score a single attack can record. */
export const MAX_SCORE = 1000

/** A correct but agonisingly slow run still scores this much. */
export const MIN_WIN_SCORE = 50

/** How long an attacker has for the whole three-question run. */
export const ROUND_TIME_MS = 18_000

/** Questions answered per attack. */
export const QUESTIONS_PER_ATTACK = 3

/** Options offered by a multiple-choice question, one of them right. */
export const CHOICE_OPTIONS = 6

/** How long the holder of a besieged territory has to answer back. */
export const SIEGE_HOURS = 24

export const SIEGE_MS = SIEGE_HOURS * 3_600_000

/**
 * Where a link that is not a land border would actually be crossed: `from` on
 * this country's side, `at` on the other. The map draws these, because a sea
 * link is otherwise invisible - nothing on the board tells you that Russia and
 * Alaska are neighbours.
 */
export type SeaRoute = { to: string; from: [number, number]; at: [number, number] }

/** The board, from scripts/gen-neighbours.mjs: map feature name, borders, sea routes. */
const BOARD = warBoardData as unknown as Record<string,
    { geo: string; n: string[]; size?: [number, number]; sea?: SeaRoute[] }>

/** Every country that is a territory - it has a map feature and a full stats row. */
export const TERRITORY_CODES: string[] = Object.keys(BOARD).sort()

const TERRITORY_SET = new Set(TERRITORY_CODES)

/**
 * The world map labels its features with names of its own ("Dem. Rep. Congo"),
 * so the board carries that exact string and the page resolves a clicked
 * feature through here rather than re-running name matching in the UI.
 */
const CODE_BY_GEO_NAME = new Map(TERRITORY_CODES.map(code => [BOARD[code].geo, code]))

export function codeForGeoName(geoName: string): string | undefined {
    return CODE_BY_GEO_NAME.get(geoName)
}

export function isTerritory(code: string): boolean {
    return TERRITORY_SET.has(code)
}

export function neighboursOf(code: string): string[] {
    return BOARD[code]?.n || []
}

export function seaRoutesOf(code: string): SeaRoute[] {
    return BOARD[code]?.sea || []
}

/**
 * Width and height in degrees of a country's largest landmass, from the world
 * map. Islands and overseas departments are left out, so this is the room there
 * actually is to write a name inside the country's borders.
 */
export function mainlandSize(code: string): [number, number] | undefined {
    return BOARD[code]?.size
}

/** Every sea route once, rather than once from each end. */
export const ALL_SEA_ROUTES: (SeaRoute & { code: string })[] = TERRITORY_CODES.flatMap(code =>
    seaRoutesOf(code)
        .filter(route => code < route.to)
        .map(route => ({ ...route, code })),
)

// --- Seasons -----------------------------------------------------------------

export type SeasonInfo = {
    /** `s1`, `s2`, ... - the key everything is stored under. */
    id: string
    number: number
    startDate: string
    endDate: string
    daysLeft: number
}

function daysBetween(from: string, to: string): number {
    const a = Date.parse(`${from}T00:00:00Z`)
    const b = Date.parse(`${to}T00:00:00Z`)
    if (Number.isNaN(a) || Number.isNaN(b)) return 0
    return Math.floor((b - a) / 86_400_000)
}

function addDays(date: string, days: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

export function seasonForDate(date: string = getTodayString()): SeasonInfo {
    const elapsed = Math.max(0, daysBetween(WARS_EPOCH, date))
    const number = Math.floor(elapsed / SEASON_LENGTH_DAYS) + 1
    const startDate = addDays(WARS_EPOCH, (number - 1) * SEASON_LENGTH_DAYS)
    const endDate = addDays(startDate, SEASON_LENGTH_DAYS - 1)
    return {
        id: `s${number}`,
        number,
        startDate,
        endDate,
        daysLeft: SEASON_LENGTH_DAYS - (elapsed % SEASON_LENGTH_DAYS),
    }
}

// --- Stored shapes -----------------------------------------------------------

export type Territory = {
    ownerId: string
    ownerName: string
    /** Score the owner recorded taking it - what an attacker has to beat. */
    score: number
    /** How long their winning answer took, so the attacker can race the pace. */
    timeMs: number
    takenAt: number
}

export type WarPlayer = {
    name: string
    /** Index into `PLAYER_COLORS`, so a player is the same colour on every device. */
    color: number
    joinedAt: number
}

export type TerritoryMap = Record<string, Territory>

/** Filled in properly below, next to the siege rules. */
export type SiegeMap = Record<string, Siege>

// --- Colours -----------------------------------------------------------------

/**
 * Empires have to stay apart at a glance on a map that is already busy, so
 * these are spaced around the hue circle and mid-lightness - readable on both
 * the light and the dark board.
 */
export const PLAYER_COLORS = [
    "#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#9333ea", "#0891b2",
    "#dc2626", "#4f46e5", "#65a30d", "#db2777", "#0d9488", "#ea580c",
] as const

export function colorForPlayer(index: number): string {
    return PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length]
}

/**
 * A colour for a player joining the season. Hashing the id alone hands out
 * duplicates surprisingly often - with eight players it is more likely than
 * not - and two empires sharing a colour makes the map unreadable, so pick
 * from the least-used colours and let the hash break the tie. Deterministic
 * per id, and falls back to the plain hash when nothing is taken yet.
 */
export function pickColorIndex(uid: string, taken: readonly number[] = []): number {
    const counts = new Array<number>(PLAYER_COLORS.length).fill(0)
    for (const color of taken) {
        if (Number.isInteger(color) && color >= 0 && color < counts.length) counts[color]++
    }
    const fewest = Math.min(...counts)
    const candidates = counts.flatMap((count, index) => (count === fewest ? [index] : []))
    return candidates[hashString(uid) % candidates.length]
}

// --- Names -------------------------------------------------------------------

/**
 * The database key a name claims for the season.
 *
 * Two empires called the same thing make the map unreadable - the standings
 * show two identical rows and a siege notice names somebody you cannot tell
 * apart from yourself - so a name is claimed exactly once per season, under
 * this key. Case and spacing are folded away so "Empire" cannot sit next to
 * "empire ", and the characters a Realtime Database key may not contain are
 * replaced rather than rejected.
 */
export function nameKey(name: string): string {
    const folded = name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        // ". $ # [ ] /" and control characters cannot appear in a database key.
        // eslint-disable-next-line no-control-regex
        .replace(/[.$#[\]/\u0000-\u001f\u007f]/g, "_")
        .slice(0, 48)
    return folded || "player"
}

/** Whether some other player in this season already answers to that name. */
export function nameTaken(
    name: string,
    players: Record<string, WarPlayer>,
    uid: string,
): boolean {
    const key = nameKey(name)
    return Object.entries(players).some(([id, player]) => id !== uid && nameKey(player.name) === key)
}

// --- Who can attack what -----------------------------------------------------

export function territoriesOf(territories: TerritoryMap, uid: string): string[] {
    return Object.keys(territories).filter(code => territories[code]?.ownerId === uid)
}

/**
 * Territories bordering the player's empire. With nothing owned every free
 * territory qualifies - that is the homeland pick, and the way back in after
 * being wiped off the map.
 */
export function attackableCodes(territories: TerritoryMap, uid: string): Set<string> {
    const mine = territoriesOf(territories, uid)
    if (mine.length === 0) {
        return new Set(TERRITORY_CODES.filter(code => !territories[code]))
    }
    const reachable = new Set<string>()
    for (const code of mine) {
        for (const next of neighboursOf(code)) {
            if (territories[next]?.ownerId === uid) continue
            reachable.add(next)
        }
    }
    return reachable
}

export type AttackBlock =
    | { ok: true; /** Held land opens a siege; empty land is claimed outright. */ besieges: boolean }
    | { ok: false; reason: "owned" | "unreachable" | "no-attacks" | "not-a-territory" | "under-siege" }

export function canAttack(
    code: string,
    territories: TerritoryMap,
    sieges: SiegeMap,
    uid: string,
    attacksLeft: number,
    now: number = Date.now(),
): AttackBlock {
    if (!isTerritory(code)) return { ok: false, reason: "not-a-territory" }
    if (territories[code]?.ownerId === uid) return { ok: false, reason: "owned" }
    // One live challenge at a time, or a holder could be asked to defend the
    // same land against five people at once. A finished one must NOT block,
    // though: it lingers until its attacker dismisses it, and if that were a
    // barrier an attacker who simply never came back would freeze the territory
    // out of the game for good.
    const siege = sieges[code]
    if (siege && siegeState(siege, now) === "awaiting-defence") {
        return { ok: false, reason: "under-siege" }
    }
    if (attacksLeft <= 0) return { ok: false, reason: "no-attacks" }
    if (!attackableCodes(territories, uid).has(code)) return { ok: false, reason: "unreachable" }
    return { ok: true, besieges: !!territories[code] }
}

// --- The challenge a territory poses -----------------------------------------

/**
 * Questions are about the world, not about the territory being attacked.
 *
 * Asking about the target was the obvious design and it does not survive a map:
 * the player clicked the country, so they can already see which continent it is
 * in, which countries it touches, and - because the sheet shows it - what its
 * flag looks like. Nearly every geographic fact about a country is legible off
 * the board, which left only the capital worth asking.
 *
 * What the territory decides is where the questions come from and how hard they
 * are: its own continent, and a band around its difficulty rating in
 * `flags.json` (0 for everybody knows it, 3 for obscure). Taking Kiribati means
 * answering about the Pacific, and about countries as obscure as Kiribati, so
 * remote territories stay the natural fortresses they should be - and a push
 * into Africa is a harder push than one across Europe.
 */
export type Question =
    /** Type the answer. Tolerant of typos, via textAnswerMatch. */
    | { kind: "typed"; prompt: string; answer: string }
    /** Pick one label out of six. */
    | { kind: "choice"; prompt: string; options: string[]; answer: string }
    /** Pick a flag out of six, with a flag optionally shown as the prompt. */
    | { kind: "flag"; prompt: string; options: CountryEntry[]; answerCode: string }
    /** A flag shown as the question itself, answered by name. */
    | { kind: "name-flag"; prompt: string; shown: CountryEntry; options: string[]; answer: string }

export type WarRound = {
    /** Only for context in the UI - it is not what the questions are about. */
    target: CountryEntry
    questions: Question[]
    timeLimitMs: number
}

/** How far either side of the target's difficulty the subjects may be drawn from. */
const DIFFICULTY_SPREAD = 1

/**
 * Enough candidates that the same six do not come up every time. Six is the
 * bare minimum a multiple-choice question needs; this leaves room to vary.
 */
const MIN_SUBJECTS = 10

/**
 * The countries an attack on `target` may ask about.
 *
 * They come from the target's own continent, so taking ground in South America
 * means answering about South America - the fight stays where it is happening
 * on the map. Within that, a band around the target's difficulty keeps an
 * obscure territory obscure to take.
 *
 * The narrowing steps back when it runs out of countries. Oceania holds only
 * fourteen, and a difficulty band inside it can leave four - fewer than one
 * question needs - so the band is dropped before the continent is. The target
 * itself is never a subject: seeing your own conquest among the answers would
 * give the game away.
 */
function subjectPool(target: CountryEntry): CountryEntry[] {
    const inBand = (c: CountryEntry) => Math.abs(c.difficulty - target.difficulty) <= DIFFICULTY_SPREAD
    const others = POOL.filter(c => c.code !== target.code)

    const continent = others.filter(c => c.region === target.region)
    const banded = continent.filter(inBand)
    if (banded.length >= MIN_SUBJECTS) return banded
    if (continent.length >= MIN_SUBJECTS) return continent

    // No continent is this small today, but a data change should degrade to a
    // harder question rather than to no question at all.
    const worldBand = others.filter(inBand)
    return worldBand.length >= MIN_SUBJECTS ? worldBand : others
}

function pick<T>(items: readonly T[], rng: () => number): T {
    return items[Math.floor(rng() * items.length)]
}

/** Distinct wrong answers drawn from the same band, never equal to `answer`. */
function decoys(candidates: readonly string[], answer: string, rng: () => number): string[] {
    const pool = [...new Set(candidates)].filter(value => value && value !== answer)
    return seededShuffle(pool, rng).slice(0, CHOICE_OPTIONS - 1)
}

function capitalQuestion(band: CountryEntry[], rng: () => number): Question | null {
    const subject = pick(band.filter(c => c.capital), rng)
    if (!subject) return null
    return { kind: "typed", prompt: `Capital of ${subject.name}`, answer: subject.capital }
}

function capitalToCountryQuestion(band: CountryEntry[], rng: () => number): Question | null {
    const subject = pick(band.filter(c => c.capital), rng)
    if (!subject) return null
    const options = seededShuffle(
        [subject.name, ...decoys(band.map(c => c.name), subject.name, rng)],
        rng,
    )
    if (options.length < CHOICE_OPTIONS) return null
    return { kind: "choice", prompt: `${subject.capital} is the capital of...`, options, answer: subject.name }
}

function findFlagQuestion(band: CountryEntry[], rng: () => number): Question | null {
    const subject = pick(band, rng)
    if (!subject) return null
    const others = band.filter(c => c.code !== subject.code)
    if (others.length < CHOICE_OPTIONS - 1) return null
    const options = seededShuffle(
        [subject, ...seededShuffle(others, rng).slice(0, CHOICE_OPTIONS - 1)],
        rng,
    )
    return { kind: "flag", prompt: `Find the flag of ${subject.name}`, options, answerCode: subject.code }
}

function nameTheFlagQuestion(band: CountryEntry[], rng: () => number): Question | null {
    const subject = pick(band, rng)
    if (!subject) return null
    const options = seededShuffle(
        [subject.name, ...decoys(band.map(c => c.name), subject.name, rng)],
        rng,
    )
    if (options.length < CHOICE_OPTIONS) return null
    return { kind: "name-flag", prompt: "Whose flag is this?", shown: subject, options, answer: subject.name }
}

const BUILDERS = [
    capitalQuestion,
    capitalToCountryQuestion,
    findFlagQuestion,
    nameTheFlagQuestion,
]

/**
 * The questions for one attack. `rng` is injectable so tests can pin a draw;
 * in play it is `Math.random`, deliberately - a draw derived from the territory
 * could be looked up once and then pasted back on every future attack.
 */
export function buildRound(code: string, rng: () => number = Math.random): WarRound | null {
    const target = countryByCode(code)
    if (!target) return null

    const band = subjectPool(target)
    const questions: Question[] = []
    const asked = new Set<string>()

    for (const builder of seededShuffle(BUILDERS, rng)) {
        if (questions.length >= QUESTIONS_PER_ATTACK) break
        const question = builder(band, rng)
        // Two questions about the same country in one run would be a gift.
        if (!question || asked.has(question.prompt)) continue
        asked.add(question.prompt)
        questions.push(question)
    }

    if (questions.length < QUESTIONS_PER_ATTACK) return null
    return { target, questions, timeLimitMs: ROUND_TIME_MS }
}

// --- Scoring -----------------------------------------------------------------

/**
 * Speed is the whole contest, so the score is just how much of the clock was
 * left. Anything correct scores at least `MIN_WIN_SCORE`.
 */
export function scoreForTime(timeMs: number, timeLimitMs: number): number {
    const remaining = Math.max(0, Math.min(1, 1 - timeMs / timeLimitMs))
    return Math.round(MIN_WIN_SCORE + (MAX_SCORE - MIN_WIN_SCORE) * remaining)
}

// --- Sieges ------------------------------------------------------------------

/**
 * An attack on land somebody holds. It does not take the territory - it opens a
 * challenge the holder has `SIEGE_HOURS` to answer, on the same questions, from
 * `seed`. Higher score keeps the land; lower, wrong, or absent loses it.
 */
export type Siege = {
    code: string
    attackerId: string
    attackerName: string
    /** What the attacker managed. */
    score: number
    /** Regenerates the attacker's exact questions for the defender. */
    seed: number
    startedAt: number
    /** Present once the holder has answered. */
    defenceScore?: number
    defenderName?: string
    resolvedAt?: number
}

export type SiegeState =
    /** The holder still has time to answer. */
    | "awaiting-defence"
    /** Nobody answered in time - the attacker may claim the land. */
    | "expired"
    /** Answered; `defenceScore` says who won. */
    | "resolved"

export function siegeDeadline(siege: Siege): number {
    return siege.startedAt + SIEGE_MS
}

export function siegeState(siege: Siege, now: number = Date.now()): SiegeState {
    if (siege.resolvedAt !== undefined) return "resolved"
    return now >= siegeDeadline(siege) ? "expired" : "awaiting-defence"
}

/** The holder keeps the land only by scoring strictly higher than the attacker. */
export function defenceHeld(siege: Siege): boolean {
    return (siege.defenceScore ?? -1) > siege.score
}

/** Milliseconds the holder has left to answer, 0 once it has run out. */
export function siegeTimeLeft(siege: Siege, now: number = Date.now()): number {
    return Math.max(0, siegeDeadline(siege) - now)
}

/** Sieges the given player has to answer - their land, still in play. */
export function siegesAgainst(sieges: SiegeMap, territories: TerritoryMap, uid: string, now: number = Date.now()): Siege[] {
    return Object.values(sieges)
        .filter(s => territories[s.code]?.ownerId === uid && siegeState(s, now) === "awaiting-defence")
        .sort((a, b) => a.startedAt - b.startedAt)
}

/** Sieges the given player started, whatever state they are in. */
export function siegesBy(sieges: SiegeMap, uid: string): Siege[] {
    return Object.values(sieges)
        .filter(s => s.attackerId === uid)
        .sort((a, b) => a.startedAt - b.startedAt)
}

// --- Empire labels -----------------------------------------------------------

export type EmpireLabel = {
    uid: string
    name: string
    color: number
    /** Centre of the single largest country the empire holds. */
    at: [number, number]
    /** That country's mainland, in degrees, so the name can be made to fit it. */
    fitDegrees: [number, number]
}

/** The connected blocs an owner's territories fall into. */
function blocsOf(codes: string[]): string[][] {
    const remaining = new Set(codes)
    const blocs: string[][] = []
    while (remaining.size > 0) {
        const start = remaining.values().next().value as string
        remaining.delete(start)
        const bloc = [start]
        const queue = [start]
        while (queue.length > 0) {
            const code = queue.pop() as string
            for (const next of neighboursOf(code)) {
                if (!remaining.has(next)) continue
                remaining.delete(next)
                bloc.push(next)
                queue.push(next)
            }
        }
        blocs.push(bloc)
    }
    return blocs
}

const areaOf = (code: string) => countryByCode(code)?.area ?? 0

/**
 * One name per empire, written inside the single biggest country it holds.
 *
 * Averaging the bloc's centroids put the name wherever the countries happened
 * to cluster - an empire of Russia plus a handful of small European states was
 * labelled over Finland, because five little centroids outvote one enormous
 * one. Anchoring to the largest country instead puts the name where the empire
 * visibly is, and gives a concrete shape to size it against, so it can be made
 * to fit rather than spilling into the sea.
 */
export function empireLabels(
    territories: TerritoryMap,
    players: Record<string, WarPlayer>,
): EmpireLabel[] {
    const byOwner = new Map<string, string[]>()
    for (const [code, territory] of Object.entries(territories)) {
        if (!territory?.ownerId || !centroidOf(code)) continue
        const owned = byOwner.get(territory.ownerId)
        if (owned) owned.push(code)
        else byOwner.set(territory.ownerId, [code])
    }

    const labels: EmpireLabel[] = []
    for (const [uid, codes] of byOwner) {
        const blocArea = (bloc: string[]) => bloc.reduce((total, code) => total + areaOf(code), 0)

        // Most territories wins; equal counts are settled by how much of the map
        // they cover, so the name goes to the bloc the eye finds first.
        const bloc = blocsOf(codes).sort(
            (a, b) => b.length - a.length || blocArea(b) - blocArea(a),
        )[0]
        if (!bloc) continue

        const anchor = [...bloc].sort((a, b) => areaOf(b) - areaOf(a))[0]
        const at = centroidOf(anchor)
        if (!at) continue

        const name = players[uid]?.name || territories[bloc[0]]?.ownerName || ""
        if (!name) continue

        labels.push({
            uid,
            name,
            color: players[uid]?.color ?? pickColorIndex(uid),
            at,
            fitDegrees: mainlandSize(anchor) ?? [4, 2],
        })
    }
    return labels
}

// --- Standings ---// --- Standings ---------------------------------------------------------------

export type Standing = {
    uid: string
    name: string
    color: number
    territories: number
    /** Sum of the scores holding those territories - the tiebreak. */
    strength: number
}

export function standingsFrom(
    territories: TerritoryMap,
    players: Record<string, WarPlayer>,
): Standing[] {
    const byUid = new Map<string, Standing>()

    for (const [uid, player] of Object.entries(players)) {
        byUid.set(uid, {
            uid,
            name: player.name,
            color: player.color,
            territories: 0,
            strength: 0,
        })
    }

    for (const territory of Object.values(territories)) {
        if (!territory?.ownerId) continue
        let row = byUid.get(territory.ownerId)
        if (!row) {
            // A territory whose owner has no player row - keep them visible rather
            // than silently dropping land off the standings.
            row = {
                uid: territory.ownerId,
                name: territory.ownerName || "Unknown",
                color: pickColorIndex(territory.ownerId),
                territories: 0,
                strength: 0,
            }
            byUid.set(territory.ownerId, row)
        }
        row.territories++
        row.strength += territory.score
    }

    return [...byUid.values()]
        .filter(row => row.territories > 0)
        .sort((a, b) => b.territories - a.territories || b.strength - a.strength)
}

// --- Finished seasons --------------------------------------------------------

/** A season's node as it sits in the database once it is over. */
export type SeasonArchive = {
    territories?: TerritoryMap
    players?: Record<string, WarPlayer>
}

export type SeasonResult = {
    id: string
    number: number
    standings: Standing[]
    winner?: Standing
}

/** Reads a finished season back out of its own territories and players. */
export function resultFor(id: string, archive: SeasonArchive): SeasonResult | null {
    const number = Number(id.replace(/^s/, ""))
    if (!Number.isFinite(number)) return null
    const standings = standingsFrom(archive.territories || {}, archive.players || {})
    return { id, number, standings, winner: standings[0] }
}

/** Every season that has already ended, newest first. */
export function finishedSeasons(
    all: Record<string, SeasonArchive>,
    currentNumber: number,
): SeasonResult[] {
    return Object.entries(all)
        .flatMap(([id, archive]) => {
            const result = resultFor(id, archive)
            return result && result.number < currentNumber && result.winner ? [result] : []
        })
        .sort((a, b) => b.number - a.number)
}

/**
 * The permanent record of a finished season.
 *
 * The standings could be recomputed from the season's own data - and are, to
 * produce this - but that data is not guaranteed to survive: a season node can
 * be cleared, and reading every one of them back grows heavier with each week
 * played. So the final table is copied here once, and the Hall of Fame reads
 * only this.
 *
 * It is written once and never rewritten, by somebody who actually played that
 * season. That is as far as the database rules can check it: proving a claimed
 * winner really held the most land would mean counting territories, which the
 * rules language cannot do. The season's own data stays put as the cross-check.
 */
export type HallOfFameEntry = {
    number: number
    winnerId: string
    winnerName: string
    winnerColor: number
    territories: number
    strength: number
    /** The whole final table, so the history outlives the season data. */
    table: { name: string; color: number; territories: number; strength: number }[]
    endedAt: number
}

/** The record to write for a finished season, or null if nobody held anything. */
export function hallOfFameEntry(result: SeasonResult): Omit<HallOfFameEntry, "endedAt"> | null {
    const winner = result.winner
    if (!winner) return null
    return {
        number: result.number,
        winnerId: winner.uid,
        winnerName: winner.name,
        winnerColor: winner.color,
        territories: winner.territories,
        strength: winner.strength,
        table: result.standings.map(row => ({
            name: row.name,
            color: row.color,
            territories: row.territories,
            strength: row.strength,
        })),
    }
}

/** Recorded seasons, newest first. */
export function hallOfFameSeasons(
    records: Record<string, HallOfFameEntry> | null | undefined,
): HallOfFameEntry[] {
    return Object.values(records || {})
        .filter(entry => entry && typeof entry.number === "number" && entry.winnerName)
        .sort((a, b) => b.number - a.number)
}

// --- Daily attack budget -----------------------------------------------------

export function attacksLeft(usedToday: number): number {
    return Math.max(0, DAILY_ATTACKS - usedToday)
}

/** Milliseconds until the attack budget refills, for the countdown in the UI. */
export function msUntilRefill(now: number = Date.now()): number {
    const next = Date.UTC(
        new Date(now).getUTCFullYear(),
        new Date(now).getUTCMonth(),
        new Date(now).getUTCDate() + 1,
    )
    return Math.max(0, next - now)
}
