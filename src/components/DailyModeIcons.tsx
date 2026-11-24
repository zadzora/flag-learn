import { useId, type CSSProperties, type ReactNode } from "react"
import type { ModeIcon } from "./ModeIcons"

/**
 * The daily modes' icons: full colour, drawn from graphic/daily_*.png and
 * graphic/Racing Route Time Challenge.png on a 48-unit box.
 *
 * Unlike the traced family in ModeIcons.tsx these are built from separate
 * shapes, because each one moves a part of itself on hover - the needle
 * swings, the flag waves, the car pulls away. The animations live in
 * index.css (`.di-*`) and play when the icon or any `.group` around it is
 * hovered, so a card that wraps the icon in a `group` link animates it from
 * anywhere on the card.
 *
 * They keep their own colours and ignore `currentColor`. The highlights only
 * draw from 28px up; at the 19px of a list chip they are noise.
 */

const STROKE = { strokeLinecap: "round", strokeLinejoin: "round" } as const

/** A thick outlined line: the ink drawn wide, the colour drawn narrow on top. */
function Tube({ d, color, ink, width }: { d: string; color: string; ink: string; width: number }) {
    return (
        <>
            <path d={d} fill="none" stroke={ink} strokeWidth={width + 2.4} {...STROKE} />
            <path d={d} fill="none" stroke={color} strokeWidth={width} {...STROKE} />
        </>
    )
}

function Glint({ d, width = 1.1 }: { d: string; width?: number }) {
    return <path d={d} fill="none" stroke="#fff" strokeWidth={width} opacity={0.9} {...STROKE} />
}

/** Pins a part's transform origin, in viewBox units. */
function origin(x: number, y: number, extra?: Record<string, string>): CSSProperties {
    return { transformOrigin: `${x}px ${y}px`, ...extra } as CSSProperties
}

function dailyIcon(name: string, draw: (fine: boolean, uid: string) => ReactNode): ModeIcon {
    const Icon: ModeIcon = ({ size = 24, className, ...rest }) => {
        // Clip paths need ids, and a page can show the same icon twice.
        const uid = `di${useId().replace(/[^\w-]/g, "")}`
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width={size}
                height={size}
                viewBox="0 0 48 48"
                className={className ? `di ${className}` : "di"}
                {...rest}
            >
                {draw(Number(size) >= 28, uid)}
            </svg>
        )
    }
    Icon.displayName = name
    return Icon
}

/* ------------------------------------------------------------------ */

const CONNECTIONS_INK = "#2e1065"
const LAVENDER = ["#ddd6fe", "#c4b5fd"] as const
const AMBER = ["#fcd34d", "#fbbf24"] as const
const SKY = ["#a5d8ff", "#74c0fc"] as const

function Tile({ x, y, colors, fine, hop }: { x: number; y: number; colors: readonly [string, string]; fine: boolean; hop?: number }) {
    return (
        <g className={hop === undefined ? undefined : "di-hop"} style={hop === undefined ? undefined : { animationDelay: `${hop}ms` }}>
            <rect x={x} y={y} width={9} height={9} rx={2.6} fill={colors[1]} />
            <rect x={x} y={y} width={7.9} height={7.9} rx={2.2} fill={colors[0]} />
            <rect x={x} y={y} width={9} height={9} rx={2.6} fill="none" stroke={CONNECTIONS_INK} strokeWidth={1.9} />
            {fine && <Glint d={`M${x + 2.2} ${y + 3.6} l1.4 -1.4`} />}
        </g>
    )
}

export const DailyConnectionsIcon = dailyIcon("DailyConnectionsIcon", fine => {
    const cols = [4.5, 14.5, 24.5, 34.5]
    const rows: { y: number; tiles: (readonly [string, string])[] }[] = [
        { y: 4.5, tiles: [LAVENDER, AMBER, LAVENDER, LAVENDER] },
        { y: 24.5, tiles: [LAVENDER, LAVENDER, SKY, LAVENDER] },
        { y: 34.5, tiles: [LAVENDER, AMBER, LAVENDER, LAVENDER] },
    ]
    let hop = 0
    return (
        <>
            {rows.map(({ y, tiles }) =>
                tiles.map((colors, i) => (
                    <Tile key={`${y}-${i}`} x={cols[i]} y={y} colors={colors} fine={fine} hop={colors === LAVENDER ? undefined : 90 + 80 * hop++} />
                )),
            )}
            {/* The solved group: four tiles merged into one bar. */}
            <g className="di-snap" style={origin(24, 19)}>
                <rect x={4.5} y={14.5} width={39} height={9} rx={4.5} fill="#6425d0" />
                <rect x={4.5} y={14.5} width={38} height={7.9} rx={3.95} fill="#7c3aed" />
                <rect x={4.5} y={14.5} width={39} height={9} rx={4.5} fill="none" stroke={CONNECTIONS_INK} strokeWidth={1.9} />
                {fine && <Glint d="M8.2 18.6 l1.4 -1.4" />}
            </g>
        </>
    )
})

/* ------------------------------------------------------------------ */

const DEDUCTION_INK = "#0c2d5e"

export const DailyDeductionIcon = dailyIcon("DailyDeductionIcon", fine => (
    <g className="di-tilt" style={origin(20.5, 20.5)}>
        <rect x={-3.3} y={14.4} width={6.6} height={12.4} rx={3.3} transform="translate(20.5 20.5) rotate(-45)" fill="#1d8fe1" stroke={DEDUCTION_INK} strokeWidth={2} />
        {fine && <Glint d="M33.6 32.2 l2.2 2.2" width={1.3} />}
        <circle cx={20.5} cy={20.5} r={14} fill="#1d8fe1" />
        <path d="M32.15 24.74 A12.4 12.4 0 0 1 16.26 32.15" fill="none" stroke="#0a6fc2" strokeWidth={2.6} strokeLinecap="round" />
        <circle cx={20.5} cy={20.5} r={14} fill="none" stroke={DEDUCTION_INK} strokeWidth={2} />
        {fine && <Glint d="M8.94 16.29 A12.3 12.3 0 0 1 13.44 10.42" width={1.4} />}
        <circle cx={20.5} cy={20.5} r={9.4} fill="#e0f2fe" stroke={DEDUCTION_INK} strokeWidth={2} />
        <path d="M20.5 13.5 V15.1 M20.5 25.9 V27.5 M13.5 20.5 H15.1 M25.9 20.5 H27.5" stroke="#3b7fc4" strokeWidth={1.6} strokeLinecap="round" />
        <g className="di-swing" style={origin(20.5, 20.5)}>
            <g transform="rotate(45 20.5 20.5)">
                <polygon points="20.5,13.2 22.4,20.5 18.6,20.5" fill="#ef4444" />
                <polygon points="20.5,27.8 22.4,20.5 18.6,20.5" fill="#fff" />
                <polygon points="20.5,13.2 22.4,20.5 20.5,27.8 18.6,20.5" fill="none" stroke={DEDUCTION_INK} strokeWidth={1.5} strokeLinejoin="round" />
                <circle cx={20.5} cy={20.5} r={1.5} fill="#fff" stroke={DEDUCTION_INK} strokeWidth={1.2} />
            </g>
        </g>
    </g>
))

/* ------------------------------------------------------------------ */

const FLAGLE_INK = "#053b2c"
const FLAGLE_GREEN = "#10b981"
const FOIL = "#c3c9d2"
const FOIL_DARK = "#a9b1bd"
const CARD = "M10 10 H35 Q39 10 39 14 V30 Q39 34 35 34 H10 Q6 34 6 30 V14 Q6 10 10 10 Z"
/** The scratched-off stripe, jagged where the coin tore the foil. */
const SCRATCH = "M8.6 26 L13.4 20.2 L14 23 L19 18 L19.6 21 L25 16 L25.6 19 L31 14.2 L31.6 17.4 L37 15.6 L35.2 19.6 L37.6 21.6 L35.4 24.6 L36 27 L31 29.8 L30.6 27.4 L25 30.8 L24.6 28.4 L19 31.2 L18.6 28.8 L13.2 30.8 L12.8 28.4 L9 29.4 Z"
/** Foil flakes coming off the card, each with the way it flies on hover. */
const FLAKES = [
    { d: "M15.6 39.6 L18.6 37.4 L20.6 40 L17.2 41.8 Z", dx: -1.4, dy: 1.6 },
    { d: "M21.6 36.4 L25.2 35.6 L25.4 38.8 L22.2 39.2 Z", dx: -0.6, dy: 2 },
    { d: "M23.4 42 L26.6 40.4 L28 43.2 L24.6 44.2 Z", dx: 0.4, dy: 1.8 },
]

export const DailyFlagleIcon = dailyIcon("DailyFlagleIcon", (fine, uid) => (
    <>
        <defs>
            <clipPath id={`${uid}card`}>
                <path d={CARD} />
            </clipPath>
            <clipPath id={`${uid}scratch`}>
                <path d={SCRATCH} />
            </clipPath>
        </defs>
        <path d={CARD} fill={FOIL} />
        <path d="M4 30 L41 25 V36 H4 Z" fill={FOIL_DARK} clipPath={`url(#${uid}card)`} />
        <path d={CARD} fill="none" stroke={FLAGLE_INK} strokeWidth={2.2} strokeLinejoin="round" />
        {fine && <Glint d="M9.6 17 Q9.6 13.4 13 13.4" width={1.3} />}
        {fine && <Glint d="M15.6 13.4 h0.4" width={1.3} />}

        <g clipPath={`url(#${uid}scratch)`}>
            <rect x={6} y={12} width={34} height={22} fill={FLAGLE_GREEN} />
            <path d="M6 24.8 L40 22.6 V34 H6 Z" fill="#fff" />
            <path d="M6 30 L40 28.6 V34 H6 Z" fill="#e2e8f0" />
        </g>
        <path d={SCRATCH} fill="none" stroke={FLAGLE_INK} strokeWidth={1.3} strokeLinejoin="round" />

        {FLAKES.map(({ d, dx, dy }) => (
            <path
                key={d}
                className="di-focus"
                style={{ "--dx": `${dx}px`, "--dy": `${dy}px` } as CSSProperties}
                d={d}
                fill="#dfe3e8"
                stroke={FLAGLE_INK}
                strokeWidth={1}
                strokeLinejoin="round"
            />
        ))}

        <g className="di-scrape" style={origin(35.8, 31)}>
            <g transform="rotate(32 35.8 31)">
                <ellipse cx={37.4} cy={32.2} rx={7.4} ry={9} fill="#d99a12" stroke={FLAGLE_INK} strokeWidth={2.2} />
                <ellipse cx={35.8} cy={31} rx={7.4} ry={9} fill="#fbbf24" stroke={FLAGLE_INK} strokeWidth={2.2} />
                <ellipse cx={35.8} cy={31} rx={5.2} ry={6.6} fill="#fcd34d" />
                {fine && <Glint d="M32.4 27.4 Q33.4 25 35.6 24.6" width={1.4} />}
            </g>
        </g>
    </>
))

/* ------------------------------------------------------------------ */

const TRIVIA_INK = "#2b1a10"
const TRIVIA_NAVY = "#14213d"
const BULB = "M24 10.4 C17.4 10.4 12.8 15.4 12.8 21.6 C12.8 25.6 14.7 28.4 17.1 30.4 C18.2 31.3 18.7 32.3 18.7 33.5 V34.6 H29.3 V33.5 C29.3 32.3 29.8 31.3 30.9 30.4 C33.3 28.4 35.2 25.6 35.2 21.6 C35.2 15.4 30.6 10.4 24 10.4 Z"
/** The five rays over the bulb, each with the way it springs out on hover. */
const RAYS = [
    { d: "M24 3 V6.4", dx: 0, dy: -1.4 },
    { d: "M14.6 6.6 L16.8 9.2", dx: -1.1, dy: -1.1 },
    { d: "M33.4 6.6 L31.2 9.2", dx: 1.1, dy: -1.1 },
    { d: "M7.8 14.4 L11 15.8", dx: -1.4, dy: -0.5 },
    { d: "M40.2 14.4 L37 15.8", dx: 1.4, dy: -0.5 },
]

/** graphic/daily_trivia.png [1,1]: a lit bulb with a question in it. The rays spring out and the question hops on hover. */
export const DailyTriviaIcon = dailyIcon("DailyTriviaIcon", (fine, uid) => (
    <>
        <defs>
            <clipPath id={`${uid}bulb`}>
                <path d={BULB} />
            </clipPath>
        </defs>
        {RAYS.map(({ d, dx, dy }) => (
            <g key={d} className="di-focus" style={{ "--dx": `${dx}px`, "--dy": `${dy}px` } as CSSProperties}>
                <Tube d={d} color="#f29a1f" ink={TRIVIA_INK} width={2.4} />
            </g>
        ))}
        <path d={BULB} fill="#ffc21a" />
        <g clipPath={`url(#${uid}bulb)`}>
            <path d="M28.6 8 C34.6 11.4 37 17 36.2 22.6 C35.6 26.6 33.2 29.6 30.6 31.8 V36 H40 V8 Z" fill="#f29a1f" />
        </g>
        <path d={BULB} fill="none" stroke={TRIVIA_INK} strokeWidth={2} strokeLinejoin="round" />
        {fine && <Glint d="M16.2 19.4 C16.6 16.4 18.4 14.4 20.8 13.6" width={1.3} />}
        <g className="di-hop">
            <path d="M20.3 19.2 C20.3 16.8 22 15.2 24.1 15.2 C26.2 15.2 27.8 16.7 27.8 18.7 C27.8 21.6 24.1 22 24.1 25.2" fill="none" stroke={TRIVIA_NAVY} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={24.1} cy={29.2} r={1.8} fill={TRIVIA_NAVY} />
        </g>
        <rect x={18.4} y={34.6} width={11.2} height={3} rx={1.5} fill="#cbd5e1" stroke={TRIVIA_INK} strokeWidth={1.6} />
        <rect x={19.2} y={37.6} width={9.6} height={2.8} rx={1.4} fill="#94a3b8" stroke={TRIVIA_INK} strokeWidth={1.6} />
        {fine && <Glint d="M20.4 35.8 H22.6" width={0.9} />}
        <path d="M21.8 40.4 Q24 43.4 26.2 40.4" fill="#64748b" stroke={TRIVIA_INK} strokeWidth={1.5} strokeLinejoin="round" />
    </>
))

/* ------------------------------------------------------------------ */

const LANDMARKS_INK = "#0b2e22"
const LM_GREEN = "#10b981"
const LM_GREEN_DARK = "#059669"
const LM_GOLD = "#fbbf24"
const LM_GOLD_DARK = "#e9a20c"
const LM_CREAM = "#fdf3dc"
const LM_CREAM_DARK = "#efdfb8"
const LM_SKY = "#d3e3ec"
const LM_STONE = "#cbd2d9"
const LM_LINE = { stroke: LANDMARKS_INK, strokeWidth: 1.5, strokeLinejoin: "round" } as const
const DOME = "M31.9 23.4 A5.8 5.8 0 0 1 43.5 23.4 Z"
/** The bridge's deck and pier, with the arch cut out underneath. */
const PIER = "M12.6 29.2 Q22 27.6 31 29.2 V35.8 H26.6 C26.6 32.8 24.6 31.4 22 31.4 C19.4 31.4 17.4 32.8 17.4 35.8 H12.6 Z"
const UNDER_ARCH = "M17.4 35.8 C17.4 32.8 19.4 31.4 22 31.4 C24.6 31.4 26.6 32.8 26.6 35.8 Z"
/** The towers and the beam between them, notched at the top like the drawing. */
const PORTAL = "M15.9 28.8 V18.2 Q15.9 17.6 16.5 17.6 H18.6 Q19.2 17.6 19.2 18.2 V19.6 H28.6 V18.2 Q28.6 17.6 29.2 17.6 H31.3 Q31.9 17.6 31.9 18.2 V28.8 Z"
const PORTAL_ARCH = "M19.6 28.8 V24.4 C19.6 22.6 21.4 21.6 23.9 21.6 C26.4 21.6 28.2 22.6 28.2 24.4 V28.8 Z"

/** graphic/daily_landmarks.png [1,1]: a skyline of a clock tower, a bridge and a dome. The clock's hand goes round and the dome's lantern hops on hover. */
export const DailyLandmarksIcon = dailyIcon("DailyLandmarksIcon", fine => (
    <>
        {/* Bridge, behind the other two */}
        <path d="M12.8 29 L16.4 19 M14.6 28.6 L16.4 23.4 M35 29 L31.4 19 M33.2 28.6 L31.4 23.4" stroke={LANDMARKS_INK} strokeWidth={1} strokeLinecap="round" />
        <path d={PORTAL} fill={LM_GOLD} {...LM_LINE} />
        <path d={PORTAL_ARCH} fill={LM_SKY} {...LM_LINE} />
        <path d="M17.4 18.8 V28 M30.4 18.8 V28" stroke={LM_GOLD_DARK} strokeWidth={0.9} />
        <path d={UNDER_ARCH} fill={LM_SKY} />
        <path d={PIER} fill={LM_STONE} {...LM_LINE} />
        <path d="M12.6 31 Q22 29.4 31 31" fill="none" stroke={LANDMARKS_INK} strokeWidth={1.1} />
        <path d="M12.8 35.8 V34 A2.2 2.2 0 0 1 17.2 34 V35.8 Z M26.8 35.8 V34 A2.1 2.1 0 0 1 31 34 V35.8 Z" fill={LM_GREEN} {...LM_LINE} />

        {/* Clock tower */}
        <path d="M8.4 10.8 L11.4 17.6 H5.4 Z" fill={LM_GREEN} {...LM_LINE} />
        {fine && <Glint d="M7.8 13.4 L7 15.4" width={0.8} />}
        <rect x={4.6} y={17.6} width={7.6} height={2.2} rx={0.5} fill={LM_GREEN_DARK} {...LM_LINE} />
        <rect x={5.3} y={26.6} width={6.2} height={9.2} fill={LM_GOLD} {...LM_LINE} />
        <rect x={9.6} y={27.4} width={1.2} height={7.6} fill={LM_GOLD_DARK} />
        <path d="M7.4 28.8 V33.4 M9.2 28.8 V33.4" stroke={LANDMARKS_INK} strokeWidth={1.1} strokeLinecap="round" />
        <rect x={4.6} y={19.8} width={7.6} height={6.8} rx={0.5} fill={LM_GOLD} {...LM_LINE} />
        <circle cx={8.4} cy={23.2} r={2.4} fill="#fff" stroke={LANDMARKS_INK} strokeWidth={1.2} />
        <path d="M8.4 23.2 H9.6" stroke={LANDMARKS_INK} strokeWidth={0.9} strokeLinecap="round" />
        <path className="di-tick" style={origin(8.4, 23.2)} d="M8.4 23.2 V21.6" stroke={LANDMARKS_INK} strokeWidth={0.9} strokeLinecap="round" />

        {/* Domed building */}
        <rect x={31.6} y={27.8} width={12.2} height={8} fill={LM_CREAM} {...LM_LINE} />
        <rect x={40.6} y={28.6} width={2.4} height={6.4} fill={LM_CREAM_DARK} />
        <path d="M34 29.8 V33.4 M41.4 29.8 V33.4" stroke={LANDMARKS_INK} strokeWidth={1.1} strokeLinecap="round" />
        <path d="M36.2 35.8 V32 A1.5 1.5 0 0 1 39.2 32 V35.8 Z" fill={LM_GREEN} {...LM_LINE} />
        <rect x={30.6} y={26.2} width={14.2} height={1.8} rx={0.5} fill={LM_CREAM_DARK} {...LM_LINE} />
        <rect x={32.2} y={23.4} width={11} height={2.8} fill={LM_CREAM} {...LM_LINE} />
        <path d="M34.8 24.2 V25.4 M37.7 24.2 V25.4 M40.6 24.2 V25.4" stroke={LANDMARKS_INK} strokeWidth={0.9} strokeLinecap="round" />
        <path d={DOME} fill={LM_GREEN} {...LM_LINE} />
        {fine && <Glint d="M34.6 21.2 A4 4 0 0 1 36.2 19.4" width={0.9} />}
        <g className="di-hop">
            <path d="M37.7 17.6 V16.6" stroke={LANDMARKS_INK} strokeWidth={1.2} strokeLinecap="round" />
            <circle cx={37.7} cy={15.8} r={1} fill={LM_GREEN} stroke={LANDMARKS_INK} strokeWidth={1.1} />
        </g>

        <path d="M3 35.8 H45" stroke={LANDMARKS_INK} strokeWidth={2} strokeLinecap="round" />
    </>
))

/* ------------------------------------------------------------------ */

const RALLY_INK = "#3f0a14"
const RALLY_RED = "#f43f5e"
const CAR_BODY = "M9 32.6 L8.6 27.6 C8.6 26.4 9.3 25.6 10.4 25.4 L13.2 24.6 C14.6 22.6 16.8 21.8 19.8 21.8 C22.4 21.8 24 22.8 25.8 24.8 L30 25.6 C31.6 25.9 32.4 26.8 32.4 28.4 L32.4 31.2 C32.4 32 31.8 32.6 31 32.6 Z"

function Wheel({ x, fine }: { x: number; fine: boolean }) {
    return (
        <g className="di-spin" style={origin(x, 32.4)}>
            <circle cx={x} cy={32.4} r={3} fill="#3f3f46" stroke={RALLY_INK} strokeWidth={1.6} />
            <circle cx={x} cy={32.4} r={1.2} fill="#d4d4d8" />
            {fine && <path d={`M${x} 32.4 V30.4`} stroke="#a1a1aa" strokeWidth={0.7} strokeLinecap="round" />}
        </g>
    )
}

export const DailyRallyIcon = dailyIcon("DailyRallyIcon", (fine, uid) => (
    <>
        <defs>
            <clipPath id={`${uid}body`}>
                <path d={CAR_BODY} />
            </clipPath>
        </defs>
        <path
            className="di-road"
            d="M5.2 37.6 C9 35.2 12 37 16 38.4 C22 40.4 30 40 35 34.6 C37 32.4 38.6 30.2 40.6 29.8"
            fill="none"
            stroke="#e11d48"
            strokeWidth={1.6}
            strokeDasharray="2.2 2"
            strokeLinecap="round"
        />

        {/* Stopwatch, clear of the roof */}
        <rect x={20.6} y={5.2} width={1.6} height={1.6} fill={RALLY_RED} stroke={RALLY_INK} strokeWidth={1.1} />
        <rect x={19.3} y={3.4} width={4.2} height={2} rx={1} fill={RALLY_RED} stroke={RALLY_INK} strokeWidth={1.3} />
        <rect x={25.4} y={6.1} width={2.4} height={1.6} rx={0.7} transform="rotate(45 26.6 6.9)" fill={RALLY_RED} stroke={RALLY_INK} strokeWidth={1.1} />
        <circle cx={21.4} cy={12.2} r={5.4} fill={RALLY_RED} stroke={RALLY_INK} strokeWidth={1.7} />
        <circle cx={21.4} cy={12.2} r={3.8} fill="#fff" stroke={RALLY_INK} strokeWidth={1.1} />
        <path d="M21.4 9.4 V10 M21.4 14.4 V15 M18.6 12.2 H19.2 M23.6 12.2 H24.2" stroke={RALLY_INK} strokeWidth={0.9} strokeLinecap="round" />
        <path className="di-tick" style={origin(21.4, 12.2)} d="M21.4 12.2 L23.2 10.4" stroke={RALLY_RED} strokeWidth={1.3} strokeLinecap="round" />
        <circle cx={21.4} cy={12.2} r={0.8} fill={RALLY_INK} />

        {/* Pin */}
        <ellipse className="di-shadow" style={origin(41.6, 29.6)} cx={41.6} cy={29.6} rx={2} ry={0.7} fill={RALLY_INK} opacity={0.35} />
        <g className="di-drop">
            <path d="M41.6 28.4 C39.2 25.6 37.8 23.6 37.8 21.4 A3.8 3.8 0 0 1 45.4 21.4 C45.4 23.6 44 25.6 41.6 28.4 Z" fill={RALLY_RED} stroke={RALLY_INK} strokeWidth={1.6} strokeLinejoin="round" />
            <circle cx={41.6} cy={21.4} r={1.5} fill="#fff" stroke={RALLY_INK} strokeWidth={1.1} />
            {fine && <Glint d="M39.4 20.6 A2.4 2.4 0 0 1 40.6 19.2" width={0.9} />}
        </g>

        {/* Car */}
        <path className="di-speed" d="M3.4 26.6 H6.6 M2.4 29 H5.6" stroke={RALLY_RED} strokeWidth={1.6} strokeLinecap="round" />
        <g className="di-car" style={origin(20, 32)}>
            <path d="M10.2 23.4 L10.8 25.2" stroke={RALLY_INK} strokeWidth={1.4} strokeLinecap="round" />
            <rect x={7.2} y={21.6} width={5.6} height={1.8} rx={0.8} fill={RALLY_RED} stroke={RALLY_INK} strokeWidth={1.3} />
            <path d={CAR_BODY} fill={RALLY_RED} />
            <rect x={6} y={29.4} width={28} height={4} fill="#e11d48" clipPath={`url(#${uid}body)`} />
            <path d={CAR_BODY} fill="none" stroke={RALLY_INK} strokeWidth={1.7} strokeLinejoin="round" />
            <path d="M14.4 25 C15.6 23.6 17.4 23 19.6 23 C21.6 23 23 23.6 24.4 25 Z" fill="#bae6fd" stroke={RALLY_INK} strokeWidth={1.2} strokeLinejoin="round" />
            <path d="M18.6 23.1 V25" stroke={RALLY_INK} strokeWidth={1.2} />
            {fine && <Glint d="M20.4 24.2 l1 -0.8" width={0.8} />}
            <polygon points="18.4,26.6 20.2,26.6 21,30.6 19.2,30.6" fill="#fff" />
            <rect x={30.6} y={27} width={1.6} height={1.1} rx={0.5} fill="#fff" />
            <Wheel x={13.2} fine={fine} />
            <Wheel x={27.4} fine={fine} />
        </g>
    </>
))
