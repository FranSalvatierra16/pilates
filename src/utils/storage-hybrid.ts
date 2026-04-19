import { Alumno, Actividad, Pago, Turno, Gasto, Asistencia, Profesor, Recuperacion, AsistenciaHistorialItem, InscripcionTurno, CierreCaja, AgendaNota, LiberacionSemana } from '../types';
import { buildCierreRetiro } from './cierre-caja';
import { horaActualInput } from './date';
import { storage } from './storage';
import { storageSupabase } from './storage-supabase';
import { storageApi } from './storage-api';

// En producción usamos la API por defecto (así funciona aunque Docker no reciba VITE_USE_API)
const useApi = () => {
  if (import.meta.env.VITE_USE_API === 'false') return false;
  if (import.meta.env.VITE_USE_API === 'true') return true;
  return import.meta.env.PROD;
};

const useSupabase = () => {
  if (useApi()) return false;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return !!(url && url.length > 0 && key && key.length > 0);
};

const backend = () => (useApi() ? storageApi : useSupabase() ? storageSupabase : null);

export const storageHybrid = {
  alumnos: {
    getAll: async (includeInactive = false): Promise<Alumno[]> => {
      const b = backend();
      if (b) return await b.alumnos.getAll(includeInactive);
      const all = storage.alumnos.getAll();
      return includeInactive ? all : all.filter((a) => a.activo !== false);
    },
    add: async (alumno: Alumno): Promise<void> => {
      const b = backend();
      if (b) await b.alumnos.add(alumno);
      else storage.alumnos.add(alumno);
    },
    update: async (id: string, updates: Partial<Alumno>): Promise<void> => {
      const b = backend();
      if (b) await b.alumnos.update(id, updates);
      else storage.alumnos.update(id, updates);
    },
    delete: async (id: string): Promise<void> => {
      const b = backend();
      if (b) await b.alumnos.delete(id);
      else storage.alumnos.delete(id);
    },
    findByDni: async (dni: string): Promise<Alumno | undefined> => {
      const b = backend();
      if (b) return await b.alumnos.findByDni(dni);
      return storage.alumnos.findByDni(dni);
    },
    getAsistencias: async (alumnoId: string): Promise<AsistenciaHistorialItem[]> => {
      if (useApi()) return await storageApi.alumnos.getAsistencias(alumnoId);
      return storage.alumnos.getAsistencias(alumnoId);
    },
  },

  actividades: {
    getAll: async (): Promise<Actividad[]> => {
      const b = backend();
      if (b) return await b.actividades.getAll();
      return storage.actividades.getAll();
    },
    add: async (actividad: Actividad): Promise<void> => {
      const b = backend();
      if (b) await b.actividades.add(actividad);
      else storage.actividades.add(actividad);
    },
    update: async (id: string, updates: Partial<Actividad>): Promise<void> => {
      const b = backend();
      if (b) await b.actividades.update(id, updates);
      else storage.actividades.update(id, updates);
    },
    delete: async (id: string): Promise<void> => {
      const b = backend();
      if (b) await b.actividades.delete(id);
      else storage.actividades.delete(id);
    },
    getById: async (id: string): Promise<Actividad | undefined> => {
      const b = backend();
      if (b) return await b.actividades.getById(id);
      return storage.actividades.getById(id);
    },
  },

  pagos: {
    getAll: async (): Promise<Pago[]> => {
      const b = backend();
      if (b) return await b.pagos.getAll();
      return storage.pagos.getAll();
    },
    add: async (pago: Pago): Promise<void> => {
      const b = backend();
      if (b) await b.pagos.add(pago);
      else storage.pagos.add(pago);
    },
    getByAlumnoId: async (alumnoId: string): Promise<Pago[]> => {
      const b = backend();
      if (b) return await b.pagos.getByAlumnoId(alumnoId);
      return storage.pagos.getByAlumnoId(alumnoId);
    },
    delete: async (id: string): Promise<void> => {
      const b = backend();
      if (b) await b.pagos.delete(id);
      else storage.pagos.delete(id);
    },
  },

  gastos: {
    getAll: async (): Promise<Gasto[]> => {
      const b = backend();
      if (b) return await b.gastos.getAll();
      return storage.gastos.getAll();
    },
    add: async (gasto: Gasto): Promise<void> => {
      const b = backend();
      if (b) await b.gastos.add(gasto);
      else storage.gastos.add(gasto);
    },
    update: async (id: string, updates: Partial<Gasto>): Promise<void> => {
      const b = backend();
      if (b) await b.gastos.update(id, updates);
      else storage.gastos.update(id, updates);
    },
    delete: async (id: string): Promise<void> => {
      const b = backend();
      if (b) await b.gastos.delete(id);
      else storage.gastos.delete(id);
    },
  },

  cierresCaja: {
    getAll: async (): Promise<CierreCaja[]> => {
      if (useApi()) return storageApi.cierresCaja.getAll();
      return storage.cierresCaja.getAll();
    },
    getById: async (id: string): Promise<CierreCaja | undefined> => {
      if (useApi()) return storageApi.cierresCaja.getById(id);
      return storage.cierresCaja.getById(id);
    },
    crear: async (input: {
      descripcion: string;
      fecha: string;
      montoRetirado: number;
      horaCierre?: string;
    }): Promise<CierreCaja> => {
      if (useApi()) return storageApi.cierresCaja.create(input);
      const [pagos, gastos, existentes] = await Promise.all([
        storageHybrid.pagos.getAll(),
        storageHybrid.gastos.getAll(),
        storage.cierresCaja.getAll(),
      ]);
      const cierre = buildCierreRetiro(
        input.descripcion,
        input.fecha,
        input.horaCierre ?? horaActualInput(),
        input.montoRetirado,
        pagos,
        gastos,
        existentes
      );
      storage.cierresCaja.add(cierre);
      return cierre;
    },
  },

  agendaNotas: {
    getAll: async (): Promise<AgendaNota[]> => {
      if (useApi()) return storageApi.agendaNotas.getAll();
      const b: any = backend();
      if (b?.agendaNotas) return await b.agendaNotas.getAll();
      return storage.agendaNotas.getAll();
    },
    add: async (nota: AgendaNota): Promise<void> => {
      if (useApi()) await storageApi.agendaNotas.add(nota);
      else {
        const b: any = backend();
        if (b?.agendaNotas) await b.agendaNotas.add(nota);
        else storage.agendaNotas.add(nota);
      }
    },
    update: async (id: string, updates: Partial<AgendaNota>): Promise<void> => {
      if (useApi()) await storageApi.agendaNotas.update(id, updates);
      else {
        const b: any = backend();
        if (b?.agendaNotas) await b.agendaNotas.update(id, updates);
        else storage.agendaNotas.update(id, updates);
      }
    },
    delete: async (id: string): Promise<void> => {
      if (useApi()) await storageApi.agendaNotas.delete(id);
      else {
        const b: any = backend();
        if (b?.agendaNotas) await b.agendaNotas.delete(id);
        else storage.agendaNotas.delete(id);
      }
    },
  },

  turnos: {
    getAll: async (): Promise<Turno[]> => {
      const b = backend();
      if (b) return await b.turnos.getAll();
      return storage.turnos.getAll();
    },
    add: async (turno: Turno): Promise<void> => {
      const b = backend();
      if (b) await b.turnos.add(turno);
      else storage.turnos.add(turno);
    },
    update: async (id: string, updates: Partial<Turno>): Promise<void> => {
      const b = backend();
      if (b) await b.turnos.update(id, updates);
      else storage.turnos.update(id, updates);
    },
    delete: async (id: string): Promise<void> => {
      const b = backend();
      if (b) await b.turnos.delete(id);
      else storage.turnos.delete(id);
    },
    findByDiaSemana: async (diaSemana: number): Promise<Turno[]> => {
      const b = backend();
      if (b) return await b.turnos.findByDiaSemana(diaSemana);
      return storage.turnos.findByDiaSemana(diaSemana);
    },
    findByDiaSemanaYHora: async (diaSemana: number, hora: string): Promise<Turno | undefined> => {
      const b = backend();
      if (b) return await b.turnos.findByDiaSemanaYHora(diaSemana, hora);
      return storage.turnos.findByDiaSemanaYHora(diaSemana, hora);
    },
    getByAlumnoId: async (alumnoId: string): Promise<Turno[]> => {
      const b = backend();
      if (b) return await b.turnos.getByAlumnoId(alumnoId);
      return storage.turnos.getByAlumnoId(alumnoId);
    },
    ajustarCupo: async (): Promise<{ turnosActualizados: number; alumnosEliminados: number }> => {
      if (useApi()) return await storageApi.turnos.ajustarCupo();
      const todos = storage.turnos.getAll();
      let turnosActualizados = 0;
      let alumnosEliminados = 0;
      const cupo = 6;
      for (const t of todos) {
        const max = (t as Turno & { cupo?: number }).cupo ?? cupo;
        if (t.alumnoIds.length > max) {
          storage.turnos.update(t.id, { alumnoIds: t.alumnoIds.slice(0, max) });
          turnosActualizados++;
          alumnosEliminados += t.alumnoIds.length - max;
        }
      }
      return { turnosActualizados, alumnosEliminados };
    },
  },

  profesores: {
    getAll: async (): Promise<Profesor[]> => {
      if (useApi()) return await storageApi.profesores.getAll();
      return storage.profesores.getAll();
    },
    getById: async (id: string): Promise<Profesor | undefined> => {
      if (useApi()) return await storageApi.profesores.getById(id);
      return storage.profesores.getById(id);
    },
    add: async (profesor: Profesor): Promise<void> => {
      if (useApi()) await storageApi.profesores.add(profesor);
      else storage.profesores.add(profesor);
    },
    update: async (id: string, updates: Partial<Profesor>): Promise<void> => {
      if (useApi()) await storageApi.profesores.update(id, updates);
      else storage.profesores.update(id, updates);
    },
    delete: async (id: string): Promise<void> => {
      if (useApi()) await storageApi.profesores.delete(id);
      else storage.profesores.delete(id);
    },
  },

  asistencias: {
    getAll: async (): Promise<Asistencia[]> => {
      if (useApi()) return await storageApi.asistencias.getAll();
      return storage.asistencias.getAll();
    },
    getBySemana: async (semana: string): Promise<Asistencia[]> => {
      if (useApi()) return await storageApi.asistencias.getBySemana(semana);
      return storage.asistencias.getBySemana(semana);
    },
    findByTurnoYAlumno: async (
      turnoId: string,
      alumnoId: string,
      semana: string
    ): Promise<Asistencia | undefined> => {
      if (useApi()) return await storageApi.asistencias.findByTurnoYAlumno(turnoId, alumnoId, semana);
      return storage.asistencias.findByTurnoYAlumno(turnoId, alumnoId, semana);
    },
    add: async (asistencia: Asistencia): Promise<void> => {
      if (useApi()) await storageApi.asistencias.add(asistencia);
      else storage.asistencias.add(asistencia);
    },
    update: async (id: string, updates: Partial<Asistencia>): Promise<void> => {
      if (useApi()) await storageApi.asistencias.update(id, updates);
      else storage.asistencias.update(id, updates);
    },
    delete: async (id: string): Promise<void> => {
      if (useApi()) await storageApi.asistencias.delete(id);
      else storage.asistencias.delete(id);
    },
    deleteBySemana: async (semana: string): Promise<void> => {
      if (useApi()) await storageApi.asistencias.deleteBySemana(semana);
      else storage.asistencias.deleteBySemana(semana);
    },
  },

  recuperaciones: {
    getBySemana: async (semana: string): Promise<Recuperacion[]> => {
      if (useApi()) return await storageApi.recuperaciones.getBySemana(semana);
      return storage.recuperaciones.getBySemana(semana);
    },
    add: async (recuperacion: Recuperacion): Promise<void> => {
      if (useApi()) await storageApi.recuperaciones.add(recuperacion);
      else storage.recuperaciones.add(recuperacion);
    },
    delete: async (id: string): Promise<void> => {
      if (useApi()) await storageApi.recuperaciones.delete(id);
      else storage.recuperaciones.delete(id);
    },
    deleteBySemana: async (semana: string): Promise<void> => {
      if (useApi()) await storageApi.recuperaciones.deleteBySemana(semana);
      else storage.recuperaciones.deleteBySemana(semana);
    },
  },

  liberacionesSemana: {
    getBySemana: async (semana: string): Promise<LiberacionSemana[]> => {
      if (useApi()) return await storageApi.liberacionesSemana.getBySemana(semana);
      return storage.liberacionesSemana.getBySemana(semana);
    },
    add: async (item: LiberacionSemana): Promise<void> => {
      if (useApi()) await storageApi.liberacionesSemana.add({ turnoId: item.turnoId, alumnoId: item.alumnoId, semana: item.semana });
      else storage.liberacionesSemana.add(item);
    },
    delete: async (id: string): Promise<void> => {
      if (useApi()) await storageApi.liberacionesSemana.delete(id);
      else storage.liberacionesSemana.delete(id);
    },
  },

  inscripcionesTurno: {
    getAll: async (): Promise<InscripcionTurno[]> => {
      if (useApi()) return await storageApi.inscripcionesTurno.getAll();
      return storage.inscripcionesTurno.getAll();
    },
    add: async (insc: InscripcionTurno): Promise<void> => {
      if (useApi()) await storageApi.inscripcionesTurno.add(insc);
      else storage.inscripcionesTurno.add(insc);
    },
    deleteByTurnoYAlumno: async (turnoId: string, alumnoId: string): Promise<void> => {
      if (useApi()) await storageApi.inscripcionesTurno.deleteByTurnoYAlumno(turnoId, alumnoId);
      else storage.inscripcionesTurno.deleteByTurnoYAlumno(turnoId, alumnoId);
    },
  },
};
