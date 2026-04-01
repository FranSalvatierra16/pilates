import { CierreCaja, Gasto, Pago } from '../types';

export function cierreFechaCorte(c: CierreCaja): string {
  return (c.fechaCierre || c.fechaHasta || c.fechaDesde || '').slice(0, 10);
}

/** Normaliza a HH:mm (24h). */
export function normalizarHora(hora?: string | null): string {
  if (!hora || !hora.trim()) return '12:00';
  const m = hora.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '12:00';
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** ISO UTC a partir de fecha YYYY-MM-DD y hora local HH:mm. */
export function combinarFechaHoraISO(fecha: string, hora: string): string {
  const fd = fecha.slice(0, 10);
  const h = normalizarHora(hora);
  const [y, mo, d] = fd.split('-').map(Number);
  const [hh, mm] = h.split(':').map(Number);
  return new Date(y, mo - 1, d, hh || 0, mm || 0, 0, 0).toISOString();
}

function instanteDesdeFechaHora(fecha: string, hora?: string | null): number {
  const fd = fecha.slice(0, 10);
  const h = normalizarHora(hora);
  const [y, mo, d] = fd.split('-').map(Number);
  const [hh, mm] = h.split(':').map(Number);
  return new Date(y, mo - 1, d, hh || 0, mm || 0, 0, 0).getTime();
}

/** Instante del movimiento para orden / período (fecha + hora; sin hora → 12:00). */
export function instanteMovimientoPago(p: Pago): number {
  return instanteDesdeFechaHora(p.fecha, p.hora);
}

export function instanteMovimientoGasto(g: Gasto): number {
  return instanteDesdeFechaHora(g.fecha, g.hora);
}

/** Instante en que quedó registrado el cierre (fin de la sesión anterior). */
export function instanteCierre(c: CierreCaja): number {
  if (c.cerradoEn) {
    return new Date(c.cerradoEn).getTime();
  }
  return instanteDesdeFechaHora(cierreFechaCorte(c), '12:00');
}

/** Último cierre = mayor instante de cierre. */
export function getUltimoCierre(lista: CierreCaja[]): CierreCaja | null {
  if (!lista?.length) return null;
  return [...lista].sort((a, b) => instanteCierre(b) - instanteCierre(a))[0];
}

/** Compat: nombre anterior en el código */
export function getUltimoCierrePorRegistro(lista: CierreCaja[]): CierreCaja | null {
  return getUltimoCierre(lista);
}

export function getCierreAnterior(lista: CierreCaja[], actual: CierreCaja): CierreCaja | null {
  const ordenados = [...lista].sort((a, b) => instanteCierre(a) - instanteCierre(b));
  const i = ordenados.findIndex((c) => c.id === actual.id);
  if (i <= 0) return null;
  return ordenados[i - 1];
}

/** Rango de fechas [min, max] inclusive para listados por día (detalle de cierre). */
export function movimientosRangoCierre(listaCierres: CierreCaja[], cierre: CierreCaja): { fechaMin: string; fechaMax: string } {
  const prev = getCierreAnterior(listaCierres, cierre);
  const fechaMax = cierreFechaCorte(cierre);
  if (!prev) return { fechaMin: '1970-01-01', fechaMax };
  return { fechaMin: diaSiguiente(cierreFechaCorte(prev)), fechaMax };
}

export function diaSiguiente(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Fecha que usa el resumen "período actual" en Caja para un gasto (imputación sueldos). */
export function fechaGastoParaPeriodoCaja(g: Gasto): string {
  if (g.profesorId && g.contabilizarEnFecha) {
    return g.contabilizarEnFecha.slice(0, 10);
  }
  return g.fecha;
}

/**
 * ¿Entra en el período actual de Caja?
 * - Sueldos con imputación: solo comparación de fechas (imputación vs día del cierre).
 * - Resto: instante del movimiento > instante del último cierre.
 */
export function estaEnPeriodoAbiertoCaja(mov: Pago | Gasto, ultimoCierre: CierreCaja | null): boolean {
  if (!ultimoCierre) return true;
  const g = mov as Gasto;
  if (g.profesorId && g.contabilizarEnFecha) {
    const ref = g.contabilizarEnFecha.slice(0, 10);
    const fc = cierreFechaCorte(ultimoCierre);
    return ref > fc;
  }
  const tm = 'alumnoId' in mov ? instanteMovimientoPago(mov as Pago) : instanteMovimientoGasto(mov as Gasto);
  return tm > instanteCierre(ultimoCierre);
}

/** @deprecated Usar estaEnPeriodoAbiertoCaja con el movimiento completo. */
export function enPeriodoAbierto(fecha: string, ultimoCierre: CierreCaja | null): boolean {
  if (!ultimoCierre) return true;
  const fc = cierreFechaCorte(ultimoCierre);
  if (!fc) return true;
  return fecha > fc;
}

/** Cierre local: snapshot de sesión por instantes + cerradoEn. */
export function buildCierreRetiro(
  descripcion: string,
  fechaCierre: string,
  horaCierre: string,
  montoRetirado: number,
  pagos: Pago[],
  gastos: Gasto[],
  cierresExistentes: CierreCaja[]
): CierreCaja {
  const cerradoEn = combinarFechaHoraISO(fechaCierre, horaCierre);
  const cerradoMs = new Date(cerradoEn).getTime();

  const ing = pagos.reduce((s, p) => s + p.monto, 0);
  const gas = gastos.reduce((s, g) => s + g.monto, 0);
  const teorico = ing - gas;
  const sumRet = cierresExistentes.reduce((s, c) => s + (c.montoRetirado ?? 0), 0);
  const saldoAntesRetiro = teorico - sumRet;
  const saldoDespuesRetiro = saldoAntesRetiro - montoRetirado;

  const sorted = [...cierresExistentes].sort((a, b) => instanteCierre(b) - instanteCierre(a));
  const last = sorted[0];
  const prevInstant = last ? instanteCierre(last) : null;

  const inWinPago = (p: Pago) => {
    const t = instanteMovimientoPago(p);
    if (prevInstant != null && t <= prevInstant) return false;
    if (t > cerradoMs) return false;
    return true;
  };
  const inWinGasto = (g: Gasto) => {
    const t = instanteMovimientoGasto(g);
    if (prevInstant != null && t <= prevInstant) return false;
    if (t > cerradoMs) return false;
    return true;
  };

  const pagFil = pagos.filter(inWinPago);
  const gasFil = gastos.filter(inWinGasto);
  let ingEf = 0;
  let ingTr = 0;
  let gasEf = 0;
  let gasTr = 0;
  for (const p of pagFil) {
    if (p.metodoPago === 'efectivo') ingEf += p.monto;
    else ingTr += p.monto;
  }
  for (const g of gasFil) {
    if (g.metodoPago === 'efectivo') gasEf += g.monto;
    else gasTr += g.monto;
  }
  const totalIngresos = ingEf + ingTr;
  const totalGastos = gasEf + gasTr;
  const balanceSesion = totalIngresos - totalGastos;

  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  return {
    id,
    descripcion: descripcion.trim(),
    fechaCierre,
    cerradoEn,
    montoRetirado,
    saldoAntesRetiro,
    saldoDespuesRetiro,
    fechaDesde: fechaCierre,
    fechaHasta: fechaCierre,
    ingresosEfectivo: ingEf,
    ingresosTransferencia: ingTr,
    gastosEfectivo: gasEf,
    gastosTransferencia: gasTr,
    totalIngresos,
    totalGastos,
    neto: balanceSesion,
    movimientosCount: pagFil.length + gasFil.length,
    createdAt: new Date().toISOString(),
  };
}

export function boundsForMesYYYYMM(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split('-').map(Number);
  if (!y || !m) {
    const d = new Date();
    const yy = d.getFullYear();
    const mm = d.getMonth() + 1;
    const last = new Date(yy, mm, 0).getDate();
    return {
      desde: `${yy}-${String(mm).padStart(2, '0')}-01`,
      hasta: `${yy}-${String(mm).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    };
  }
  const last = new Date(y, m, 0).getDate();
  return {
    desde: `${y}-${String(m).padStart(2, '0')}-01`,
    hasta: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}
