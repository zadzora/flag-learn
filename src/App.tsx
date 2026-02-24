import { BrowserRouter, Routes, Route } from "react-router-dom"
import Home from "./pages/Home"
import Game from "./pages/Game"
import BlurGame from "./pages/BlurGame"
import CreateGame from "./pages/CreateGame"
import PvPGame from "./pages/PvPGame"
import { Analytics } from "@vercel/analytics/react"
import DailyFlagle from "./pages/DailyFlagle"

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
            </Routes>
            <Analytics />
        </BrowserRouter>
    )
}