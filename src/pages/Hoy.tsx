import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, HeartPulse, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { storageHybrid } from '../utils/storage-hybrid';
import { avisosFicha } from '../data/fichaSalud';
import { getSemanaActual } from '../utils/date';
import type { Alumno, Asistencia, InscripcionTurno, LiberacionSemana, Recuperacion, Turno } from '../types';
import { DIAS_SEMANA } from '../types';

function diaHoyIndex() {
  const js = new Date().getDay();
  return js === 0 ? 6 : js - 1;
}

type Persona = {
  id: string;
  turnoId: string;
  nombre: string;
  recuperacion: boolean;
  avisos: string[];
};

export default function Hoy() {
  const { sucursalNombre } = useAuth();
  const esSavia = /savia/i.test(sucursalNombre || '');
  const semana = getSemanaActual();
  const dia = diaHoyIndex();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [guardandoKey, setGuardandoKey] = useState<string | null>(null);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [inscripciones, setInscripciones] = useState<InscripcionTurno[]>([]);
  const [recuperaciones, setRecuperaciones] = useState<Recuperacion[]>([]);
  const [liberaciones, setLiberaciones] = useState<LiberacionSemana[]>([]);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [als, ts, ins, recs, libs, asis] = await Promise.all([
        storageHybrid.alumnos.getAll(),
        storageHybrid.turnos.getAll(),
        storageHybrid.inscripcionesTurno.getAll(),
        storageHybrid.recuperaciones.getBySemana(semana),
        storageHybrid.liberacionesSemana.getBySemana(semana),
        storageHybrid.asistencias.getBySemana(semana),
      ]);
      setAlumnos(als);
      setTurnos(ts);
      setInscripciones(ins);
      setRecuperaciones(recs);
      setLiberaciones(libs);
      setAsistencias(asis);
    } catch {
      setError('No se pudo cargar la clase de hoy.');
    } finally {
      setCargando(false);
    }
  }, [semana]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const bloques = useMemo(() => {
    const porHora = new Map<string, { titulo: string; vienen: Map<string, Persona>; noVienen: Map<string, string> }>();
    const alumnoDe = (id: string) => alumnos.find((a) => a.id === id && a.activo !== false);

    for (const turno of turnos) {
      if (turno.diaSemana !== dia) continue;
      const bucket = porHora.get(turno.hora) || {
        titulo: turno.titulo?.trim() || 'Clase',
        vienen: new Map<string, Persona>(),
        noVienen: new Map<string, string>(),
      };
      if (!porHora.has(turno.hora) && turno.titulo?.trim()) bucket.titulo = turno.titulo.trim();
      porHora.set(turno.hora, bucket);

      for (const id of turno.alumnoIds || []) {
        const alumno = alumnoDe(id);
        if (!alumno) continue;
        const ins = inscripciones.find((i) => i.turnoId === turno.id && i.alumnoId === id);
        if (ins && ins.semanaDesde > semana) continue;
        const nombre = `${alumno.nombre} ${alumno.apellido}`.trim();
        const liberada = liberaciones.some((l) => l.turnoId === turno.id && l.alumnoId === id);
        if (liberada) {
          if (!bucket.vienen.has(id)) bucket.noVienen.set(id, nombre);
          continue;
        }
        bucket.noVienen.delete(id);
        bucket.vienen.set(id, {
          id,
          turnoId: turno.id,
          nombre,
          recuperacion: false,
          avisos: avisosFicha(alumno.fichaSalud).map((a) => a.texto),
        });
      }

      for (const rec of recuperaciones) {
        if (rec.turnoId !== turno.id) continue;
        const alumno = alumnoDe(rec.alumnoId);
        if (!alumno) continue;
        const nombre = `${alumno.nombre} ${alumno.apellido}`.trim();
        bucket.noVienen.delete(alumno.id);
        bucket.vienen.set(alumno.id, {
          id: alumno.id,
          turnoId: turno.id,
          nombre,
          recuperacion: true,
          avisos: avisosFicha(alumno.fichaSalud).map((a) => a.texto),
        });
      }
    }

    return [...porHora.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hora, bucket]) => ({
        hora,
        titulo: bucket.titulo,
        vienen: [...bucket.vienen.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
        noVienen: [...bucket.noVienen.values()].sort((a, b) => a.localeCompare(b, 'es')),
      }))
      .filter((b) => b.vienen.length > 0 || b.noVienen.length > 0);
  }, [alumnos, turnos, inscripciones, recuperaciones, liberaciones, dia, semana]);

  const estadoDe = (turnoId: string, alumnoId: string): 'asistio' | 'no_asistio' | null => {
    const a = asistencias.find((x) => x.turnoId === turnoId && x.alumnoId === alumnoId && x.semana === semana);
    return a?.estado || null;
  };

  const marcar = async (persona: Persona, estado: 'asistio' | 'no_asistio') => {
    const key = `${persona.turnoId}-${persona.id}-${estado}`;
    if (guardandoKey) return;
    setGuardandoKey(key);
    try {
      const existente = asistencias.find(
        (x) => x.turnoId === persona.turnoId && x.alumnoId === persona.id && x.semana === semana
      );
      const alumno = alumnos.find((a) => a.id === persona.id);
      const eraNoAsistio = existente?.estado === 'no_asistio';
      const siguienteEstado = existente ? (existente.estado === estado ? null : estado) : estado;
      const seraNoAsistio = siguienteEstado === 'no_asistio';
      const teniaCredito = existente?.creditoOtorgado === true;

      if (existente) {
        const updates: Partial<Asistencia> =
          existente.estado === estado
            ? { estado: null, creditoOtorgado: false }
            : { estado, creditoOtorgado: false };
        await storageHybrid.asistencias.update(existente.id, updates);
        setAsistencias((prev) =>
          prev.map((a) => (a.id === existente.id ? { ...a, ...updates } : a))
        );
      } else {
        const nueva: Asistencia = {
          id: `${Date.now()}-${persona.id}`,
          turnoId: persona.turnoId,
          alumnoId: persona.id,
          estado,
          creditoOtorgado: false,
          semana,
          createdAt: new Date().toISOString(),
        };
        await storageHybrid.asistencias.add(nueva);
        setAsistencias((prev) => [...prev, nueva]);
      }

      if (alumno && eraNoAsistio && !seraNoAsistio && teniaCredito) {
        const nuevoCredito = Math.max(0, (alumno.clasesParaRecuperar || 0) - 1);
        await storageHybrid.alumnos.update(persona.id, { clasesParaRecuperar: nuevoCredito });
        setAlumnos((prev) =>
          prev.map((a) => (a.id === persona.id ? { ...a, clasesParaRecuperar: nuevoCredito } : a))
        );
      }
    } catch {
      setError('No se pudo guardar la asistencia. Probá de nuevo.');
      const asis = await storageHybrid.asistencias.getBySemana(semana).catch(() => null);
      if (asis) setAsistencias(asis);
    } finally {
      setGuardandoKey(null);
    }
  };

  const hoyLabel = new Date().toLocaleDateString('es-AR');
  const nombreDia = DIAS_SEMANA[dia] || 'Hoy';

  return (
    <div className={`pb-8 ${esSavia ? 'font-savia' : ''}`}>
      <div className="page-title-wrap mb-2">
        <span className="page-title-accent" aria-hidden />
        <h1 className="page-title">Hoy</h1>
      </div>
      <p className={`mb-6 text-sm ${esSavia ? 'text-savia-muted' : 'text-gray-600'}`}>
        {nombreDia} {hoyLabel}. Marcá ✓ o ✗. Si hay algo en la ficha, se ve al lado del nombre.
      </p>

      {cargando && (
        <div className="card flex items-center gap-3 text-sm">
          <Loader2 className={`w-5 h-5 animate-spin ${esSavia ? 'text-savia-olive' : 'text-primary-600'}`} />
          Cargando la clase…
        </div>
      )}

      {error && <div className="card text-sm text-red-800 mb-4">{error}</div>}

      {!cargando && !error && bloques.length === 0 && (
        <div className="card text-sm text-gray-600">Hoy no hay clases con gente anotada.</div>
      )}

      <div className="space-y-4">
        {bloques.map((bloque) => (
          <section key={bloque.hora} className="card">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <h2 className={`text-lg font-semibold ${esSavia ? 'font-saviaDisplay text-savia-ink' : 'text-gray-900'}`}>
                {bloque.hora}
              </h2>
              <p className={`text-sm ${esSavia ? 'text-savia-muted' : 'text-gray-500'}`}>{bloque.titulo}</p>
            </div>
            <ul className="space-y-3">
              {bloque.vienen.map((persona) => {
                const estado = estadoDe(persona.turnoId, persona.id);
                const busy = guardandoKey?.startsWith(`${persona.turnoId}-${persona.id}-`);
                return (
                  <li key={`${persona.turnoId}-${persona.id}`}>
                    <div className="flex items-start gap-2">
                      {persona.avisos.length > 0 && (
                        <HeartPulse className="w-4 h-4 mt-1.5 flex-shrink-0 text-rose-700" aria-label="Ficha con aviso" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${esSavia ? 'text-savia-ink' : 'text-gray-900'}`}>
                          {persona.nombre}
                          {persona.recuperacion && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                              <RefreshCw className="w-3 h-3" />
                              Recuperación
                            </span>
                          )}
                        </p>
                        {persona.avisos.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {persona.avisos.map((texto) => (
                              <li key={texto} className="text-sm text-rose-900 leading-snug">
                                {texto}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => void marcar(persona, 'asistio')}
                          className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center touch-manipulation disabled:opacity-50 ${
                            estado === 'asistio'
                              ? 'bg-green-600 text-white'
                              : esSavia
                                ? 'bg-savia-creamDeep text-savia-muted'
                                : 'bg-gray-200 text-gray-600'
                          }`}
                          title="Asistió"
                          aria-label="Asistió"
                        >
                          <Check className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => void marcar(persona, 'no_asistio')}
                          className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center touch-manipulation disabled:opacity-50 ${
                            estado === 'no_asistio'
                              ? 'bg-red-600 text-white'
                              : esSavia
                                ? 'bg-savia-creamDeep text-savia-muted'
                                : 'bg-gray-200 text-gray-600'
                          }`}
                          title="No asistió"
                          aria-label="No asistió"
                        >
                          <XCircle className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {bloque.noVienen.length > 0 && (
              <p className={`mt-3 text-xs ${esSavia ? 'text-savia-muted' : 'text-gray-500'}`}>
                No viene: {bloque.noVienen.join(', ')}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
