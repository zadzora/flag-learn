import { useEffect, useState, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router-dom"
import type { User } from "firebase/auth"
import { Car, Check, Gift, Heart, Loader2, Medal, PawPrint, Sparkles, Trophy } from "lucide-react"
import TopBar from "../components/TopBar"
import SiteFooter from "../components/SiteFooter"
import { GoogleButton } from "../components/AccountPanel"
import { LookedName } from "../components/SupporterName"
import { isGoogleUser, observeSession } from "../../lib/firebase"
import { connectGoogle } from "../utils/cloudSave"
import { checkoutUrl, saveLook, useMonthFund, useSupporter } from "../utils/supporters"
import { MONTHLY_GOAL_EUR, NAME_COLOURS, PETS, SUPPORT_PRICE_EUR, type SupporterLook } from "../utils/supporterLook"

/**
 * The support page: what a supporter gets, the one payment, and - once paid -
 * where they pick their look. Reached from the footer, the profile and any
 * supporter's name on a leaderboard; nothing else in the game points here.
 *
 * Paying needs a Google account, because the perks belong to an account and
 * must survive cleared browser data. The payment itself is Stripe's page; the
 * webhook (`api/stripe-webhook.ts`) writes `supporters/<uid>` and this page
 * simply watches that row turn up.
 */

const THEME_KEY = "flag-master-theme"
const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-[#1C2338] dark:bg-[#0F1424]"
const muted = "text-slate-500 dark:text-[#8C97B3]"
const primary = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-base font-bold text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:border-slate-500 disabled:opacity-60 dark:border-[#2A3352] dark:hover:border-[#4A5680]"

function useSession(): User | null {
    const [user, setUser] = useState<User | null>(null)
    useEffect(() => observeSession(setUser), [])
    return user
}

const euros = (cents: number) => `€${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`

/** A leaderboard row as the game draws one, for the examples. */
function Row({ rank, children, time }: { rank: number; children: ReactNode; time: string }) {
    return (
        <li className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 items-center gap-3">
                <span className={`w-6 shrink-0 text-xs font-bold tabular-nums ${rank === 1 ? "text-amber-500" : "text-slate-400 dark:text-slate-500"}`}>#{rank}</span>
                <span className="inline-flex min-w-0 items-center gap-1">{children}</span>
            </span>
            <span className="font-mono text-sm font-bold tabular-nums">{time}</span>
        </li>
    )
}

function Perk({ icon, title, children, example }: { icon: ReactNode; title: string; children: ReactNode; example?: ReactNode }) {
    return (
        <li className={`${panel} p-5`}>
            <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-300">{icon}</span>
                <div className="min-w-0 flex-1">
                    <h3 className="!text-base font-bold">{title}</h3>
                    <p className={`mt-0.5 text-sm ${muted}`}>{children}</p>
                </div>
            </div>
            {example && <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 dark:border-[#232B45] dark:bg-[#0B1020]">{example}</div>}
        </li>
    )
}

export default function Support() {
    const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light")
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const [params] = useSearchParams()
    const returning = params.get("thanks") === "1"
    const user = useSession()
    const google = isGoogleUser(user) ? user : null
    const supporter = useSupporter(user?.uid)

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Support" theme={theme} onToggleTheme={() => setTheme(t => (t === "light" ? "dark" : "light"))} />

            <main className="mx-auto w-full max-w-[1000px] flex-1 px-4 pb-16 pt-8 sm:px-6">
                <div className="max-w-[640px]">
                    <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-rose-500"><Heart size={14} className="fill-rose-500" aria-hidden /> Support Flag Learn</p>
                    <h1 className="mt-2 !text-3xl font-extrabold tracking-[-0.02em] sm:!text-4xl">Keep it free, get a little sparkle</h1>
                    <p className={`mt-3 leading-relaxed ${muted}`}>
                        Flag Learn has no ads and every mode is free - that does not change. Running it costs about €{MONTHLY_GOAL_EUR} a month.
                        If you would like to help, a one-time €{SUPPORT_PRICE_EUR} makes you a supporter for good, and you get a few things to show for it.
                    </p>
                </div>

                <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_340px]">
                    <section aria-labelledby="perks" className="min-w-0">
                        <h2 id="perks" className="mb-3 !text-xl font-bold">What you get</h2>
                        <ul className="grid gap-3">
                            <Perk icon={<Sparkles size={18} aria-hidden />} title="Your name in colour on every leaderboard" example={
                                <ol className="divide-y divide-slate-200 dark:divide-[#1C2338]">
                                    <Row rank={1} time="4:12"><LookedName look={{ color: "gold", pet: "panda", badge: true }} name="Mia" className="font-semibold" /></Row>
                                    <Row rank={2} time="4:31"><span className="truncate font-semibold">Tom</span></Row>
                                    <Row rank={3} time="4:47"><LookedName look={{ color: "aurora", pet: "none", badge: true }} name="Lena" className="font-semibold" /></Row>
                                </ol>
                            }>
                                Gold, sunset, aurora, ocean, rainbow or one of seven plain colours - on the speedruns, Highscore, Trivia Rooms, Border Chain,
                                World Conqueror and PvP.
                            </Perk>

                            <Perk icon={<PawPrint size={18} aria-hidden />} title="A companion animal" example={
                                <ul className="flex flex-wrap gap-1.5">
                                    {PETS.map(p => (
                                        <li key={p.id} title={`${p.label} · ${p.home}`} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-xl dark:bg-[#141A2E]">{p.emoji}</li>
                                    ))}
                                </ul>
                            }>
                                {PETS.length} animals from around the map. Yours sits beside your name and rides along on the roof of your Road Trip car.
                            </Perk>

                            <Perk icon={<Car size={18} aria-hidden />} title="The Racer and supporter paints in the Road Trip">
                                The Racer - the low striped car with the rear wing - plus Rose gold, Midnight and Mint, three paints no badge unlocks.
                            </Perk>

                            <Perk icon={<Heart size={18} aria-hidden />} title="The supporter heart" example={
                                <span className="inline-flex items-center gap-1"><LookedName look={{ color: "sunset", pet: "fox", badge: true }} name="Kai" className="font-semibold" /></span>
                            }>
                                A small heart after your name. Anyone who hovers it sees that you keep Flag Learn running. You can switch it off.
                            </Perk>

                            <Perk icon={<Gift size={18} aria-hidden />} title="Everything that comes later">
                                New colours, animals and paints are added over time, and they are yours too. No second payment, ever.
                            </Perk>
                        </ul>

                        <div className={`mt-6 text-sm ${muted}`}>
                            <p className="font-bold text-slate-900 dark:text-white">What it is not</p>
                            <ul className="mt-1.5 grid gap-1">
                                <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden /> No advantage in any game - only looks.</li>
                                <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden /> No subscription. You pay once.</li>
                                <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden /> No ads for anyone, supporter or not.</li>
                            </ul>
                        </div>
                    </section>

                    <aside className="lg:sticky lg:top-6">
                        {supporter
                            ? <ThankYou since={supporter.since} />
                            : <PayCard google={google} returning={returning} />}
                        <MonthBar />
                    </aside>
                </div>

                {supporter && user && <LookEditor uid={user.uid} saved={supporter.look} />}

                <section className="mt-12 max-w-[640px]">
                    <h2 className="mb-3 !text-xl font-bold">Questions</h2>
                    <dl className="grid gap-4 text-sm leading-relaxed">
                        <div>
                            <dt className="font-bold">Why do I need to sign in?</dt>
                            <dd className={muted}>The perks belong to your Google account, so they survive cleared browser data and follow you to your phone. Nobody else ever sees your email.</dd>
                        </div>
                        <div>
                            <dt className="font-bold">Can I give more than €{SUPPORT_PRICE_EUR}?</dt>
                            <dd className={muted}>Yes - you choose the amount on the payment page. Everything above €{SUPPORT_PRICE_EUR} goes into hosting; the perks are the same.</dd>
                        </div>
                        <div>
                            <dt className="font-bold">I paid, but nothing changed.</dt>
                            <dd className={muted}>
                                It usually takes a few seconds. If it does not show up, write on <a href="https://discord.gg/qcwW5evMU9" target="_blank" rel="noopener noreferrer" className="font-semibold underline-offset-2 hover:underline">Discord</a> or
                                to flaglearn@gmail.com with your supporter ID{user ? <> (<code className="text-xs">{user.uid}</code>)</> : ""}.
                            </dd>
                        </div>
                        <div>
                            <dt className="font-bold">Who handles the payment?</dt>
                            <dd className={muted}>Stripe. Flag Learn never sees your card. See the <Link to="/privacy" className="font-semibold underline-offset-2 hover:underline">privacy policy</Link>.</dd>
                        </div>
                    </dl>
                </section>
            </main>

            <SiteFooter />
        </div>
    )
}

function PayCard({ google, returning }: { google: User | null; returning: boolean }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [slow, setSlow] = useState(false)
    const link = google ? checkoutUrl(google.uid) : null

    // Back from Stripe: the webhook normally lands in seconds. If it does not, say so rather than spin forever.
    useEffect(() => {
        if (!returning) return
        const timer = window.setTimeout(() => setSlow(true), 30_000)
        return () => window.clearTimeout(timer)
    }, [returning])

    async function signIn() {
        setBusy(true)
        setError(null)
        try {
            const result = await connectGoogle()
            // Progress from another account on this browser is the profile's question to ask.
            if (result.kind === "other-account") window.location.assign("/profile#account")
            else if (result.reload) window.location.reload()
        } catch (e) {
            const code = (e as { code?: string })?.code ?? ""
            if (!/popup-closed|cancelled-popup|user-cancelled/.test(code)) setError("Signing in did not work. Please try again.")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className={`${panel} p-6`}>
            <p className="flex items-baseline gap-2">
                <span className="text-5xl font-extrabold tracking-[-0.03em]">€{SUPPORT_PRICE_EUR}</span>
                <span className={`text-sm font-semibold ${muted}`}>once · yours for good</span>
            </p>
            <p className={`mt-2 text-sm ${muted}`}>Or more, if you like - you pick the amount on the next page.</p>

            {returning && google ? (
                <p className="mt-5 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" role="status">
                    <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
                    {slow ? "This is taking longer than usual. It will appear on its own - if not within a few minutes, see the questions below." : "Thank you! Unlocking your perks…"}
                </p>
            ) : google ? (
                link
                    ? <a href={link} className={`${primary} mt-5`}><Heart size={18} className="fill-current" aria-hidden /> Become a supporter</a>
                    : <button type="button" disabled className={`${primary} mt-5`}>Payments open soon</button>
            ) : (
                <div className="mt-5">
                    <p className="mb-3 text-sm font-semibold">First, sign in so the perks have an account to live in:</p>
                    <GoogleButton busy={busy} onClick={signIn} />
                    {error && <p className="mt-2 text-sm font-semibold text-red-600 dark:text-red-400" role="alert">{error}</p>}
                </div>
            )}
            <p className={`mt-4 text-xs ${muted}`}>Secure payment by Stripe. Card, Apple Pay, Google Pay.</p>
        </div>
    )
}

function ThankYou({ since }: { since: number }) {
    return (
        <div className={`${panel} border-rose-200 bg-gradient-to-br from-rose-50 to-amber-50 p-6 dark:border-rose-500/30 dark:from-rose-500/10 dark:to-amber-500/5`}>
            <Heart size={28} className="supporter-heart fill-rose-500 text-rose-500" aria-hidden />
            <h2 className="mt-3 !text-2xl font-extrabold">Thank you!</h2>
            <p className={`mt-1 text-sm ${muted}`}>
                You have supported Flag Learn since {new Date(since).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}. Pick your look below.
            </p>
        </div>
    )
}

/** This month's hosting, covered so far. Hidden until the number has loaded. */
function MonthBar() {
    const cents = useMonthFund()
    if (cents === null) return null
    const goal = MONTHLY_GOAL_EUR * 100
    const share = Math.min(1, cents / goal)
    return (
        <div className={`${panel} mt-3 p-4`}>
            <p className="flex items-center justify-between text-sm">
                <span className="font-semibold">Hosting this month</span>
                <span className={`tabular-nums ${muted}`}>{euros(cents)} of €{MONTHLY_GOAL_EUR}</span>
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-[#1C2338]" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={cents} aria-label="Hosting covered this month">
                <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-amber-400" style={{ width: `${share * 100}%` }} />
            </div>
            {share >= 1 && <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">Covered - thank you all! Anything more goes to next month.</p>}
        </div>
    )
}

function LookEditor({ uid, saved }: { uid: string; saved: SupporterLook }) {
    const [look, setLook] = useState<SupporterLook>(saved)
    const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle")
    const [name] = useState(() => localStorage.getItem("flag-master-map-speedrun-name") || localStorage.getItem("flag-master-nickname") || "You")
    const changed = look.color !== saved.color || look.pet !== saved.pet || look.badge !== saved.badge
    const pick = (next: Partial<SupporterLook>) => {
        setLook(l => ({ ...l, ...next }))
        setState("idle")
    }

    async function save() {
        setState("saving")
        try {
            await saveLook(uid, look)
            setState("saved")
        } catch {
            setState("failed")
        }
    }

    return (
        <section aria-labelledby="look" className={`${panel} mt-8 p-5 sm:p-6`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="look" className="!text-xl font-bold">Your look</h2>
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-[#232B45]">
                    <Trophy size={14} className="shrink-0 text-amber-500" aria-hidden />
                    <span className="inline-flex min-w-0 items-center gap-1"><LookedName look={look} name={name} className="font-semibold" /></span>
                </div>
            </div>

            <h3 className={`mt-5 text-xs font-bold uppercase tracking-wider ${muted}`}>Name colour</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
                {NAME_COLOURS.map(c => (
                    <li key={c.id}>
                        <button
                            type="button"
                            onClick={() => pick({ color: c.id })}
                            aria-pressed={look.color === c.id}
                            title={c.label}
                            className={`flex min-h-0 items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 text-sm font-semibold ${look.color === c.id ? "border-slate-900 dark:border-white" : "border-slate-200 hover:border-slate-400 dark:border-[#232B45]"}`}
                        >
                            <span className="h-6 w-6 rounded-full border border-slate-200 dark:border-[#232B45]" style={{ background: c.swatch }} />
                            {c.label}
                        </button>
                    </li>
                ))}
            </ul>

            <h3 className={`mt-5 text-xs font-bold uppercase tracking-wider ${muted}`}>Animal</h3>
            <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-2">
                {[{ id: "none", label: "None", emoji: "", home: "" }, ...PETS].map(p => (
                    <li key={p.id}>
                        <button
                            type="button"
                            onClick={() => pick({ pet: p.id })}
                            aria-pressed={look.pet === p.id}
                            className={`flex w-full flex-col items-center gap-0.5 rounded-lg border-2 px-1 py-2 ${look.pet === p.id ? "border-slate-900 dark:border-white" : "border-slate-200 hover:border-slate-400 dark:border-[#232B45]"}`}
                        >
                            <span className="text-2xl leading-8" aria-hidden>{p.emoji || "–"}</span>
                            <span className="text-xs font-semibold">{p.label}</span>
                            {p.home && <span className={`text-[10px] ${muted}`}>{p.home}</span>}
                        </button>
                    </li>
                ))}
            </ul>

            <label className="mt-5 flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={look.badge} onChange={e => pick({ badge: e.target.checked })} className="h-4 w-4" />
                Show the supporter heart after my name
            </label>

            <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="button" onClick={save} disabled={!changed || state === "saving"} className={`${secondary} !border-slate-900 bg-slate-900 text-white hover:bg-slate-700 dark:!border-white dark:bg-white dark:text-[#0A0E1A]`}>
                    {state === "saving" && <Loader2 size={15} className="animate-spin" aria-hidden />} Save look
                </button>
                {changed && <button type="button" onClick={() => pick(saved)} className={secondary}>Undo</button>}
                {state === "saved" && !changed && <span className="flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400"><Check size={15} aria-hidden /> Saved - it shows everywhere now.</span>}
                {state === "failed" && <span className="text-sm font-semibold text-red-600 dark:text-red-400" role="alert">Could not save. Check the connection and try again.</span>}
            </div>
            <p className={`mt-4 flex items-center gap-1.5 text-xs ${muted}`}><Medal size={13} aria-hidden /> Your animal also rides on your car in the Road Trip, and the supporter paints wait in its garage.</p>
        </section>
    )
}
