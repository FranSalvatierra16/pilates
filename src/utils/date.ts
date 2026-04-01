import { format, parseISO, isBefore, isAfter, isSameDay, addMonths } from 'date-fns';

/** Semana actual (YYYY-WW) */
export function getSemanaActual(): string {
  const hoy = new Date();
  const año = hoy.getFullYear();
  const inicioAño = new Date(año, 0, 1);
  const dias = Math.floor((hoy.getTime() - inicioAño.getTime()) / (24 * 60 * 60 * 1000));
  const semana = Math.ceil((dias + inicioAño.getDay() + 1) / 7);
  return `${año}-${semana.toString().padStart(2, '0')}`;
}

export function getSemanaAnterior(semana: string): string {
  const [y, w] = semana.split('-').map(Number);
  if (w <= 1) return `${y - 1}-52`;
  return `${y}-${String(w - 1).padStart(2, '0')}`;
}

export function getSemanaSiguiente(semana: string): string {
  const [y, w] = semana.split('-').map(Number);
  if (w >= 52) return `${y + 1}-01`;
  return `${y}-${String(w + 1).padStart(2, '0')}`;
}

export function getRangoSemana(semana: string): string {
  const [y, w] = semana.split('-').map(Number);
  const jan1 = new Date(y, 0, 1);
  const dayOfJan1 = jan1.getDay();
  const mondayOffset = dayOfJan1 === 0 ? 6 : dayOfJan1 - 1;
  const mondayWeek1 = new Date(y, 0, 1 - mondayOffset);
  const lunes = new Date(mondayWeek1);
  lunes.setDate(lunes.getDate() + (w - 1) * 7);
  const domingo = new Date(lunes);
  domingo.setDate(domingo.getDate() + 6);
  return `${lunes.getDate()} ${lunes.toLocaleDateString('es-AR', { month: 'short' })} - ${domingo.getDate()} ${domingo.toLocaleDateString('es-AR', { month: 'short' })} ${domingo.getFullYear()}`;
}

/** Dado una fecha, devuelve la semana (YYYY-WW) que la contiene */
export function getSemanaFromDate(fecha: Date): string {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const lunes = new Date(d);
  lunes.setDate(lunes.getDate() - diff);
  const y = lunes.getFullYear();
  const jan1 = new Date(y, 0, 1);
  const dayOfJan1 = jan1.getDay();
  const mondayOffset = dayOfJan1 === 0 ? 6 : dayOfJan1 - 1;
  const mondayWeek1 = new Date(y, 0, 1 - mondayOffset);
  const semanas = Math.floor((lunes.getTime() - mondayWeek1.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${y}-${semanas.toString().padStart(2, '0')}`;
}

/** Parsea YYYY-MM-DD como fecha local (evita problemas de timezone con new Date(string)) */
export function parseFechaLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Calcula la fecha exacta (YYYY-MM-DD) a partir de semana (YYYY-WW) y diaSemana (0=Lun, 5=Sáb) */
export function getFechaFromSemanaYDia(semana: string, diaSemana: number): string {
  const [y, w] = semana.split('-').map(Number);
  const jan1 = new Date(y, 0, 1);
  const dayOfJan1 = jan1.getDay();
  const mondayOffset = dayOfJan1 === 0 ? 6 : dayOfJan1 - 1;
  const mondayWeek1 = new Date(y, 0, 1 - mondayOffset);
  const d = new Date(mondayWeek1);
  d.setDate(d.getDate() + (w - 1) * 7 + diaSemana);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const formatDate = (dateString: string): string => {
  if (!dateString || dateString.trim() === '') {
    return '-';
  }
  try {
    const date = parseISO(dateString);
    return format(date, 'dd/MM/yyyy');
  } catch {
    return dateString;
  }
};

/** Fecha y hora para UI (ISO o YYYY-MM-DD). */
export const formatDateTime = (isoOrDate: string): string => {
  if (!isoOrDate || !isoOrDate.trim()) return '-';
  try {
    const s = isoOrDate.includes('T') ? isoOrDate : `${isoOrDate.slice(0, 10)}T12:00:00`;
    return format(parseISO(s), 'dd/MM/yyyy HH:mm');
  } catch {
    return isoOrDate;
  }
};

/** HH:mm actual (24 h) al registrar un movimiento o cierre. */
export const horaActualInput = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Muestra una hora guardada como HH:mm en 24 h. */
export const formatHora24 = (hora?: string | null): string => {
  if (!hora || !String(hora).trim()) return '12:00';
  const m = String(hora).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '12:00';
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

export const isCuotaVencida = (fechaVencimiento: string): boolean => {
  try {
    const vencimiento = parseISO(fechaVencimiento);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    vencimiento.setHours(0, 0, 0, 0);
    return isBefore(vencimiento, hoy);
  } catch {
    return false;
  }
};

export const isCuotaPorVencer = (fechaVencimiento: string, dias: number = 3): boolean => {
  try {
    const vencimiento = parseISO(fechaVencimiento);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const limite = new Date(hoy);
    limite.setDate(limite.getDate() + dias);
    vencimiento.setHours(0, 0, 0, 0);
    return isAfter(vencimiento, hoy) && isBefore(vencimiento, limite);
  } catch {
    return false;
  }
};

export const isCuotaVenceHoy = (fechaVencimiento: string): boolean => {
  try {
    const vencimiento = parseISO(fechaVencimiento);
    const hoy = new Date();
    return isSameDay(vencimiento, hoy);
  } catch {
    return false;
  }
};

export const calcularFechaVencimiento = (fechaPago: string): string => {
  try {
    const fecha = parseISO(fechaPago);
    const fechaVencimiento = addMonths(fecha, 1);
    return format(fechaVencimiento, 'yyyy-MM-dd');
  } catch {
    // Fallback si hay error
    const fecha = new Date(fechaPago);
    fecha.setMonth(fecha.getMonth() + 1);
    return format(fecha, 'yyyy-MM-dd');
  }
};

