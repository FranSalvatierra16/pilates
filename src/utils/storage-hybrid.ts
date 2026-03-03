import { Alumno, Actividad, Pago, Turno, Gasto, Asistencia, Profesor } from '../types';
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
    getAll: async (): Promise<Alumno[]> => {
      const b = backend();
      if (b) return await b.alumnos.getAll();
      return storage.alumnos.getAll();
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
};
