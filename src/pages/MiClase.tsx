import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, UserPlus, UserMinus, Loader2, History, Sparkles, LogOut, ArrowLeft, RefreshCw, CheckCircle2, User } from 'lucide-react';
import { DIAS_SEMANA } from '../types';
import { formatDate, getFechaFromSemanaYDia, getSemanaActual, getRangoSemana, isCuotaPorVencer, isCuotaVenceHoy, isCuotaVencida } from '../utils/date';
import { useToast } from '../components/ToastProvider';

const getBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

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
  sucursalNombre?: string;
  horarios?: HorariosPortal;
  modo?: 'fijo' | 'recuperar';
  semanaVista?: string;
  recuperacionStats?: {
    clasesPorSemana: number | null;
    actividadArrastrePack?: number;
    cupoPackSemana?: number | null;
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

const fetchWithTimeout = (url: string, options: RequestInit = {}, ms = 15000): Promise<Response> => {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
};

function ajustarStatsRecuperacion(
  stats: NonNullable<PortalData['recuperacionStats']>,
  delta: { fijas?: number; recuperaciones?: number; creditos?: number }
): NonNullable<PortalData['recuperacionStats']> {
  const clasesFijasSemana = Math.max(0, stats.clasesFijasSemana + (delta.fijas ?? 0));
  const recuperacionesSemana = Math.max(0, stats.recuperacionesSemana + (delta.recuperaciones ?? 0));
  const clasesParaRecuperar = Math.max(0, stats.clasesParaRecuperar + (delta.creditos ?? 0));
  const clasesUsadasSemana = Math.max(0, clasesFijasSemana + recuperacionesSemana);
  const cupoPack = stats.cupoPackSemana;
  const clasesDisponiblesSemana =
    stats.clasesPorSemana == null
      ? null
      : Math.max(0, (cupoPack ?? stats.clasesPorSemana) + clasesParaRecuperar - clasesUsadasSemana);
  return {
    ...stats,
    clasesFijasSemana,
    recuperacionesSemana,
    clasesParaRecuperar,
    clasesUsadasSemana,
    clasesDisponiblesSemana,
  };
}

function aplicarLiberacionSemanaLocal(prev: PortalData, turnoId: string, liberacionId?: string): PortalData {
  const turnos = prev.turnos.map((t) => {
    if (t.id !== turnoId) return t;
    const liberabaCupo = t.esClaseFija && !t.claseLiberada;
    return {
      ...t,
      claseLiberada: true,
      liberacionId: liberacionId || t.liberacionId || 'local',
      inscriptos: liberabaCupo ? Math.max(0, t.inscriptos - 1) : t.inscriptos,
    };
  });
  const stats = prev.recuperacionStats
    ? ajustarStatsRecuperacion(prev.recuperacionStats, { fijas: -1, creditos: 1 })
    : undefined;
  return {
    ...prev,
    turnos,
    recuperacionStats: stats,
    alumno: {
      ...prev.alumno,
      clasesParaRecuperar: (prev.alumno.clasesParaRecuperar || 0) + 1,
    },
  };
}

function aplicarRestaurarClaseSemanaLocal(prev: PortalData, turnoId: string): PortalData {
  const turnos = prev.turnos.map((t) => {
    if (t.id !== turnoId) return t;
    const restauraCupo = t.esClaseFija && t.claseLiberada;
    return {
      ...t,
      claseLiberada: false,
      liberacionId: undefined,
      inscriptos: restauraCupo ? t.inscriptos + 1 : t.inscriptos,
    };
  });
  const stats = prev.recuperacionStats
    ? ajustarStatsRecuperacion(prev.recuperacionStats, { fijas: 1, creditos: -1 })
    : undefined;
  return {
    ...prev,
    turnos,
    recuperacionStats: stats,
    alumno: {
      ...prev.alumno,
      clasesParaRecuperar: Math.max(0, (prev.alumno.clasesParaRecuperar || 0) - 1),
    },
  };
}

function aplicarLiberarRecuperacionLocal(prev: PortalData, turnoId: string, devolvioCredito: boolean): PortalData {
  const turnos = prev.turnos.map((t) => {
    if (t.id !== turnoId) return t;
    return {
      ...t,
      yaInscripto: false,
      inscriptos: Math.max(0, t.inscriptos - 1),
      recuperacionId: undefined,
      usaCredito: undefined,
    };
  });
  const stats = prev.recuperacionStats
    ? ajustarStatsRecuperacion(prev.recuperacionStats, {
        recuperaciones: -1,
        creditos: devolvioCredito ? 1 : 0,
      })
    : undefined;
  return {
    ...prev,
    turnos,
    recuperacionStats: stats,
    alumno: devolvioCredito
      ? {
          ...prev.alumno,
          clasesParaRecuperar: (prev.alumno.clasesParaRecuperar || 0) + 1,
        }
      : prev.alumno,
  };
}

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
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [portalAuth, setPortalAuth] = useState<PortalAuth | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [filtroDia, setFiltroDia] = useState<number | null>(null);
  const [filtroHorario, setFiltroHorario] = useState<'todos' | 'manana' | 'tarde'>('todos');
  const [seccionActiva, setSeccionActiva] = useState<'inicio' | 'clases' | 'perfil'>('inicio');
  const [dniInput, setDniInput] = useState('');
  const [sucursales, setSucursales] = useState<SucursalOption[]>([]);
  const [enviandoDni, setEnviandoDni] = useState(false);
  const [cargandoSemana, setCargandoSemana] = useState(false);
  const [brandNombre, setBrandNombre] = useState('');
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const notifPromptHandledRef = useRef(false);

  useEffect(() => {
    const sid = (data?.sucursalId || sucursalIdFromUrl || '').trim();
    const token = tokenFromUrl.trim();
    if (!sid && !token) return;
    let cancelled = false;
    (async () => {
      try {
        const base = getBase();
        const q = sid
          ? `sucursalId=${encodeURIComponent(sid)}`
          : `token=${encodeURIComponent(token)}`;
        const res = await fetch(`${base}/api/public/sucursal-brand?${q}`);
        if (!res.ok || cancelled) return;
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (typeof json.nombreLugar === 'string') setBrandNombre(json.nombreLugar);
        if (typeof json.logoUrl === 'string') setBrandLogoUrl(json.logoUrl);
      } catch {
        /* brand opcional */
      }
    })();
    return () => { cancelled = true; };
  }, [data?.sucursalId, sucursalIdFromUrl, tokenFromUrl]);

  const nombreParaMarca = (data?.sucursalNombre || brandNombre || '').trim();
  const brandConocido = nombreParaMarca.length > 0;
  const isSavia = brandConocido ? /savia/i.test(nombreParaMarca) : true;
  const logoSrc = isSavia ? '/savia.png' : (brandLogoUrl || '/fitgest.png');
  const marcaTitulo = isSavia ? 'Savia' : (nombreParaMarca || 'Tu clase');

  useEffect(() => {
    if (tokenFromUrl.trim()) {
      let cancelled = false;
      (async () => {
        try {
          const base = getBase();
          let url = `${base}/api/alumno-portal?token=${encodeURIComponent(tokenFromUrl)}`;
          if (modoFromUrl === 'recuperar') {
            url += '&modo=recuperar';
            url += `&semana=${encodeURIComponent(getSemanaActual())}`;
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
  }, [tokenFromUrl, modoFromUrl]);

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
    const iconHref = sid.trim()
      ? `/api/public/sucursal-logo/${encodeURIComponent(sid.trim())}`
      : isSavia
        ? '/savia.png'
        : '/fitgest.png';

    if (manifestLink) manifestLink.href = manifestHref;
    if (appleTouch) appleTouch.href = iconHref;
    if (favicon) favicon.href = iconHref;
    if (appleTitle) appleTitle.content = isSavia ? 'Savia Pilates' : 'Tu clase';
    document.title = isSavia ? 'Savia Pilates' : 'Tu clase';
  }, [data?.sucursalId, modoFromUrl, sucursalIdFromUrl, tokenFromUrl, isSavia]);

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
        url += `&semana=${encodeURIComponent(getSemanaActual())}`;
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

  const recargarRecuperar = async (opts?: { silencioso?: boolean }) => {
    if (!portalAuth || !data || data.modo !== 'recuperar') return;
    if (!opts?.silencioso) setCargandoSemana(true);
    try {
      const base = getBase();
      const semana = getSemanaActual();
      let url: string;
      if (portalAuth.type === 'token') {
        url = `${base}/api/alumno-portal?token=${encodeURIComponent(portalAuth.token)}&modo=recuperar&semana=${encodeURIComponent(semana)}`;
      } else {
        url = `${base}/api/alumno-portal?dni=${encodeURIComponent(portalAuth.dni)}&sucursalId=${encodeURIComponent(portalAuth.sucursalId)}&modo=recuperar&semana=${encodeURIComponent(semana)}`;
      }
      const res = await fetchWithTimeout(url, {}, 20000);
      const json = await res.json().catch(() => ({}));
      if (res.ok) setData(json);
    } finally {
      if (!opts?.silencioso) setCargandoSemana(false);
    }
  };

  useEffect(() => {
    if (notifPromptHandledRef.current || !promptTomarDesdeNotif || !notifTurnoId || !data || !portalAuth) return;
    if (data.modo !== 'recuperar') return;
    // Solo semana actual: si la notif apunta a otra semana, no forzamos cambio.
    if (notifSemana && data.semanaVista && notifSemana !== data.semanaVista) return;
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
  }, [data, notifSemana, notifTurnoId, portalAuth, promptTomarDesdeNotif, semanaActualBase, toast]);

  const inscribir = async (turnoId: string) => {
    if (!portalAuth || !data) return;
    const esRecuperar = data.modo === 'recuperar';
    const fechaCuota = (data.alumno.fechaVencimientoCuota || '').trim();
    if (esRecuperar && fechaCuota && isCuotaVencida(fechaCuota)) {
      toast.error('Tu cuota está vencida. Regularizá el pago para poder recuperar una clase.');
      return;
    }
    setActioning(turnoId);
    try {
      const base = getBase();
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
        void recargarRecuperar({ silencioso: true });
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'No se pudo liberar el cupo.');
        return;
      }
      if (esRecuperar) {
        const turno = data.turnos.find((t) => t.id === turnoId);
        const devolvioCredito = !!turno?.usaCredito;
        setData((prev) => (prev ? aplicarLiberarRecuperacionLocal(prev, turnoId, devolvioCredito) : null));
        void recargarRecuperar({ silencioso: true });
      } else {
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
      setData((prev) => (prev ? aplicarLiberacionSemanaLocal(prev, turnoId, json.liberacionId) : null));
      toast.success('Clase liberada para esta semana.');
      void recargarRecuperar({ silencioso: true });
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
      setData((prev) => (prev ? aplicarRestaurarClaseSemanaLocal(prev, turnoId) : null));
      toast.success('Volviste a tomar la clase de esta semana.');
      void recargarRecuperar({ silencioso: true });
    } finally {
      setActioning(null);
    }
  };

  if (loading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center p-4 ${
          isSavia ? 'portal-savia-shell font-savia' : 'bg-slate-100'
        }`}
      >
        <div className="flex flex-col items-center gap-4 animate-savia-soft-in">
          {isSavia ? (
            <img
              src="/savia.png"
              alt="Savia Pilates"
              className="w-24 h-24 rounded-full object-cover shadow-md ring-2 ring-savia-sandSoft animate-savia-breathe"
            />
          ) : null}
          <Loader2
            className={`w-9 h-9 animate-spin ${isSavia ? 'text-savia-terra' : 'text-primary-600'}`}
          />
          <p className={`text-sm ${isSavia ? 'text-savia-muted' : 'text-gray-600'}`}>
            Cargando tus clases...
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center p-4 ${
          isSavia ? 'portal-savia-shell font-savia' : 'bg-slate-100'
        }`}
      >
        <div
          className={`max-w-md w-full animate-savia-fade-up ${
            isSavia
              ? 'rounded-3xl border border-savia-sandSoft bg-white/85 backdrop-blur-sm p-7 shadow-[0_12px_40px_rgba(143,102,76,0.12)]'
              : 'bg-white rounded-2xl shadow-lg p-6'
          }`}
        >
          <button
            type="button"
            onClick={() => navigate('/')}
            className={`inline-flex items-center gap-1.5 text-sm font-medium mb-5 ${
              isSavia ? 'text-savia-muted hover:text-savia-ink' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>

          {isSavia ? (
            <div className="text-center mb-6">
              <img
                src="/savia.png"
                alt="Savia Pilates"
                className="mx-auto w-28 h-28 rounded-full object-cover shadow-lg ring-4 ring-savia-sandSoft/80 animate-savia-soft-in animate-savia-breathe"
              />
              <h1 className="mt-4 font-saviaDisplay text-4xl tracking-[0.18em] text-savia-ink uppercase">
                Savia
              </h1>
              <p className="mt-1 font-saviaDisplay text-xl text-savia-terra italic">Pilates</p>
              <p className="mt-3 text-sm text-savia-muted leading-relaxed">
                {modoFromUrl === 'recuperar'
                  ? 'Ingresá tu DNI para recuperar una clase de esta semana.'
                  : 'Ingresá tu DNI para ver tus clases, sumarte o liberar cupo.'}
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-2">
                <Calendar className="w-5 h-5 text-primary-600" />
                {modoFromUrl === 'recuperar' ? 'Tu clase' : 'Mis clases'}
              </h1>
              <p className="text-sm text-gray-600 mb-2">
                {modoFromUrl === 'recuperar'
                  ? 'Ingresá tu DNI para recuperar una clase de esta semana.'
                  : 'Ingresá tu DNI para ver tus clases, sumarte o liberar cupo.'}
              </p>
            </>
          )}

          {error && (
            <div className="mb-3">
              <p className={`text-sm ${isSavia ? 'text-red-700' : 'text-red-600'}`}>{error}</p>
              {tokenFromUrl && (
                <p className={`text-xs mt-1 ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
                  Podés ingresar tu DNI acá o pedir un link nuevo al estudio.
                </p>
              )}
            </div>
          )}
          {sucursales.length > 0 ? (
            <div className="space-y-2">
              <p className={`text-sm font-medium ${isSavia ? 'text-savia-ink' : 'text-gray-700'}`}>
                Elegí tu sede:
              </p>
              <div className="flex flex-col gap-1.5">
                {sucursales.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => cargarPorDni(dniInput, s.id)}
                    disabled={enviandoDni}
                    className={`px-4 py-2.5 rounded-xl font-medium text-sm disabled:opacity-50 ${
                      isSavia
                        ? 'bg-savia-oliveSoft text-savia-oliveDeep hover:bg-savia-sandSoft border border-savia-sand'
                        : 'bg-primary-100 text-primary-800 hover:bg-primary-200'
                    }`}
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
              <label
                className={`block text-sm font-medium ${isSavia ? 'text-savia-ink' : 'text-gray-700'}`}
              >
                DNI
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Ej. 12345678"
                value={dniInput}
                onChange={(e) => setDniInput(e.target.value.replace(/\D/g, ''))}
                className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:outline-none ${
                  isSavia
                    ? 'border-savia-sand bg-savia-cream/60 text-savia-ink placeholder:text-savia-muted focus:ring-savia-terra/40 focus:border-savia-terra'
                    : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
                }`}
                autoFocus
              />
              <button
                type="submit"
                disabled={enviandoDni || !dniInput.trim()}
                className={`w-full py-3.5 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                  isSavia
                    ? 'bg-savia-terra text-white hover:bg-savia-terraDeep shadow-sm'
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
              >
                {enviandoDni ? 'Cargando...' : 'Entrar'}
              </button>
              {!sucursalIdFromUrl.trim() && (
                <p className={`text-xs ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
                  Si tu DNI aparece en más de una sede, te vamos a pedir que elijas cuál corresponde.
                </p>
              )}
            </form>
          )}
          <p className={`text-xs mt-4 ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
            Si tenés un link con token, usalo directamente desde ahí.
          </p>
        </div>
      </div>
    );
  }

  const esRecuperar = data.modo === 'recuperar';
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
  const esSemanaActualVista = (data.semanaVista || getSemanaActual()) === getSemanaActual();
  const turnoYaPaso = (t: TurnoPortal) => {
    if (!esRecuperar || !esSemanaActualVista) return false;
    const fecha = getFechaFromSemanaYDia(data.semanaVista || getSemanaActual(), t.diaSemana);
    const hh = (t.hora || '').slice(0, 5) || '00:00';
    const inicio = new Date(`${fecha}T${hh}:00-03:00`);
    return Number.isFinite(inicio.getTime()) && inicio.getTime() <= Date.now();
  };

  const turnosFiltrados = data.turnos.filter((t) => {
    if (filtroDia !== null && t.diaSemana !== filtroDia) return false;
    if (turnoYaPaso(t)) return false;
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
  const semanaVistaIso = data.semanaVista || getSemanaActual();
  const nombreSaludo = (data.alumno.nombre || '').trim() || 'hola';
  const diaNumDeSemana = (diaSemana: number) =>
    Number(getFechaFromSemanaYDia(semanaVistaIso, diaSemana).slice(8, 10));
  const tieneFijaSinLiberar =
    esRecuperar &&
    clasesFijasOrdenadas.some((c) => {
      const t = turnosById.get(c.id);
      return !!(t?.esClaseFija && !t.claseLiberada);
    });
  /** 1 = liberar fija · 2 = elegir horario · 3 = ya recuperó */
  const pasoRecuperar: 1 | 2 | 3 = !esRecuperar
    ? 1
    : recuperacionesOrdenadas.length > 0
      ? 3
      : tieneFijaSinLiberar
        ? 1
        : 2;
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
    setDniInput('');
    setFiltroDia(null);
    setFiltroHorario('todos');
    setSeccionActiva('inicio');
    setLoading(false);
    notifPromptHandledRef.current = false;

    const params = new URLSearchParams();
    params.set('modo', modoFromUrl);
    if (sucursalPortal.trim()) params.set('sucursalId', sucursalPortal.trim());
    navigate(`/mi-clase?${params.toString()}`, { replace: true });
  };

  const cardCls = isSavia
    ? 'rounded-3xl border border-savia-sandSoft bg-white/90 backdrop-blur-sm shadow-[0_8px_28px_rgba(143,102,76,0.08)]'
    : 'bg-white rounded-2xl shadow-lg';
  const chipActive = isSavia
    ? 'bg-savia-terra text-white shadow-sm'
    : 'bg-primary-600 text-white';
  const chipIdle = isSavia
    ? 'bg-savia-creamDeep text-savia-ink hover:bg-savia-sandSoft border border-savia-sandSoft'
    : 'bg-gray-100 text-gray-700 hover:bg-gray-200';
  const chipRecuperar = isSavia
    ? 'bg-savia-olive text-white shadow-sm'
    : 'bg-violet-600 text-white';
  const ctaPrimary = isSavia
    ? 'bg-savia-terra text-white hover:bg-savia-terraDeep'
    : 'bg-primary-600 text-white hover:bg-primary-700';
  const ctaLiberar = isSavia
    ? 'bg-savia-sandSoft text-savia-terraDeep hover:bg-savia-sand border border-savia-sand'
    : 'bg-amber-100 text-amber-800 hover:bg-amber-200';
  const ctaRestaurar = isSavia
    ? 'bg-savia-oliveSoft text-savia-oliveDeep hover:bg-savia-sandSoft border border-savia-olive/30'
    : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200';
  const ink = isSavia ? 'text-savia-ink' : 'text-gray-900';
  const muted = isSavia ? 'text-savia-muted' : 'text-gray-600';
  const headingDay = isSavia
    ? (esRecuperar ? 'text-savia-oliveDeep' : 'text-savia-terra')
    : (esRecuperar ? 'text-violet-700' : 'text-primary-700');

  const perfilPanel = (
    <>
      {proximaClase && (
        <div className={`${cardCls} p-4 mb-4 animate-savia-fade-up`}>
          <div
            className={`rounded-2xl px-4 py-3 ${
              isSavia
                ? 'border border-savia-olive/25 bg-savia-oliveSoft'
                : 'border border-emerald-200 bg-emerald-50'
            }`}
          >
            <p
              className={`text-xs font-medium ${
                isSavia ? 'text-savia-oliveDeep' : 'text-emerald-700'
              }`}
            >
              Próxima clase
            </p>
            <p
              className={`text-base font-semibold mt-1 ${
                isSavia ? 'text-savia-ink' : 'text-emerald-900'
              }`}
            >
              {NOMBRE_DIA[proximaClase.diaSemana] ?? `Día ${proximaClase.diaSemana}`}{' '}
              {proximaClase.hora}
            </p>
            <p className={`text-sm mt-1 ${isSavia ? 'text-savia-oliveDeep' : 'text-emerald-800'}`}>
              {proximaClase.titulo || 'Clase'}
            </p>
          </div>
        </div>
      )}

      <div className={`${cardCls} p-4 mb-4 animate-savia-fade-up`}>
        <div className="grid grid-cols-2 gap-3">
          <div
            className={`rounded-2xl px-3 py-3 ${
              isSavia
                ? 'border border-savia-sandSoft bg-savia-cream/50'
                : 'border border-gray-200 bg-gray-50'
            }`}
          >
            <p className={`text-xs font-medium ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
              Actividad
            </p>
            <p className={`text-sm font-semibold mt-1 ${ink}`}>
              {data.alumno.actividadNombre || 'Sin actividad'}
            </p>
            <p className={`text-xs mt-1 ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
              Tu plan actual
            </p>
          </div>
          <div
            className={`rounded-2xl px-3 py-3 ${
              isSavia
                ? 'border border-savia-sandSoft bg-savia-cream/50'
                : 'border border-gray-200 bg-gray-50'
            }`}
          >
            <p className={`text-xs font-medium ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
              Cuota
            </p>
            <p
              className={`text-sm font-semibold mt-1 ${
                cuotaVencida
                  ? 'text-red-600'
                  : cuotaPorVencer
                    ? isSavia
                      ? 'text-savia-terra'
                      : 'text-amber-600'
                    : ink
              }`}
            >
              {tieneFechaVencimiento ? formatDate(fechaVencimiento) : 'Sin fecha'}
            </p>
            <p className={`text-xs mt-1 ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
              {cuotaVencida
                ? 'Vencida'
                : cuotaVenceHoy
                  ? 'Vence hoy'
                  : cuotaPorVencer
                    ? 'Próxima a vencer'
                    : 'Al día'}
            </p>
          </div>
          <div
            className={`rounded-2xl px-3 py-3 ${
              isSavia
                ? 'border border-savia-sandSoft bg-savia-cream/50'
                : 'border border-gray-200 bg-gray-50'
            }`}
          >
            <p className={`text-xs font-medium ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
              Clases fijas
            </p>
            <p className={`text-sm font-semibold mt-1 ${ink}`}>{clasesFijasOrdenadas.length}</p>
            <p className={`text-xs mt-1 ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
              Por semana
            </p>
          </div>
          <div
            className={`rounded-2xl px-3 py-3 ${
              isSavia
                ? 'border border-savia-olive/30 bg-savia-oliveSoft/70'
                : 'border border-violet-200 bg-violet-50'
            }`}
          >
            <p
              className={`text-xs font-medium ${
                isSavia ? 'text-savia-oliveDeep' : 'text-violet-700'
              }`}
            >
              Para recuperar
            </p>
            <p
              className={`text-2xl font-bold mt-1 tabular-nums ${
                isSavia ? 'text-savia-terraDeep' : 'text-violet-950'
              }`}
            >
              {data.alumno.clasesParaRecuperar || 0}
            </p>
          </div>
        </div>
      </div>

      <div className={`${cardCls} p-4 mb-4 animate-savia-fade-up`}>
        <div className="flex items-center gap-2 mb-3">
          <History className={`w-4 h-4 ${isSavia ? 'text-savia-terra' : 'text-primary-600'}`} />
          <h2 className={`text-sm font-semibold ${ink}`}>Historial de clases</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div
            className={`rounded-xl px-3 py-2 ${
              isSavia
                ? 'bg-savia-oliveSoft border border-savia-olive/25'
                : 'bg-green-50 border border-green-200'
            }`}
          >
            <p className={`text-xs ${isSavia ? 'text-savia-oliveDeep' : 'text-green-700'}`}>
              Asistidas
            </p>
            <p
              className={`text-sm font-semibold ${
                isSavia ? 'text-savia-ink' : 'text-green-900'
              }`}
            >
              {totalAsistidas}
            </p>
          </div>
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-xs text-red-700">Inasistencias</p>
            <p className="text-sm font-semibold text-red-900">{totalInasistencias}</p>
          </div>
        </div>
        {historial.length === 0 ? (
          <p className={`text-sm ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
            Todavía no hay asistencias marcadas.
          </p>
        ) : (
          <div className="space-y-2">
            {historial.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className={`rounded-2xl px-3 py-2 ${
                  isSavia ? 'border border-savia-sandSoft' : 'border border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${ink}`}>
                      {formatDate(item.fecha)} · {item.hora}
                    </p>
                    <p className={`text-xs mt-0.5 ${muted}`}>{item.titulo}</p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.estado === 'asistio'
                        ? isSavia
                          ? 'bg-savia-oliveSoft text-savia-oliveDeep'
                          : 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {item.estado === 'asistio' ? 'Asistió' : 'No asistió'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  /* ─── Modo recuperar: flujo premium enfocado ─── */
  if (esRecuperar) {
    const irInicio = () => setSeccionActiva('inicio');
    const clasesParaRecuperar = data.alumno.clasesParaRecuperar || 0;

    return (
      <div
        className={`min-h-screen safe-bottom ${
          isSavia ? 'portal-savia-shell font-savia' : 'bg-slate-100'
        }`}
      >
        <div className="max-w-lg mx-auto px-4 pb-10 safe-top pt-4 sm:pt-6">
          {/* Header con espacio bajo notch + acceso a perfil */}
          <header className="animate-savia-soft-in mb-6">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={irInicio}
                className="flex items-center gap-3 min-w-0 text-left"
                aria-label="Ir al inicio"
              >
                <img
                  src={logoSrc}
                  alt={marcaTitulo}
                  className={`w-11 h-11 rounded-full object-cover flex-shrink-0 shadow-md ${
                    isSavia ? 'ring-2 ring-savia-sandSoft' : 'ring-2 ring-primary-100'
                  }`}
                />
                <div className="min-w-0">
                  <p className={`text-[11px] uppercase tracking-wider ${muted}`}>{marcaTitulo}</p>
                  <p className={`text-sm truncate ${muted}`}>
                    Hola, <span className={`font-semibold ${ink}`}>{nombreSaludo}</span>
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setSeccionActiva('perfil')}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors touch-manipulation ${
                    seccionActiva === 'perfil'
                      ? isSavia
                        ? 'bg-savia-terra text-white'
                        : 'bg-primary-600 text-white'
                      : isSavia
                        ? 'bg-white/80 text-savia-ink border border-savia-sandSoft hover:bg-savia-creamDeep'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                  }`}
                  aria-label="Mi perfil"
                >
                  <User className="w-4 h-4" />
                  Perfil
                </button>
                <button
                  type="button"
                  onClick={cerrarSesionPortal}
                  className={`inline-flex items-center justify-center rounded-xl p-2.5 transition-colors touch-manipulation ${
                    isSavia
                      ? 'text-savia-muted/80 hover:text-savia-ink hover:bg-white/60'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-white'
                  }`}
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </header>

          {seccionActiva === 'inicio' ? (
            <div className="animate-savia-fade-up">
              <h1
                className={
                  isSavia
                    ? 'font-saviaDisplay text-3xl sm:text-[2.15rem] text-savia-ink tracking-tight leading-none'
                    : `text-3xl font-bold tracking-tight ${ink}`
                }
              >
                ¿Qué querés hacer?
              </h1>
              <p className={`mt-2 text-sm ${muted}`}>{semanaActualLabel}</p>

              <div className="mt-8 space-y-3">
                <button
                  type="button"
                  onClick={() => setSeccionActiva('clases')}
                  className={`w-full text-left p-5 touch-manipulation transition-transform active:scale-[0.98] ${cardCls} ${
                    isSavia
                      ? 'hover:border-savia-terra/40'
                      : 'hover:border-primary-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${
                        isSavia ? 'bg-savia-terra text-white' : 'bg-primary-600 text-white'
                      }`}
                    >
                      <RefreshCw className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-lg font-semibold ${ink}`}>Liberar / Recuperar</p>
                      <p className={`text-sm mt-1 leading-snug ${muted}`}>
                        Liberá si no vas y anotate a otro horario.
                      </p>
                      <p
                        className={`mt-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                          clasesParaRecuperar > 0
                            ? isSavia
                              ? 'bg-savia-oliveSoft text-savia-oliveDeep'
                              : 'bg-violet-100 text-violet-800'
                            : isSavia
                              ? 'bg-savia-creamDeep text-savia-muted'
                              : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {clasesParaRecuperar > 0
                          ? `${clasesParaRecuperar} para recuperar`
                          : 'Sin clases para recuperar'}
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSeccionActiva('perfil')}
                  className={`w-full text-left p-5 touch-manipulation transition-transform active:scale-[0.98] ${cardCls} ${
                    isSavia
                      ? 'hover:border-savia-olive/40'
                      : 'hover:border-gray-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${
                        isSavia ? 'bg-savia-olive text-white' : 'bg-gray-800 text-white'
                      }`}
                    >
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-lg font-semibold ${ink}`}>Mi perfil</p>
                      <p className={`text-sm mt-1 leading-snug ${muted}`}>
                        Cuota, historial y datos de tu plan.
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          ) : seccionActiva === 'perfil' ? (
            <>
              <button
                type="button"
                onClick={irInicio}
                className={`inline-flex items-center gap-1.5 text-sm font-medium mb-4 touch-manipulation ${
                  isSavia ? 'text-savia-terra hover:text-savia-terraDeep' : 'text-primary-600'
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                Volver al inicio
              </button>
              <h1
                className={`mb-4 ${
                  isSavia
                    ? 'font-saviaDisplay text-2xl text-savia-ink tracking-tight'
                    : `text-2xl font-bold ${ink}`
                }`}
              >
                Mi perfil
              </h1>
              {perfilPanel}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={irInicio}
                className={`inline-flex items-center gap-1.5 text-sm font-medium mb-3 touch-manipulation ${
                  isSavia ? 'text-savia-terra hover:text-savia-terraDeep' : 'text-primary-600'
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                Inicio
              </button>
              <div className="mb-5 animate-savia-fade-up">
                <h1
                  className={
                    isSavia
                      ? 'font-saviaDisplay text-3xl sm:text-[2.15rem] text-savia-ink tracking-tight leading-none'
                      : `text-3xl font-bold tracking-tight ${ink}`
                  }
                >
                  Liberar / Recuperar
                </h1>
                <p className={`mt-2 text-sm ${muted}`}>{semanaActualLabel}</p>
              </div>

              {/* Guía 2 pasos */}
              <nav
                className={`mb-5 rounded-2xl p-1.5 grid grid-cols-2 gap-1.5 animate-savia-fade-up ${
                  isSavia ? 'bg-white/70 border border-savia-sandSoft' : 'bg-white border border-gray-200'
                }`}
                aria-label="Pasos para recuperar"
              >
                {[
                  { n: 1 as const, label: 'Liberá', hint: 'si no vas' },
                  { n: 2 as const, label: 'Elegí', hint: 'otro horario' },
                ].map((paso) => {
                  const activo =
                    pasoRecuperar === paso.n || (pasoRecuperar === 3 && paso.n === 2);
                  const hecho = paso.n === 1 && pasoRecuperar !== 1;
                  return (
                    <div
                      key={paso.n}
                      className={`rounded-xl px-3 py-2.5 transition-colors ${
                        activo
                          ? isSavia
                            ? 'bg-savia-terra text-white shadow-sm'
                            : 'bg-primary-600 text-white shadow-sm'
                          : hecho
                            ? isSavia
                              ? 'bg-savia-oliveSoft/80 text-savia-oliveDeep'
                              : 'bg-emerald-50 text-emerald-800'
                            : isSavia
                              ? 'text-savia-muted'
                              : 'text-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                            activo
                              ? 'bg-white/20'
                              : hecho
                                ? isSavia
                                  ? 'bg-savia-olive/20'
                                  : 'bg-emerald-200/60'
                                : isSavia
                                  ? 'bg-savia-creamDeep'
                                  : 'bg-gray-100'
                          }`}
                        >
                          {hecho && !activo ? <CheckCircle2 className="w-3.5 h-3.5" /> : paso.n}
                        </span>
                        <div className="min-w-0 leading-tight">
                          <p className="text-sm font-semibold">{paso.label}</p>
                          <p className={`text-[11px] ${activo ? 'opacity-90' : 'opacity-70'}`}>
                            {paso.hint}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </nav>

              {pasoRecuperar === 3 && (
                <div
                  className={`mb-5 p-4 animate-savia-fade-up ${cardCls} ${
                    isSavia
                      ? 'bg-gradient-to-br from-savia-oliveSoft via-white/95 to-savia-cream border-savia-olive/25'
                      : 'border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
                        isSavia ? 'bg-savia-olive text-white' : 'bg-emerald-600 text-white'
                      }`}
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-base font-semibold ${ink}`}>Listo, ya recuperás</p>
                      <p className={`text-sm mt-1 leading-snug ${muted}`}>
                        Tenés tu horario anotado. Si necesitás cambiarlo, liberá la recuperación y elegí otro.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tu clase fija */}
              {clasesFijasOrdenadas.length > 0 && (
                <section className="mb-5 animate-savia-fade-up">
                  <h2 className={`text-xs font-semibold uppercase tracking-wider mb-3 px-0.5 ${muted}`}>
                    Tu clase fija
                  </h2>
                  <div className="space-y-3">
                    {clasesFijasOrdenadas.map((turno) => {
                      const turnoActual = turnosById.get(turno.id);
                      const liberada = !!turnoActual?.claseLiberada;
                      const fechaIso = getFechaFromSemanaYDia(semanaVistaIso, turno.diaSemana);
                      const fechaLabel = formatDate(fechaIso);
                      return (
                        <div
                          key={turno.id}
                          className={`${cardCls} p-5 ${
                            liberada
                              ? isSavia
                                ? 'border-savia-olive/30 bg-savia-oliveSoft/30'
                                : 'border-emerald-200'
                              : isSavia
                                ? 'border-savia-sand'
                                : 'border-amber-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p
                                className={`text-xs font-medium uppercase tracking-wide ${
                                  liberada
                                    ? isSavia
                                      ? 'text-savia-oliveDeep'
                                      : 'text-emerald-700'
                                    : isSavia
                                      ? 'text-savia-terra'
                                      : 'text-amber-700'
                                }`}
                              >
                                {liberada ? 'Ya liberaste' : 'Vas esta semana'}
                              </p>
                              <p
                                className={`mt-1.5 text-2xl font-semibold leading-none ${
                                  isSavia ? 'font-saviaDisplay text-savia-ink' : ink
                                }`}
                              >
                                {DIAS_CORTOS[turno.diaSemana]} {diaNumDeSemana(turno.diaSemana)}
                              </p>
                              <p className={`mt-2 text-3xl font-bold tabular-nums tracking-tight ${ink}`}>
                                {turno.hora}
                              </p>
                              <p className={`text-sm mt-1.5 ${muted}`}>
                                {fechaLabel}
                                {turno.titulo ? ` · ${turno.titulo}` : ''}
                              </p>
                            </div>
                          </div>
                          {turnoActual?.esClaseFija && (
                            <button
                              type="button"
                              onClick={() =>
                                liberada
                                  ? restaurarClaseSemana(turnoActual.id, turnoActual.liberacionId)
                                  : liberarClaseSemana(turnoActual.id)
                              }
                              disabled={!!actioning}
                              className={`mt-4 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-50 touch-manipulation transition-colors ${
                                liberada ? ctaRestaurar : ctaLiberar
                              }`}
                            >
                              {actioning === turnoActual.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : liberada ? (
                                <UserPlus className="w-4 h-4" />
                              ) : (
                                <UserMinus className="w-4 h-4" />
                              )}
                              {liberada ? 'Volver a tomarla' : 'No voy · Liberar'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Ya recuperás */}
              {recuperacionesOrdenadas.length > 0 && (
                <section className="mb-5 animate-savia-fade-up">
                  <h2 className={`text-xs font-semibold uppercase tracking-wider mb-3 px-0.5 ${muted}`}>
                    Ya recuperás
                  </h2>
                  <div className="space-y-3">
                    {recuperacionesOrdenadas.map((turno) => {
                      const fechaRecuperacion = formatDate(
                        getFechaFromSemanaYDia(semanaVistaIso, turno.diaSemana)
                      );
                      return (
                        <div
                          key={`rec-${turno.id}-${turno.recuperacionId}`}
                          className={`rounded-3xl p-5 ${
                            isSavia
                              ? 'border border-savia-olive/35 bg-gradient-to-br from-savia-oliveSoft to-savia-cream/80 shadow-[0_8px_28px_rgba(107,124,78,0.12)]'
                              : 'rounded-2xl border border-violet-200 bg-violet-50 shadow-lg'
                          }`}
                        >
                          <p
                            className={`text-xs font-medium uppercase tracking-wide ${
                              isSavia ? 'text-savia-oliveDeep' : 'text-violet-700'
                            }`}
                          >
                            Tu recuperación
                          </p>
                          <p
                            className={`mt-1.5 text-2xl font-semibold leading-none ${
                              isSavia ? 'font-saviaDisplay text-savia-ink' : ink
                            }`}
                          >
                            {DIAS_CORTOS[turno.diaSemana]} {diaNumDeSemana(turno.diaSemana)}
                          </p>
                          <p className={`mt-2 text-3xl font-bold tabular-nums tracking-tight ${ink}`}>
                            {turno.hora}
                          </p>
                          <p className={`text-sm mt-1.5 ${muted}`}>
                            {fechaRecuperacion}
                            {turno.titulo ? ` · ${turno.titulo}` : ''}
                          </p>
                          <button
                            type="button"
                            onClick={() => liberar(turno.id, turno.recuperacionId)}
                            disabled={!!actioning}
                            className={`mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 touch-manipulation ${
                              isSavia
                                ? 'text-savia-oliveDeep/80 hover:bg-white/50'
                                : 'text-violet-800 hover:bg-violet-100/80'
                            }`}
                          >
                            {actioning === turno.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <UserMinus className="w-4 h-4" />
                            )}
                            Liberar recuperación
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {clasesFijasOrdenadas.length === 0 && recuperacionesOrdenadas.length === 0 && (
                <div className={`${cardCls} p-5 mb-5 text-center animate-savia-fade-up`}>
                  <p className={`text-sm ${muted}`}>
                    No tenés clase fija cargada. Podés elegir un horario abajo si corresponde.
                  </p>
                </div>
              )}

              {/* Elegí horario — corazón */}
              <section className="animate-savia-fade-up">
                <div className="flex items-end justify-between gap-3 mb-3 px-0.5">
                  <div>
                    <h2
                      className={`text-lg font-semibold ${
                        isSavia ? 'font-saviaDisplay text-savia-ink' : ink
                      }`}
                    >
                      Elegí horario
                    </h2>
                    <p className={`text-xs mt-0.5 ${muted}`}>Tocá Recuperar en el que quieras</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void recargarRecuperar()}
                    disabled={cargandoSemana}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs disabled:opacity-50 ${
                      isSavia
                        ? 'text-savia-muted hover:text-savia-oliveDeep'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                    title="Actualizar"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${cargandoSemana ? 'animate-spin' : ''}`} />
                    Actualizar
                  </button>
                </div>

                {cuotaVencida && (
                  <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm font-semibold text-red-800">Cuota vencida</p>
                    <p className="text-xs text-red-700 mt-1 leading-snug">
                      Regularizá el pago para poder recuperar.
                      {tieneFechaVencimiento ? ` Venció el ${formatDate(fechaVencimiento)}.` : ''}
                    </p>
                  </div>
                )}

                {hayPoliticaAnticipacion && (
                  <p
                    className={`mb-3 text-xs rounded-xl px-3 py-2 leading-snug ${
                      isSavia
                        ? 'border border-savia-sandSoft bg-white/60 text-savia-muted'
                        : 'border border-gray-200 bg-white text-gray-600'
                    }`}
                  >
                    Liberar: <strong>{textoPlazoMinutos(mLib)}</strong> antes · Anotarse:{' '}
                    <strong>{textoPlazoMinutos(mAnot)}</strong> antes
                  </p>
                )}

                {/* Filtros sticky */}
                <div
                  className={`sticky z-10 -mx-1 px-1 py-2 mb-3 backdrop-blur-md ${
                    isSavia ? 'bg-savia-cream/85' : 'bg-slate-100/90'
                  }`}
                  style={{ top: 'env(safe-area-inset-top, 0px)' }}
                >
                  <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
                    <button
                      type="button"
                      onClick={() => setFiltroDia(null)}
                      className={`flex-shrink-0 px-3.5 py-2 rounded-full text-sm font-medium touch-manipulation ${
                        filtroDia === null ? chipRecuperar : chipIdle
                      }`}
                    >
                      Todos
                    </button>
                    {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setFiltroDia(d)}
                        className={`flex-shrink-0 px-3.5 py-2 rounded-full text-sm font-medium touch-manipulation ${
                          filtroDia === d
                            ? isSavia
                              ? chipRecuperar
                              : 'bg-violet-600 text-white'
                            : chipIdle
                        }`}
                      >
                        {DIAS_CORTOS[d]} {diaNumDeSemana(d)}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5 mt-1.5">
                    {(
                      [
                        { id: 'todos' as const, label: 'Todos' },
                        { id: 'manana' as const, label: 'Mañana' },
                        { id: 'tarde' as const, label: 'Tarde' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setFiltroHorario(opt.id)}
                        className={`px-3.5 py-2 rounded-full text-sm font-medium touch-manipulation ${
                          filtroHorario === opt.id
                            ? opt.id === 'tarde'
                              ? isSavia
                                ? 'bg-savia-olive text-white'
                                : 'bg-blue-600 text-white'
                              : opt.id === 'manana'
                                ? isSavia
                                  ? 'bg-savia-sand text-savia-ink'
                                  : 'bg-amber-500 text-white'
                                : isSavia
                                  ? chipActive
                                  : 'bg-violet-600 text-white'
                            : chipIdle
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {data.turnos.length === 0 ? (
                    <div className={`${cardCls} p-8 text-center`}>
                      <p className={`text-sm ${muted}`}>
                        Todavía no hay horarios. Cuando el estudio los cargue, van a aparecer acá.
                      </p>
                    </div>
                  ) : turnosOrdenados.length === 0 ? (
                    <div className={`${cardCls} p-8 text-center`}>
                      <p className={`font-medium ${ink}`}>No hay horarios con este filtro</p>
                      <p className={`text-sm mt-1.5 ${muted}`}>
                        Probá otro día, o volvé más tarde cuando se libere un lugar.
                      </p>
                      {(filtroDia !== null || filtroHorario !== 'todos') && (
                        <button
                          type="button"
                          onClick={() => {
                            setFiltroDia(null);
                            setFiltroHorario('todos');
                          }}
                          className={`mt-4 text-sm font-medium ${
                            isSavia ? 'text-savia-terra' : 'text-primary-600'
                          }`}
                        >
                          Ver todos los horarios
                        </button>
                      )}
                    </div>
                  ) : (
                    turnosOrdenados.map((t) => {
                      const libres = Math.max(0, t.cupo - t.inscriptos);
                      const llena = t.inscriptos >= t.cupo;
                      const pct =
                        t.cupo > 0 ? Math.min(100, Math.round((t.inscriptos / t.cupo) * 100)) : 0;
                      const fechaLabel = formatDate(
                        getFechaFromSemanaYDia(semanaVistaIso, t.diaSemana)
                      );
                      return (
                        <div
                          key={t.id}
                          className={`${cardCls} p-4 sm:p-5 ${
                            t.esClaseFija && !t.claseLiberada
                              ? isSavia
                                ? 'ring-1 ring-savia-sand'
                                : 'ring-1 ring-amber-200'
                              : t.yaInscripto
                                ? isSavia
                                  ? 'ring-1 ring-savia-olive/40'
                                  : 'ring-1 ring-violet-200'
                                : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p
                                className={`text-3xl font-bold tabular-nums tracking-tight leading-none ${ink}`}
                              >
                                {t.hora}
                              </p>
                              <p className={`mt-2 text-sm font-medium ${ink}`}>
                                {DIAS_CORTOS[t.diaSemana]} {diaNumDeSemana(t.diaSemana)}
                                <span className={`font-normal ${muted}`}> · {fechaLabel}</span>
                              </p>
                              {t.titulo ? (
                                <p className={`text-xs mt-0.5 truncate ${muted}`}>{t.titulo}</p>
                              ) : null}
                            </div>
                            <div className="text-right flex-shrink-0 pt-0.5">
                              <p
                                className={`text-xs font-semibold tabular-nums ${
                                  llena ? 'text-red-600' : isSavia ? 'text-savia-oliveDeep' : muted
                                }`}
                              >
                                {llena ? 'Llena' : libres === 1 ? '1 libre' : `${libres} libres`}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center gap-2.5">
                            <div
                              className={`h-2 flex-1 rounded-full overflow-hidden ${
                                isSavia ? 'bg-savia-sandSoft' : 'bg-gray-100'
                              }`}
                            >
                              <div
                                className={`h-full rounded-full transition-[width] ${
                                  llena
                                    ? 'bg-red-500'
                                    : libres <= 1
                                      ? isSavia
                                        ? 'bg-savia-sand'
                                        : 'bg-amber-400'
                                      : isSavia
                                        ? 'bg-savia-olive'
                                        : 'bg-emerald-500'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>

                          {t.esClaseFija && !t.claseLiberada && (
                            <p
                              className={`text-xs mt-2.5 font-medium ${
                                isSavia ? 'text-savia-terra' : 'text-amber-700'
                              }`}
                            >
                              Tu clase fija
                            </p>
                          )}
                          {t.esClaseFija && t.claseLiberada && (
                            <p
                              className={`text-xs mt-2.5 font-medium ${
                                isSavia ? 'text-savia-oliveDeep' : 'text-emerald-700'
                              }`}
                            >
                              Ya liberaste este horario
                            </p>
                          )}

                          <div className="mt-4">
                            {t.yaInscripto ? (
                              <button
                                type="button"
                                onClick={() => liberar(t.id, t.recuperacionId)}
                                disabled={!!actioning}
                                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-50 touch-manipulation ${ctaLiberar}`}
                              >
                                {actioning === t.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <UserMinus className="w-4 h-4" />
                                )}
                                Liberar
                              </button>
                            ) : t.esClaseFija && !t.claseLiberada ? (
                              <button
                                type="button"
                                onClick={() => liberarClaseSemana(t.id)}
                                disabled={!!actioning}
                                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-50 touch-manipulation ${ctaLiberar}`}
                              >
                                {actioning === t.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <UserMinus className="w-4 h-4" />
                                )}
                                No voy · Liberar
                              </button>
                            ) : t.esClaseFija && t.claseLiberada ? (
                              <button
                                type="button"
                                onClick={() => restaurarClaseSemana(t.id, t.liberacionId)}
                                disabled={!!actioning}
                                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-50 touch-manipulation ${ctaRestaurar}`}
                              >
                                {actioning === t.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <UserPlus className="w-4 h-4" />
                                )}
                                Volver a tomarla
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => inscribir(t.id)}
                                disabled={!!actioning || llena || cuotaVencida}
                                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation ${
                                  isSavia
                                    ? 'bg-savia-olive text-white hover:bg-savia-oliveDeep shadow-sm'
                                    : 'bg-violet-600 text-white hover:bg-violet-700'
                                }`}
                              >
                                {actioning === t.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Sparkles className="w-4 h-4" />
                                )}
                                {cuotaVencida ? 'Cuota vencida' : llena ? 'Llena' : 'Recuperar'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              <div className="mt-8 text-center animate-savia-soft-in">
                <button
                  type="button"
                  onClick={() => setSeccionActiva('perfil')}
                  className={`text-xs font-medium underline-offset-2 hover:underline ${muted}`}
                >
                  Mi perfil
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ─── Modo fijo (sin cambios mayores) ─── */
  const seccionFijo = seccionActiva === 'perfil' ? 'perfil' : 'clases';

  return (
    <div
      className={`min-h-screen safe-bottom ${
        isSavia ? 'portal-savia-shell font-savia' : 'bg-slate-100'
      }`}
    >
      <div className="max-w-lg mx-auto px-4 pb-10 safe-top pt-4 sm:pt-6 animate-savia-fade-up">
        <div className={`${cardCls} p-5 mb-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-start gap-3">
              <img
                src={logoSrc}
                alt={marcaTitulo}
                className={`w-14 h-14 rounded-full object-cover flex-shrink-0 shadow-md animate-savia-soft-in ${
                  isSavia ? 'ring-2 ring-savia-sandSoft' : 'ring-2 ring-primary-100'
                }`}
              />
              <div className="min-w-0">
                {isSavia ? (
                  <>
                    <h1 className="font-saviaDisplay text-2xl tracking-[0.12em] text-savia-ink uppercase leading-tight">
                      Savia
                    </h1>
                    <p className="font-saviaDisplay text-base text-savia-terra italic -mt-0.5">Pilates</p>
                  </>
                ) : (
                  <h1 className={`text-lg font-bold flex items-center gap-2 ${ink}`}>
                    <Calendar className="w-5 h-5 text-primary-600" />
                    {marcaTitulo}
                  </h1>
                )}
                <p className={`text-sm font-semibold mt-2 truncate ${ink}`}>{nombreCompleto}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      isSavia
                        ? 'bg-savia-terraSoft text-savia-terraDeep border border-savia-sand'
                        : 'bg-primary-100 text-primary-800'
                    }`}
                  >
                    Modo clases
                  </span>
                  {data.alumno.actividadNombre && (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                        isSavia
                          ? 'bg-savia-creamDeep text-savia-muted border border-savia-sandSoft'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {data.alumno.actividadNombre}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={cerrarSesionPortal}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                isSavia
                  ? 'text-savia-muted hover:text-savia-ink hover:bg-savia-creamDeep/80'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
          <p className={`text-sm mt-3 ${muted}`}>
            Acá podés ver tus clases, tu estado de cuota y gestionar tus reservas.
          </p>
          <div
            className={`mt-4 grid grid-cols-2 gap-2 p-1 rounded-2xl ${
              isSavia ? 'bg-savia-creamDeep/70' : 'bg-gray-100'
            }`}
          >
            <button
              type="button"
              onClick={() => setSeccionActiva('clases')}
              className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                seccionFijo === 'clases'
                  ? isSavia
                    ? 'bg-white text-savia-terraDeep shadow-sm'
                    : 'bg-primary-600 text-white'
                  : isSavia
                    ? 'text-savia-muted hover:text-savia-ink'
                    : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              Mis clases
            </button>
            <button
              type="button"
              onClick={() => setSeccionActiva('perfil')}
              className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                seccionFijo === 'perfil'
                  ? isSavia
                    ? 'bg-white text-savia-terraDeep shadow-sm'
                    : 'bg-primary-600 text-white'
                  : isSavia
                    ? 'text-savia-muted hover:text-savia-ink'
                    : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              Mi perfil
            </button>
          </div>
        </div>

        {seccionFijo === 'clases' ? (
          <>
            <div className={`${cardCls} p-4 mb-4`}>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className={`w-4 h-4 ${isSavia ? 'text-savia-terra' : 'text-primary-600'}`} />
                <h2 className={`text-sm font-semibold ${ink}`}>Mis clases</h2>
              </div>
              {clasesFijasOrdenadas.length === 0 ? (
                <p className={`text-sm ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
                  Todavía no tenés clases cargadas.
                </p>
              ) : (
                <div className="space-y-2">
                  {clasesFijasOrdenadas.map((turno) => {
                    const turnoActual = turnosById.get(turno.id);
                    return (
                      <div
                        key={turno.id}
                        className={`rounded-2xl px-3 py-3 flex items-center justify-between gap-3 ${
                          isSavia
                            ? 'border border-savia-sandSoft bg-savia-cream/40'
                            : 'rounded-lg border border-gray-200'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold ${ink}`}>
                            {NOMBRE_DIA[turno.diaSemana] ?? `Día ${turno.diaSemana}`} {turno.hora}
                          </p>
                          <p className={`text-xs mt-0.5 ${muted}`}>{turno.titulo || 'Clase'}</p>
                        </div>
                        {turnoActual?.yaInscripto && (
                          <div className="flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => liberar(turnoActual.id, turnoActual.recuperacionId)}
                              disabled={!!actioning}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-medium text-sm disabled:opacity-50 touch-manipulation ${ctaLiberar}`}
                            >
                              {actioning === turnoActual.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <UserMinus className="w-4 h-4" />
                              )}
                              Liberar cupo
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={`${cardCls} p-4 mb-4`}>
              <div className="mb-3">
                <h2 className={`text-sm font-semibold ${ink}`}>Anotarte o liberar una clase</h2>
                <p className={`text-xs mt-1 ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
                  Filtrá por día u horario para encontrar rápido tu clase.
                </p>
                {hayPoliticaAnticipacion && (
                  <p
                    className={`text-xs mt-2 rounded-xl px-2.5 py-2 leading-snug ${
                      isSavia
                        ? 'border border-savia-sandSoft bg-savia-creamDeep/60 text-savia-muted'
                        : 'border border-gray-200 bg-gray-50 text-gray-600'
                    }`}
                  >
                    Liberar cupo: <strong>{textoPlazoMinutos(mLib)}</strong> antes de cada turno.
                    Anotarse o recuperar: <strong>{textoPlazoMinutos(mAnot)}</strong> antes de cada
                    turno.
                  </p>
                )}
              </div>
              <p className={`text-xs font-medium mb-2 ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
                Ver día
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  type="button"
                  onClick={() => setFiltroDia(null)}
                  className={`px-3 py-2 rounded-full text-sm font-medium touch-manipulation ${
                    filtroDia === null ? chipActive : chipIdle
                  }`}
                >
                  Todos
                </button>
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setFiltroDia(d)}
                    className={`px-3 py-2 rounded-full text-sm font-medium touch-manipulation ${
                      filtroDia === d ? chipActive : chipIdle
                    }`}
                  >
                    {DIAS_CORTOS[d]}
                  </button>
                ))}
              </div>
              <p className={`text-xs font-medium mb-2 ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
                Ver horario (según tu sede)
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setFiltroHorario('todos')}
                  className={`px-3 py-2 rounded-full text-sm font-medium touch-manipulation ${
                    filtroHorario === 'todos' ? chipActive : chipIdle
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroHorario('manana')}
                  className={`px-3 py-2 rounded-full text-sm font-medium touch-manipulation ${
                    filtroHorario === 'manana'
                      ? isSavia
                        ? 'bg-savia-sand text-savia-ink'
                        : 'bg-amber-500 text-white'
                      : isSavia
                        ? 'bg-savia-terraSoft text-savia-terraDeep border border-savia-sand'
                        : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  Mañana ({labelManana})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroHorario('tarde')}
                  className={`px-3 py-2 rounded-full text-sm font-medium touch-manipulation ${
                    filtroHorario === 'tarde'
                      ? isSavia
                        ? 'bg-savia-olive text-white'
                        : 'bg-blue-600 text-white'
                      : isSavia
                        ? 'bg-savia-oliveSoft text-savia-oliveDeep border border-savia-olive/25'
                        : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  Tarde ({labelTarde})
                </button>
              </div>
              <p className={`text-xs mt-2 ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
                Si no ves una clase, probá con «Todos».
              </p>
            </div>

            <div className="space-y-4">
              {data.turnos.length === 0 ? (
                <div className={`${cardCls} p-6 text-center ${muted}`}>
                  Todavía no hay clases cargadas. Cuando el estudio agregue turnos, van a aparecer acá.
                </div>
              ) : turnosOrdenados.length === 0 ? (
                <div className={`${cardCls} p-6 text-center`}>
                  <p className={`font-medium ${ink}`}>No hay clases con el filtro elegido</p>
                  <p className={`text-sm mt-1 ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
                    Probá con otro día u horario.
                  </p>
                </div>
              ) : (
                diasConTurnos.map((dia) => (
                  <div key={dia}>
                    <h2 className={`text-sm font-semibold mb-2 px-1 ${headingDay}`}>
                      {NOMBRE_DIA[dia] ?? `Día ${dia}`}
                    </h2>
                    <div className="space-y-2">
                      {porDia[dia].map((t) => (
                        <div
                          key={t.id}
                          className={`${cardCls} p-4 flex items-center justify-between gap-3`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className={`font-semibold truncate ${ink}`}>{t.titulo || 'Clase'}</p>
                            <p className={`text-sm ${muted}`}>{t.hora}</p>
                            <p className={`text-xs ${isSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
                              {t.inscriptos}/{t.cupo} inscriptos
                            </p>
                          </div>
                          <div className="flex-shrink-0">
                            {t.yaInscripto ? (
                              <button
                                type="button"
                                onClick={() => liberar(t.id, t.recuperacionId)}
                                disabled={!!actioning}
                                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-medium text-sm disabled:opacity-50 touch-manipulation ${ctaLiberar}`}
                              >
                                {actioning === t.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <UserMinus className="w-4 h-4" />
                                )}
                                Liberar cupo
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => inscribir(t.id)}
                                disabled={!!actioning || t.inscriptos >= t.cupo}
                                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation ${ctaPrimary}`}
                              >
                                {actioning === t.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <UserPlus className="w-4 h-4" />
                                )}
                                Sumarme
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
          perfilPanel
        )}
      </div>
    </div>
  );
};

export default MiClase;
