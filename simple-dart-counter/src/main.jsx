import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import { AppErrorBoundary } from './components/AppErrorBoundary.jsx'
import { installStaleAssetRecovery } from './utils/staleAssetRecovery.js'

installStaleAssetRecovery()

// Při každém startu dotaz na server kvůli novému service workeru (nový build i při stejném čísle verze v package.json).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true)
  },
  onRegisteredSW(_swUrl, registration) {
    registration?.update().catch(() => {})
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
