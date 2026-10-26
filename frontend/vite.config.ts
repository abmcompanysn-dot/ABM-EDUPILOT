import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg'],
      manifest: {
        name: 'ABM EduPilote',
        short_name: 'EduPilote',
        description: "Suivi des présences et carte d'identité étudiante NFC",
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        background_color: '#1C2B5A',
        theme_color: '#1C2B5A',
        icons: [{ src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    proxy: { '/api': { target: 'http://localhost:8080', ws: true } },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
})
