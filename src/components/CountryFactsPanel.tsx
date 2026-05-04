import type { ComponentType, ReactNode } from "react"
import { ExternalLink, Globe, Loader2, Landmark, Banknote } from "lucide-react"
import type { CountryFactsDisplay } from "../utils/countryFactsFree"

export type CountryFactsUi =
    | { phase: "loading" }
    | { phase: "ready"; facts: CountryFactsDisplay }
    | { phase: "failed" }

function fmtIntEn(n: number): string {
    return new Intl.NumberFormat("en-US").format(Math.round(n))
}

type IconProps = {
    size?: number
    className?: string
    strokeWidth?: number
    "aria-hidden"?: boolean
}

function MaskedSpoilerButton({
    Icon,
    onTap,
    tapHint,
}: {
    Icon: ComponentType<IconProps>
    onTap?: () => void
    tapHint?: ReactNode
}) {
    const interactive = Boolean(onTap)
    return (
        <dd className="p-0">
            <button
                type="button"
                onClick={() => onTap?.()}
                className={`relative flex w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-md border border-dashed border-indigo-400/70 bg-indigo-100/50 px-3 py-2.5 text-left transition-colors dark:border-indigo-500/45 dark:bg-indigo-950/55 ${
                    interactive
                        ? "cursor-pointer hover:border-indigo-500 hover:bg-indigo-100/90 active:scale-[0.99] dark:hover:border-indigo-400 dark:hover:bg-indigo-900/40"
                        : "cursor-default"
                }`}
            >
                <div
                    className="pointer-events-none flex items-center justify-center gap-1.5 blur-[6px] opacity-50 select-none"
                    aria-hidden
                >
                    <span className="h-2 w-14 shrink-0 rounded-full bg-indigo-500/90 dark:bg-indigo-400/80" />
                    <span className="h-2 w-8 shrink-0 rounded-full bg-indigo-500/90 dark:bg-indigo-400/80" />
                </div>
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-2 pt-0.5">
                    <span className="flex items-center gap-1 text-xs font-semibold text-indigo-900 dark:text-indigo-100">
                        <Icon size={13} className="shrink-0 opacity-90" aria-hidden />
                        Yet to learn
                    </span>
                    {tapHint}
                </span>
            </button>
        </dd>
    )
}

type Props = {
    ui: CountryFactsUi
    /** When true, do not reveal API capital (Capitals mode until mastered). */
    maskCapital?: boolean
    /** Opens World Capitals mode (e.g. close modal & switch tab). */
    onMaskedCapitalClick?: () => void
    /** When true, hide official/common names & full currency line (Capitals until country mastered in Countries). */
    maskCountryIdentity?: boolean
    /** Opens Countries / World flags mode. */
    onMaskedCountryIdentityClick?: () => void
}

export default function CountryFactsPanel({
    ui,
    maskCapital = false,
    onMaskedCapitalClick,
    maskCountryIdentity = false,
    onMaskedCountryIdentityClick,
}: Props) {
    const countryTapHint =
        onMaskedCountryIdentityClick != null ? (
            <span className="text-center text-[10px] font-medium leading-tight text-indigo-600 dark:text-indigo-300">
                Tap to open <span className="underline decoration-indigo-400/80 underline-offset-2">Countries</span>
            </span>
        ) : null

    return (
        <div className="w-full rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-4 py-3 text-left text-sm shadow-sm dark:border-indigo-500/25 dark:bg-indigo-950/40">
            <div className="mb-2 flex items-center gap-2 font-bold text-indigo-800 dark:text-indigo-200">
                <Globe size={18} className="shrink-0 opacity-90" />
                <span>Country facts</span>
            </div>

            {ui.phase === "loading" && (
                <div className="flex items-center gap-2 text-indigo-700/90 dark:text-indigo-300/90">
                    <Loader2 className="size-4 animate-spin" />
                    <span>Loading…</span>
                </div>
            )}

            {ui.phase === "failed" && (
                <p className="text-indigo-700/80 dark:text-indigo-300/70">
                    Could not load data (offline or unknown country code).
                </p>
            )}

            {ui.phase === "ready" && (
                <div className="space-y-3 text-indigo-950 dark:text-indigo-100">
                    <dl className="grid gap-2">
                        {(maskCountryIdentity || ui.facts.officialName) && (
                            <div>
                                <dt className="text-xs font-semibold uppercase tracking-wide text-indigo-600/90 dark:text-indigo-400/90">
                                    Official name
                                </dt>
                                {maskCountryIdentity ? (
                                    <MaskedSpoilerButton
                                        Icon={Globe}
                                        onTap={onMaskedCountryIdentityClick}
                                        tapHint={countryTapHint}
                                    />
                                ) : (
                                    <dd className="font-semibold">{ui.facts.officialName}</dd>
                                )}
                            </div>
                        )}
                        {ui.facts.commonName && (
                            <div>
                                <dt className="text-xs font-semibold uppercase tracking-wide text-indigo-600/90 dark:text-indigo-400/90">
                                    Common name
                                </dt>
                                {maskCountryIdentity ? (
                                    <MaskedSpoilerButton
                                        Icon={Globe}
                                        onTap={onMaskedCountryIdentityClick}
                                        tapHint={countryTapHint}
                                    />
                                ) : (
                                    <dd>{ui.facts.commonName}</dd>
                                )}
                            </div>
                        )}
                        {ui.facts.region && (
                            <div>
                                <dt className="text-xs font-semibold uppercase tracking-wide text-indigo-600/90 dark:text-indigo-400/90">
                                    Region
                                </dt>
                                <dd>
                                    {ui.facts.region}
                                    {ui.facts.subregion ? ` · ${ui.facts.subregion}` : ""}
                                </dd>
                            </div>
                        )}
                        {(maskCapital || ui.facts.capital) && (
                            <div>
                                <dt className="text-xs font-semibold uppercase tracking-wide text-indigo-600/90 dark:text-indigo-400/90">
                                    Capital
                                </dt>
                                {maskCapital ? (
                                    <dd className="p-0">
                                        <button
                                            type="button"
                                            onClick={() => onMaskedCapitalClick?.()}
                                            className={`relative flex w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-md border border-dashed border-indigo-400/70 bg-indigo-100/50 px-3 py-2.5 text-left transition-colors dark:border-indigo-500/45 dark:bg-indigo-950/55 ${
                                                onMaskedCapitalClick
                                                    ? "cursor-pointer hover:border-indigo-500 hover:bg-indigo-100/90 active:scale-[0.99] dark:hover:border-indigo-400 dark:hover:bg-indigo-900/40"
                                                    : "cursor-default"
                                            }`}
                                        >
                                            <div
                                                className="pointer-events-none flex items-center justify-center gap-1.5 blur-[6px] opacity-50 select-none"
                                                aria-hidden
                                            >
                                                <span className="h-2 w-14 shrink-0 rounded-full bg-indigo-500/90 dark:bg-indigo-400/80" />
                                                <span className="h-2 w-8 shrink-0 rounded-full bg-indigo-500/90 dark:bg-indigo-400/80" />
                                            </div>
                                            <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-2 pt-0.5">
                                                <span className="flex items-center gap-1 text-xs font-semibold text-indigo-900 dark:text-indigo-100">
                                                    <Landmark size={13} className="shrink-0 opacity-90" aria-hidden />
                                                    Yet to learn
                                                </span>
                                                {onMaskedCapitalClick && (
                                                    <span className="text-center text-[10px] font-medium leading-tight text-indigo-600 dark:text-indigo-300">
                                                        Tap to open{" "}
                                                        <span className="underline decoration-indigo-400/80 underline-offset-2">
                                                            World Capitals
                                                        </span>
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                    </dd>
                                ) : (
                                    <dd>{ui.facts.capital}</dd>
                                )}
                            </div>
                        )}
                        {ui.facts.population != null && (
                            <div>
                                <dt className="text-xs font-semibold uppercase tracking-wide text-indigo-600/90 dark:text-indigo-400/90">
                                    Population (estimate)
                                </dt>
                                <dd>{fmtIntEn(ui.facts.population)}</dd>
                            </div>
                        )}
                        {ui.facts.areaKm2 != null && (
                            <div>
                                <dt className="text-xs font-semibold uppercase tracking-wide text-indigo-600/90 dark:text-indigo-400/90">
                                    Area
                                </dt>
                                <dd>{fmtIntEn(ui.facts.areaKm2)} km²</dd>
                            </div>
                        )}
                        {ui.facts.currencyLabel && (
                            <div>
                                <dt className="text-xs font-semibold uppercase tracking-wide text-indigo-600/90 dark:text-indigo-400/90">
                                    Currency
                                </dt>
                                {maskCountryIdentity ? (
                                    <MaskedSpoilerButton
                                        Icon={Banknote}
                                        onTap={onMaskedCountryIdentityClick}
                                        tapHint={countryTapHint}
                                    />
                                ) : (
                                    <dd>{ui.facts.currencyLabel}</dd>
                                )}
                            </div>
                        )}
                    </dl>

                    {ui.facts.worldPop && (
                        <div className="rounded-lg border border-indigo-200/60 bg-white/60 p-2 dark:border-indigo-500/20 dark:bg-slate-900/40">
                            <p className="mb-2 text-xs font-semibold text-indigo-800 dark:text-indigo-200">
                                WorldPop — population distribution ({ui.facts.worldPop.year})
                            </p>
                            <img
                                src={ui.facts.worldPop.previewUrl}
                                alt=""
                                className="mb-2 max-h-40 w-full rounded-md object-cover object-center"
                                loading="lazy"
                            />
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                                <a
                                    href={ui.facts.worldPop.summaryUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 font-medium text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300"
                                >
                                    Data summary <ExternalLink className="size-3" />
                                </a>
                                <a
                                    href={ui.facts.worldPop.licenseUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 font-medium text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300"
                                >
                                    License <ExternalLink className="size-3" />
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
