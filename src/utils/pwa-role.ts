/** Rol de la PWA instalada: alumno (solo recuperar) o estudio (sistema completo). */
export type PwaRole = 'alumno' | 'estudio';

const ROLE_KEY = 'fitgest_pwa_role';
const ALUMNO_FLAG_KEY = 'fitgest_portal_alumno';
const ALUMNO_MODO_KEY = 'fitgest_portal_alumno_modo';
const ALUMNO_SUCURSAL_KEY = 'fitgest_portal_alumno_sucursal';
const TOKEN_KEY = 'savia_token';
const COOKIE_ALUMNO = 'fitgest_portal_alumno';

function setCookie(name: string, value: string, days = 400) {
  try {
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

function getCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function clearCookie(name: string) {
  try {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

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
    if (getCookie(COOKIE_ALUMNO) === '1') return true;
    if (getPwaRole() === 'alumno') return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Rutas del sistema de gestión (app estudio). */
export function isEstudioAppPath(pathname?: string, search?: string): boolean {
  if (typeof window === 'undefined' && pathname == null) return false;
  const path = pathname ?? window.location.pathname ?? '';
  const params = new URLSearchParams(search ?? (typeof window !== 'undefined' ? window.location.search : ''));
  if (params.get('portal') === 'estudio') return true;
  return (
    path.startsWith('/login') ||
    path.startsWith('/dashboard') ||
    path.startsWith('/calendario') ||
    path.startsWith('/alumnos') ||
    path.startsWith('/pagos') ||
    path.startsWith('/caja') ||
    path.startsWith('/agenda') ||
    path.startsWith('/notificaciones') ||
    path.startsWith('/planificacion') ||
    path.startsWith('/admin') ||
    path.startsWith('/profesores') ||
    path.startsWith('/actividades') ||
    path.startsWith('/acceso')
  );
}

/** Rutas / query del portal alumno. */
export function isAlumnoAppPath(pathname?: string, search?: string): boolean {
  if (typeof window === 'undefined' && pathname == null) return false;
  const path = pathname ?? window.location.pathname ?? '';
  const params = new URLSearchParams(search ?? (typeof window !== 'undefined' ? window.location.search : ''));
  return (
    path.startsWith('/mi-clase') ||
    params.get('portal') === 'alumno' ||
    params.get('modo') === 'recuperar'
  );
}

export function setPwaRole(role: PwaRole) {
  try {
    localStorage.setItem(ROLE_KEY, role);
    if (role === 'alumno') {
      localStorage.setItem(ALUMNO_FLAG_KEY, '1');
      setCookie(COOKIE_ALUMNO, '1');
    }
  } catch {
    /* ignore */
  }
}

/** Pasar a app de estudio de forma explícita (entrada Estudio, login ok, o sesión de sucursal). */
export function adoptEstudioPwa() {
  try {
    localStorage.setItem(ROLE_KEY, 'estudio');
    localStorage.removeItem(ALUMNO_FLAG_KEY);
    localStorage.removeItem(ALUMNO_MODO_KEY);
    localStorage.removeItem(ALUMNO_SUCURSAL_KEY);
    clearCookie(COOKIE_ALUMNO);
    clearCookie('fitgest_portal_alumno_sucursal');
    clearCookie('fitgest_portal_alumno_modo');
  } catch {
    /* ignore */
  }
}

export function setAlumnoPortalContext(opts: { modo?: string; sucursalId?: string }) {
  setPwaRole('alumno');
  try {
    localStorage.setItem(ALUMNO_FLAG_KEY, '1');
    setCookie(COOKIE_ALUMNO, '1');
    const modo = opts.modo || 'recuperar';
    localStorage.setItem(ALUMNO_MODO_KEY, modo);
    setCookie('fitgest_portal_alumno_modo', modo);
    if (opts.sucursalId?.trim()) {
      localStorage.setItem(ALUMNO_SUCURSAL_KEY, opts.sucursalId.trim());
      setCookie('fitgest_portal_alumno_sucursal', opts.sucursalId.trim());
    }
  } catch {
    /* ignore */
  }
}

export function getAlumnoPortalContext() {
  try {
    return {
      modo:
        localStorage.getItem(ALUMNO_MODO_KEY) ||
        getCookie('fitgest_portal_alumno_modo') ||
        'recuperar',
      sucursalId:
        localStorage.getItem(ALUMNO_SUCURSAL_KEY) ||
        getCookie('fitgest_portal_alumno_sucursal') ||
        '',
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

/**
 * En app instalada: la URL de apertura manda.
 * - /mi-clase → alumno
 * - /login?portal=estudio o rutas de gestión → estudio (aunque quede flag viejo de alumno)
 */
export function shouldForceAlumnoStandaloneRedirect(): boolean {
  if (!isPwaStandalone()) return false;
  if (isAlumnoAppPath()) return false;
  if (isEstudioAppPath()) return false;
  return isAlumnoPwa();
}

function alumnoStartPathFromContext(): string {
  const { modo, sucursalId } = getAlumnoPortalContext();
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const q = new URLSearchParams({
    modo: params?.get('modo') || modo || 'recuperar',
    portal: 'alumno',
  });
  const sid = params?.get('sucursalId') || sucursalId;
  if (sid) q.set('sucursalId', sid);
  const token = params?.get('token');
  if (token) q.set('token', token);
  return `/mi-clase?${q.toString()}`;
}

/** Ruta de inicio según el tipo de app / URL actual. */
export function getPwaStartPath(): string {
  if (isAlumnoAppPath()) return alumnoStartPathFromContext();
  if (isEstudioAppPath() || hasEstudioSession() || getPwaRole() === 'estudio') {
    return hasEstudioSession() ? '/dashboard' : '/login?portal=estudio';
  }
  if (isAlumnoPwa()) return alumnoStartPathFromContext();
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

/** Asegura el <link rel="manifest"> correcto antes de instalar. */
export function applyManifestLink(opts: {
  portal: PwaRole;
  sucursalId?: string | null;
  token?: string | null;
  modo?: string;
  brand?: string;
}) {
  if (typeof document === 'undefined') return;
  const href = buildManifestHref(opts);
  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement('link');
    link.id = 'app-manifest';
    link.rel = 'manifest';
    document.head.appendChild(link);
  }
  if (link.href !== new URL(href, window.location.origin).href) {
    link.href = href;
  }
}
