import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, X, Save, Wallet } from 'lucide-react';
import { Gasto, Profesor } from '../types';
import { storageHybrid } from '../utils/storage-hybrid';
import { formatCurrency } from '../utils/format';
import { formatDate } from '../utils/date';

const Profesores = () => {
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
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
      const [data, todosGastos] = await Promise.all([
        storageHybrid.profesores.getAll(),
        storageHybrid.gastos.getAll().catch(() => [] as Gasto[]),
      ]);
      setProfesores(data);
      setGastos(todosGastos);
    } catch (error) {
      console.error('Error loading profesores:', error);
    } finally {
      setLoading(false);
    }
  };

  const sueldosPorProfesor = useMemo(() => {
    const map = new Map<string, Gasto[]>();
    for (const g of gastos) {
      if (!g.profesorId) continue;
      const list = map.get(g.profesorId) ?? [];
      list.push(g);
      map.set(g.profesorId, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    }
    return map;
  }, [gastos]);

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
      alert(editingProfesor ? 'Profesor actualizado correctamente.' : 'Profesor guardado correctamente. Se sincroniza en todos los dispositivos.');
    } catch (error) {
      console.error('Error saving profesor:', error);
      const msg = error instanceof Error ? error.message : 'Error de conexión';
      alert(`Error al guardar el profesor: ${msg}. Revisá la conexión e intentá de nuevo.`);
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
          {profesores.map((profesor) => {
            const historialSueldos = sueldosPorProfesor.get(profesor.id) ?? [];
            return (
            <div key={profesor.id} className="card hover:shadow-xl transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900">
                    {profesor.nombre} {profesor.apellido}
                  </h3>
                </div>
              </div>
              {historialSueldos.length > 0 && (
                <div className="mb-4 rounded-lg bg-violet-50/80 border border-violet-100 px-3 py-2.5">
                  <p className="text-xs font-semibold text-violet-900 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                    <Wallet className="w-3.5 h-3.5" />
                    Historial de pagos (sueldos)
                  </p>
                  <ul className="space-y-1.5 text-sm text-gray-800 max-h-40 overflow-y-auto">
                    {historialSueldos.map((g) => (
                      <li key={g.id} className="flex justify-between gap-2 border-b border-violet-100/80 last:border-0 pb-1.5 last:pb-0">
                        <span className="text-gray-600 whitespace-nowrap">{formatDate(g.fecha)}</span>
                        <span className="font-medium text-right min-w-0">
                          {formatCurrency(g.monto)}
                          <span className="text-gray-500 font-normal ml-1">
                            · {g.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
            );
          })}
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

