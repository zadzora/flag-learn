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
const CLOTH = "M16.4 16.2 C19.5 13.6 24 13 27 16 C29.8 18.8 32.5 19.2 37.6 17.4 L36 31.2 C33.2 33.6 30.4 33.4 27.4 31 C24 28.4 20 28.4 15.3 31.2 Z"

const BRACKETS = [
    { d: "M8 14 V10.5 Q8 8 10.5 8 H14", dx: 1.6, dy: 1.6 },
    { d: "M34 8 H37.5 Q40 8 40 10.5 V14", dx: -1.6, dy: 1.6 },
    { d: "M8 34 V37.5 Q8 40 10.5 40 H14", dx: 1.6, dy: -1.6 },
    { d: "M34 40 H37.5 Q40 40 40 37.5 V34", dx: -1.6, dy: -1.6 },
]

export const DailyFlagleIcon = dailyIcon("DailyFlagleIcon", (fine, uid) => (
    <>
        <defs>
            <clipPath id={`${uid}cloth`}>
                <path d={CLOTH} />
            </clipPath>
        </defs>
        {BRACKETS.map(({ d, dx, dy }) => (
            <g key={d} className="di-focus" style={{ "--dx": `${dx}px`, "--dy": `${dy}px` } as CSSProperties}>
                <Tube d={d} color={FLAGLE_GREEN} ink={FLAGLE_INK} width={2.6} />
            </g>
        ))}
        <g className="di-cloth" style={origin(15.8, 23.6)}>
            <path d={CLOTH} fill="#059669" />
            <g clipPath={`url(#${uid}cloth)`}>
                <path d="M14 28 C20 25.4 24 25.4 27.4 28 C30.4 30.4 33.2 30.6 40 28 V40 H14 Z" fill="#047857" />
                <path d="M32.6 12 L42 12 L42 38 L30.8 38 Z" fill="#6ee7b7" />
            </g>
            <path d={CLOTH} fill="none" stroke={FLAGLE_INK} strokeWidth={2} strokeLinejoin="round" />
            {fine && <Glint d="M19.2 18.2 C20.6 16.8 22.4 16.3 24 16.4" width={1.2} />}
            {fine && <Glint d="M34.3 24.6 L33.8 27.4" width={1.2} />}
        </g>
        <Tube d="M15.3 14.4 L12.9 36" color={FLAGLE_GREEN} ink={FLAGLE_INK} width={2} />
        <circle cx={15.5} cy={12.6} r={2.4} fill={FLAGLE_GREEN} stroke={FLAGLE_INK} strokeWidth={1.8} />
        {fine && <Glint d="M14.6 11.9 l0.6 -0.5" width={0.9} />}
        <path
            className="di-twinkle"
            style={origin(33.6, 13.4)}
            d="M33.6 10.6 Q34.1 12.9 36.4 13.4 Q34.1 13.9 33.6 16.2 Q33.1 13.9 30.8 13.4 Q33.1 12.9 33.6 10.6 Z"
            fill="#fbbf24"
            stroke={FLAGLE_INK}
            strokeWidth={1.3}
            strokeLinejoin="round"
        />
    </>
))

/* ------------------------------------------------------------------ */

const GAUNTLET_INK = "#3a1f0a"

export const DailyGauntletIcon = dailyIcon("DailyGauntletIcon", fine => {
    const dots = [6.4, 16.2, 26]
    return (
        <>
            <Tube d="M6.4 30.2 H35.8" color="#fbbf24" ink={GAUNTLET_INK} width={1.6} />
            <Tube d="M35.8 26.6 V16.4" color="#fbbf24" ink={GAUNTLET_INK} width={1.6} />
            <g className="di-cloth" style={origin(37.4, 18.8)}>
                <path d="M37.4 15.6 L44.8 18.8 L37.4 22 Z" fill="#f59e0b" />
                <path d="M37.4 15.6 L39.3 16.5 C39.1 18.6 39.7 20 40.8 20.5 L37.4 22 Z" fill="#fde68a" />
                <path d="M37.4 15.6 L44.8 18.8 L37.4 22 Z" fill="none" stroke={GAUNTLET_INK} strokeWidth={1.8} strokeLinejoin="round" />
            </g>
            <circle cx={35.8} cy={15} r={2} fill="#f59e0b" stroke={GAUNTLET_INK} strokeWidth={1.6} />
            {dots.map((x, i) => (
                <g key={x} className="di-hop" style={{ animationDelay: `${i * 90}ms` }}>
                    <circle cx={x} cy={30.2} r={4.2} fill="#cf6d04" />
                    <circle cx={x - 0.45} cy={29.75} r={3.65} fill="#f28c0f" />
                    <circle cx={x} cy={30.2} r={4.2} fill="none" stroke={GAUNTLET_INK} strokeWidth={1.9} />
                    {fine && <Glint d={`M${x - 2} ${30.6} A2 2 0 0 1 ${x - 0.6} ${28.4}`} width={0.9} />}
                </g>
            ))}
            <g className="di-hop" style={{ animationDelay: "270ms" }}>
                <circle cx={35.8} cy={30.2} r={4.2} fill="#f59e0b" stroke={GAUNTLET_INK} strokeWidth={1.9} />
                <circle className="di-goal" cx={35.8} cy={30.2} r={2.1} fill="#fff" />
            </g>
        </>
    )
})

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
