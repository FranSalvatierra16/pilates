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
  AlertCircle,
  Menu,
  X
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
  const [menuOpen, setMenuOpen] = useState(false);

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
      <nav className="bg-white/95 backdrop-blur-sm shadow-lg border-b border-primary-200 safe-top">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between min-h-16 h-16 items-center">
            <div className="flex items-center gap-2">
              {/* Botón menú móvil: abre panel lateral */}
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="sm:hidden p-2 -ml-2 rounded-lg text-gray-600 hover:bg-gray-100 touch-manipulation"
                aria-label="Abrir menú"
              >
                <Menu className="w-6 h-6" />
              </button>
              <div className="flex-shrink-0 flex items-center">
                <Link to="/dashboard" className="flex items-center gap-3 hover:opacity-90 transition-opacity" onClick={() => setMenuOpen(false)}>
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
      </nav>

      {/* Panel lateral móvil */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 sm:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            className="fixed inset-y-0 left-0 z-50 w-[min(280px,85vw)] bg-white shadow-xl flex flex-col sm:hidden drawer-panel"
            role="dialog"
            aria-label="Menú de navegación"
          >
            <div className="flex items-center justify-between pt-6 pb-4 px-5 border-b border-gray-200 safe-top">
              <span className="text-lg font-semibold text-gray-900">
                {sucursalNombre || 'SAVIA Pilates'}
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 touch-manipulation"
                aria-label="Cerrar menú"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-5 px-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-4 px-4 py-3.5 mx-1 rounded-xl text-[15px] font-medium touch-manipulation ${
                      isActive
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-6 h-6 flex-shrink-0 text-gray-500" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="p-4 pt-3 border-t border-gray-200">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  handleLogout();
                }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50 font-medium touch-manipulation"
              >
                <LogOut className="w-5 h-5" />
                Salir
              </button>
            </div>
          </div>
        </>
      )}

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-5 pb-4 sm:pt-8 sm:pb-8 w-full max-w-[100vw] overflow-x-hidden min-w-0">
        <div className="relative min-h-0 w-full min-w-0">
          {children}
        </div>
      </main>

      {!useApi() && (
        <div className="fixed bottom-2 left-2 right-2 sm:left-auto sm:right-4 sm:max-w-xs text-center text-xs text-amber-800 bg-amber-100/95 px-3 py-2 rounded-lg shadow bottom-safe safe-bottom">
          ⚠️ Modo local: los datos solo se guardan en este navegador. En Railway agregá VITE_USE_API=true y hacé un nuevo deploy.
        </div>
      )}

      {useApi() && dbStatus !== 'checking' && dbStatus === 'disconnected' && (
        <div className="fixed bottom-2 left-2 right-2 sm:left-auto sm:right-4 sm:max-w-xs flex items-center gap-2 px-3 py-2 rounded-lg shadow text-xs text-red-800 bg-red-100/95 bottom-safe safe-bottom">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Sin conexión a la base de datos. Revisá DATABASE_URL en Railway y los logs del servidor.</span>
        </div>
      )}
    </div>
  );
};

export default Layout;

