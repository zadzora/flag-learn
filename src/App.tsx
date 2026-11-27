import { lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route, useParams, useSearchParams } from "react-router-dom"
import Home from "./pages/Home"
import Game from "./pages/Game"
import Extras from "./pages/Extras"
import ExtraBrowse from "./pages/ExtraBrowse"
import BlurGame from "./pages/BlurGame"
import CreateGame from "./pages/CreateGame"
import PvPGame from "./pages/PvPGame"
import { Analytics } from "@vercel/analytics/react"
import DailyFlagle from "./pages/DailyFlagle"
import DailyConnections from "./pages/DailyConnections"
import DailyDeduction from "./pages/DailyDeduction"
import DailyLandmarks from "./pages/DailyLandmarks"
import LandmarksGame from "./pages/LandmarksGame"
import MapGame from "./pages/MapGame"
import CapitalMapGame from "./pages/CapitalMapGame"
import ConstellationGame from "./pages/ConstellationGame"
import ConstellationBuilder from "./pages/ConstellationBuilder"
import UltimateGame from "./pages/UltimateGame"
import UltimateSpeedrun from "./pages/UltimateSpeedrun"
import Highscore from "./pages/Highscore"
import WordWheelGame from "./pages/WordWheelGame"
import HigherLowerGame from "./pages/HigherLowerGame"
import PaintGame from "./pages/PaintGame"
import BorderGuessGame from "./pages/BorderGuessGame"
import FlagWars from "./pages/FlagWars"
import BorderChain from "./pages/BorderChain"
import Science from "./pages/Science"
import PeriodicTableGame from "./pages/PeriodicTableGame"
import PhysicsQuantitiesGame from "./pages/PhysicsQuantitiesGame"
import FormulasGame from "./pages/FormulasGame"
import ElementDetective from "./pages/ElementDetective"
import AtomBuilder from "./pages/AtomBuilder"
import Elementle from "./pages/Elementle"
import ElementSpeedrun from "./pages/ElementSpeedrun"
import CompoundsGame from "./pages/CompoundsGame"
import SymbolSpeller from "./pages/SymbolSpeller"
import ElementHigherLower from "./pages/ElementHigherLower"
import ChemConnections from "./pages/ChemConnections"
import RoadTrip from "./pages/RoadTrip"
import FlagScreensaver from "./pages/FlagScreensaver"
import TriviaGame from "./pages/TriviaGame"
import TriviaRooms from "./pages/TriviaRooms"
import TriviaRoom from "./pages/TriviaRoom"
import Profile from "./pages/Profile"
import Privacy from "./pages/Privacy"
import Terms from "./pages/Terms"
import Support from "./pages/Support"
import AchievementToasts from "./components/AchievementToasts"
import ScrollMemory from "./components/ScrollMemory"
import Snowfall from "./components/Snowfall"
import IdleScreensaver from "./components/IdleScreensaver"

/** Dev only: every supporter animal in every state (`/dev/pets`). Never part of a production build. */
const PetGallery = import.meta.env.DEV ? lazy(() => import("./pages/PetGallery")) : null
/** Dev only: the trivia question editor (`/dev/trivia`), backed by the dev server's /__trivia/ endpoints. */
const TriviaEditor = import.meta.env.DEV ? lazy(() => import("./pages/TriviaEditor")) : null
const ExtraFlagsReview = import.meta.env.DEV ? lazy(() => import("./pages/ExtraFlagsReview")) : null
// import FlagQuestionGame from "./pages/FlagQuestionGame"

/** /play, or /play?deck=<id> for an Extras pack - a fresh page per deck, so no state leaks between them. */
function GameRoute() {
    const [params] = useSearchParams()
    const deck = params.get("deck")
    return <Game key={deck ?? "main"} deck={deck} />
}

/** /extras/<id>: every flag of one pack to look through; keyed so another pack starts fresh. */
function ExtraBrowseRoute() {
    const { id } = useParams()
    return <ExtraBrowse key={id} />
}

export default function App() {
    return (
        <BrowserRouter>
            <ScrollMemory />
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/support" element={<Support />} />

                <Route path="/play" element={<GameRoute />} />
                <Route path="/extras" element={<Extras />} />
                <Route path="/extras/:id" element={<ExtraBrowseRoute />} />
                <Route path="/blur" element={<BlurGame />} />
                <Route path="/pvp/create" element={<CreateGame />} />
                 <Route path="/pvp/:gameId" element={<PvPGame />} />
                <Route path="/daily" element={<DailyFlagle />} />
                <Route path="/daily-connections" element={<DailyConnections />} />
                <Route path="/daily-deduction" element={<DailyDeduction />} />
                <Route path="/daily-landmarks" element={<DailyLandmarks />} />
                <Route path="/landmarks" element={<LandmarksGame />} />
                <Route path="/map" element={<MapGame key="learn" />} />
                <Route path="/map-speedrun" element={<MapGame key="speedrun" mode="speedrun" />} />
                <Route path="/capital-map" element={<CapitalMapGame key="learn" />} />
                <Route path="/capital-speedrun" element={<CapitalMapGame key="speedrun" mode="speedrun" />} />
                <Route path="/constellations" element={<ConstellationGame />} />
                <Route path="/builder" element={<ConstellationBuilder />} />
                <Route path="/ultimate" element={<UltimateGame />} />
                <Route path="/ultimate-speedrun" element={<UltimateSpeedrun />} />
                <Route path="/highscore" element={<Highscore />} />
                <Route path="/word-wheel" element={<WordWheelGame />} />
                <Route path="/trivia" element={<TriviaGame key="solo" />} />
                <Route path="/daily-trivia" element={<TriviaGame key="daily" mode="daily" />} />
                <Route path="/trivia/rooms" element={<TriviaRooms />} />
                <Route path="/trivia/room/:code" element={<TriviaRoom />} />
                <Route path="/higher-lower" element={<HigherLowerGame />} />
                <Route path="/paint" element={<PaintGame />} />
                <Route path="/border-guess" element={<BorderGuessGame />} />
                <Route path="/border-chain" element={<BorderChain />} />
                <Route path="/world-conqueror" element={<FlagWars />} />
                {/* Keyed: the same page in two modes must not share one mounted instance. */}
                <Route path="/road-trip" element={<RoadTrip key="trip" />} />
                <Route path="/daily-rally" element={<RoadTrip key="rally" mode="rally" />} />
                <Route path="/screensaver" element={<FlagScreensaver />} />

                {/* Science - no flags, no map, its own wing under /science. */}
                <Route path="/science" element={<Science />} />
                <Route path="/science/elements" element={<PeriodicTableGame />} />
                <Route path="/science/quantities" element={<PhysicsQuantitiesGame />} />
                <Route path="/science/formulas" element={<FormulasGame />} />
                <Route path="/science/detective" element={<ElementDetective />} />
                <Route path="/science/atom-builder" element={<AtomBuilder />} />
                <Route path="/science/elementle" element={<Elementle />} />
                <Route path="/science/speedrun" element={<ElementSpeedrun />} />
                <Route path="/science/compounds" element={<CompoundsGame />} />
                <Route path="/science/speller" element={<SymbolSpeller />} />
                <Route path="/science/higher-lower" element={<ElementHigherLower />} />
                <Route path="/science/connections" element={<ChemConnections />} />

                {PetGallery && <Route path="/dev/pets" element={<Suspense fallback={null}><PetGallery /></Suspense>} />}
                {TriviaEditor && <Route path="/dev/trivia" element={<Suspense fallback={null}><TriviaEditor /></Suspense>} />}
                {ExtraFlagsReview && <Route path="/dev/extra-flags" element={<Suspense fallback={null}><ExtraFlagsReview /></Suspense>} />}


                {/* The mode was called Flag Wars before; keep the old link working. */}
                <Route path="/flag-wars" element={<FlagWars />} />
                {/* <Route path="/flag-questions" element={<FlagQuestionGame />} /> */}

            </Routes>
            {/* Badges are earned on every page, so they are announced from outside the routes. */}
            <AchievementToasts />
            <Snowfall />
            <IdleScreensaver />
            <Analytics />
        </BrowserRouter>
    )
}