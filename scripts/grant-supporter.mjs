// Makes a player a supporter by hand - or takes it back. For a payment that
// arrived without an account on it (the webhook logs those), a refund, a gift,
// or trying the cosmetics against the emulator.
//
//   node scripts/grant-supporter.mjs <uid> --emulator            # local emulator (npm run emulators)
//   node scripts/grant-supporter.mjs <uid> --key service.json    # the live database
//   node scripts/grant-supporter.mjs <uid> --revoke --key service.json
//
// The uid is on the player's /support page (under "I paid, but nothing changed").
// The live database URL is read from VITE_FIREBASE_DATABASE_URL in .env.
// Granting never touches `supportFund` - money that did not come through
// Stripe is not hosting covered.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const uid = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--key");
const revoke = args.includes("--revoke");
const emulator = args.includes("--emulator");
const keyPath = args.includes("--key") ? args[args.indexOf("--key") + 1] : null;

if (!uid || !/^[A-Za-z0-9]{1,128}$/.test(uid) || (!emulator && !keyPath)) {
    console.error("Usage: node scripts/grant-supporter.mjs <uid> [--revoke] (--emulator | --key service-account.json)");
    process.exit(1);
}

const path = `supporters/${uid}`;

if (emulator) {
    const url = `http://127.0.0.1:9000/${path}.json?ns=demo-flaglearn-default-rtdb`;
    const res = await fetch(url, {
        method: revoke ? "DELETE" : "PATCH",
        headers: { Authorization: "Bearer owner" },
        body: revoke ? undefined : JSON.stringify({ since: Date.now() }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
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
    const ref = getDatabase().ref(path);
    if (revoke) await ref.remove();
    else await ref.child("since").transaction((current) => current ?? Date.now());
    await getDatabase().app.delete();
}

console.log(`${revoke ? "Revoked" : "Granted"}: ${uid}${emulator ? " (emulator)" : ""}`);
