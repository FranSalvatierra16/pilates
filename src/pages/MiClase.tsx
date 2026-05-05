import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, UserPlus, UserMinus, Loader2, Bell, History, Sparkles, LogOut, ArrowLeft } from 'lucide-react';
import { DIAS_SEMANA } from '../types';
import { formatDate, getFechaFromSemanaYDia, getSemanaActual, getSemanaSiguiente, getRangoSemana, isCuotaPorVencer, isCuotaVenceHoy, isCuotaVencida } from '../utils/date';
import { useToast } from '../components/ToastProvider';

const getBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const useApi = () => {
  if (import.meta.env.VITE_USE_API === 'false') return false;
  if (import.meta.env.VITE_USE_API === 'true') return true;
  return import.meta.env.PROD;
};

type TurnoPortal = {
  id: string;
  diaSemana: number;
  hora: string;
  titulo: string;
  cupo: number;
  inscriptos: number;
  yaInscripto: boolean;
  esClaseFija?: boolean;
  claseLiberada?: boolean;
  liberacionId?: string;
  recuperacionId?: string;
  usaCredito?: boolean;
};

type HorariosPortal = {
  horaInicioManana: string;
  horaFinManana: string;
  horaInicioTarde: string;
  horaFinTarde: string;
  horariosNoDisponiblesPorDia?: Record<number, string[]>;
  /** Minutos antes del turno (0 = sin tope) */
  minutosAntesLiberarClase?: number;
  minutosAntesAnotarseClase?: number;
};

type PortalData = {
  alumno: {
    id: string;
    nombre: string;
    apellido: string;
    fechaVencimientoCuota?: string;
    clasesParaRecuperar: number;
    actividadNombre?: string;
  };
  turnos: TurnoPortal[];
  clasesFijas: { id: string; diaSemana: number; hora: string; titulo: string }[];
  historialAsistencias: {
    id: string;
    turnoId: string;
    semana: string;
    diaSemana: number;
    hora: string;
    titulo: string;
    fecha: string;
    estado: 'asistio' | 'no_asistio';
    createdAt: string;
  }[];
  sucursalId?: string;
  horarios?: HorariosPortal;
  modo?: 'fijo' | 'recuperar';
  semanaVista?: string;
  recuperacionStats?: {
    clasesPorSemana: number | null;
    clasesFijasSemana: number;
    recuperacionesSemana: number;
    clasesUsadasSemana: number;
    clasesParaRecuperar: number;
    clasesDisponiblesSemana: number | null;
  };
  /** Cierres excepcionales por fecha (feriado / horas cerradas) — misma semana que la vista del portal */
  cierresPorFecha?: Record<string, { cerrarTodo: boolean; horasCerradas: string[] }>;
};

type SucursalOption = { id: string; nombre_lugar: string };

const NOMBRE_DIA = [...DIAS_SEMANA, 'Domingo'];
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const horaToNum = (hora: string): number => {
  const [h] = hora.split(':').map(Number);
  return h ?? 0;
};

function textoPlazoMinutos(n: number): string {
  if (n <= 0) return 'sin tope';
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Formatea "07:00"-"12:00" como "7–12h" para etiquetas */
function formatRangoHorario(ini: string, fin: string): string {
  const a = horaToNum(ini);
  const b = horaToNum(fin);
  return `${a}–${b}h`;
}

function getDiaSemanaActualIndex() {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function getProximaClase(
  clases: { id: string; diaSemana: number; hora: string; titulo: string }[]
) {
  if (!clases.length) return null;
  const ahora = new Date();
  const hoyIndex = getDiaSemanaActualIndex();
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

  const candidatos = clases.map((clase) => {
    const [hora, minutos] = clase.hora.split(':').map(Number);
    const minutosClase = (hora || 0) * 60 + (minutos || 0);
    let diasHasta = (clase.diaSemana - hoyIndex + 7) % 7;
    if (diasHasta === 0 && minutosClase <= minutosAhora) diasHasta = 7;
    return { ...clase, diasHasta };
  });

  candidatos.sort((a, b) => a.diasHasta - b.diasHasta || horaToNum(a.hora) - horaToNum(b.hora));
  return candidatos[0] || null;
}

function elegirTurnoRepresentativo(actual: TurnoPortal, candidate: TurnoPortal): TurnoPortal {
  const prioridad = (turno: TurnoPortal) => {
    if (turno.yaInscripto) return 5;
    if (turno.esClaseFija && !turno.claseLiberada) return 4;
    if (turno.esClaseFija && turno.claseLiberada) return 3;
    return 1;
  };
  const prioridadActual = prioridad(actual);
  const prioridadCandidate = prioridad(candidate);
  if (prioridadCandidate !== prioridadActual) {
    return prioridadCandidate > prioridadActual ? candidate : actual;
  }
  if (candidate.inscriptos !== actual.inscriptos) {
    return candidate.inscriptos < actual.inscriptos ? candidate : actual;
  }
  if (candidate.cupo !== actual.cupo) {
    return candidate.cupo > actual.cupo ? candidate : actual;
  }
  return actual;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const fetchWithTimeout = (url: string, options: RequestInit = {}, ms = 15000): Promise<Response> => {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
};

type PortalAuth = { type: 'token'; token: string } | { type: 'dni'; dni: string; sucursalId: string };

const DEFAULT_HORARIOS: HorariosPortal = {
  horaInicioManana: '07:00',
  horaFinManana: '12:00',
  horaInicioTarde: '16:00',
  horaFinTarde: '21:00',
  horariosNoDisponiblesPorDia: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
};

const MiClase = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';
  const sucursalIdFromUrl = searchParams.get('sucursalId') || '';
  const notifTurnoId = searchParams.get('notifTurnoId') || '';
  const notifSemana = searchParams.get('notifSemana') || '';
  const promptTomarDesdeNotif = searchParams.get('promptTomar') === '1';
  const modoQuery = (searchParams.get('modo') || '').toLowerCase();
  const modoFromUrl = modoQuery === 'fijo' ? 'fijo' : 'recuperar';
  const semanaActualBase = getSemanaActual();
  const semanaSiguienteBase = getSemanaSiguiente(semanaActualBase);
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [portalAuth, setPortalAuth] = useState<PortalAuth | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [filtroDia, setFiltroDia] = useState<number | null>(null);
  const [filtroHorario, setFiltroHorario] = useState<'todos' | 'manana' | 'tarde'>('todos');
  const [seccionActiva, setSeccionActiva] = useState<'clases' | 'perfil'>('clases');
  const [dniInput, setDniInput] = useState('');
  const [sucursales, setSucursales] = useState<SucursalOption[]>([]);
  const [enviandoDni, setEnviandoDni] = useState(false);
  const [pushStatus, setPushStatus] = useState<'idle' | 'loading' | 'ok' | 'denied' | 'unsupported' | 'error'>('idle');
  const [pushMessage, setPushMessage] = useState('');
  /** Solo en modo recuperar: 'actual' | 'siguiente' para elegir semana */
  const [semanaElegida, setSemanaElegida] = useState<'actual' | 'siguiente'>(notifSemana === semanaSiguienteBase ? 'siguiente' : 'actual');
  const [cargandoSemana, setCargandoSemana] = useState(false);
  const prevSemanaElegida = useRef<'actual' | 'siguiente' | null>(null);
  const notifPromptHandledRef = useRef(false);

  useEffect(() => {
    if (tokenFromUrl.trim()) {
      let cancelled = false;
      (async () => {
        try {
          const base = getBase();
          let url = `${base}/api/alumno-portal?token=${encodeURIComponent(tokenFromUrl)}`;
          if (modoFromUrl === 'recuperar') {
            url += '&modo=recuperar';
            url += `&semana=${encodeURIComponent(semanaElegida === 'actual' ? getSemanaActual() : getSemanaSiguiente(getSemanaActual()))}`;
          }
          const res = await fetch(url);
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (!cancelled) setError(err.error || 'Link inválido o expirado.');
            if (!cancelled) setLoading(false);
            return;
          }
          const json = await res.json();
          if (!cancelled) {
            setData(json);
            setPortalAuth({ type: 'token', token: tokenFromUrl });
            setError('');
          }
        } catch (e) {
          if (!cancelled) setError('No se pudo cargar. Revisá tu conexión.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    } else {
      setLoading(false);
      setError('');
    }
  }, [tokenFromUrl, modoFromUrl, semanaElegida]);

  useEffect(() => {
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const appleTouch = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const sid = data?.sucursalId || sucursalIdFromUrl;
    const params = new URLSearchParams({ portal: 'alumno', modo: modoFromUrl });
    if (tokenFromUrl.trim()) params.set('token', tokenFromUrl.trim());
    else if (sid.trim()) params.set('sucursalId', sid.trim());
    const manifestHref = `/api/manifest.webmanifest?${params.toString()}`;
    const iconHref = sid.trim() ? `/api/public/sucursal-logo/${encodeURIComponent(sid.trim())}` : '/fitgest.png';

    if (manifestLink) manifestLink.href = manifestHref;
    if (appleTouch) appleTouch.href = iconHref;
    if (favicon) favicon.href = iconHref;
    if (appleTitle) appleTitle.content = 'Tu clase';
    document.title = 'Tu clase';
  }, [data?.sucursalId, modoFromUrl, sucursalIdFromUrl, tokenFromUrl]);

  const cargarPorDni = async (dni: string, sucursalIdElegida?: string) => {
    setEnviandoDni(true);
    setError('');
    try {
      const base = getBase();
      const sid = sucursalIdElegida?.trim() || sucursalIdFromUrl.trim();
      let url = `${base}/api/alumno-portal?dni=${encodeURIComponent(dni.trim())}`;
      if (sid) url += `&sucursalId=${encodeURIComponent(sid)}`;
      if (modoFromUrl === 'recuperar') {
        url += '&modo=recuperar';
        url += `&semana=${encodeURIComponent(semanaElegida === 'actual' ? getSemanaActual() : getSemanaSiguiente(getSemanaActual()))}`;
      }
      const res = await fetchWithTimeout(url);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 400 && json.sucursales?.length) {
          setSucursales(json.sucursales);
          setError(json.error || 'Elegí tu sede');
          return;
        }
        setError(json.error || 'No se pudo cargar.');
        return;
      }
      setData(json);
      setPortalAuth({ type: 'dni', dni: dni.trim(), sucursalId: json.sucursalId || sid || '' });
      setSucursales([]);
    } catch (e) {
      setError('No se pudo cargar. Revisá tu conexión.');
    } finally {
      setEnviandoDni(false);
    }
  };

  const recargarRecuperar = async () => {
    if (!portalAuth || !data || data.modo !== 'recuperar') return;
    setCargandoSemana(true);
    try {
      const base = getBase();
      const semana = semanaElegida === 'actual' ? getSemanaActual() : getSemanaSiguiente(getSemanaActual());
      let url: string;
      if (portalAuth.type === 'token') {
        url = `${base}/api/alumno-portal?token=${encodeURIComponent(portalAuth.token)}&modo=recuperar&semana=${encodeURIComponent(semana)}`;
      } else {
        url = `${base}/api/alumno-portal?dni=${encodeURIComponent(portalAuth.dni)}&sucursalId=${encodeURIComponent(portalAuth.sucursalId)}&modo=recuperar&semana=${encodeURIComponent(semana)}`;
      }
      const res = await fetch(url);
      const json = await res.json().catch(() => ({}));
      if (res.ok) setData(json);
    } finally {
      setCargandoSemana(false);
    }
  };

  useEffect(() => {
    if (!data || data.modo !== 'recuperar' || !portalAuth || portalAuth.type === 'token') return;
    if (prevSemanaElegida.current === null) {
      prevSemanaElegida.current = semanaElegida;
      return;
    }
    if (prevSemanaElegida.current === semanaElegida) return;
    prevSemanaElegida.current = semanaElegida;
    recargarRecuperar();
  }, [semanaElegida, data, portalAuth]);

  useEffect(() => {
    if (notifPromptHandledRef.current || !promptTomarDesdeNotif || !notifTurnoId || !data || !portalAuth) return;
    if (data.modo !== 'recuperar') return;
    if (notifSemana && data.semanaVista && notifSemana !== data.semanaVista) {
      if (notifSemana === semanaActualBase && semanaElegida !== 'actual') {
        setSemanaElegida('actual');
      } else if (notifSemana === semanaSiguienteBase && semanaElegida !== 'siguiente') {
        setSemanaElegida('siguiente');
      }
      return;
    }
    const target = data.turnos.find((t) => t.id === notifTurnoId);
    if (!target) return;
    notifPromptHandledRef.current = true;
    if (target.inscriptos >= target.cupo) {
      toast.error('Clase no disponible, ya fue ocupada.');
      return;
    }
    if (target.yaInscripto) {
      toast.info('Ya estás anotado en esta clase.');
      return;
    }
    setSeccionActiva('clases');
    setFiltroDia(target.diaSemana);
    void (async () => {
      const fechaClase = formatDate(getFechaFromSemanaYDia(data.semanaVista || notifSemana || semanaActualBase, target.diaSemana));
      const confirmo = await toast.confirm(
        `¿Deseás tomar la clase ${target.hora} del ${NOMBRE_DIA[target.diaSemana] ?? 'día'} ${fechaClase}?`,
        { title: 'Clase liberada', confirmText: 'Sí, tomar clase', cancelText: 'No ahora', tone: 'primary' }
      );
      if (!confirmo) return;
      await inscribir(target.id);
    })();
  }, [data, notifSemana, notifTurnoId, portalAuth, promptTomarDesdeNotif, semanaActualBase, semanaElegida, semanaSiguienteBase, toast]);

  const inscribir = async (turnoId: string) => {
    if (!portalAuth || !data) return;
    setActioning(turnoId);
    try {
      const base = getBase();
      const esRecuperar = data.modo === 'recuperar';
      const semana = data.semanaVista || getSemanaActual();
      const body = portalAuth.type === 'token'
        ? { token: portalAuth.token, turnoId, ...(esRecuperar && { semana }) }
        : { dni: portalAuth.dni, sucursalId: portalAuth.sucursalId, turnoId, ...(esRecuperar && { semana }) };
      const endpoint = esRecuperar ? '/api/alumno-portal/inscribir-recuperacion' : '/api/alumno-portal/inscribir';
      const res = await fetchWithTimeout(`${base}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof json.error === 'string' && json.error.toLowerCase().includes('cupo')
          ? 'Clase no disponible, ya fue ocupada.'
          : (json.error || 'No se pudo inscribir.');
        toast.error(msg);
        return;
      }
      if (esRecuperar && json.recuperacionId) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                turnos: prev.turnos.map((t) =>
                  t.id === turnoId ? { ...t, yaInscripto: true, inscriptos: t.inscriptos + 1, recuperacionId: json.recuperacionId } : t
                ),
              }
            : null
        );
        await recargarRecuperar();
      } else if (!esRecuperar) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                turnos: prev.turnos.map((t) =>
                  t.id === turnoId ? { ...t, yaInscripto: true, inscriptos: t.inscriptos + 1 } : t
                ),
              }
            : null
        );
      }
    } finally {
      setActioning(null);
    }
  };

  const liberar = async (turnoId: string, recuperacionId?: string) => {
    if (!portalAuth || !data) return;
    setActioning(turnoId);
    try {
      const base = getBase();
      const esRecuperar = data.modo === 'recuperar';
      const semana = data.semanaVista || getSemanaActual();
      const baseBody = portalAuth.type === 'token'
        ? { token: portalAuth.token }
        : { dni: portalAuth.dni, sucursalId: portalAuth.sucursalId };
      const body = esRecuperar
        ? { ...baseBody, ...(recuperacionId ? { recuperacionId } : { turnoId, semana }) }
        : { ...baseBody, turnoId };
      const endpoint = esRecuperar ? '/api/alumno-portal/liberar-recuperacion' : '/api/alumno-portal/liberar';
      const res = await fetchWithTimeout(`${base}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error || 'No se pudo liberar el cupo.');
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              turnos: prev.turnos.map((t) =>
                t.id === turnoId ? { ...t, yaInscripto: false, inscriptos: t.inscriptos - 1, recuperacionId: undefined } : t
              ),
            }
          : null
      );
      if (esRecuperar) {
        await recargarRecuperar();
      }
    } finally {
      setActioning(null);
    }
  };

  const liberarClaseSemana = async (turnoId: string) => {
    if (!portalAuth || !data) return;
    setActioning(turnoId);
    try {
      const base = getBase();
      const semana = data.semanaVista || getSemanaActual();
      const body = portalAuth.type === 'token'
        ? { token: portalAuth.token, turnoId, semana }
        : { dni: portalAuth.dni, sucursalId: portalAuth.sucursalId, turnoId, semana };
      const res = await fetchWithTimeout(`${base}/api/alumno-portal/liberar-clase-semana`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'No se pudo liberar la clase.');
        return;
      }
      await recargarRecuperar();
    } finally {
      setActioning(null);
    }
  };

  const restaurarClaseSemana = async (turnoId: string, liberacionId?: string) => {
    if (!portalAuth || !data) return;
    setActioning(turnoId);
    try {
      const base = getBase();
      const semana = data.semanaVista || getSemanaActual();
      const body = portalAuth.type === 'token'
        ? { token: portalAuth.token, turnoId, semana, liberacionId }
        : { dni: portalAuth.dni, sucursalId: portalAuth.sucursalId, turnoId, semana, liberacionId };
      const res = await fetchWithTimeout(`${base}/api/alumno-portal/restaurar-clase-semana`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'No se pudo volver a tomar la clase.');
        return;
      }
      await recargarRecuperar();
    } finally {
      setActioning(null);
    }
  };

  const activarPushPortal = async () => {
    if (!portalAuth) return;
    if (!useApi() || !('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushStatus('unsupported');
      setPushMessage('Tu dispositivo no soporta notificaciones push. Si estás en iPhone, instalá la app y abrila desde el inicio.');
      return;
    }
    setPushStatus('loading');
    setPushMessage('');
    try {
      if (Notification.permission === 'denied') {
        setPushStatus('denied');
        setPushMessage('Tenés bloqueadas las notificaciones. Activálas desde la configuración del navegador o del celular.');
        return;
      }
      const base = getBase();
      const vapidRes = await fetchWithTimeout(`${base}/api/alumno-portal/push-vapid-public`);
      if (!vapidRes.ok) {
        setPushStatus('error');
        setPushMessage('El servidor no tiene notificaciones configuradas.');
        return;
      }
      const { vapidPublicKey } = await vapidRes.json();
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('denied');
        setPushMessage('Necesitás aceptar el permiso para recibir avisos.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existingSub = await reg.pushManager.getSubscription();
      if (existingSub) {
        try {
          await existingSub.unsubscribe();
        } catch {
          // ignore and request a fresh subscription anyway
        }
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
      const body = portalAuth.type === 'token'
        ? { token: portalAuth.token, subscription: sub.toJSON() }
        : { dni: portalAuth.dni, sucursalId: portalAuth.sucursalId, subscription: sub.toJSON() };
      const subscribeRes = await fetchWithTimeout(`${base}/api/alumno-portal/push-subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const subscribeJson = await subscribeRes.json().catch(() => ({}));
      if (!subscribeRes.ok) {
        setPushStatus('error');
        setPushMessage(subscribeJson.error || 'No se pudo registrar este dispositivo para avisos.');
        return;
      }
      setPushStatus('ok');
      setPushMessage('Avisos activados: te tendría que llegar una notificación de prueba en unos segundos.');
    } catch (e) {
      setPushStatus('error');
      setPushMessage(e instanceof Error ? e.message : 'No se pudo activar las notificaciones.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
          <p className="text-gray-600">Cargando tus clases...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    const tituloPortal = modoFromUrl === 'recuperar' ? 'Tu clase' : 'Mis clases';
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-2">
            <Calendar className="w-5 h-5 text-primary-600" />
            {tituloPortal}
          </h1>
          <p className="text-sm text-gray-600 mb-2">
            {modoFromUrl === 'recuperar'
              ? 'Ingresá tu DNI para entrar a Tu clase y anotarte en formato recuperación.'
              : 'Ingresá tu DNI para ver tus clases, sumarte o liberar cupo.'}
          </p>
          {error && (
            <div className="mb-3">
              <p className="text-red-600 text-sm">{error}</p>
              {tokenFromUrl && <p className="text-gray-500 text-xs mt-1">Podés ingresar tu DNI acá o pedir un link nuevo al estudio.</p>}
            </div>
          )}
          {sucursales.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Elegí tu sede:</p>
              <div className="flex flex-col gap-1.5">
                {sucursales.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => cargarPorDni(dniInput, s.id)}
                    disabled={enviandoDni}
                    className="px-4 py-2 rounded-lg bg-primary-100 text-primary-800 hover:bg-primary-200 font-medium text-sm disabled:opacity-50"
                  >
                    {s.nombre_lugar}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (dniInput.trim()) cargarPorDni(dniInput);
              }}
              className="space-y-3"
            >
              <label className="block text-sm font-medium text-gray-700">DNI</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Ej. 12345678"
                value={dniInput}
                onChange={(e) => setDniInput(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                autoFocus
              />
              <button
                type="submit"
                disabled={enviandoDni || !dniInput.trim()}
                className="w-full py-3 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {enviandoDni ? 'Cargando...' : 'Entrar'}
              </button>
              {!sucursalIdFromUrl.trim() && (
                <p className="text-xs text-gray-500">Si tu DNI aparece en más de una sede, te vamos a pedir que elijas cuál corresponde.</p>
              )}
            </form>
          )}
          <p className="text-xs text-gray-500 mt-4">Si tenés un link con token, usalo directamente desde ahí.</p>
        </div>
      </div>
    );
  }

  const horarios = data.horarios || DEFAULT_HORARIOS;
  const iniManana = horaToNum(horarios.horaInicioManana);
  const finManana = horaToNum(horarios.horaFinManana);
  const iniTarde = horaToNum(horarios.horaInicioTarde);
  const finTarde = horaToNum(horarios.horaFinTarde);
  const horariosNoDisponibles = horarios.horariosNoDisponiblesPorDia || DEFAULT_HORARIOS.horariosNoDisponiblesPorDia;
  const semanaParaCierre = data.semanaVista || getSemanaActual();
  const cierresPorFecha = data.cierresPorFecha || {};

  const turnoCerradoPorCalendario = (t: TurnoPortal) => {
    const fecha = getFechaFromSemanaYDia(semanaParaCierre, t.diaSemana);
    const c = cierresPorFecha[fecha];
    if (!c) return false;
    if (c.cerrarTodo) return true;
    const hh = (t.hora || '').slice(0, 5);
    return (c.horasCerradas || []).includes(hh);
  };

  const turnosFiltrados = data.turnos.filter((t) => {
    if (filtroDia !== null && t.diaSemana !== filtroDia) return false;
    if (turnoCerradoPorCalendario(t)) return false;
    if ((horariosNoDisponibles?.[t.diaSemana] || []).includes(t.hora)) return false;
    const h = horaToNum(t.hora);
    if (filtroHorario === 'manana') return h >= iniManana && h <= finManana;
    if (filtroHorario === 'tarde') return h >= iniTarde && h <= finTarde;
    return true;
  });

  const turnosUnicos = Array.from(
    turnosFiltrados.reduce<Map<string, TurnoPortal>>((acc, turno) => {
      const key = `${turno.diaSemana}|${turno.hora}|${(turno.titulo || 'Clase').trim().toLowerCase()}`;
      const existente = acc.get(key);
      acc.set(key, existente ? elegirTurnoRepresentativo(existente, turno) : turno);
      return acc;
    }, new Map()).values()
  );

  const turnosOrdenados = [...turnosUnicos].sort(
    (a, b) => a.diaSemana - b.diaSemana || horaToNum(a.hora) - horaToNum(b.hora)
  );

  const porDia = turnosOrdenados.reduce<Record<number, TurnoPortal[]>>((acc, t) => {
    if (!acc[t.diaSemana]) acc[t.diaSemana] = [];
    acc[t.diaSemana].push(t);
    return acc;
  }, {});

  const diasConTurnos = Object.keys(porDia).map(Number).sort((a, b) => a - b);
  const nombreCompleto = [data.alumno.apellido, data.alumno.nombre].filter(Boolean).join(', ') || 'Alumno';
  const labelManana = formatRangoHorario(horarios.horaInicioManana, horarios.horaFinManana);
  const labelTarde = formatRangoHorario(horarios.horaInicioTarde, horarios.horaFinTarde);
  const mLib = horarios.minutosAntesLiberarClase ?? 0;
  const mAnot = horarios.minutosAntesAnotarseClase ?? 0;
  const hayPoliticaAnticipacion = mLib > 0 || mAnot > 0;
  const esRecuperar = data.modo === 'recuperar';
  const clasesFijasOrdenadas = [...(data.clasesFijas || [])].sort((a, b) => a.diaSemana - b.diaSemana || horaToNum(a.hora) - horaToNum(b.hora));
  const turnosById = new Map(data.turnos.map((turno) => [turno.id, turno] as const));
  const recuperacionesOrdenadas = esRecuperar
    ? [...data.turnos]
        .filter((turno) => !!turno.recuperacionId && turno.yaInscripto)
        .sort((a, b) => a.diaSemana - b.diaSemana || horaToNum(a.hora) - horaToNum(b.hora))
    : [];
  const proximaClase = getProximaClase(clasesFijasOrdenadas);
  const historial = data.historialAsistencias || [];
  const totalAsistidas = historial.filter((item) => item.estado === 'asistio').length;
  const totalInasistencias = historial.filter((item) => item.estado === 'no_asistio').length;
  const fechaVencimiento = data.alumno.fechaVencimientoCuota || '';
  const tieneFechaVencimiento = fechaVencimiento.trim() !== '';
  const cuotaVencida = tieneFechaVencimiento && isCuotaVencida(fechaVencimiento);
  const cuotaVenceHoy = tieneFechaVencimiento && isCuotaVenceHoy(fechaVencimiento);
  const cuotaPorVencer = tieneFechaVencimiento && !cuotaVencida && (cuotaVenceHoy || isCuotaPorVencer(fechaVencimiento, 3));

  const semanaActualLabel = getRangoSemana(getSemanaActual());
  const semanaSiguienteLabel = getRangoSemana(getSemanaSiguiente(getSemanaActual()));
  const sucursalPortal =
    data.sucursalId ||
    (portalAuth?.type === 'dni' ? portalAuth.sucursalId : '') ||
    sucursalIdFromUrl;

  const cerrarSesionPortal = () => {
    setData(null);
    setPortalAuth(null);
    setError('');
    setSucursales([]);
    setActioning(null);
    setPushStatus('idle');
    setPushMessage('');
    setDniInput('');
    setFiltroDia(null);
    setFiltroHorario('todos');
    setSemanaElegida('actual');
    setLoading(false);
    notifPromptHandledRef.current = false;

    const params = new URLSearchParams();
    params.set('modo', modoFromUrl);
    if (sucursalPortal.trim()) params.set('sucursalId', sucursalPortal.trim());
    navigate(`/mi-clase?${params.toString()}`, { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-100 pb-safe">
      <div className="max-w-lg mx-auto p-4 pt-8 sm:pt-6">
        <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary-600" />
                Tu perfil
              </h1>
              <p className="text-sm font-semibold text-gray-900 mt-2 truncate">{nombreCompleto}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${esRecuperar ? 'bg-violet-100 text-violet-800' : 'bg-primary-100 text-primary-800'}`}>
                  {esRecuperar ? 'Modo recuperar' : 'Modo clases'}
                </span>
                {data.alumno.actividadNombre && (
                  <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700">
                    {data.alumno.actividadNombre}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={cerrarSesionPortal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-3">
            {esRecuperar
              ? 'Acá podés ver tu perfil, liberar tu clase fija de la semana y tomar otra para recuperar.'
              : 'Acá podés ver tus clases, tu estado de cuota y gestionar tus reservas.'}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSeccionActiva('clases')}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${seccionActiva === 'clases' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Mis clases
            </button>
            <button
              type="button"
              onClick={() => setSeccionActiva('perfil')}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${seccionActiva === 'perfil' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Mi perfil
            </button>
          </div>
        </div>

        {seccionActiva === 'clases' ? (
          <>
            <div className="bg-white rounded-xl shadow p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary-600" />
                <h2 className="text-sm font-semibold text-gray-900">Mis clases</h2>
              </div>
              {clasesFijasOrdenadas.length === 0 && recuperacionesOrdenadas.length === 0 ? (
                <p className="text-sm text-gray-500">Todavía no tenés clases cargadas.</p>
              ) : (
                <div className="space-y-2">
                  {clasesFijasOrdenadas.map((turno) => {
                    const turnoActual = turnosById.get(turno.id);
                    return (
                      <div key={turno.id} className="rounded-lg border border-gray-200 px-3 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900">{NOMBRE_DIA[turno.diaSemana] ?? `Día ${turno.diaSemana}`} {turno.hora}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{turno.titulo || 'Clase'}</p>
                          {esRecuperar && turnoActual?.claseLiberada && (
                            <p className="text-xs text-emerald-700 mt-1">La liberaste para esta semana</p>
                          )}
                          {esRecuperar && turnoActual?.esClaseFija && !turnoActual?.claseLiberada && (
                            <p className="text-xs text-amber-700 mt-1">Tu clase fija de esta semana</p>
                          )}
                        </div>
                        {turnoActual && (
                          <div className="flex-shrink-0">
                            {esRecuperar && turnoActual.esClaseFija && turnoActual.claseLiberada ? (
                              <button
                                type="button"
                                onClick={() => restaurarClaseSemana(turnoActual.id, turnoActual.liberacionId)}
                                disabled={!!actioning}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-100 text-emerald-800 hover:bg-emerald-200 font-medium text-sm disabled:opacity-50 touch-manipulation"
                              >
                                {actioning === turnoActual.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                Volver a tomarla
                              </button>
                            ) : esRecuperar && turnoActual.esClaseFija ? (
                              <button
                                type="button"
                                onClick={() => liberarClaseSemana(turnoActual.id)}
                                disabled={!!actioning}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 font-medium text-sm disabled:opacity-50 touch-manipulation"
                              >
                                {actioning === turnoActual.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                                Liberar esta clase
                              </button>
                            ) : turnoActual.yaInscripto ? (
                              <button
                                type="button"
                                onClick={() => liberar(turnoActual.id, turnoActual.recuperacionId)}
                                disabled={!!actioning}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 font-medium text-sm disabled:opacity-50 touch-manipulation"
                              >
                                {actioning === turnoActual.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                                Liberar cupo
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {recuperacionesOrdenadas.map((turno) => {
                    const fechaRecuperacion = formatDate(getFechaFromSemanaYDia(data.semanaVista || getSemanaActual(), turno.diaSemana));
                    return (
                      <div key={`rec-${turno.id}-${turno.recuperacionId}`} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900">{NOMBRE_DIA[turno.diaSemana] ?? `Día ${turno.diaSemana}`} {turno.hora}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{turno.titulo || 'Clase'}</p>
                          <p className="text-xs text-violet-700 mt-1">Recuperación · {fechaRecuperacion}</p>
                        </div>
                        <div className="flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => liberar(turno.id, turno.recuperacionId)}
                            disabled={!!actioning}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 font-medium text-sm disabled:opacity-50 touch-manipulation"
                          >
                            {actioning === turno.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                            Liberar recuperación
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {esRecuperar && (
              <div className="bg-white rounded-xl shadow p-3 mb-4">
                <p className="text-xs font-medium text-gray-500 mb-2">Ver semana</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSemanaElegida('actual')}
                    disabled={cargandoSemana}
                    className={`px-3 py-2 rounded-lg text-sm font-medium touch-manipulation ${semanaElegida === 'actual' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} disabled:opacity-50`}
                  >
                    Semana actual ({semanaActualLabel})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSemanaElegida('siguiente')}
                    disabled={cargandoSemana}
                    className={`px-3 py-2 rounded-lg text-sm font-medium touch-manipulation ${semanaElegida === 'siguiente' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} disabled:opacity-50`}
                  >
                    Otra semana ({semanaSiguienteLabel})
                  </button>
                </div>
                {cargandoSemana && <p className="text-xs text-gray-500 mt-2">Cargando...</p>}
                {data.recuperacionStats && (
                  <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
                    <p>
                      Clases para recuperar: <strong>{data.recuperacionStats.clasesParaRecuperar}</strong>
                    </p>
                    <p>
                      Usadas esta semana: <strong>{data.recuperacionStats.clasesUsadasSemana}</strong>
                      {data.recuperacionStats.clasesPorSemana != null && (
                        <> / <strong>{data.recuperacionStats.clasesPorSemana}</strong> base</>
                      )}
                      {data.recuperacionStats.clasesDisponiblesSemana != null && (
                        <> · disponibles esta semana: <strong>{data.recuperacionStats.clasesDisponiblesSemana}</strong></>
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="bg-white rounded-xl shadow p-3 mb-4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-gray-900">{esRecuperar ? 'Recuperar o liberar' : 'Anotarte o liberar una clase'}</h2>
                <p className="text-xs text-gray-500 mt-1">
                  {esRecuperar ? 'Usá este formato para liberar una fija de la semana o sumarte a otra para recuperar.' : 'Filtrá por día u horario para encontrar rápido tu clase.'}
                </p>
                {hayPoliticaAnticipacion && (
                  <p className="text-xs text-gray-600 mt-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 leading-snug">
                    Liberar cupo: <strong>{textoPlazoMinutos(mLib)}</strong> antes de cada turno. Anotarse o recuperar:{' '}
                    <strong>{textoPlazoMinutos(mAnot)}</strong> antes de cada turno.
                  </p>
                )}
              </div>
              <p className="text-xs font-medium text-gray-500 mb-2">Ver día</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  type="button"
                  onClick={() => setFiltroDia(null)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium touch-manipulation ${filtroDia === null ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  Todos
                </button>
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setFiltroDia(d)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium touch-manipulation ${filtroDia === d ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    {DIAS_CORTOS[d]}
                  </button>
                ))}
              </div>
              <p className="text-xs font-medium text-gray-500 mb-2">Ver horario (según tu sede)</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setFiltroHorario('todos')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium touch-manipulation ${filtroHorario === 'todos' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroHorario('manana')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium touch-manipulation ${filtroHorario === 'manana' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'}`}
                >
                  Mañana ({labelManana})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroHorario('tarde')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium touch-manipulation ${filtroHorario === 'tarde' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'}`}
                >
                  Tarde ({labelTarde})
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">Si no ves una clase, probá con «Todos».</p>
            </div>

            <div className="space-y-4">
              {data.turnos.length === 0 ? (
                <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">
                  Todavía no hay clases cargadas. Cuando el estudio agregue turnos, van a aparecer acá.
                </div>
              ) : turnosOrdenados.length === 0 ? (
                <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">
                  No hay clases con el filtro elegido. Probá con otro día u horario.
                </div>
              ) : (
                diasConTurnos.map((dia) => (
                  <div key={dia}>
                    <h2 className="text-sm font-semibold text-primary-700 mb-2 px-1">
                      {NOMBRE_DIA[dia] ?? `Día ${dia}`}
                    </h2>
                    <div className="space-y-2">
                      {porDia[dia].map((t) => (
                        <div key={t.id} className="bg-white rounded-xl shadow p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-900 truncate">{t.titulo || 'Clase'}</p>
                            <p className="text-sm text-gray-600">{t.hora}</p>
                            <p className="text-xs text-gray-500">
                              {t.inscriptos}/{t.cupo} inscriptos
                            </p>
                            {esRecuperar && t.esClaseFija && !t.claseLiberada && (
                              <p className="text-xs text-amber-700 mt-1">Tu clase fija de esta semana</p>
                            )}
                            {esRecuperar && t.esClaseFija && t.claseLiberada && (
                              <p className="text-xs text-emerald-700 mt-1">La liberaste para esta semana</p>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            {t.yaInscripto ? (
                              <button
                                type="button"
                                onClick={() => liberar(t.id, t.recuperacionId)}
                                disabled={!!actioning}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 font-medium text-sm disabled:opacity-50 touch-manipulation"
                              >
                                {actioning === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                                {esRecuperar ? 'Liberar recuperación' : 'Liberar cupo'}
                              </button>
                            ) : esRecuperar && t.esClaseFija && !t.claseLiberada ? (
                              <button
                                type="button"
                                onClick={() => liberarClaseSemana(t.id)}
                                disabled={!!actioning}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 font-medium text-sm disabled:opacity-50 touch-manipulation"
                              >
                                {actioning === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                                Liberar esta clase
                              </button>
                            ) : esRecuperar && t.esClaseFija && t.claseLiberada ? (
                              <button
                                type="button"
                                onClick={() => restaurarClaseSemana(t.id, t.liberacionId)}
                                disabled={!!actioning}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-100 text-emerald-800 hover:bg-emerald-200 font-medium text-sm disabled:opacity-50 touch-manipulation"
                              >
                                {actioning === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                Volver a tomarla
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => inscribir(t.id)}
                                disabled={!!actioning || t.inscriptos >= t.cupo}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                              >
                                {actioning === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                {esRecuperar ? 'Sumarme para recuperar' : 'Sumarme'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            {proximaClase && (
              <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-xs font-medium text-emerald-700">Próxima clase</p>
                  <p className="text-base font-semibold text-emerald-900 mt-1">
                    {NOMBRE_DIA[proximaClase.diaSemana] ?? `Día ${proximaClase.diaSemana}`} {proximaClase.hora}
                  </p>
                  <p className="text-sm text-emerald-800 mt-1">{proximaClase.titulo || 'Clase'}</p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                  <p className="text-xs font-medium text-gray-500">Actividad</p>
                  <p className="text-sm font-semibold mt-1 text-gray-900">{data.alumno.actividadNombre || 'Sin actividad'}</p>
                  <p className="text-xs mt-1 text-gray-500">Tu plan actual</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                  <p className="text-xs font-medium text-gray-500">Cuota</p>
                  <p className={`text-sm font-semibold mt-1 ${cuotaVencida ? 'text-red-600' : cuotaPorVencer ? 'text-amber-600' : 'text-gray-900'}`}>
                    {tieneFechaVencimiento ? formatDate(fechaVencimiento) : 'Sin fecha'}
                  </p>
                  <p className="text-xs mt-1 text-gray-500">
                    {cuotaVencida ? 'Vencida' : cuotaVenceHoy ? 'Vence hoy' : cuotaPorVencer ? 'Próxima a vencer' : 'Al día'}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                  <p className="text-xs font-medium text-gray-500">Clases fijas</p>
                  <p className="text-sm font-semibold mt-1 text-gray-900">{clasesFijasOrdenadas.length}</p>
                  <p className="text-xs mt-1 text-gray-500">Por semana</p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-3">
                  <p className="text-xs font-medium text-violet-700">Para recuperar</p>
                  <p className="text-sm font-semibold mt-1 text-violet-900">{data.alumno.clasesParaRecuperar || 0}</p>
                  <p className="text-xs mt-1 text-violet-700">Créditos disponibles</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-primary-100 bg-primary-50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-primary-900 flex items-center gap-2">
                      <Bell className="w-4 h-4" />
                      Avisos de cupos liberados
                    </p>
                    <p className="text-xs text-primary-700 mt-1">
                      Activá las notificaciones en este dispositivo para enterarte cuando alguien libera un lugar.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={activarPushPortal}
                    disabled={pushStatus === 'loading'}
                    className="px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                  >
                    {pushStatus === 'loading' ? 'Activando...' : pushStatus === 'ok' ? 'Activadas' : 'Activar'}
                  </button>
                </div>
                {pushMessage && (
                  <p className={`text-xs mt-2 ${pushStatus === 'ok' ? 'text-green-700' : pushStatus === 'error' || pushStatus === 'denied' ? 'text-amber-700' : 'text-primary-700'}`}>
                    {pushMessage}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-primary-600" />
                <h2 className="text-sm font-semibold text-gray-900">Historial de clases</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                  <p className="text-xs text-green-700">Asistidas</p>
                  <p className="text-sm font-semibold text-green-900">{totalAsistidas}</p>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                  <p className="text-xs text-red-700">Inasistencias</p>
                  <p className="text-sm font-semibold text-red-900">{totalInasistencias}</p>
                </div>
              </div>
              {historial.length === 0 ? (
                <p className="text-sm text-gray-500">Todavía no hay asistencias marcadas.</p>
              ) : (
                <div className="space-y-2">
                  {historial.slice(0, 8).map((item) => (
                    <div key={item.id} className="rounded-lg border border-gray-200 px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{formatDate(item.fecha)} · {item.hora}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{item.titulo}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${item.estado === 'asistio' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {item.estado === 'asistio' ? 'Asistió' : 'No asistió'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MiClase;
