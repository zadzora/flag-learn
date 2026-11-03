import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import TopBar from "../components/TopBar"
import SiteFooter from "../components/SiteFooter"

/**
 * The privacy policy. Written for players, not lawyers: what the game keeps,
 * where, for how long, and how to get rid of it. Keep it true to the code -
 * when a mode starts storing something new, this page has to say so.
 */

const THEME_KEY = "flag-master-theme"
const CONTACT = "flaglearn@gmail.com"
const UPDATED = "3 November 2026"

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

function Item({ title, children }: { title: string; children: ReactNode }) {
    return (
        <li>
            <strong className="text-slate-900 dark:text-white">{title}.</strong> {children}
        </li>
    )
}

const Mail = () => <a href={`mailto:${CONTACT}`} className={link}>{CONTACT}</a>

function External({ href, children }: { href: string; children: ReactNode }) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={link}>{children}</a>
}

export default function Privacy() {
    const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light")
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Privacy" theme={theme} onToggleTheme={() => setTheme(t => (t === "light" ? "dark" : "light"))} />

            <main className="mx-auto w-full max-w-[760px] flex-1 px-4 pb-16 pt-8 text-[15px] sm:px-6">
                <h1 className="!text-3xl font-extrabold tracking-[-0.02em]">Privacy policy</h1>
                <p className={`mt-1 text-sm ${muted}`}>Last updated {UPDATED}</p>
                <p className="mt-5 leading-relaxed">
                    Flag Learn (flaglearn.eu) is a free learning game run by David Zadzora. This page explains what personal data the game uses, why, and
                    what you can do about it. Questions or requests: <Mail />.
                </p>

                <Section title="The short version">
                    <ul className="ml-5 list-disc space-y-1.5">
                        <li>You can play everything without an account. Your progress then stays in your browser and is never sent to me.</li>
                        <li>Signing in with Google is optional. It keeps a copy of your progress in your account so it survives cleared browser data and follows you to other devices.</li>
                        <li>No ads, no tracking cookies, and your data is never sold or shared for marketing.</li>
                        <li>In the online modes your nickname and results are public.</li>
                    </ul>
                </Section>

                <Section title="Who is responsible">
                    <p>
                        The controller of your personal data is David Zadzora, contact <Mail />.
                    </p>
                </Section>

                <Section title="What the game uses, and why">
                    <ul className="ml-5 list-disc space-y-3">
                        <Item title="Progress in your browser">
                            What you have learned, your badges, streaks and settings are stored in your browser (localStorage). They stay on your device and
                            are not sent anywhere unless you sign in.
                        </Item>
                        <Item title="Signing in with Google (optional)">
                            When you sign in, Google shares your name, email address, profile picture and Google account ID with Firebase Authentication,
                            which manages the sign-in. They are used only to recognise your account; your email is shown to you on your profile and to nobody
                            else. Legal basis: providing the service you asked for (Art. 6(1)(b) GDPR).
                        </Item>
                        <Item title="Progress saved to your account">
                            If you are signed in, a copy of your game progress, nickname and settings is stored in a database under your account ID. Only
                            your account can read it. It contains no email address. Legal basis: Art. 6(1)(b) GDPR.
                        </Item>
                        <Item title="Online modes">
                            PvP battles, leaderboards, World Conqueror and Border Chain need to know who wrote what, so the first time you use one the game
                            creates an anonymous account for your browser - a random ID with no name or email attached. What you post there (nickname,
                            scores, times, territories, answers) is visible to all players together with that ID. Daily puzzles only count how many players
                            got each result, without saying who. Legal basis: Art. 6(1)(b) GDPR.
                        </Item>
                        <Item title="Visit statistics">
                            Vercel Web Analytics counts page views without cookies and without identifying you, so I can see which modes are played. Legal
                            basis: legitimate interest (Art. 6(1)(f) GDPR).
                        </Item>
                        <Item title="Running and protecting the site">
                            The hosting and database providers process your IP address and basic browser information to deliver the site and to keep it
                            safe from abuse. The database may be protected with Google reCAPTCHA (through Firebase App Check), which checks that requests
                            come from the real game. Legal basis: legitimate interest (Art. 6(1)(f) GDPR).
                        </Item>
                    </ul>
                </Section>

                <Section title="Who processes data for me">
                    <ul className="ml-5 list-disc space-y-1.5">
                        <li>
                            <strong className="text-slate-900 dark:text-white">Google</strong> - Firebase Authentication, Firebase Realtime Database (stored
                            in Belgium, europe-west1) and reCAPTCHA. <External href="https://firebase.google.com/support/privacy">Firebase privacy</External>,{" "}
                            <External href="https://policies.google.com/privacy">Google privacy policy</External>.
                        </li>
                        <li>
                            <strong className="text-slate-900 dark:text-white">Vercel</strong> - hosting and visit statistics.{" "}
                            <External href="https://vercel.com/legal/privacy-policy">Vercel privacy policy</External>.
                        </li>
                    </ul>
                    <p>
                        Some of their processing can take place outside the EU. These providers protect such transfers with the safeguards GDPR requires,
                        such as the EU-US Data Privacy Framework or the EU Standard Contractual Clauses.
                    </p>
                </Section>

                <Section title="How long it is kept">
                    <ul className="ml-5 list-disc space-y-1.5">
                        <li>Progress in your browser: until you clear your browser data. Signing out removes it from that browser unless you choose to keep it.</li>
                        <li>
                            Your account and saved progress: until you delete the account in <Link to="/profile#account" className={link}>Profile → Your progress → Delete account</Link>.
                            That removes the saved progress, its backup copy and the sign-in account straight away.
                        </li>
                        <li>
                            Public entries - leaderboard records, World Conqueror territories and Hall of Fame, Border Chain moves, PvP games - stay after
                            you delete your account, because they are part of other players' results too. Email me and I will remove or anonymise yours.
                        </li>
                        <li>Anonymous accounts of the online modes are kept so your results stay yours. Email me to have one removed.</li>
                    </ul>
                </Section>

                <Section title="Your rights">
                    <p>
                        You can ask for access to your data, its correction or deletion, restriction of processing, and you can object to processing based
                        on legitimate interest. For portability, <Link to="/profile#account" className={link}>Profile → Your progress → Download</Link> gives you
                        all your progress as a file at any time. Write to <Mail /> and you will get an answer within one month.
                    </p>
                    <p>
                        You can also complain to the Slovak supervisory authority, the{" "}
                        <External href="https://dataprotection.gov.sk">Úrad na ochranu osobných údajov Slovenskej republiky</External>, or to the authority
                        in your own EU country.
                    </p>
                </Section>

                <Section title="Children">
                    <p>
                        The whole game can be played without an account and without giving any personal data. Signing in with Google follows Google's own
                        age rules; younger players simply play without signing in.
                    </p>
                </Section>

                <Section title="Cookies">
                    <p>
                        Flag Learn sets no advertising or tracking cookies. Browser storage is used only to make the game work. Google sign-in and reCAPTCHA
                        may use their own cookies, needed for signing in and for security.
                    </p>
                </Section>

                <Section title="Changes">
                    <p>When something here changes, this page and its date are updated.</p>
                </Section>
            </main>

            <SiteFooter />
        </div>
    )
}
