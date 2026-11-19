/**
 * The dev-only trivia editor's back end: Vite dev-server middleware under
 * /__trivia/ (wired in vite.config.ts with `apply: "serve"`, so a production
 * build has none of it). The page is src/pages/TriviaEditor.tsx at /dev/trivia.
 *
 *   GET  /__trivia/bank                 every pack, the country pool, categories, coverage
 *   GET  /__trivia/queue?since=<stamp>  the review queue with verdicts, or { unchanged } since that stamp
 *   POST /__trivia/check     { pack, row }          verdict only, nothing stored
 *   POST /__trivia/add       { pack, row }          a hand-written draft -> its key
 *   POST /__trivia/update    { key, row }           store an edit -> verdict
 *   POST /__trivia/request   { key, text }          ask Claude Code to change a draft ("" withdraws it)
 *   POST /__trivia/approve   { keys }               into data/trivia/*.json -> ids, or why not
 *   POST /__trivia/reject    { key }                out of the queue, remembered
 *
 * No AI is called from here. Claude Code writes drafts into the queue with
 * `node scripts/trivia-queue.mjs` in a chat (.claude/skills/trivia), and picks
 * up change requests the same way. Only loopback requests are answered:
 * `npm run dev:emu` serves the LAN.
 */
import { statSync, existsSync } from "node:fs"
import { join } from "node:path"
import { PACKS, CATEGORIES, TYPES, FIELDS, LIMITS, pool } from "./trivia-rules.mjs"
import { STATE, readBank, changeQueue, judgedQueue, judge, approve, rememberRejected, thinCountries, newKey } from "./trivia-queue-lib.mjs"

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])
const QUEUE = join(STATE, "queue.json")

/** Changes whenever the queue file does, so the page can poll without re-judging an unchanged queue. */
const stamp = () => (existsSync(QUEUE) ? String(statSync(QUEUE).mtimeMs) : "0")

function bankInfo() {
    const bank = readBank()
    return {
        packs: Object.fromEntries(Object.entries(PACKS).map(([name, pack]) => [name, { ...pack, rows: bank[name] ?? [] }])),
        categories: CATEGORIES,
        types: TYPES,
        fields: FIELDS,
        limits: LIMITS,
        countries: [...pool.values()].map(({ code, name, region }) => ({ code, name, region })),
        thin: Object.fromEntries(Object.keys(PACKS).filter(name => PACKS[name].region).map(name => [name, thinCountries(name, bank, 8)])),
    }
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = ""
        req.on("data", chunk => { data += chunk })
        req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}) } catch (error) { reject(error) } })
        req.on("error", reject)
    })
}

function update(key, patch) {
    const draft = changeQueue(list => {
        const found = list.find(d => d.key === key)
        if (found) Object.assign(found, patch)
        if (found && patch.request === "") delete found.request
        return found ? { ...found } : null
    })
    if (!draft) throw new Error("That draft is no longer in the queue")
    return { ...draft, ...judge(draft.row, draft.pack, readBank()), stamp: stamp() }
}

/** Connect middleware for Vite's dev server. */
export function triviaEditor() {
    return async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost")
        if (!url.pathname.startsWith("/__trivia/")) return next()
        const send = (status, payload) => {
            res.statusCode = status
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify(payload))
        }
        if (!LOOPBACK.has(req.socket.remoteAddress ?? "")) return send(403, { error: "The trivia editor answers this computer only" })
        const route = url.pathname.slice("/__trivia/".length)
        try {
            if (req.method === "GET" && route === "bank") return send(200, bankInfo())
            if (req.method === "GET" && route === "queue") {
                const now = stamp()
                if (url.searchParams.get("since") === now) return send(200, { unchanged: true, stamp: now })
                return send(200, { drafts: judgedQueue(), stamp: now })
            }
            if (req.method !== "POST") return send(405, { error: "POST only" })
            const body = await readBody(req)
            if (route === "check") return send(200, judge(body.row ?? {}, body.pack, readBank()))
            if (route === "add") {
                if (!PACKS[body.pack]) throw new Error(`Unknown pack ${body.pack}`)
                const draft = { key: newKey(), pack: body.pack, source: "own", row: body.row ?? {} }
                changeQueue(list => { list.unshift(draft) })
                return send(200, { ...draft, ...judge(draft.row, draft.pack, readBank()), stamp: stamp() })
            }
            if (route === "update") return send(200, update(body.key, { row: body.row ?? {} }))
            if (route === "request") return send(200, update(body.key, { request: String(body.text ?? "").trim() }))
            if (route === "approve") return send(200, { ...approve(Array.isArray(body.keys) ? body.keys : []), stamp: stamp() })
            if (route === "reject") {
                const removed = changeQueue(list => {
                    const i = list.findIndex(d => d.key === body.key)
                    return i < 0 ? null : list.splice(i, 1)[0]
                })
                // A hand-written draft thrown away is not a topic to steer Claude away from.
                if (removed && removed.source !== "own") rememberRejected(removed)
                return send(200, { ok: true, stamp: stamp() })
            }
            return send(404, { error: `No route ${route}` })
        } catch (error) {
            send(500, { error: error instanceof Error ? error.message : String(error) })
        }
    }
}
