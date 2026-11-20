import { ExternalLink } from "lucide-react"

/**
 * Where the Extras' flags come from, for the footer of /extras and of an Extras
 * pack in Play. Every file is public domain or CC0, so no credit is owed
 * (scripts/gen-extra-flags.mjs refuses anything else) - this is a courtesy, and
 * it says where to look a flag up. The per-file record is data/extraFlags.sources.json.
 */
export default function ExtrasCredit() {
    const link = "inline-flex items-center gap-0.5 underline decoration-slate-300 underline-offset-2 hover:text-slate-900 dark:decoration-slate-600 dark:hover:text-white"
    return (
        <p>
            Extras flags from{" "}
            <a href="https://commons.wikimedia.org" target="_blank" rel="noopener noreferrer" className={link}>
                Wikimedia Commons <ExternalLink size={11} aria-hidden />
            </a>
            , all public domain or CC0. Names, years and descriptions from{" "}
            <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer" className={link}>
                Wikidata <ExternalLink size={11} aria-hidden />
            </a>{" "}
            (CC0).
        </p>
    )
}
