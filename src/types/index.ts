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
  /** Horarios configurables: ej. Savia 7-12, Nes 9-13 */
  horaInicioManana?: string;
  horaFinManana?: string;
  horaInicioTarde?: string;
  horaFinTarde?: string;
  horasAntesAnotarseClase?: number;
  horasAntesLiberarClase?: number;
  createdAt: string;
  cantidadAlumnos: number;
  cantidadActividades: number;
  cantidadProfesores: number;
  /** Admin: módulo de planificación de entrenamientos (por defecto desactivado) */
  planificacionHabilitada?: boolean;
}

/** Respuesta de GET /api/sucursal/horarios */
export interface HorariosSucursal {
  horaInicioManana: string;
  horaFinManana: string;
  horaInicioTarde: string;
  horaFinTarde: string;
  horasAntesAnotarseClase: number;
  horasAntesLiberarClase: number;
  horariosNoDisponiblesPorDia?: Record<number, string[]>;
  manana: string[];
  tarde: string[];
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
  clasesParaRecuperar?: number; // Créditos disponibles para recuperar por faltas marcadas en rojo
  descripcion?: string; // Notas o info adicional del alumno (editable)
  /** Token para que el alumno acceda a /mi-clase y solo pueda sumarse o liberar cupo */
  linkToken?: string;
  /** Si false, el alumno está dado de baja (no se muestra en listas activas) */
  activo?: boolean;
  createdAt: string;
}

export interface Actividad {
  id: string;
  nombre: string;
  precio: number;
  clasesPorSemana?: number | null; // Opcional: límite/base de clases por semana
  createdAt: string;
}

export interface Pago {
  id: string;
  alumnoId: string | null; // null = ingreso sin alumno (ej. aporte del dueño)
  monto: number;
  metodoPago: 'efectivo' | 'transferencia';
  fecha: string; // YYYY-MM-DD
  /** Hora del movimiento (HH:mm), para período de caja mismo día que el cierre. */
  hora?: string;
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
  /** Hora del movimiento (HH:mm). */
  hora?: string;
  createdAt: string;
  /** Si está definido, es un pago de sueldo a ese profesor (historial en Profesores). */
  profesorId?: string | null;
  /**
   * Solo sueldos: mes/período al que imputás el gasto para el resumen "período actual" en Caja.
   * La `fecha` sigue siendo el día en que salió el dinero (saldo total). Si pagás en abril un sueldo de marzo,
   * poné acá una fecha de marzo: no entra en las estadísticas del período de abril.
   */
  contabilizarEnFecha?: string | null;
}

/** Cierre de caja: retiro físico que reduce el saldo disponible; el período nuevo cuenta movimientos posteriores a `cerradoEn`. */
export interface CierreCaja {
  id: string;
  descripcion: string;
  /** Fecha del cierre (calendario). */
  fechaCierre: string;
  /** Instante en que cerraste (ISO); el período actual incluye solo movimientos después de este momento. */
  cerradoEn?: string;
  /** Monto que se retira del saldo (ej. lo que llevás al banco). */
  montoRetirado: number;
  /** Saldo teórico (ingresos − gastos − retiros anteriores) justo antes de este retiro. */
  saldoAntesRetiro?: number;
  /** Saldo luego de descontar este retiro. */
  saldoDespuesRetiro?: number;
  /** Compatibilidad con cierres viejos (rango por mes). */
  fechaDesde?: string;
  fechaHasta?: string;
  ingresosEfectivo?: number;
  ingresosTransferencia?: number;
  gastosEfectivo?: number;
  gastosTransferencia?: number;
  totalIngresos?: number;
  totalGastos?: number;
  /** Balance de la sesión cerrada: ingresos − gastos de ese tramo (mismo valor que totalIngresos − totalGastos). */
  neto?: number;
  movimientosCount?: number;
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
  /** Si true, el casillero se muestra con fondo de color (horario importante) */
  destacado?: boolean;
  createdAt: string;
}

export interface Asistencia {
  id: string;
  turnoId: string;
  alumnoId: string;
  estado: 'asistio' | 'no_asistio' | null; // null = sin marcar (gris)
  creditoOtorgado?: boolean;
  semana: string; // YYYY-WW (año-semana) para identificar la semana
  createdAt: string;
}

/** Inscripción de alumno a turno: desde qué semana aparece (semanas anteriores no lo muestran) */
export interface InscripcionTurno {
  id: string;
  turnoId: string;
  alumnoId: string;
  semanaDesde: string; // YYYY-WW
  createdAt: string;
}

/** Inscripción temporal para recuperar clase; desaparece al reiniciar semana o cambiar de semana */
export interface Recuperacion {
  id: string;
  turnoId: string;
  alumnoId: string;
  semana: string; // YYYY-WW
  usaCredito?: boolean; // Si true, consumió una clase para recuperar
  createdAt: string;
}

export interface LiberacionSemana {
  id: string;
  turnoId: string;
  alumnoId: string;
  semana: string; // YYYY-WW
  createdAt: string;
}

/** Item del historial de asistencias de un alumno */
export interface AsistenciaHistorialItem {
  id: string;
  turnoId: string;
  semana: string;
  diaSemana: number;
  hora: string;
  titulo: string;
  /** Fecha exacta de la clase (YYYY-MM-DD) calculada desde semana + diaSemana */
  fecha: string;
  /** asistio = verde, no_asistio = rojo */
  estado: 'asistio' | 'no_asistio';
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

export interface AgendaNota {
  id: string;
  titulo: string;
  contenido: string;
  fecha?: string; // YYYY-MM-DD; vacío si no tiene fecha
  hora?: string;
  importante?: boolean;
  createdAt: string;
}

/** Catálogo de tipo de ejercicio (lo define cada estudio) */
export interface PlanificacionTipoEjercicio {
  id: string;
  nombre: string;
  createdAt: string;
}

/** Catálogo de máquina / aparato (lo define cada estudio) */
export interface PlanificacionMaquina {
  id: string;
  nombre: string;
  createdAt: string;
}

export type ModoSeriesEjercicio = 'tres_iguales' | 'serie_1_2_3';
export type UnidadEjercicioPlan = 'duracion' | 'cantidad';

export interface SerieDetallePlan {
  unidad: UnidadEjercicioPlan;
  valor: string;
}

/** Ejercicio guardado para reutilizar en planes */
export interface PlanificacionEjercicio {
  id: string;
  nombre: string;
  descripcion: string;
  tipoId: string | null;
  maquinaId: string | null;
  modoSeries: ModoSeriesEjercicio;
  unidad: UnidadEjercicioPlan | null;
  valor: string | null;
  numSeries: number;
  seriesDetalle: SerieDetallePlan[] | null;
  createdAt: string;
}

export interface PlanificacionPlan {
  id: string;
  nombre: string;
  descripcion: string;
  createdAt: string;
  items?: PlanificacionPlanItem[];
}

export interface PlanificacionPlanItem {
  id: string;
  planId: string;
  orden: number;
  ejercicioId: string;
  ejercicioNombre?: string;
  notas: string;
}

// Nombres de días de la semana (sin domingo)
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

