import { format, parseISO, isBefore, isAfter, isSameDay, addMonths } from 'date-fns';

/** Calcula la fecha exacta (YYYY-MM-DD) a partir de semana (YYYY-WW) y diaSemana (0=Lun, 5=Sáb) */
export function getFechaFromSemanaYDia(semana: string, diaSemana: number): string {
  const [y, w] = semana.split('-').map(Number);
  const jan1 = new Date(y, 0, 1);
  const dayOfJan1 = jan1.getDay();
  const mondayOffset = dayOfJan1 === 0 ? 6 : dayOfJan1 - 1;
  const mondayWeek1 = new Date(y, 0, 1 - mondayOffset);
  const d = new Date(mondayWeek1);
  d.setDate(d.getDate() + (w - 1) * 7 + diaSemana);
  return d.toISOString().slice(0, 10);
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

