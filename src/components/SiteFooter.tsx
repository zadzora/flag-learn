import type { ReactNode } from "react"
import { Coffee, ExternalLink, Heart, MessagesSquare } from "lucide-react"
import CountryDataCredit from "./CountryDataCredit"

/** The page foot every screen shares: credits, community links and the plain-text description. */
export default function SiteFooter({ about }: { about?: ReactNode }) {
    return (
        <footer className="mt-auto w-full border-t border-slate-200 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <div className="mx-auto flex max-w-[1120px] flex-col items-center gap-3 px-5 py-8 text-center sm:px-6">
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                    <span className="flex items-center gap-1.5">Made with <Heart size={14} className="fill-red-400 text-red-400" aria-hidden /> for learning</span>
                    <a href="https://discord.gg/qcwW5evMU9" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 font-semibold text-[#5865F2] hover:underline dark:text-[#8E97FF]">
                        <MessagesSquare size={15} aria-hidden /> Discord
                    </a>
                    <a href="https://buymeacoffee.com/davidzadzora" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 font-semibold text-amber-600 hover:underline dark:text-[#FFDD00]">
                        <Coffee size={15} aria-hidden /> Buy me a coffee
                    </a>
                    <a href="https://flagpedia.net" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white">
                        Flags provided by Flagpedia.net <ExternalLink size={12} aria-hidden />
                    </a>
                </div>
                <p className="text-xs"><CountryDataCredit prefix="Country data from" /></p>
                {about && <div className="mt-2 max-w-[90ch] text-xs leading-relaxed opacity-80">{about}</div>}
            </div>
        </footer>
    )
}
