import { Atom, Calculator, type LucideIcon } from "lucide-react"
import { freshProgress, mergeProgress, type SrProgressMap } from "./spacedRepetition"

/**
 * Basic formulas, physics and maths, on the Science wing's spaced repetition.
 *
 * The player writes the right-hand side and it is judged by **value**, not by
 * spelling: the answer and the reference are both evaluated at a handful of
 * sample points, and they have to agree at all of them. So `m*v^2/2`, `½mv²`
 * and `0.5·m·v²` are all kinetic energy, and nobody has to guess which of the
 * equivalent ways of writing it the game had in mind.
 *
 * That makes one thing too easy - writing `(a+b)²` back as the answer to
 * `(a+b)² = ?` - which is what `shape` is for.
 */

export type FormulaSubject = "physics" | "math"

export type Formula = {
    id: string
    subject: FormulaSubject
    name: string
    sk: string
    /** Left-hand side as printed. `_` starts a subscript. */
    lhs: string
    /** Right-hand side as printed, for the reveal. */
    rhs: string
    /** The same right-hand side in the syntax the parser reads - the reference answer. */
    expr: string
    /** Every symbol on the right-hand side, with its meaning in English and Slovak. */
    vars: Record<string, [string, string]>
    /** One line on where it turns up in real life - the reward for learning it. */
    use: string
    /** The same line in Slovak, shown beneath it while the language switch is on. */
    useSk: string
    /**
     * `expanded`: no power or product of a bracketed sum - for the identities
     * whose left side, typed back, would be numerically right.
     * `factored`: the answer must be a product - the same trap in reverse.
     */
    shape?: "expanded" | "factored"
    difficulty: number
}

const V = {
    m: ["mass", "hmotnosť"],
    v: ["velocity", "rýchlosť"],
    s: ["distance", "dráha"],
    t: ["time", "čas"],
    a: ["acceleration", "zrýchlenie"],
    F: ["force", "sila"],
    g: ["gravitational acceleration", "tiažové zrýchlenie"],
    h: ["height / depth", "výška / hĺbka"],
    V: ["volume", "objem"],
    S: ["area", "obsah plochy"],
    W: ["work", "práca"],
    ρ: ["density", "hustota"],
    U: ["voltage", "napätie"],
    R: ["resistance", "odpor"],
    I: ["current", "prúd"],
} satisfies Record<string, [string, string]>

const FORMULA_DATA: Formula[] = [
    // --- physics: the first thirteen are the starting set ---
    { id: "velocity", subject: "physics", name: "Velocity", sk: "rýchlosť", lhs: "v", rhs: "s / t", expr: "s/t", vars: { s: V.s, t: V.t }, use: "Journey times, and section speed cameras that average over a stretch of road.", useSk: "Čas cesty a úsekové meranie rýchlosti na diaľnici.", difficulty: 0 },
    { id: "newton2", subject: "physics", name: "Newton's second law", sk: "2. Newtonov zákon", lhs: "F", rhs: "m·a", expr: "m*a", vars: { m: V.m, a: V.a }, use: "The basis of all mechanics - from car safety to launching rockets.", useSk: "Základ celej mechaniky - od bezpečnosti áut po štarty rakiet.", difficulty: 0 },
    { id: "weight", subject: "physics", name: "Gravitational force (weight)", sk: "tiažová sila", lhs: "F_G", rhs: "m·g", expr: "m*g", vars: { m: V.m, g: V.g }, use: "What a bathroom scale really measures, and the load on floors and bridges.", useSk: "Čo naozaj meria osobná váha, aj zaťaženie podláh a mostov.", difficulty: 0 },
    { id: "density", subject: "physics", name: "Density", sk: "hustota", lhs: "ρ", rhs: "m / V", expr: "m/V", vars: { m: V.m, V: V.V }, use: "Checking whether a ring is real gold, or whether something will float.", useSk: "Overenie, či je prsteň zo zlata, alebo či niečo bude plávať.", difficulty: 0 },
    { id: "pressure", subject: "physics", name: "Pressure", sk: "tlak", lhs: "p", rhs: "F / S", expr: "F/S", vars: { F: V.F, S: V.S }, use: "Snowshoes spread a force out, a needle concentrates it.", useSk: "Snežnice silu rozložia, ihla ju sústredí.", difficulty: 0 },
    { id: "work", subject: "physics", name: "Work", sk: "práca", lhs: "W", rhs: "F·s", expr: "F*s", vars: { F: V.F, s: V.s }, use: "Energy spent lifting, pulling or pushing something along a path.", useSk: "Energia vynaložená na zdvíhanie, ťahanie či tlačenie po dráhe.", difficulty: 0 },
    { id: "power", subject: "physics", name: "Power", sk: "výkon", lhs: "P", rhs: "W / t", expr: "W/t", vars: { W: V.W, t: V.t }, use: "Comparing engines and appliances - how fast they get work done.", useSk: "Porovnanie motorov a spotrebičov - ako rýchlo vykonajú prácu.", difficulty: 0 },
    { id: "kinetic", subject: "physics", name: "Kinetic energy", sk: "kinetická energia", lhs: "E_k", rhs: "½·m·v²", expr: "1/2*m*v^2", vars: { m: V.m, v: V.v }, use: "Why speed matters so much in a crash - twice the speed, four times the energy.", useSk: "Prečo pri nehode tak záleží na rýchlosti - dvojnásobná rýchlosť, štvornásobná energia.", difficulty: 1 },
    { id: "potential", subject: "physics", name: "Potential energy (gravitational)", sk: "potenciálna tiažová energia", lhs: "E_p", rhs: "m·g·h", expr: "m*g*h", vars: { m: V.m, g: V.g, h: ["height", "výška"] }, use: "Hydroelectric dams, roller coasters - anything raised up that can come down.", useSk: "Vodné elektrárne, horské dráhy - čokoľvek zdvihnuté, čo môže spadnúť.", difficulty: 1 },
    { id: "ohm", subject: "physics", name: "Ohm's law", sk: "Ohmov zákon", lhs: "I", rhs: "U / R", expr: "U/R", vars: { U: V.U, R: V.R }, use: "Designing any circuit - choosing the resistor so an LED doesn't burn out.", useSk: "Návrh každého obvodu - voľba rezistora, aby LEDka nezhorela.", difficulty: 0 },
    { id: "electric-power", subject: "physics", name: "Electric power", sk: "elektrický výkon", lhs: "P", rhs: "U·I", expr: "U*I", vars: { U: V.U, I: V.I }, use: "The wattage on a label, and the fuse an appliance needs.", useSk: "Príkon na štítku spotrebiča a to, akú poistku potrebuje.", difficulty: 1 },
    { id: "momentum", subject: "physics", name: "Momentum", sk: "hybnosť", lhs: "p", rhs: "m·v", expr: "m*v", vars: { m: V.m, v: V.v }, use: "Crash investigations and sport - what carries on after a collision.", useSk: "Vyšetrovanie nehôd a šport - čo sa zachová po zrážke.", difficulty: 1 },
    { id: "wave", subject: "physics", name: "Wave speed", sk: "rýchlosť vlnenia", lhs: "v", rhs: "λ·f", expr: "λ*f", vars: { λ: ["wavelength", "vlnová dĺžka"], f: ["frequency", "frekvencia"] }, use: "Tuning a radio, notes in music, the colour of light - any wave at all.", useSk: "Ladenie rádia, tóny v hudbe, farba svetla - akékoľvek vlnenie.", difficulty: 1 },
    { id: "frequency", subject: "physics", name: "Frequency", sk: "frekvencia", lhs: "f", rhs: "1 / T", expr: "1/T", vars: { T: ["period", "perióda"] }, use: "Converting between how often and how long - clocks, processors, the mains.", useSk: "Prevod medzi „ako často“ a „ako dlho“ - hodiny, procesory, elektrická sieť.", difficulty: 1 },
    { id: "uniform-acc", subject: "physics", name: "Velocity under constant acceleration", sk: "rýchlosť rovnomerne zrýchleného pohybu", lhs: "v", rhs: "v₀ + a·t", expr: "v_0+a*t", vars: { v_0: ["initial velocity", "počiatočná rýchlosť"], a: V.a, t: V.t }, use: "How fast a falling or accelerating object is going after a given time.", useSk: "Akú rýchlosť má padajúce či zrýchľujúce teleso po určitom čase.", difficulty: 1 },
    { id: "acc-distance", subject: "physics", name: "Distance from rest under constant acceleration", sk: "dráha rovnomerne zrýchleného pohybu", lhs: "s", rhs: "½·a·t²", expr: "1/2*a*t^2", vars: { a: V.a, t: V.t }, use: "Free fall and braking distances - how far something travels while speeding up.", useSk: "Voľný pád a brzdná dráha - koľko teleso prejde, kým zrýchľuje.", difficulty: 1 },
    { id: "hydrostatic", subject: "physics", name: "Hydrostatic pressure", sk: "hydrostatický tlak", lhs: "p_h", rhs: "h·ρ·g", expr: "h*ρ*g", vars: { h: ["depth", "hĺbka"], ρ: ["density of the liquid", "hustota kvapaliny"], g: V.g }, use: "Why dams are thicker at the bottom, and why your ears hurt when diving.", useSk: "Prečo sú priehrady dole hrubšie a prečo pri potápaní bolia uši.", difficulty: 1 },
    { id: "buoyancy", subject: "physics", name: "Buoyant force (Archimedes)", sk: "vztlaková sila", lhs: "F_vz", rhs: "V·ρ·g", expr: "V*ρ*g", vars: { V: ["submerged volume", "objem ponorenej časti"], ρ: ["density of the liquid", "hustota kvapaliny"], g: V.g }, use: "Ships, submarines, hot-air balloons - everything that floats.", useSk: "Lode, ponorky, teplovzdušné balóny - všetko, čo pláva.", difficulty: 2 },
    { id: "heat", subject: "physics", name: "Heat", sk: "teplo", lhs: "Q", rhs: "m·c·Δt", expr: "m*c*Δt", vars: { m: V.m, c: ["specific heat capacity", "merná tepelná kapacita"], Δt: ["temperature change", "zmena teploty"] }, use: "How much energy it takes to heat water for a bath or a cup of tea.", useSk: "Koľko energie treba na ohriatie vody na kúpeľ či na čaj.", difficulty: 1 },
    { id: "charge", subject: "physics", name: "Electric charge", sk: "elektrický náboj", lhs: "Q", rhs: "I·t", expr: "I*t", vars: { I: V.I, t: V.t }, use: "Battery capacity - how long a phone lasts at a given current.", useSk: "Kapacita batérie - ako dlho vydrží mobil pri danom prúde.", difficulty: 1 },
    { id: "series", subject: "physics", name: "Resistors in series", sk: "sériové zapojenie rezistorov", lhs: "R", rhs: "R₁ + R₂", expr: "R_1+R_2", vars: { R_1: ["first resistance", "prvý odpor"], R_2: ["second resistance", "druhý odpor"] }, use: "Components in a chain, like old fairy lights where one dead bulb stops them all.", useSk: "Súčiastky za sebou, ako staré vianočné svetielka, kde jedna pokazená vypne všetky.", difficulty: 1 },
    { id: "parallel", subject: "physics", name: "Resistors in parallel", sk: "paralelné zapojenie rezistorov", lhs: "1/R", rhs: "1/R₁ + 1/R₂", expr: "1/R_1+1/R_2", vars: { R_1: ["first resistance", "prvý odpor"], R_2: ["second resistance", "druhý odpor"] }, use: "House wiring - every socket gets the full voltage on its own branch.", useSk: "Domové rozvody - každá zásuvka má na svojej vetve plné napätie.", difficulty: 2 },
    { id: "efficiency", subject: "physics", name: "Efficiency", sk: "účinnosť", lhs: "η", rhs: "P / P₀", expr: "P/P_0", vars: { P: ["useful power", "užitočný výkon"], P_0: ["input power", "príkon"] }, use: "Energy labels on appliances, engines, LEDs against old bulbs.", useSk: "Energetické štítky spotrebičov, motory, LED oproti starým žiarovkám.", difficulty: 2 },
    { id: "centripetal", subject: "physics", name: "Centripetal acceleration", sk: "dostredivé zrýchlenie", lhs: "a_d", rhs: "v² / r", expr: "v^2/r", vars: { v: V.v, r: ["radius", "polomer"] }, use: "Why cars skid in tight bends, and how satellites stay in orbit.", useSk: "Prečo autá v ostrej zákrute šmyknú a ako sa satelity udržia na obežnej dráhe.", difficulty: 2 },
    { id: "gravitation", subject: "physics", name: "Newton's law of gravitation", sk: "Newtonov gravitačný zákon", lhs: "F_g", rhs: "G·m₁·m₂ / r²", expr: "G*m_1*m_2/r^2", vars: { G: ["gravitational constant", "gravitačná konštanta"], m_1: ["first mass", "prvá hmotnosť"], m_2: ["second mass", "druhá hmotnosť"], r: ["distance", "vzdialenosť"] }, use: "The orbits of planets, moons and satellites, and the tides.", useSk: "Dráhy planét, mesiacov a satelitov, aj príliv a odliv.", difficulty: 2 },
    { id: "einstein", subject: "physics", name: "Mass-energy equivalence", sk: "ekvivalencia hmotnosti a energie", lhs: "E", rhs: "m·c²", expr: "m*c^2", vars: { m: V.m, c: ["speed of light", "rýchlosť svetla"] }, use: "Why the Sun shines and how nuclear power stations work.", useSk: "Prečo Slnko svieti a ako fungujú jadrové elektrárne.", difficulty: 1 },
    { id: "pendulum", subject: "physics", name: "Period of a pendulum", sk: "perióda kyvadla", lhs: "T", rhs: "2π·√(l / g)", expr: "2*π*sqrt(l/g)", vars: { l: ["length", "dĺžka"], g: V.g }, use: "Pendulum clocks - the period depends only on the length, not the swing.", useSk: "Kyvadlové hodiny - perióda závisí len od dĺžky, nie od rozkmitu.", difficulty: 3 },
    { id: "ideal-gas", subject: "physics", name: "Ideal gas law", sk: "stavová rovnica ideálneho plynu", lhs: "p·V", rhs: "n·R·T", expr: "n*R*T", vars: { n: ["amount of substance", "látkové množstvo"], R: ["gas constant", "plynová konštanta"], T: ["temperature", "teplota"] }, use: "Tyres, balloons, weather, engines - how a gas reacts to heat and squeezing.", useSk: "Pneumatiky, balóny, počasie, motory - ako plyn reaguje na teplo a stlačenie.", difficulty: 2 },

    // --- maths ---
    { id: "pythagoras", subject: "math", name: "Pythagorean theorem", sk: "Pytagorova veta", lhs: "c²", rhs: "a² + b²", expr: "a^2+b^2", vars: { a: ["leg", "odvesna"], b: ["leg", "odvesna"] }, use: "Checking a right angle on a building site, the diagonal of a screen or a room.", useSk: "Kontrola pravého uhla na stavbe, uhlopriečka obrazovky či izby.", difficulty: 0 },
    { id: "circle-area", subject: "math", name: "Area of a circle", sk: "obsah kruhu", lhs: "S", rhs: "π·r²", expr: "π*r^2", vars: { r: ["radius", "polomer"] }, use: "Pizza sizes, pipe cross-sections, round tables and flower beds.", useSk: "Veľkosť pizze, prierez rúr, okrúhle stoly a záhony.", difficulty: 0 },
    { id: "circumference", subject: "math", name: "Circumference of a circle", sk: "obvod kruhu", lhs: "o", rhs: "2·π·r", expr: "2*π*r", vars: { r: ["radius", "polomer"] }, use: "How far a wheel rolls in one turn, fencing a round flower bed.", useSk: "Koľko koleso prejde za jednu otáčku, oplotenie okrúhleho záhona.", difficulty: 0 },
    { id: "rectangle", subject: "math", name: "Area of a rectangle", sk: "obsah obdĺžnika", lhs: "S", rhs: "a·b", expr: "a*b", vars: { a: ["side", "strana"], b: ["side", "strana"] }, use: "Floors, walls to paint, plots of land - the most used area of all.", useSk: "Podlahy, steny na maľovanie, pozemky - najpoužívanejší obsah vôbec.", difficulty: 0 },
    { id: "triangle", subject: "math", name: "Area of a triangle", sk: "obsah trojuholníka", lhs: "S", rhs: "a·v_a / 2", expr: "a*v_a/2", vars: { a: ["side", "strana"], v_a: ["height onto side a", "výška na stranu a"] }, use: "Roofs and gables - and any polygon, since every one splits into triangles.", useSk: "Strechy a štíty - aj každý mnohouholník, lebo sa dá rozdeliť na trojuholníky.", difficulty: 0 },
    { id: "trapezoid", subject: "math", name: "Area of a trapezoid", sk: "obsah lichobežníka", lhs: "S", rhs: "(a + c)·v / 2", expr: "(a+c)*v/2", vars: { a: ["base", "základňa"], c: ["base", "základňa"], v: ["height", "výška"] }, use: "Cross-sections of ditches and embankments, sloping plots, sides of a roof.", useSk: "Prierezy priekop a násypov, šikmé pozemky, strany strechy.", difficulty: 1 },
    { id: "cube", subject: "math", name: "Volume of a cube", sk: "objem kocky", lhs: "V", rhs: "a³", expr: "a^3", vars: { a: ["edge", "hrana"] }, use: "Dice and boxes - and why doubling the edge makes eight times the volume.", useSk: "Kocky a krabice - a prečo dvojnásobná hrana znamená osemnásobný objem.", difficulty: 0 },
    { id: "cuboid", subject: "math", name: "Volume of a cuboid", sk: "objem kvádra", lhs: "V", rhs: "a·b·c", expr: "a*b*c", vars: { a: ["edge", "hrana"], b: ["edge", "hrana"], c: ["edge", "hrana"] }, use: "Rooms, aquariums, parcels, swimming pools.", useSk: "Izby, akváriá, balíky, bazény.", difficulty: 0 },
    { id: "cylinder", subject: "math", name: "Volume of a cylinder", sk: "objem valca", lhs: "V", rhs: "π·r²·v", expr: "π*r^2*v", vars: { r: ["radius", "polomer"], v: ["height", "výška"] }, use: "Cans, tanks, pipes, and the water in a well.", useSk: "Plechovky, nádrže, rúry a voda v studni.", difficulty: 1 },
    { id: "cone", subject: "math", name: "Volume of a cone", sk: "objem kužeľa", lhs: "V", rhs: "⅓·π·r²·v", expr: "1/3*π*r^2*v", vars: { r: ["radius", "polomer"], v: ["height", "výška"] }, use: "Ice-cream cones, funnels, piles of sand - a third of the matching cylinder.", useSk: "Kornútky, lieviky, kopy piesku - tretina zodpovedajúceho valca.", difficulty: 2 },
    { id: "sphere-volume", subject: "math", name: "Volume of a sphere", sk: "objem gule", lhs: "V", rhs: "4/3·π·r³", expr: "4/3*π*r^3", vars: { r: ["radius", "polomer"] }, use: "Balls, bubbles, drops and planets.", useSk: "Lopty, bubliny, kvapky a planéty.", difficulty: 1 },
    { id: "sphere-surface", subject: "math", name: "Surface area of a sphere", sk: "povrch gule", lhs: "S", rhs: "4·π·r²", expr: "4*π*r^2", vars: { r: ["radius", "polomer"] }, use: "How much leather covers a ball, how much paint a dome needs.", useSk: "Koľko kože pokryje loptu, koľko farby treba na kupolu.", difficulty: 2 },
    { id: "discriminant", subject: "math", name: "Discriminant of ax² + bx + c", sk: "diskriminant", lhs: "D", rhs: "b² − 4·a·c", expr: "b^2-4*a*c", vars: { a: ["coefficient of x²", "koeficient pri x²"], b: ["coefficient of x", "koeficient pri x"], c: ["constant term", "absolútny člen"] }, use: "How many solutions a quadratic has - before solving it.", useSk: "Koľko riešení má kvadratická rovnica - ešte pred jej riešením.", difficulty: 1 },
    { id: "square-sum", subject: "math", name: "Square of a sum", sk: "druhá mocnina súčtu", lhs: "(a + b)²", rhs: "a² + 2ab + b²", expr: "a^2+2*a*b+b^2", vars: { a: ["term", "člen"], b: ["term", "člen"] }, shape: "expanded", use: "Mental arithmetic (51² = 2500 + 100 + 1) and simplifying expressions.", useSk: "Počítanie spamäti (51² = 2500 + 100 + 1) a úprava výrazov.", difficulty: 0 },
    { id: "square-diff", subject: "math", name: "Square of a difference", sk: "druhá mocnina rozdielu", lhs: "(a − b)²", rhs: "a² − 2ab + b²", expr: "a^2-2*a*b+b^2", vars: { a: ["term", "člen"], b: ["term", "člen"] }, shape: "expanded", use: "Mental arithmetic (49² = 2500 − 100 + 1) and completing the square.", useSk: "Počítanie spamäti (49² = 2500 − 100 + 1) a doplnenie na štvorec.", difficulty: 1 },
    { id: "diff-squares", subject: "math", name: "Difference of squares", sk: "rozdiel druhých mocnín", lhs: "a² − b²", rhs: "(a + b)·(a − b)", expr: "(a+b)*(a-b)", vars: { a: ["term", "člen"], b: ["term", "člen"] }, shape: "factored", use: "Factorising, and quick products like 19 · 21 = 400 − 1.", useSk: "Rozklad na súčin a rýchle násobenie ako 19 · 21 = 400 − 1.", difficulty: 1 },
    { id: "cube-sum", subject: "math", name: "Cube of a sum", sk: "tretia mocnina súčtu", lhs: "(a + b)³", rhs: "a³ + 3a²b + 3ab² + b³", expr: "a^3+3*a^2*b+3*a*b^2+b^3", vars: { a: ["term", "člen"], b: ["term", "člen"] }, shape: "expanded", use: "Raising expressions to powers - the first step to the binomial theorem.", useSk: "Umocňovanie výrazov - prvý krok k binomickej vete.", difficulty: 3 },
    { id: "arith-term", subject: "math", name: "Arithmetic sequence - n-th term", sk: "aritmetická postupnosť - n-tý člen", lhs: "a_n", rhs: "a₁ + (n − 1)·d", expr: "a_1+(n-1)*d", vars: { a_1: ["first term", "prvý člen"], n: ["index", "poradie"], d: ["common difference", "diferencia"] }, use: "Savings that grow by the same amount, seats in rows, regular timetables.", useSk: "Úspory rastúce o rovnakú sumu, sedadlá v radoch, pravidelné rozvrhy.", difficulty: 1 },
    { id: "arith-sum", subject: "math", name: "Arithmetic sequence - sum", sk: "aritmetická postupnosť - súčet", lhs: "s_n", rhs: "n·(a₁ + a_n) / 2", expr: "n*(a_1+a_n)/2", vars: { n: ["number of terms", "počet členov"], a_1: ["first term", "prvý člen"], a_n: ["last term", "posledný člen"] }, use: "Adding 1 to 100 in seconds, the way Gauss did as a schoolboy.", useSk: "Súčet 1 až 100 za pár sekúnd, ako to urobil Gauss ešte ako školák.", difficulty: 2 },
    { id: "geom-term", subject: "math", name: "Geometric sequence - n-th term", sk: "geometrická postupnosť - n-tý člen", lhs: "a_n", rhs: "a₁·qⁿ⁻¹", expr: "a_1*q^(n-1)", vars: { a_1: ["first term", "prvý člen"], q: ["common ratio", "kvocient"], n: ["index", "poradie"] }, use: "Compound interest, population growth, radioactive decay.", useSk: "Zložené úročenie, rast populácie, rádioaktívny rozpad.", difficulty: 2 },
    { id: "vieta-sum", subject: "math", name: "Sum of the roots of ax² + bx + c", sk: "Vietov vzťah - súčet koreňov", lhs: "x₁ + x₂", rhs: "−b / a", expr: "-b/a", vars: { a: ["coefficient of x²", "koeficient pri x²"], b: ["coefficient of x", "koeficient pri x"] }, use: "Checking the roots of a quadratic without solving it - or guessing them.", useSk: "Kontrola koreňov kvadratickej rovnice bez riešenia - alebo ich uhádnutie.", difficulty: 2 },
    { id: "slope", subject: "math", name: "Slope of a line through two points", sk: "smernica priamky", lhs: "k", rhs: "(y₂ − y₁) / (x₂ − x₁)", expr: "(y_2-y_1)/(x_2-x_1)", vars: { x_1: ["first point x", "x prvého bodu"], y_1: ["first point y", "y prvého bodu"], x_2: ["second point x", "x druhého bodu"], y_2: ["second point y", "y druhého bodu"] }, use: "Road gradients, ramps, and the rate of change on any graph.", useSk: "Stúpanie ciest, rampy a rýchlosť zmeny v akomkoľvek grafe.", difficulty: 2 },
    { id: "distance", subject: "math", name: "Distance between two points", sk: "vzdialenosť dvoch bodov", lhs: "|AB|", rhs: "√((x₂ − x₁)² + (y₂ − y₁)²)", expr: "sqrt((x_2-x_1)^2+(y_2-y_1)^2)", vars: { x_1: ["A's x", "x bodu A"], y_1: ["A's y", "y bodu A"], x_2: ["B's x", "x bodu B"], y_2: ["B's y", "y bodu B"] }, use: "Maps, GPS and games - the straight-line distance between two points.", useSk: "Mapy, GPS a hry - priama vzdialenosť dvoch bodov.", difficulty: 2 },
    { id: "heron", subject: "math", name: "Heron's formula", sk: "Herónov vzorec", lhs: "S", rhs: "√(s·(s − a)·(s − b)·(s − c))", expr: "sqrt(s*(s-a)*(s-b)*(s-c))", vars: { s: ["half the perimeter", "polovica obvodu"], a: ["side", "strana"], b: ["side", "strana"], c: ["side", "strana"] }, use: "The area of a plot measured only along its three sides, no height needed.", useSk: "Obsah pozemku zmeraného len na troch stranách, bez výšky.", difficulty: 3 },
]

export const FORMULAS: Formula[] = FORMULA_DATA

// --- the two tabs ---

export type FormulaMode = {
    key: FormulaSubject
    label: string
    short: string
    detail: string
    icon: LucideIcon
    storageKey: string
}

/** Each subject is its own pool with its own progress, like a direction elsewhere in the wing. */
export const FORMULA_MODES: FormulaMode[] = [
    { key: "physics", label: "Physics formulas", short: "Physics", detail: "Write the right-hand side", icon: Atom, storageKey: "science-formulas-physics-v1" },
    { key: "math", label: "Maths formulas", short: "Math", detail: "Write the right-hand side", icon: Calculator, storageKey: "science-formulas-math-v1" },
]

export function formulaMode(key: FormulaSubject): FormulaMode {
    return FORMULA_MODES.find(m => m.key === key) ?? FORMULA_MODES[0]
}

export function formulasFor(subject: FormulaSubject): Formula[] {
    return FORMULAS.filter(f => f.subject === subject)
}

export const FORMULAS_LAST_MODE_KEY = "science-formulas-last-mode"

export type FormulaProgressByMode = Record<FormulaSubject, SrProgressMap>

export function readFormulaProgress(subject: FormulaSubject): SrProgressMap {
    const items = formulasFor(subject)
    try {
        const raw = localStorage.getItem(formulaMode(subject).storageKey)
        if (!raw) return freshProgress(items)
        return mergeProgress(JSON.parse(raw), items)
    } catch {
        return freshProgress(items)
    }
}

export function readAllFormulaProgress(): FormulaProgressByMode {
    return { physics: readFormulaProgress("physics"), math: readFormulaProgress("math") }
}

/** The characters a keyboard lacks, per subject - fixed sets, so they never hint at the answer. */
export function helperKeys(subject: FormulaSubject): string[] {
    return subject === "physics"
        ? ["²", "√", "π", "Δ", "ρ", "λ", "·", "/", "(", ")"]
        : ["²", "³", "√", "π", "·", "/", "(", ")"]
}

// --- the expression reader ---

export type Expr =
    | { t: "num"; v: number }
    | { t: "var"; name: string }
    | { t: "neg"; a: Expr }
    | { t: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Expr; b: Expr }
    | { t: "fn"; name: FnName; a: Expr }

type FnName = "sqrt" | "sin" | "cos" | "tan"

type Tok =
    | { k: "num"; v: number }
    | { k: "var"; name: string }
    | { k: "fn"; name: FnName }
    | { k: "op"; v: "+" | "-" | "*" | "/" | "^" }
    | { k: "lp" }
    | { k: "rp" }

/** Words that are one token rather than letters multiplied together. */
const WORDS: [string, Tok][] = [
    ["sqrt", { k: "fn", name: "sqrt" }],
    ["sin", { k: "fn", name: "sin" }],
    ["cos", { k: "fn", name: "cos" }],
    ["tan", { k: "fn", name: "tan" }],
    ["lambda", { k: "var", name: "λ" }],
    ["delta", { k: "var", name: "Δ" }],
    ["rho", { k: "var", name: "ρ" }],
    ["eta", { k: "var", name: "η" }],
    ["pi", { k: "num", v: Math.PI }],
]

const SUPER: Record<string, string> = {
    "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "ⁿ": "n",
}
const SUB: Record<string, string> = {
    "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
}
const FRACTIONS: Record<string, number> = { "½": 1 / 2, "⅓": 1 / 3, "¼": 1 / 4, "⅔": 2 / 3, "¾": 3 / 4 }

class ReadError extends Error {}

function tokenize(src: string): Tok[] {
    const out: Tok[] = []
    let i = 0
    const isLetter = (c: string | undefined) => !!c && /\p{L}/u.test(c) && !(c in SUPER)
    while (i < src.length) {
        const c = src[i]
        if (/\s/.test(c)) { i++; continue }

        if (/\d/.test(c)) {
            const m = /^\d+(?:[.,]\d+)?/.exec(src.slice(i))!
            out.push({ k: "num", v: Number(m[0].replace(",", ".")) })
            i += m[0].length
            continue
        }
        if (c in FRACTIONS) { out.push({ k: "num", v: FRACTIONS[c] }); i++; continue }
        if (c === "π") { out.push({ k: "num", v: Math.PI }); i++; continue }
        if (c === "√") { out.push({ k: "fn", name: "sqrt" }); i++; continue }

        // ² ³ ⁻¹ ⁿ⁻¹ - a run of superscripts is one exponent.
        if (c in SUPER) {
            let run = ""
            while (i < src.length && src[i] in SUPER) run += SUPER[src[i++]]
            out.push({ k: "op", v: "^" })
            const sub = tokenize(run)
            out.push({ k: "lp" }, ...sub, { k: "rp" })
            continue
        }

        if ("+".includes(c)) { out.push({ k: "op", v: "+" }); i++; continue }
        if ("-−–".includes(c)) { out.push({ k: "op", v: "-" }); i++; continue }
        if ("*·×⋅∙".includes(c)) { out.push({ k: "op", v: "*" }); i++; continue }
        if ("/÷:".includes(c)) { out.push({ k: "op", v: "/" }); i++; continue }
        if (c === "^") { out.push({ k: "op", v: "^" }); i++; continue }
        if ("([{".includes(c)) { out.push({ k: "lp" }); i++; continue }
        if (")]}".includes(c)) { out.push({ k: "rp" }); i++; continue }

        if (isLetter(c)) {
            const rest = src.slice(i).toLowerCase()
            const word = WORDS.find(([w]) => rest.startsWith(w))
            // "delta t" and "Δt" are one variable, the change in t.
            if (word && word[1].k === "var" && word[1].name === "Δ") {
                i += word[0].length
                while (src[i] === " ") i++
                if (!isLetter(src[i])) throw new ReadError("Δ needs a letter after it")
                const inner = tokenize(src.slice(i, i + 1))[0]
                if (inner?.k !== "var") throw new ReadError("Δ needs a letter after it")
                out.push({ k: "var", name: `Δ${inner.name}` })
                i += 1
                continue
            }
            if (word) { out.push(word[1]); i += word[0].length; continue }

            let name = c
            i++
            if (c === "Δ") {
                if (!isLetter(src[i])) throw new ReadError("Δ needs a letter after it")
                name += src[i++]
            }
            // v_0, v_{0}, v0, v₀, a_n - all the subscript v-nought.
            let sub = ""
            if (src[i] === "_") {
                i++
                if (src[i] === "{") {
                    const close = src.indexOf("}", i)
                    if (close < 0) throw new ReadError("unclosed subscript")
                    sub = src.slice(i + 1, close)
                    i = close + 1
                } else {
                    // Digits or letters, not both: m_1m_2 is m₁·m₂, not m with the subscript "1m".
                    const m = /^(?:\d+|\p{L}+)/u.exec(src.slice(i))
                    if (!m) throw new ReadError("empty subscript")
                    sub = m[0]
                    i += m[0].length
                }
            } else if (src[i] && src[i] in SUB) {
                while (src[i] && src[i] in SUB) sub += SUB[src[i++]]
            } else {
                const m = /^\d+/.exec(src.slice(i))
                if (m) { sub = m[0]; i += m[0].length }
            }
            out.push({ k: "var", name: sub ? `${name}_${sub}` : name })
            continue
        }
        throw new ReadError(`unexpected "${c}"`)
    }
    return out
}

/**
 * `tight`: implicit multiplication binds tighter than `/`, so `Q/mΔt` is
 * `Q/(m·Δt)`. People write it both ways, and a reading that makes the answer
 * right is the one they meant - see `judgeFormula`.
 */
function parse(tokens: Tok[], tight: boolean): Expr {
    let pos = 0
    const peek = () => tokens[pos]
    const startsFactor = (t: Tok | undefined) => !!t && (t.k === "num" || t.k === "var" || t.k === "fn" || t.k === "lp")

    function expr(): Expr {
        let left = term()
        for (let t = peek(); t?.k === "op" && (t.v === "+" || t.v === "-"); t = peek()) {
            pos++
            left = { t: "bin", op: t.v, a: left, b: term() }
        }
        return left
    }

    function term(): Expr {
        let left = tight ? implicitRun() : unary()
        for (;;) {
            const t = peek()
            if (t?.k === "op" && (t.v === "*" || t.v === "/")) {
                pos++
                left = { t: "bin", op: t.v, a: left, b: tight ? implicitRun() : unary() }
            } else if (!tight && startsFactor(t)) {
                left = { t: "bin", op: "*", a: left, b: unary() }
            } else {
                return left
            }
        }
    }

    function implicitRun(): Expr {
        let left = unary()
        while (startsFactor(peek())) left = { t: "bin", op: "*", a: left, b: unary() }
        return left
    }

    function unary(): Expr {
        const t = peek()
        if (t?.k === "op" && t.v === "-") { pos++; return { t: "neg", a: unary() } }
        if (t?.k === "op" && t.v === "+") { pos++; return unary() }
        return power()
    }

    function power(): Expr {
        const base = primary()
        const t = peek()
        if (t?.k === "op" && t.v === "^") {
            pos++
            return { t: "bin", op: "^", a: base, b: unary() }
        }
        return base
    }

    function primary(): Expr {
        const t = tokens[pos++]
        if (!t) throw new ReadError("it ends too early")
        if (t.k === "num") return { t: "num", v: t.v }
        if (t.k === "var") return { t: "var", name: t.name }
        if (t.k === "fn") return { t: "fn", name: t.name, a: power() }
        if (t.k === "lp") {
            const inner = expr()
            if (tokens[pos++]?.k !== "rp") throw new ReadError("a bracket is not closed")
            return inner
        }
        throw new ReadError("an operator is out of place")
    }

    const result = expr()
    if (pos < tokens.length) throw new ReadError("a bracket or operator is out of place")
    return result
}

function evaluate(e: Expr, env: Record<string, number>): number {
    switch (e.t) {
        case "num": return e.v
        case "var": return env[e.name] ?? NaN
        case "neg": return -evaluate(e.a, env)
        case "fn": {
            const x = evaluate(e.a, env)
            return e.name === "sqrt" ? Math.sqrt(x) : Math[e.name](x)
        }
        case "bin": {
            const a = evaluate(e.a, env)
            const b = evaluate(e.b, env)
            if (e.op === "+") return a + b
            if (e.op === "-") return a - b
            if (e.op === "*") return a * b
            if (e.op === "/") return a / b
            return Math.pow(a, b)
        }
    }
}

function varsIn(e: Expr, into = new Set<string>()): Set<string> {
    if (e.t === "var") into.add(e.name)
    else if (e.t === "neg" || e.t === "fn") varsIn(e.a, into)
    else if (e.t === "bin") { varsIn(e.a, into); varsIn(e.b, into) }
    return into
}

const isSum = (e: Expr): boolean => (e.t === "bin" && (e.op === "+" || e.op === "-")) || (e.t === "neg" && isSum(e.a))

/** A power or product of a bracketed sum anywhere in the tree - i.e. not multiplied out. */
function hasUnexpanded(e: Expr): boolean {
    if (e.t === "bin") {
        if (e.op === "^" && isSum(e.a)) return true
        if (e.op === "*" && (isSum(e.a) || isSum(e.b))) return true
        return hasUnexpanded(e.a) || hasUnexpanded(e.b)
    }
    if (e.t === "neg" || e.t === "fn") return hasUnexpanded(e.a)
    return false
}

function isProduct(e: Expr): boolean {
    if (e.t === "neg") return isProduct(e.a)
    return e.t === "bin" && (e.op === "*" || e.op === "^")
}

/**
 * A fixed spread of points, not `Math.random`: the same answer must get the
 * same verdict every time, and a verdict that changed on a retry would read as
 * the game being broken. Values stay clear of 0 and 1, where different
 * formulas agree by accident (a² = a at 1), and are all distinct per variable.
 * There are more than needed because some fall outside a formula's domain -
 * Heron's root is only real for a triangle that exists - and are skipped.
 */
function samplePoints(names: string[]): Record<string, number>[] {
    const points: Record<string, number>[] = []
    for (let k = 0; k < 40; k++) {
        const env: Record<string, number> = {}
        names.forEach((name, j) => {
            env[name] = 1.3 + ((k * 7 + j * 11) % 17) * 0.23 + j * 0.07
        })
        points.push(env)
    }
    return points
}

function sameValue(a: number, b: number): boolean {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b))
}

const REFERENCE = new Map<string, Expr>()

function referenceOf(f: Formula): Expr {
    let e = REFERENCE.get(f.id)
    if (!e) {
        e = parse(tokenize(f.expr), false)
        REFERENCE.set(f.id, e)
    }
    return e
}

export type Verdict =
    /** `soft`: the answer could not be judged - a typo in the notation, not a wrong formula. Costs nothing. */
    | { kind: "right" | "wrong"; note?: string }
    | { kind: "soft"; note: string }

export function judgeFormula(f: Formula, raw: string): Verdict {
    // Whoever writes the whole equation means its right-hand side.
    const input = raw.includes("=") ? raw.slice(raw.lastIndexOf("=") + 1) : raw
    if (!input.trim()) return { kind: "soft", note: "Write the right-hand side." }

    let tokens: Tok[]
    try {
        tokens = tokenize(input)
    } catch (err) {
        return { kind: "soft", note: `Could not read that - ${err instanceof ReadError ? err.message : "check the notation"}.` }
    }

    const readings: Expr[] = []
    let lastError = ""
    for (const tight of [false, true]) {
        try {
            readings.push(parse(tokens, tight))
        } catch (err) {
            lastError = err instanceof ReadError ? err.message : "check the notation"
        }
    }
    if (readings.length === 0) return { kind: "soft", note: `Could not read that - ${lastError}.` }

    const allowed = new Set(Object.keys(f.vars))
    const stray = [...varsIn(readings[0])].filter(v => !allowed.has(v))
    if (stray.length > 0) {
        return { kind: "soft", note: `${stray.join(", ")} ${stray.length === 1 ? "is" : "are"} not in this formula - use the symbols listed.` }
    }

    const reference = referenceOf(f)
    const points = samplePoints([...allowed]).filter(env => Number.isFinite(evaluate(reference, env))).slice(0, 8)
    const matches = (e: Expr) => points.length >= 4 && points.every(env => sameValue(evaluate(e, env), evaluate(reference, env)))
    const right = readings.find(matches)
    if (!right) return { kind: "wrong" }

    if (f.shape === "expanded" && hasUnexpanded(right)) {
        return { kind: "soft", note: "True, but multiply it out - that is the point of this one." }
    }
    if (f.shape === "factored" && !isProduct(right)) {
        return { kind: "soft", note: "True, but write it as a product." }
    }
    return { kind: "right" }
}

/** The whole equation as printed: `E_k = ½·m·v²`. */
export function equation(f: Formula): string {
    return `${f.lhs} = ${f.rhs}`
}

/** Everything a hand-typed table can get wrong: every reference must parse, pass its own shape, and use only its listed symbols. */
export function checkFormulas(): string[] {
    const problems: string[] = []
    const ids = new Set<string>()
    for (const f of FORMULAS) {
        if (ids.has(f.id)) problems.push(`duplicate id ${f.id}`)
        ids.add(f.id)
        try {
            const verdict = judgeFormula(f, f.expr)
            if (verdict.kind !== "right") problems.push(`${f.id}: its own answer is judged ${verdict.kind} ${verdict.note ?? ""}`)
            const listed = Object.keys(f.vars)
            const used = [...varsIn(referenceOf(f))]
            for (const v of listed) if (!used.includes(v)) problems.push(`${f.id}: lists ${v} but does not use it`)
        } catch (err) {
            problems.push(`${f.id}: ${String(err)}`)
        }
    }
    return problems
}

if (import.meta.env.DEV) {
    const problems = checkFormulas()
    if (problems.length) console.error("formulas.ts:", problems)
}
