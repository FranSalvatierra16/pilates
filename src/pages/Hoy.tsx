import { useEffect, useMemo, useState } from 'react';
import { HeartPulse, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { storageHybrid } from '../utils/storage-hybrid';
import { avisosFicha } from '../data/fichaSalud';
import { formatDate, getSemanaActual } from '../utils/date';
import type { Alumno, InscripcionTurno, LiberacionSemana, Recuperacion, Turno } from '../types';
import { DIAS_SEMANA } from '../types';

function diaHoyIndex() {
  const js = new Date().getDay();
  return js === 0 ? 6 : js - 1;
}

type Persona = {
  id: string;
  nombre: string;
  recuperacion: boolean;
  avisos: string[];
};

type Bloque = {
  hora: string;
  titulo: string;
  vienen: Persona[];
  noVienen: string[];
};

export default function Hoy() {
  const { sucursalNombre } = useAuth();
  const esSavia = /savia/i.test(sucursalNombre || '');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [inscripciones, setInscripciones] = useState<InscripcionTurno[]>([]);
  const [recuperaciones, setRecuperaciones] = useState<Recuperacion[]>([]);
  const [liberaciones, setLiberaciones] = useState<LiberacionSemana[]>([]);

  useEffect(() => {
    let vivo = true;
    const semana = getSemanaActual();
    setCargando(true);
    setError('');
    Promise.all([
      storageHybrid.alumnos.getAll(),
      storageHybrid.turnos.getAll(),
      storageHybrid.inscripcionesTurno.getAll(),
      storageHybrid.recuperaciones.getBySemana(semana),
      storageHybrid.liberacionesSemana.getBySemana(semana),
    ])
      .then(([als, ts, ins, recs, libs]) => {
        if (!vivo) return;
        setAlumnos(als);
        setTurnos(ts);
        setInscripciones(ins);
        setRecuperaciones(recs);
        setLiberaciones(libs);
      })
      .catch(() => {
        if (vivo) setError('No se pudo cargar la clase de hoy.');
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const dia = diaHoyIndex();
  const semana = getSemanaActual();
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
          nombre,
          recuperacion: true,
          avisos: avisosFicha(alumno.fichaSalud).map((a) => a.texto),
        });
      }
    }

    const lista: Bloque[] = [...porHora.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hora, bucket]) => ({
        hora,
        titulo: bucket.titulo,
        vienen: [...bucket.vienen.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
        noVienen: [...bucket.noVienen.values()].sort((a, b) => a.localeCompare(b, 'es')),
      }))
      .filter((b) => b.vienen.length > 0 || b.noVienen.length > 0);
    return lista;
  }, [alumnos, turnos, inscripciones, recuperaciones, liberaciones, dia, semana]);

  const hoyLabel = formatDate(new Date().toISOString().slice(0, 10));
  const nombreDia = DIAS_SEMANA[dia] || 'Hoy';

  return (
    <div className={`pb-8 ${esSavia ? 'font-savia' : ''}`}>
      <div className="page-title-wrap mb-2">
        <span className="page-title-accent" aria-hidden />
        <h1 className="page-title">Hoy</h1>
      </div>
      <p className={`mb-6 text-sm ${esSavia ? 'text-savia-muted' : 'text-gray-600'}`}>
        {nombreDia} {hoyLabel}. Quién viene, y si la ficha tiene algo para cuidar.
      </p>

      {cargando && (
        <div className="card flex items-center gap-3 text-sm">
          <Loader2 className={`w-5 h-5 animate-spin ${esSavia ? 'text-savia-olive' : 'text-primary-600'}`} />
          Cargando la clase…
        </div>
      )}

      {error && <div className="card text-sm text-red-800">{error}</div>}

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
              {bloque.vienen.map((persona) => (
                <li key={persona.id}>
                  <div className="flex items-start gap-2">
                    {persona.avisos.length > 0 && (
                      <HeartPulse className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-700" aria-label="Ficha con aviso" />
                    )}
                    <div className="min-w-0">
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
                  </div>
                </li>
              ))}
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
