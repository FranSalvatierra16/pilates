import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, Save, CreditCard } from 'lucide-react';
import { Alumno, Pago, MetodoPago, Actividad } from '../types';
import { storage } from '../utils/storage';
import { storageHybrid } from '../utils/storage-hybrid';
import { formatDate, isCuotaVencida, isCuotaVenceHoy, calcularFechaVencimiento } from '../utils/date';
import { formatCurrency } from '../utils/format';

const Alumnos = () => {
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showModalPago, setShowModalPago] = useState(false);
  const [editingAlumno, setEditingAlumno] = useState<Alumno | null>(null);
  const [alumnoParaPagar, setAlumnoParaPagar] = useState<Alumno | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    telefono: '',
    email: '',
    fechaVencimientoCuota: '',
    actividadId: '',
  });
  const [formDataPago, setFormDataPago] = useState({
    monto: '',
    metodoPago: 'efectivo' as MetodoPago,
    fecha: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [alumnosData, actividadesData] = await Promise.all([
        storageHybrid.alumnos.getAll(),
        storageHybrid.actividades.getAll(),
      ]);
      setAlumnos(alumnosData);
      setActividades(actividadesData);
    } catch (error) {
      console.error('Error loading data:', error);
      // Fallback a localStorage
      setAlumnos(storage.alumnos.getAll());
      setActividades(storage.actividades.getAll());
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
      setAlumnos(storage.alumnos.getAll());
    }
  };


  const resetForm = () => {
    setFormData({
      nombre: '',
      apellido: '',
      dni: '',
      telefono: '',
      email: '',
      fechaVencimientoCuota: '',
      actividadId: '',
    });
    setEditingAlumno(null);
  };

  const handleOpenModal = (alumno?: Alumno) => {
    if (alumno) {
      setEditingAlumno(alumno);
      setFormData({
        nombre: alumno.nombre,
        apellido: alumno.apellido,
        dni: alumno.dni,
        telefono: alumno.telefono,
        email: alumno.email,
        fechaVencimientoCuota: alumno.fechaVencimientoCuota,
        actividadId: alumno.actividadId,
      });
    } else {
      // Para nuevo alumno, dejar sin fecha de vencimiento (pendiente de pago)
      setFormData({
        nombre: '',
        apellido: '',
        dni: '',
        telefono: '',
        email: '',
        fechaVencimientoCuota: '', // Sin fecha hasta que se pague
        actividadId: '',
      });
      setEditingAlumno(null);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingAlumno) {
        // Si es edición, usar la fecha que se ingresó o calcularla
        const fechaVencimiento = formData.fechaVencimientoCuota || calcularFechaVencimiento(new Date().toISOString().split('T')[0]);
        await storageHybrid.alumnos.update(editingAlumno.id, {
          ...formData,
          fechaVencimientoCuota: fechaVencimiento,
        });
      } else {
        // Crear nuevo alumno sin fecha de vencimiento (pendiente de pago)
        const nuevoAlumno: Alumno = {
          id: Date.now().toString(),
          ...formData,
          fechaVencimientoCuota: '', // Sin fecha hasta que se pague
          createdAt: new Date().toISOString(),
        };
        await storageHybrid.alumnos.add(nuevoAlumno);
      }
      
      await loadAlumnos();
      handleCloseModal();
    } catch (error) {
      console.error('Error saving alumno:', error);
      alert('Error al guardar el alumno. Por favor intentá nuevamente.');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de que querés eliminar este alumno?')) {
      try {
        await storageHybrid.alumnos.delete(id);
        await loadAlumnos();
      } catch (error) {
        console.error('Error deleting alumno:', error);
        alert('Error al eliminar el alumno. Por favor intentá nuevamente.');
      }
    }
  };

  const handlePagarCuota = (alumno: Alumno) => {
    setAlumnoParaPagar(alumno);
    const actividad = actividades.find(a => a.id === alumno.actividadId);
    setFormDataPago({
      monto: actividad ? actividad.precio.toString() : '',
      metodoPago: 'efectivo',
      fecha: new Date().toISOString().split('T')[0],
    });
    setShowModalPago(true);
  };

  const handleCerrarModalPago = () => {
    setShowModalPago(false);
    setAlumnoParaPagar(null);
    setFormDataPago({
      monto: '',
      metodoPago: 'efectivo',
      fecha: new Date().toISOString().split('T')[0],
    });
  };

  const handleSubmitPago = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!alumnoParaPagar) return;

    const monto = parseFloat(formDataPago.monto);
    if (isNaN(monto) || monto <= 0) {
      alert('El monto debe ser un número válido mayor a 0');
      return;
    }

    try {
      // Calcular nueva fecha de vencimiento (1 mes desde la fecha del pago)
      const nuevaFechaVencimiento = calcularFechaVencimiento(formDataPago.fecha);

      // Crear el pago
      const nuevoPago: Pago = {
        id: Date.now().toString(),
        alumnoId: alumnoParaPagar.id,
        monto: monto,
        metodoPago: formDataPago.metodoPago,
        fecha: formDataPago.fecha,
        createdAt: new Date().toISOString(),
      };

      // Guardar el pago
      await storageHybrid.pagos.add(nuevoPago);

      // Actualizar la fecha de vencimiento del alumno
      await storageHybrid.alumnos.update(alumnoParaPagar.id, {
        fechaVencimientoCuota: nuevaFechaVencimiento,
      });

      await loadAlumnos();
      handleCerrarModalPago();
      alert('Pago registrado exitosamente. La fecha de vencimiento se actualizó automáticamente.');
    } catch (error) {
      console.error('Error saving pago:', error);
      alert('Error al registrar el pago. Por favor intentá nuevamente.');
    }
  };

  const getActividadNombre = (actividadId: string) => {
    const actividad = actividades.find(a => a.id === actividadId);
    return actividad ? actividad.nombre : 'Sin actividad';
  };

  const getActividadPrecio = (actividadId: string) => {
    const actividad = actividades.find(a => a.id === actividadId);
    return actividad ? actividad.precio : 0;
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
        <h1 className="text-3xl font-bold text-gray-900">Alumnos</h1>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nuevo Alumno
        </button>
      </div>

      {alumnos.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No hay alumnos registrados aún</p>
          <button onClick={() => handleOpenModal()} className="btn-primary">
            Agregar primer alumno
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-primary-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Alumno
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    DNI
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Contacto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Actividad
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Vencimiento
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Fecha Registro
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {alumnos.map((alumno) => {
                  const tieneFechaVencimiento = alumno.fechaVencimientoCuota && alumno.fechaVencimientoCuota !== '';
                  const vencida = tieneFechaVencimiento ? isCuotaVencida(alumno.fechaVencimientoCuota) : false;
                  const venceHoy = tieneFechaVencimiento ? isCuotaVenceHoy(alumno.fechaVencimientoCuota) : false;
                  const estado = !tieneFechaVencimiento ? 'pendiente' : vencida ? 'vencida' : venceHoy ? 'venceHoy' : 'alDia';
                  return (
                    <tr key={alumno.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {alumno.nombre} {alumno.apellido}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {alumno.dni}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{alumno.telefono}</div>
                        <div className="text-sm text-gray-500">{alumno.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {getActividadNombre(alumno.actividadId)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {formatCurrency(getActividadPrecio(alumno.actividadId))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {estado === 'pendiente' ? (
                          <>
                            <div className="text-sm font-medium text-orange-600">
                              Pendiente de pago
                            </div>
                            <div className="text-xs text-orange-500">
                              ⚠️ Sin fecha de vencimiento
                            </div>
                          </>
                        ) : (
                          <>
                            <div className={`text-sm font-medium ${
                              estado === 'vencida' 
                                ? 'text-red-600' 
                                : estado === 'venceHoy'
                                ? 'text-yellow-600'
                                : 'text-green-600'
                            }`}>
                              {formatDate(alumno.fechaVencimientoCuota)}
                            </div>
                            <div className={`text-xs ${
                              estado === 'vencida' 
                                ? 'text-red-500' 
                                : estado === 'venceHoy'
                                ? 'text-yellow-500'
                                : 'text-green-500'
                            }`}>
                              {estado === 'vencida' 
                                ? 'Vencida' 
                                : estado === 'venceHoy'
                                ? '⚠️ Vence hoy'
                                : 'Al día'}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDate(alumno.createdAt.split('T')[0])}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(alumno.createdAt).toLocaleTimeString('es-AR', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handlePagarCuota(alumno)}
                            className="text-green-600 hover:text-green-900"
                            title="Pagar cuota"
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenModal(alumno)}
                            className="text-primary-600 hover:text-primary-900"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(alumno.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingAlumno ? 'Editar Alumno' : 'Nuevo Alumno'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Apellido *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.apellido}
                    onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    DNI *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.dni}
                    onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Teléfono *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Actividad *
                  </label>
                  <select
                    required
                    value={formData.actividadId}
                    onChange={(e) => setFormData({ ...formData, actividadId: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Seleccionar actividad</option>
                    {actividades.map((act) => (
                      <option key={act.id} value={act.id}>
                        {act.nombre} - {formatCurrency(act.precio)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha Vencimiento Cuota {editingAlumno ? '*' : '(Se establecerá al pagar)'}
                  </label>
                  <input
                    type="date"
                    required={!!editingAlumno}
                    value={formData.fechaVencimientoCuota}
                    onChange={(e) => setFormData({ ...formData, fechaVencimientoCuota: e.target.value })}
                    className="input-field"
                    disabled={!editingAlumno && !formData.fechaVencimientoCuota}
                    placeholder={editingAlumno ? '' : 'Se establecerá al registrar el primer pago'}
                  />
                  {!editingAlumno && (
                    <p className="text-xs text-gray-500 mt-1">
                      💡 La fecha de vencimiento se establecerá automáticamente cuando registres el primer pago desde el botón de pago.
                    </p>
                  )}
                </div>
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
                  {editingAlumno ? 'Guardar Cambios' : 'Crear Alumno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModalPago && alumnoParaPagar && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">
                Registrar Pago - {alumnoParaPagar.nombre} {alumnoParaPagar.apellido}
              </h2>
              <button
                onClick={handleCerrarModalPago}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmitPago} className="p-6 space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>Alumno:</strong> {alumnoParaPagar.nombre} {alumnoParaPagar.apellido}
                </p>
                <p className="text-sm text-blue-800 mt-1">
                  <strong>DNI:</strong> {alumnoParaPagar.dni}
                </p>
                <p className="text-sm text-blue-800 mt-1">
                  <strong>Cuota actual vence:</strong> {formatDate(alumnoParaPagar.fechaVencimientoCuota)}
                </p>
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
                  value={formDataPago.monto}
                  onChange={(e) => setFormDataPago({ ...formDataPago, monto: e.target.value })}
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
                  value={formDataPago.metodoPago}
                  onChange={(e) => setFormDataPago({ ...formDataPago, metodoPago: e.target.value as MetodoPago })}
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
                  value={formDataPago.fecha}
                  onChange={(e) => setFormDataPago({ ...formDataPago, fecha: e.target.value })}
                  className="input-field"
                />
              </div>
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <p className="text-sm text-green-800">
                  💡 <strong>Nota:</strong> Al registrar el pago, la fecha de vencimiento se actualizará automáticamente un mes después de la fecha del pago (ej: si pagás el 07/01, la cuota vence el 07/02).
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCerrarModalPago}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
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

export default Alumnos;

