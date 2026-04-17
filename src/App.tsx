import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import { ToastProvider } from './components/ToastProvider';
import { ArrowRight, Building2, UserRound } from 'lucide-react';

const APP_NAME_FALLBACK = import.meta.env.VITE_APP_NAME || 'FITGEST';

function DocumentTitle() {
  const { isAuthenticated, sucursalId, sucursalNombre } = useAuth();
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const appleTouch = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const manifestHref = sucursalId
      ? `/api/manifest.webmanifest?sucursalId=${encodeURIComponent(sucursalId)}`
      : '/api/manifest.webmanifest?brand=fitgest';
    const iconHref = sucursalId
      ? `/api/public/sucursal-logo/${encodeURIComponent(sucursalId)}`
      : '/fitgest.png';

    if (link) link.href = manifestHref;
    if (appleTouch) appleTouch.href = iconHref;
    if (favicon) favicon.href = iconHref;

    if (isAuthenticated && sucursalNombre) {
      document.title = `${sucursalNombre} - Sistema de Gestión`;
      if (appleTitle) appleTitle.content = sucursalNombre;
    } else {
      document.title = APP_NAME_FALLBACK === 'Sistema de Gestión' ? APP_NAME_FALLBACK : `${APP_NAME_FALLBACK} - Sistema de Gestión`;
      if (appleTitle) appleTitle.content = APP_NAME_FALLBACK;
    }
  }, [isAuthenticated, sucursalId, sucursalNombre]);
  return null;
}
import Login from './pages/Login';
import RegistroLink from './pages/RegistroLink';
import MiClase from './pages/MiClase';
import Dashboard from './pages/Dashboard';
import Calendario from './pages/Calendario';
import Alumnos from './pages/Alumnos';
import RegistrosPorLink from './pages/RegistrosPorLink';
import Profesores from './pages/Profesores';
import Actividades from './pages/Actividades';
import Acceso from './pages/Acceso';
import Pagos from './pages/Pagos';
import Caja from './pages/Caja';
import Notificaciones from './pages/Notificaciones';
import Agenda from './pages/Agenda';
import AdminLayout from './pages/admin/AdminLayout';
import AdminSucursales from './pages/admin/AdminSucursales';
import AdminSucursalNueva from './pages/admin/AdminSucursalNueva';
import AdminSucursalEditar from './pages/admin/AdminSucursalEditar';

const ProtectedSucursalRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  return <>{children}</>;
};

const ProtectedAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

function RootRedirect() {
  const { isAdmin } = useAuth();
  return <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />;
}

function EntrySelector() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) return <RootRedirect />;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-6 sm:p-8 w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Elegí cómo querés entrar</h1>
          <p className="text-gray-600 text-sm sm:text-base mt-2">
            Entrá como estudio para administrar el sistema o como alumno para abrir `Tu clase`.
          </p>
        </div>

        <div className="grid gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm hover:border-primary-300 hover:bg-primary-50 transition"
          >
            <div className="flex items-start gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-600">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold text-gray-900">Estudio</p>
                <p className="text-sm text-gray-600 mt-1">Ingresá con tu usuario y contraseña para administrar el estudio.</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 mt-1" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate('/mi-clase?modo=recuperar')}
            className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm hover:border-primary-300 hover:bg-primary-50 transition"
          >
            <div className="flex items-start gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-600">
                <UserRound className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold text-gray-900">Alumno</p>
                <p className="text-sm text-gray-600 mt-1">Entrá a `Tu clase`, poné tu DNI y anotate en formato recuperación.</p>
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
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <DocumentTitle />
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<RegistroLink />} />
          <Route path="/mi-clase" element={<MiClase />} />
          <Route path="/" element={<EntrySelector />} />
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
            path="/registros-link"
            element={
              <ProtectedSucursalRoute>
                <Layout>
                  <RegistrosPorLink />
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
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;

