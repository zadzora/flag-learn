import type { ReactNode } from "react"
import { ExternalLink } from "lucide-react"

/** When the bundled data/countryStats.json snapshot was last regenerated. */
export const COUNTRY_DATA_UPDATED = "June 2026"
/** Year of the World Bank population figures in the snapshot. */
export const COUNTRY_POP_YEAR = "2024"

const COUNTRIES_URL = "https://github.com/mledoze/countries"
const ODBL_URL = "https://opendatacommons.org/licenses/odbl/1.0/"
const WORLD_BANK_URL = "https://data.worldbank.org/indicator/SP.POP.TOTL"

type Props = {
    /** Leading label, e.g. "Stats from" or "Country data from". */
    prefix?: string
    /** Tailwind classes applied to each source link. */
    linkClassName?: string
    /** Show a small external-link icon after each source link. */
    icons?: boolean
}

/**
 * Attribution line for the bundled country dataset.
 * Country fields (names, capital, area, currency, region) come from
 * mledoze/countries under the ODbL; population from the World Bank.
 * Population figures are the latest available ({@link COUNTRY_POP_YEAR}); the
 * snapshot was compiled {@link COUNTRY_DATA_UPDATED}.
 */
export default function CountryDataCredit({
    prefix = "Stats from",
    linkClassName = "text-indigo-500 underline-offset-2 hover:underline dark:text-indigo-400",
    icons = false,
}: Props) {
    const Link = ({ href, children }: { href: string; children: ReactNode }) => (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={icons ? `inline-flex items-center gap-0.5 ${linkClassName}` : linkClassName}
        >
            {children}
            {icons && <ExternalLink size={11} className="opacity-70" />}
        </a>
    )

    return (
        <span>
            {prefix} <Link href={COUNTRIES_URL}>mledoze/countries</Link> (<Link href={ODBL_URL}>ODbL</Link>) &amp;{" "}
            <Link href={WORLD_BANK_URL}>World Bank</Link> — population {COUNTRY_POP_YEAR}, updated {COUNTRY_DATA_UPDATED}.
        </span>
    )
}
