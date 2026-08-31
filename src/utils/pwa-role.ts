/** Rol de la PWA instalada: alumno (solo recuperar) o estudio (sistema completo). */
export type PwaRole = 'alumno' | 'estudio';

const ROLE_KEY = 'fitgest_pwa_role';
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

export function setPwaRole(role: PwaRole) {
  try {
    localStorage.setItem(ROLE_KEY, role);
    // Compat con boot anterior
    if (role === 'alumno') localStorage.setItem('fitgest_portal_alumno', '1');
    else {
      localStorage.removeItem('fitgest_portal_alumno');
      localStorage.removeItem(ALUMNO_MODO_KEY);
      localStorage.removeItem(ALUMNO_SUCURSAL_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function setAlumnoPortalContext(opts: { modo?: string; sucursalId?: string }) {
  setPwaRole('alumno');
  try {
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

/** Ruta de inicio según el tipo de app instalada. */
export function getPwaStartPath(): string {
  const role = getPwaRole();
  if (role === 'alumno') {
    const { modo, sucursalId } = getAlumnoPortalContext();
    const q = new URLSearchParams({ modo: modo || 'recuperar', portal: 'alumno' });
    if (sucursalId) q.set('sucursalId', sucursalId);
    return `/mi-clase?${q.toString()}`;
  }
  if (role === 'estudio' || hasEstudioSession()) {
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
