import { BrowserRouter, Routes, Route } from "react-router-dom"
import Home from "./pages/Home"
import Game from "./pages/Game"
import CreateGame from "./pages/CreateGame"
import PvPGame from "./pages/PvPGame"
import { Analytics } from "@vercel/analytics/react"

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Hlavné Menu */}
                <Route path="/" element={<Home />} />

                {/* Samotná hra */}
                <Route path="/play" element={<Game />} />
                <Route path="/pvp/create" element={<CreateGame />} />
                 <Route path="/pvp/:gameId" element={<PvPGame />} />
            </Routes>
            <Analytics />
        </BrowserRouter>
    )
}