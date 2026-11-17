import { useEffect, useState, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router-dom"
import type { User } from "firebase/auth"
import { AlertTriangle, Car, Check, Gift, Heart, Loader2, PawPrint, Sparkles, Trophy } from "lucide-react"
import TopBar from "../components/TopBar"
import SiteFooter from "../components/SiteFooter"
import { GoogleButton } from "../components/AccountPanel"
import { LookedName } from "../components/SupporterName"
import PetSprite from "../components/PetSprite"
import { isAnimatedPet } from "../utils/petImages"
import { isGoogleUser, observeSession } from "../../lib/firebase"
import { connectGoogle } from "../utils/cloudSave"
import { checkoutUrl, saveLook, useSupporter } from "../utils/supporters"
import { PETS, SUPPORT_PRICE_EUR, TEXT_COLOURS, TINTS, cssPaint, hardToRead, type SupporterLook } from "../utils/supporterLook"
import { useDarkMode } from "../utils/useDarkMode"

/**
 * The support page: what a supporter gets, the one payment, and - once paid -
 * where they pick their look. Reached from the footer, the profile and any
 * supporter's name on a leaderboard; nothing else in the game points here.
 *
 * Paying needs a Google account, because the perks belong to an account and
 * must survive cleared browser data. The payment itself is Stripe's page; the
 * webhook (`api/stripe-webhook.ts`) writes `supporters/<uid>` and this page
 * simply watches that row turn up.
 *
 * It names no running costs - the user's call.
 */

const THEME_KEY = "flag-master-theme"
const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-[#1C2338] dark:bg-[#0F1424]"
const muted = "text-slate-500 dark:text-[#8C97B3]"
const primary = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-base font-bold text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:border-slate-500 disabled:opacity-60 dark:border-[#2A3352] dark:hover:border-[#4A5680]"
const chip = (on: boolean) =>
    `flex min-h-0 items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 text-sm font-semibold ${on ? "border-slate-900 dark:border-white" : "border-slate-200 hover:border-slate-400 dark:border-[#232B45] dark:hover:border-[#4A5680]"}`

/** The animals that move, first: they are the ones worth showing off. */
const SHOWCASE = PETS.filter(p => isAnimatedPet(p.id))

function useSession(): User | null {
    const [user, setUser] = useState<User | null>(null)
    useEffect(() => observeSession(setUser), [])
    return user
}

/** A leaderboard row as the game draws one, for the examples. */
function Row({ rank, children, time }: { rank: number; children: ReactNode; time: string }) {
    return (
        <li className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 items-center gap-3">
                <span className={`w-6 shrink-0 text-xs font-bold tabular-nums ${rank === 1 ? "text-amber-500" : "text-slate-400 dark:text-slate-500"}`}>#{rank}</span>
                <span className="inline-flex min-w-0 items-center gap-1.5">{children}</span>
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
                <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                    <div className="max-w-[600px]">
                        <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-rose-500"><Heart size={14} className="fill-rose-500" aria-hidden /> Support Flag Learn</p>
                        <h1 className="mt-2 !text-3xl font-extrabold tracking-[-0.02em] sm:!text-4xl">Keep it free, get a little sparkle</h1>
                        <p className={`mt-3 leading-relaxed ${muted}`}>
                            Flag Learn has no ads and every mode is free - that does not change. If you would like to help keep it online,
                            a one-time €{SUPPORT_PRICE_EUR} makes you a supporter for good, and you get a few things to show for it.
                        </p>
                    </div>
                    <div className="flex items-end gap-1" aria-hidden>
                        {SHOWCASE.map(p => <PetSprite key={p.id} id={p.id} size={64} animate />)}
                    </div>
                </div>

                <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_340px]">
                    <section aria-labelledby="perks" className="min-w-0">
                        <h2 id="perks" className="mb-3 !text-xl font-bold">What you get</h2>
                        <ul className="grid gap-3">
                            <Perk icon={<Sparkles size={18} aria-hidden />} title="Your name, your colours, on every leaderboard" example={
                                <ol className="divide-y divide-slate-200 dark:divide-[#1C2338]">
                                    <Row rank={1} time="4:12"><LookedName look={{ text: "gold", bg: "none", pet: "fox", badge: true }} name="Mia" className="font-semibold" /></Row>
                                    <Row rank={2} time="4:31"><span className="truncate font-semibold">Tom</span></Row>
                                    <Row rank={3} time="4:47"><LookedName look={{ text: "auto", bg: "aurora", pet: "penguin", badge: true }} name="Lena" className="font-semibold" /></Row>
                                    <Row rank={4} time="5:02"><LookedName look={{ text: "ink", bg: "gold", pet: "none", badge: true }} name="Kai" className="font-semibold" /></Row>
                                </ol>
                            }>
                                Pick the colour of the letters ({TEXT_COLOURS.length - 1} of them, gradients included) and, separately, a tint behind
                                the name ({TINTS.length - 1}). Shown on the speedruns, Highscore, Trivia Rooms, Border Chain, World Conqueror and PvP.
                            </Perk>

                            <Perk icon={<PawPrint size={18} aria-hidden />} title="A companion animal" example={
                                <div>
                                    <ul className="flex flex-wrap items-end gap-3">
                                        {SHOWCASE.map(p => (
                                            <li key={p.id} className="flex flex-col items-center">
                                                <PetSprite id={p.id} size={56} animate title={p.label} />
                                                <span className="text-[11px] font-semibold">{p.label}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <ul className="mt-3 flex flex-wrap gap-1">
                                        {PETS.filter(p => !isAnimatedPet(p.id)).map(p => (
                                            <li key={p.id}><PetSprite id={p.id} size={32} title={`${p.label} · ${p.home}`} /></li>
                                        ))}
                                    </ul>
                                </div>
                            }>
                                {PETS.length} animals from around the map; the first {SHOWCASE.length} are animated, with more on the way. Yours sits beside your
                                name, wakes up when someone hovers it, and rides on the roof of your Road Trip car.
                            </Perk>

                            <Perk icon={<Car size={18} aria-hidden />} title="The Racer and supporter paints in the Road Trip">
                                The Racer - the low striped car with the rear wing - plus Rose gold, Midnight and Mint, three paints no badge unlocks.
                            </Perk>

                            <Perk icon={<Heart size={18} aria-hidden />} title="The supporter heart">
                                A small heart after your name. Anyone who hovers it sees that you help keep Flag Learn running. You can switch it off.
                            </Perk>

                            <Perk icon={<Gift size={18} aria-hidden />} title="Everything that comes later">
                                New colours, animals, animations and paints are added over time, and they are yours too. No second payment, ever.
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

/** One look, on a forced theme, the way a leaderboard row would show it. */
function Preview({ look, name, dark }: { look: SupporterLook; name: string; dark: boolean }) {
    return (
        <div className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2.5 ${dark ? "border-[#232B45] bg-[#0A0E1A] text-[#E8ECF6]" : "border-slate-200 bg-white text-slate-900"}`}>
            <Trophy size={14} className="shrink-0 text-amber-500" aria-hidden />
            <span className="inline-flex min-w-0 items-center gap-1.5"><LookedName look={look} name={name} className="font-semibold" dark={dark} animate petSize={24} /></span>
            <span className={`ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider ${dark ? "text-[#8C97B3]" : "text-slate-400"}`}>{dark ? "Dark" : "Light"}</span>
        </div>
    )
}

function LookEditor({ uid, saved }: { uid: string; saved: SupporterLook }) {
    const [look, setLook] = useState<SupporterLook>(saved)
    const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle")
    const [name] = useState(() => localStorage.getItem("flag-master-map-speedrun-name") || localStorage.getItem("flag-master-nickname") || "You")
    const dark = useDarkMode()
    const changed = look.text !== saved.text || look.bg !== saved.bg || look.pet !== saved.pet || look.badge !== saved.badge
    const unreadable = [false, true].filter(d => hardToRead(look, d))
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

    const swatch = (paint: string | string[] | null, fallback: string) => (
        <span className="h-6 w-6 shrink-0 rounded-full border border-slate-200 dark:border-[#232B45]" style={{ background: paint ? cssPaint(paint) : fallback }} />
    )

    return (
        <section aria-labelledby="look" className={`${panel} mt-8 p-5 sm:p-6`}>
            <h2 id="look" className="!text-xl font-bold">Your look</h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Preview look={look} name={name} dark={false} />
                <Preview look={look} name={name} dark />
            </div>
            {unreadable.length > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={15} className="shrink-0" aria-hidden />
                    Hard to read on the {unreadable.length === 2 ? "light and dark themes" : unreadable[0] ? "dark theme" : "light theme"} - try another letter colour or a tint.
                </p>
            )}

            <h3 className={`mt-6 text-xs font-bold uppercase tracking-wider ${muted}`}>Letters</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
                {TEXT_COLOURS.map(c => (
                    <li key={c.id}>
                        <button type="button" onClick={() => pick({ text: c.id })} aria-pressed={look.text === c.id} className={chip(look.text === c.id)}>
                            {swatch(dark ? c.dark : c.light, "conic-gradient(#0F172A 0 50%, #FFFFFF 0)")}
                            {c.label}
                        </button>
                    </li>
                ))}
            </ul>

            <h3 className={`mt-5 text-xs font-bold uppercase tracking-wider ${muted}`}>Tint behind the name</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
                {TINTS.map(t => (
                    <li key={t.id}>
                        <button type="button" onClick={() => pick({ bg: t.id })} aria-pressed={look.bg === t.id} className={chip(look.bg === t.id)}>
                            {swatch(t.paint, "repeating-linear-gradient(45deg, transparent 0 4px, #94A3B8 4px 5px)")}
                            {t.label}
                        </button>
                    </li>
                ))}
            </ul>

            <h3 className={`mt-5 text-xs font-bold uppercase tracking-wider ${muted}`}>Animal</h3>
            <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
                {[{ id: "none", label: "None", home: "" }, ...SHOWCASE, ...PETS.filter(p => !isAnimatedPet(p.id))].map(p => (
                    <li key={p.id}>
                        <PetChoice id={p.id} label={p.label} home={p.home} selected={look.pet === p.id} onPick={() => pick({ pet: p.id })} />
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
            <p className={`mt-4 text-xs ${muted}`}>Your animal also rides on your car in the Road Trip, where the Racer and the supporter paints wait in the garage.</p>
        </section>
    )
}

/** One animal in the picker: still until hovered or picked, then it moves. */
function PetChoice({ id, label, home, selected, onPick }: { id: string; label: string; home: string; selected: boolean; onPick: () => void }) {
    const [hover, setHover] = useState(false)
    return (
        <button
            type="button"
            onClick={onPick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            aria-pressed={selected}
            className={`relative flex w-full flex-col items-center gap-0.5 rounded-lg border-2 px-1 py-2 ${selected ? "border-slate-900 dark:border-white" : "border-slate-200 hover:border-slate-400 dark:border-[#232B45]"}`}
        >
            {id === "none"
                ? <span className="flex h-12 w-12 items-center justify-center text-2xl text-slate-400" aria-hidden>–</span>
                : <PetSprite id={id} size={48} animate={hover || selected} />}
            <span className="text-xs font-semibold">{label}</span>
            {home && <span className={`text-[10px] ${muted}`}>{home}</span>}
            {isAnimatedPet(id) && <Sparkles size={12} className="absolute right-1.5 top-1.5 text-amber-500" aria-label="Animated" />}
        </button>
    )
}
