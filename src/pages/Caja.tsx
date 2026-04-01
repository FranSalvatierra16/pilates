import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, DollarSign, CreditCard, Wallet, TrendingUp, Calendar, Plus, X, Save, Trash2, Archive, Eye, Banknote } from 'lucide-react';
import { storage } from '../utils/storage';
import { storageHybrid } from '../utils/storage-hybrid';
import { formatCurrency } from '../utils/format';
import { formatDate, formatDateTime, formatHora24, horaActualInput } from '../utils/date';
import {
  cierreFechaCorte,
  combinarFechaHoraISO,
  estaEnPeriodoAbiertoCaja,
  getUltimoCierre,
  instanteCierre,
  movimientosRangoCierre,
} from '../utils/cierre-caja';
import { CierreCaja, Gasto, MetodoPago, Pago, Profesor } from '../types';

/** Ingresos − gastos de la sesión cerrada (usa totales guardados si existen). */
function balanceSesionCierre(c: CierreCaja): number {
  if (c.totalIngresos != null && c.totalGastos != null) {
    return c.totalIngresos - c.totalGastos;
  }
  return c.neto ?? 0;
}

type CajaStats = {
  totalEfectivo: number;
  totalTransferencia: number;
  totalGeneral: number;
  gastosEfectivo: number;
  gastosTransferencia: number;
  totalGastos: number;
  /** Ingresos − gastos (sin descontar retiros de cierres). */
  totalTeorico: number;
  /** Suma de lo retirado en cada cierre. */
  totalRetiros: number;
  /** Saldo disponible = totalTeorico − totalRetiros. */
  totalNeto: number;
  periodoIngresos: number;
  periodoGastos: number;
  periodoNeto: number;
  periodoEfectivoIng: number;
  periodoEfectivoGas: number;
  periodoTransfIng: number;
  periodoTransfGas: number;
  /** Texto del último cierre (fecha/hora); el período cuenta movimientos posteriores a ese instante. */
  periodoDesdeTexto: string | null;
  pagosHoy: number;
  pagosMes: number;
  pagosPeriodoCount: number;
  /** Sueldos: descuentan del total global, no del período actual. */
  totalSueldosPagados: number;
};

function computeCajaStats(todosPagos: Pago[], todosGastos: Gasto[], listaCierres: CierreCaja[]): CajaStats {
  const ultimoCierre = getUltimoCierre(listaCierres);
  const enP = (p: Pago) => estaEnPeriodoAbiertoCaja(p, ultimoCierre);
  const enG = (g: Gasto) => estaEnPeriodoAbiertoCaja(g, ultimoCierre);

  const efectivo = todosPagos.filter((p) => p.metodoPago === 'efectivo').reduce((s, p) => s + p.monto, 0);
  const transferencia = todosPagos.filter((p) => p.metodoPago === 'transferencia').reduce((s, p) => s + p.monto, 0);
  const gastosEfvo = todosGastos.filter((g) => g.metodoPago === 'efectivo').reduce((s, g) => s + g.monto, 0);
  const gastosTransf = todosGastos.filter((g) => g.metodoPago === 'transferencia').reduce((s, g) => s + g.monto, 0);
  const totalGastos = gastosEfvo + gastosTransf;
  const totalEfectivoNeto = efectivo - gastosEfvo;
  const totalTransferenciaNeto = transferencia - gastosTransf;
  const totalGeneralNeto = totalEfectivoNeto + totalTransferenciaNeto;
  const totalRetiros = listaCierres.reduce((s, c) => s + (c.montoRetirado ?? 0), 0);
  const saldoTrasRetiros = totalGeneralNeto - totalRetiros;

  const pagosP = todosPagos.filter(enP);
  const gastosP = todosGastos.filter(enG);

  const periodoEfectivoIng = pagosP.filter((p) => p.metodoPago === 'efectivo').reduce((s, p) => s + p.monto, 0);
  const periodoTransfIng = pagosP.filter((p) => p.metodoPago === 'transferencia').reduce((s, p) => s + p.monto, 0);
  const periodoEfectivoGas = gastosP.filter((g) => g.metodoPago === 'efectivo').reduce((s, g) => s + g.monto, 0);
  const periodoTransfGas = gastosP.filter((g) => g.metodoPago === 'transferencia').reduce((s, g) => s + g.monto, 0);
  const periodoIngresos = periodoEfectivoIng + periodoTransfIng;
  const periodoGastos = periodoEfectivoGas + periodoTransfGas;
  const periodoNeto = periodoIngresos - periodoGastos;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const pagosHoy = todosPagos
    .filter((p) => {
      const fechaPago = new Date(p.fecha);
      fechaPago.setHours(0, 0, 0, 0);
      return fechaPago.getTime() === hoy.getTime() && enP(p);
    })
    .reduce((s, p) => s + p.monto, 0);

  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const pagosMes = todosPagos
    .filter((p) => {
      const fechaPago = new Date(p.fecha);
      return fechaPago >= inicioMes && enP(p);
    })
    .reduce((s, p) => s + p.monto, 0);

  const periodoDesdeTexto = ultimoCierre
    ? formatDateTime(
        ultimoCierre.cerradoEn ??
          combinarFechaHoraISO(cierreFechaCorte(ultimoCierre), '12:00')
      )
    : null;

  const totalSueldosPagados = todosGastos
    .filter((g) => g.profesorId)
    .reduce((s, g) => s + g.monto, 0);

  return {
    totalEfectivo: efectivo,
    totalTransferencia: transferencia,
    totalGeneral: efectivo + transferencia,
    gastosEfectivo: gastosEfvo,
    gastosTransferencia: gastosTransf,
    totalGastos,
    totalTeorico: totalGeneralNeto,
    totalRetiros,
    totalNeto: saldoTrasRetiros,
    periodoIngresos,
    periodoGastos,
    periodoNeto,
    periodoEfectivoIng,
    periodoEfectivoGas,
    periodoTransfIng,
    periodoTransfGas,
    periodoDesdeTexto,
    pagosHoy,
    pagosMes,
    pagosPeriodoCount: pagosP.length,
    totalSueldosPagados,
  };
}

const Caja = () => {
  const [stats, setStats] = useState<CajaStats>({
    totalEfectivo: 0,
    totalTransferencia: 0,
    totalGeneral: 0,
    gastosEfectivo: 0,
    gastosTransferencia: 0,
    totalGastos: 0,
    totalTeorico: 0,
    totalRetiros: 0,
    totalNeto: 0,
    periodoIngresos: 0,
    periodoGastos: 0,
    periodoNeto: 0,
    periodoEfectivoIng: 0,
    periodoEfectivoGas: 0,
    periodoTransfIng: 0,
    periodoTransfGas: 0,
    periodoDesdeTexto: null,
    pagosHoy: 0,
    pagosMes: 0,
    pagosPeriodoCount: 0,
    totalSueldosPagados: 0,
  });

  const [pagos, setPagos] = useState<Pago[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModalGasto, setShowModalGasto] = useState(false);
  const [formDataGasto, setFormDataGasto] = useState({
    descripcion: '',
    monto: '',
    metodoPago: 'efectivo' as MetodoPago,
    fecha: new Date().toISOString().split('T')[0],
  });
  const [cierres, setCierres] = useState<CierreCaja[]>([]);
  const [showModalCierre, setShowModalCierre] = useState(false);
  const [cierreDetalle, setCierreDetalle] = useState<CierreCaja | null>(null);
  const [formCierre, setFormCierre] = useState({
    descripcion: '',
    montoRetirado: '0',
  });
  const [guardandoCierre, setGuardandoCierre] = useState(false);
  /** Si se abrió "Registrar gasto" desde un cierre ya guardado (gasto pendiente de ese mes). */
  const [gastoDesdeCierre, setGastoDesdeCierre] = useState<CierreCaja | null>(null);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const [alumnos, setAlumnos] = useState<any[]>([]);
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [showModalSueldos, setShowModalSueldos] = useState(false);
  const [formSueldos, setFormSueldos] = useState<{
    fecha: string;
    /** Mes/período al que corresponde el sueldo (estadísticas del período en Caja). */
    contabilizarEnFecha: string;
    montosEfvoPorId: Record<string, string>;
    montosTransfPorId: Record<string, string>;
  }>({
    fecha: new Date().toISOString().slice(0, 10),
    contabilizarEnFecha: (() => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 1);
      return d.toISOString().slice(0, 10);
    })(),
    montosEfvoPorId: {},
    montosTransfPorId: {},
  });
  const [guardandoSueldos, setGuardandoSueldos] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const fn = () => setIsMobile(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  useEffect(() => {
    const loadAlumnos = async () => {
      try {
        const data = await storageHybrid.alumnos.getAll();
        setAlumnos(data);
      } catch (error) {
        setAlumnos(storage.alumnos.getAll());
      }
    };
    loadAlumnos();
  }, []);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [todosPagos, todosGastos, listaProfesores] = await Promise.all([
        storageHybrid.pagos.getAll(),
        storageHybrid.gastos.getAll(),
        storageHybrid.profesores.getAll().catch(() => [] as Profesor[]),
      ]);
      setPagos(todosPagos);
      setGastos(todosGastos);
      setProfesores(listaProfesores);

      let listaCierres: CierreCaja[] = [];
      try {
        listaCierres = await storageHybrid.cierresCaja.getAll();
        setCierres(listaCierres);
      } catch {
        listaCierres = storage.cierresCaja.getAll();
        setCierres(listaCierres);
      }

      setStats(computeCajaStats(todosPagos, todosGastos, listaCierres));
    } catch (error) {
      console.error('Error loading stats:', error);
      // Fallback a localStorage
      const todosPagos = storage.pagos.getAll();
      const todosGastos = storage.gastos.getAll();
      setPagos(todosPagos);
      setGastos(todosGastos);
      try {
        setProfesores(await storageHybrid.profesores.getAll());
      } catch {
        setProfesores([]);
      }
      const listaCierres = storage.cierresCaja.getAll();
      setCierres(listaCierres);
      setStats(computeCajaStats(todosPagos, todosGastos, listaCierres));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModalGasto = () => {
    setGastoDesdeCierre(null);
    setFormDataGasto({
      descripcion: '',
      monto: '',
      metodoPago: 'efectivo',
      fecha: new Date().toISOString().split('T')[0],
    });
    setShowModalGasto(true);
  };

  const abrirGastoPendienteDesdeCierre = (cierre: CierreCaja) => {
    setGastoDesdeCierre(cierre);
    const fc = cierreFechaCorte(cierre) || new Date().toISOString().slice(0, 10);
    setFormDataGasto({
      descripcion: '',
      monto: '',
      metodoPago: 'efectivo',
      fecha: fc,
    });
    setShowModalGasto(true);
  };

  const handleCerrarModalGasto = () => {
    setShowModalGasto(false);
    setGastoDesdeCierre(null);
    setFormDataGasto({
      descripcion: '',
      monto: '',
      metodoPago: 'efectivo',
      fecha: new Date().toISOString().split('T')[0],
    });
  };

  const handleSubmitGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const monto = parseFloat(formDataGasto.monto);
    if (isNaN(monto) || monto <= 0) {
      alert('El monto debe ser un número válido mayor a 0');
      return;
    }

    if (!formDataGasto.descripcion.trim()) {
      alert('Por favor ingresá una descripción del gasto');
      return;
    }

    if (gastoDesdeCierre) {
      const { fechaMin, fechaMax } = movimientosRangoCierre(cierres, gastoDesdeCierre);
      const f = formDataGasto.fecha;
      if (f < fechaMin || f > fechaMax) {
        alert(
          `La fecha del gasto tiene que estar entre ${formatDate(fechaMin)} y ${formatDate(fechaMax)}.`
        );
        return;
      }
    }

    try {
      const nuevoGasto: Gasto = {
        id: Date.now().toString(),
        descripcion: formDataGasto.descripcion.trim(),
        monto: monto,
        metodoPago: formDataGasto.metodoPago,
        fecha: formDataGasto.fecha,
        hora: horaActualInput(),
        createdAt: new Date().toISOString(),
      };

      await storageHybrid.gastos.add(nuevoGasto);
      await loadStats();
      handleCerrarModalGasto();
      alert('Gasto registrado exitosamente');
    } catch (error) {
      console.error('Error saving gasto:', error);
      alert('Error al registrar el gasto. Por favor intentá nuevamente.');
    }
  };

  const handleEliminarGasto = async (id: string) => {
    if (confirm('¿Estás seguro de que querés eliminar este gasto?')) {
      try {
        await storageHybrid.gastos.delete(id);
        await loadStats();
      } catch (error) {
        console.error('Error deleting gasto:', error);
        alert('Error al eliminar el gasto. Revisá la consola para más detalles.');
      }
    }
  };

  const abrirModalSueldos = () => {
    const imput = new Date();
    imput.setDate(1);
    imput.setMonth(imput.getMonth() - 1);
    setFormSueldos({
      fecha: new Date().toISOString().slice(0, 10),
      contabilizarEnFecha: imput.toISOString().slice(0, 10),
      montosEfvoPorId: {},
      montosTransfPorId: {},
    });
    setShowModalSueldos(true);
  };

  const handleSubmitSueldos = async (e: React.FormEvent) => {
    e.preventDefault();
    const baseTime = Date.now();
    type Item = { prof: Profesor; monto: number; metodoPago: MetodoPago };
    const creados: Item[] = [];
    let sub = 0;
    for (const p of profesores) {
      const rawEf = (formSueldos.montosEfvoPorId[p.id] ?? '').trim().replace(',', '.');
      const rawTr = (formSueldos.montosTransfPorId[p.id] ?? '').trim().replace(',', '.');
      const mEf = rawEf ? parseFloat(rawEf) : 0;
      const mTr = rawTr ? parseFloat(rawTr) : 0;
      if (!rawEf && !rawTr) continue;
      if ((rawEf && !Number.isFinite(mEf)) || (rawTr && !Number.isFinite(mTr))) {
        alert(`Los montos para ${p.nombre} ${p.apellido} no son válidos.`);
        return;
      }
      if (mEf < 0 || mTr < 0) {
        alert(`Los montos para ${p.nombre} ${p.apellido} no pueden ser negativos.`);
        return;
      }
      if (mEf > 0) creados.push({ prof: p, monto: mEf, metodoPago: 'efectivo' });
      if (mTr > 0) creados.push({ prof: p, monto: mTr, metodoPago: 'transferencia' });
    }
    if (creados.length === 0) {
      alert('Ingresá al menos un monto en efectivo o transferencia para algún profesor.');
      return;
    }
    setGuardandoSueldos(true);
    const horaPago = horaActualInput();
    try {
      const vecesPorProf = new Map<string, number>();
      for (const it of creados) {
        vecesPorProf.set(it.prof.id, (vecesPorProf.get(it.prof.id) ?? 0) + 1);
      }
      for (const item of creados) {
        const { prof, monto, metodoPago } = item;
        const suf = metodoPago === 'efectivo' ? 'ef' : 'tr';
        const partes =
          (vecesPorProf.get(prof.id) ?? 0) > 1
            ? ` (${metodoPago === 'efectivo' ? 'efectivo' : 'transf.'})`
            : '';
        const nuevoGasto: Gasto = {
          id: `${baseTime}-sueldo-${sub++}-${suf}-${prof.id}`,
          descripcion: `Sueldo: ${prof.nombre} ${prof.apellido}${partes}`,
          monto,
          metodoPago,
          fecha: formSueldos.fecha,
          hora: horaPago,
          createdAt: new Date().toISOString(),
          profesorId: prof.id,
          contabilizarEnFecha: formSueldos.contabilizarEnFecha,
        };
        await storageHybrid.gastos.add(nuevoGasto);
      }
      setShowModalSueldos(false);
      await loadStats();
      alert(
        creados.length === 1
          ? 'Pago de sueldo registrado.'
          : `${creados.length} movimientos de sueldo registrados.`
      );
    } catch (err) {
      console.error(err);
      alert('No se pudieron guardar los pagos. Revisá la conexión e intentá de nuevo.');
    } finally {
      setGuardandoSueldos(false);
    }
  };

  const cierresOrdenados = useMemo(
    () => [...cierres].sort((a, b) => instanteCierre(b) - instanteCierre(a)),
    [cierres]
  );

  const ultimoCierreVista = getUltimoCierre(cierres);
  const pagosPeriodoVista = ultimoCierreVista
    ? pagos.filter((p) => estaEnPeriodoAbiertoCaja(p, ultimoCierreVista))
    : pagos;
  const gastosPeriodoVista = ultimoCierreVista
    ? gastos.filter((g) => estaEnPeriodoAbiertoCaja(g, ultimoCierreVista))
    : gastos;

  const ultimosPagos = pagosPeriodoVista
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  const ultimosGastos = gastosPeriodoVista
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  const getAlumnoNombre = (pago: Pago): string => {
    if (pago.alumnoId == null) return pago.descripcion || 'Aporte a caja';
    const alumno = alumnos.find(a => a.id === pago.alumnoId);
    return alumno ? `${alumno.nombre} ${alumno.apellido}` : 'Desconocido';
  };

  const handleEliminarPago = async (pago: Pago) => {
    const nombre = getAlumnoNombre(pago);
    if (!confirm(`¿Eliminar el pago de ${formatCurrency(pago.monto)} (${nombre}, ${formatDate(pago.fecha)})? Esta acción no se puede deshacer.`)) return;
    try {
      await storageHybrid.pagos.delete(pago.id);
      await loadStats();
    } catch (error) {
      console.error('Error al eliminar pago:', error);
      alert('No se pudo eliminar el pago.');
    }
  };

  const movimientosCaja = [
    ...pagos.map((p) => ({
      id: `p-${p.id}`,
      fecha: p.fecha,
      createdAt: p.createdAt,
      tipo: 'ingreso' as const,
      concepto: p.alumnoId == null ? (p.descripcion || 'Aporte a caja') : `${getAlumnoNombre(p)}${p.descripcion ? ` — ${p.descripcion}` : ''}`,
      metodoPago: p.metodoPago,
      monto: p.monto,
    })),
    ...gastos.map((g) => ({
      id: `g-${g.id}`,
      fecha: g.fecha,
      createdAt: g.createdAt,
      tipo: 'gasto' as const,
      concepto: g.descripcion || 'Gasto',
      metodoPago: g.metodoPago,
      monto: g.monto,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const movimientosCierreDetalle = useMemo(() => {
    if (!cierreDetalle) return [];
    const { fechaMin, fechaMax } = movimientosRangoCierre(cierres, cierreDetalle);
    return movimientosCaja
      .filter((m) => m.fecha >= fechaMin && m.fecha <= fechaMax)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [cierreDetalle, cierres, movimientosCaja]);

  const rangoGastoPendiente = useMemo(() => {
    if (!gastoDesdeCierre) return null;
    return movimientosRangoCierre(cierres, gastoDesdeCierre);
  }, [gastoDesdeCierre, cierres]);

  const abrirModalCerrarCaja = () => {
    setFormCierre({
      descripcion: '',
      montoRetirado: '0',
    });
    setShowModalCierre(true);
  };

  const handleSubmitCierre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCierre.descripcion.trim()) {
      alert('Ingresá un nombre para el cierre.');
      return;
    }
    const monto = parseFloat(String(formCierre.montoRetirado).replace(',', '.'));
    if (!Number.isFinite(monto) || monto < 0) {
      alert('Indicá cuánto retirás de la caja (número ≥ 0).');
      return;
    }
    setGuardandoCierre(true);
    try {
      const ahora = new Date();
      const fechaCierre = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
      const horaCierre = horaActualInput();
      await storageHybrid.cierresCaja.crear({
        descripcion: formCierre.descripcion.trim(),
        fecha: fechaCierre,
        horaCierre,
        montoRetirado: monto,
      });
      setShowModalCierre(false);
      await loadStats();
      alert(
        'Caja cerrada. La sesión actual ya quedó abierta: podés seguir cargando movimientos y cerrar de nuevo cuando quieras (incluso varias veces en el día).'
      );
    } catch (err) {
      console.error(err);
      alert('No se pudo guardar el cierre. Revisá la consola o probá de nuevo.');
    } finally {
      setGuardandoCierre(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div className="page-title-wrap">
          <span className="page-title-accent" aria-hidden />
          <h1 className="page-title">Caja</h1>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleOpenModalGasto}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Registrar Gasto
          </button>
          <button
            type="button"
            onClick={abrirModalSueldos}
            className="btn-secondary flex items-center gap-2 border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100"
          >
            <Banknote className="w-5 h-5" />
            Pagos sueldos
          </button>
          <button
            type="button"
            onClick={abrirModalCerrarCaja}
            className="btn-secondary flex items-center gap-2 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
          >
            <Archive className="w-5 h-5" />
            Cerrar caja
          </button>
          <button
            onClick={loadStats}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-5 h-5" />
            Actualizar
          </button>
        </div>
      </div>

      <div className="card mb-8 overflow-hidden min-w-0">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Archive className="w-6 h-6 text-amber-700" />
            Cierres guardados
          </h2>
          <p className="text-sm text-gray-500">
            <strong>Balance sesión</strong> es ingresos − gastos de ese tramo. <strong>Saldo global después</strong> es tu caja total luego del retiro de ese cierre.
          </p>
        </div>
        {cierres.length === 0 ? (
          <p className="text-gray-500 text-sm">Todavía no hay cierres. Usá &quot;Cerrar caja&quot; para registrar un retiro y abrir una caja nueva.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px]">
              <thead className="bg-amber-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Alta</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Cierre (día y hora)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Retirado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase" title="Ingresos − gastos de esa sesión">
                    Balance sesión
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase" title="Saldo global luego de este retiro">
                    Saldo global después
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cierresOrdenados.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 bg-white">
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{formatDate(c.createdAt.slice(0, 10))}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.descripcion}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {c.cerradoEn
                        ? formatDateTime(c.cerradoEn)
                        : formatDate(cierreFechaCorte(c) || c.fechaDesde || '')}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-amber-900">
                      {formatCurrency(c.montoRetirado ?? 0)}
                    </td>
                    <td
                      className={`px-4 py-3 text-sm text-right font-semibold ${
                        balanceSesionCierre(c) >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {formatCurrency(balanceSesionCierre(c))}
                    </td>
                    <td
                      className={`px-4 py-3 text-sm text-right font-semibold ${
                        (c.saldoDespuesRetiro ?? 0) >= 0 ? 'text-primary-700' : 'text-red-700'
                      }`}
                    >
                      {formatCurrency(c.saldoDespuesRetiro ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setCierreDetalle(c)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700"
                      >
                        <Eye className="w-4 h-4" />
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Saldo de Caja - Destacado: total histórico + período nuevo tras último cierre */}
      <div className="card bg-gradient-to-r from-primary-600 to-primary-700 text-white mb-8 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold mb-1">Saldo en caja</h2>
            <p className="text-sm text-primary-100/90 mb-3">
              <strong className="text-primary-50">Total acumulado</strong> de la sucursal: todos los ingresos y gastos, menos los retiros registrados en cada cierre (ej. 473.000 − 200.000 retirados = 273.000).
            </p>
            <div className="rounded-lg bg-white/10 border border-white/20 px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-200">Período actual</p>
              <p className="text-sm text-primary-50">
                {stats.periodoDesdeTexto ? (
                  <>
                    Período actual: todo lo que registrás <strong>después</strong> del cierre del{' '}
                    <strong>{stats.periodoDesdeTexto}</strong>. Podés cerrar y volver a abrir varias veces el mismo día; cada movimiento guarda hora automática (24 h) y entra en la sesión abierta.
                  </>
                ) : (
                  <>Sin cierres todavía: el período actual incluye todos los movimientos.</>
                )}
              </p>
              <p className="text-xs text-primary-200/85 leading-snug">
                Los <strong className="text-primary-100">pagos de sueldo</strong> descuentan del total global (abajo) pero{' '}
                <strong>no</strong> se suman al neto del período abierto, así podés pagar meses atrasados sin mezclar la caja del día.
                {stats.totalSueldosPagados > 0 && (
                  <> Total sueldos registrados: {formatCurrency(stats.totalSueldosPagados)}.</>
                )}
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-sm">
                <span>
                  <span className="font-semibold">Ingresos:</span> {formatCurrency(stats.periodoIngresos)}
                </span>
                <span>
                  <span className="font-semibold">Gastos:</span> {formatCurrency(stats.periodoGastos)}
                </span>
                <span>
                  <span className="font-semibold">Neto período:</span>{' '}
                  <span className={stats.periodoNeto >= 0 ? 'text-green-200' : 'text-red-200'}>
                    {formatCurrency(stats.periodoNeto)}
                  </span>
                </span>
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm text-primary-200 mb-2 uppercase tracking-wide">Total en caja (global)</p>
            <p className={`text-4xl sm:text-5xl font-bold ${
              stats.totalNeto >= 0 ? 'text-green-300' : 'text-red-300'
            }`}>
              {formatCurrency(stats.totalNeto)}
            </p>
            <p className={`text-xs mt-2 ${stats.totalNeto >= 0 ? 'text-green-200' : 'text-red-200'}`}>
              {stats.totalNeto >= 0 ? '✓ Saldo acumulado' : '⚠ Saldo acumulado'}
            </p>
            <p className="text-xs text-primary-200/80 mt-3 max-w-[280px] ml-auto">
              Neto movimientos {formatCurrency(stats.totalTeorico)} − Retiros {formatCurrency(stats.totalRetiros)}
            </p>
          </div>
        </div>
      </div>

      {/* Cards de Resumen - todos el mismo ancho */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-8">
        <div className="card bg-green-50 border-2 border-green-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-green-700 uppercase tracking-wide">
              Efectivo — período actual
            </h3>
            <div className="bg-green-200 p-2 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-700" />
            </div>
          </div>
          <p className="text-3xl font-bold text-green-900 mb-1">
            {formatCurrency(stats.periodoEfectivoIng - stats.periodoEfectivoGas)}
          </p>
          <p className="text-xs text-green-700 mb-0.5">
            Ingresos: {formatCurrency(stats.periodoEfectivoIng)}
          </p>
          {stats.periodoEfectivoGas > 0 ? (
            <p className="text-xs text-red-600">
              Gastos: - {formatCurrency(stats.periodoEfectivoGas)}
            </p>
          ) : (
            <p className="text-xs text-green-600">Sin gastos en efectivo (período)</p>
          )}
          <p className="text-xs text-green-800/80 mt-2 pt-2 border-t border-green-200">
            Acumulado efectivo: {formatCurrency(stats.totalEfectivo - stats.gastosEfectivo)}
          </p>
        </div>

        <div className="card bg-blue-50 border-2 border-blue-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-blue-700 uppercase tracking-wide">
              Transferencia — período actual
            </h3>
            <div className="bg-blue-200 p-2 rounded-lg">
              <CreditCard className="w-5 h-5 text-blue-700" />
            </div>
          </div>
          <p className="text-3xl font-bold text-blue-900 mb-1">
            {formatCurrency(stats.periodoTransfIng - stats.periodoTransfGas)}
          </p>
          <p className="text-xs text-blue-700 mb-0.5">
            Ingresos: {formatCurrency(stats.periodoTransfIng)}
          </p>
          {stats.periodoTransfGas > 0 ? (
            <p className="text-xs text-red-600">
              Gastos: - {formatCurrency(stats.periodoTransfGas)}
            </p>
          ) : (
            <p className="text-xs text-blue-600">Sin gastos en transferencia (período)</p>
          )}
          <p className="text-xs text-blue-800/80 mt-2 pt-2 border-t border-blue-200">
            Acumulado transfer.: {formatCurrency(stats.totalTransferencia - stats.gastosTransferencia)}
          </p>
        </div>

        <div className="card bg-red-50 border-2 border-red-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-red-700 uppercase tracking-wide">
              Gastos — período actual
            </h3>
            <div className="bg-red-200 p-2 rounded-lg">
              <DollarSign className="w-5 h-5 text-red-700" />
            </div>
          </div>
          <p className="text-3xl font-bold text-red-900 mb-2">
            {formatCurrency(stats.periodoGastos)}
          </p>
          <p className="text-xs text-red-600">
            {gastosPeriodoVista.length} gastos en el período
          </p>
        </div>

        <div className="card bg-primary-50 border-2 border-primary-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-primary-700 uppercase tracking-wide">
              Neto — período actual
            </h3>
            <div className="bg-primary-200 p-2 rounded-lg">
              <Wallet className="w-5 h-5 text-primary-700" />
            </div>
          </div>
          <p className="text-3xl font-bold text-primary-900 mb-2">
            {formatCurrency(stats.periodoNeto)}
          </p>
          <p className="text-xs text-primary-600">
            Ingresos − gastos (desde último cierre)
          </p>
        </div>
        <div className="card bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-purple-200 p-3 rounded-lg">
              <Calendar className="w-6 h-6 text-purple-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Este mes</h3>
              <p className="text-sm text-gray-600">Pagos del mes (período actual)</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-purple-900">
            {formatCurrency(stats.pagosMes)}
          </p>
        </div>

        <div className="card bg-gradient-to-br from-indigo-50 to-cyan-50 border border-indigo-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-indigo-200 p-3 rounded-lg">
              <TrendingUp className="w-6 h-6 text-indigo-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Promedio por pago</h3>
              <p className="text-sm text-gray-600">Período actual</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-indigo-900">
            {stats.pagosPeriodoCount > 0
              ? formatCurrency(stats.periodoIngresos / stats.pagosPeriodoCount)
              : formatCurrency(0)}
          </p>
        </div>
      </div>

      {/* Últimos Gastos (solo período actual si hubo cierre) */}
      <div className="card mb-8 overflow-hidden min-w-0">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Últimos gastos</h2>
            {ultimoCierreVista && (
              <p className="text-sm text-gray-500 mt-0.5">Solo movimientos del período actual</p>
            )}
          </div>
          <button
            onClick={handleOpenModalGasto}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Nuevo Gasto
          </button>
        </div>
        {ultimosGastos.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No hay gastos registrados aún</p>
            <button onClick={handleOpenModalGasto} className="btn-primary">
              Registrar primer gasto
            </button>
          </div>
        ) : isMobile ? (
          <div className="space-y-3">
            {ultimosGastos.map((gasto) => (
              <div key={gasto.id} className="p-4 border border-gray-200 rounded-xl bg-white/80">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 text-base break-words">{gasto.descripcion}</p>
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-4 h-4 flex-shrink-0" />
                      {formatDate(gasto.fecha)} {formatHora24(gasto.hora)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-base font-semibold text-red-600">- {formatCurrency(gasto.monto)}</span>
                    <button onClick={() => handleEliminarGasto(gasto.id)} className="p-2 rounded-lg text-red-600 hover:bg-red-50 touch-manipulation" title="Eliminar gasto" aria-label="Eliminar"><Trash2 className="w-5 h-5" /></button>
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${gasto.metodoPago === 'efectivo' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                    {gasto.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto min-w-0 -mx-1 px-1">
            <table className="w-full min-w-[380px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Descripción</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Monto</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Método</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 w-20">Eliminar</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ultimosGastos.map((gasto) => (
                  <tr key={gasto.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(gasto.fecha)} {formatHora24(gasto.hora)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 min-w-0 break-words">{gasto.descripcion}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-red-600">- {formatCurrency(gasto.monto)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${gasto.metodoPago === 'efectivo' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                        {gasto.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button onClick={() => handleEliminarGasto(gasto.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg touch-manipulation" title="Eliminar gasto"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Últimos Pagos */}
      <div className="card overflow-hidden min-w-0">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900">Últimos pagos</h2>
          {ultimoCierreVista && (
            <p className="text-sm text-gray-500 mt-0.5">Solo movimientos del período actual</p>
          )}
        </div>
        {ultimosPagos.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No hay pagos registrados aún</p>
          </div>
        ) : isMobile ? (
          <div className="space-y-3">
            {ultimosPagos.map((pago) => (
              <div key={pago.id} className="p-4 border border-gray-200 rounded-xl bg-white/80">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 text-base break-words">{getAlumnoNombre(pago)}</p>
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-4 h-4 flex-shrink-0" />
                      {formatDate(pago.fecha)} {formatHora24(pago.hora)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-lg font-bold text-gray-900">{formatCurrency(pago.monto)}</span>
                    <button
                      type="button"
                      onClick={() => handleEliminarPago(pago)}
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50 touch-manipulation"
                      title="Eliminar pago"
                      aria-label="Eliminar pago"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${pago.metodoPago === 'efectivo' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                    {pago.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto min-w-0" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full min-w-[520px]">
              <thead className="bg-primary-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Alumno</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Monto</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Método</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider w-20">Eliminar</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ultimosPagos.map((pago) => (
                  <tr key={pago.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(pago.fecha)} {formatHora24(pago.hora)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 min-w-0 break-words">{getAlumnoNombre(pago)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">{formatCurrency(pago.monto)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${pago.metodoPago === 'efectivo' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                        {pago.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => handleEliminarPago(pago)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg touch-manipulation"
                        title="Eliminar pago"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Gasto (z-[70] si viene desde detalle de cierre para quedar arriba del panel) */}
      {showModalGasto && (
        <div
          className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 ${
            gastoDesdeCierre ? 'z-[70]' : 'z-50'
          }`}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {gastoDesdeCierre ? 'Registrar gasto pendiente' : 'Registrar gasto'}
                </h2>
                {gastoDesdeCierre && (
                  <p className="text-sm text-gray-500 mt-1 font-normal">
                    Mismo formulario que siempre; la fecha queda limitada al período de este cierre.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleCerrarModalGasto}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmitGasto} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción *
                </label>
                <input
                  type="text"
                  required
                  value={formDataGasto.descripcion}
                  onChange={(e) => setFormDataGasto({ ...formDataGasto, descripcion: e.target.value })}
                  className="input-field"
                  placeholder="Ej: Alquiler, Servicios, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Monto *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formDataGasto.monto}
                  onChange={(e) => setFormDataGasto({ ...formDataGasto, monto: e.target.value })}
                  className="input-field"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Método de Pago *
                </label>
                <select
                  required
                  value={formDataGasto.metodoPago}
                  onChange={(e) => setFormDataGasto({ ...formDataGasto, metodoPago: e.target.value as MetodoPago })}
                  className="input-field"
                >
                  <option value="efectivo">💵 Efectivo</option>
                  <option value="transferencia">💳 Transferencia</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha del gasto *
                </label>
                <input
                  type="date"
                  required
                  value={formDataGasto.fecha}
                  min={rangoGastoPendiente?.fechaMin}
                  max={rangoGastoPendiente?.fechaMax}
                  onChange={(e) => setFormDataGasto({ ...formDataGasto, fecha: e.target.value })}
                  className="input-field"
                />
                {gastoDesdeCierre && rangoGastoPendiente && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    Solo fechas entre {formatDate(rangoGastoPendiente.fechaMin)} y {formatDate(rangoGastoPendiente.fechaMax)}.
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-500">
                La hora del gasto se guarda automáticamente al registrar (24 h) y queda en el período actual si lo cargás después del último cierre.
              </p>
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <p className="text-sm text-red-800">
                  ⚠️ <strong>Nota:</strong> El gasto se descontará del total de caja correspondiente (efectivo o transferencia).
                </p>
                {gastoDesdeCierre && (
                  <p className="text-sm text-amber-900 mt-2 pt-2 border-t border-red-100">
                    <strong>Cierre ya guardado:</strong> los totales de la tarjeta de este cierre no se recalculan solos; el gasto aparece en la tabla de abajo y en el saldo general de la caja.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCerrarModalGasto}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-danger flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  {gastoDesdeCierre ? 'Guardar gasto' : 'Registrar gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModalSueldos && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Banknote className="w-7 h-7 text-violet-600" />
                  Pagos de sueldos
                </h2>
                <p className="text-sm text-gray-500 mt-1 font-normal">
                  El dinero sale de la caja en la <strong>fecha del pago</strong>. La fecha &quot;Corresponde a&quot; define el período del resumen de arriba (ej. sueldo de marzo pagado en abril no suma en el neto de abril).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModalSueldos(false)}
                className="text-gray-400 hover:text-gray-600 shrink-0"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmitSueldos} className="p-6 space-y-4">
              {profesores.length === 0 ? (
                <p className="text-sm text-gray-600">
                  No hay profesores cargados. Agregalos en <strong>Profesores</strong> y volvé acá.
                </p>
              ) : (
                <>
                  <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-3 text-sm">
                    <p className="font-semibold text-violet-900 mb-2">Disponible en caja (por método)</p>
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      <span>
                        Efectivo:{' '}
                        <strong className="text-violet-950">
                          {formatCurrency(stats.totalEfectivo - stats.gastosEfectivo)}
                        </strong>
                      </span>
                      <span>
                        Transferencia:{' '}
                        <strong className="text-violet-950">
                          {formatCurrency(stats.totalTransferencia - stats.gastosTransferencia)}
                        </strong>
                      </span>
                    </div>
                    <p className="text-xs text-violet-900/85 mt-2">
                      Total global: <strong>{formatCurrency(stats.totalNeto)}</strong> (neto movimientos − retiros). Los retiros no se asignan a un método; estos montos son ingresos − gastos por tipo.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fecha del pago *</label>
                    <input
                      type="date"
                      required
                      value={formSueldos.fecha}
                      onChange={(e) => setFormSueldos({ ...formSueldos, fecha: e.target.value })}
                      className="input-field max-w-xs"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    La hora del pago se guarda automáticamente al registrar (24 h).
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Corresponde a (imputación) *
                    </label>
                    <input
                      type="date"
                      required
                      value={formSueldos.contabilizarEnFecha}
                      onChange={(e) =>
                        setFormSueldos({ ...formSueldos, contabilizarEnFecha: e.target.value })
                      }
                      className="input-field max-w-xs"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Mes o período al que corresponde el sueldo. Así el resumen &quot;Período actual&quot; de Caja no mezcla, por ejemplo, marzo con abril.
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[min(50vh,380px)] overflow-y-auto">
                    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] gap-2 items-center px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600 border-b">
                      <span>Profesor</span>
                      <span className="text-right">Efectivo</span>
                      <span className="text-right">Transf.</span>
                    </div>
                    {profesores.map((p) => (
                      <div
                        key={p.id}
                        className="grid grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] gap-2 items-center px-3 py-2 border-b border-gray-100 last:border-0"
                      >
                        <span className="text-sm font-medium text-gray-900 min-w-0">
                          {p.nombre} {p.apellido}
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          aria-label={`Efectivo ${p.nombre}`}
                          value={formSueldos.montosEfvoPorId[p.id] ?? ''}
                          onChange={(e) =>
                            setFormSueldos({
                              ...formSueldos,
                              montosEfvoPorId: { ...formSueldos.montosEfvoPorId, [p.id]: e.target.value },
                            })
                          }
                          className="input-field text-right text-sm py-1.5"
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          aria-label={`Transferencia ${p.nombre}`}
                          value={formSueldos.montosTransfPorId[p.id] ?? ''}
                          onChange={(e) =>
                            setFormSueldos({
                              ...formSueldos,
                              montosTransfPorId: { ...formSueldos.montosTransfPorId, [p.id]: e.target.value },
                            })
                          }
                          className="input-field text-right text-sm py-1.5"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    Podés combinar efectivo y transferencia por persona. Dejá en blanco lo que no pagues ahora.
                  </p>
                </>
              )}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => setShowModalSueldos(false)} className="btn-secondary">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={profesores.length === 0 || guardandoSueldos}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {guardandoSueldos ? 'Guardando…' : 'Registrar pagos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModalCierre && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Archive className="w-6 h-6 text-amber-600" />
                Cerrar caja
              </h2>
              <button
                type="button"
                onClick={() => setShowModalCierre(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmitCierre} className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Al guardar se registra automáticamente la <strong>fecha y hora de este momento</strong> (24 h): cierra la sesión actual y la siguiente empieza justo después. El retiro se descuenta del saldo (ej. 473.000 − 200.000 = 273.000).
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nombre del cierre *</label>
                <input
                  type="text"
                  required
                  value={formCierre.descripcion}
                  onChange={(e) => setFormCierre({ ...formCierre, descripcion: e.target.value })}
                  className="input-field"
                  placeholder="Ej: Cierre 1 abril"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Monto retirado de la caja *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formCierre.montoRetirado}
                  onChange={(e) => setFormCierre({ ...formCierre, montoRetirado: e.target.value })}
                  className="input-field"
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Saldo disponible antes (referencia): {formatCurrency(stats.totalNeto + stats.totalRetiros)} · Ya retirado en cierres: {formatCurrency(stats.totalRetiros)}
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => setShowModalCierre(false)} className="btn-secondary">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoCierre}
                  className="btn-primary flex items-center gap-2 bg-amber-600 hover:bg-amber-700 border-amber-600"
                >
                  <Archive className="w-4 h-4" />
                  {guardandoCierre ? 'Guardando…' : 'Guardar cierre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cierreDetalle && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full my-8 mb-12">
            <div className="p-6 border-b border-gray-200 flex justify-between items-start gap-4 flex-wrap sticky top-0 bg-white rounded-t-xl z-10">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{cierreDetalle.descripcion}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Cierre operativo:{' '}
                  {cierreDetalle.cerradoEn
                    ? formatDateTime(cierreDetalle.cerradoEn)
                    : formatDate(cierreFechaCorte(cierreDetalle) || cierreDetalle.fechaDesde || '')}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Alta del registro: {formatDateTime(cierreDetalle.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCierreDetalle(null)}
                className="text-gray-400 hover:text-gray-600 shrink-0"
                aria-label="Cerrar"
              >
                <X className="w-7 h-7" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <p className="text-sm text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                La tabla muestra ingresos y gastos de la sesión que cerraste (sin pagos de sueldo a profesores: esos bajan el total global de caja pero no entran al balance de esta sesión). Los importes de retiro y saldo quedaron guardados al registrar el cierre.
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs text-emerald-900 uppercase">Balance sesión</p>
                  <p className="text-lg font-bold text-emerald-950">
                    {formatCurrency(balanceSesionCierre(cierreDetalle))}
                  </p>
                  <p className="text-[11px] text-emerald-800 mt-1">Ingresos − gastos de este cierre</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs text-amber-900 uppercase">Retirado</p>
                  <p className="text-lg font-bold text-amber-950">{formatCurrency(cierreDetalle.montoRetirado ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-xs text-green-800 uppercase">Saldo global antes</p>
                  <p className="text-lg font-bold text-green-900">{formatCurrency(cierreDetalle.saldoAntesRetiro ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-primary-200 bg-primary-50 p-3">
                  <p className="text-xs text-primary-800 uppercase">Saldo global después</p>
                  <p className="text-lg font-bold text-primary-900">
                    {formatCurrency(cierreDetalle.saldoDespuesRetiro ?? 0)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-600 uppercase">Movimientos sesión</p>
                  <p className="text-lg font-bold text-gray-900">{cierreDetalle.movimientosCount ?? 0}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-green-100 bg-white p-3 text-sm">
                  <span className="text-gray-600">Ingresos (sesión): </span>
                  <span className="font-semibold text-green-800">{formatCurrency(cierreDetalle.totalIngresos ?? 0)}</span>
                </div>
                <div className="rounded-lg border border-red-100 bg-white p-3 text-sm">
                  <span className="text-gray-600">Gastos (sesión): </span>
                  <span className="font-semibold text-red-700">{formatCurrency(cierreDetalle.totalGastos ?? 0)}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3 bg-gray-50">
                  <span className="text-gray-600">Efectivo: ingresos </span>
                  <span className="font-semibold text-green-800">{formatCurrency(cierreDetalle.ingresosEfectivo ?? 0)}</span>
                  <span className="text-gray-500"> · gastos </span>
                  <span className="font-semibold text-red-700">{formatCurrency(cierreDetalle.gastosEfectivo ?? 0)}</span>
                </div>
                <div className="rounded-lg border p-3 bg-gray-50">
                  <span className="text-gray-600">Transferencia: ingresos </span>
                  <span className="font-semibold text-green-800">{formatCurrency(cierreDetalle.ingresosTransferencia ?? 0)}</span>
                  <span className="text-gray-500"> · gastos </span>
                  <span className="font-semibold text-red-700">{formatCurrency(cierreDetalle.gastosTransferencia ?? 0)}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => abrirGastoPendienteDesdeCierre(cierreDetalle)}
                  className="btn-primary flex items-center gap-2 bg-red-600 hover:bg-red-700 border-red-600"
                >
                  <Plus className="w-5 h-5" />
                  Agregar gasto pendiente (este período)
                </button>
                <p className="text-sm text-gray-600 self-center">
                  Mismo formulario que &quot;Registrar gasto&quot;; la fecha solo puede caer dentro del rango de este cierre.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Movimientos del período</h3>
                {movimientosCierreDetalle.length === 0 ? (
                  <p className="text-gray-500 text-sm">No hay movimientos en ese rango de fechas.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full min-w-[640px]">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Fecha</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Tipo</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Concepto</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Método</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {movimientosCierreDetalle.map((m) => (
                          <tr key={m.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{formatDate(m.fecha)}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  m.tipo === 'ingreso' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-900">{m.concepto}</td>
                            <td className="px-3 py-2 text-sm text-gray-700">
                              {m.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                            </td>
                            <td
                              className={`px-3 py-2 whitespace-nowrap text-sm font-semibold text-right ${
                                m.tipo === 'ingreso' ? 'text-green-700' : 'text-red-700'
                              }`}
                            >
                              {m.tipo === 'ingreso' ? '+' : '-'} {formatCurrency(m.monto)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Caja;
