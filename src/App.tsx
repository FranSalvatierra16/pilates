import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import { ToastProvider } from './components/ToastProvider';
import { ArrowRight, Building2, UserRound } from 'lucide-react';
import {
  buildManifestHref,
  getAlumnoPortalContext,
  getPwaRole,
  getPwaStartPath,
  isPwaStandalone,
  setAlumnoPortalContext,
  setPwaRole,
} from './utils/pwa-role';

const APP_NAME_FALLBACK = import.meta.env.VITE_APP_NAME || 'FITGEST';

function DocumentTitle() {
  const { isAuthenticated, sucursalId, sucursalNombre } = useAuth();
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const appleTouch = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');

    // En rutas de estudio (logueado) forzar manifest de gestión.
    // El portal alumno setea su propio manifest en MiClase.
    if (isAuthenticated) {
      setPwaRole('estudio');
      const manifestHref = buildManifestHref({
        portal: 'estudio',
        sucursalId,
        brand: sucursalId ? undefined : 'fitgest',
      });
      const iconHref = sucursalId
        ? `/api/public/sucursal-logo/${encodeURIComponent(sucursalId)}`
        : '/fitgest.png';

      if (link) link.href = manifestHref;
      if (appleTouch) appleTouch.href = iconHref;
      if (favicon) favicon.href = iconHref;

      if (sucursalNombre) {
        document.title = `${sucursalNombre} - Sistema de Gestión`;
        if (appleTitle) appleTitle.content = sucursalNombre;
      } else {
        document.title =
          APP_NAME_FALLBACK === 'Sistema de Gestión'
            ? APP_NAME_FALLBACK
            : `${APP_NAME_FALLBACK} - Sistema de Gestión`;
        if (appleTitle) appleTitle.content = APP_NAME_FALLBACK;
      }
      return;
    }

    document.title =
      APP_NAME_FALLBACK === 'Sistema de Gestión'
        ? APP_NAME_FALLBACK
        : `${APP_NAME_FALLBACK} - Sistema de Gestión`;
    if (appleTitle) appleTitle.content = APP_NAME_FALLBACK;
  }, [isAuthenticated, sucursalId, sucursalNombre]);
  return null;
}

function ShareBrandQuerySync() {
  const { isAuthenticated, isAdmin, sucursalId } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!isAuthenticated || isAdmin || !sucursalId || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('sucursalId') === sucursalId) return;
    url.searchParams.set('sucursalId', sucursalId);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [isAuthenticated, isAdmin, sucursalId, location.pathname, location.search, location.hash]);

  return null;
}
import Landing from './pages/Landing';
import Login from './pages/Login';
import RegistroLink from './pages/RegistroLink';
import MiClase from './pages/MiClase';
import Dashboard from './pages/Dashboard';
import Calendario from './pages/Calendario';
import Alumnos from './pages/Alumnos';
import Profesores from './pages/Profesores';
import Actividades from './pages/Actividades';
import Acceso from './pages/Acceso';
import Pagos from './pages/Pagos';
import Caja from './pages/Caja';
import Notificaciones from './pages/Notificaciones';
import Agenda from './pages/Agenda';
import Planificacion from './pages/Planificacion';
import AdminLayout from './pages/admin/AdminLayout';
import AdminSucursales from './pages/admin/AdminSucursales';
import AdminSucursalNueva from './pages/admin/AdminSucursalNueva';
import AdminSucursalEditar from './pages/admin/AdminSucursalEditar';
import ApiDocs from './pages/ApiDocs';

/** En Railway: `VITE_PUBLIC_SITE_MODE=landing` para publicar solo la landing (sin rutas de app). */
function isPublicLandingOnlySite() {
  const m = String(import.meta.env.VITE_PUBLIC_SITE_MODE || '')
    .trim()
    .toLowerCase();
  return m === 'landing' || m === 'marketing';
}

function isPwaStandaloneClient() {
  return isPwaStandalone();
}

/** En navegador normal: landing en /. En PWA instalada: inicio según alumno o estudio. */
function RootMarketingOrPwaEntry() {
  if (isPublicLandingOnlySite()) return <Landing />;
  if (isPwaStandaloneClient()) {
    return <Navigate to={getPwaStartPath()} replace />;
  }
  return <Landing />;
}

const ProtectedSucursalRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login?portal=estudio" replace />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  return <>{children}</>;
};

const ProtectedAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login?portal=estudio" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

function RootRedirect() {
  const { isAdmin } = useAuth();
  return <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />;
}

function EntrySelector() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) return <RootRedirect />;

  const params = new URLSearchParams(location.search);
  const portalParam = params.get('portal');

  // PWA / links con portal fijo: no mezclar inicios.
  if (portalParam === 'alumno' || params.get('modo') === 'recuperar') {
    const next = new URLSearchParams();
    next.set('modo', params.get('modo') || getAlumnoPortalContext().modo || 'recuperar');
    next.set('portal', 'alumno');
    const sid = params.get('sucursalId') || getAlumnoPortalContext().sucursalId;
    if (sid) next.set('sucursalId', sid);
    const token = params.get('token');
    if (token) next.set('token', token);
    return <Navigate to={`/mi-clase?${next.toString()}`} replace />;
  }
  if (portalParam === 'estudio') {
    return <Navigate to="/login?portal=estudio" replace />;
  }

  // App ya instalada como alumno/estudio: ir al inicio correcto (nunca mostrar el chooser).
  if (isPwaStandalone()) {
    let role = getPwaRole();
    // Compat: instalaciones que solo dejaron el flag viejo
    if (!role) {
      try {
        if (localStorage.getItem('fitgest_portal_alumno') === '1') {
          setAlumnoPortalContext(getAlumnoPortalContext());
          role = 'alumno';
        }
      } catch {
        /* ignore */
      }
    }
    if (role === 'alumno' || role === 'estudio') {
      return <Navigate to={getPwaStartPath()} replace />;
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="mb-6 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        ← Volver al inicio
      </button>
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-6 sm:p-8 w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Elegí cómo querés entrar</h1>
          <p className="text-gray-600 text-sm sm:text-base mt-2">
            Cada uno puede instalar su propia app: el alumno solo ve recuperar; el estudio ve todo el sistema.
          </p>
        </div>

        <div className="grid gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => {
              setPwaRole('estudio');
              navigate('/login?portal=estudio');
            }}
            className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm hover:border-primary-300 hover:bg-primary-50 transition"
          >
            <div className="flex items-start gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-600">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold text-gray-900">Estudio / sucursal</p>
                <p className="text-sm text-gray-600 mt-1">
                  Login y sistema completo. Instalalo desde la pantalla de login.
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 mt-1" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setAlumnoPortalContext({ modo: 'recuperar' });
              navigate('/mi-clase?modo=recuperar&portal=alumno');
            }}
            className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm hover:border-primary-300 hover:bg-primary-50 transition"
          >
            <div className="flex items-start gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-600">
                <UserRound className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold text-gray-900">Alumno</p>
                <p className="text-sm text-gray-600 mt-1">
                  Solo Tu clase (recuperar / liberar). Instalalo desde ese link.
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 mt-1" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const landingOnly = isPublicLandingOnlySite();

  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <DocumentTitle />
          {!landingOnly && <ShareBrandQuerySync />}
          <Routes>
            <Route path="/docs/api" element={<ApiDocs />} />
            {landingOnly ? (
              <>
                <Route path="/" element={<Landing />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            ) : (
              <>
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<RegistroLink />} />
          <Route path="/mi-clase" element={<MiClase />} />
          <Route path="/" element={<RootMarketingOrPwaEntry />} />
          <Route path="/entrada" element={<EntrySelector />} />
          <Route
            path="/admin"
            element={
              <ProtectedAdminRoute>
                <AdminLayout />
              </ProtectedAdminRoute>
            }
          >
            <Route index element={<AdminSucursales />} />
            <Route path="sucursales/nueva" element={<AdminSucursalNueva />} />
            <Route path="sucursales/:id/editar" element={<AdminSucursalEditar />} />
          </Route>
          <Route
            path="/dashboard"
            element={
              <ProtectedSucursalRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedSucursalRoute>
            }
          />
          <Route
            path="/calendario"
            element={
              <ProtectedSucursalRoute>
                <Layout>
                  <Calendario />
                </Layout>
              </ProtectedSucursalRoute>
            }
          />
          <Route
            path="/alumnos"
            element={
              <ProtectedSucursalRoute>
                <Layout>
                  <Alumnos />
                </Layout>
              </ProtectedSucursalRoute>
            }
          />
          <Route
            path="/profesores"
            element={
              <ProtectedSucursalRoute>
                <Layout>
                  <Profesores />
                </Layout>
              </ProtectedSucursalRoute>
            }
          />
          <Route
            path="/actividades"
            element={
              <ProtectedSucursalRoute>
                <Layout>
                  <Actividades />
                </Layout>
              </ProtectedSucursalRoute>
            }
          />
          <Route
            path="/acceso"
            element={
              <ProtectedSucursalRoute>
                <Layout>
                  <Acceso />
                </Layout>
              </ProtectedSucursalRoute>
            }
          />
          <Route
            path="/pagos"
            element={
              <ProtectedSucursalRoute>
                <Layout>
                  <Pagos />
                </Layout>
              </ProtectedSucursalRoute>
            }
          />
          <Route
            path="/caja"
            element={
              <ProtectedSucursalRoute>
                <Layout>
                  <Caja />
                </Layout>
              </ProtectedSucursalRoute>
            }
          />
          <Route
            path="/notificaciones"
            element={
              <ProtectedSucursalRoute>
                <Layout>
                  <Notificaciones />
                </Layout>
              </ProtectedSucursalRoute>
            }
          />
          <Route
            path="/agenda"
            element={
              <ProtectedSucursalRoute>
                <Layout>
                  <Agenda />
                </Layout>
              </ProtectedSucursalRoute>
            }
          />
          <Route
            path="/planificacion"
            element={
              <ProtectedSucursalRoute>
                <Layout>
                  <Planificacion />
                </Layout>
              </ProtectedSucursalRoute>
            }
          />
              </>
            )}
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;

