import { useState, useEffect } from 'react';
import { Plus, X, Save, Calendar } from 'lucide-react';
import { Alumno, Pago, MetodoPago } from '../types';
import { storage } from '../utils/storage';
import { storageHybrid } from '../utils/storage-hybrid';
import { formatDate, calcularFechaVencimiento } from '../utils/date';
import { formatCurrency } from '../utils/format';

const Pagos = () => {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    alumnoId: '',
    monto: '',
    metodoPago: 'efectivo' as MetodoPago,
    fecha: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadPagos();
    loadAlumnos();
  }, []);

  const loadPagos = async () => {
    try {
      setLoading(true);
      const todosPagos = await storageHybrid.pagos.getAll();
      setPagos(todosPagos.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } catch (error) {
      console.error('Error loading pagos:', error);
      // Fallback a localStorage
      const todosPagos = storage.pagos.getAll();
      setPagos(todosPagos.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } finally {
      setLoading(false);
    }
  };

  const loadAlumnos = async () => {
    try {
      const data = await storageHybrid.alumnos.getAll();
      setAlumnos(data);
    } catch (error) {
      console.error('Error loading alumnos:', error);
      // Fallback a localStorage
      setAlumnos(storage.alumnos.getAll());
    }
  };

  const resetForm = () => {
    setFormData({
      alumnoId: '',
      monto: '',
      metodoPago: 'efectivo',
      fecha: new Date().toISOString().split('T')[0],
    });
  };

  const handleOpenModal = () => {
    resetForm();
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.alumnoId) {
      alert('Por favor seleccioná un alumno');
      return;
    }

    const monto = parseFloat(formData.monto);
    if (isNaN(monto) || monto <= 0) {
      alert('El monto debe ser un número válido mayor a 0');
      return;
    }

    const alumno = alumnos.find(a => a.id === formData.alumnoId);
    if (!alumno) {
      alert('Alumno no encontrado');
      return;
    }

    try {
      // Calcular nueva fecha de vencimiento (1 mes desde la fecha del pago)
      const nuevaFechaVencimiento = calcularFechaVencimiento(formData.fecha);

      // Crear el pago
      const nuevoPago: Pago = {
        id: Date.now().toString(),
        alumnoId: formData.alumnoId,
        monto: monto,
        metodoPago: formData.metodoPago,
        fecha: formData.fecha,
        createdAt: new Date().toISOString(),
      };

      // Guardar el pago y actualizar la fecha de vencimiento del alumno
      await Promise.all([
        storageHybrid.pagos.add(nuevoPago),
        storageHybrid.alumnos.update(formData.alumnoId, {
          fechaVencimientoCuota: nuevaFechaVencimiento,
        })
      ]);

      await loadPagos();
      await loadAlumnos();
      handleCloseModal();
      alert('Pago registrado exitosamente');
    } catch (error) {
      console.error('Error saving pago:', error);
      alert('Error al registrar el pago. Revisá la consola para más detalles.');
    }
  };

  const getAlumnoNombre = (alumnoId: string) => {
    const alumno = alumnos.find(a => a.id === alumnoId);
    return alumno ? `${alumno.nombre} ${alumno.apellido}` : 'Desconocido';
  };

  const totalEfectivo = pagos
    .filter(p => p.metodoPago === 'efectivo')
    .reduce((sum, p) => sum + p.monto, 0);

  const totalTransferencia = pagos
    .filter(p => p.metodoPago === 'transferencia')
    .reduce((sum, p) => sum + p.monto, 0);

  const totalGeneral = totalEfectivo + totalTransferencia;

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Pagos</h1>
        <button
          onClick={handleOpenModal}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Registrar Pago
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card bg-green-50 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600 mb-1">Efectivo</p>
              <p className="text-2xl font-bold text-green-900">
                {formatCurrency(totalEfectivo)}
              </p>
            </div>
            <div className="bg-green-200 p-3 rounded-lg">
              <span className="text-2xl">💰</span>
            </div>
          </div>
        </div>
        <div className="card bg-blue-50 border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600 mb-1">Transferencia</p>
              <p className="text-2xl font-bold text-blue-900">
                {formatCurrency(totalTransferencia)}
              </p>
            </div>
            <div className="bg-blue-200 p-3 rounded-lg">
              <span className="text-2xl">💳</span>
            </div>
          </div>
        </div>
        <div className="card bg-primary-50 border border-primary-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-primary-600 mb-1">Total</p>
              <p className="text-2xl font-bold text-primary-900">
                {formatCurrency(totalGeneral)}
              </p>
            </div>
            <div className="bg-primary-200 p-3 rounded-lg">
              <span className="text-2xl">💵</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Pagos */}
      {loading ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">Cargando pagos...</p>
        </div>
      ) : pagos.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No hay pagos registrados aún</p>
          <button onClick={handleOpenModal} className="btn-primary">
            Registrar primer pago
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-primary-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Alumno
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Método de Pago
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pagos.map((pago) => (
                  <tr key={pago.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-900">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {formatDate(pago.fecha)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {getAlumnoNombre(pago.alumnoId)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {formatCurrency(pago.monto)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        pago.metodoPago === 'efectivo'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {pago.metodoPago === 'efectivo' ? '💵 Efectivo' : '💳 Transferencia'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">Registrar Pago</h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Alumno *
                </label>
                <select
                  required
                  value={formData.alumnoId}
                  onChange={(e) => setFormData({ ...formData, alumnoId: e.target.value })}
                  className="input-field"
                >
                  <option value="">Seleccionar alumno</option>
                  {alumnos.map((alumno) => (
                    <option key={alumno.id} value={alumno.id}>
                      {alumno.nombre} {alumno.apellido} - DNI: {alumno.dni}
                    </option>
                  ))}
                </select>
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
                  value={formData.monto}
                  onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
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
                  value={formData.metodoPago}
                  onChange={(e) => setFormData({ ...formData, metodoPago: e.target.value as MetodoPago })}
                  className="input-field"
                >
                  <option value="efectivo">💵 Efectivo</option>
                  <option value="transferencia">💳 Transferencia</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha del Pago *
                </label>
                <input
                  type="date"
                  required
                  value={formData.fecha}
                  onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                  className="input-field"
                />
              </div>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  💡 <strong>Nota:</strong> Al registrar el pago, la fecha de vencimiento de la cuota del alumno se actualizará automáticamente un mes después de la fecha del pago (ej: si pagás el 07/01, la cuota vence el 07/02). Podés editarla después si es necesario.
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  Registrar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pagos;

