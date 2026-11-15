import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle } from "lucide-react"

/**
 * "Quit this game?" - asked before leaving a run whose score or time would be
 * lost, whether by the back arrow, the wordmark or the profile button. The
 * same dialog Higher or Lower has always shown.
 */
export default function LeaveDialog({ open, title, message, confirmLabel = "Yes, Quit", onConfirm, onCancel }: {
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    onConfirm: () => void
    onCancel: () => void
}) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4"
                    onClick={onCancel}
                >
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="leave-dialog-title"
                        onClick={e => e.stopPropagation()}
                        className="flex w-full max-w-sm flex-col gap-6 rounded-[10px] border border-slate-200 bg-white p-6 shadow-xl sm:p-8 dark:border-slate-700 dark:bg-slate-800"
                    >
                        <div className="flex items-start gap-4">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-red-500 dark:border-slate-700 dark:text-red-400">
                                <AlertTriangle size={24} aria-hidden />
                            </span>
                            <div>
                                <h2 id="leave-dialog-title" className="text-2xl font-bold">{title}</h2>
                                <p className="mt-1 text-slate-500 dark:text-slate-400">{message}</p>
                            </div>
                        </div>
                        <div className="flex w-full flex-col gap-3">
                            <button type="button" onClick={onConfirm} autoFocus className="w-full rounded-lg bg-red-600 py-3.5 font-bold text-white hover:bg-red-700">
                                {confirmLabel}
                            </button>
                            <button
                                type="button"
                                onClick={onCancel}
                                className="w-full rounded-lg border border-slate-200 bg-white py-3.5 font-bold text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
