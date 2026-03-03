import { useState, useEffect } from 'react';
import { RefreshCw, DollarSign, CreditCard, Wallet, TrendingUp, Calendar, Plus, X, Save, Trash2 } from 'lucide-react';
import { storage } from '../utils/storage';
import { storageHybrid } from '../utils/storage-hybrid';
import { formatCurrency } from '../utils/format';
import { formatDate } from '../utils/date';
import { Gasto, MetodoPago, Pago } from '../types';

const Caja = () => {
  const [stats, setStats] = useState({
    totalEfectivo: 0,
    totalTransferencia: 0,
    totalGeneral: 0,
    gastosEfectivo: 0,
    gastosTransferencia: 0,
    totalGastos: 0,
    totalNeto: 0,
    pagosHoy: 0,
    pagosMes: 0,
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

      // Calcular ingresos
      const efectivo = todosPagos
      .filter(p => p.metodoPago === 'efectivo')
      .reduce((sum, p) => sum + p.monto, 0);

    const transferencia = todosPagos
      .filter(p => p.metodoPago === 'transferencia')
      .reduce((sum, p) => sum + p.monto, 0);

    // Calcular gastos
    const gastosEfvo = todosGastos
      .filter(g => g.metodoPago === 'efectivo')
      .reduce((sum, g) => sum + g.monto, 0);

    const gastosTransf = todosGastos
      .filter(g => g.metodoPago === 'transferencia')
      .reduce((sum, g) => sum + g.monto, 0);

    const totalGastos = gastosEfvo + gastosTransf;

    // Calcular totales netos
    const totalEfectivoNeto = efectivo - gastosEfvo;
    const totalTransferenciaNeto = transferencia - gastosTransf;
    const totalGeneralNeto = totalEfectivoNeto + totalTransferenciaNeto;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const pagosHoy = todosPagos
      .filter(p => {
        const fechaPago = new Date(p.fecha);
        fechaPago.setHours(0, 0, 0, 0);
        return fechaPago.getTime() === hoy.getTime();
      })
      .reduce((sum, p) => sum + p.monto, 0);

    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const pagosMes = todosPagos
      .filter(p => {
        const fechaPago = new Date(p.fecha);
        return fechaPago >= inicioMes;
      })
      .reduce((sum, p) => sum + p.monto, 0);

    setStats({
      totalEfectivo: efectivo,
      totalTransferencia: transferencia,
      totalGeneral: efectivo + transferencia,
      gastosEfectivo: gastosEfvo,
      gastosTransferencia: gastosTransf,
      totalGastos,
      totalNeto: totalGeneralNeto,
      pagosHoy,
      pagosMes,
    });
    } catch (error) {
      console.error('Error loading stats:', error);
      // Fallback a localStorage
      const todosPagos = storage.pagos.getAll();
      const todosGastos = storage.gastos.getAll();
      setPagos(todosPagos);
      setGastos(todosGastos);
      // Recalcular stats con localStorage
      const efectivo = todosPagos.filter(p => p.metodoPago === 'efectivo').reduce((sum, p) => sum + p.monto, 0);
      const transferencia = todosPagos.filter(p => p.metodoPago === 'transferencia').reduce((sum, p) => sum + p.monto, 0);
      const gastosEfvo = todosGastos.filter(g => g.metodoPago === 'efectivo').reduce((sum, g) => sum + g.monto, 0);
      const gastosTransf = todosGastos.filter(g => g.metodoPago === 'transferencia').reduce((sum, g) => sum + g.monto, 0);
      setStats({
        totalEfectivo: efectivo,
        totalTransferencia: transferencia,
        totalGeneral: efectivo + transferencia,
        gastosEfectivo: gastosEfvo,
        gastosTransferencia: gastosTransf,
        totalGastos: gastosEfvo + gastosTransf,
        totalNeto: (efectivo - gastosEfvo) + (transferencia - gastosTransf),
        pagosHoy: 0,
        pagosMes: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModalGasto = () => {
    setFormDataGasto({
      descripcion: '',
      monto: '',
      metodoPago: 'efectivo',
      fecha: new Date().toISOString().split('T')[0],
    });
    setShowModalGasto(true);
  };

  const handleCerrarModalGasto = () => {
    setShowModalGasto(false);
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

  const ultimosPagos = pagos
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  const ultimosGastos = gastos
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  const [alumnos, setAlumnos] = useState<any[]>([]);
  
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

  const getAlumnoNombre = (pago: Pago): string => {
    if (pago.alumnoId == null) return pago.descripcion || 'Aporte a caja';
    const alumno = alumnos.find(a => a.id === pago.alumnoId);
    return alumno ? `${alumno.nombre} ${alumno.apellido}` : 'Desconocido';
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
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Caja</h1>
        <div className="flex gap-3">
          <button
            onClick={handleOpenModalGasto}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Registrar Gasto
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

      {/* Saldo de Caja - Destacado */}
      <div className="card bg-gradient-to-r from-primary-600 to-primary-700 text-white mb-8 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Saldo de Caja</h2>
            <div className="space-y-1 text-primary-100">
              <p className="text-sm">
                <span className="font-semibold">Ingresos:</span> {formatCurrency(stats.totalGeneral)}
              </p>
              <p className="text-sm">
                <span className="font-semibold">Gastos:</span> {formatCurrency(stats.totalGastos)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-primary-200 mb-2 uppercase tracking-wide">Saldo Final</p>
            <p className={`text-5xl font-bold ${
              stats.totalNeto >= 0 ? 'text-green-300' : 'text-red-300'
            }`}>
              {formatCurrency(stats.totalNeto)}
            </p>
            <p className={`text-xs mt-2 ${
              stats.totalNeto >= 0 ? 'text-green-200' : 'text-red-200'
            }`}>
              {stats.totalNeto >= 0 ? '✓ Positivo' : '⚠ Negativo'}
            </p>
          </div>
        </div>
      </div>

      {/* Cards de Resumen - Ingresos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="card bg-green-50 border-2 border-green-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-green-700 uppercase tracking-wide">
              Efectivo (Ingresos)
            </h3>
            <div className="bg-green-200 p-2 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-700" />
            </div>
          </div>
          <p className="text-3xl font-bold text-green-900 mb-1">
            {formatCurrency(stats.totalEfectivo)}
          </p>
          {stats.gastosEfectivo > 0 && (
            <p className="text-xs text-red-600 mb-1">
              - {formatCurrency(stats.gastosEfectivo)} gastos
            </p>
          )}
          <p className="text-sm font-semibold text-green-800">
            Neto: {formatCurrency(stats.totalEfectivo - stats.gastosEfectivo)}
          </p>
        </div>

        <div className="card bg-blue-50 border-2 border-blue-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-blue-700 uppercase tracking-wide">
              Transferencia (Ingresos)
            </h3>
            <div className="bg-blue-200 p-2 rounded-lg">
              <CreditCard className="w-5 h-5 text-blue-700" />
            </div>
          </div>
          <p className="text-3xl font-bold text-blue-900 mb-1">
            {formatCurrency(stats.totalTransferencia)}
          </p>
          {stats.gastosTransferencia > 0 && (
            <p className="text-xs text-red-600 mb-1">
              - {formatCurrency(stats.gastosTransferencia)} gastos
            </p>
          )}
          <p className="text-sm font-semibold text-blue-800">
            Neto: {formatCurrency(stats.totalTransferencia - stats.gastosTransferencia)}
          </p>
        </div>

        <div className="card bg-red-50 border-2 border-red-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-red-700 uppercase tracking-wide">
              Total Gastos
            </h3>
            <div className="bg-red-200 p-2 rounded-lg">
              <DollarSign className="w-5 h-5 text-red-700" />
            </div>
          </div>
          <p className="text-3xl font-bold text-red-900 mb-2">
            {formatCurrency(stats.totalGastos)}
          </p>
          <p className="text-xs text-red-600">
            {gastos.length} gastos registrados
          </p>
        </div>

        <div className="card bg-primary-50 border-2 border-primary-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-primary-700 uppercase tracking-wide">
              Total Neto
            </h3>
            <div className="bg-primary-200 p-2 rounded-lg">
              <Wallet className="w-5 h-5 text-primary-700" />
            </div>
          </div>
          <p className="text-3xl font-bold text-primary-900 mb-2">
            {formatCurrency(stats.totalNeto)}
          </p>
          <p className="text-xs text-primary-600">
            Ingresos - Gastos
          </p>
        </div>
      </div>

      {/* Estadísticas adicionales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="card bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-purple-200 p-3 rounded-lg">
              <Calendar className="w-6 h-6 text-purple-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Este Mes</h3>
              <p className="text-sm text-gray-600">Total de pagos recibidos</p>
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
              <h3 className="text-lg font-bold text-gray-900">Promedio por Pago</h3>
              <p className="text-sm text-gray-600">Monto promedio</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-indigo-900">
            {pagos.length > 0 
              ? formatCurrency(stats.totalGeneral / pagos.length)
              : formatCurrency(0)}
          </p>
        </div>
      </div>

      {/* Últimos Gastos */}
      <div className="card mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Últimos Gastos</h2>
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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Descripción
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Método
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ultimosGastos.map((gasto) => (
                  <tr key={gasto.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(gasto.fecha)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {gasto.descripcion}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-red-600">
                      - {formatCurrency(gasto.monto)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        gasto.metodoPago === 'efectivo'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {gasto.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleEliminarGasto(gasto.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Eliminar gasto"
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

      {/* Últimos Pagos */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Últimos Pagos</h2>
        {ultimosPagos.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No hay pagos registrados aún</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Alumno
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Método
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ultimosPagos.map((pago) => (
                  <tr key={pago.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(pago.fecha)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {getAlumnoNombre(pago)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {formatCurrency(pago.monto)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        pago.metodoPago === 'efectivo'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {pago.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Gasto */}
      {showModalGasto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">Registrar Gasto</h2>
              <button
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
                  Fecha del Gasto *
                </label>
                <input
                  type="date"
                  required
                  value={formDataGasto.fecha}
                  onChange={(e) => setFormDataGasto({ ...formDataGasto, fecha: e.target.value })}
                  className="input-field"
                />
              </div>
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <p className="text-sm text-red-800">
                  ⚠️ <strong>Nota:</strong> El gasto se descontará del total de caja correspondiente (efectivo o transferencia).
                </p>
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
                  Registrar Gasto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Caja;
