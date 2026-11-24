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
const UPDATED = "18 November 2026"

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
                    what you can do about it. Questions or requests: <Mail />. What the game and the supporter payment promise is in the{" "}
                    <Link to="/terms" className={link}>terms</Link>.
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
                            are not sent anywhere unless you sign in. The one exception carries nothing about you: when you earn a badge, a shared counter of
                            how many players hold it goes up by one - no ID, no name, nothing that says who - so the profile can show how rare each badge is.
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
                            PvP battles, Trivia Rooms, leaderboards, World Conqueror and Border Chain need to know who wrote what, so the first time you use one the game
                            creates an anonymous account for your browser - a random ID with no name or email attached. What you post there (nickname,
                            scores, times, territories, answers) is visible to all players together with that ID. While you play a speedrun (on the map or the periodic table), the game
                            also keeps a short timing record under that ID - which board, how many items you have found and missed, and when the database
                            saw the run start and the last find - so a leaderboard time can be checked against the database's own clock. Only your account
                            can read it, the next run replaces it, and a leaderboard entry shows the length the database measured. Daily puzzles only count
                            how many players got each result, without saying who. Legal basis: Art. 6(1)(b) GDPR.
                        </Item>
                        <Item title="Trivia Rooms">
                            A trivia room is listed for everybody while it exists: its name, the host's nickname, the players' nicknames and the points each
                            player scored on each question. A private room's password is stored so the database can check it, and nobody can read it back -
                            not even the host. When you join one, the password you typed is stored under your anonymous ID for the same check. While a room
                            or a PvP battle waits to start, its players can chat: each message is stored with your anonymous ID and the time, and only the
                            players in that room can read it. The chat is deleted with the room, and a PvP battle's chat when the battle starts. A room is
                            deleted when its host closes it, and anyone may remove one left for more than six hours. If you report a problem with a
                            question, the report holds the question, the reason, your note and your anonymous ID, and only I can read it. Legal basis:
                            Art. 6(1)(b) GDPR.
                        </Item>
                        <Item title="Supporting Flag Learn (optional)">
                            If you choose to <Link to="/support" className={link}>support the game</Link>, the payment is made on Stripe's page. Stripe sells
                            the supporter perks as the merchant of record (Stripe Managed Payments): it is the seller on your receipt, charges and pays the VAT,
                            handles refunds and disputes, and processes your payment details, name, billing address and email as its own controller under its
                            privacy policy. Your card details never reach me. Stripe tells me the amount, the currency, the date, a payment reference and your
                            account ID (which the game passes to Stripe so the payment finds your account); its dashboard also shows me the name, email and
                            country you entered, which I use only to answer you about the payment. Publicly, the database then shows that your account ID is a supporter, since when, and the
                            look you picked (letter colour, tint, animal, heart) and any animal given to the account by hand, so it can appear next to your nickname. It shows no amount, no name and no
                            email. Legal basis: Art. 6(1)(b) GDPR, and for the
                            payment records Art. 6(1)(c) GDPR.
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
                            <strong className="text-slate-900 dark:text-white">Stripe</strong> - payments from supporters, as the seller of record (only if you choose to pay).{" "}
                            <External href="https://stripe.com/privacy">Stripe privacy policy</External>.
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
                            That removes the saved progress, its backup copy, the speedrun timing record and the sign-in account straight away.
                        </li>
                        <li>
                            Public entries - leaderboard records, World Conqueror territories and Hall of Fame, Border Chain moves - stay after
                            you delete your account, because they are part of other players' results too. Email me and I will remove or anonymise yours.
                        </li>
                        <li>PvP battles and trivia rooms, with their chats: deleted automatically once they are six hours old, at the latest a day after that.</li>
                        <li>Anonymous accounts of the online modes are kept so your results stay yours. Email me to have one removed.</li>
                        <li>
                            Supporter status and look: as long as the account exists, and after it is deleted until you ask me to remove them. Payment records:
                            as long as Slovak accounting and tax law requires (up to ten years); Stripe keeps its own under its policy.
                        </li>
                    </ul>
                </Section>

                <Section title="Your rights">
                    <p>
                        You can ask for access to your data, its correction or deletion, restriction of processing, and you can object to processing based
                        on legitimate interest. For portability, <Link to="/profile#account" className={link}>Profile → Your progress → Download</Link> gives you
                        all your progress as a file at any time. Write to <Mail /> and you will get an answer within one month.
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
