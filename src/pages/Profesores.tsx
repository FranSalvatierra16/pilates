import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, Save, History } from 'lucide-react';
import { Profesor, Gasto } from '../types';
import { storageHybrid } from '../utils/storage-hybrid';
import { formatDate, formatHora24 } from '../utils/date';
import { formatCurrency } from '../utils/format';
import { useToast } from '../components/ToastProvider';

const Profesores = () => {
  const toast = useToast();
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProfesor, setEditingProfesor] = useState<Profesor | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
  });
  const [profesorHistorial, setProfesorHistorial] = useState<Profesor | null>(null);
  const [gastosSueldos, setGastosSueldos] = useState<Gasto[]>([]);

  useEffect(() => {
    loadProfesores();
  }, []);

  const loadProfesores = async () => {
    try {
      setLoading(true);
      const data = await storageHybrid.profesores.getAll();
      setProfesores(data);
    } catch (error) {
      console.error('Error loading profesores:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      nombre: '',
      apellido: '',
    });
    setEditingProfesor(null);
  };

  const handleOpenModal = (profesor?: Profesor) => {
    if (profesor) {
      setEditingProfesor(profesor);
      setFormData({
        nombre: profesor.nombre,
        apellido: profesor.apellido,
      });
    } else {
      resetForm();
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
      if (editingProfesor) {
        await storageHybrid.profesores.update(editingProfesor.id, {
          nombre: formData.nombre,
          apellido: formData.apellido,
        });
      } else {
        const nuevoProfesor: Profesor = {
          id: Date.now().toString(),
          nombre: formData.nombre,
          apellido: formData.apellido,
          createdAt: new Date().toISOString(),
        };
        await storageHybrid.profesores.add(nuevoProfesor);
      }

      await loadProfesores();
      handleCloseModal();
      toast.success(editingProfesor ? 'Profesor actualizado correctamente.' : 'Profesor guardado correctamente. Se sincroniza en todos los dispositivos.');
    } catch (error) {
      console.error('Error saving profesor:', error);
      const msg = error instanceof Error ? error.message : 'Error de conexión';
      toast.error(`Error al guardar el profesor: ${msg}. Revisá la conexión e intentá de nuevo.`);
    }
  };

  const abrirHistorialSueldos = async (p: Profesor) => {
    setProfesorHistorial(p);
    try {
      const todos = await storageHybrid.gastos.getAll();
      const filtrados = todos
        .filter((g) => g.profesorId === p.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setGastosSueldos(filtrados);
    } catch {
      setGastosSueldos([]);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de que querés eliminar este profesor?')) {
      try {
        await storageHybrid.profesores.delete(id);
        await loadProfesores();
      } catch (error) {
        console.error('Error deleting profesor:', error);
        toast.error('Error al eliminar el profesor. Por favor intentá nuevamente.');
      }
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
      <div className="flex justify-between items-center mb-8">
        <div className="page-title-wrap">
          <span className="page-title-accent" aria-hidden />
          <h1 className="page-title">Profesores</h1>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nuevo Profesor
        </button>
      </div>

      {profesores.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No hay profesores registrados aún</p>
          <button onClick={() => handleOpenModal()} className="btn-primary">
            Agregar primer profesor
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {profesores.map((profesor) => (
            <div key={profesor.id} className="card hover:shadow-xl transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900">
                    {profesor.nombre} {profesor.apellido}
                  </h3>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => abrirHistorialSueldos(profesor)}
                  className="flex-1 min-w-[8rem] btn-secondary flex items-center justify-center gap-2 border-violet-200 bg-violet-50 text-violet-900"
                >
                  <History className="w-4 h-4" />
                  Pagos
                </button>
                <button
                  onClick={() => handleOpenModal(profesor)}
                  className="flex-1 btn-secondary flex items-center justify-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(profesor.id)}
                  className="btn-danger flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {profesorHistorial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">
                Pagos a {profesorHistorial.nombre} {profesorHistorial.apellido}
              </h2>
              <button
                type="button"
                onClick={() => { setProfesorHistorial(null); setGastosSueldos([]); }}
                className="p-2 text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 min-h-0">
              {gastosSueldos.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">Todavía no hay pagos de sueldo registrados para este profesor (desde Caja → Pagos sueldos).</p>
              ) : (
                <ul className="space-y-2">
                  {gastosSueldos.map((g) => (
                    <li key={g.id} className="flex justify-between gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{formatDate(g.fecha)} {formatHora24(g.hora)}</p>
                        <p className="text-xs text-gray-500 truncate">{g.descripcion}</p>
                        {g.contabilizarEnFecha && (
                          <p className="text-xs text-violet-700 mt-0.5">Imputación: {formatDate(g.contabilizarEnFecha)}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-gray-900">{formatCurrency(g.monto)}</p>
                        <span className={`text-xs ${g.metodoPago === 'efectivo' ? 'text-green-700' : 'text-blue-700'}`}>
                          {g.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {gastosSueldos.length > 0 && (
                <p className="mt-4 pt-3 border-t border-gray-200 text-sm font-semibold text-gray-800 text-right">
                  Total: {formatCurrency(gastosSueldos.reduce((s, g) => s + g.monto, 0))}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingProfesor ? 'Editar Profesor' : 'Nuevo Profesor'}
              </h2>
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
                  Nombre *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="input-field"
                  placeholder="Nombre del profesor"
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
                  placeholder="Apellido del profesor"
                />
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
                  {editingProfesor ? 'Guardar Cambios' : 'Crear Profesor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profesores;

