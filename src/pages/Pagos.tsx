import { useState, useEffect } from 'react';
import { Plus, X, Save, Calendar, Trash2 } from 'lucide-react';
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
    descripcion: '', // para aporte a caja (sin alumno)
  });

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const fn = () => setIsMobile(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

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
      descripcion: '',
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

    const monto = parseFloat(formData.monto);
    if (isNaN(monto) || monto <= 0) {
      alert('El monto debe ser un número válido mayor a 0');
      return;
    }

    const esAporte = !formData.alumnoId;
    if (!esAporte) {
      const alumno = alumnos.find(a => a.id === formData.alumnoId);
      if (!alumno) {
        alert('Alumno no encontrado');
        return;
      }
    }

    try {
      const nuevoPago: Pago = {
        id: Date.now().toString(),
        alumnoId: formData.alumnoId || null,
        monto,
        metodoPago: formData.metodoPago,
        fecha: formData.fecha,
        createdAt: new Date().toISOString(),
        ...(esAporte && { descripcion: formData.descripcion.trim() || 'Aporte a caja' }),
      };

      await storageHybrid.pagos.add(nuevoPago);

      if (!esAporte && formData.alumnoId) {
        const nuevaFechaVencimiento = calcularFechaVencimiento(formData.fecha);
        await storageHybrid.alumnos.update(formData.alumnoId, {
          fechaVencimientoCuota: nuevaFechaVencimiento,
        });
      }

      await loadPagos();
      await loadAlumnos();
      handleCloseModal();
      alert(esAporte ? 'Ingreso registrado en caja.' : 'Pago registrado exitosamente');
    } catch (error) {
      console.error('Error saving pago:', error);
      alert('Error al registrar el pago. Revisá la consola para más detalles.');
    }
  };

  const getAlumnoNombre = (pago: Pago) => {
    if (pago.alumnoId == null) return pago.descripcion || 'Aporte a caja';
    const alumno = alumnos.find(a => a.id === pago.alumnoId);
    return alumno ? `${alumno.nombre} ${alumno.apellido}` : 'Desconocido';
  };

  const handleEliminarPago = async (pago: Pago) => {
    const nombre = getAlumnoNombre(pago);
    if (!confirm(`¿Eliminar el pago de ${formatCurrency(pago.monto)} (${nombre}, ${formatDate(pago.fecha)})? Esta acción no se puede deshacer.`)) return;
    try {
      await storageHybrid.pagos.delete(pago.id);
      await loadPagos();
      await loadAlumnos();
    } catch (error) {
      console.error('Error al eliminar pago:', error);
      alert('No se pudo eliminar el pago.');
    }
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
      ) : isMobile ? (
        /* Vista móvil: tarjetas como en Alumnos */
        <div className="space-y-3">
          {pagos.map((pago) => (
            <div key={pago.id} className="card p-4 border border-gray-200">
              <div className="flex justify-between items-start gap-2 mb-2">
                <div>
                  <p className="font-semibold text-gray-900 text-base">{getAlumnoNombre(pago)}</p>
                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
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
              <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  pago.metodoPago === 'efectivo' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {pago.metodoPago === 'efectivo' ? '💵 Efectivo' : '💳 Transferencia'}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden p-0 -mx-2 sm:mx-0">
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full min-w-[640px]">
              <thead className="bg-primary-50">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Fecha</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Alumno</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Monto</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Método</th>
                  <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider w-20">Eliminar</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pagos.map((pago) => (
                  <tr key={pago.id} className="hover:bg-gray-50">
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-900">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {formatDate(pago.fecha)}
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{getAlumnoNombre(pago)}</td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{formatCurrency(pago.monto)}</td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${pago.metodoPago === 'efectivo' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                        {pago.metodoPago === 'efectivo' ? '💵 Efectivo' : '💳 Transferencia'}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => handleEliminarPago(pago)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors touch-manipulation"
                        title="Eliminar pago"
                        aria-label="Eliminar pago"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
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
                  Alumno (opcional)
                </label>
                <select
                  value={formData.alumnoId}
                  onChange={(e) => setFormData({ ...formData, alumnoId: e.target.value })}
                  className="input-field"
                >
                  <option value="">Ninguno — Aporte a caja / ingreso del dueño</option>
                  {alumnos.map((alumno) => (
                    <option key={alumno.id} value={alumno.id}>
                      {alumno.nombre} {alumno.apellido} - DNI: {alumno.dni}
                    </option>
                  ))}
                </select>
                {!formData.alumnoId && (
                  <input
                    type="text"
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                    className="input-field mt-2"
                    placeholder="Ej. Aporte del dueño (opcional)"
                  />
                )}
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
              {formData.alumnoId && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800">
                    💡 <strong>Nota:</strong> Al registrar el pago, la fecha de vencimiento de la cuota del alumno se actualizará automáticamente un mes después de la fecha del pago. Podés editarla después si es necesario.
                  </p>
                </div>
              )}
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

