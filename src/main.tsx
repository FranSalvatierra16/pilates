import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

/** PWA instalada: iOS a veces ignora start_url y abre /. Mandamos a /entrada antes de montar React. */
function bootPwaSkipMarketingLanding() {
  const mode = String(import.meta.env.VITE_PUBLIC_SITE_MODE || '')
    .trim()
    .toLowerCase()
  if (mode === 'landing' || mode === 'marketing') return
  if (typeof window === 'undefined') return
  const nav = window.navigator as Navigator & { standalone?: boolean }
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
  if (!standalone) return
  const { pathname, search, hash } = window.location
  if (pathname !== '/' && pathname !== '') return
  window.history.replaceState(null, '', `/entrada${search}${hash}`)
}

bootPwaSkipMarketingLanding()

const TOKEN_KEY = 'savia_token'
const SUCURSAL_ID_KEY = 'savia_sucursalId'
const SUCURSAL_NOMBRE_KEY = 'savia_sucursalNombre'
const FOTO_PERFIL_KEY = 'savia_fotoPerfil'

const storedToken = localStorage.getItem(TOKEN_KEY)
const storedSucursalId = localStorage.getItem(SUCURSAL_ID_KEY)
const storedSucursalNombre = localStorage.getItem(SUCURSAL_NOMBRE_KEY)
const storedFotoPerfil = localStorage.getItem(FOTO_PERFIL_KEY)

if (storedToken && storedSucursalNombre) {
  const title = `${storedSucursalNombre} - Sistema de Gestión`
  const manifestHref = storedSucursalId
    ? `/api/manifest.webmanifest?sucursalId=${encodeURIComponent(storedSucursalId)}`
    : '/api/manifest.webmanifest?brand=fitgest'
  const iconHref = storedFotoPerfil || (storedSucursalId
    ? `/api/public/sucursal-logo/${encodeURIComponent(storedSucursalId)}`
    : '/fitgest.png')

  document.title = title

  const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (manifestLink) manifestLink.href = manifestHref

  const appleTouch = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
  if (appleTouch) appleTouch.href = iconHref

  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (favicon) favicon.href = iconHref

  const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
  if (appleTitle) appleTitle.content = storedSucursalNombre
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

