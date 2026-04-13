import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { APP_VERSION, FLUSH_CACHE } from './lib/version.js'

// Cache busting: when FLUSH_CACHE is true, clear stale caches on load.
// This runs once per version. After the deploy is stable, set FLUSH_CACHE
// back to false so returning users don't pay the cost on every visit.
const CACHE_KEY = 'linkworks_version'
const storedVersion = localStorage.getItem(CACHE_KEY)

if (FLUSH_CACHE && storedVersion !== APP_VERSION) {
  localStorage.setItem(CACHE_KEY, APP_VERSION)
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name))
    })
  }
  // Only force reload if we had an old version (not first visit)
  if (storedVersion) {
    window.location.reload()
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
