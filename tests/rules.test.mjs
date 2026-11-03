// The database rules, against the emulator: `npm run test:rules` (needs Java).
import { readFileSync } from "node:fs"
import { after, before, beforeEach, describe, test } from "node:test"
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing"
import { CLOUD_KEYS, ROAD_TRIP_LIMIT, VALUE_LIMIT } from "../src/utils/cloudMerge.ts"

let env
const TIMESTAMP = { ".sv": "timestamp" }

before(async () => {
    env = await initializeTestEnvironment({
        projectId: "demo-flaglearn",
        // Spelled out: discovery through the emulator hub picks `localhost`, which Node may resolve to IPv6.
        hub: { host: "127.0.0.1", port: 4400 },
        database: { host: "127.0.0.1", port: 9000, rules: readFileSync(new URL("../firebase-realtime.rules.json", import.meta.url), "utf8") },
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
        await assertSucceeds(google("alice").ref("users/alice").remove())
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
        await assertSucceeds(anon("ann").ref("highscores/capmap-oceania/p1").set(row("p1", "ann")))
        await assertFails(anon("ann").ref("highscores/map-oceania/p1").set(row("p1", "ann")))
    })
})

describe("dailyStats", () => {
    test("only the daily games that exist", async () => {
        await assertSucceeds(guest().ref("dailyStats/flagle/2026-11-03/g1").set(1))
        await assertSucceeds(guest().ref("dailyStats/road-trip-rally/2026-11-03/best").set(60_000))
        await assertFails(guest().ref("dailyStats/made-up/2026-11-03/g1").set(1))
    })
})
