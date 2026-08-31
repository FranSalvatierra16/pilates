import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import {
  buildManifestHref,
  getPwaRole,
  getPwaStartPath,
  hasEstudioSession,
  isPwaStandalone,
  setAlumnoPortalContext,
  setPwaRole,
} from './utils/pwa-role'

/** Sincroniza rol PWA desde la URL (por si el script del HTML no alcanzó). */
function syncPwaRoleFromUrl() {
  if (typeof window === 'undefined') return
  const path = window.location.pathname || ''
  const params = new URLSearchParams(window.location.search)
  const isAlumno =
    path.startsWith('/mi-clase') ||
    params.get('portal') === 'alumno' ||
    params.get('modo') === 'recuperar'

  if (isAlumno) {
    setAlumnoPortalContext({
      modo: params.get('modo') || 'recuperar',
      sucursalId: params.get('sucursalId') || '',
    })
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (link) {
      link.href = buildManifestHref({
        portal: 'alumno',
        sucursalId: params.get('sucursalId'),
        token: params.get('token'),
        modo: params.get('modo') || 'recuperar',
      })
    }
    return
  }

  if (path.startsWith('/login') || params.get('portal') === 'estudio') {
    setPwaRole('estudio')
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (link) {
      link.href = buildManifestHref({
        portal: 'estudio',
        sucursalId: params.get('sucursalId'),
        brand: params.get('sucursalId') ? undefined : 'fitgest',
      })
    }
  }
}

/**
 * PWA instalada: iOS a veces abre /; Chrome puede abrir start_url viejo (/entrada).
 * Mandamos al inicio correcto según alumno vs estudio.
 */
function bootPwaSkipMarketingLanding() {
  const mode = String(import.meta.env.VITE_PUBLIC_SITE_MODE || '')
    .trim()
    .toLowerCase()
  if (mode === 'landing' || mode === 'marketing') return
  if (typeof window === 'undefined') return

  syncPwaRoleFromUrl()

  if (!isPwaStandalone()) return

  const { pathname, search, hash } = window.location
  const role = getPwaRole()
  const start = getPwaStartPath()

  // Ya está en su portal alumno
  if (role === 'alumno' && pathname.startsWith('/mi-clase')) return
  // Estudio ya dentro del sistema o en login
  if (
    role === 'estudio' &&
    (pathname.startsWith('/login') ||
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/calendario') ||
      pathname.startsWith('/alumnos'))
  ) {
    return
  }

  // Abrir / o /entrada (chooser viejo) → ir al inicio de esa app
  if (pathname === '/' || pathname === '' || pathname === '/entrada') {
    if (role === 'alumno' || role === 'estudio' || hasEstudioSession()) {
      window.history.replaceState(null, '', `${start}${hash || ''}`)
      return
    }
    if (pathname === '/' || pathname === '') {
      window.history.replaceState(null, '', `/entrada${search}${hash}`)
    }
  }
}

syncPwaRoleFromUrl()
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
  setPwaRole('estudio')
  const title = `${storedSucursalNombre} - Sistema de Gestión`
  const manifestHref = storedSucursalId
    ? `/api/manifest.webmanifest?portal=estudio&sucursalId=${encodeURIComponent(storedSucursalId)}`
    : '/api/manifest.webmanifest?portal=estudio&brand=fitgest'
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
