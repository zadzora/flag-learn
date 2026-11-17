import type { ElectronConfig } from "../utils/electronConfig"

/**
 * Pieces the Science wing's arcade rounds share (Element Detective, Atom
 * Builder): the configuration in print, and the setup screen's choices.
 */

/** "[Ar] 4s² 3d⁶" with real superscripts, which read better than the Unicode ones at size. */
export function ConfigView({ config, className = "" }: { config: ElectronConfig; className?: string }) {
    return (
        <span className={`tabular-nums ${className}`}>
            {config.core && <span className="mr-[0.3em] text-slate-500 dark:text-slate-400">[{config.core}]</span>}
            {config.parts.map((part, i) => (
                <span key={part.sub} className={`whitespace-nowrap ${i > 0 ? "ml-[0.3em]" : ""}`}>
                    {part.sub}
                    <sup className="text-[0.6em]">{part.count}</sup>
                </span>
            ))}
        </span>
    )
}

export function Segmented<T extends string | boolean>({ label, value, options, onChange }: {
    label: string
    value: T
    options: { key: T; label: string; detail?: string }[]
    onChange: (key: T) => void
}) {
    return (
        <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
            <div className="flex flex-col gap-1 rounded-[10px] border border-slate-200 bg-white p-1 sm:flex-row dark:border-slate-700 dark:bg-slate-800" role="radiogroup" aria-label={label}>
                {options.map(option => (
                    <button
                        key={String(option.key)}
                        type="button"
                        role="radio"
                        aria-checked={value === option.key}
                        onClick={() => onChange(option.key)}
                        className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-md px-3 py-2 text-sm font-semibold ${value === option.key
                            ? "bg-slate-900 text-white dark:bg-white dark:text-[#0A0E1A]"
                            : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"}`}
                    >
                        {option.label}
                        {option.detail && <span className="text-[11px] font-normal opacity-70">{option.detail}</span>}
                    </button>
                ))}
            </div>
        </div>
    )
}
