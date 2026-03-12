export interface Sucursal {
  id: string;
  nombreLugar: string;
  usuario: string;
  fotoPerfil: string | null;
  /** Monto que paga la cuenta mensualmente (uso del sistema) */
  pagoMensual: number | null;
  /** Fecha en que se vence el acceso de la cuenta */
  fechaVencimientoCuenta: string | null;
  /** Si false, la sucursal no puede iniciar sesión (desactivada temporalmente) */
  activa: boolean;
  createdAt: string;
  cantidadAlumnos: number;
  cantidadActividades: number;
  cantidadProfesores: number;
}

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
  descripcion?: string; // Notas o info adicional del alumno (editable)
  /** Token para que el alumno acceda a /mi-clase y solo pueda sumarse o liberar cupo */
  linkToken?: string;
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
  alumnoId: string | null; // null = ingreso sin alumno (ej. aporte del dueño)
  monto: number;
  metodoPago: 'efectivo' | 'transferencia';
  fecha: string; // YYYY-MM-DD
  createdAt: string;
  descripcion?: string; // ej. "Aporte a caja" cuando no hay alumno
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

export interface Profesor {
  id: string;
  nombre: string;
  apellido: string;
  createdAt: string;
}

export interface Turno {
  id: string;
  diaSemana: number; // 0 = Lunes, 1 = Martes, ..., 6 = Domingo
  hora: string; // HH:MM (ej: "07:30")
  titulo: string; // Título de la clase
  profesorId: string; // ID del profesor que da la clase
  alumnoIds: string[]; // Array de IDs de alumnos asignados
  cupo?: number; // Máximo de alumnos por clase (default 6)
  createdAt: string;
}

export interface Asistencia {
  id: string;
  turnoId: string;
  alumnoId: string;
  estado: 'asistio' | 'no_asistio' | null; // null = sin marcar (gris)
  semana: string; // YYYY-WW (año-semana) para identificar la semana
  createdAt: string;
}

export interface EstadisticasAsistencia {
  alumnoId: string;
  totalClases: number; // Total de clases a las que está asignado
  clasesAsistidas: number; // Clases a las que asistió
  clasesNoAsistidas: number; // Clases a las que no asistió
}

// Registro desde link público (formulario IG); luego se agrega como alumno
export interface RegistroLink {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  email: string;
  actividadId: string;
  createdAt: string;
}

// Nombres de días de la semana (sin domingo)
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

