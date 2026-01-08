export interface Alumno {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  email: string;
  fechaVencimientoCuota: string; // YYYY-MM-DD
  actividadId: string;
  clasesAsistidas: number; // Contador de clases asistidas en el mes actual
  createdAt: string;
}

export interface Actividad {
  id: string;
  nombre: string;
  precio: number;
  createdAt: string;
}

export interface Pago {
  id: string;
  alumnoId: string;
  monto: number;
  metodoPago: 'efectivo' | 'transferencia';
  fecha: string; // YYYY-MM-DD
  createdAt: string;
}

export type MetodoPago = 'efectivo' | 'transferencia';

export interface Gasto {
  id: string;
  descripcion: string;
  monto: number;
  metodoPago: 'efectivo' | 'transferencia';
  fecha: string; // YYYY-MM-DD
  createdAt: string;
}

export interface Turno {
  id: string;
  diaSemana: number; // 0 = Lunes, 1 = Martes, ..., 6 = Domingo
  hora: string; // HH:MM (ej: "07:30")
  alumnoIds: string[]; // Array de IDs de alumnos asignados
  createdAt: string;
}

// Nombres de días de la semana (sin domingo)
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

