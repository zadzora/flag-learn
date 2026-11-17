import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import TopBar from "../components/TopBar"
import SiteFooter from "../components/SiteFooter"
import { SUPPORT_PRICE_EUR } from "../utils/supporterLook"

/**
 * The terms. Like the privacy policy, written for players: the game is free,
 * and the one thing sold - the supporter perks - is described here, together
 * with what happens if the site ever closes. Keep it true to the code and to
 * the support page: when the perks or the way they are sold change, this page
 * changes with them.
 *
 * The sale itself runs on Stripe Managed Payments (api/checkout.ts): Stripe is
 * the seller of record, so the payment, VAT, receipts and refunds are Stripe's,
 * and these terms cover what the payment unlocks.
 */

const THEME_KEY = "flag-master-theme"
const CONTACT = "flaglearn@gmail.com"
const UPDATED = "17 November 2026"
/** If the site closes, payments made this many days before payments stop are refunded. */
const REFUND_DAYS = 30

const muted = "text-slate-500 dark:text-[#8C97B3]"
const link = "font-semibold text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="mt-10">
            <h2 className="mb-3 !text-xl font-bold tracking-[-0.01em]">{title}</h2>
            <div className="flex flex-col gap-3 leading-relaxed">{children}</div>
        </section>
    )
}

const Mail = () => <a href={`mailto:${CONTACT}`} className={link}>{CONTACT}</a>

function External({ href, children }: { href: string; children: ReactNode }) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={link}>{children}</a>
}

export default function Terms() {
    const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light")
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Terms" theme={theme} onToggleTheme={() => setTheme(t => (t === "light" ? "dark" : "light"))} />

            <main className="mx-auto w-full max-w-[760px] flex-1 px-4 pb-16 pt-8 text-[15px] sm:px-6">
                <h1 className="!text-3xl font-extrabold tracking-[-0.02em]">Terms</h1>
                <p className={`mt-1 text-sm ${muted}`}>Last updated {UPDATED}</p>
                <p className="mt-5 leading-relaxed">
                    Flag Learn (flaglearn.eu) is a free learning game run by David Zadzora. These terms say what you can expect from it, and what the
                    optional supporter payment gives you. Questions: <Mail />. How your data is handled is in the{" "}
                    <Link to="/privacy" className={link}>privacy policy</Link>.
                </p>

                <Section title="The short version">
                    <ul className="ml-5 list-disc space-y-1.5">
                        <li>Every mode is free to play today. Supporting is optional and gives looks only - never an advantage.</li>
                        <li>The supporter payment is a one-time payment, not a subscription. Nothing renews and nothing is charged again.</li>
                        <li>The perks are yours for as long as Flag Learn runs.</li>
                        <li>Stripe sells the perks on Flag Learn's behalf and takes care of the payment, the VAT, the receipt and refunds.</li>
                    </ul>
                </Section>

                <Section title="Using the game">
                    <p>
                        You can play without an account. Modes, questions and features change over time - some are added, some are reworked, and now and
                        then one is retired. The game is provided as it is; I do my best to keep it running and correct, but cannot
                        promise that it is always available or free of mistakes.
                    </p>
                    <p>
                        In the online modes other players see your nickname. Do not use one that is offensive, impersonates someone or advertises
                        something; such a nickname may be hidden or reset, and results obtained by cheating may be removed from leaderboards.
                    </p>
                </Section>

                <Section title="What the supporter payment gives you">
                    <p>
                        A one-time payment of at least €{SUPPORT_PRICE_EUR} (you may choose to pay more; the perks are the same) unlocks the supporter
                        perks on the Google account you were signed in with when you paid:
                    </p>
                    <ul className="ml-5 list-disc space-y-1.5">
                        <li>your own letter colour and tint for your name on the leaderboards and in the online modes, and a supporter heart;</li>
                        <li>a companion animal shown beside your name and in some modes;</li>
                        <li>the Racer car and the supporter paints in the Road Trip;</li>
                        <li>supporter looks added later, while they are offered.</li>
                    </ul>
                    <p>
                        They are cosmetic only. What you get is a personal right to use these perks inside Flag Learn, for as long as Flag Learn is
                        available. It is not ownership of anything, it has no value in money, and it cannot be sold or moved to another account. The
                        perks are unlocked straight after the payment.
                    </p>
                    <p>
                        Looks may be redrawn, renamed or replaced by similar ones as the game develops. Your supporter status itself is not taken away,
                        except as described under refunds below.
                    </p>
                </Section>

                <Section title="Who sells it, and refunds">
                    <p>
                        The payment is made on Stripe's checkout page. Stripe acts as the seller (merchant of record, through Stripe Managed Payments):
                        your purchase contract and payment are with Stripe under{" "}
                        <External href="https://stripe.com/legal">Stripe's terms</External>, Stripe charges and pays the VAT of your country (the price
                        includes it) and sends the receipt. Refund requests go to Stripe through the link in the receipt, or to me at <Mail /> and I
                        will help.
                    </p>
                    <p>
                        Your rights as a consumer under the law of the country you live in - including any right to withdraw from the purchase and your
                        rights if the perks do not work as described - are not affected by anything on this page.
                    </p>
                    <p>
                        If something does not show up after paying, write to me before contacting your bank, and I will sort it out. If a payment is
                        refunded or reversed (a chargeback), the perks it unlocked are removed.
                    </p>
                </Section>

                <Section title="If Flag Learn closes">
                    <p>
                        I intend to keep Flag Learn running, but nobody can promise forever. If it ever has to close, or the supporter perks have to end:
                    </p>
                    <ul className="ml-5 list-disc space-y-1.5">
                        <li>supporter payments stop as soon as it is decided;</li>
                        <li>payments made in the {REFUND_DAYS} days before that are refunded.</li>
                    </ul>
                    <p>Earlier payments are not refunded: they were for perks you had the use of.</p>
                </Section>

                <Section title="Liability">
                    <p>
                        Flag Learn is a free hobby project. As far as the law allows, I am not liable for losses that come from using it or from it being
                        unavailable, and for the supporter perks my liability is limited to what you paid. This does not limit liability that the law
                        does not allow to be limited, such as for intent or gross negligence.
                    </p>
                </Section>

                <Section title="Law">
                    <p>
                        These terms are governed by Slovak law. If you are a consumer, you also keep the protection of the mandatory rules of the country
                        you live in, and you may bring a claim before the courts there.
                    </p>
                </Section>

                <Section title="Changes">
                    <p>
                        When these terms change, this page and its date are updated. A change never
                        takes away perks you have already paid for.
                    </p>
                </Section>
            </main>

            <SiteFooter />
        </div>
    )
}
