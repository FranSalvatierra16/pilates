import { useState, useEffect, useRef } from 'react';
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
  X,
  Bell
} from 'lucide-react';
import type { NotificacionItem } from '../pages/Notificaciones';

const getApiBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const useApi = () => {
  if (import.meta.env.VITE_USE_API === 'false') return false;
  if (import.meta.env.VITE_USE_API === 'true') return true;
  return import.meta.env.PROD;
};

interface LayoutProps {
  children: React.ReactNode;
}

function formatNotifFecha(iso: string) {
  try {
    const d = new Date(iso);
    const hoy = new Date();
    const esHoy = d.toDateString() === hoy.toDateString();
    const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    return esHoy ? `Hoy ${time}` : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const { logout, sucursalNombre, fotoPerfil } = useAuth();
  const navigate = useNavigate();
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notificaciones, setNotificaciones] = useState<NotificacionItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

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

  const fetchNotificaciones = (showLoading = false) => {
    if (!useApi()) return;
    if (showLoading) setNotifLoading(true);
    const token = localStorage.getItem('savia_token');
    fetch(getApiBase() + '/api/notificaciones', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setNotificaciones(Array.isArray(data) ? data : []))
      .catch(() => setNotificaciones([]))
      .finally(() => showLoading && setNotifLoading(false));
  };

  useEffect(() => {
    fetchNotificaciones(false);
  }, []);

  useEffect(() => {
    if (notifOpen) fetchNotificaciones(true);
  }, [notifOpen]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    if (notifOpen) {
      document.addEventListener('click', onDocClick);
      return () => document.removeEventListener('click', onDocClick);
    }
  }, [notifOpen]);

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
    { path: '/notificaciones', label: 'Notificaciones', icon: Bell },
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
                        src={import.meta.env.VITE_APP_LOGO || '/savia.png'}
                        alt={sucursalNombre || 'Sistema de Gestión'}
                        className="h-10 w-auto object-contain"
                      />
                    )}
                  </div>
                  <span className="font-semibold text-gray-800 hidden sm:block">
                    {sucursalNombre || (import.meta.env.VITE_APP_NAME || 'Sistema de Gestión')}
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
            <div className="flex items-center gap-2">
              {useApi() && (
                <div className="relative" ref={notifRef}>
                  <button
                    type="button"
                    onClick={() => setNotifOpen((o) => !o)}
                    className="relative p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                    aria-label="Notificaciones"
                  >
                    <Bell className="w-5 h-5" />
                    {notificaciones.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary-500 text-white text-xs font-medium px-1">
                        {notificaciones.length > 99 ? '99+' : notificaciones.length}
                      </span>
                    )}
                  </button>
                  {notifOpen && (
                    <div className="absolute right-0 top-full mt-1 w-[min(360px,90vw)] bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50 max-h-[70vh] flex flex-col">
                      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                        <span className="font-medium text-gray-800">Notificaciones</span>
                        <Link
                          to="/notificaciones"
                          onClick={() => setNotifOpen(false)}
                          className="text-sm text-primary-600 hover:underline"
                        >
                          Ver todas
                        </Link>
                      </div>
                      <div className="overflow-y-auto">
                        {notifLoading && (
                          <div className="flex justify-center py-6">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
                          </div>
                        )}
                        {!notifLoading && notificaciones.length === 0 && (
                          <p className="text-sm text-gray-500 px-4 py-6 text-center">No hay notificaciones</p>
                        )}
                        {!notifLoading &&
                          notificaciones.slice(0, 10).map((n) => (
                            <div
                              key={n.id}
                              className="px-4 py-2.5 border-b border-gray-50 last:border-0 text-left"
                            >
                              <p className="text-sm text-gray-800">
                                {n.tipo === 'inscribio' ? (
                                  <span className="text-green-600 font-medium">Se anotó:</span>
                                ) : (
                                  <span className="text-amber-600 font-medium">Liberó cupo:</span>
                                )}{' '}
                                {n.alumnoNombre} — {n.turnoDia} {n.turnoHora} {n.turnoTitulo}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">{formatNotifFecha(n.createdAt)}</p>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
                {sucursalNombre || (import.meta.env.VITE_APP_NAME || 'Sistema de Gestión')}
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

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-5 pb-6 sm:pt-8 sm:pb-8 safe-bottom w-full max-w-[100vw] overflow-x-hidden min-w-0">
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

