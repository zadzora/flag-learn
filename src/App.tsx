import { BrowserRouter, Routes, Route } from "react-router-dom"
import Home from "./pages/Home"
import Game from "./pages/Game"
import BlurGame from "./pages/BlurGame"
import CreateGame from "./pages/CreateGame"
import PvPGame from "./pages/PvPGame"
import { Analytics } from "@vercel/analytics/react"
import DailyFlagle from "./pages/DailyFlagle"
import DailyMapMode from "./pages/DailyMapMode"
import MapGame from "./pages/MapGame"
import ConstellationGame from "./pages/ConstellationGame"
import ConstellationBuilder from "./pages/ConstellationBuilder"
import UltimateGame from "./pages/UltimateGame"
import Highscore from "./pages/Highscore"
import WordWheelGame from "./pages/WordWheelGame"
import HigherLowerGame from "./pages/HigherLowerGame"

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Home />} />

                <Route path="/play" element={<Game />} />
                <Route path="/blur" element={<BlurGame />} />
                <Route path="/pvp/create" element={<CreateGame />} />
                 <Route path="/pvp/:gameId" element={<PvPGame />} />
                <Route path="/daily" element={<DailyFlagle />} />
                <Route path="/daily-map" element={<DailyMapMode />} />
                <Route path="/map" element={<MapGame />} />
                <Route path="/constellations" element={<ConstellationGame />} />
                <Route path="/builder" element={<ConstellationBuilder />} />
                <Route path="/ultimate" element={<UltimateGame />} />
                <Route path="/highscore" element={<Highscore />} />
                <Route path="/word-wheel" element={<WordWheelGame />} />
                <Route path="/higher-lower" element={<HigherLowerGame />} />

            </Routes>
            <Analytics />
        </BrowserRouter>
    )
}