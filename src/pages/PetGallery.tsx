import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { Heart, Trophy } from "lucide-react"
import TopBar from "../components/TopBar"
import PetSprite from "../components/PetSprite"
import PetLane from "../components/PetLane"
import PetPerch from "../components/PetPerch"
import PetNap, { Sleeper } from "../components/PetNap"
import { LookedName } from "../components/SupporterName"
import { EXCLUSIVE_PETS, PETS } from "../utils/supporterLook"
import { PET_PLACES } from "../utils/petSpots"

/**
 * Dev only (`/dev/pets`, `npm run dev`): every supporter animal in every state
 * side by side - still, animated, asleep, cheering - and every place the
 * animal turns up on the site, each as a live demo with links to the pages.
 * For checking a re-cut sprite sheet or a new placement at a glance.
 */

const THEME_KEY = "flag-master-theme"
const ALL = [...PETS, ...EXCLUSIVE_PETS]
const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-[#1C2338] dark:bg-[#0F1424]"
const muted = "text-slate-500 dark:text-[#8C97B3]"
const label = "text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500"

function State({ name, children }: { name: string; children: ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-1">
            <div className="flex h-16 items-end">{children}</div>
            <span className={label}>{name}</span>
        </div>
    )
}

export default function PetGallery() {
    const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "dark")
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const [demo, setDemo] = useState("fox")
    // Bumped by "Cheer again": a new key restarts every hop.
    const [cheers, setCheers] = useState(0)

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Animals (dev)" theme={theme} onToggleTheme={() => setTheme(t => (t === "light" ? "dark" : "light"))} />

            <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-16 pt-8 sm:px-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="!text-3xl font-extrabold tracking-[-0.02em]">Supporter animals</h1>
                        <p className={`mt-1 text-sm ${muted}`}>{ALL.length} animals, every state. Dev server only.</p>
                    </div>
                    <button type="button" onClick={() => setCheers(n => n + 1)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:border-slate-500 dark:border-[#2A3352]">
                        Cheer again
                    </button>
                </div>

                <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {ALL.map(pet => (
                        <li key={pet.id} className={`${panel} p-4`}>
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="font-bold">{pet.label}</span>
                                <span className={`text-xs ${muted}`}>{pet.home}{EXCLUSIVE_PETS.includes(pet) ? " · exclusive" : ""}</span>
                            </div>
                            <div className="mt-3 flex items-end justify-between gap-2">
                                <State name="Still"><PetSprite id={pet.id} size={52} /></State>
                                <State name="Animated"><PetSprite id={pet.id} size={52} animate /></State>
                                <State name="Asleep"><Sleeper id={pet.id} size={44} asleep /></State>
                                <State name="Cheer"><PetPerch key={cheers} id={pet.id} size={52} cheer /></State>
                            </div>
                        </li>
                    ))}
                </ul>

                <div className="mt-14 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h2 className="!text-2xl font-bold">Where it appears</h2>
                        <p className={`mt-1 text-sm ${muted}`}>Live demos with the animal picked here; the links open the real pages (use <code>supporterTest.me()</code> to see your own there).</p>
                    </div>
                    <select value={demo} onChange={e => setDemo(e.target.value)} aria-label="Animal for the demos" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#2A3352] dark:bg-[#0F1424]">
                        {ALL.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                </div>

                <ul className="mt-6 grid gap-4">
                    {PET_PLACES.map(place => (
                        <li key={place.id} className={`${panel} grid gap-5 p-5 md:grid-cols-[1fr_340px]`}>
                            <div className="min-w-0">
                                <h3 className="!text-lg font-bold">{place.title}</h3>
                                <p className={`mt-1 text-sm ${muted}`}>{place.how}</p>
                                <div className="mt-4">
                                    <PlaceDemo place={place.id} id={demo} cheers={cheers} />
                                </div>
                            </div>
                            <ul className="flex flex-col gap-1 text-sm">
                                {place.pages.map(page => (
                                    <li key={page.label}>
                                        <Link to={page.to} className="font-semibold text-blue-600 underline-offset-2 hover:underline dark:text-blue-400">{page.label}</Link>
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            </main>
        </div>
    )
}

function PlaceDemo({ place, id, cheers }: { place: string; id: string; cheers: number }) {
    const box = "rounded-lg border border-dashed border-slate-200 bg-slate-50 dark:border-[#232B45] dark:bg-[#0B1020]"
    switch (place) {
        case "nap":
            return (
                <div className={`${box} flex h-16 items-center justify-end gap-2 border-b-slate-300 px-4 dark:border-b-slate-600`}>
                    <PetNap id={id} />
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold dark:border-slate-700 dark:bg-slate-800">Me</span>
                </div>
            )
        case "lane":
            return (
                <div className={`${box} px-4 pb-4 pt-2`}>
                    <span className="flex justify-between text-sm"><span className="font-semibold">Flags</span><span className={muted}>42 / 197</span></span>
                    <PetLane id={id} />
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700"><span className="block h-full w-[21%] bg-emerald-500" /></span>
                </div>
            )
        case "section":
            return (
                <div className={`${box} px-4 pb-4`}>
                    <h4 className="mb-4 mt-4 !text-xl font-bold">Today</h4>
                    <PetLane id={id} size={32} top={-16} bottom={2} />
                    <div className="grid grid-cols-3 gap-3">
                        {["Flagle", "Trivia", "Connections"].map(t => <div key={t} className={`${panel} h-16 p-3 text-sm font-semibold`}>{t}</div>)}
                    </div>
                </div>
            )
        case "perch":
            return (
                <div className={`${box} p-4`}>
                    <div className={`${panel} flex items-center gap-4 p-4`}>
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700"><Trophy size={24} aria-hidden /></span>
                        <div>
                            <p className="text-2xl font-bold tabular-nums">850 / 1000</p>
                            <p className={`text-sm ${muted}`}>A new best for this setting!</p>
                        </div>
                        <PetPerch key={cheers} id={id} cheer className="ml-auto" />
                    </div>
                </div>
            )
        case "name":
            return (
                <div className={`${box} flex items-center gap-2 px-4 py-3`}>
                    <span className="w-6 text-xs font-bold text-amber-500">#1</span>
                    <LookedName look={{ text: "gold", bg: "none", pet: id, badge: true }} name="Mia" className="font-semibold" />
                    <span className="ml-auto font-mono text-sm font-bold">4:12</span>
                </div>
            )
        default:
            return (
                <div className={`${box} flex items-center gap-3 px-4 py-3 text-sm`}>
                    <Heart size={16} className="text-rose-500" aria-hidden /> Shown on those pages as they already were.
                </div>
            )
    }
}
