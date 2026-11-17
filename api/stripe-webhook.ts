/**
 * Stripe -> Flag Learn: turns a finished payment into a supporter.
 *
 * The Checkout Session (`api/checkout.ts`) carries the player's uid as
 * `client_reference_id`. When Stripe reports the payment,
 * this writes, with admin rights the database rules give no client:
 *
 *   supporters/<uid>/since            - set once, never moved (the perks)
 *   supporterLedger/<uid>/<session>   - one row per payment, private
 *   supportFund/<YYYY-MM>             - euro cents per month, VAT included, private (the console's overview)
 *
 * Stripe retries a webhook until it gets a 2xx, so every step is safe to run
 * twice: `since` is only set when missing, and the ledger row - keyed by the
 * Checkout Session - decides whether the month's total has counted it yet.
 * The perk is written first, so a failure half way never leaves a paying
 * player without it; the retry finishes the rest.
 *
 * Environment (Vercel project settings):
 *   STRIPE_SECRET_KEY            sk_live_... (sk_test_... on previews)
 *   STRIPE_WEBHOOK_SECRET        whsec_... of this endpoint
 *   FIREBASE_SERVICE_ACCOUNT     the service account JSON, on one line
 *   FIREBASE_DATABASE_URL        same as VITE_FIREBASE_DATABASE_URL
 */
import Stripe from "stripe"
import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getDatabase, ServerValue } from "firebase-admin/database"

/** The fields of a Checkout Session this reads. */
type Session = {
    id: string
    client_reference_id: string | null
    amount_total: number | null
    currency: string | null
    /** Set when the buyer paid in their own currency (Adaptive Pricing, always on under Managed Payments). */
    currency_conversion?: { amount_total: number; source_currency: string } | null
    payment_status: string
    created: number
}

/**
 * What the payment was worth in euro cents, VAT included. The session is priced
 * in euros, but under Managed Payments a buyer may pay in their own currency;
 * then `amount_total` is in theirs and the euros are in `currency_conversion`.
 */
function euroCents(session: Session): number | null {
    if (session.currency === "eur") return session.amount_total
    const conversion = session.currency_conversion
    return conversion?.source_currency === "eur" ? conversion.amount_total : null
}

const UID = /^[A-Za-z0-9]{1,128}$/

function database() {
    if (!getApps().length) {
        // Locally (`scripts/dev-webhook.mjs`) the emulator hosts are set and the admin SDK needs no key.
        // Kept in each function rather than shared: a cross-file import needs an extension in Node and none on Vercel.
        const emulator = !!process.env.FIREBASE_DATABASE_EMULATOR_HOST
        initializeApp({
            ...(emulator ? { projectId: "demo-flaglearn" } : { credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? "{}")) }),
            databaseURL: process.env.FIREBASE_DATABASE_URL,
        })
    }
    return getDatabase()
}

const reply = (status: number, text: string) => new Response(text, { status, headers: { "content-type": "text/plain" } })

export async function POST(request: Request): Promise<Response> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    const key = process.env.STRIPE_SECRET_KEY
    if (!secret || !key) return reply(500, "Webhook is not configured")

    // The signature is over the exact bytes Stripe sent, so read the body raw.
    const body = await request.text()
    let event: { type: string; data: { object: unknown } }
    try {
        event = new Stripe(key).webhooks.constructEvent(body, request.headers.get("stripe-signature") ?? "", secret)
    } catch {
        return reply(400, "Bad signature")
    }

    // Card payments arrive as `completed` + paid; slower methods (bank transfers) complete first and pay later.
    const paid =
        (event.type === "checkout.session.completed" && (event.data.object as Session).payment_status === "paid") ||
        event.type === "checkout.session.async_payment_succeeded"
    if (!paid) return reply(200, "Ignored")

    const session = event.data.object as Session
    const uid = session.client_reference_id
    if (!uid || !UID.test(uid)) {
        // Paid without an account (an old link, a link shared by hand). Granted by hand: scripts/grant-supporter.mjs.
        console.warn(`Payment ${session.id} has no usable client_reference_id - grant it manually.`)
        return reply(200, "No account on the payment")
    }

    const db = database()
    const at = session.created * 1000
    try {
        await db.ref(`supporters/${uid}/since`).transaction(current => current ?? at)

        const eur = euroCents(session)
        const ledger = await db.ref(`supporterLedger/${uid}/${session.id}`).transaction(current =>
            current ?? { amount: session.amount_total ?? 0, currency: session.currency ?? "", ...(eur !== null ? { eur } : {}), at },
        )
        // `counted` is set in the same write as the month's total, so a retry never adds it twice.
        const counted = ledger.snapshot.child("counted").val() === true
        if (!counted && eur) {
            const month = new Date(at).toISOString().slice(0, 7)
            await db.ref().update({
                [`supportFund/${month}`]: ServerValue.increment(eur),
                [`supporterLedger/${uid}/${session.id}/counted`]: true,
            })
        }
    } catch (error) {
        console.error("Writing the supporter failed", error)
        return reply(500, "Database write failed")
    }
    return reply(200, "OK")
}
