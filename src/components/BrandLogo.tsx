import { asset } from "../utils/asset"
import { useSnow } from "../utils/snowSeason"

/**
 * The Flag Learn globe, everywhere the wordmark shows it. In the Christmas
 * season (utils/snowSeason.ts) it wears a knitted beanie - the user picked the
 * blue one, set at an angle so it sits on the globe. Its brim is curved to
 * follow the globe; positions are shares of the box, so it fits at any size.
 * Not switched off by the snow button: it does not move.
 */
export default function BrandLogo({ className }: { className: string }) {
    const season = useSnow() !== "off-season"
    return (
        <span className={`relative block shrink-0 ${className}`}>
            <img src={asset("/logo2.png")} alt="" className="h-full w-full" />
            {season && (
                <svg
                    viewBox="0 0 64 56"
                    aria-hidden
                    className="pointer-events-none absolute overflow-visible"
                    // The brim's middle (50% 77%) sits on the globe 30 degrees left of its top.
                    style={{ width: "56%", left: "7%", top: "-14%", rotate: "-30deg", transformOrigin: "50% 77%" }}
                >
                    <path d="M9 38 C 9 20, 20 10, 32 10 C 44 10, 55 20, 55 38 Q 32 22 9 38 Z" fill="#2563EB" stroke="#1B2236" strokeWidth="3" strokeLinejoin="round" />
                    <path d="M15 26 Q32 17 49 26" fill="none" stroke="#fff" strokeWidth="3.2" strokeDasharray="3 4" strokeLinecap="round" />
                    <path d="M5 38 Q32 20 59 38 L59 49 Q32 31 5 49 Z" fill="#fff" stroke="#1B2236" strokeWidth="3" strokeLinejoin="round" />
                    <path d="M13 35 v9 M21 32 v9 M29 30.5 v9 M37 30.5 v9 M45 32 v9 M53 35 v9" stroke="#C8D5EC" strokeWidth="2" />
                    <circle cx="32" cy="7" r="7" fill="#fff" stroke="#1B2236" strokeWidth="3" />
                </svg>
            )}
        </span>
    )
}
