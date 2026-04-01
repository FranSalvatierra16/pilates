import { CierreCaja, Gasto, Pago } from '../types';

/** Totales de un período (misma lógica que en servidor y en modo local). */
export function buildCierreSnapshot(
  descripcion: string,
  fechaDesde: string,
  fechaHasta: string,
  pagos: Pago[],
  gastos: Gasto[],
  id?: string
): CierreCaja {
  const inR = (f: string) => f >= fechaDesde && f <= fechaHasta;
  const pFil = pagos.filter((p) => inR(p.fecha));
  const gFil = gastos.filter((g) => inR(g.fecha));
  let ingEf = 0;
  let ingTr = 0;
  let gasEf = 0;
  let gasTr = 0;
  for (const p of pFil) {
    if (p.metodoPago === 'efectivo') ingEf += p.monto;
    else ingTr += p.monto;
  }
  for (const g of gFil) {
    if (g.metodoPago === 'efectivo') gasEf += g.monto;
    else gasTr += g.monto;
  }
  const totalIngresos = ingEf + ingTr;
  const totalGastos = gasEf + gasTr;
  return {
    id: id ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`),
    descripcion: descripcion.trim(),
    fechaDesde,
    fechaHasta,
    ingresosEfectivo: ingEf,
    ingresosTransferencia: ingTr,
    gastosEfectivo: gasEf,
    gastosTransferencia: gasTr,
    totalIngresos,
    totalGastos,
    neto: totalIngresos - totalGastos,
    movimientosCount: pFil.length + gFil.length,
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
