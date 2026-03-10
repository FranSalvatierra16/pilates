import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';

const getApiBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const useApi = () => {
  if (import.meta.env.VITE_USE_API === 'false') return false;
  if (import.meta.env.VITE_USE_API === 'true') return true;
  return import.meta.env.PROD;
};

export interface NotificacionItem {
  id: number;
  tipo: 'inscribio' | 'liberar';
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary-100 text-primary-600">
          <Bell className="w-6 h-6" />
        </div>
        <div>
          <h1 className="page-title text-2xl font-semibold text-gray-800">Notificaciones</h1>
          <p className="text-sm text-gray-500">Anotaciones y liberaciones de cupo en las clases</p>
        </div>
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
        <div className="rounded-xl bg-gray-50 border border-gray-200 text-gray-600 px-4 py-8 text-center">
          No hay notificaciones todavía. Cuando alguien se anote o libere cupo desde el link de clases, aparecerán aquí.
        </div>
      )}

      {!loading && !error && list.length > 0 && (
        <ul className="space-y-2">
          {list.map((n) => (
            <li
              key={n.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-4 rounded-xl bg-white border border-gray-200 shadow-sm"
            >
              <p className="text-gray-800">
                {n.tipo === 'inscribio' ? (
                  <span className="text-green-600 font-medium">Se anotó:</span>
                ) : (
                  <span className="text-amber-600 font-medium">Liberó cupo:</span>
                )}{' '}
                {texto(n)}
              </p>
              <span className="text-xs text-gray-500 sm:flex-shrink-0">{formatFecha(n.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
