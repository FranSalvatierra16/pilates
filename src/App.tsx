import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Calendario from './pages/Calendario';
import Alumnos from './pages/Alumnos';
import Profesores from './pages/Profesores';
import Actividades from './pages/Actividades';
import Acceso from './pages/Acceso';
import Pagos from './pages/Pagos';
import Caja from './pages/Caja';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout>
                  <Navigate to="/dashboard" replace />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendario"
            element={
              <ProtectedRoute>
                <Layout>
                  <Calendario />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/alumnos"
            element={
              <ProtectedRoute>
                <Layout>
                  <Alumnos />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profesores"
            element={
              <ProtectedRoute>
                <Layout>
                  <Profesores />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/actividades"
            element={
              <ProtectedRoute>
                <Layout>
                  <Actividades />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/acceso"
            element={
              <ProtectedRoute>
                <Layout>
                  <Acceso />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/pagos"
            element={
              <ProtectedRoute>
                <Layout>
                  <Pagos />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/caja"
            element={
              <ProtectedRoute>
                <Layout>
                  <Caja />
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

