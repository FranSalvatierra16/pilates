import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  Activity, 
  DoorOpen, 
  CreditCard, 
  Wallet,
  Calendar,
  LogOut,
  GraduationCap,
  Database,
  AlertCircle
} from 'lucide-react';

const getApiBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const useApi = () => {
  if (import.meta.env.VITE_USE_API === 'false') return false;
  if (import.meta.env.VITE_USE_API === 'true') return true;
  return import.meta.env.PROD;
};

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const { logout, sucursalNombre, fotoPerfil } = useAuth();
  const navigate = useNavigate();
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  useEffect(() => {
    if (!useApi()) {
      setDbStatus('disconnected');
      return;
    }
    fetch(getApiBase() + '/api/health')
      .then((r) => r.json())
      .then((d) => setDbStatus(d.db ? 'connected' : 'disconnected'))
      .catch(() => setDbStatus('disconnected'));
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/calendario', label: 'Calendario', icon: Calendar },
    { path: '/alumnos', label: 'Alumnos', icon: Users },
    // { path: '/registros-link', label: 'Registros por link', icon: Link2 },
    { path: '/profesores', label: 'Profesores', icon: GraduationCap },
    { path: '/actividades', label: 'Actividades', icon: Activity },
    { path: '/acceso', label: 'Control de Acceso', icon: DoorOpen },
    { path: '/pagos', label: 'Pagos', icon: CreditCard },
    { path: '/caja', label: 'Caja', icon: Wallet },
  ];

  return (
    <div className="min-h-screen">
      <nav className="bg-white/95 backdrop-blur-sm shadow-lg border-b border-primary-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Link to="/dashboard" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/80 flex items-center justify-center border border-primary-100">
                    {fotoPerfil ? (
                      <img
                        src={fotoPerfil}
                        alt={sucursalNombre || 'Sucursal'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src="/savia.png"
                        alt={sucursalNombre || 'SAVIA Pilates'}
                        className="h-10 w-auto object-contain"
                      />
                    )}
                  </div>
                  <span className="font-semibold text-gray-800 hidden sm:block">
                    {sucursalNombre || 'SAVIA Pilates'}
                  </span>
                </Link>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'border-primary-500 text-primary-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center">
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>
        </div>
        
        {/* Mobile menu */}
        <div className="sm:hidden">
          <div className="pt-2 pb-3 space-y-1 overflow-x-auto">
            <div className="flex space-x-2 px-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap ${
                      isActive
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="relative">
          {children}
        </div>
      </main>

      {!useApi() && (
        <div className="fixed bottom-2 left-2 right-2 sm:left-auto sm:right-4 sm:max-w-xs text-center text-xs text-amber-800 bg-amber-100/95 px-3 py-2 rounded-lg shadow">
          ⚠️ Modo local: los datos solo se guardan en este navegador. En Railway agregá VITE_USE_API=true y hacé un nuevo deploy.
        </div>
      )}

      {useApi() && dbStatus !== 'checking' && (
        <div
          className={`fixed bottom-2 left-2 right-2 sm:left-auto sm:right-4 sm:max-w-xs flex items-center gap-2 px-3 py-2 rounded-lg shadow text-xs ${
            dbStatus === 'connected'
              ? 'text-green-800 bg-green-100/95'
              : 'text-red-800 bg-red-100/95'
          }`}
        >
          {dbStatus === 'connected' ? (
            <>
              <Database className="w-4 h-4 flex-shrink-0" />
              <span>Base de datos conectada. Los datos se sincronizan en todos los dispositivos.</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Sin conexión a la base de datos. Revisá DATABASE_URL en Railway y los logs del servidor.</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Layout;

