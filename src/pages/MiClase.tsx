import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, UserPlus, UserMinus, Loader2 } from 'lucide-react';
import { DIAS_SEMANA } from '../types';
import { getSemanaActual, getSemanaSiguiente, getRangoSemana } from '../utils/date';
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
};

type PortalData = {
  alumno: { id: string; nombre: string; apellido: string };
  turnos: TurnoPortal[];
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
};

type SucursalOption = { id: string; nombre_lugar: string };

const NOMBRE_DIA = [...DIAS_SEMANA, 'Domingo'];
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const horaToNum = (hora: string): number => {
  const [h] = hora.split(':').map(Number);
  return h ?? 0;
};

/** Formatea "07:00"-"12:00" como "7–12h" para etiquetas */
function formatRangoHorario(ini: string, fin: string): string {
  const a = horaToNum(ini);
  const b = horaToNum(fin);
  return `${a}–${b}h`;
}

type PortalAuth = { type: 'token'; token: string } | { type: 'dni'; dni: string; sucursalId: string };

const DEFAULT_HORARIOS: HorariosPortal = {
  horaInicioManana: '07:00',
  horaFinManana: '12:00',
  horaInicioTarde: '16:00',
  horaFinTarde: '21:00',
};

const MiClase = () => {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';
  const sucursalIdFromUrl = searchParams.get('sucursalId') || '';
  const modoFromUrl = (searchParams.get('modo') || 'fijo').toLowerCase() === 'recuperar' ? 'recuperar' : 'fijo';
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [portalAuth, setPortalAuth] = useState<PortalAuth | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [filtroDia, setFiltroDia] = useState<number | null>(null);
  const [filtroHorario, setFiltroHorario] = useState<'todos' | 'manana' | 'tarde'>('todos');
  const [dniInput, setDniInput] = useState('');
  const [sucursales, setSucursales] = useState<SucursalOption[]>([]);
  const [enviandoDni, setEnviandoDni] = useState(false);
  /** Solo en modo recuperar: 'actual' | 'siguiente' para elegir semana */
  const [semanaElegida, setSemanaElegida] = useState<'actual' | 'siguiente'>('actual');
  const [cargandoSemana, setCargandoSemana] = useState(false);
  const prevSemanaElegida = useRef<'actual' | 'siguiente' | null>(null);

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
      const res = await fetch(url);
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
      const res = await fetch(`${base}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'No se pudo inscribir.');
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
      const res = await fetch(`${base}${endpoint}`, {
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
      const res = await fetch(`${base}/api/alumno-portal/liberar-clase-semana`, {
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
      const res = await fetch(`${base}/api/alumno-portal/restaurar-clase-semana`, {
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
    const sinSede = !tokenFromUrl && !sucursalIdFromUrl.trim();
    const tituloPortal = modoFromUrl === 'recuperar' ? 'Recuperar clase' : 'Mis clases';
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full">
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-2">
            <Calendar className="w-5 h-5 text-primary-600" />
            {tituloPortal}
          </h1>
          {sinSede ? (
            <p className="text-sm text-gray-600">
              Este link no indica la sede. Pedile al estudio que te comparta el link de tu sede (el mismo para todos los alumnos de esa sede).
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-2">
                {modoFromUrl === 'recuperar'
                  ? 'Ingresá tu DNI para ver la semana actual u otra y elegir día para recuperar.'
                  : 'Ingresá tu DNI para ver tus clases, sumarte o liberar cupo. Se busca solo en la sede de este link.'}
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
                </form>
              )}
              {!sinSede && <p className="text-xs text-gray-500 mt-4">Si tenés un link con token, usalo directamente desde ahí.</p>}
            </>
          )}
        </div>
      </div>
    );
  }

  const horarios = data.horarios || DEFAULT_HORARIOS;
  const iniManana = horaToNum(horarios.horaInicioManana);
  const finManana = horaToNum(horarios.horaFinManana);
  const iniTarde = horaToNum(horarios.horaInicioTarde);
  const finTarde = horaToNum(horarios.horaFinTarde);

  const turnosFiltrados = data.turnos.filter((t) => {
    if (filtroDia !== null && t.diaSemana !== filtroDia) return false;
    const h = horaToNum(t.hora);
    if (filtroHorario === 'manana') return h >= iniManana && h <= finManana;
    if (filtroHorario === 'tarde') return h >= iniTarde && h <= finTarde;
    return true;
  });

  const turnosOrdenados = [...turnosFiltrados].sort(
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

  const esRecuperar = data.modo === 'recuperar';
  const semanaActualLabel = getRangoSemana(getSemanaActual());
  const semanaSiguienteLabel = getRangoSemana(getSemanaSiguiente(getSemanaActual()));

  return (
    <div className="min-h-screen bg-gray-100 pb-safe">
      <div className="max-w-lg mx-auto p-4 pt-6">
        <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary-600" />
            {esRecuperar ? 'Recuperar clase' : 'Mis clases'}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {esRecuperar
              ? `Hola, ${nombreCompleto}. Elegí la semana y sumate a una clase para recuperar o liberá tu recuperación.`
              : `Hola, ${nombreCompleto}. Acá podés sumarte a una clase o liberar tu cupo.`}
          </p>
          {esRecuperar && data.recuperacionStats && (
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
          </div>
        )}

        <div className="bg-white rounded-xl shadow p-3 mb-4">
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
      </div>
    </div>
  );
};

export default MiClase;
