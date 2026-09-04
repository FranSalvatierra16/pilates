import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import {
  buildManifestHref,
  getPwaRole,
  getPwaStartPath,
  hasEstudioSession,
  isAlumnoPwa,
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

  // No convertir a estudio si este dispositivo es la app instalada de alumno.
  if (isAlumnoPwa() && isPwaStandalone()) return

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
 * PWA instalada: iOS a veces abre / o un start_url viejo (/login, /entrada).
 * Si es app alumno → siempre /mi-clase.
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
  const start = getPwaStartPath()

  // App alumno: sacar de login / entrada / home y mandar a recuperar
  // (aunque la URL sea /login?portal=estudio por un start_url mal instalado)
  if (isAlumnoPwa()) {
    if (!pathname.startsWith('/mi-clase')) {
      window.history.replaceState(null, '', `${getPwaStartPath()}${hash || ''}`)
      // Forzar navegación real en iOS standalone (replaceState a veces no alcanza)
      if (pathname.startsWith('/login') || pathname === '/entrada' || pathname === '/' || pathname === '') {
        window.location.replace(`${getPwaStartPath()}${hash || ''}`)
      }
    }
    return
  }

  const role = getPwaRole()

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

  if (pathname === '/' || pathname === '' || pathname === '/entrada' || pathname === '/login') {
    if (role === 'estudio' || hasEstudioSession()) {
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

// Token de estudio en el mismo celular NO debe pisar la app del alumno
if (storedToken && storedSucursalNombre && !isAlumnoPwa()) {
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
