import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: false,
      workbox: {
        // TOTO JE KLÍČOVÉ: Říká PWA, aby ignorovalo Firebase Auth a .well-known složku
        navigateFallbackDenylist: [/^\/__/, /^\/\.well-known\//]
      }
    })
  ],
})