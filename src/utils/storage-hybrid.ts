import { Alumno, Actividad, Pago, Turno, Gasto } from '../types';
import { storage } from './storage';
import { storageSupabase } from './storage-supabase';

// Verificar si Supabase está configurado
const useSupabase = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return url && url.length > 0 && key && key.length > 0;
};

// Storage híbrido: usa Supabase si está configurado, sino localStorage
export const storageHybrid = {
  alumnos: {
    getAll: async (): Promise<Alumno[]> => {
      if (useSupabase()) {
        return await storageSupabase.alumnos.getAll();
      }
      return storage.alumnos.getAll();
    },
    add: async (alumno: Alumno): Promise<void> => {
      if (useSupabase()) {
        await storageSupabase.alumnos.add(alumno);
      } else {
        storage.alumnos.add(alumno);
      }
    },
    update: async (id: string, updates: Partial<Alumno>): Promise<void> => {
      if (useSupabase()) {
        await storageSupabase.alumnos.update(id, updates);
      } else {
        storage.alumnos.update(id, updates);
      }
    },
    delete: async (id: string): Promise<void> => {
      if (useSupabase()) {
        await storageSupabase.alumnos.delete(id);
      } else {
        storage.alumnos.delete(id);
      }
    },
    findByDni: async (dni: string): Promise<Alumno | undefined> => {
      if (useSupabase()) {
        return await storageSupabase.alumnos.findByDni(dni);
      }
      return storage.alumnos.findByDni(dni);
    },
  },
  
  actividades: {
    getAll: async (): Promise<Actividad[]> => {
      if (useSupabase()) {
        return await storageSupabase.actividades.getAll();
      }
      return storage.actividades.getAll();
    },
    add: async (actividad: Actividad): Promise<void> => {
      if (useSupabase()) {
        await storageSupabase.actividades.add(actividad);
      } else {
        storage.actividades.add(actividad);
      }
    },
    update: async (id: string, updates: Partial<Actividad>): Promise<void> => {
      if (useSupabase()) {
        await storageSupabase.actividades.update(id, updates);
      } else {
        storage.actividades.update(id, updates);
      }
    },
    delete: async (id: string): Promise<void> => {
      if (useSupabase()) {
        await storageSupabase.actividades.delete(id);
      } else {
        storage.actividades.delete(id);
      }
    },
    getById: async (id: string): Promise<Actividad | undefined> => {
      if (useSupabase()) {
        return await storageSupabase.actividades.getById(id);
      }
      return storage.actividades.getById(id);
    },
  },
  
  pagos: {
    getAll: async (): Promise<Pago[]> => {
      if (useSupabase()) {
        return await storageSupabase.pagos.getAll();
      }
      return storage.pagos.getAll();
    },
    add: async (pago: Pago): Promise<void> => {
      if (useSupabase()) {
        await storageSupabase.pagos.add(pago);
      } else {
        storage.pagos.add(pago);
      }
    },
    getByAlumnoId: async (alumnoId: string): Promise<Pago[]> => {
      if (useSupabase()) {
        return await storageSupabase.pagos.getByAlumnoId(alumnoId);
      }
      return storage.pagos.getByAlumnoId(alumnoId);
    },
  },
  
  gastos: {
    getAll: async (): Promise<Gasto[]> => {
      if (useSupabase()) {
        return await storageSupabase.gastos.getAll();
      }
      return storage.gastos.getAll();
    },
    add: async (gasto: Gasto): Promise<void> => {
      if (useSupabase()) {
        await storageSupabase.gastos.add(gasto);
      } else {
        storage.gastos.add(gasto);
      }
    },
    update: async (id: string, updates: Partial<Gasto>): Promise<void> => {
      if (useSupabase()) {
        await storageSupabase.gastos.update(id, updates);
      } else {
        storage.gastos.update(id, updates);
      }
    },
    delete: async (id: string): Promise<void> => {
      if (useSupabase()) {
        await storageSupabase.gastos.delete(id);
      } else {
        storage.gastos.delete(id);
      }
    },
  },
  
  turnos: {
    getAll: async (): Promise<Turno[]> => {
      if (useSupabase()) {
        return await storageSupabase.turnos.getAll();
      }
      return storage.turnos.getAll();
    },
    add: async (turno: Turno): Promise<void> => {
      if (useSupabase()) {
        await storageSupabase.turnos.add(turno);
      } else {
        storage.turnos.add(turno);
      }
    },
    update: async (id: string, updates: Partial<Turno>): Promise<void> => {
      if (useSupabase()) {
        await storageSupabase.turnos.update(id, updates);
      } else {
        storage.turnos.update(id, updates);
      }
    },
    delete: async (id: string): Promise<void> => {
      if (useSupabase()) {
        await storageSupabase.turnos.delete(id);
      } else {
        storage.turnos.delete(id);
      }
    },
    findByDiaSemana: async (diaSemana: number): Promise<Turno[]> => {
      if (useSupabase()) {
        return await storageSupabase.turnos.findByDiaSemana(diaSemana);
      }
      return storage.turnos.findByDiaSemana(diaSemana);
    },
    findByDiaSemanaYHora: async (diaSemana: number, hora: string): Promise<Turno | undefined> => {
      if (useSupabase()) {
        return await storageSupabase.turnos.findByDiaSemanaYHora(diaSemana, hora);
      }
      return storage.turnos.findByDiaSemanaYHora(diaSemana, hora);
    },
    getByAlumnoId: async (alumnoId: string): Promise<Turno[]> => {
      if (useSupabase()) {
        return await storageSupabase.turnos.getByAlumnoId(alumnoId);
      }
      return storage.turnos.getByAlumnoId(alumnoId);
    },
  },
};

