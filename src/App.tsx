import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import { ToastProvider } from './components/ToastProvider';

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

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

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
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <RootRedirect />
              </ProtectedRoute>
            }
          />
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

