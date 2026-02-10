import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, Save } from 'lucide-react';
import { Profesor } from '../types';
import { storageHybrid } from '../utils/storage-hybrid';

const Profesores = () => {
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProfesor, setEditingProfesor] = useState<Profesor | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
  });

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
    } catch (error) {
      console.error('Error saving profesor:', error);
      alert('Error al guardar el profesor. Por favor intentá nuevamente.');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de que querés eliminar este profesor?')) {
      try {
        await storageHybrid.profesores.delete(id);
        await loadProfesores();
      } catch (error) {
        console.error('Error deleting profesor:', error);
        alert('Error al eliminar el profesor. Por favor intentá nuevamente.');
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
        <h1 className="text-3xl font-bold text-gray-900">Profesores</h1>
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
              <div className="flex gap-2 pt-4 border-t border-gray-200">
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

