// Loads firebase-realtime.rules.json into the running database emulator, into
// the namespace `npm run dev:emu` uses. Without this the emulator leaves that
// namespace wide open and a wrong room password or a forbidden write would
// appear to work. Waits up to a minute for `npm run emulators` to come up.
import { readFile } from "node:fs/promises";

const NS = "demo-flaglearn-default-rtdb";
const URL = `http://127.0.0.1:9000/.settings/rules.json?ns=${NS}`;
const rules = await readFile(new globalThis.URL("../firebase-realtime.rules.json", import.meta.url), "utf8");

for (let attempt = 0; ; attempt++) {
    try {
        const res = await fetch(URL, { method: "PUT", headers: { Authorization: "Bearer owner" }, body: rules });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        console.log(`Rules loaded into the database emulator (ns=${NS}).`);
        break;
    } catch (error) {
        if (attempt === 0) console.log("Waiting for the emulators (npm run emulators)...");
        if (attempt >= 60) {
            console.error("Could not load the rules into the emulator:", error.message ?? error);
            process.exit(1);
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
}
