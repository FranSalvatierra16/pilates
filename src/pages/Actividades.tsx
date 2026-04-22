import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, Save } from 'lucide-react';
import { Actividad } from '../types';
import { storageHybrid } from '../utils/storage-hybrid';
import { formatCurrency } from '../utils/format';
import { useToast } from '../components/ToastProvider';

const Actividades = () => {
  const toast = useToast();
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingActividad, setEditingActividad] = useState<Actividad | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    precio: '',
    clasesPorSemana: '',
  });
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    loadActividades();
  }, []);

  const loadActividades = async () => {
    try {
      setLoading(true);
      const data = await storageHybrid.actividades.getAll();
      setActividades(data);
    } catch (error) {
      console.error('Error loading actividades:', error);
      toast.error('Error al cargar las actividades');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      nombre: '',
      precio: '',
      clasesPorSemana: '',
    });
    setEditingActividad(null);
  };

  const handleOpenModal = (actividad?: Actividad) => {
    setSaveError('');
    if (actividad) {
      setEditingActividad(actividad);
      setFormData({
        nombre: actividad.nombre,
        precio: actividad.precio.toString(),
        clasesPorSemana: actividad.clasesPorSemana != null ? String(actividad.clasesPorSemana) : '',
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
    setSaveError('');
    const precio = parseFloat(formData.precio);
    if (isNaN(precio) || precio <= 0) {
      setSaveError('El precio debe ser un número válido mayor a 0');
      return;
    }
    const clasesPorSemana = formData.clasesPorSemana.trim() === ''
      ? null
      : Math.max(1, parseInt(formData.clasesPorSemana, 10) || 1);

    try {
      if (editingActividad) {
        await storageHybrid.actividades.update(editingActividad.id, {
          nombre: formData.nombre,
          precio: precio,
          clasesPorSemana,
        });
      } else {
        const nuevaActividad: Actividad = {
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          nombre: formData.nombre,
          precio: precio,
          clasesPorSemana,
          createdAt: new Date().toISOString(),
        };
        await storageHybrid.actividades.add(nuevaActividad);
      }
      await loadActividades();
      handleCloseModal();
    } catch (error) {
      console.error('Error saving actividad:', error);
      const msg = error instanceof Error ? error.message : 'Error al guardar la actividad';
      setSaveError(msg);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      // Verificar si hay alumnos usando esta actividad
      const alumnos = await storageHybrid.alumnos.getAll();
      const alumnosConActividad = alumnos.filter(a => a.actividadId === id);
      
      if (alumnosConActividad.length > 0) {
        toast.warning(`No se puede eliminar esta actividad porque ${alumnosConActividad.length} alumno(s) la está(n) usando. Primero actualizá la actividad de esos alumnos.`);
        return;
      }

      const ok = await toast.confirm('¿Estás seguro de que querés eliminar esta actividad?', {
        title: 'Eliminar actividad',
        confirmText: 'Eliminar',
      });
      if (!ok) return;
      await storageHybrid.actividades.delete(id);
      await loadActividades();
    } catch (error) {
      console.error('Error deleting actividad:', error);
      toast.error('Error al eliminar la actividad. Revisá la consola para más detalles.');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div className="page-title-wrap">
          <span className="page-title-accent" aria-hidden />
          <h1 className="page-title">Actividades</h1>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nueva Actividad
        </button>
      </div>

      {loading ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">Cargando actividades...</p>
        </div>
      ) : actividades.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No hay actividades registradas aún</p>
          <button onClick={() => handleOpenModal()} className="btn-primary">
            Agregar primera actividad
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {actividades.map((actividad) => (
            <div key={actividad.id} className="card hover:shadow-xl transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {actividad.nombre}
                  </h3>
                  <p className="text-2xl font-bold text-primary-600">
                    {formatCurrency(actividad.precio)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {actividad.clasesPorSemana != null
                      ? `${actividad.clasesPorSemana} ${actividad.clasesPorSemana === 1 ? 'vez' : 'veces'} por semana`
                      : 'Sin límite semanal definido'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleOpenModal(actividad)}
                  className="flex-1 btn-secondary flex items-center justify-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(actividad.id)}
                  className="btn-danger flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingActividad ? 'Editar Actividad' : 'Nueva Actividad'}
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
                  Nombre de la Actividad *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="input-field"
                  placeholder="Ej: Pilates Mat, Pilates con Máquinas, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Precio Mensual *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formData.precio}
                  onChange={(e) => setFormData({ ...formData, precio: e.target.value })}
                  className="input-field"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Veces por semana
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={formData.clasesPorSemana}
                  onChange={(e) => setFormData({ ...formData, clasesPorSemana: e.target.value })}
                  className="input-field"
                  placeholder="Opcional"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Opcional. Si indicás un número, se usa para limitar las clases de esa semana y las recuperaciones.
                </p>
              </div>
              {saveError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {saveError}
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
                  {editingActividad ? 'Guardar Cambios' : 'Crear Actividad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Actividades;

