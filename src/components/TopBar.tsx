import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Moon, Sun } from "lucide-react"

type Props = {
    /** Page name, shown after the wordmark. */
    title?: ReactNode
    /** Where the back arrow goes; a function for pages that must confirm first. Defaults to home. */
    back?: string | (() => void)
    theme?: "light" | "dark"
    onToggleTheme?: () => void
    /** Page controls, placed before the theme toggle. */
    children?: ReactNode
}

/** Square outlined control - the one button shape the bar uses. */
export function BarButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className="flex h-10 min-h-0 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-0 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
        >
            {children}
        </button>
    )
}

/**
 * The bar every page opens with: back, the wordmark, the page's name, its own
 * controls and the theme toggle. Flat and quiet, so the flags stay the colour.
 */
export default function TopBar({ title, back = "/", theme, onToggleTheme, children }: Props) {
    const backClass =
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    return (
        <header className="relative z-30 w-full border-b border-slate-200 dark:border-slate-700">
            <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center gap-3 px-4 sm:px-6">
                {typeof back === "function" ? (
                    <button type="button" onClick={back} aria-label="Back" className={`${backClass} min-h-0 p-0`}>
                        <ArrowLeft size={19} aria-hidden />
                    </button>
                ) : (
                    <Link to={back} aria-label="Back" className={backClass}>
                        <ArrowLeft size={19} aria-hidden />
                    </Link>
                )}
                <Link to="/" className="hidden items-center gap-2 font-bold sm:flex">
                    <img src="/logo2.png" alt="" className="h-8 w-8" />
                    Flag Learn
                </Link>
                {title && (
                    <span className="min-w-0 truncate text-[15px] font-semibold text-slate-900 sm:border-l sm:border-slate-200 sm:pl-3 sm:font-medium sm:text-slate-500 dark:text-white sm:dark:border-slate-700 sm:dark:text-slate-400">
                        {title}
                    </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                    {children}
                    {theme && onToggleTheme && (
                        <BarButton onClick={onToggleTheme} label={theme === "light" ? "Dark theme" : "Light theme"}>
                            {theme === "light" ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
                        </BarButton>
                    )}
                </div>
            </div>
        </header>
    )
}
