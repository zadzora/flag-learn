// The database rules, against the emulator: `npm run test:rules` (needs Java).
import { readFileSync } from "node:fs"
import assert from "node:assert/strict"
import { after, before, beforeEach, describe, test } from "node:test"
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing"
import { CLOUD_KEYS, ROAD_TRIP_LIMIT, VALUE_LIMIT } from "../src/utils/cloudMerge.ts"

let env
const TIMESTAMP = { ".sv": "timestamp" }

before(async () => {
    env = await initializeTestEnvironment({
        projectId: "demo-flaglearn",
        // Spelled out: discovery through the emulator hub picks `localhost`, which Node may resolve to IPv6.
        hub: { host: "127.0.0.1", port: Number(process.env.RULES_HUB_PORT ?? 4400) },
        database: { host: "127.0.0.1", port: Number(process.env.RULES_DB_PORT ?? 9000), rules: readFileSync(new URL("../firebase-realtime.rules.json", import.meta.url), "utf8") },
    })
})
beforeEach(() => env.clearDatabase())
after(() => env.cleanup())

/** A Google account, as its ID token reads. */
const google = uid => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, firebase: { sign_in_provider: "google.com" } }).database()
/** An anonymous account just upgraded to Google, if the provider claim lags behind the email. */
const linked = uid => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, firebase: { sign_in_provider: "anonymous" } }).database()
const anon = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).database()
const guest = () => env.unauthenticatedContext().database()
const seed = (path, value) => env.withSecurityRulesDisabled(ctx => ctx.database().ref(path).set(value))
const entry = (v = "{}") => ({ v, at: TIMESTAMP })

describe("users: the cloud save", () => {
    test("every listed key can be saved and read back by its own Google account", async () => {
        const db = google("alice")
        for (const { key } of CLOUD_KEYS) await assertSucceeds(db.ref(`users/alice/save/${key}`).set(entry()))
        await assertSucceeds(db.ref("users/alice").once("value"))
    })

    test("a freshly linked account, its token still saying anonymous, can save", async () => {
        await assertSucceeds(linked("alice").ref("users/alice/save/flag-master-v1").set(entry()))
    })

    test("nobody else can read or write it", async () => {
        await seed("users/alice/save/flag-master-v1", { v: "{}", at: 1 })
        await assertFails(google("bob").ref("users/alice").once("value"))
        await assertFails(google("bob").ref("users/alice/save/flag-master-v1").set(entry()))
        await assertFails(google("bob").ref("users/alice").remove())
        await assertFails(guest().ref("users/alice").once("value"))
        await assertFails(guest().ref("users").once("value"))
    })

    test("an anonymous account cannot store anything", async () => {
        await assertFails(anon("alice").ref("users/alice/save/flag-master-v1").set(entry()))
        await assertFails(anon("alice").ref("users/alice").once("value"))
    })

    test("only listed keys, in the agreed shape", async () => {
        const db = google("alice")
        await assertFails(db.ref("users/alice/save/anything-else").set(entry()))
        await assertFails(db.ref("users/alice/save/flag-master-v1").set({ v: "{}", at: TIMESTAMP, extra: 1 }))
        await assertFails(db.ref("users/alice/save/flag-master-v1").set({ v: 5, at: TIMESTAMP }))
        await assertFails(db.ref("users/alice/save/flag-master-v1").set({ v: "{}", at: Date.now() + 3_600_000 }))
        await assertFails(db.ref("users/alice/somewhere").set("x"))
    })

    test("values are capped, the Road Trip higher than the rest", async () => {
        const db = google("alice")
        await assertSucceeds(db.ref("users/alice/save/flag-master-v1").set(entry("x".repeat(VALUE_LIMIT))))
        await assertFails(db.ref("users/alice/save/flag-master-v1").set(entry("x".repeat(VALUE_LIMIT + 1))))
        await assertSucceeds(db.ref("users/alice/save/road-trip-v1").set(entry("x".repeat(VALUE_LIMIT * 3))))
        await assertFails(db.ref("users/alice/save/road-trip-v1").set(entry("x".repeat(ROAD_TRIP_LIMIT + 1))))
    })

    test("the backup takes a copy of the save, and only listed keys", async () => {
        const db = google("alice")
        await assertSucceeds(db.ref("users/alice/backup").set({ "flag-master-v1": { v: "{}", at: 1 } }))
        await assertFails(db.ref("users/alice/backup").set({ "made-up": { v: "{}", at: 1 } }))
    })

    test("the owner can delete everything at once", async () => {
        await seed("users/alice", { save: { "flag-master-v1": { v: "{}", at: 1 } } })
        await seed("speedrunRuns/alice", { board: "map-europe", n: 3, mistakes: 0, startedAt: 1, lastAt: 2 })
        await assertSucceeds(google("alice").ref().update({ "users/alice": null, "speedrunRuns/alice": null }))
    })
})

describe("games: PvP", () => {
    const game = (host, extra = {}) => ({
        id: "abc123",
        hostId: host,
        settings: { roundCount: 10, region: "world", timeLimit: 60, maxPlayers: 2, isBlurMode: false },
        flags: ["fr", "de"],
        status: "waiting",
        startTime: 0,
        createdAt: 1,
        players: { [host]: { name: "Host", score: 0, currentIndex: 0, finished: false, finishedAt: 0, left: false } },
        ...extra,
    })
    const player = name => ({ name, score: 0, currentIndex: 0, finished: false, finishedAt: 0, left: false })

    test("a signed-in host creates a game under their own uid", async () => {
        await assertSucceeds(anon("host").ref("games/abc123").set(game("host")))
        await assertFails(anon("host").ref("games/abc123").set(game("someone-else")))
        await assertFails(guest().ref("games/abc123").set(game("host")))
    })

    test("a game cannot carry anything extra, or be written over", async () => {
        await assertFails(anon("host").ref("games/abc123").set(game("host", { junk: "x".repeat(1000) })))
        await seed("games/abc123", game("host"))
        await assertFails(anon("host").ref("games/abc123").set(game("host")))
    })

    test("players join as themselves while the game waits, and only write their own row", async () => {
        await seed("games/abc123", game("host"))
        await assertSucceeds(anon("bob").ref("games/abc123/players/bob").set(player("Bob")))
        await assertFails(anon("bob").ref("games/abc123/players/carol").set(player("Carol")))
        await assertFails(anon("bob").ref("games/abc123/players/host/score").set(99))
        await assertFails(anon("bob").ref("games/abc123/players/bob").set(player("x".repeat(25))))
    })

    test("only the host starts it; nobody joins once it runs", async () => {
        await seed("games/abc123", game("host", { players: { host: player("Host"), bob: player("Bob") } }))
        await assertFails(anon("bob").ref("games/abc123").update({ status: "playing" }))
        await assertSucceeds(anon("host").ref("games/abc123").update({ status: "playing", startTime: 5 }))
        await assertFails(anon("carol").ref("games/abc123/players/carol").set(player("Carol")))
        await assertSucceeds(anon("bob").ref("games/abc123").update({ "players/bob/score": 1, "players/bob/currentIndex": 1 }))
        await assertSucceeds(anon("bob").ref("games/abc123").update({ status: "finished" }))
        await assertFails(anon("stranger").ref("games/abc123").update({ status: "aborted" }))
    })

    test("a game is readable by its link, the list of games is not", async () => {
        await seed("games/abc123", game("host"))
        await assertSucceeds(guest().ref("games/abc123").once("value"))
        await assertFails(guest().ref("games").once("value"))
    })
})

describe("highscores", () => {
    const row = (playerId, uid, bestTimeSeconds = 100) => ({ name: "Ann", bestTimeSeconds, mistakes: 0, playerId, uid })

    test("a row is written by its account", async () => {
        await assertSucceeds(anon("ann").ref("highscores/world/p1").set(row("p1", "ann")))
        await assertFails(anon("ann").ref("highscores/world/p2").set(row("p2", "bob")))
        await assertFails(guest().ref("highscores/world/p3").set(row("p3", "ann")))
        const { uid, ...noUid } = row("p4", "ann")
        void uid
        await assertFails(anon("ann").ref("highscores/world/p4").set(noUid))
    })

    test("only the owner improves a row, and only by improving it", async () => {
        await seed("highscores/world/p1", row("p1", "ann", 100))
        await assertFails(anon("bob").ref("highscores/world/p1").set(row("p1", "bob", 50)))
        await assertFails(anon("ann").ref("highscores/world/p1").set(row("p1", "ann", 150)))
        await assertSucceeds(anon("ann").ref("highscores/world/p1").set(row("p1", "ann", 50)))
    })

    test("a row from before accounts is taken over by the first improvement", async () => {
        const { uid, ...legacy } = row("p1", "x", 100)
        void uid
        await seed("highscores/world/p1", legacy)
        await assertSucceeds(anon("ann").ref("highscores/world/p1").set(row("p1", "ann", 90)))
    })

    test("nobody deletes rows; the boards are a fixed list", async () => {
        await seed("highscores/world/p1", row("p1", "ann"))
        await assertFails(anon("ann").ref("highscores/world/p1").remove())
        await assertSucceeds(anon("ann").ref("highscores/capitals/p1").set(row("p1", "ann")))
        await assertFails(anon("ann").ref("highscores/made-up/p1").set(row("p1", "ann")))
        await assertFails(anon("ann").ref("highscores/map-oceania/p1").set(row("p1", "ann")))
    })
})

describe("speedruns: the server's clock", () => {
    const RUN = "speedrunRuns/ann"
    const fresh = board => ({ board, n: 0, mistakes: 0, startedAt: TIMESTAMP, lastAt: TIMESTAMP })
    const found = n => ({ n, lastAt: TIMESTAMP })
    /** A whole run the honest way: open, `total` finds, `misses` misses. */
    async function play(db, board, total, misses = 0) {
        await assertSucceeds(db.ref(RUN).set(fresh(board)))
        for (let i = 1; i <= misses; i++) await assertSucceeds(db.ref(RUN).update({ mistakes: i }))
        for (let n = 1; n <= total; n++) await assertSucceeds(db.ref(RUN).update(found(n)))
        const run = (await db.ref(RUN).once("value")).val()
        return { ...run, serverMs: run.lastAt - run.startedAt }
    }
    const record = (run, seconds, extra = {}) => ({ name: "Ann", bestTimeSeconds: seconds, mistakes: run.mistakes, playerId: "p1", uid: "ann", serverMs: run.serverMs, ...extra })
    const honest = run => Math.ceil(run.serverMs / 100) / 10 + run.mistakes * 10

    test("an honest run goes on the board", async () => {
        const db = anon("ann")
        const run = await play(db, "capmap-oceania", 13, 1)
        await assertSucceeds(db.ref("highscores/capmap-oceania/p1").set(record(run, honest(run))))
    })

    test("the Ultimate Speedrun boards are verified the same way", async () => {
        const db = anon("ann")
        const short = await play(db, "ultimate-americas", 28)
        await assertFails(db.ref("highscores/ultimate-americas/p1").set(record(short, honest(short) + 60)))
        const run = await play(db, "ultimate-americas", 29, 2)
        await assertFails(db.ref("highscores/map-americas/p1").set(record(run, honest(run))))
        await assertFails(db.ref("highscores/ultimate-americas/p1").set(record(run, honest(run) - 10)))
        await assertSucceeds(db.ref("highscores/ultimate-americas/p1").set(record(run, honest(run))))
        await assertFails(db.ref(RUN).set(fresh("ultimate-oceania")))
    })

    test("a time shorter than the server saw is refused - a slowed clock or an edited number", async () => {
        const db = anon("ann")
        await assertSucceeds(db.ref(RUN).set(fresh("capmap-oceania")))
        await assertSucceeds(db.ref(RUN).update({ mistakes: 1 }))
        await new Promise(r => setTimeout(r, 1200))
        for (let n = 1; n <= 13; n++) await assertSucceeds(db.ref(RUN).update(found(n)))
        const stored = (await db.ref(RUN).once("value")).val()
        const run = { ...stored, serverMs: stored.lastAt - stored.startedAt }
        assert.ok(run.serverMs >= 1200)
        await assertFails(db.ref("highscores/capmap-oceania/p1").set(record(run, 0.5)))
        await assertFails(db.ref("highscores/capmap-oceania/p1").set(record(run, honest(run) - 0.2)))
        // Penalties count: a run with a miss cannot report the time of one without.
        await assertFails(db.ref("highscores/capmap-oceania/p1").set(record(run, honest(run) - 10, { mistakes: 0 })))
        await assertSucceeds(db.ref("highscores/capmap-oceania/p1").set(record(run, honest(run))))
    })

    test("a record with no run behind it is refused", async () => {
        const db = anon("ann")
        await assertFails(db.ref("highscores/map-europe/p1").set({ name: "Ann", bestTimeSeconds: 30, mistakes: 0, playerId: "p1", uid: "ann", serverMs: 1 }))
        await assertFails(db.ref("highscores/map-europe/p1").set({ name: "Ann", bestTimeSeconds: 30, mistakes: 0, playerId: "p1", uid: "ann" }))
    })

    test("the run must be complete, on the same board, with the server's own numbers", async () => {
        const db = anon("ann")
        const short = await play(db, "capmap-oceania", 12)
        await assertFails(db.ref("highscores/capmap-oceania/p1").set(record(short, honest(short) + 60)))
        const run = await play(db, "capmap-oceania", 13)
        await assertFails(db.ref("highscores/capmap-europe/p1").set(record(run, honest(run) + 60)))
        await assertFails(db.ref("highscores/capmap-oceania/p1").set(record(run, honest(run), { serverMs: 1 })))
        await assertFails(db.ref("highscores/capmap-oceania/p1").set(record(run, 0.1, { serverMs: 1 })))
    })

    test("steps go one at a time, stamped by the server", async () => {
        const db = anon("ann")
        await assertSucceeds(db.ref(RUN).set(fresh("map-europe")))
        await assertFails(db.ref(RUN).update({ n: 40, lastAt: TIMESTAMP }))
        await assertFails(db.ref(RUN).update({ n: 1, lastAt: Date.now() + 60_000 }))
        await assertFails(db.ref(RUN).update({ n: 1 }))
        await assertSucceeds(db.ref(RUN).update(found(1)))
        await assertFails(db.ref(RUN).update(found(1)))
        await assertFails(db.ref(RUN).update({ startedAt: Date.now() + 60_000 }))
        await assertFails(db.ref(RUN).update({ board: "capmap-oceania" }))
        await assertFails(db.ref(RUN).update({ n: 2, mistakes: 1, lastAt: TIMESTAMP }))
        await assertSucceeds(db.ref(RUN).update({ mistakes: 1 }))
        await assertFails(db.ref(RUN).update({ mistakes: 0 }))
        await assertFails(db.ref(RUN).update({ extra: 1 }))
    })

    test("a run opens only at zero, now, and on a real board", async () => {
        const db = anon("ann")
        await assertFails(db.ref(RUN).set({ ...fresh("capmap-oceania"), n: 13 }))
        await assertFails(db.ref(RUN).set({ ...fresh("capmap-oceania"), startedAt: Date.now() - 60_000 }))
        await assertFails(db.ref(RUN).set(fresh("map-oceania")))
        await assertFails(db.ref(RUN).set(fresh("world")))
    })

    test("a run is its player's alone", async () => {
        await assertFails(anon("bob").ref(RUN).set(fresh("map-europe")))
        await assertFails(guest().ref(RUN).set(fresh("map-europe")))
        await assertSucceeds(anon("ann").ref(RUN).set(fresh("map-europe")))
        await assertFails(anon("bob").ref(RUN).once("value"))
        await assertFails(anon("bob").ref(RUN).update(found(1)))
        await assertFails(anon("bob").ref(RUN).remove())
        await assertSucceeds(anon("ann").ref(RUN).remove())
    })

    test("records from before the check stay, and are improved through it", async () => {
        const db = anon("ann")
        await seed("highscores/capmap-oceania/p1", { name: "Ann", bestTimeSeconds: 500, mistakes: 0, playerId: "p1", uid: "ann" })
        const { uid, ...legacy } = { name: "Old", bestTimeSeconds: 500, mistakes: 0, playerId: "p2", uid: "x" }
        void uid
        await seed("highscores/capmap-oceania/p2", legacy)
        assert.equal((await guest().ref("highscores/capmap-oceania").once("value")).val().p2.bestTimeSeconds, 500)
        await assertFails(db.ref("highscores/capmap-oceania/p1").set({ name: "Ann", bestTimeSeconds: 400, mistakes: 0, playerId: "p1", uid: "ann" }))
        const run = await play(db, "capmap-oceania", 13)
        await assertSucceeds(db.ref("highscores/capmap-oceania/p1").set(record(run, honest(run))))
        await assertSucceeds(db.ref("highscores/capmap-oceania/p2").set(record(run, honest(run), { playerId: "p2" })))
    })
})

describe("dailyStats", () => {
    test("only the daily games that exist", async () => {
        await assertSucceeds(guest().ref("dailyStats/flagle/2026-11-03/g1").set(1))
        await assertSucceeds(guest().ref("dailyStats/road-trip-rally/2026-11-03/best").set(60_000))
        await assertSucceeds(guest().ref("dailyStats/trivia/2026-11-03/g3").set(1))
        await assertFails(guest().ref("dailyStats/made-up/2026-11-03/g1").set(1))
        // The Daily Gauntlet is gone.
        await assertFails(guest().ref("dailyStats/gauntlet/2026-11-03/g1").set(1))
    })
})

describe("triviaRooms: multiplayer trivia", () => {
    const room = (host, extra = {}) => ({
        host, hostName: "Host", name: "Friday quiz", private: false, style: "battle",
        settings: { length: 10, region: "", maxPlayers: 8 }, createdAt: TIMESTAMP, status: "lobby", round: 1, ...extra,
    })
    const seat = name => ({ name, joinedAt: 1, left: false })
    const seeded = (extra = {}) => ({ ...room("host"), createdAt: Date.now(), players: { host: seat("Host") }, ...extra })
    const playing = (extra = {}) => seeded({
        status: "playing",
        questions: [{ id: "eu-001", double: false }, { id: "cp-fr-de", double: true }],
        step: { index: 0, phase: "question", at: Date.now() },
        players: { host: seat("Host"), bob: seat("Bob") },
        ...extra,
    })

    test("a host creates a room under their own uid; everyone can list rooms", async () => {
        await assertSucceeds(anon("host").ref("triviaRooms/ABC23").set({ ...room("host"), players: { host: { name: "Host", joinedAt: TIMESTAMP, left: false } } }))
        await assertSucceeds(guest().ref("triviaRooms").orderByChild("createdAt").limitToLast(10).once("value"))
        await assertFails(anon("mallory").ref("triviaRooms/XYZ23").set(room("host")))
        await assertFails(anon("host").ref("triviaRooms/abc23").set(room("host")))
        await assertFails(anon("host").ref("triviaRooms/ABC23").set(room("host")))
        await assertFails(anon("host").ref("triviaRooms/QQQ22").set(room("host", { status: "playing" })))
        await assertFails(anon("host").ref("triviaRooms/QQQ23").set(room("host", { extra: 1 })))
        await assertFails(anon("host").ref("triviaRooms/QQQ24").set(room("host", { style: "chaos" })))
    })

    test("up to 100 questions and 100 seats, chosen kinds of question, a manual start", async () => {
        const settings = extra => ({ length: 100, region: "europe", maxPlayers: 100, ...extra })
        await assertSucceeds(anon("host").ref("triviaRooms/SET23").set(room("host", { settings: settings({ types: "choice,pin,clues", auto: false }) })))
        await assertSucceeds(anon("host").ref("triviaRooms/SET24").set(room("host", { settings: settings({ auto: true }) })))
        await assertFails(anon("host").ref("triviaRooms/SET25").set(room("host", { settings: settings({ length: 101 }) })))
        await assertFails(anon("host").ref("triviaRooms/SET26").set(room("host", { settings: settings({ maxPlayers: 101 }) })))
        await assertFails(anon("host").ref("triviaRooms/SET27").set(room("host", { settings: settings({ types: "choice,hacking" }) })))
        await assertFails(anon("host").ref("triviaRooms/SET28").set(room("host", { settings: settings({ types: "" }) })))
        await seed("triviaRooms/RUN99", playing())
        await assertSucceeds(anon("host").ref("triviaRooms/RUN99/step").set({ index: 99, phase: "intro", at: TIMESTAMP }))
        await assertFails(anon("host").ref("triviaRooms/RUN99/step").set({ index: 100, phase: "intro", at: TIMESTAMP }))
    })

    test("a private room's password is written with it, and nobody reads it back", async () => {
        await assertSucceeds(anon("host").ref().update({ "triviaRooms/PRV23": room("host", { private: true }), "triviaRoomSecrets/PRV23": "hunter2" }))
        await assertFails(anon("host").ref("triviaRoomSecrets/PRV23").once("value"))
        await assertFails(anon("bob").ref("triviaRoomSecrets/PRV23").once("value"))
        // Nobody sets the password of somebody else's room.
        await seed("triviaRooms/OTH23", seeded({ private: true }))
        await assertFails(anon("mallory").ref("triviaRoomSecrets/OTH23").set("mine"))
    })

    test("players join an open lobby; a private one only with the right password", async () => {
        await seed("triviaRooms/PUB23", seeded())
        await assertSucceeds(anon("bob").ref("triviaRooms/PUB23/players/bob").set(seat("Bob")))
        await assertFails(anon("bob").ref("triviaRooms/PUB23/players/carol").set(seat("Carol")))

        await seed("triviaRooms/PRV23", seeded({ private: true }))
        await seed("triviaRoomSecrets/PRV23", "hunter2")
        await assertFails(anon("bob").ref("triviaRooms/PRV23/players/bob").set(seat("Bob")))
        await assertFails(anon("bob").ref("triviaRoomPass/PRV23/bob").set("guess"))
        await assertSucceeds(anon("bob").ref("triviaRoomPass/PRV23/bob").set("hunter2"))
        await assertSucceeds(anon("bob").ref("triviaRooms/PRV23/players/bob").set(seat("Bob")))
    })

    test("nobody new sits down once the game runs; the seated come and go", async () => {
        await seed("triviaRooms/RUN23", playing())
        await assertFails(anon("carol").ref("triviaRooms/RUN23/players/carol").set(seat("Carol")))
        await assertSucceeds(anon("bob").ref("triviaRooms/RUN23/players/bob/left").set(true))
        await assertSucceeds(anon("bob").ref("triviaRooms/RUN23/players/bob/left").set(false))
    })

    test("only the host moves the game on", async () => {
        await seed("triviaRooms/RUN23", playing())
        await assertSucceeds(anon("host").ref("triviaRooms/RUN23/step").set({ index: 0, phase: "board", at: TIMESTAMP }))
        await assertFails(anon("bob").ref("triviaRooms/RUN23/step").set({ index: 1, phase: "intro", at: TIMESTAMP }))
        await assertFails(anon("bob").ref("triviaRooms/RUN23/status").set("done"))
        await assertFails(anon("bob").ref("triviaRooms/RUN23/questions/0").set({ id: "eu-002", double: true }))
        await assertFails(anon("host").ref("triviaRooms/RUN23/step").set({ index: 1, phase: "intro", at: 5 }))
        await assertSucceeds(anon("host").ref("triviaRooms/RUN23/status").set("done"))
    })

    test("a seated player answers the open question once, for at most 400 points", async () => {
        await seed("triviaRooms/RUN23", playing())
        await assertFails(anon("bob").ref("triviaRooms/RUN23/answers/0/bob").set({ points: 401, share: 1, ms: 900 }))
        await assertSucceeds(anon("bob").ref("triviaRooms/RUN23/answers/0/bob").set({ points: 140, share: 1, ms: 900 }))
        await assertFails(anon("bob").ref("triviaRooms/RUN23/answers/0/bob").set({ points: 150, share: 1, ms: 800 }))
        // Not for somebody else, not for a question that is not open, not from the audience.
        await assertFails(anon("bob").ref("triviaRooms/RUN23/answers/0/host").set({ points: 10, share: 1, ms: 900 }))
        await assertFails(anon("bob").ref("triviaRooms/RUN23/answers/1/bob").set({ points: 10, share: 1, ms: 900 }))
        await assertFails(anon("carol").ref("triviaRooms/RUN23/answers/0/carol").set({ points: 10, share: 1, ms: 900 }))
    })

    test("no answers once the question has closed", async () => {
        await seed("triviaRooms/RUN23", playing({ step: { index: 0, phase: "board", at: Date.now() } }))
        await assertFails(anon("bob").ref("triviaRooms/RUN23/answers/0/bob").set({ points: 100, share: 1, ms: 900 }))
    })

    test("the host clears the answers for a new game; players cannot", async () => {
        await seed("triviaRooms/RUN23", playing({ answers: { 0: { bob: { points: 100, share: 1, ms: 1 } } } }))
        await assertFails(anon("bob").ref("triviaRooms/RUN23/answers").remove())
        await assertSucceeds(anon("host").ref("triviaRooms/RUN23").update({ status: "lobby", answers: null, questions: null, step: null, round: 2 }))
    })

    test("the host closes the room; anyone may sweep one left for six hours", async () => {
        await seed("triviaRooms/OLD23", seeded({ createdAt: Date.now() - 7 * 3600_000 }))
        await seed("triviaRooms/NEW23", seeded())
        await assertSucceeds(anon("passer-by").ref("triviaRooms/OLD23").remove())
        await assertFails(anon("passer-by").ref("triviaRooms/NEW23").remove())
        await assertSucceeds(anon("host").ref("triviaRooms/NEW23").remove())
    })
})

describe("triviaReports: a player flags a question", () => {
    const report = (uid, extra = {}) => ({ q: "eu-001", reason: "wrong-answer", note: "The answer looks wrong.", uid, at: TIMESTAMP, ...extra })

    test("a signed-in player files a report under their own uid", async () => {
        await assertSucceeds(anon("alice").ref("triviaReports").push(report("alice")))
        // The note is optional.
        await assertSucceeds(anon("alice").ref("triviaReports").push({ q: "ty-012", reason: "typo", uid: "alice", at: TIMESTAMP }))
        // Generated flag questions are reported by country: rf-de, jg-gb.
        await assertSucceeds(anon("alice").ref("triviaReports").push({ q: "rf-de", reason: "other", uid: "alice", at: TIMESTAMP }))
    })

    test("nobody reads them back from the site - they are checked in the console", async () => {
        await seed("triviaReports/r1", { q: "eu-001", reason: "typo", uid: "alice", at: 1 })
        await assertFails(anon("alice").ref("triviaReports").once("value"))
        await assertFails(anon("alice").ref("triviaReports/r1").once("value"))
        await assertFails(guest().ref("triviaReports").once("value"))
    })

    test("a report cannot be edited, deleted, forged or padded", async () => {
        await seed("triviaReports/r1", { q: "eu-001", reason: "typo", uid: "alice", at: 1 })
        await assertFails(anon("alice").ref("triviaReports/r1").set(report("alice")))
        await assertFails(anon("alice").ref("triviaReports/r1").remove())
        await assertFails(anon("bob").ref("triviaReports").push(report("alice")))
        await assertFails(guest().ref("triviaReports").push(report("alice")))
        await assertFails(anon("alice").ref("triviaReports").push(report("alice", { reason: "spam" })))
        await assertFails(anon("alice").ref("triviaReports").push(report("alice", { q: "not an id" })))
        await assertFails(anon("alice").ref("triviaReports").push(report("alice", { note: "x".repeat(501) })))
        await assertFails(anon("alice").ref("triviaReports").push(report("alice", { at: 1 })))
        await assertFails(anon("alice").ref("triviaReports").push(report("alice", { extra: true })))
    })
})
