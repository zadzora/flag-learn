// Makes a player a supporter by hand - or takes it back - and gives the
// exclusive animals (EXCLUSIVE_PETS in src/utils/supporterLook.ts, today the
// sea turtle and the sloth) that no payment unlocks. For a payment that arrived without an
// account on it (the webhook logs those), a refund, a gift, or trying the
// cosmetics against the emulator.
//
//   node scripts/grant-supporter.mjs <uid> --key service.json                  # supporter, free
//   node scripts/grant-supporter.mjs <uid> --unlock turtle --key service.json  # + the sea turtle (makes them a supporter too)
//   node scripts/grant-supporter.mjs <uid> --lock turtle --key service.json    # takes the turtle back
//   node scripts/grant-supporter.mjs <uid> --revoke --key service.json         # no longer a supporter
//   node scripts/grant-supporter.mjs --find "Name" --key service.json          # uid(s) behind a leaderboard name
//   node scripts/grant-supporter.mjs --list --key service.json                 # every supporter and what they hold
//
// Swap `--key service.json` for `--emulator` to work on the local emulator.
//
// Everything here needs the service account key, which is the whole point:
// the database rules give no client - console, script or otherwise - a way to
// write `since` or `unlocks`, so nothing typed into a browser unlocks anything.
//
// The uid is on the player's /support page (under "I paid, but nothing
// changed") once they are signed in, or found by name with --find. The live
// database URL is read from VITE_FIREBASE_DATABASE_URL in .env. Granting never
// touches `supportFund` - money that did not come through Stripe is not
// hosting covered.
import { readFileSync } from "node:fs";

const EXCLUSIVE = ["turtle", "sloth"]; // mirrors EXCLUSIVE_PETS and the rules' regex

const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const VALUE_FLAGS = ["--key", "--unlock", "--lock", "--find"];
const uid = args.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(args[i - 1]));
const revoke = args.includes("--revoke");
const list = args.includes("--list");
const emulator = args.includes("--emulator");
const keyPath = valueOf("--key");
const unlock = valueOf("--unlock");
const lock = valueOf("--lock");
const find = valueOf("--find");

function usage(message) {
    if (message) console.error(message);
    console.error(
        "Usage: node scripts/grant-supporter.mjs <uid> [--revoke | --unlock <animal> | --lock <animal>] (--emulator | --key service-account.json)\n" +
        "       node scripts/grant-supporter.mjs --find <name> | --list (--emulator | --key service-account.json)",
    );
    process.exit(1);
}

if (!emulator && !keyPath) usage("Needs --emulator or --key <service-account.json>.");
for (const pet of [unlock, lock]) if (pet && !EXCLUSIVE.includes(pet)) usage(`Unknown exclusive animal "${pet}" - one of: ${EXCLUSIVE.join(", ")}.`);
if (!find && !list) {
    if (!uid || !/^[A-Za-z0-9]{1,128}$/.test(uid)) usage("Needs a uid.");
    if ([revoke, unlock, lock].filter(Boolean).length > 1) usage("Pick one of --revoke, --unlock, --lock.");
}

// --- One small database interface over the emulator's REST API or the admin SDK ---

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
        set: (path, value) => call(path, "PUT", value),
        remove: (path) => call(path, "DELETE"),
        setIfMissing: async (path, value) => ((await call(path, "GET")) ?? call(path, "PUT", value)),
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
        set: (path, value) => admin.ref(path).set(value),
        remove: (path) => admin.ref(path).remove(),
        setIfMissing: (path, value) => admin.ref(path).transaction((current) => current ?? value),
        close: () => admin.app.delete(),
    };
}

const where = emulator ? " (emulator)" : "";

if (find) {
    // Leaderboard rows carry the account's uid; a name can sit on several boards and under several accounts.
    const boards = (await db.get("highscores")) ?? {};
    const needle = find.trim().toLowerCase();
    const hits = new Map();
    for (const [board, rows] of Object.entries(boards)) {
        for (const row of Object.values(rows ?? {})) {
            if (typeof row?.name !== "string" || typeof row?.uid !== "string") continue;
            if (!row.name.toLowerCase().includes(needle)) continue;
            const hit = hits.get(row.uid) ?? { names: new Set(), boards: [] };
            hit.names.add(row.name);
            hit.boards.push(board);
            hits.set(row.uid, hit);
        }
    }
    if (hits.size === 0) console.log(`Nobody named like "${find}" on a leaderboard${where}. Ask them for the ID on their /support page.`);
    for (const [id, hit] of hits) console.log(`${id}  ${[...hit.names].join(" / ")}  (${hit.boards.join(", ")})`);
} else if (list) {
    const rows = (await db.get("supporters")) ?? {};
    const all = Object.entries(rows).filter(([, row]) => typeof row?.since === "number");
    if (all.length === 0) console.log(`No supporters yet${where}.`);
    for (const [id, row] of all) {
        const extras = Object.keys(row.unlocks ?? {}).filter((k) => row.unlocks[k] === true);
        console.log(`${id}  since ${new Date(row.since).toISOString().slice(0, 10)}  pet: ${row.look?.pet ?? "-"}${extras.length ? `  unlocked: ${extras.join(", ")}` : ""}`);
    }
} else if (revoke) {
    await db.remove(`supporters/${uid}`);
    console.log(`Revoked: ${uid}${where}`);
} else if (lock) {
    await db.remove(`supporters/${uid}/unlocks/${lock}`);
    // A look still showing it is dropped by the page (readLook); clear it so the row says what is shown.
    if ((await db.get(`supporters/${uid}/look/pet`)) === lock) await db.set(`supporters/${uid}/look/pet`, "none");
    console.log(`Locked ${lock} for ${uid}${where}`);
} else {
    // An exclusive animal is shown beside a supporter's name, so it makes them one.
    await db.setIfMissing(`supporters/${uid}/since`, Date.now());
    if (unlock) await db.set(`supporters/${uid}/unlocks/${unlock}`, true);
    console.log(`Granted${unlock ? ` ${unlock} to` : ":"} ${uid}${where}`);
}

await db.close();
