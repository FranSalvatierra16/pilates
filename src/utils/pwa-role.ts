/** Rol de la PWA instalada: alumno (solo recuperar) o estudio (sistema completo). */
export type PwaRole = 'alumno' | 'estudio';

const ROLE_KEY = 'fitgest_pwa_role';
const ALUMNO_FLAG_KEY = 'fitgest_portal_alumno';
const ALUMNO_MODO_KEY = 'fitgest_portal_alumno_modo';
const ALUMNO_SUCURSAL_KEY = 'fitgest_portal_alumno_sucursal';
const TOKEN_KEY = 'savia_token';

export function getPwaRole(): PwaRole | null {
  try {
    const v = localStorage.getItem(ROLE_KEY);
    if (v === 'alumno' || v === 'estudio') return v;
  } catch {
    /* ignore */
  }
  return null;
}

/** True si este dispositivo se usó / instaló como portal alumno (recuperar). */
export function isAlumnoPwa(): boolean {
  try {
    if (localStorage.getItem(ALUMNO_FLAG_KEY) === '1') return true;
    if (getPwaRole() === 'alumno') return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function setPwaRole(role: PwaRole) {
  try {
    localStorage.setItem(ROLE_KEY, role);
    if (role === 'alumno') {
      localStorage.setItem(ALUMNO_FLAG_KEY, '1');
    }
    // No borrar el flag alumno al pasar por /login con un token viejo:
    // eso hacía que la app de recuperar abriera el login del estudio.
  } catch {
    /* ignore */
  }
}

/** Pasar a app de estudio de forma explícita (entrada Estudio o login ok). */
export function adoptEstudioPwa() {
  try {
    localStorage.setItem(ROLE_KEY, 'estudio');
    localStorage.removeItem(ALUMNO_FLAG_KEY);
    localStorage.removeItem(ALUMNO_MODO_KEY);
    localStorage.removeItem(ALUMNO_SUCURSAL_KEY);
  } catch {
    /* ignore */
  }
}

export function setAlumnoPortalContext(opts: { modo?: string; sucursalId?: string }) {
  setPwaRole('alumno');
  try {
    localStorage.setItem(ALUMNO_FLAG_KEY, '1');
    if (opts.modo) localStorage.setItem(ALUMNO_MODO_KEY, opts.modo);
    if (opts.sucursalId?.trim()) localStorage.setItem(ALUMNO_SUCURSAL_KEY, opts.sucursalId.trim());
  } catch {
    /* ignore */
  }
}

export function getAlumnoPortalContext() {
  try {
    return {
      modo: localStorage.getItem(ALUMNO_MODO_KEY) || 'recuperar',
      sucursalId: localStorage.getItem(ALUMNO_SUCURSAL_KEY) || '',
    };
  } catch {
    return { modo: 'recuperar', sucursalId: '' };
  }
}

export function hasEstudioSession(): boolean {
  try {
    return !!localStorage.getItem(TOKEN_KEY);
  } catch {
    return false;
  }
}

export function isPwaStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

/** Ruta de inicio según el tipo de app. Alumno gana siempre sobre sesión de estudio en el mismo celular. */
export function getPwaStartPath(): string {
  if (isAlumnoPwa()) {
    const { modo, sucursalId } = getAlumnoPortalContext();
    const q = new URLSearchParams({ modo: modo || 'recuperar', portal: 'alumno' });
    if (sucursalId) q.set('sucursalId', sucursalId);
    return `/mi-clase?${q.toString()}`;
  }
  if (getPwaRole() === 'estudio' || hasEstudioSession()) {
    return hasEstudioSession() ? '/dashboard' : '/login?portal=estudio';
  }
  return '/entrada';
}

export function buildManifestHref(opts: {
  portal: PwaRole;
  sucursalId?: string | null;
  token?: string | null;
  modo?: string;
  brand?: string;
}): string {
  const params = new URLSearchParams({ portal: opts.portal });
  if (opts.sucursalId?.trim()) params.set('sucursalId', opts.sucursalId.trim());
  if (opts.token?.trim()) params.set('token', opts.token.trim());
  if (opts.modo) params.set('modo', opts.modo);
  if (opts.brand) params.set('brand', opts.brand);
  return `/api/manifest.webmanifest?${params.toString()}`;
}
