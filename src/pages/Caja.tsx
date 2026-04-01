import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, DollarSign, CreditCard, Wallet, TrendingUp, Calendar, Plus, X, Save, Trash2, Archive, Eye } from 'lucide-react';
import { storage } from '../utils/storage';
import { storageHybrid } from '../utils/storage-hybrid';
import { formatCurrency } from '../utils/format';
import { formatDate } from '../utils/date';
import {
  boundsForMesYYYYMM,
  diaSiguiente,
  enPeriodoAbierto,
  getUltimoCierrePorRegistro,
} from '../utils/cierre-caja';
import { CierreCaja, Gasto, MetodoPago, Pago } from '../types';

const mesFromFecha = (fecha: string) => (fecha || '').slice(0, 7);
const labelMes = (mes: string) => {
  if (!mes) return '';
  const [y, m] = mes.split('-').map(Number);
  if (!y || !m) return mes;
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
};

type CajaStats = {
  totalEfectivo: number;
  totalTransferencia: number;
  totalGeneral: number;
  gastosEfectivo: number;
  gastosTransferencia: number;
  totalGastos: number;
  totalNeto: number;
  periodoIngresos: number;
  periodoGastos: number;
  periodoNeto: number;
  periodoEfectivoIng: number;
  periodoEfectivoGas: number;
  periodoTransfIng: number;
  periodoTransfGas: number;
  fechaInicioPeriodo: string | null;
  pagosHoy: number;
  pagosMes: number;
  pagosPeriodoCount: number;
};

function computeCajaStats(todosPagos: Pago[], todosGastos: Gasto[], listaCierres: CierreCaja[]): CajaStats {
  const ultimoCierre = getUltimoCierrePorRegistro(listaCierres);
  const inP = (fecha: string) => enPeriodoAbierto(fecha, ultimoCierre);

  const efectivo = todosPagos.filter((p) => p.metodoPago === 'efectivo').reduce((s, p) => s + p.monto, 0);
  const transferencia = todosPagos.filter((p) => p.metodoPago === 'transferencia').reduce((s, p) => s + p.monto, 0);
  const gastosEfvo = todosGastos.filter((g) => g.metodoPago === 'efectivo').reduce((s, g) => s + g.monto, 0);
  const gastosTransf = todosGastos.filter((g) => g.metodoPago === 'transferencia').reduce((s, g) => s + g.monto, 0);
  const totalGastos = gastosEfvo + gastosTransf;
  const totalEfectivoNeto = efectivo - gastosEfvo;
  const totalTransferenciaNeto = transferencia - gastosTransf;
  const totalGeneralNeto = totalEfectivoNeto + totalTransferenciaNeto;

  const pagosP = todosPagos.filter((p) => inP(p.fecha));
  const gastosP = todosGastos.filter((g) => inP(g.fecha));

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
      return fechaPago.getTime() === hoy.getTime() && inP(p.fecha);
    })
    .reduce((s, p) => s + p.monto, 0);

  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const pagosMes = todosPagos
    .filter((p) => {
      const fechaPago = new Date(p.fecha);
      return fechaPago >= inicioMes && inP(p.fecha);
    })
    .reduce((s, p) => s + p.monto, 0);

  const fechaInicioPeriodo = ultimoCierre ? diaSiguiente(ultimoCierre.fechaHasta) : null;

  return {
    totalEfectivo: efectivo,
    totalTransferencia: transferencia,
    totalGeneral: efectivo + transferencia,
    gastosEfectivo: gastosEfvo,
    gastosTransferencia: gastosTransf,
    totalGastos,
    totalNeto: totalGeneralNeto,
    periodoIngresos,
    periodoGastos,
    periodoNeto,
    periodoEfectivoIng,
    periodoEfectivoGas,
    periodoTransfIng,
    periodoTransfGas,
    fechaInicioPeriodo,
    pagosHoy,
    pagosMes,
    pagosPeriodoCount: pagosP.length,
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
    totalNeto: 0,
    periodoIngresos: 0,
    periodoGastos: 0,
    periodoNeto: 0,
    periodoEfectivoIng: 0,
    periodoEfectivoGas: 0,
    periodoTransfIng: 0,
    periodoTransfGas: 0,
    fechaInicioPeriodo: null,
    pagosHoy: 0,
    pagosMes: 0,
    pagosPeriodoCount: 0,
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
  const [mesDetalle, setMesDetalle] = useState(new Date().toISOString().slice(0, 7));

  const [cierres, setCierres] = useState<CierreCaja[]>([]);
  const [showModalCierre, setShowModalCierre] = useState(false);
  const [cierreDetalle, setCierreDetalle] = useState<CierreCaja | null>(null);
  const [formCierre, setFormCierre] = useState({ descripcion: '', fechaDesde: '', fechaHasta: '' });
  const [guardandoCierre, setGuardandoCierre] = useState(false);
  /** Si se abrió "Registrar gasto" desde un cierre ya guardado (gasto pendiente de ese mes). */
  const [gastoDesdeCierre, setGastoDesdeCierre] = useState<CierreCaja | null>(null);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const [alumnos, setAlumnos] = useState<any[]>([]);

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
      const [todosPagos, todosGastos] = await Promise.all([
        storageHybrid.pagos.getAll(),
        storageHybrid.gastos.getAll(),
      ]);
      setPagos(todosPagos);
      setGastos(todosGastos);

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
    setFormDataGasto({
      descripcion: '',
      monto: '',
      metodoPago: 'efectivo',
      fecha: cierre.fechaHasta,
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
      const f = formDataGasto.fecha;
      if (f < gastoDesdeCierre.fechaDesde || f > gastoDesdeCierre.fechaHasta) {
        alert(
          `La fecha del gasto tiene que estar dentro del período cerrado (${formatDate(gastoDesdeCierre.fechaDesde)} — ${formatDate(gastoDesdeCierre.fechaHasta)}).`
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

  const ultimoCierreVista = getUltimoCierrePorRegistro(cierres);
  const pagosPeriodoVista = ultimoCierreVista
    ? pagos.filter((p) => enPeriodoAbierto(p.fecha, ultimoCierreVista))
    : pagos;
  const gastosPeriodoVista = ultimoCierreVista
    ? gastos.filter((g) => enPeriodoAbierto(g.fecha, ultimoCierreVista))
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

  const resumenMensual = Array.from(new Set(movimientosCaja.map((m) => mesFromFecha(m.fecha))))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))
    .map((mes) => {
      const delMes = movimientosCaja.filter((m) => mesFromFecha(m.fecha) === mes);
      const ingresos = delMes.filter((m) => m.tipo === 'ingreso').reduce((sum, m) => sum + m.monto, 0);
      const egresos = delMes.filter((m) => m.tipo === 'gasto').reduce((sum, m) => sum + m.monto, 0);
      return { mes, ingresos, egresos, balance: ingresos - egresos, movimientos: delMes.length };
    });

  const movimientosMesDetalle = movimientosCaja.filter((m) => mesFromFecha(m.fecha) === mesDetalle);

  const movimientosCierreDetalle = useMemo(() => {
    if (!cierreDetalle) return [];
    const desde = cierreDetalle.fechaDesde;
    const hasta = cierreDetalle.fechaHasta;
    return movimientosCaja
      .filter((m) => m.fecha >= desde && m.fecha <= hasta)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [cierreDetalle, movimientosCaja]);

  const abrirModalCerrarCaja = () => {
    const b = boundsForMesYYYYMM(mesDetalle);
    setFormCierre({
      descripcion: '',
      fechaDesde: b.desde,
      fechaHasta: b.hasta,
    });
    setShowModalCierre(true);
  };

  const handleSubmitCierre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCierre.descripcion.trim()) {
      alert('Ingresá un detalle o nombre para el cierre (ej. Fin de caja marzo).');
      return;
    }
    if (formCierre.fechaDesde > formCierre.fechaHasta) {
      alert('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }
    setGuardandoCierre(true);
    try {
      await storageHybrid.cierresCaja.crear({
        descripcion: formCierre.descripcion.trim(),
        fechaDesde: formCierre.fechaDesde,
        fechaHasta: formCierre.fechaHasta,
      });
      setShowModalCierre(false);
      await loadStats();
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
          <p className="text-sm text-gray-500">Registrá un cierre con el detalle del período (quedan los totales guardados).</p>
        </div>
        {cierres.length === 0 ? (
          <p className="text-gray-500 text-sm">Todavía no hay cierres. Usá &quot;Cerrar caja&quot; para guardar un corte con nombre y fechas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-amber-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Registrado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Detalle</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Período</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Neto</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Mov.</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cierres.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 bg-white">
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{formatDate(c.createdAt.slice(0, 10))}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.descripcion}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {formatDate(c.fechaDesde)} — {formatDate(c.fechaHasta)}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-semibold ${c.neto >= 0 ? 'text-primary-700' : 'text-red-700'}`}>
                      {formatCurrency(c.neto)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{c.movimientosCount}</td>
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

      <div className="card mb-8 overflow-hidden min-w-0">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-xl font-bold text-gray-900">Resumen mensual</h2>
          <p className="text-sm text-gray-500">Tocá un mes para ver el detalle</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Mes</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Ingresos</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Egresos</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Balance</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Mov.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {resumenMensual.map((r) => (
                <tr
                  key={r.mes}
                  onClick={() => setMesDetalle(r.mes)}
                  className={`cursor-pointer hover:bg-gray-50 ${mesDetalle === r.mes ? 'bg-primary-50' : 'bg-white'}`}
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{labelMes(r.mes)}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-green-700">{formatCurrency(r.ingresos)}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-red-700">{formatCurrency(r.egresos)}</td>
                  <td className={`px-4 py-3 text-sm text-right font-bold ${r.balance >= 0 ? 'text-primary-700' : 'text-red-700'}`}>{formatCurrency(r.balance)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{r.movimientos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mb-8 overflow-hidden min-w-0">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Detalle de {labelMes(mesDetalle)}</h2>
        {movimientosMesDetalle.length === 0 ? (
          <p className="text-gray-500">No hay movimientos en este mes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-primary-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Concepto</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Método</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {movimientosMesDetalle.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatDate(m.fecha)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${m.tipo === 'ingreso' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                        {m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{m.concepto}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{m.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}</td>
                    <td className={`px-4 py-3 whitespace-nowrap text-sm font-semibold text-right ${m.tipo === 'ingreso' ? 'text-green-700' : 'text-red-700'}`}>
                      {m.tipo === 'ingreso' ? '+' : '-'} {formatCurrency(m.monto)}
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
              Dinero neto acumulado (todo el historial de ingresos y gastos).
            </p>
            <div className="rounded-lg bg-white/10 border border-white/20 px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-200">Período actual</p>
              <p className="text-sm text-primary-50">
                {stats.fechaInicioPeriodo ? (
                  <>
                    Desde el {formatDate(stats.fechaInicioPeriodo)} (después del último cierre). Ingresos y gastos arrancan de cero para este tramo.
                  </>
                ) : (
                  <>Sin cierres todavía: el período actual incluye todos los movimientos.</>
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
            <p className="text-sm text-primary-200 mb-2 uppercase tracking-wide">Total en caja</p>
            <p className={`text-4xl sm:text-5xl font-bold ${
              stats.totalNeto >= 0 ? 'text-green-300' : 'text-red-300'
            }`}>
              {formatCurrency(stats.totalNeto)}
            </p>
            <p className={`text-xs mt-2 ${stats.totalNeto >= 0 ? 'text-green-200' : 'text-red-200'}`}>
              {stats.totalNeto >= 0 ? '✓ Saldo acumulado' : '⚠ Saldo acumulado'}
            </p>
            <p className="text-xs text-primary-200/80 mt-3 max-w-[220px] ml-auto">
              Histórico: ingresos {formatCurrency(stats.totalGeneral)} · gastos {formatCurrency(stats.totalGastos)}
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
                      {formatDate(gasto.fecha)}
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
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatDate(gasto.fecha)}</td>
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
                      {formatDate(pago.fecha)}
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
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatDate(pago.fecha)}</td>
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
                  min={gastoDesdeCierre?.fechaDesde}
                  max={gastoDesdeCierre?.fechaHasta}
                  onChange={(e) => setFormDataGasto({ ...formDataGasto, fecha: e.target.value })}
                  className="input-field"
                />
                {gastoDesdeCierre && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    Solo fechas entre {formatDate(gastoDesdeCierre.fechaDesde)} y {formatDate(gastoDesdeCierre.fechaHasta)}.
                  </p>
                )}
              </div>
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
                Se guardan los totales del período elegido (ingresos y gastos por método). Podés poner un nombre claro, por ejemplo: <em>Fin de caja marzo</em>.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Detalle / nombre del cierre *</label>
                <input
                  type="text"
                  required
                  value={formCierre.descripcion}
                  onChange={(e) => setFormCierre({ ...formCierre, descripcion: e.target.value })}
                  className="input-field"
                  placeholder="Ej: Fin de caja mes marzo"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Desde *</label>
                  <input
                    type="date"
                    required
                    value={formCierre.fechaDesde}
                    onChange={(e) => setFormCierre({ ...formCierre, fechaDesde: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Hasta *</label>
                  <input
                    type="date"
                    required
                    value={formCierre.fechaHasta}
                    onChange={(e) => setFormCierre({ ...formCierre, fechaHasta: e.target.value })}
                    className="input-field"
                  />
                </div>
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
                  Período: {formatDate(cierreDetalle.fechaDesde)} — {formatDate(cierreDetalle.fechaHasta)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Cierre registrado el {formatDate(cierreDetalle.createdAt.slice(0, 10))}
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
                Los importes de resumen son los del momento del cierre. La tabla lista los movimientos con fecha dentro del período (si más adelante editás o borrás un movimiento, los totales del cierre no cambian).
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-xs text-green-800 uppercase">Ingresos</p>
                  <p className="text-lg font-bold text-green-900">{formatCurrency(cierreDetalle.totalIngresos)}</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs text-red-800 uppercase">Gastos</p>
                  <p className="text-lg font-bold text-red-900">{formatCurrency(cierreDetalle.totalGastos)}</p>
                </div>
                <div className="rounded-lg border border-primary-200 bg-primary-50 p-3">
                  <p className="text-xs text-primary-800 uppercase">Neto</p>
                  <p className="text-lg font-bold text-primary-900">{formatCurrency(cierreDetalle.neto)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-600 uppercase">Movimientos</p>
                  <p className="text-lg font-bold text-gray-900">{cierreDetalle.movimientosCount}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3 bg-gray-50">
                  <span className="text-gray-600">Efectivo: ingresos </span>
                  <span className="font-semibold text-green-800">{formatCurrency(cierreDetalle.ingresosEfectivo)}</span>
                  <span className="text-gray-500"> · gastos </span>
                  <span className="font-semibold text-red-700">{formatCurrency(cierreDetalle.gastosEfectivo)}</span>
                </div>
                <div className="rounded-lg border p-3 bg-gray-50">
                  <span className="text-gray-600">Transferencia: ingresos </span>
                  <span className="font-semibold text-green-800">{formatCurrency(cierreDetalle.ingresosTransferencia)}</span>
                  <span className="text-gray-500"> · gastos </span>
                  <span className="font-semibold text-red-700">{formatCurrency(cierreDetalle.gastosTransferencia)}</span>
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
