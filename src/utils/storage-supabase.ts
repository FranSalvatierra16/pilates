import { Alumno, Actividad, Pago, Turno, Gasto } from '../types';
import { supabase } from '../config/supabase';

// Verificar si Supabase está configurado
const useSupabase = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return url && url.length > 0 && key && key.length > 0;
};

// Helper para convertir de formato DB a formato app
const dbToAlumno = (row: any): Alumno => ({
  id: row.id,
  nombre: row.nombre,
  apellido: row.apellido,
  dni: row.dni,
  telefono: row.telefono,
  email: row.email,
  fechaVencimientoCuota: row.fecha_vencimiento_cuota || '',
  actividadId: row.actividad_id,
  clasesAsistidas: row.clases_asistidas || 0,
  descripcion: row.descripcion || '',
  linkToken: row.link_token || '',
  createdAt: row.created_at,
});

const alumnoToDb = (alumno: Alumno) => ({
  id: alumno.id,
  nombre: alumno.nombre,
  apellido: alumno.apellido,
  dni: alumno.dni,
  telefono: alumno.telefono,
  email: alumno.email,
  fecha_vencimiento_cuota: alumno.fechaVencimientoCuota || null,
  actividad_id: alumno.actividadId,
  clases_asistidas: alumno.clasesAsistidas || 0,
  descripcion: alumno.descripcion || null,
  link_token: alumno.linkToken || null,
  created_at: alumno.createdAt,
});

const dbToActividad = (row: any): Actividad => ({
  id: row.id,
  nombre: row.nombre,
  precio: parseFloat(row.precio),
  createdAt: row.created_at,
});

const actividadToDb = (actividad: Actividad) => ({
  id: actividad.id,
  nombre: actividad.nombre,
  precio: actividad.precio,
  // Si no hay createdAt, dejamos que Supabase use el DEFAULT NOW()
  ...(actividad.createdAt ? { created_at: actividad.createdAt } : {}),
});

const dbToPago = (row: any): Pago => ({
  id: row.id,
  alumnoId: row.alumno_id ?? null,
  monto: parseFloat(row.monto),
  metodoPago: row.metodo_pago,
  fecha: row.fecha,
  createdAt: row.created_at,
  ...(row.descripcion && { descripcion: row.descripcion }),
});

const pagoToDb = (pago: Pago) => ({
  id: pago.id,
  alumno_id: pago.alumnoId ?? null,
  monto: pago.monto,
  metodo_pago: pago.metodoPago,
  fecha: pago.fecha,
  created_at: pago.createdAt,
  ...(pago.descripcion && { descripcion: pago.descripcion }),
});

const dbToGasto = (row: any): Gasto => ({
  id: row.id,
  descripcion: row.descripcion,
  monto: parseFloat(row.monto),
  metodoPago: row.metodo_pago,
  fecha: row.fecha,
  createdAt: row.created_at,
});

const gastoToDb = (gasto: Gasto) => ({
  id: gasto.id,
  descripcion: gasto.descripcion,
  monto: gasto.monto,
  metodo_pago: gasto.metodoPago,
  fecha: gasto.fecha,
  created_at: gasto.createdAt,
});

const dbToTurno = (row: any): Turno => ({
  id: row.id,
  diaSemana: row.dia_semana,
  hora: row.hora,
  titulo: row.titulo || '',
  profesorId: row.profesor_id || '',
  alumnoIds: row.alumno_ids || [],
  createdAt: row.created_at,
});

const turnoToDb = (turno: Turno) => ({
  id: turno.id,
  dia_semana: turno.diaSemana,
  hora: turno.hora,
  titulo: turno.titulo || null,
  profesor_id: turno.profesorId || null,
  alumno_ids: turno.alumnoIds,
  created_at: turno.createdAt,
});

export const storageSupabase = {
  alumnos: {
    getAll: async (): Promise<Alumno[]> => {
      if (!useSupabase()) return [];
      const { data, error } = await supabase.from('alumnos').select('*').order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching alumnos:', error);
        return [];
      }
      return (data || []).map(dbToAlumno);
    },
    add: async (alumno: Alumno): Promise<void> => {
      if (!useSupabase()) return;
      const { error } = await supabase.from('alumnos').insert(alumnoToDb(alumno));
      if (error) {
        console.error('Error adding alumno:', error);
        throw error;
      }
    },
    update: async (id: string, updates: Partial<Alumno>): Promise<void> => {
      if (!useSupabase()) return;
      const dbUpdates: any = {};
      if (updates.nombre) dbUpdates.nombre = updates.nombre;
      if (updates.apellido) dbUpdates.apellido = updates.apellido;
      if (updates.dni) dbUpdates.dni = updates.dni;
      if (updates.telefono) dbUpdates.telefono = updates.telefono;
      if (updates.email) dbUpdates.email = updates.email;
      if (updates.fechaVencimientoCuota !== undefined) dbUpdates.fecha_vencimiento_cuota = updates.fechaVencimientoCuota || null;
      if (updates.actividadId) dbUpdates.actividad_id = updates.actividadId;
      if (updates.clasesAsistidas !== undefined) dbUpdates.clases_asistidas = updates.clasesAsistidas;
      if (updates.descripcion !== undefined) dbUpdates.descripcion = updates.descripcion || null;
      if (updates.linkToken !== undefined) dbUpdates.link_token = updates.linkToken || null;
      const { error } = await supabase.from('alumnos').update(dbUpdates).eq('id', id);
      if (error) {
        console.error('Error updating alumno:', error);
        throw error;
      }
    },
    delete: async (id: string): Promise<void> => {
      if (!useSupabase()) return;
      const { error } = await supabase.from('alumnos').delete().eq('id', id);
      if (error) {
        console.error('Error deleting alumno:', error);
        throw error;
      }
    },
    findByDni: async (dni: string): Promise<Alumno | undefined> => {
      if (!useSupabase()) return undefined;
      const { data, error } = await supabase.from('alumnos').select('*').eq('dni', dni).single();
      if (error || !data) return undefined;
      return dbToAlumno(data);
    },
  },
  
  actividades: {
    getAll: async (): Promise<Actividad[]> => {
      if (!useSupabase()) return [];
      const { data, error } = await supabase.from('actividades').select('*').order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching actividades:', error);
        return [];
      }
      return (data || []).map(dbToActividad);
    },
    add: async (actividad: Actividad): Promise<void> => {
      if (!useSupabase() || !supabase) {
        console.error('Supabase no está configurado correctamente');
        throw new Error('Supabase no está configurado');
      }
      const dbData = actividadToDb(actividad);
      console.log('Inserting actividad to Supabase:', dbData);
      const { data, error } = await supabase.from('actividades').insert(dbData).select();
      if (error) {
        console.error('Error adding actividad:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        throw new Error(`Error al guardar la actividad: ${error.message}. Código: ${error.code}. Revisá la consola para más detalles.`);
      }
      console.log('Actividad insertada exitosamente:', data);
    },
    update: async (id: string, updates: Partial<Actividad>): Promise<void> => {
      if (!useSupabase()) return;
      const dbUpdates: any = {};
      if (updates.nombre) dbUpdates.nombre = updates.nombre;
      if (updates.precio !== undefined) dbUpdates.precio = updates.precio;
      const { error } = await supabase.from('actividades').update(dbUpdates).eq('id', id);
      if (error) {
        console.error('Error updating actividad:', error);
        throw error;
      }
    },
    delete: async (id: string): Promise<void> => {
      if (!useSupabase()) return;
      const { error } = await supabase.from('actividades').delete().eq('id', id);
      if (error) {
        console.error('Error deleting actividad:', error);
        throw error;
      }
    },
    getById: async (id: string): Promise<Actividad | undefined> => {
      if (!useSupabase()) return undefined;
      const { data, error } = await supabase.from('actividades').select('*').eq('id', id).single();
      if (error || !data) return undefined;
      return dbToActividad(data);
    },
  },
  
  pagos: {
    getAll: async (): Promise<Pago[]> => {
      if (!useSupabase()) return [];
      const { data, error } = await supabase.from('pagos').select('*').order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching pagos:', error);
        return [];
      }
      return (data || []).map(dbToPago);
    },
    add: async (pago: Pago): Promise<void> => {
      if (!useSupabase()) return;
      const { error } = await supabase.from('pagos').insert(pagoToDb(pago));
      if (error) {
        console.error('Error adding pago:', error);
        throw error;
      }
    },
    getByAlumnoId: async (alumnoId: string): Promise<Pago[]> => {
      if (!useSupabase()) return [];
      const { data, error } = await supabase.from('pagos').select('*').eq('alumno_id', alumnoId).order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching pagos by alumno:', error);
        return [];
      }
      return (data || []).map(dbToPago);
    },
    delete: async (id: string): Promise<void> => {
      if (!useSupabase()) return;
      const { error } = await supabase.from('pagos').delete().eq('id', id);
      if (error) {
        console.error('Error deleting pago:', error);
        throw error;
      }
    },
  },
  
  gastos: {
    getAll: async (): Promise<Gasto[]> => {
      if (!useSupabase()) return [];
      const { data, error } = await supabase.from('gastos').select('*').order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching gastos:', error);
        return [];
      }
      return (data || []).map(dbToGasto);
    },
    add: async (gasto: Gasto): Promise<void> => {
      if (!useSupabase()) return;
      const { error } = await supabase.from('gastos').insert(gastoToDb(gasto));
      if (error) {
        console.error('Error adding gasto:', error);
        throw error;
      }
    },
    update: async (id: string, updates: Partial<Gasto>): Promise<void> => {
      if (!useSupabase()) return;
      const dbUpdates: any = {};
      if (updates.descripcion) dbUpdates.descripcion = updates.descripcion;
      if (updates.monto !== undefined) dbUpdates.monto = updates.monto;
      if (updates.metodoPago) dbUpdates.metodo_pago = updates.metodoPago;
      if (updates.fecha) dbUpdates.fecha = updates.fecha;
      const { error } = await supabase.from('gastos').update(dbUpdates).eq('id', id);
      if (error) {
        console.error('Error updating gasto:', error);
        throw error;
      }
    },
    delete: async (id: string): Promise<void> => {
      if (!useSupabase()) return;
      const { error } = await supabase.from('gastos').delete().eq('id', id);
      if (error) {
        console.error('Error deleting gasto:', error);
        throw error;
      }
    },
  },
  
  turnos: {
    getAll: async (): Promise<Turno[]> => {
      if (!useSupabase()) return [];
      const { data, error } = await supabase.from('turnos').select('*').order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching turnos:', error);
        return [];
      }
      return (data || []).map(dbToTurno);
    },
    add: async (turno: Turno): Promise<void> => {
      if (!useSupabase()) return;
      const { error } = await supabase.from('turnos').insert(turnoToDb(turno));
      if (error) {
        console.error('Error adding turno:', error);
        throw error;
      }
    },
    update: async (id: string, updates: Partial<Turno>): Promise<void> => {
      if (!useSupabase()) return;
      const dbUpdates: any = {};
      if (updates.diaSemana !== undefined) dbUpdates.dia_semana = updates.diaSemana;
      if (updates.hora) dbUpdates.hora = updates.hora;
      if (updates.titulo !== undefined) dbUpdates.titulo = updates.titulo || null;
      if (updates.profesorId !== undefined) dbUpdates.profesor_id = updates.profesorId || null;
      if (updates.alumnoIds) dbUpdates.alumno_ids = updates.alumnoIds;
      const { error } = await supabase.from('turnos').update(dbUpdates).eq('id', id);
      if (error) {
        console.error('Error updating turno:', error);
        throw error;
      }
    },
    delete: async (id: string): Promise<void> => {
      if (!useSupabase()) return;
      const { error } = await supabase.from('turnos').delete().eq('id', id);
      if (error) {
        console.error('Error deleting turno:', error);
        throw error;
      }
    },
    findByDiaSemana: async (diaSemana: number): Promise<Turno[]> => {
      if (!useSupabase()) return [];
      const { data, error } = await supabase.from('turnos').select('*').eq('dia_semana', diaSemana);
      if (error) {
        console.error('Error fetching turnos by dia:', error);
        return [];
      }
      return (data || []).map(dbToTurno);
    },
    findByDiaSemanaYHora: async (diaSemana: number, hora: string): Promise<Turno | undefined> => {
      if (!useSupabase()) return undefined;
      const { data, error } = await supabase.from('turnos').select('*').eq('dia_semana', diaSemana).eq('hora', hora).single();
      if (error || !data) return undefined;
      return dbToTurno(data);
    },
    getByAlumnoId: async (alumnoId: string): Promise<Turno[]> => {
      if (!useSupabase()) return [];
      const { data, error } = await supabase.from('turnos').select('*');
      if (error) {
        console.error('Error fetching turnos:', error);
        return [];
      }
      return (data || []).filter((t: any) => t.alumno_ids?.includes(alumnoId)).map(dbToTurno);
    },
  },
};

