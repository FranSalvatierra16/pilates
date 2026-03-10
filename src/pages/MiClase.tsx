import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, UserPlus, UserMinus, Loader2 } from 'lucide-react';
import { DIAS_SEMANA } from '../types';

const getBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

type TurnoPortal = {
  id: string;
  diaSemana: number;
  hora: string;
  titulo: string;
  cupo: number;
  inscriptos: number;
  yaInscripto: boolean;
};

type PortalData = {
  alumno: { id: string; nombre: string; apellido: string };
  turnos: TurnoPortal[];
};

const NOMBRE_DIA = [...DIAS_SEMANA, 'Domingo'];
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const horaToNum = (hora: string): number => {
  const [h] = hora.split(':').map(Number);
  return h ?? 0;
};

const MiClase = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [filtroDia, setFiltroDia] = useState<number | null>(null);
  const [filtroHorario, setFiltroHorario] = useState<'todos' | 'manana' | 'tarde'>('todos');

  useEffect(() => {
    if (!token.trim()) {
      setError('Faltó el link. Pedile al estudio el link para gestionar tus clases.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const base = getBase();
        const res = await fetch(`${base}/api/alumno-portal?token=${encodeURIComponent(token)}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (!cancelled) setError(err.error || 'Link inválido o expirado.');
          if (!cancelled) setLoading(false);
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setError('');
        }
      } catch (e) {
        if (!cancelled) setError('No se pudo cargar. Revisá tu conexión.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const inscribir = async (turnoId: string) => {
    setActioning(turnoId);
    try {
      const base = getBase();
      const res = await fetch(`${base}/api/alumno-portal/inscribir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, turnoId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error || 'No se pudo inscribir.');
        return;
      }
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
    } finally {
      setActioning(null);
    }
  };

  const liberar = async (turnoId: string) => {
    setActioning(turnoId);
    try {
      const base = getBase();
      const res = await fetch(`${base}/api/alumno-portal/liberar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, turnoId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || 'No se pudo liberar el cupo.');
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              turnos: prev.turnos.map((t) =>
                t.id === turnoId ? { ...t, yaInscripto: false, inscriptos: t.inscriptos - 1 } : t
              ),
            }
          : null
      );
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

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <p className="text-sm text-gray-500 mt-2">Si el link se venció, pedile al estudio que te envíe uno nuevo.</p>
        </div>
      </div>
    );
  }

  const nombreCompleto = [data.alumno.apellido, data.alumno.nombre].filter(Boolean).join(', ') || 'Alumno';

  const turnosFiltrados = data.turnos.filter((t) => {
    if (filtroDia !== null && t.diaSemana !== filtroDia) return false;
    const h = horaToNum(t.hora);
    if (filtroHorario === 'manana') return h >= 7 && h < 12;
    if (filtroHorario === 'tarde') return h >= 16 && h <= 21;
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

  return (
    <div className="min-h-screen bg-gray-100 pb-safe">
      <div className="max-w-lg mx-auto p-4 pt-6">
        <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary-600" />
            Mis clases
          </h1>
          <p className="text-sm text-gray-600 mt-1">Hola, {nombreCompleto}. Acá podés sumarte a una clase o liberar tu cupo.</p>
        </div>

        {/* Filtros: día y horario */}
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
          <p className="text-xs font-medium text-gray-500 mb-2">Ver horario</p>
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
              Mañana (7–12h)
            </button>
            <button
              type="button"
              onClick={() => setFiltroHorario('tarde')}
              className={`px-3 py-2 rounded-lg text-sm font-medium touch-manipulation ${filtroHorario === 'tarde' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'}`}
            >
              Tarde (16–21h)
            </button>
          </div>
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
                        <p className="text-sm text-gray-600">
                          {t.hora}
                        </p>
                        <p className="text-xs text-gray-500">
                          {t.inscriptos}/{t.cupo} inscriptos
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        {t.yaInscripto ? (
                          <button
                            type="button"
                            onClick={() => liberar(t.id)}
                            disabled={!!actioning}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 font-medium text-sm disabled:opacity-50 touch-manipulation"
                          >
                            {actioning === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                            Liberar cupo
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => inscribir(t.id)}
                            disabled={!!actioning || t.inscriptos >= t.cupo}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                          >
                            {actioning === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
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
      </div>
    </div>
  );
};

export default MiClase;
