import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { Sparkles, ChevronRight, Grid2x2Plus, ArrowUpDown, LayoutGrid } from "lucide-react"
import { AtomIcon, CompoundsIcon, ElementDetectiveIcon, ElementleIcon, ElementSpeedrunIcon, FormulaIcon, GaugeIcon, SymbolSpellerIcon, type ModeIcon } from "../components/ModeIcons"
import PetLane from "../components/PetLane"
import { pickPetSpot } from "../utils/petSpots"
import TopBar from "../components/TopBar"
import ModeTag, { type ModeTagKind } from "../components/ModeTag"
import { ELEMENTS, ELEMENT_MODES, readElementProgress, type ElementModeKey } from "../utils/elements"
import { QUANTITIES, QUANTITY_MODES, readQuantityProgress } from "../utils/quantities"
import { FORMULA_MODES, formulasFor, readFormulaProgress } from "../utils/formulas"
import { srStats } from "../utils/spacedRepetition"
import { MAX_SCORE, readBestForTable } from "../utils/elementDetective"
import { TARGET_SETTINGS, MAX_SCORE as BUILDER_MAX_SCORE, readBestForTarget } from "../utils/atomBuilder"
import { ELEMENT_SETS, SET_COUNTS } from "../utils/elementSpeedrun"
import { MAX_GUESSES } from "../utils/elementle"
import { activeStreak, readStreak, STREAK_KEYS } from "../utils/dailyStreak"
import { getTodayString } from "../utils/dailySeed"
import { COMPOUND_MODES, itemsFor, readCompoundProgress } from "../utils/compounds"
import { SPELLER_POOLS, MAX_SCORE as SPELLER_MAX, readBest as readSpellerBest } from "../utils/symbolSpeller"
import { readBest as readHigherLowerBest } from "../utils/elementHigherLower"

/**
 * The Science wing's front door.
 *
 * It is a separate hub rather than another row on the home screen because
 * nothing here is geography: no flags, no map, no country pool. The topics
 * share only the spaced repetition in `utils/spacedRepetition.ts`. The
 * periodic table came first, then physical quantities and formulas; the next
 * topic gets a card here and a route under `/science/`, and nothing on the geography side
 * has to move.
 */

const THEME_KEY = "flag-master-theme"

type Topic = {
    to: string
    label: string
    detail: string
    icon: ModeIcon
    /** The icon's colour - the only accent a topic carries. */
    accent: string
    badge?: string
    /** What kind of game it is (daily, speedrun...), in the same colours as the home screen. */
    tags?: ModeTagKind[]
    /** Per-direction mastery, read from the topic's own progress maps. */
    breakdown?: { label: string; mastered: number; total: number }[]
    /** Plain label/value rows, for a game whose numbers are not progress towards a total. */
    facts?: { label: string; value: string }[]
}

/** Today's Elementle as the hub card reports it, read off the page's own save. */
function elementleToday(today: string): string {
    try {
        const save = JSON.parse(localStorage.getItem("flag-master-elementle-save") ?? "null")
        if (!save || save.date !== today) return "Not played yet"
        if (save.status === "won") return `Solved in ${save.guesses.length}/${MAX_GUESSES}`
        if (save.status === "lost") return "Not found"
        return `${save.guesses.length}/${MAX_GUESSES} guesses so far`
    } catch {
        return "Not played yet"
    }
}

/** Today's Chemistry Connections, the same way. */
function connectionsToday(today: string): string {
    try {
        const save = JSON.parse(localStorage.getItem("flag-master-chem-connections-save") ?? "null")
        if (!save || save.date !== today) return "Not played yet"
        if (save.status === "won") return save.mistakes === 0 ? "Solved, flawless" : `Solved, ${save.mistakes} mistake${save.mistakes === 1 ? "" : "s"}`
        if (save.status === "lost") return "Out of tries"
        return `${save.solvedIds.length}/4 groups so far`
    } catch {
        return "Not played yet"
    }
}

function dailyFacts(today: string, key: string, line: string) {
    const streak = readStreak(key)
    return [
        { label: "Today", value: line },
        { label: "Streak", value: `${activeStreak(streak, today)} (best ${streak.best})` },
    ]
}

function masteredIn(mode: ElementModeKey): number {
    return srStats(ELEMENTS, readElementProgress(mode)).mastered
}

/**
 * Two shelves. **Learn** is the spaced repetition - topics with mastery bars,
 * worked through a little at a time. **Chemistry games** are quick rounds on
 * the same table with a score instead of a schedule; the ones planned next
 * (Elementle, a periodic-table speedrun, Symbol Speller...) go there too.
 */
function buildLearn(): Topic[] {
    return [
        {
            to: "/science/elements",
            label: "Periodic Table",
            detail: "All 118 elements - symbols, names, families and where they sit",
            icon: AtomIcon,
            accent: "text-cyan-600 dark:text-cyan-400",
            breakdown: ELEMENT_MODES.map(mode => ({
                label: mode.short,
                mastered: masteredIn(mode.key),
                total: ELEMENTS.length,
            })),
        },
        {
            to: "/science/quantities",
            label: "Physical Quantities",
            detail: "Force, pressure, voltage... - their symbols and SI units",
            icon: GaugeIcon,
            accent: "text-violet-600 dark:text-violet-400",
            breakdown: QUANTITY_MODES.map(mode => ({
                label: mode.short,
                mastered: srStats(QUANTITIES, readQuantityProgress(mode.key)).mastered,
                total: QUANTITIES.length,
            })),
        },
        {
            to: "/science/formulas",
            label: "Formulas",
            detail: "Basic physics and maths formulas - write them from memory",
            icon: FormulaIcon,
            accent: "text-amber-600 dark:text-amber-400",
            breakdown: FORMULA_MODES.map(mode => ({
                label: mode.short,
                mastered: srStats(formulasFor(mode.key), readFormulaProgress(mode.key)).mastered,
                total: formulasFor(mode.key).length,
            })),
        },
        {
            to: "/science/compounds",
            label: "Compounds & Ions",
            detail: "NaCl, H₂SO₄, Ca(OH)₂... - names, formulas and the charges behind them",
            icon: CompoundsIcon,
            accent: "text-emerald-600 dark:text-emerald-400",
            badge: "New",
            breakdown: COMPOUND_MODES.map(mode => ({
                label: mode.short,
                mastered: srStats(itemsFor(mode.key), readCompoundProgress(mode.key)).mastered,
                total: itemsFor(mode.key).length,
            })),
        },
    ]
}

type GameGroup = {
    /** The tag every game in the group carries; single-player games carry none. */
    tag?: ModeTagKind
    topics: Topic[]
}

/**
 * The games by how they are played - dailies first, then the leaderboard, then
 * the single-player rounds - shown as one list where each card says its kind
 * with a coloured tag. (A version with the groups as labelled bands down the
 * left edge was dropped by the user for the tags.)
 */
function buildGames(): Topic[] {
    return buildGameGroups().flatMap(g => g.topics.map(t => ({ ...t, tags: g.tag ? [g.tag] : [] })))
}

function buildGameGroups(): GameGroup[] {
    const today = getTodayString()
    return [
        {
            tag: "daily",
            topics: [
        {
            to: "/science/elementle",
            label: "Elementle",
            detail: "The daily element in six guesses - arrows point the way on the table",
            icon: ElementleIcon,
            accent: "text-cyan-600 dark:text-cyan-400",
            badge: "New",
            facts: dailyFacts(today, STREAK_KEYS.elementle, elementleToday(today)),
        },
        {
            to: "/science/connections",
            label: "Chemistry Connections",
            detail: "Sixteen elements in four hidden groups of four",
            // Lucide stand-in until the custom icon is drawn (graphic/icons-prompts.md, sheet 14).
            icon: LayoutGrid,
            accent: "text-violet-600 dark:text-violet-400",
            badge: "New",
            facts: dailyFacts(today, STREAK_KEYS.chemConnections, connectionsToday(today)),
        },
            ],
        },
        {
            tag: "speedrun",
            topics: [
        {
            to: "/science/speedrun",
            label: "Element Speedrun",
            detail: "Click every element of a set on a blank table - global leaderboard",
            icon: ElementSpeedrunIcon,
            accent: "text-rose-600 dark:text-rose-400",
            badge: "New",
            facts: ELEMENT_SETS.map(set => ({ label: set.label, value: `${SET_COUNTS[set.id]} elements` })),
        },
            ],
        },
        {
            topics: [
        {
            // The bars are best scores, not mastery.
            to: "/science/detective",
            label: "Element Detective",
            detail: "What an element is used for - find it on the table",
            icon: ElementDetectiveIcon,
            accent: "text-emerald-600 dark:text-emerald-400",
            badge: "New",
            breakdown: [true, false].map(symbols => ({
                label: `Best · ${symbols ? "With symbols" : "Blank table"}`,
                mastered: readBestForTable(symbols),
                total: MAX_SCORE,
            })),
        },
        {
            // Detective's other half: it reads a configuration, this writes one.
            to: "/science/atom-builder",
            label: "Atom Builder",
            detail: "Write an element's electron configuration, then draw it in boxes",
            // Lucide stand-in until the custom icon is drawn (graphic/icons-prompts.md, sheet 12).
            icon: Grid2x2Plus,
            accent: "text-violet-600 dark:text-violet-400",
            badge: "New",
            breakdown: TARGET_SETTINGS.map(t => ({
                label: `Best · ${t.label}`,
                mastered: readBestForTarget(t.key),
                total: BUILDER_MAX_SCORE,
            })),
        },
        {
            to: "/science/speller",
            label: "Symbol Speller",
            detail: "Name the elements whose symbols spell a word - YOGA is Y·O·Ga",
            icon: SymbolSpellerIcon,
            accent: "text-amber-600 dark:text-amber-400",
            badge: "New",
            breakdown: SPELLER_POOLS.map(p => ({ label: `Best · ${p.label}`, mastered: readSpellerBest(p.key), total: SPELLER_MAX })),
        },
        {
            to: "/science/higher-lower",
            label: "Higher or Lower",
            detail: "Density, melting point, discovery year - is the next one higher?",
            // Lucide stand-in until the custom icon is drawn (graphic/icons-prompts.md, sheet 14).
            icon: ArrowUpDown,
            accent: "text-orange-600 dark:text-orange-400",
            badge: "New",
            facts: [{ label: "Best streak", value: String(readHigherLowerBest()) }],
        },
            ],
        },
    ]
}

function TopicGrid({ topics, columns = "md:grid-cols-3" }: { topics: Topic[]; columns?: string }) {
    return (
    <ul className={`grid grid-cols-1 gap-4 ${columns}`}>
        {topics.map(({ to, label, detail, icon: Icon, accent, badge, tags, breakdown, facts }) => (
            <li key={to}>
                {/* Every card is laid out on the same lines, so a row of cards reads as
                    a row: icon and name on one fixed-height line, then a tag line
                    (reserved even when empty), then exactly two lines of detail, with
                    the numbers pinned to the bottom. Letting the name wrap around its
                    tags, or the icon centre on the whole text block, put each card's
                    name at a different height. */}
                <Link
                    to={to}
                    className="group flex h-full flex-col rounded-[10px] border border-slate-200 bg-white p-4 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#3A4670]"
                >
                    <div className="flex h-10 items-center gap-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 ${accent}`}>
                            <Icon size={19} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-base font-bold" title={label}>{label}</span>
                        <ChevronRight size={18} aria-hidden className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-[#556080]" />
                    </div>

                    {/* The text column starts where the name does: the icon's 40px plus the 12px gap. */}
                    <div className="pl-[52px]">
                        <div className="mt-1 flex min-h-5 flex-wrap items-center gap-1.5">
                            {tags?.map(tag => <ModeTag key={tag} kind={tag} />)}
                            {badge && <ModeTag kind="new" />}
                        </div>
                        <p className="mt-1.5 line-clamp-2 min-h-10 text-[13px] leading-5 text-slate-500 dark:text-[#8C97B3]" title={detail}>{detail}</p>
                    </div>

                    {/* The least room between text and numbers; mt-auto below adds the rest. */}
                    <div className="h-4 shrink-0" aria-hidden />

                    {/* Each direction is learned separately, so it is reported separately. */}
                    <div className="mt-auto flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                        {facts?.map(({ label: name, value }) => (
                            <div key={name} className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-slate-500 dark:text-slate-400">{name}</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-200">{value}</span>
                            </div>
                        ))}
                        {breakdown?.map(({ label: name, mastered, total }) => (
                            <div key={name} className="text-xs">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-slate-500 dark:text-slate-400">{name}</span>
                                    <span className="tabular-nums text-slate-500 dark:text-slate-400">
                                        <span className={`font-bold ${mastered > 0 ? "text-slate-900 dark:text-white" : ""}`}>{mastered}</span>/{total}
                                    </span>
                                </div>
                                <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700">
                                    <div className="h-full bg-emerald-500" style={{ width: `${total ? (mastered / total) * 100 : 0}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </Link>
            </li>
        ))}
    </ul>
    )
}

function SectionHead({ title, aside }: { title: string; aside: string }) {
    return (
        <div className="mb-4 mt-10 flex items-baseline justify-between gap-4">
            <h2 className="!text-2xl font-bold tracking-[-0.02em] sm:!text-[26px]">{title}</h2>
            <span className="text-right text-sm text-slate-500 dark:text-[#8C97B3]">{aside}</span>
        </div>
    )
}

export default function Science() {
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window === "undefined") return "light"
        return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light"
    })
    const [learn] = useState(buildLearn)
    const [games] = useState(buildGames)
    // The supporter animal wanders one of the two shelves, a different one each visit.
    const [petSpot] = useState(() => pickPetSpot(["learn", "games"] as const))

    useEffect(() => {
        const root = document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Science" theme={theme} onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))} />

            <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-16 sm:px-6">
                <div className="mt-10 max-w-[560px]">
                    <h1 className="!text-[clamp(2rem,4vw,2.75rem)] font-extrabold !leading-[1.05] !tracking-[-0.03em]">Science</h1>
                    <p className="mt-3 text-[15px] text-slate-500 dark:text-[#8C97B3]">
                        Learn with the same spaced repetition as the flags, or play a quick
                        round of chemistry.
                    </p>
                </div>

                <SectionHead title="Learn" aside="Spaced repetition, a little at a time" />
                {petSpot === "learn" && <PetLane size={32} top={-16} bottom={2} />}
                <TopicGrid topics={learn} />

                <SectionHead title="Chemistry games" aside="Quick rounds on the periodic table" />
                {petSpot === "games" && <PetLane size={32} top={-16} bottom={2} />}
                <TopicGrid topics={games} />

                <p className="mt-8 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Sparkles size={14} aria-hidden />
                    More science games are on the way.
                </p>
            </main>
        </div>
    )
}
