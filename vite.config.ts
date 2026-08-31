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
      // Manifest dinámico vía /api/manifest.webmanifest (alumno vs estudio).
      // El estático con start_url=/entrada hacía que la app del alumno abriera el chooser.
      manifest: false,
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

