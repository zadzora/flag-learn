/**
 * The trivia editor's queue from the command line - how Claude Code hands in
 * drafts for review at /dev/trivia (see .claude/skills/trivia/SKILL.md).
 *
 *   node scripts/trivia-queue.mjs context <pack> [--country xx]
 *        everything needed before writing for a pack: the format, the pack's
 *        questions, the ones about the country in every pack, what was
 *        rejected, what is already queued, the least covered countries
 *   node scripts/trivia-queue.mjs add <file.json> [--dry]
 *        queue drafts; the file is {"pack": "...", "questions": [...]} or a
 *        list of those, each question without "id", optionally with a "note"
 *        for the reviewer. Prints every draft's verdict. --dry only checks.
 *   node scripts/trivia-queue.mjs list [--pack p] [--requests]
 *        the queue; --requests only drafts the developer asked to change
 *   node scripts/trivia-queue.mjs show <key>
 *   node scripts/trivia-queue.mjs set <key> <file.json>
 *        replace a draft's question (the file is one question, optionally
 *        with "note"); clears its change request
 *   node scripts/trivia-queue.mjs drop <key>
 *
 * Exit code 1 when a command fails, or when `add` / `set` leave a draft that
 * the checker refuses (it is still queued, unless --dry).
 */
import { readFileSync } from "node:fs"
import { PACKS, CATEGORIES, root } from "./trivia-rules.mjs"
import { readBank, readQueue, changeQueue, judgedQueue, readRejected, thinCountries, summary, countriesOf, newKey, judge } from "./trivia-queue-lib.mjs"
import { join } from "node:path"

const [command, ...rest] = process.argv.slice(2)
const flag = name => {
    const i = rest.indexOf(`--${name}`)
    if (i < 0) return undefined
    const value = rest[i + 1]
    return value && !value.startsWith("--") ? value : true
}
const positional = rest.filter((arg, i) => !arg.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--") && ["country", "pack"].includes(rest[i - 1].slice(2))))

function die(message) {
    console.error(message)
    process.exit(1)
}

function readInput(path) {
    if (!path) die("Missing file")
    try {
        return JSON.parse(readFileSync(path === "-" ? 0 : path, "utf8"))
    } catch (error) {
        die(`Could not read ${path}: ${error.message}`)
    }
}

function printVerdict(draft) {
    const status = draft.errors.length ? "REFUSED" : draft.warnings.length || draft.similar.length ? "check" : "ok"
    console.log(`[${draft.key}] ${draft.pack} ${status}: ${summary(draft.row)}`)
    if (draft.request) console.log(`    request: ${draft.request}`)
    for (const error of draft.errors) console.log(`    error: ${error}`)
    for (const warning of draft.warnings) console.log(`    warning: ${warning}`)
    for (const s of draft.similar) console.log(`    similar (${Math.round(s.score * 100)}%): ${s.id} ${s.q} => ${Array.isArray(s.answer) ? s.answer.join(", ") : s.answer}`)
}

if (command === "context") {
    const pack = positional[0]
    if (!PACKS[pack]) die(`Usage: context <pack> [--country xx]. Packs: ${Object.keys(PACKS).join(", ")}`)
    const country = typeof flag("country") === "string" ? flag("country") : ""
    const bank = readBank()
    const info = PACKS[pack]
    const doc = readFileSync(join(root, "scripts", "check-trivia.mjs"), "utf8").match(/\/\*\*([\s\S]*?)\*\//)?.[1].replace(/^ ?\* ?/gm, "").trim()

    console.log("=== FORMAT (from scripts/check-trivia.mjs) ===")
    console.log(doc)
    console.log(`\nCategories: ${Object.entries(CATEGORIES).map(([id, label]) => `${id} (${label})`).join(", ")}`)
    console.log(`\n=== PACK ${pack} === prefix ${info.prefix}${info.region ? `, only ${info.region}` : ""}${info.type ? `, only type ${info.type}` : ", any type (pick-one leaves type out)"}`)
    console.log(`\n--- Already in ${pack} (${bank[pack].length}) - do not ask these again, not even reworded ---`)
    for (const row of bank[pack]) console.log(summary(row))
    if (country) {
        console.log(`\n--- About ${country} in other packs ---`)
        for (const [name, rows] of Object.entries(bank)) {
            if (name === pack) continue
            for (const row of rows) if (countriesOf(row).includes(country) || (row.kind === "which" && JSON.stringify(row).includes(`"${country}"`))) console.log(summary(row))
        }
    }
    const rejected = readRejected().filter(entry => entry.pack === pack)
    if (rejected.length) {
        console.log(`\n--- Rejected earlier for ${pack} - do not propose these or anything close ---`)
        for (const entry of rejected) console.log(summary(entry.row))
    }
    const queued = readQueue().filter(draft => draft.pack === pack)
    if (queued.length) {
        console.log(`\n--- Waiting for review in ${pack} ---`)
        for (const draft of queued) console.log(summary(draft.row))
    }
    const thin = thinCountries(pack, bank)
    if (thin.length) console.log(`\nLeast covered countries (questions about them, all packs): ${thin.map(t => `${t.code} ${t.name} (${t.count})`).join(", ")}`)
} else if (command === "add") {
    const input = readInput(positional[0])
    const batches = Array.isArray(input) ? input : [input]
    const fresh = []
    for (const batch of batches) {
        if (!batch || !PACKS[batch.pack] || !Array.isArray(batch.questions)) die('Each batch is {"pack": "<pack>", "questions": [...]}')
        for (const question of batch.questions) {
            const { note, ...row } = question
            delete row.id
            fresh.push({ key: newKey(), pack: batch.pack, source: "claude", row, ...(typeof note === "string" && note ? { note } : {}) })
        }
    }
    const queue = readQueue()
    const judged = judgedQueue([...queue, ...fresh]).slice(queue.length)
    if (!flag("dry")) changeQueue(list => { list.push(...fresh) })
    for (const draft of judged) printVerdict(draft)
    const refused = judged.filter(draft => draft.errors.length).length
    console.log(`\n${flag("dry") ? "Checked" : "Queued"} ${judged.length}; ${refused} refused by the checker, ${judged.filter(d => d.similar.length).length} with look-alikes.${flag("dry") ? "" : " Review at http://localhost:5173/dev/trivia"}`)
    if (refused) process.exitCode = 1
} else if (command === "list") {
    const pack = typeof flag("pack") === "string" ? flag("pack") : ""
    const drafts = judgedQueue().filter(d => (!pack || d.pack === pack) && (!flag("requests") || d.request))
    for (const draft of drafts) printVerdict(draft)
    console.log(`\n${drafts.length} draft(s)`)
} else if (command === "show") {
    const draft = judgedQueue().find(d => d.key === positional[0])
    if (!draft) die(`No draft ${positional[0]}`)
    console.log(JSON.stringify({ key: draft.key, pack: draft.pack, source: draft.source, note: draft.note, request: draft.request, row: draft.row }, null, 2))
    printVerdict(draft)
} else if (command === "set") {
    const [key, path] = positional
    const { note, ...row } = readInput(path)
    delete row.id
    const found = changeQueue(list => {
        const draft = list.find(d => d.key === key)
        if (!draft) return null
        draft.row = row
        if (typeof note === "string") draft.note = note
        delete draft.request
        return draft
    })
    if (!found) die(`No draft ${key}`)
    const verdict = { ...found, ...judge(found.row, found.pack, readBank()) }
    printVerdict(verdict)
    if (verdict.errors.length) process.exitCode = 1
} else if (command === "drop") {
    const removed = changeQueue(list => {
        const i = list.findIndex(d => d.key === positional[0])
        return i < 0 ? null : list.splice(i, 1)[0]
    })
    if (!removed) die(`No draft ${positional[0]}`)
    console.log(`Dropped ${removed.key}: ${summary(removed.row)}`)
} else {
    die(readFileSync(new URL(import.meta.url), "utf8").match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ ?\* ?/gm, "").trim())
}
