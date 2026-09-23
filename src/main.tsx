import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import {
  adoptEstudioPwa,
  applyManifestLink,
  getPwaRole,
  getPwaStartPath,
  hasEstudioSession,
  isAlumnoAppPath,
  isAlumnoPwa,
  isEstudioAppPath,
  isPwaStandalone,
  setAlumnoPortalContext,
  shouldForceAlumnoStandaloneRedirect,
} from './utils/pwa-role'

/** Sincroniza rol PWA desde la URL (por si el script del HTML no alcanzó). */
function syncPwaRoleFromUrl() {
  if (typeof window === 'undefined') return
  const path = window.location.pathname || ''
  const params = new URLSearchParams(window.location.search)

  if (isAlumnoAppPath(path, window.location.search)) {
    setAlumnoPortalContext({
      modo: params.get('modo') || 'recuperar',
      sucursalId: params.get('sucursalId') || '',
    })
    applyManifestLink({
      portal: 'alumno',
      sucursalId: params.get('sucursalId'),
      token: params.get('token'),
      modo: params.get('modo') || 'recuperar',
    })
    return
  }

  // Launch de estudio (login/gestión) o sesión de sucursal: manifest de estudio.
  if (isEstudioAppPath(path, window.location.search) || hasEstudioSession()) {
    // En navegador o en launch claro de estudio: adoptar rol estudio para instalar bien.
    if (!isPwaStandalone() || isEstudioAppPath(path, window.location.search) || hasEstudioSession()) {
      adoptEstudioPwa()
    }
    const sid = params.get('sucursalId') || localStorage.getItem('savia_sucursalId') || ''
    applyManifestLink({
      portal: 'estudio',
      sucursalId: sid || null,
      brand: sid ? undefined : 'fitgest',
    })
  }
}

/**
 * PWA instalada: iOS a veces abre / o un start_url viejo.
 * Solo forzar /mi-clase si el launch NO es de la app estudio.
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

  if (shouldForceAlumnoStandaloneRedirect()) {
    window.history.replaceState(null, '', `${getPwaStartPath()}${hash || ''}`)
    if (pathname.startsWith('/login') || pathname === '/entrada' || pathname === '/' || pathname === '') {
      window.location.replace(`${getPwaStartPath()}${hash || ''}`)
    }
    return
  }

  // App alumno abierta en /mi-clase: ok
  if (isAlumnoAppPath(pathname, search)) return

  // App estudio
  if (isEstudioAppPath(pathname, search) || getPwaRole() === 'estudio' || hasEstudioSession()) {
    if (pathname === '/' || pathname === '' || pathname === '/entrada') {
      window.history.replaceState(null, '', `${start}${hash || ''}`)
    }
    return
  }

  if (pathname === '/' || pathname === '' || pathname === '/entrada') {
    if (isAlumnoPwa()) {
      window.location.replace(`${getPwaStartPath()}${hash || ''}`)
      return
    }
    window.history.replaceState(null, '', `/entrada${search}${hash}`)
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

// Sesión de sucursal (en navegador o app estudio): forzar manifest de gestión.
if (
  storedToken &&
  storedSucursalNombre &&
  !isAlumnoAppPath() &&
  (!isPwaStandalone() || isEstudioAppPath() || !isAlumnoPwa())
) {
  adoptEstudioPwa()
  const title = `${storedSucursalNombre} - Sistema de Gestión`
  document.title = title
  applyManifestLink({
    portal: 'estudio',
    sucursalId: storedSucursalId,
    brand: storedSucursalId ? undefined : 'fitgest',
  })

  const iconHref = storedFotoPerfil || (storedSucursalId
    ? `/api/public/sucursal-logo/${encodeURIComponent(storedSucursalId)}`
    : '/fitgest.png')

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
