import { useEffect } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LogOut, Building2 } from 'lucide-react';

export default function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  // En /admin evitamos el caché de la PWA: si hay Service Worker, lo quitamos y recargamos
  // para que siempre cargues la versión recién desplegada en Railway.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return;
    navigator.serviceWorker.getRegistrations().then((regs) => {
      if (regs.length > 0) {
        regs.forEach((r) => r.unregister());
        window.location.reload();
      }
    });
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen">
      <nav className="bg-slate-800 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center gap-4">
              <Link to="/admin" className="flex items-center gap-2 font-semibold text-lg">
                <Building2 className="w-6 h-6" />
                Panel Admin
              </Link>
              <Link
                to="/admin"
                className="text-slate-300 hover:text-white text-sm font-medium"
              >
                Sucursales
              </Link>
            </div>
            <div className="flex items-center">
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Salir
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
