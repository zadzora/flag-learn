import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"

/** A sheet over the page: closes on Escape, a click outside, or its X. */
export default function Overlay({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onClose])
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0A0E1A]/60 p-4 sm:items-center" onClick={onClose} role="dialog" aria-label={label}>
            <div
                className="relative max-h-[85vh] w-full max-w-[520px] overflow-y-auto rounded-[10px] border border-slate-200 bg-white p-5 sm:p-6 dark:border-[#1C2338] dark:bg-[#0F1424]"
                onClick={e => e.stopPropagation()}
            >
                <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-8 min-h-0 w-8 items-center justify-center rounded-lg p-0 text-slate-400 hover:text-slate-800 dark:hover:text-white">
                    <X size={18} aria-hidden />
                </button>
                {children}
            </div>
        </div>
    )
}
