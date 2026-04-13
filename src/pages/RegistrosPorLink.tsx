import { useState, useEffect } from 'react';
import { Link2, UserPlus, Trash2 } from 'lucide-react';
import { RegistroLink as RegistroLinkType, Actividad } from '../types';
import { storageApi } from '../utils/storage-api';
import { storageHybrid } from '../utils/storage-hybrid';
import { formatDate } from '../utils/date';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastProvider';

const getBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const useApi = () => {
  if (import.meta.env.VITE_USE_API === 'false') return false;
  if (import.meta.env.VITE_USE_API === 'true') return true;
  return import.meta.env.PROD;
};

const RegistrosPorLink = () => {
  const toast = useToast();
  const { sucursalId } = useAuth();
  const [list, setList] = useState<RegistroLinkType[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);

  const load = async () => {
    if (!useApi()) {
      setLoading(false);
      setList([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const base = getBase();
      const [regRes, actRes] = await Promise.all([
        fetch(`${base}/api/registro-link`),
        storageHybrid.actividades.getAll(),
      ]);
      if (!regRes.ok) throw new Error('No se pudo cargar la lista');
      const data = await regRes.json();
      setList(data);
      setActividades(actRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const getActividadNombre = (id: string) => actividades.find((a) => a.id === id)?.nombre ?? '-';

  const handleAgregar = async (registro: RegistroLinkType) => {
    if (!useApi()) return;
    setAddingId(registro.id);
    setError('');
    try {
      await storageApi.registroLink.agregarAlumno(registro.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo agregar');
    } finally {
      setAddingId(null);
    }
  };

  const handleEliminar = async (id: string) => {
    if (!useApi() || !confirm('¿Descartar este registro? No se recupera.')) return;
    setError('');
    try {
      await storageApi.registroLink.delete(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar');
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const linkRegistro = `${origin}/registro${sucursalId ? `?sucursalId=${encodeURIComponent(sucursalId)}` : ''}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div className="page-title-wrap">
          <span className="page-title-accent" aria-hidden />
          <h1 className="page-title">Registros por link</h1>
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Link para compartir (IG, WhatsApp)</h2>
        <p className="text-sm text-gray-600 mb-3">
          Quien abra este link puede cargar sus datos desde el celular. Después aparecen acá para que los agregues como alumnos.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <code className="flex-1 min-w-0 bg-gray-100 px-3 py-2 rounded-lg text-sm break-all">
            {linkRegistro}
          </code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(linkRegistro);
              toast.success('Link copiado');
            }}
            className="btn-secondary flex items-center gap-2 shrink-0"
          >
            <Link2 className="w-4 h-4" />
            Copiar link
          </button>
        </div>
      </div>

      {error && (
        <div className="card mb-4 bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {!useApi() ? (
        <div className="card text-center py-8 text-gray-600">
          Esta sección funciona solo cuando la app está conectada a la base de datos (producción).
        </div>
      ) : list.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">No hay registros por link todavía.</p>
          <p className="text-sm text-gray-400 mt-1">Compartí el link para que se inscriban.</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-primary-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">DNI</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Contacto</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actividad</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Fecha</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {list.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{r.nombre} {r.apellido}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.dni}</td>
                    <td className="px-4 py-3 text-sm">
                      <div>{r.telefono}</div>
                      <div className="text-gray-500">{r.email}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{getActividadNombre(r.actividadId)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(r.createdAt.split('T')[0])}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleAgregar(r)}
                          disabled={addingId === r.id}
                          className="btn-primary flex items-center gap-1.5 text-sm py-1.5 disabled:opacity-60"
                          title="Agregar como alumno"
                        >
                          <UserPlus className="w-4 h-4" />
                          {addingId === r.id ? '...' : 'Agregar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEliminar(r.id)}
                          className="p-2 text-gray-400 hover:text-red-600 rounded"
                          title="Descartar registro"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegistrosPorLink;
