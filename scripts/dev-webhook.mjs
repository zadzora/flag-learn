// Runs the payment functions in api/ (checkout.ts and stripe-webhook.ts) on this
// machine, against the auth and database emulators, so a test payment can be
// followed end to end without deploying:
//
//   npm run emulators                       # terminal 1
//   npm run dev:emu                         # terminal 2 (the site; Vite passes /api/* on to port 8787)
//   stripe listen --forward-to localhost:8787/api/stripe-webhook     # terminal 3
//   npm run webhook:dev                     # terminal 4, with the keys below
//
// `stripe listen` prints the whsec_ to use. The keys can also go in
// `.env.local` (gitignored) as STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET.
// Test keys only: this writes to the emulator, never to the live database.
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";

const local = new URL("../.env.local", import.meta.url);
if (existsSync(local)) {
    for (const line of readFileSync(local, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*(STRIPE_[A-Z_]+)\s*=\s*"?(.*?)"?\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
}
if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_live")) {
    console.error("A live key - this runner is for test mode only.");
    process.exit(1);
}

process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_DATABASE_URL = "http://127.0.0.1:9000?ns=demo-flaglearn-default-rtdb";

const routes = {
    "/api/stripe-webhook": (await import("../api/stripe-webhook.ts")).POST,
    "/api/checkout": (await import("../api/checkout.ts")).POST,
};
const PORT = 8787;

createServer(async (req, res) => {
    const POST = routes[req.url];
    if (req.method !== "POST" || !POST) {
        res.writeHead(404).end();
        return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const response = await POST(new Request(`http://localhost:${PORT}${req.url}`, {
        method: "POST",
        headers: Object.entries(req.headers).filter(([, v]) => typeof v === "string"),
        body: Buffer.concat(chunks),
    }));
    const text = await response.text();
    console.log(`${new Date().toLocaleTimeString()}  ${response.status} ${text}`);
    res.writeHead(response.status, { "content-type": "text/plain" }).end(text);
}).listen(PORT, () => console.log(`Payment functions on http://localhost:${PORT}/api/* (emulator auth and database)`));
