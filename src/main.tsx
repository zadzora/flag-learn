import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/nunito/index.css'
import '@fontsource-variable/sora/index.css'
import './index.css'
import App from './App.tsx'
import { restoreCloudSave, startCloudSync } from './utils/cloudSave'
import { installSupporterTest } from './utils/supporters'

// Apply the saved theme before the first render. Pages toggle it themselves later,
// but several never read it on load, so a fresh visit to them came up light.
function applySavedTheme() {
  try {
    document.documentElement.classList.toggle('dark', localStorage.getItem('flag-master-theme') === 'dark')
  } catch {
    // Storage unavailable - light it is.
  }
}
applySavedTheme()
installSupporterTest()

// A tab opened before a deploy still asks for the old build's hashed chunks,
// which the new deployment no longer has. Loading the page again fetches the
// new index.html and its chunk names. Once only: if the fresh page fails too,
// the error is real and the page shows it instead of reloading forever.
const RELOADED_KEY = 'flag-master-stale-build-reload'
window.addEventListener('vite:preloadError', event => {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_KEY)) || 0
    if (Date.now() - last < 30_000) return
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

// A signed-in player's progress is joined in before any page mounts: every page
// reads its save once on mount, so anything written into localStorage later
// would be overwritten by the page's old state. A guest starts at once.
restoreCloudSave().finally(() => {
  // The account may have brought its own theme along.
  applySavedTheme()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  startCloudSync()
})
