import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/nunito/index.css'
import '@fontsource-variable/sora/index.css'
import './index.css'
import App from './App.tsx'

// Apply the saved theme before the first render. Pages toggle it themselves later,
// but several never read it on load, so a fresh visit to them came up light.
try {
  if (localStorage.getItem('flag-master-theme') === 'dark') document.documentElement.classList.add('dark')
} catch {
  // Storage unavailable - light it is.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
