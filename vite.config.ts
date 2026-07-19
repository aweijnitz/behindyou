import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const productionBase = process.env.VITE_BASE_PATH ?? '/'
const httpsKeyPath = process.env.VITE_HTTPS_KEY
const httpsCertPath = process.env.VITE_HTTPS_CERT
const https =
  httpsKeyPath && httpsCertPath
    ? { key: readFileSync(httpsKeyPath), cert: readFileSync(httpsCertPath) }
    : undefined

export default defineConfig({
  base: productionBase,
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        id: productionBase,
        name: 'Behind You',
        short_name: 'Behind You',
        description: 'Check your hair with a private, temporary video that stays on your device.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        scope: productionBase,
        start_url: productionBase,
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/maskable-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/maskable-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        runtimeCaching: [],
      },
    }),
  ],
  server: { https },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
