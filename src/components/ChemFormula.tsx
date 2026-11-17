import { chargeLabel, formulaParts } from "../utils/chemFormula"

/**
 * A chemical formula with real subscripts ("H₂SO₄"), and an ion's charge as a
 * superscript when there is one. Real <sub>/<sup> rather than Unicode digits:
 * they read better at size and the text stays copyable as "H2SO4".
 */
export default function ChemFormula({ formula, charge, className = "" }: { formula: string; charge?: number; className?: string }) {
    return (
        <span className={`whitespace-nowrap ${className}`}>
            {formulaParts(formula).map((part, i) => (part.sub
                ? <sub key={i} className="text-[0.62em]">{part.text}</sub>
                : <span key={i}>{part.text}</span>))}
            {charge !== undefined && charge !== 0 && <sup className="ml-[0.05em] text-[0.62em]">{chargeLabel(charge)}</sup>}
        </span>
    )
}
