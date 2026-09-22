// Builds `data/elements.json` - the 118 elements the Science wing quizzes on.
//
// Only the facts that cannot be derived live in the table below: number,
// symbol, name, standard atomic weight and category. Everything positional
// (period, group, and the x/y cell of the printed table) is derived from the
// atomic number by `layout()`, because the shape of the periodic table is a
// rule, not data - typing 118 pairs of coordinates by hand only invents ways
// to be wrong. The script refuses to write a table that fails its checks.
//
// Run: node scripts/gen-elements.mjs

import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "elements.json")

/** [number, symbol, name, mass, category]. A mass printed in brackets (no stable
 *  isotope) is listed here as the mass number of the most stable one and flagged
 *  through `UNSTABLE_MASS` below. */
const ELEMENTS = [
    [1, "H", "Hydrogen", 1.008, "nonmetal"],
    [2, "He", "Helium", 4.0026, "noble-gas"],
    [3, "Li", "Lithium", 6.94, "alkali"],
    [4, "Be", "Beryllium", 9.0122, "alkaline-earth"],
    [5, "B", "Boron", 10.81, "metalloid"],
    [6, "C", "Carbon", 12.011, "nonmetal"],
    [7, "N", "Nitrogen", 14.007, "nonmetal"],
    [8, "O", "Oxygen", 15.999, "nonmetal"],
    [9, "F", "Fluorine", 18.998, "halogen"],
    [10, "Ne", "Neon", 20.18, "noble-gas"],
    [11, "Na", "Sodium", 22.99, "alkali"],
    [12, "Mg", "Magnesium", 24.305, "alkaline-earth"],
    [13, "Al", "Aluminium", 26.982, "post-transition"],
    [14, "Si", "Silicon", 28.085, "metalloid"],
    [15, "P", "Phosphorus", 30.974, "nonmetal"],
    [16, "S", "Sulfur", 32.06, "nonmetal"],
    [17, "Cl", "Chlorine", 35.45, "halogen"],
    [18, "Ar", "Argon", 39.95, "noble-gas"],
    [19, "K", "Potassium", 39.098, "alkali"],
    [20, "Ca", "Calcium", 40.078, "alkaline-earth"],
    [21, "Sc", "Scandium", 44.956, "transition"],
    [22, "Ti", "Titanium", 47.867, "transition"],
    [23, "V", "Vanadium", 50.942, "transition"],
    [24, "Cr", "Chromium", 51.996, "transition"],
    [25, "Mn", "Manganese", 54.938, "transition"],
    [26, "Fe", "Iron", 55.845, "transition"],
    [27, "Co", "Cobalt", 58.933, "transition"],
    [28, "Ni", "Nickel", 58.693, "transition"],
    [29, "Cu", "Copper", 63.546, "transition"],
    [30, "Zn", "Zinc", 65.38, "transition"],
    [31, "Ga", "Gallium", 69.723, "post-transition"],
    [32, "Ge", "Germanium", 72.63, "metalloid"],
    [33, "As", "Arsenic", 74.922, "metalloid"],
    [34, "Se", "Selenium", 78.971, "nonmetal"],
    [35, "Br", "Bromine", 79.904, "halogen"],
    [36, "Kr", "Krypton", 83.798, "noble-gas"],
    [37, "Rb", "Rubidium", 85.468, "alkali"],
    [38, "Sr", "Strontium", 87.62, "alkaline-earth"],
    [39, "Y", "Yttrium", 88.906, "transition"],
    [40, "Zr", "Zirconium", 91.224, "transition"],
    [41, "Nb", "Niobium", 92.906, "transition"],
    [42, "Mo", "Molybdenum", 95.95, "transition"],
    [43, "Tc", "Technetium", 98, "transition"],
    [44, "Ru", "Ruthenium", 101.07, "transition"],
    [45, "Rh", "Rhodium", 102.91, "transition"],
    [46, "Pd", "Palladium", 106.42, "transition"],
    [47, "Ag", "Silver", 107.87, "transition"],
    [48, "Cd", "Cadmium", 112.41, "transition"],
    [49, "In", "Indium", 114.82, "post-transition"],
    [50, "Sn", "Tin", 118.71, "post-transition"],
    [51, "Sb", "Antimony", 121.76, "metalloid"],
    [52, "Te", "Tellurium", 127.6, "metalloid"],
    [53, "I", "Iodine", 126.9, "halogen"],
    [54, "Xe", "Xenon", 131.29, "noble-gas"],
    [55, "Cs", "Caesium", 132.91, "alkali"],
    [56, "Ba", "Barium", 137.33, "alkaline-earth"],
    [57, "La", "Lanthanum", 138.91, "lanthanide"],
    [58, "Ce", "Cerium", 140.12, "lanthanide"],
    [59, "Pr", "Praseodymium", 140.91, "lanthanide"],
    [60, "Nd", "Neodymium", 144.24, "lanthanide"],
    [61, "Pm", "Promethium", 145, "lanthanide"],
    [62, "Sm", "Samarium", 150.36, "lanthanide"],
    [63, "Eu", "Europium", 151.96, "lanthanide"],
    [64, "Gd", "Gadolinium", 157.25, "lanthanide"],
    [65, "Tb", "Terbium", 158.93, "lanthanide"],
    [66, "Dy", "Dysprosium", 162.5, "lanthanide"],
    [67, "Ho", "Holmium", 164.93, "lanthanide"],
    [68, "Er", "Erbium", 167.26, "lanthanide"],
    [69, "Tm", "Thulium", 168.93, "lanthanide"],
    [70, "Yb", "Ytterbium", 173.05, "lanthanide"],
    [71, "Lu", "Lutetium", 174.97, "lanthanide"],
    [72, "Hf", "Hafnium", 178.49, "transition"],
    [73, "Ta", "Tantalum", 180.95, "transition"],
    [74, "W", "Tungsten", 183.84, "transition"],
    [75, "Re", "Rhenium", 186.21, "transition"],
    [76, "Os", "Osmium", 190.23, "transition"],
    [77, "Ir", "Iridium", 192.22, "transition"],
    [78, "Pt", "Platinum", 195.08, "transition"],
    [79, "Au", "Gold", 196.97, "transition"],
    [80, "Hg", "Mercury", 200.59, "transition"],
    [81, "Tl", "Thallium", 204.38, "post-transition"],
    [82, "Pb", "Lead", 207.2, "post-transition"],
    [83, "Bi", "Bismuth", 208.98, "post-transition"],
    [84, "Po", "Polonium", 209, "post-transition"],
    [85, "At", "Astatine", 210, "halogen"],
    [86, "Rn", "Radon", 222, "noble-gas"],
    [87, "Fr", "Francium", 223, "alkali"],
    [88, "Ra", "Radium", 226, "alkaline-earth"],
    [89, "Ac", "Actinium", 227, "actinide"],
    [90, "Th", "Thorium", 232.04, "actinide"],
    [91, "Pa", "Protactinium", 231.04, "actinide"],
    [92, "U", "Uranium", 238.03, "actinide"],
    [93, "Np", "Neptunium", 237, "actinide"],
    [94, "Pu", "Plutonium", 244, "actinide"],
    [95, "Am", "Americium", 243, "actinide"],
    [96, "Cm", "Curium", 247, "actinide"],
    [97, "Bk", "Berkelium", 247, "actinide"],
    [98, "Cf", "Californium", 251, "actinide"],
    [99, "Es", "Einsteinium", 252, "actinide"],
    [100, "Fm", "Fermium", 257, "actinide"],
    [101, "Md", "Mendelevium", 258, "actinide"],
    [102, "No", "Nobelium", 259, "actinide"],
    [103, "Lr", "Lawrencium", 266, "actinide"],
    [104, "Rf", "Rutherfordium", 267, "transition"],
    [105, "Db", "Dubnium", 268, "transition"],
    [106, "Sg", "Seaborgium", 269, "transition"],
    [107, "Bh", "Bohrium", 270, "transition"],
    [108, "Hs", "Hassium", 269, "transition"],
    [109, "Mt", "Meitnerium", 278, "transition"],
    [110, "Ds", "Darmstadtium", 281, "transition"],
    [111, "Rg", "Roentgenium", 282, "transition"],
    [112, "Cn", "Copernicium", 285, "transition"],
    [113, "Nh", "Nihonium", 286, "post-transition"],
    [114, "Fl", "Flerovium", 289, "post-transition"],
    [115, "Mc", "Moscovium", 290, "post-transition"],
    [116, "Lv", "Livermorium", 293, "post-transition"],
    [117, "Ts", "Tennessine", 294, "halogen"],
    [118, "Og", "Oganesson", 294, "noble-gas"],
]

const CATEGORIES = new Set([
    "nonmetal", "noble-gas", "alkali", "alkaline-earth", "metalloid", "halogen",
    "transition", "post-transition", "lanthanide", "actinide",
])

/** No stable isotope: the mass column is a mass number, printed in brackets. */
const UNSTABLE_MASS = new Set([
    43, 61, 84, 85, 86, 87, 88, 89, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103,
    104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118,
])

/** Elements 104+ have been made a few atoms at a time; their chemistry is inferred. */
const PREDICTED_FROM = 104

/**
 * Also accepted when typing a name: the Latin roots the symbols actually come
 * from (Fe/Ferrum, Au/Aurum ...) and the spellings that differ between English
 * variants. Somebody who answers "Natrium" for Na knows the element.
 */
const ALIASES = {
    Na: ["Natrium"],
    K: ["Kalium"],
    Fe: ["Ferrum"],
    Cu: ["Cuprum"],
    Ag: ["Argentum"],
    Sn: ["Stannum"],
    Sb: ["Stibium"],
    W: ["Wolfram", "Wolframium"],
    Au: ["Aurum"],
    Hg: ["Hydrargyrum"],
    Pb: ["Plumbum"],
    Al: ["Aluminum"],
    S: ["Sulphur"],
    Cs: ["Cesium"],
    Si: ["Silicium"],
    P: ["Phosphor"],
}

/**
 * How early an element is allowed into a fresh rotation. Same 0-3 scale the
 * flags use, and read the same way by the picker: 0 is an element anyone has
 * met, 3 is one only a chemist has. Anything not listed is 3.
 */
const DIFFICULTY = {
    0: ["H", "He", "C", "N", "O", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "K", "Ca",
        "Fe", "Cu", "Zn", "Ag", "Sn", "I", "Au", "Hg", "Pb", "Ne", "Li", "U"],
    1: ["B", "F", "Ar", "Ti", "Cr", "Mn", "Co", "Ni", "As", "Se", "Br", "Kr", "Sr",
        "Zr", "Xe", "Ba", "W", "Pt", "Bi", "Rn", "Ra", "Th", "Pu"],
    2: ["Sc", "V", "Ga", "Ge", "Rb", "Y", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Cd",
        "In", "Sb", "Te", "Cs", "La", "Ce", "Nd", "Sm", "Eu", "Gd", "Hf", "Ta", "Re",
        "Os", "Ir", "Tl", "Po", "At", "Fr", "Ac", "Pa", "Np", "Am", "Cm"],
}

/**
 * One line on where each element actually turns up, unlocked along with the
 * element itself. It lives here rather than in the page because it is a fact
 * about the element, and this script owns those.
 */
const USES = {
    H: "Making ammonia for fertiliser and refining fuels; also the lightest rocket fuel.",
    He: "Cooling the superconducting magnets inside MRI scanners, and lifting balloons.",
    Li: "The rechargeable batteries in phones, laptops and electric cars.",
    Be: "Stiff, feather-light alloys for aerospace parts, and X-ray windows.",
    B: "Heat-proof borosilicate glass (Pyrex), fibreglass and detergents.",
    C: "The backbone of steel, plastics, fuels and every living thing.",
    N: "Fertiliser, and the inert gas that keeps packaged food from going stale.",
    O: "Breathing, steelmaking and rocket oxidiser.",
    F: "Toothpaste, non-stick Teflon coatings and refrigerants.",
    Ne: "The orange-red glow of neon signs, and some lasers.",
    Na: "Table salt, glass making and the yellow of old street lamps.",
    Mg: "Light alloys for cars and laptops, and the flare of fireworks.",
    Al: "Cans, foil, window frames and aircraft bodies.",
    Si: "Computer chips and solar cells - and, as sand, glass and concrete.",
    P: "Fertiliser, matches and detergents.",
    S: "Sulfuric acid, the most produced industrial chemical, and vulcanised rubber.",
    Cl: "Disinfecting drinking water, PVC plastic and bleach.",
    Ar: "Shielding welds from the air, and filling insulated windows.",
    K: "Fertiliser - and in the body, every nerve signal.",
    Ca: "Cement and concrete, plus bones and teeth.",
    Sc: "Light, strong alloys in bicycle frames and aerospace parts.",
    Ti: "Jet engines, medical implants and the white pigment in paint.",
    V: "Tough steel for tools and springs, and grid-scale flow batteries.",
    Cr: "Stainless steel and chrome plating.",
    Mn: "Hardening steel, and the cathode of alkaline batteries.",
    Fe: "Steel for buildings, cars and tools - and the haemoglobin in blood.",
    Co: "Battery cathodes, cutting-tool alloys and deep blue pigment.",
    Ni: "Stainless steel, coins and rechargeable batteries.",
    Cu: "Electrical wiring, plumbing and motor windings.",
    Zn: "Galvanising steel against rust, plus brass and sunscreen.",
    Ga: "LEDs, and the high-speed chips in phone radios.",
    Ge: "Fibre-optic cables and the infrared lenses in night vision.",
    As: "Doping semiconductors - and once the classic poison.",
    Se: "Photocopier drums, decolouring glass, and a trace nutrient.",
    Br: "Flame retardants and photographic film.",
    Kr: "High-performance lighting and some lasers.",
    Rb: "Atomic clocks and research lasers.",
    Sr: "The red in fireworks, and ferrite magnets.",
    Y: "The phosphors in LEDs and screens, plus tough ceramics.",
    Zr: "Cladding for nuclear fuel rods, and ceramic knife blades.",
    Nb: "Superconducting MRI magnets and high-strength pipeline steel.",
    Mo: "High-strength steel for engines, drill bits and armour.",
    Tc: "Hospital scans - the most used radioactive tracer in medical imaging.",
    Ru: "Wear-resistant electrical contacts and chemical catalysts.",
    Rh: "Catalytic converters, and the most reflective mirrors made.",
    Pd: "Catalytic converters, electronics, and storing hydrogen.",
    Ag: "Electrical contacts, solar cells, jewellery and antibacterial coatings.",
    Cd: "NiCd rechargeable batteries and pigments, both now largely phased out.",
    In: "Touchscreens - indium tin oxide is the transparent conductor.",
    Sn: "Solder in electronics, and the tin plating inside food cans.",
    Sb: "Flame retardants, and the lead alloy in car batteries.",
    Te: "Thin-film solar panels, and steel that machines more easily.",
    I: "Disinfectants, iodised salt and thyroid medicine.",
    Xe: "Car headlights, spacecraft ion thrusters and anaesthesia.",
    Cs: "The atomic clocks that define the second, and oil drilling fluids.",
    Ba: "The barium meal that makes the gut show up on an X-ray.",
    La: "Camera lenses, hybrid-car batteries and refinery catalysts.",
    Ce: "Polishing glass, catalytic converters and lighter flints.",
    Pr: "Strong magnets, and the yellow glass of welding goggles.",
    Nd: "The strongest everyday magnets: headphones, hard drives, wind turbines.",
    Pm: "Luminous paint and tiny long-life nuclear batteries.",
    Sm: "Magnets that keep working when hot, for aerospace and motors.",
    Eu: "Red and blue phosphors in screens, and the security ink in euro notes.",
    Gd: "MRI contrast agents, and neutron shielding in reactors.",
    Tb: "Green phosphors in displays, and sensors that flex in a magnetic field.",
    Dy: "Keeping electric-car motor magnets working at high temperatures.",
    Ho: "The strongest laboratory magnets, and surgical lasers.",
    Er: "The amplifiers that keep signals alive in fibre-optic internet cables.",
    Tm: "Portable X-ray sources and surgical lasers.",
    Yb: "Fibre lasers that cut metal, and next-generation atomic clocks.",
    Lu: "The detectors in PET scanners, and petroleum cracking catalysts.",
    Hf: "Nuclear control rods, and the insulating layer in modern transistors.",
    Ta: "The capacitors in phones, and corrosion-proof surgical implants.",
    W: "Drill bits, filaments and armour - the highest melting point of any metal.",
    Re: "Turbine blades in jet engines, and refinery catalysts.",
    Os: "Hard-wearing tips: fountain pen nibs and electrical contacts.",
    Ir: "Spark plugs and crucibles; its layer in the rock marks the dinosaur extinction.",
    Pt: "Catalytic converters, laboratory ware and jewellery.",
    Au: "Jewellery, central bank reserves, and contacts that never corrode.",
    Hg: "Fluorescent lamps, and the thermometers and switches of the past.",
    Tl: "Infrared detectors - and, historically, an untraceable poison.",
    Pb: "Car batteries and radiation shielding; once pipes, paint and petrol.",
    Bi: "Stomach medicine, and a non-toxic stand-in for lead.",
    Po: "Heat sources for space probes, and anti-static brushes.",
    At: "Nothing practical - a few atoms at a time, studied for cancer therapy.",
    Rn: "No use at all; monitored as the radioactive gas that seeps into basements.",
    Fr: "Pure research - too rare and too short-lived for anything else.",
    Ra: "Once the glow in watch dials, now only certain cancer treatments.",
    Ac: "A neutron source, and targeted alpha therapy against cancer.",
    Th: "Experimental reactor fuel, and the mantles of old gas lanterns.",
    Pa: "Research only, though it dates layers of sediment on the sea floor.",
    U: "Nuclear reactor fuel - and, enriched, weapons.",
    Np: "Neutron detectors; mostly it is a by-product of reactors.",
    Pu: "Nuclear weapons, and the power source of deep-space probes.",
    Am: "Smoke detectors - a speck of it sits inside most of them.",
    Cm: "Power and X-ray sources on space probes.",
    Bk: "Research only: mainly a target for making even heavier elements.",
    Cf: "Starting up reactors, and scanning cargo for explosives.",
    Es: "Research only; made in amounts too small to see.",
    Fm: "Research only; never yet produced in weighable quantities.",
    Md: "Research only; studied a few atoms at a time.",
    No: "Research only; it survives for minutes at best.",
    Lr: "Research only; only a handful of atoms have ever been made.",
    Rf: "No use outside the lab; named after Ernest Rutherford.",
    Db: "No use outside the lab; named after Dubna, the Russian lab behind it.",
    Sg: "No use outside the lab; named after Glenn Seaborg, finder of ten elements.",
    Bh: "No use outside the lab; named after Niels Bohr.",
    Hs: "No use outside the lab; named after Hesse, the German state of its lab.",
    Mt: "No use outside the lab; named after Lise Meitner, who explained fission.",
    Ds: "No use outside the lab; named after Darmstadt, where it was first made.",
    Rg: "No use outside the lab; named after Wilhelm Roentgen, of X-ray fame.",
    Cn: "No use outside the lab; named after Copernicus.",
    Nh: "No use outside the lab; the first element discovered in Japan.",
    Fl: "No use outside the lab; named after the Flerov laboratory in Russia.",
    Mc: "No use outside the lab; named after Moscow.",
    Lv: "No use outside the lab; named after the Lawrence Livermore laboratory.",
    Ts: "No use outside the lab; named after Tennessee, source of its target.",
    Og: "No use outside the lab; the heaviest element ever made, named after Yuri Oganessian.",
}

/**
 * Slovak names, switched on from the console (`window.scienceLang.sk()`).
 * They are shown next to the English ones rather than instead of them, and
 * both are accepted as answers while the switch is on.
 */
const SLOVAK = {
    H: "Vodík",
    He: "Hélium",
    Li: "Lítium",
    Be: "Berýlium",
    B: "Bór",
    C: "Uhlík",
    N: "Dusík",
    O: "Kyslík",
    F: "Fluór",
    Ne: "Neón",
    Na: "Sodík",
    Mg: "Horčík",
    Al: "Hliník",
    Si: "Kremík",
    P: "Fosfor",
    S: "Síra",
    Cl: "Chlór",
    Ar: "Argón",
    K: "Draslík",
    Ca: "Vápnik",
    Sc: "Skandium",
    Ti: "Titán",
    V: "Vanád",
    Cr: "Chróm",
    Mn: "Mangán",
    Fe: "Železo",
    Co: "Kobalt",
    Ni: "Nikel",
    Cu: "Meď",
    Zn: "Zinok",
    Ga: "Gálium",
    Ge: "Germánium",
    As: "Arzén",
    Se: "Selén",
    Br: "Bróm",
    Kr: "Kryptón",
    Rb: "Rubídium",
    Sr: "Stroncium",
    Y: "Ytrium",
    Zr: "Zirkónium",
    Nb: "Niób",
    Mo: "Molybdén",
    Tc: "Technécium",
    Ru: "Ruténium",
    Rh: "Ródium",
    Pd: "Paládium",
    Ag: "Striebro",
    Cd: "Kadmium",
    In: "Indium",
    Sn: "Cín",
    Sb: "Antimón",
    Te: "Telúr",
    I: "Jód",
    Xe: "Xenón",
    Cs: "Cézium",
    Ba: "Bárium",
    La: "Lantán",
    Ce: "Cér",
    Pr: "Prazeodým",
    Nd: "Neodým",
    Pm: "Prométium",
    Sm: "Samárium",
    Eu: "Európium",
    Gd: "Gadolínium",
    Tb: "Terbium",
    Dy: "Dysprózium",
    Ho: "Holmium",
    Er: "Erbium",
    Tm: "Túlium",
    Yb: "Yterbium",
    Lu: "Lutécium",
    Hf: "Hafnium",
    Ta: "Tantal",
    W: "Volfrám",
    Re: "Rénium",
    Os: "Osmium",
    Ir: "Irídium",
    Pt: "Platina",
    Au: "Zlato",
    Hg: "Ortuť",
    Tl: "Tálium",
    Pb: "Olovo",
    Bi: "Bizmut",
    Po: "Polónium",
    At: "Astát",
    Rn: "Radón",
    Fr: "Francium",
    Ra: "Rádium",
    Ac: "Aktínium",
    Th: "Tórium",
    Pa: "Protaktínium",
    U: "Urán",
    Np: "Neptúnium",
    Pu: "Plutónium",
    Am: "Amerícium",
    Cm: "Curium",
    Bk: "Berkélium",
    Cf: "Kalifornium",
    Es: "Einsteinium",
    Fm: "Fermium",
    Md: "Mendelevium",
    No: "Nobelium",
    Lr: "Lawrencium",
    Rf: "Rutherfordium",
    Db: "Dubnium",
    Sg: "Seaborgium",
    Bh: "Bohrium",
    Hs: "Hassium",
    Mt: "Meitnerium",
    Ds: "Darmstadtium",
    Rg: "Roentgenium",
    Cn: "Kopernícium",
    Nh: "Nihónium",
    Fl: "Flerovium",
    Mc: "Moskovium",
    Lv: "Livermórium",
    Ts: "Tennessín",
    Og: "Oganesón",
}

function difficultyOf(symbol) {
    for (const level of [0, 1, 2]) {
        if (DIFFICULTY[level].includes(symbol)) return level
    }
    return 3
}

/**
 * Where an element sits on the printed table. `xpos`/`ypos` are 1-based cells of
 * an 18x10 grid: rows 1-7 are the periods, rows 9 and 10 the two f-block strips
 * pulled out below (row 8 is the gap that separates them). The f-block carries no
 * group number, so `group` is null there.
 */
function layout(z) {
    if (z === 1) return { period: 1, xpos: 1, ypos: 1 }
    if (z === 2) return { period: 1, xpos: 18, ypos: 1 }
    if (z <= 10) return { period: 2, xpos: z <= 4 ? z - 2 : z + 8, ypos: 2 }
    if (z <= 18) return { period: 3, xpos: z <= 12 ? z - 10 : z, ypos: 3 }
    if (z <= 36) return { period: 4, xpos: z - 18, ypos: 4 }
    if (z <= 54) return { period: 5, xpos: z - 36, ypos: 5 }
    if (z <= 56) return { period: 6, xpos: z - 54, ypos: 6 }
    if (z <= 71) return { period: 6, xpos: z - 54, ypos: 9, fBlock: true }
    if (z <= 86) return { period: 6, xpos: z - 68, ypos: 6 }
    if (z <= 88) return { period: 7, xpos: z - 86, ypos: 7 }
    if (z <= 103) return { period: 7, xpos: z - 86, ypos: 10, fBlock: true }
    return { period: 7, xpos: z - 100, ypos: 7 }
}

const rows = ELEMENTS.map(([number, symbol, name, mass, category]) => {
    const { period, xpos, ypos, fBlock } = layout(number)
    return {
        number,
        symbol,
        name,
        names: [name, ...(ALIASES[symbol] || [])],
        sk: SLOVAK[symbol],
        category,
        period,
        group: fBlock ? null : xpos,
        xpos,
        ypos,
        mass,
        use: USES[symbol],
        stableMass: !UNSTABLE_MASS.has(number),
        predicted: number >= PREDICTED_FROM,
        difficulty: difficultyOf(symbol),
    }
})

// --- checks: a wrong periodic table teaches wrong chemistry, so refuse to write one ---
const problems = []

if (rows.length !== 118) problems.push(`expected 118 elements, got ${rows.length}`)

rows.forEach((r, i) => {
    if (r.number !== i + 1) problems.push(`element at index ${i} has number ${r.number}`)
    if (!CATEGORIES.has(r.category)) problems.push(`${r.symbol}: unknown category ${r.category}`)
    if (!(r.mass > 0)) problems.push(`${r.symbol}: bad mass ${r.mass}`)
    if (!/^[A-Z][a-z]?$/.test(r.symbol)) problems.push(`${r.symbol}: not a valid symbol`)
    // The note shows as one line in the UI, so an essay would simply be cut off.
    if (!r.sk) problems.push(`${r.symbol}: no Slovak name`)
    if (!r.use) problems.push(`${r.symbol}: no use line`)
    else if (r.use.length > 96) problems.push(`${r.symbol}: use line is ${r.use.length} chars, over 96`)
})

for (const key of ["symbol", "name"]) {
    const seen = new Set()
    for (const r of rows) {
        if (seen.has(r[key])) problems.push(`duplicate ${key} ${r[key]}`)
        seen.add(r[key])
    }
}

const cells = new Map()
for (const r of rows) {
    const cell = `${r.xpos},${r.ypos}`
    if (cells.has(cell)) problems.push(`${r.symbol} collides with ${cells.get(cell)} at ${cell}`)
    cells.set(cell, r.symbol)
    if (r.xpos < 1 || r.xpos > 18) problems.push(`${r.symbol}: xpos ${r.xpos} off the grid`)
    if (r.ypos < 1 || r.ypos > 10 || r.ypos === 8) problems.push(`${r.symbol}: ypos ${r.ypos} off the grid`)
}

// Typed answers have to stay distinguishable: a word that answers for two
// elements would make one of them unanswerable.
const fold = n => n.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim()
const answerSpace = new Map()
for (const r of rows) {
    for (const n of [...r.names, r.sk]) {
        const key = fold(n)
        const owner = answerSpace.get(key)
        if (owner && owner !== r.symbol) problems.push(`"${n}" answers for both ${owner} and ${r.symbol}`)
        answerSpace.set(key, r.symbol)
    }
}

const fBlockCount = rows.filter(r => r.group === null).length
if (fBlockCount !== 30) problems.push(`expected 30 f-block elements, got ${fBlockCount}`)

if (problems.length) {
    console.error("Refusing to write data/elements.json:")
    for (const p of problems) console.error("  - " + p)
    process.exit(1)
}

const json = "[\n" + rows.map(r => "  " + JSON.stringify(r)).join(",\n") + "\n]\n"
writeFileSync(OUT, json)

const byCategory = {}
for (const r of rows) byCategory[r.category] = (byCategory[r.category] || 0) + 1
console.log(`Wrote ${rows.length} elements to data/elements.json`)
console.log("  categories:", Object.entries(byCategory).map(([k, v]) => `${k} ${v}`).join(", "))
console.log("  difficulty:", [0, 1, 2, 3].map(d => `${d}: ${rows.filter(r => r.difficulty === d).length}`).join(", "))
