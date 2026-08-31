import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { LogIn, AlertCircle, ArrowLeft } from 'lucide-react';
import InstallAppHint from '../components/InstallAppHint';
import {
  adoptEstudioPwa,
  buildManifestHref,
  getPwaStartPath,
  isAlumnoPwa,
  isPwaStandalone,
  setPwaRole,
} from '../utils/pwa-role';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, isAuthenticated, isAdmin, sucursalId } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const esAppAlumno = isAlumnoPwa() && searchParams.get('portal') !== 'estudio';
  const portalEstudio = searchParams.get('portal') === 'estudio' || isPwaStandalone();

  useEffect(() => {
    if (esAppAlumno) return;
    setPwaRole('estudio');
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const sid = sucursalId || searchParams.get('sucursalId') || '';
    if (link) {
      link.href = buildManifestHref({
        portal: 'estudio',
        sucursalId: sid || null,
        brand: sid ? undefined : 'fitgest',
      });
    }
    if (appleTitle) appleTitle.content = 'Gestión';
    document.title = 'Iniciar sesión · Estudio';
  }, [searchParams, sucursalId, esAppAlumno]);

  // Si este dispositivo es la app del alumno, no mostrar login del estudio.
  if (esAppAlumno) {
    return <Navigate to={getPwaStartPath()} replace />;
  }

  if (isAuthenticated) {
    return <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const result = await login(username, password);
    if ('role' in result && result.role) {
      adoptEstudioPwa();
      navigate(result.role === 'admin' ? '/admin' : '/dashboard');
    } else {
      setError('error' in result ? result.error : 'Usuario o contraseña incorrectos');
    }
  };

  const esCuentaDesactivada = error && error.toLowerCase().includes('desactivada por falta de pago');

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-8 w-full max-w-md">
        {!portalEstudio && (
          <button
            type="button"
            onClick={() => navigate('/entrada')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 mb-5"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
        )}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary-100 text-primary-600 mb-4">
            <LogIn className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Iniciar sesión</h1>
          <p className="text-gray-600 text-sm">Estudio / sucursal — sistema completo</p>
        </div>

        <InstallAppHint variant="estudio" className="mb-5" />

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field w-full"
              placeholder="Ingresá tu usuario"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field w-full"
              placeholder="Ingresá tu contraseña"
              required
            />
          </div>

          {error && (
            <div
              className={`px-4 py-3 rounded-lg flex items-start gap-3 ${
                esCuentaDesactivada
                  ? 'bg-amber-50 border border-amber-300 text-amber-900'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <button type="submit" className="btn-primary w-full">
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
