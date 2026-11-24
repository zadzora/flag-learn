import { useMemo, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react"
import { Lock } from "lucide-react"
import { KIND_LABEL, countryNameOf, flagOf, suggestPlaces, type City, type Landmark } from "../utils/cityLandmarks"

/**
 * The pieces Landmarks and Daily Landmarks share: a sight as a clue card, the
 * city field with its suggestions, and the city revealed with its fact (the
 * user wanted no list of sights there). World Trivia's "Which city?" draws its clues with `ClueCard` too.
 */

export function ClueCard({ landmark, index }: { landmark: Landmark; index: number }) {
    return (
        <li className="fl-in flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-700 dark:bg-[#0F1424]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400 text-sm font-extrabold text-amber-950">{index + 1}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-bold leading-snug">{landmark.n}</span>
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{KIND_LABEL[landmark.k]}</span>
            </span>
        </li>
    )
}

/** A clue not shown yet: the slot is in the layout already, so opening it never moves the field below. */
export function LockedClue({ index, label }: { index: number; label: string }) {
    return (
        <li className="flex min-h-[3.75rem] items-center gap-3 rounded-lg border border-dashed border-slate-300 px-3.5 py-3 text-sm text-slate-400 dark:border-slate-600 dark:text-slate-500">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 text-xs font-bold dark:border-slate-600">{index + 1}</span>
            <Lock size={14} aria-hidden />
            <span>{label}</span>
        </li>
    )
}

/**
 * The city field. Suggestions come from every listed city and capital; arrow
 * keys walk them, Enter takes the highlighted one or else what was typed.
 */
export function CityInput({ onSubmit, disabled = false, inputRef, placeholder = "Which city?" }: {
    onSubmit: (text: string) => void
    disabled?: boolean
    inputRef?: RefObject<HTMLInputElement | null>
    placeholder?: string
}) {
    const [value, setValue] = useState("")
    const [hi, setHi] = useState(-1)
    const suggestions = useMemo(() => suggestPlaces(value), [value])
    const exact = suggestions.length === 1 && suggestions[0].names.some(n => n.toLowerCase() === value.trim().toLowerCase())

    const send = (text: string) => {
        if (!text.trim() || disabled) return
        onSubmit(text)
        setValue("")
        setHi(-1)
    }
    const submit = (e: FormEvent) => {
        e.preventDefault()
        send(hi >= 0 && suggestions[hi] ? suggestions[hi].name : value)
    }
    const onKey = (e: KeyboardEvent) => {
        if (!suggestions.length) return
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            const step = e.key === "ArrowDown" ? 1 : -1
            setHi(h => {
                const next = h + step
                return next >= suggestions.length ? -1 : next < -1 ? suggestions.length - 1 : next
            })
        } else if (e.key === "Escape") setHi(-1)
    }

    return (
        <form onSubmit={submit} className="relative flex gap-2" autoComplete="off">
            <input
                ref={inputRef}
                value={value}
                onChange={e => { setValue(e.target.value); setHi(-1) }}
                onKeyDown={onKey}
                disabled={disabled}
                placeholder={placeholder}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label={placeholder}
                className="min-w-0 flex-1 rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-lg font-semibold outline-none focus:border-blue-500 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800"
            />
            <button
                type="submit"
                disabled={disabled || !value.trim()}
                className="shrink-0 rounded-lg bg-slate-900 px-5 font-bold text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
            >
                Guess
            </button>
            {suggestions.length > 0 && !exact && !disabled && (
                <ul className="absolute left-0 right-24 top-full z-30 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    {suggestions.map((p, i) => (
                        <li key={p.key}>
                            <button
                                type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => send(p.name)}
                                className={`flex w-full min-h-0 items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 ${i === hi ? "bg-slate-100 dark:bg-slate-700" : ""}`}
                            >
                                <span className="font-semibold">{p.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </form>
    )
}

/** The answer: the city, its country and the one fact worth remembering. */
export function CityReveal({ city }: { city: City }) {
    const flag = flagOf(city)
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
                {flag && <img src={flag} alt="" className="h-9 w-auto rounded-[3px] border border-slate-200 dark:border-slate-700" />}
                <div className="min-w-0">
                    <p className="text-2xl font-extrabold leading-tight">{city.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{countryNameOf(city)}</p>
                </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{city.fact}</p>
        </div>
    )
}
