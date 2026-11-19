/**
 * The trivia editor's review queue, shared by the dev-only editor's back end
 * (trivia-editor-server.mjs, /dev/trivia) and the command line
 * (trivia-queue.mjs, which Claude Code uses to hand in drafts).
 *
 * Nothing here calls an AI. Drafts are written into the queue - by Claude Code
 * in a chat, or by hand in the editor - and reach data/trivia/*.json only when
 * the developer approves them in the editor.
 *
 *   .trivia-editor/queue.json       drafts waiting for review: { key, pack, source, row, note?, request? }
 *   .trivia-editor/rejected.jsonl   one line per rejected draft, so it is not proposed again
 *
 * Both are gitignored. A draft's errors, warnings and look-alikes are never
 * stored: they are worked out afresh (`judge`) whenever the queue is read, so
 * a draft edited by hand or by Claude is always shown with its current verdict.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, renameSync } from "node:fs"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import { PACKS, FIELDS, createChecker, fold, root, pool } from "./trivia-rules.mjs"

export const DATA = join(root, "data", "trivia")
export const STATE = join(root, ".trivia-editor")
const QUEUE = join(STATE, "queue.json")
const REJECTED = join(STATE, "rejected.jsonl")

// --- The bank on disk --------------------------------------------------------

export const readPack = name => JSON.parse(readFileSync(join(DATA, `${name}.json`), "utf8"))
export const readBank = () => Object.fromEntries(Object.keys(PACKS).filter(name => existsSync(join(DATA, `${name}.json`))).map(name => [name, readPack(name)]))
/** The bank's own layout: one question per line. Re-serialising an untouched pack gives back the same bytes. */
const writePack = (name, rows) => writeFileSync(join(DATA, `${name}.json`), "[\n" + rows.map(row => JSON.stringify(row)).join(",\n") + "\n]\n")

const nextNumber = rows => rows.reduce((max, row) => Math.max(max, Number(String(row.id).split("-")[1]) || 0), 0) + 1
const idFor = (pack, n) => `${PACKS[pack].prefix}-${String(n).padStart(3, "0")}`

// --- The queue on disk -------------------------------------------------------

export const newKey = () => randomBytes(4).toString("hex")

export function readQueue() {
    if (!existsSync(QUEUE)) return []
    try {
        const list = JSON.parse(readFileSync(QUEUE, "utf8"))
        return Array.isArray(list) ? list : []
    } catch {
        return []
    }
}

/** Written to a temporary file and renamed, so the editor never reads half a queue. */
export function writeQueue(list) {
    mkdirSync(STATE, { recursive: true })
    writeFileSync(`${QUEUE}.tmp`, JSON.stringify(list, null, 2) + "\n")
    renameSync(`${QUEUE}.tmp`, QUEUE)
}

/** Read, change and write back in one go - every change goes through here, so two writers lose as little as possible. */
export function changeQueue(change) {
    const list = readQueue()
    const result = change(list)
    writeQueue(list)
    return result
}

export function readRejected() {
    if (!existsSync(REJECTED)) return []
    return readFileSync(REJECTED, "utf8").split("\n").filter(Boolean).map(line => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)
}

export function rememberRejected(draft) {
    mkdirSync(STATE, { recursive: true })
    const { q, answer, answers, clues } = draft.row ?? {}
    appendFileSync(REJECTED, JSON.stringify({ pack: draft.pack, row: { q, answer, answers, clues }, at: new Date().toISOString() }) + "\n")
}

// --- Checking ----------------------------------------------------------------

/** A checker that has already seen the whole bank, so duplicates of existing ids and questions are caught. */
export function seededChecker(bank) {
    const checker = createChecker()
    for (const [pack, rows] of Object.entries(bank)) rows.forEach((row, i) => checker.check(row, pack, i))
    return checker
}

/** Field order the bank writes in, so a saved row reads like its neighbours. */
const ORDER = ["id", "type", "kind", "country", "region", "cat", "level", "image", "noFlags", "q"]
export function tidy(row, pack) {
    const type = PACKS[pack]?.type ?? row.type ?? "choice"
    const out = {}
    const keys = [...ORDER, ...(FIELDS[type] ?? []), "fact", "asOf"]
    // An empty field is left out, except unit, where "" means a plain count.
    const present = key => row[key] !== undefined && row[key] !== null && (row[key] !== "" || key === "unit")
    for (const key of keys) if (present(key)) out[key] = row[key]
    for (const key of Object.keys(row)) if (!(key in out) && !["note", "key"].includes(key) && present(key)) out[key] = row[key]
    // A pick-one question leaves `type` out, like the bank does.
    if (type === "choice") delete out.type
    else out.type = type
    return out
}

const STOP = new Set("the a an of in on to and or is are was were which what who whom whose where when how this that these those its it by for from with as at be has have had did does do most first one country countries called known famous".split(" "))
const tokens = text => new Set(fold(text).split(" ").filter(word => word.length >= 3 && !STOP.has(word)))
function jaccard(a, b) {
    if (!a.size || !b.size) return 0
    let both = 0
    for (const word of a) if (b.has(word)) both++
    return both / (a.size + b.size - both)
}
const answerOf = row => (typeof row.answer === "string" || typeof row.answer === "number" ? fold(row.answer) : "")
export const countriesOf = row => [...(Array.isArray(row.country) ? row.country : []), ...(row.image && !row.image.text ? Object.values(row.image) : [])]

/** Existing questions that ask nearly the same thing, best first. */
export function similarTo(row, bank) {
    const mine = tokens(`${row.q ?? ""} ${(row.clues ?? []).join(" ")}`)
    const answer = answerOf(row)
    const places = new Set(countriesOf(row))
    const found = []
    for (const [pack, rows] of Object.entries(bank)) {
        for (const other of rows) {
            if (other.id === row.id) continue
            let score = jaccard(mine, tokens(`${other.q} ${(other.clues ?? []).join(" ")}`))
            const sameAnswer = answer && answer === answerOf(other)
            if (sameAnswer) score += 0.25
            if (sameAnswer && countriesOf(other).some(code => places.has(code))) score += 0.25
            if (score >= 0.45) found.push({ id: other.id, pack, q: other.q, answer: other.answer ?? other.answers ?? null, score: Math.round(Math.min(score, 1) * 100) / 100 })
        }
    }
    return found.sort((a, b) => b.score - a.score).slice(0, 4)
}

/**
 * Checks a draft as if it were saved now, as the pack's next question (plus
 * `offset`, so a batch is checked as consecutive ids and one draft repeating
 * another in the same batch is caught).
 */
export function judge(row, pack, bank, checker = seededChecker(bank), offset = 0) {
    if (!PACKS[pack]) return { row, errors: [`unknown pack "${pack}" - one of ${Object.keys(PACKS).join(", ")}`], warnings: [], similar: [] }
    const id = idFor(pack, nextNumber(bank[pack] ?? []) + offset)
    const candidate = tidy({ ...row, id }, pack)
    const result = checker.check(candidate, pack)
    const strip = line => line.replace(`${id}: `, "")
    const draft = { ...candidate }
    delete draft.id
    return { row: draft, errors: result.errors.map(strip), warnings: result.warnings.map(strip), similar: similarTo(candidate, bank) }
}

/** The whole queue with every draft's current verdict. Drafts of one pack are checked together, in queue order. */
export function judgedQueue(list = readQueue(), bank = readBank()) {
    const checker = seededChecker(bank)
    const offsets = new Map()
    return list.map(draft => {
        const offset = offsets.get(draft.pack) ?? 0
        offsets.set(draft.pack, offset + 1)
        return { ...draft, ...judge(draft.row ?? {}, draft.pack, bank, checker, offset) }
    })
}

// --- Saving ------------------------------------------------------------------

/** Approves the drafts with these keys: each that passes gets the pack's next id and leaves the queue. */
export function approve(keys) {
    const bank = readBank()
    const checker = seededChecker(bank)
    const queue = readQueue()
    const wanted = queue.filter(draft => keys.includes(draft.key))
    const saved = [], failed = []
    const touched = new Set()
    for (const draft of wanted) {
        const rows = bank[draft.pack]
        if (!rows) { failed.push({ key: draft.key, errors: [`unknown pack "${draft.pack}"`] }); continue }
        const n = nextNumber(rows)
        if (n > 999) { failed.push({ key: draft.key, errors: [`the ${draft.pack} pack is full (ids stop at 999)`] }); continue }
        const candidate = tidy({ ...draft.row, id: idFor(draft.pack, n) }, draft.pack)
        const result = checker.check(candidate, draft.pack)
        if (result.errors.length) {
            failed.push({ key: draft.key, errors: result.errors.map(line => line.replace(`${candidate.id}: `, "")) })
            continue
        }
        rows.push(candidate)
        touched.add(draft.pack)
        saved.push({ key: draft.key, id: candidate.id, pack: draft.pack })
    }
    for (const pack of touched) writePack(pack, bank[pack])
    const done = new Set(saved.map(s => s.key))
    changeQueue(list => {
        const keep = list.filter(draft => !done.has(draft.key))
        list.splice(0, list.length, ...keep)
    })
    return { saved, failed }
}

// --- What Claude needs before writing ----------------------------------------

/** Countries of a regional pack with the fewest questions about them, fewest first. */
export function thinCountries(pack, bank, limit = 15) {
    const region = PACKS[pack]?.region
    if (!region) return []
    const counts = new Map([...pool.values()].filter(c => c.region === region).map(c => [c.code, 0]))
    for (const rows of Object.values(bank)) for (const row of rows) for (const code of Array.isArray(row.country) ? row.country : []) if (counts.has(code)) counts.set(code, counts.get(code) + 1)
    return [...counts].sort((a, b) => a[1] - b[1]).slice(0, limit).map(([code, n]) => ({ code, name: pool.get(code).name, count: n }))
}

/** One line per question, enough to tell what it asks and answers. */
export const summary = row => `${row.id ?? "draft"} | ${row.q}${row.answer !== undefined ? ` => ${row.answer}` : row.answers ? ` => ${row.answers.join(", ")}` : ""}${row.clues ? ` [${row.clues.join(" / ")}]` : ""}${row.items ? ` [${row.items.join(", ")}]` : ""}${row.pairs ? ` [${row.pairs.map(p => p.join("=")).join(", ")}]` : ""}`
