// Folds one account's leaderboard rows into another's: a player who played
// in two browsers before signing in ends up with two uids, and the rules let
// nobody delete a row, so both stay on every board. Per board this keeps one
// row under <intoUid> with the better of the two times (time, then mistakes)
// and removes the rest of <fromUid>'s rows there.
//
//   node scripts/merge-player.mjs <fromUid> <intoUid> --key service.json          # prints the plan
//   node scripts/merge-player.mjs <fromUid> <intoUid> --key service.json --apply  # writes it
//
// Swap `--key service.json` for `--emulator` to work on the local emulator.
// Uids come from `node scripts/grant-supporter.mjs --find "<name>"`.
//
// Only `highscores` is touched. World Conqueror land, PvP games and the cloud
// save stay with the uid that made them; the script lists what else the old
// uid still holds so nothing is lost silently.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const uids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--key");
const [fromUid, intoUid] = uids;
const emulator = args.includes("--emulator");
const apply = args.includes("--apply");
const keyPath = valueOf("--key");

function usage(message) {
    if (message) console.error(message);
    console.error("Usage: node scripts/merge-player.mjs <fromUid> <intoUid> (--emulator | --key service-account.json) [--apply]");
    process.exit(1);
}
if (!emulator && !keyPath) usage("Needs --emulator or --key <service-account.json>.");
for (const uid of [fromUid, intoUid]) if (!uid || !/^[A-Za-z0-9]{1,128}$/.test(uid)) usage("Needs two uids.");
if (fromUid === intoUid) usage("The two uids are the same.");

// --- The same small database interface as grant-supporter.mjs ---

let db;
if (emulator) {
    const call = async (path, method, body) => {
        const res = await fetch(`http://127.0.0.1:9000/${path}.json?ns=demo-flaglearn-default-rtdb`, {
            method,
            headers: { Authorization: "Bearer owner" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json();
    };
    db = {
        get: (path) => call(path, "GET"),
        update: (path, patch) => call(path, "PATCH", patch),
        close: async () => {},
    };
} else {
    const env = Object.fromEntries(
        readFileSync(new URL("../.env", import.meta.url), "utf8")
            .split(/\r?\n/)
            .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/))
            .filter(Boolean)
            .map((m) => [m[1], m[2]]),
    );
    const { cert, initializeApp } = await import("firebase-admin/app");
    const { getDatabase } = await import("firebase-admin/database");
    initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))), databaseURL: env.VITE_FIREBASE_DATABASE_URL });
    const admin = getDatabase();
    db = {
        get: async (path) => (await admin.ref(path).once("value")).val(),
        update: (path, patch) => admin.ref(path).update(patch),
        close: () => admin.app.delete(),
    };
}

const fmt = (row) => `${row.bestTimeSeconds}s, ${row.mistakes} mistakes`;
const better = (a, b) => a.bestTimeSeconds - b.bestTimeSeconds || a.mistakes - b.mistakes;

const boards = (await db.get("highscores")) ?? {};
const patch = {};
for (const [board, rows] of Object.entries(boards)) {
    const theirs = Object.entries(rows ?? {})
        .filter(([, row]) => row?.uid === fromUid || row?.uid === intoUid)
        .map(([key, row]) => ({ key, ...row }));
    if (!theirs.some((r) => r.uid === fromUid)) continue;

    theirs.sort(better);
    const best = theirs[0];
    // Keep the key the right account already writes to; the page looks rows up by uid, so any key works.
    const kept = theirs.find((r) => r.uid === intoUid) ?? best;
    const { key: _key, ...bestRow } = best;
    patch[`${board}/${kept.key}`] = { ...bestRow, name: kept.name, playerId: kept.key, uid: intoUid };
    for (const r of theirs) if (r.key !== kept.key) patch[`${board}/${r.key}`] = null;

    const source = best.uid === intoUid ? "already the right account's" : "taken from the old account";
    console.log(`${board}: keeps ${fmt(best)} (${source}) as ${kept.key}; removes ${theirs.length - 1} row(s)`);
}

if (Object.keys(patch).length === 0) console.log(`No leaderboard rows under ${fromUid}.`);

// What else the old uid still holds - reported, not moved.
const elsewhere = [];
if (await db.get(`supporters/${fromUid}`)) elsewhere.push("supporters (a supporter row)");
if (await db.get(`users/${fromUid}`)) elsewhere.push("users (a cloud save)");
const hall = (await db.get("flagWars/hallOfFame")) ?? {};
const won = Object.entries(hall).filter(([, row]) => row?.winnerId === fromUid).map(([id]) => id);
if (won.length) elsewhere.push(`flagWars/hallOfFame (won ${won.join(", ")})`);
if (elsewhere.length) console.log(`\nThe old uid also holds: ${elsewhere.join("; ")}. Not moved.`);

if (!apply) {
    console.log("\nNothing written. Add --apply to write it.");
} else if (Object.keys(patch).length) {
    await db.update("highscores", patch); // one atomic multi-path update
    console.log(`\nWritten${emulator ? " (emulator)" : ""}.`);
}

await db.close();
