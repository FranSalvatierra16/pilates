import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';

const getApiBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const useApi = () => {
  if (import.meta.env.VITE_USE_API === 'false') return false;
  if (import.meta.env.VITE_USE_API === 'true') return true;
  return import.meta.env.PROD;
};

export interface NotificacionItem {
  id: string | number;
  tipo: 'inscribio' | 'liberar';
  leido?: boolean;
  alumnoNombre: string;
  turnoDia: string;
  turnoHora: string;
  turnoTitulo: string;
  createdAt: string;
}

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    const hoy = new Date();
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    const esHoy = d.toDateString() === hoy.toDateString();
    const esAyer = d.toDateString() === ayer.toDateString();
    const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    if (esHoy) return `Hoy ${time}`;
    if (esAyer) return `Ayer ${time}`;
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function Notificaciones() {
  const [list, setList] = useState<NotificacionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!useApi()) {
      setLoading(false);
      setError('Las notificaciones requieren conexión al servidor.');
      return;
    }
    const token = localStorage.getItem('savia_token');
    fetch(getApiBase() + '/api/notificaciones', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error('Error al cargar notificaciones');
        return r.json();
      })
      .then((data) => {
        setList(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((e) => {
        setError(e.message || 'Error de conexión');
        setList([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const texto = (n: NotificacionItem) =>
    n.tipo === 'inscribio'
      ? `${n.alumnoNombre} se anotó en ${n.turnoDia} ${n.turnoHora} - ${n.turnoTitulo}`
      : `${n.alumnoNombre} liberó cupo en ${n.turnoDia} ${n.turnoHora} - ${n.turnoTitulo}`;

  const marcarTodasLeidas = () => {
    if (!useApi()) return;
    const token = localStorage.getItem('savia_token');
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    fetch(getApiBase() + '/api/notificaciones/marcar-leidas', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ todas: true }),
    })
      .then((r) => {
        if (!r.ok) return;
        return fetch(getApiBase() + '/api/notificaciones', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) setList(data);
      })
      .catch(() => {});
  };

  const noLeidasCount = list.filter((n) => !n.leido).length;

  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto">
      {/* Encabezado: en móvil apilado, botón bien visible */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-primary-100 text-primary-600 flex-shrink-0">
            <Bell className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="page-title text-xl sm:text-2xl font-semibold text-gray-800 truncate">Notificaciones</h1>
            <p className="text-sm text-gray-500">Anotaciones y liberaciones de cupo</p>
          </div>
        </div>
        {list.length > 0 && noLeidasCount > 0 && (
          <button
            type="button"
            onClick={marcarTodasLeidas}
            className="w-full sm:w-auto btn-secondary text-sm py-2.5 touch-manipulation"
          >
            Marcar todas como leídas
          </button>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && list.length === 0 && (
        <div className="rounded-xl bg-gray-50 border border-gray-200 text-gray-600 px-4 py-8 text-center text-sm sm:text-base">
          No hay notificaciones todavía. Cuando alguien se anote o libere cupo desde el link de clases, aparecerán aquí.
        </div>
      )}

      {!loading && !error && list.length > 0 && (
        <ul className="space-y-3 sm:space-y-2 list-none p-0 m-0">
          {list.map((n) => (
            <li
              key={n.id}
              className={`flex flex-col gap-2 p-4 rounded-xl border shadow-sm min-w-0 ${
                n.leido ? 'bg-gray-50 border-gray-200' : 'bg-white border-primary-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3 min-w-0">
                <p className={`text-sm sm:text-base text-gray-800 min-w-0 flex-1 ${!n.leido ? 'font-semibold' : ''}`}>
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {!n.leido && (
                      <span className="inline-block w-2 h-2 rounded-full bg-primary-500 flex-shrink-0 mt-1.5" aria-hidden />
                    )}
                    <span className="break-words">
                      {n.tipo === 'inscribio' ? (
                        <span className="text-green-600 font-medium">Se anotó:</span>
                      ) : (
                        <span className="text-amber-600 font-medium">Liberó cupo:</span>
                      )}{' '}
                      {texto(n)}
                    </span>
                  </span>
                </p>
                <span className="text-xs sm:text-sm text-gray-500 flex-shrink-0 whitespace-nowrap ml-2" title={n.createdAt}>
                  {formatFecha(n.createdAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
