import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { existsSync } from 'fs'
import { join } from 'path'

// Nombre e icono de la PWA. Por defecto FITGEST (así sale bien en Railway aunque no pasen env en el build).
const appName = (process.env.VITE_APP_NAME || 'FITGEST').trim()
function getAppIcon(): string {
  if (process.env.VITE_APP_ICON) return process.env.VITE_APP_ICON.trim()
  const nameIcon = `${appName.toLowerCase().replace(/\s+/g, '')}.png`
  const iconPath = join(process.cwd(), 'public', nameIcon)
  if (existsSync(iconPath)) return nameIcon
  return 'savia.png'
}
const appIcon = getAppIcon()

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      includeAssets: [appIcon],
      manifest: {
        name: appName ? `${appName} - Sistema de Gestión` : 'Sistema de Gestión',
        short_name: appName || 'Sistema',
        description: 'Sistema de gestión para Pilates',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        // Instalación PWA: primera pantalla = elegir estudio o alumno (no la landing en /)
        start_url: '/entrada',
        icons: [
          { src: appIcon, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: appIcon, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ],
})

