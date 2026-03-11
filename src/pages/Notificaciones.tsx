import { useState, useEffect } from 'react';
import { Bell, Smartphone } from 'lucide-react';

const getApiBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const useApi = () => {
  if (import.meta.env.VITE_USE_API === 'false') return false;
  if (import.meta.env.VITE_USE_API === 'true') return true;
  return import.meta.env.PROD;
};

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

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
  const [pushStatus, setPushStatus] = useState<'idle' | 'loading' | 'ok' | 'denied' | 'unsupported' | 'error'>('idle');
  const [pushMessage, setPushMessage] = useState<string>('');
  const [pushConfig, setPushConfig] = useState<{ configured: boolean; subscriptionsCount: number } | null>(null);

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

  useEffect(() => {
    if (!useApi()) return;
    const token = localStorage.getItem('savia_token');
    fetch(getApiBase() + '/api/push-status', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setPushConfig({ configured: data.configured, subscriptionsCount: data.subscriptionsCount || 0 }))
      .catch(() => {});
  }, [pushStatus]);

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

  const activarPush = async () => {
    if (!useApi() || !('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushStatus('unsupported');
      setPushMessage('Tu navegador no soporta notificaciones push.');
      return;
    }
    setPushStatus('loading');
    setPushMessage('');
    try {
      if (Notification.permission === 'denied') {
        setPushStatus('denied');
        setPushMessage('Bloqueaste las notificaciones. Activálas en la configuración del navegador o del celular.');
        return;
      }
      const token = localStorage.getItem('savia_token');
      const vapidRes = await fetch(getApiBase() + '/api/push-vapid-public', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!vapidRes.ok) {
        setPushStatus('error');
        setPushMessage('El servidor no tiene notificaciones push configuradas. En Railway → Variables agregá VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY (generalas con: npx web-push generate-vapid-keys).');
        setPushConfig((c) => (c ? { ...c, configured: false } : null));
        return;
      }
      const { vapidPublicKey } = await vapidRes.json();
      if (!vapidPublicKey) {
        setPushStatus('error');
        setPushMessage('Faltan las claves VAPID en el servidor.');
        return;
      }
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('denied');
        setPushMessage('Se necesitan permisos para enviar notificaciones al celular.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
      const subscribeRes = await fetch(getApiBase() + '/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!subscribeRes.ok) {
        setPushStatus('error');
        setPushMessage('No se pudo registrar el dispositivo.');
        return;
      }
      setPushStatus('ok');
      setPushMessage('Listo: cuando alguien se anote o libere cupo, te llegará una notificación al celular.');
      setPushConfig((c) => (c ? { ...c, subscriptionsCount: c.subscriptionsCount + 1 } : { configured: true, subscriptionsCount: 1 }));
    } catch (e) {
      setPushStatus('error');
      setPushMessage(e instanceof Error ? e.message : 'Error al activar.');
    }
  };

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

      {/* Activar notificaciones en el celular */}
      {useApi() && (
        <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary-100 text-primary-600 flex-shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-800">Recibir notificaciones en el celular</h3>
              <p className="text-sm text-gray-600 mt-0.5">
                Cuando un alumno se anote o libere cupo en una clase, te llegará una notificación al celular (aunque no tengas la app abierta).
              </p>
              {pushConfig && (
                <p className="text-sm mt-2 text-gray-700">
                  {!pushConfig.configured ? (
                    <span className="text-amber-700">
                      Para que lleguen al celular, en Railway → Variables agregá <strong>VAPID_PUBLIC_KEY</strong> y <strong>VAPID_PRIVATE_KEY</strong>. Generalas con: <code className="bg-gray-200 px-1 rounded">npx web-push generate-vapid-keys</code>
                    </span>
                  ) : pushConfig.subscriptionsCount === 0 ? (
                    'Activá las notificaciones en el dispositivo donde querés recibirlas (botón abajo).'
                  ) : (
                    <span className="text-green-700">
                      Tenés {pushConfig.subscriptionsCount} dispositivo(s) registrado(s). Las notificaciones se envían cuando alguien se anote o libere cupo.
                    </span>
                  )}
                </p>
              )}
              {pushMessage && (
                <p className={`text-sm mt-2 ${pushStatus === 'ok' ? 'text-green-700' : pushStatus === 'denied' || pushStatus === 'error' ? 'text-amber-700' : 'text-gray-600'}`}>
                  {pushMessage}
                </p>
              )}
              {pushStatus !== 'ok' && pushStatus !== 'unsupported' && (
                <button
                  type="button"
                  onClick={activarPush}
                  disabled={pushStatus === 'loading'}
                  className="mt-3 btn-primary text-sm py-2 touch-manipulation"
                >
                  {pushStatus === 'loading' ? 'Activando…' : 'Activar notificaciones en este dispositivo'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
