/**
 * Starts a supporter payment: a Stripe Checkout Session for the amount the
 * player picked on /support (at least SUPPORT_PRICE_EUR, the rest a tip).
 *
 * A Payment Link cannot be handed an amount, which is why this exists: the
 * page shows the amount and the "+ €1 / + €2 / + €5 / + €10" buttons, and the
 * session is made for exactly that sum. The player is identified by their
 * Firebase ID token, not by a uid the page could make up, and the uid goes on
 * the session as `client_reference_id` for `api/stripe-webhook.ts`.
 *
 * The sale goes through Stripe Managed Payments: Stripe is the merchant of
 * record, so it is the seller on the receipt, works out and pays the VAT of
 * the buyer's country, and handles receipts, refunds and disputes. That needs
 * an eligible product tax code on the line (`TAX_CODE`), and it decides the
 * payment methods itself, so none are listed here. The price is tax-inclusive:
 * the player pays exactly the amount they picked, VAT taken out of it. Setting
 * STRIPE_MANAGED_PAYMENTS=0 falls back to a plain Checkout Session (no tax
 * handled) - for an account Managed Payments has not been switched on for.
 *
 * Environment: STRIPE_SECRET_KEY, FIREBASE_SERVICE_ACCOUNT, FIREBASE_DATABASE_URL,
 * optionally STRIPE_MANAGED_PAYMENTS.
 */
import Stripe from "stripe"
import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"

/** Mirrors SUPPORT_PRICE_EUR in src/utils/supporterLook.ts, in cents. */
const MIN_CENTS = 300
/** A typo guard, not a policy: nobody means to give €5000 by accident. */
const MAX_CENTS = 50000
const SITE = "https://flaglearn.eu"
/**
 * "General - Electronically Supplied Services": a digital service delivered over
 * the internet with minimal human involvement - cosmetic perks in a browser
 * game. Must be one Managed Payments lists as eligible
 * (docs.stripe.com/payments/managed-payments/eligibility#eligible-tax-codes).
 */
const TAX_CODE = "txcd_10000000"

function auth() {
    if (!getApps().length) {
        // Locally the emulator hosts are set and the admin SDK needs no key.
        const emulator = !!process.env.FIREBASE_AUTH_EMULATOR_HOST
        initializeApp({
            ...(emulator ? { projectId: "demo-flaglearn" } : { credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? "{}")) }),
            databaseURL: process.env.FIREBASE_DATABASE_URL,
        })
    }
    return getAuth()
}

/** Where Stripe sends the player back: the site they came from, if it is one of ours. */
function returnBase(origin: string | null): string {
    if (!origin) return SITE
    try {
        const url = new URL(origin)
        const ours =
            url.hostname === "flaglearn.eu" || url.hostname === "www.flaglearn.eu" ||
            url.hostname.endsWith(".vercel.app") ||
            ((url.hostname === "localhost" || /^(127|10|192\.168)\./.test(url.hostname)) && url.protocol === "http:")
        return ours ? url.origin : SITE
    } catch {
        return SITE
    }
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

export async function POST(request: Request): Promise<Response> {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) return json(503, { error: "not-configured" })

    let uid: string
    try {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "")
        const decoded = await auth().verifyIdToken(token)
        // The perks live in the account, so the account must survive cleared site data: Google, not anonymous.
        if (decoded.firebase.sign_in_provider !== "google.com" && !decoded.email_verified) return json(403, { error: "google-only" })
        uid = decoded.uid
    } catch {
        return json(401, { error: "signed-out" })
    }

    let cents: number
    try {
        const body = (await request.json()) as { cents?: unknown }
        cents = Math.round(Number(body.cents))
    } catch {
        return json(400, { error: "bad-amount" })
    }
    if (!Number.isFinite(cents) || cents < MIN_CENTS || cents > MAX_CENTS) return json(400, { error: "bad-amount" })

    const base = returnBase(request.headers.get("origin"))
    try {
        const managed = process.env.STRIPE_MANAGED_PAYMENTS !== "0"
        const session = await new Stripe(key).checkout.sessions.create({
            mode: "payment",
            client_reference_id: uid,
            metadata: { uid },
            ...(managed ? { managed_payments: { enabled: true } } : {}),
            line_items: [{
                quantity: 1,
                price_data: {
                    currency: "eur",
                    unit_amount: cents,
                    tax_behavior: "inclusive",
                    product_data: {
                        name: "Flag Learn supporter",
                        description: "One-time payment: name colours, a companion animal, the Racer. Cosmetic only.",
                        tax_code: TAX_CODE,
                    },
                },
            }],
            success_url: `${base}/support?thanks=1`,
            cancel_url: `${base}/support`,
        })
        return json(200, { url: session.url })
    } catch (error) {
        console.error("Creating the Checkout Session failed", error)
        return json(502, { error: "stripe" })
    }
}
