import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  FileText,
  LogOut,
  GraduationCap,
  AlertCircle,
  Menu,
  X,
  Bell,
  BookOpen,
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
  const { logout, sucursalNombre, fotoPerfil, refreshPlanificacionFlag } = useAuth();

  useEffect(() => {
    void refreshPlanificacionFlag();
  }, [refreshPlanificacionFlag]);
  const navigate = useNavigate();
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notificaciones, setNotificaciones] = useState<NotificacionItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number; left?: number } | null>(null);

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
      const target = e.target as Node;
      if (notifRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setNotifOpen(false);
    };
    if (notifOpen) {
      document.addEventListener('click', onDocClick);
      return () => document.removeEventListener('click', onDocClick);
    }
  }, [notifOpen]);

  useLayoutEffect(() => {
    if (!notifOpen || !notifRef.current) {
      if (!notifOpen) setDropdownPosition(null);
      return;
    }
    const updatePos = () => {
      if (!notifRef.current) return;
      const rect = notifRef.current.getBoundingClientRect();
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
      if (isMobile) {
        setDropdownPosition({ top: rect.bottom + 6, left: 12, right: 12 });
      } else {
        setDropdownPosition({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
      }
    };
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [notifOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const noLeidasCount = notificaciones.filter((n) => !n.leido).length;

  const marcarTodasLeidas = () => {
    if (!useApi() || noLeidasCount === 0) return;
    const token = localStorage.getItem('savia_token');
    fetch(getApiBase() + '/api/notificaciones/marcar-leidas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ todas: true }),
    })
      .then((r) => r.ok && fetchNotificaciones(false))
      .catch(() => {});
  };

  const navItems = useMemo(() => {
    const base: Array<{ path: string; label: string; icon: typeof LayoutDashboard }> = [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/calendario', label: 'Calendario', icon: Calendar },
      { path: '/alumnos', label: 'Alumnos', icon: Users },
      { path: '/profesores', label: 'Profesores', icon: GraduationCap },
      { path: '/actividades', label: 'Actividades', icon: Activity },
    ];
    base.push(
      { path: '/acceso', label: 'Acceso', icon: DoorOpen },
      { path: '/pagos', label: 'Pagos', icon: CreditCard },
      { path: '/caja', label: 'Caja', icon: Wallet },
      { path: '/agenda', label: 'Agenda', icon: FileText },
      { path: '/notificaciones', label: 'Notif.', icon: Bell }
    );
    return base;
  }, []);

  return (
    <div className="min-h-screen min-h-dvh flex flex-col">
      <nav className="relative z-40 flex-shrink-0 bg-white/95 backdrop-blur-sm shadow-lg border-b border-primary-200 safe-top">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between min-h-16 py-3 items-center gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
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
              <div className="hidden sm:ml-2 sm:flex sm:min-w-0 sm:flex-1 sm:overflow-x-auto">
                <div className="flex items-center flex-nowrap gap-x-1 sm:gap-x-2">
                  {navItems.filter((item) => item.path !== '/notificaciones').map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`inline-flex items-center flex-shrink-0 px-2 py-1 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                          isActive
                            ? 'bg-primary-50 text-primary-600'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="w-4 h-4 mr-1.5 flex-shrink-0" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {useApi() && (
                <div className="relative" ref={notifRef}>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !notifOpen;
                      if (next && notifRef.current) {
                        const rect = notifRef.current.getBoundingClientRect();
                        const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
                        if (isMobile) {
                          setDropdownPosition({ top: rect.bottom + 6, left: 12, right: 12 });
                        } else {
                          setDropdownPosition({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
                        }
                      }
                      if (!next) setDropdownPosition(null);
                      setNotifOpen(next);
                    }}
                    className="relative p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                    aria-label="Notificaciones"
                  >
                    <Bell className="w-5 h-5" />
                    {noLeidasCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary-500 text-white text-xs font-medium px-1">
                        {noLeidasCount > 99 ? '99+' : noLeidasCount}
                      </span>
                    )}
                  </button>
                  {notifOpen &&
                  dropdownPosition &&
                  createPortal(
                    <div
                      ref={dropdownRef}
                      className="bg-white rounded-xl shadow-2xl border border-gray-200 py-0 flex flex-col max-h-[min(85vh,420px)] min-w-0"
                      style={{
                        position: 'fixed',
                        top: dropdownPosition.top,
                        ...(dropdownPosition.left !== undefined
                          ? { left: dropdownPosition.left, right: dropdownPosition.right }
                          : { right: dropdownPosition.right, width: 380, maxWidth: 'calc(100vw - 24px)' }),
                        zIndex: 99999,
                      }}
                    >
                      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-2 min-w-0 flex-wrap">
                        <span className="font-semibold text-gray-800 min-w-0 truncate">Notificaciones</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {noLeidasCount > 0 && (
                            <button
                              type="button"
                              onClick={() => { marcarTodasLeidas(); setNotifOpen(false); }}
                              className="text-xs text-primary-600 hover:underline whitespace-nowrap touch-manipulation"
                            >
                              Marcar leídas
                            </button>
                          )}
                          <Link
                            to="/notificaciones"
                            onClick={() => setNotifOpen(false)}
                            className="text-sm font-medium text-primary-600 hover:underline touch-manipulation"
                          >
                            Ver todas
                          </Link>
                        </div>
                      </div>
                      <div
                        className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 overscroll-contain py-1"
                        style={{ WebkitOverflowScrolling: 'touch' }}
                      >
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
                              className={`px-4 py-2.5 border-b border-gray-50 last:border-0 text-left min-w-0 ${!n.leido ? 'bg-primary-50/50' : ''}`}
                            >
                              <p className={`text-sm text-gray-800 min-w-0 break-words ${!n.leido ? 'font-medium' : ''}`}>
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
                    </div>,
                    document.body
                  )}
                </div>
              )}
              <a
                href="/docs/MANUAL-USO-APP.md"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded-md transition-colors"
                title="Manual de uso (se abre en una pestaña nueva)"
              >
                <BookOpen className="w-4 h-4" />
                Manual
              </a>
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
            <div className="p-4 pt-3 border-t border-gray-200 space-y-1">
              <a
                href="/docs/MANUAL-USO-APP.md"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-primary-600 hover:bg-primary-50 font-medium touch-manipulation"
              >
                <BookOpen className="w-5 h-5" />
                Manual de uso
              </a>
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

      <main className="flex-1 min-h-0 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-5 pb-6 sm:pt-8 sm:pb-8 safe-bottom max-w-[100vw] overflow-x-hidden min-w-0 bg-white rounded-t-xl sm:rounded-xl shadow-sm border border-gray-100 border-b-0 sm:border-b">
        <div className="relative min-h-0 w-full min-w-0 h-full">
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

