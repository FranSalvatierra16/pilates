import { CierreCaja, Gasto, Pago } from '../types';

export function cierreFechaCorte(c: CierreCaja): string {
  return (c.fechaCierre || c.fechaHasta || c.fechaDesde || '').slice(0, 10);
}

/** Último cierre por fecha de corte y luego por alta. Define el inicio del período abierto. */
export function getUltimoCierre(lista: CierreCaja[]): CierreCaja | null {
  if (!lista?.length) return null;
  return [...lista].sort((a, b) => {
    const fa = cierreFechaCorte(a);
    const fb = cierreFechaCorte(b);
    if (fa && fb && fa !== fb) return fb.localeCompare(fa);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  })[0];
}

/** Compat: nombre anterior en el código */
export function getUltimoCierrePorRegistro(lista: CierreCaja[]): CierreCaja | null {
  return getUltimoCierre(lista);
}

export function getCierreAnterior(lista: CierreCaja[], actual: CierreCaja): CierreCaja | null {
  const ordenados = [...lista].sort((a, b) => {
    const fa = cierreFechaCorte(a);
    const fb = cierreFechaCorte(b);
    if (fa !== fb) return fa.localeCompare(fb);
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  const i = ordenados.findIndex((c) => c.id === actual.id);
  if (i <= 0) return null;
  return ordenados[i - 1];
}

/** Rango de fechas [min, max] inclusive para movimientos de la sesión cerrada por `cierre`. */
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

/** Movimientos posteriores al último cierre (período abierto). */
export function enPeriodoAbierto(fecha: string, ultimoCierre: CierreCaja | null): boolean {
  if (!ultimoCierre) return true;
  const fc = cierreFechaCorte(ultimoCierre);
  if (!fc) return true;
  return fecha > fc;
}

/** Cierre local: mismo criterio que el servidor (retiro + snapshot de sesión). */
export function buildCierreRetiro(
  descripcion: string,
  fechaCierre: string,
  montoRetirado: number,
  pagos: Pago[],
  gastos: Gasto[],
  cierresExistentes: CierreCaja[]
): CierreCaja {
  const ing = pagos.reduce((s, p) => s + p.monto, 0);
  const gas = gastos.reduce((s, g) => s + g.monto, 0);
  const teorico = ing - gas;
  const sumRet = cierresExistentes.reduce((s, c) => s + (c.montoRetirado ?? 0), 0);
  const saldoAntesRetiro = teorico - sumRet;
  const saldoDespuesRetiro = saldoAntesRetiro - montoRetirado;

  const sorted = [...cierresExistentes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const last = sorted[0];
  const prevCut = last ? cierreFechaCorte(last) : '';

  const inWin = (f: string) =>
    prevCut ? f > prevCut && f <= fechaCierre : f <= fechaCierre;

  const pagFil = pagos.filter((p) => inWin(p.fecha));
  const gasFil = gastos.filter((g) => inWin(g.fecha));
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

  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  return {
    id,
    descripcion: descripcion.trim(),
    fechaCierre,
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
    neto: saldoDespuesRetiro,
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
