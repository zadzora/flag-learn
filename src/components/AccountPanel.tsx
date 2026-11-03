import { useEffect, useRef, useState } from "react"
import type { User } from "firebase/auth"
import { AlertTriangle, Cloud, CloudOff, Download, Loader2, LogOut, Trash2, Upload } from "lucide-react"
import Overlay from "./Overlay"
import { auth, isGoogleUser, observeSession, signOutUser } from "../../lib/firebase"
import {
    CLOUD_EVENT, cloudStatus, connectGoogle, deleteCloudAccount, disconnect, exportSave, finishConnect, importSave, linkedAccount,
    type CloudStatus,
} from "../utils/cloudSave"

/**
 * The profile's "Your progress" panel: signing in with Google to keep a copy
 * of the progress in the account, signing out, deleting the account, and a
 * backup file for anyone who would rather not have an account at all.
 *
 * Signing in is never required and never asked for twice: a guest sees one
 * line about it here and, once, a suggestion after their first badge.
 */

const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-[#1C2338] dark:bg-[#0F1424]"
const muted = "text-slate-500 dark:text-[#8C97B3]"
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:border-slate-500 disabled:opacity-60 dark:border-[#2A3352] dark:hover:border-[#4A5680]"
const danger = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"

type Account = {
    /** The signed-in Google user, if any. */
    google: User | null
    /** The account whose progress this browser holds, signed in or not. */
    linked: string | null
    cloud: CloudStatus
}

function useAccount(): Account {
    const [user, setUser] = useState<User | null>(auth.currentUser)
    const [linked, setLinked] = useState(linkedAccount)
    const [cloud, setCloud] = useState(cloudStatus)
    useEffect(
        () =>
            observeSession(next => {
                setUser(next)
                setLinked(linkedAccount())
            }),
        [],
    )
    useEffect(() => {
        const update = () => {
            setCloud(cloudStatus())
            setLinked(linkedAccount())
        }
        window.addEventListener(CLOUD_EVENT, update)
        return () => window.removeEventListener(CLOUD_EVENT, update)
    }, [])
    return { google: isGoogleUser(user) ? user : null, linked, cloud }
}

/** "just now", "4 min ago" - read at render, so it moves with each sync. */
function since(at: number | undefined): string {
    if (!at) return ""
    const minutes = Math.floor((Date.now() - at) / 60_000)
    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes} min ago`
    return new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

function explain(error: unknown): string | null {
    const code = (error as { code?: string; message?: string })?.code ?? (error as Error)?.message
    switch (code) {
        case "auth/popup-closed-by-user":
        case "auth/cancelled-popup-request":
        case "auth/user-cancelled":
            return null
        case "auth/popup-blocked":
            return "Your browser blocked the Google window. Allow pop-ups for this site and try again."
        case "auth/unauthorized-domain":
            return "Signing in is not available on this address."
        case "auth/operation-not-allowed":
            return "Google sign-in is not switched on yet."
        case "auth/network-request-failed":
        case "offline":
            return "Could not reach the server. Check your connection and try again."
        case "too-big":
            return "Part of your progress is too big to keep in your account, so it only exists in this browser."
        case "not-a-save":
            return "That file is not a Flag Learn backup."
        default:
            return "Something went wrong. Please try again."
    }
}

/** One line for the top of the profile: where the progress is kept. */
export function AccountLine() {
    const { google, linked, cloud } = useAccount()
    const synced = !!google && google.uid === linked
    return (
        <a href="#account" className={`mt-0.5 inline-flex items-center gap-1.5 text-sm ${muted} hover:text-slate-900 dark:hover:text-white`}>
            {synced ? <Cloud size={14} aria-hidden /> : <CloudOff size={14} aria-hidden />}
            {synced ? (cloud.state === "offline" ? "Saved to your account · offline" : "Saved to your account") : "Saved in this browser only"}
        </a>
    )
}

export default function AccountPanel() {
    const { google, linked, cloud } = useAccount()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [dialog, setDialog] = useState<"sign-out" | "other-account" | "delete" | null>(null)
    const fileInput = useRef<HTMLInputElement>(null)
    const root = useRef<HTMLElement>(null)

    // Arriving from the "keep your progress" suggestion lands on this panel.
    useEffect(() => {
        if (window.location.hash === "#account") root.current?.scrollIntoView({ block: "start" })
    }, [])

    const synced = !!google && google.uid === linked

    async function run(job: () => Promise<void>) {
        setBusy(true)
        setError(null)
        setNotice(null)
        try {
            await job()
        } catch (e) {
            setError(explain(e))
        } finally {
            setBusy(false)
        }
    }

    const signIn = () =>
        run(async () => {
            const result = await connectGoogle()
            if (result.kind === "other-account") setDialog("other-account")
            else if (result.reload) window.location.reload()
        })

    /** Signed in, but the progress was not joined in yet (the connection dropped half way). */
    const connect = () =>
        run(async () => {
            if (linked && linked !== google?.uid) {
                setDialog("other-account")
                return
            }
            const result = await finishConnect("join")
            if (result.kind === "done" && result.reload) window.location.reload()
        })

    const choose = (choice: "join" | "replace") =>
        run(async () => {
            setDialog(null)
            const result = await finishConnect(choice)
            if (result.kind === "done" && result.reload) window.location.reload()
        })

    const download = () => {
        const { blob, name } = exportSave()
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = name
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    const restore = (file: File) =>
        run(async () => {
            const changed = await importSave(file)
            if (!changed) {
                setNotice("Nothing in that file was newer than what you have.")
                return
            }
            setNotice("Progress restored. Reloading…")
            window.setTimeout(() => window.location.reload(), 900)
        })

    return (
        <section ref={root} id="account" className={`${panel} scroll-mt-6 grid gap-6 p-5 sm:p-6 md:grid-cols-[1fr_300px]`}>
            <div className="min-w-0">
                {synced ? (
                    <>
                        <p className="flex items-center gap-2 font-bold">
                            <Cloud size={18} className="text-blue-500" aria-hidden /> Saved to your Google account
                        </p>
                        <p className={`mt-1 text-sm ${muted}`}>
                            Signed in as <strong className="text-slate-900 dark:text-white">{google?.email}</strong>. Your progress follows you to any device you sign in on.
                        </p>
                        <p className={`mt-3 flex items-center gap-1.5 text-sm ${muted}`}>
                            {cloud.state === "syncing" && <><Loader2 size={14} className="animate-spin" aria-hidden /> Saving…</>}
                            {cloud.state === "synced" && <>Last saved {since(cloud.at)}</>}
                            {cloud.state === "offline" && <><CloudOff size={14} aria-hidden /> Offline - it will save when you are back</>}
                            {cloud.state === "off" && <>Waiting to save</>}
                        </p>
                        {cloud.tooBig.length > 0 && (
                            <p className="mt-2 flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                                <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden /> {explain(new Error("too-big"))}
                            </p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" className={secondary} disabled={busy} onClick={() => setDialog("sign-out")}>
                                <LogOut size={15} aria-hidden /> Sign out
                            </button>
                            <button type="button" className={`${secondary} !border-transparent text-red-600 hover:!border-red-300 dark:text-red-400`} disabled={busy} onClick={() => setDialog("delete")}>
                                <Trash2 size={15} aria-hidden /> Delete account
                            </button>
                        </div>
                    </>
                ) : google ? (
                    <>
                        <p className="font-bold">Signed in as {google.email}</p>
                        <p className={`mt-1 text-sm ${muted}`}>Your progress is not connected to the account yet.</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" className={primary} disabled={busy} onClick={connect}>
                                {busy && <Loader2 size={15} className="animate-spin" aria-hidden />} Connect my progress
                            </button>
                            <button type="button" className={secondary} disabled={busy} onClick={() => run(signOutUser)}>
                                Sign out
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="flex items-center gap-2 font-bold">
                            <CloudOff size={18} className="text-slate-400" aria-hidden />
                            {linked ? "Signed out" : "Saved in this browser only"}
                        </p>
                        <p className={`mt-1 text-sm ${muted}`}>
                            {linked
                                ? "The progress here belongs to your Google account. Sign in again to keep it in sync."
                                : "Clearing your browser data would erase it. Sign in with Google to keep a copy in your account and continue on any device - or skip it and keep playing as you are."}
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <GoogleButton busy={busy} onClick={signIn} />
                            {linked && (
                                <button type="button" className={`${muted} min-h-0 p-0 text-sm underline-offset-2 hover:underline`} disabled={busy} onClick={() => run(() => disconnect({ keepLocal: true, force: true }))}>
                                    Keep it here without an account
                                </button>
                            )}
                        </div>
                        <p className={`mt-3 text-xs ${muted}`}>Only your game progress is stored. Your email stays with Google sign-in and is never shown to other players.</p>
                    </>
                )}
                {error && <p className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400" role="alert">{error}</p>}
                {notice && <p className="mt-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400" role="status">{notice}</p>}
            </div>

            <div className="border-t border-slate-200 pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0 dark:border-[#1C2338]">
                <p className="font-bold">Backup file</p>
                <p className={`mt-1 text-sm ${muted}`}>No account needed. The file stays with you; restoring adds what it holds to what you have.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className={secondary} disabled={busy} onClick={download}>
                        <Download size={15} aria-hidden /> Download
                    </button>
                    <button type="button" className={secondary} disabled={busy} onClick={() => fileInput.current?.click()}>
                        <Upload size={15} aria-hidden /> Restore
                    </button>
                    <input
                        ref={fileInput}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={e => {
                            const file = e.target.files?.[0]
                            e.target.value = ""
                            if (file) void restore(file)
                        }}
                    />
                </div>
            </div>

            {dialog === "sign-out" && <SignOutDialog onClose={() => setDialog(null)} />}
            {dialog === "delete" && <DeleteDialog onClose={() => setDialog(null)} onDeleted={() => setNotice("Your account was deleted. The progress in this browser stays.")} />}
            {dialog === "other-account" && (
                <Overlay onClose={() => setDialog(null)} label="Progress from another account">
                    <h3 className="pr-8 text-xl font-extrabold">This browser has someone else's progress</h3>
                    <p className={`mt-2 text-sm ${muted}`}>
                        It was saved under a different Google account. You can add it to yours, or set it aside and continue with your own account's progress only.
                    </p>
                    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                        <button type="button" className={primary} disabled={busy} onClick={() => choose("replace")}>Use only my account's progress</button>
                        <button type="button" className={secondary} disabled={busy} onClick={() => choose("join")}>Add it to my account</button>
                    </div>
                </Overlay>
            )}
        </section>
    )
}

function SignOutDialog({ onClose }: { onClose: () => void }) {
    const [keepLocal, setKeepLocal] = useState(false)
    const [busy, setBusy] = useState(false)
    const [failed, setFailed] = useState<string | null>(null)

    async function signOut(force: boolean) {
        setBusy(true)
        try {
            await disconnect({ keepLocal, force })
            window.location.reload()
        } catch (e) {
            setFailed(explain(e))
            setBusy(false)
        }
    }

    return (
        <Overlay onClose={onClose} label="Sign out">
            <h3 className="pr-8 text-xl font-extrabold">Sign out?</h3>
            <p className={`mt-2 text-sm ${muted}`}>
                Your progress is saved in your account and comes back when you sign in again.
                {keepLocal ? " A copy stays in this browser." : " It will be removed from this browser, so the next person here starts fresh."}
            </p>
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={keepLocal} onChange={e => setKeepLocal(e.target.checked)} className="h-4 w-4" />
                Keep my progress in this browser
            </label>
            {failed && (
                <p className="mt-4 flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400" role="alert">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
                    <span>{failed} Signing out anyway {keepLocal ? "keeps it only in this browser" : "loses what was not saved"}.</span>
                </p>
            )}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                {failed ? (
                    <button type="button" className={danger} disabled={busy} onClick={() => signOut(true)}>Sign out anyway</button>
                ) : (
                    <button type="button" className={primary} disabled={busy} onClick={() => signOut(false)}>
                        {busy && <Loader2 size={15} className="animate-spin" aria-hidden />} Sign out
                    </button>
                )}
                <button type="button" className={secondary} disabled={busy} onClick={onClose}>Stay signed in</button>
            </div>
        </Overlay>
    )
}

function DeleteDialog({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
    const [busy, setBusy] = useState(false)
    const [failed, setFailed] = useState<string | null>(null)

    async function remove() {
        setBusy(true)
        setFailed(null)
        try {
            await deleteCloudAccount()
            onDeleted()
            onClose()
        } catch (e) {
            setFailed(explain(e))
            setBusy(false)
        }
    }

    return (
        <Overlay onClose={onClose} label="Delete account">
            <h3 className="pr-8 text-xl font-extrabold">Delete your account?</h3>
            <p className={`mt-2 text-sm ${muted}`}>
                This removes the progress saved in your account and the account itself. Google will ask you to confirm once more.
                The progress in this browser stays, and so does the nickname already on leaderboards and the World Conqueror map.
            </p>
            {failed && <p className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400" role="alert">{failed}</p>}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button type="button" className={danger} disabled={busy} onClick={remove}>
                    {busy && <Loader2 size={15} className="animate-spin" aria-hidden />} Delete account
                </button>
                <button type="button" className={secondary} disabled={busy} onClick={onClose}>Cancel</button>
            </div>
        </Overlay>
    )
}

/** Google's sign-in button, drawn to its branding rules: white, the four-colour G, "Sign in with Google". */
function GoogleButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={busy}
            className="inline-flex min-h-10 items-center gap-3 rounded-lg border border-[#747775] bg-white px-3 pr-4 text-sm font-semibold text-[#1F1F1F] hover:bg-[#F8FAFF] disabled:opacity-60 dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3] dark:hover:bg-[#1E1F20]"
        >
            {busy ? (
                <Loader2 size={18} className="animate-spin" aria-hidden />
            ) : (
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
            )}
            Sign in with Google
        </button>
    )
}
