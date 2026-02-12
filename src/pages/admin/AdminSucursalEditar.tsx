import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { storageApi } from '../../utils/storage-api';
import { Sucursal } from '../../types';
import { ArrowLeft } from 'lucide-react';

export default function AdminSucursalEditar() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sucursal, setSucursal] = useState<Sucursal | null>(null);
  const [nombreLugar, setNombreLugar] = useState('');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    storageApi.admin
      .getSucursales()
      .then((list) => {
        const s = list.find((x) => x.id === id);
        if (s) {
          setSucursal(s);
          setNombreLugar(s.nombreLugar);
          setUsuario(s.usuario);
          setFotoPreview(s.fotoPerfil || null);
        } else {
          setLoadError('Sucursal no encontrada');
        }
      })
      .catch(() => setLoadError('Error al cargar la sucursal'));
  }, [id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setFotoPreview(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Elegí una imagen (JPG, PNG, etc.)');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = () => setFotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setError('');
    const updates: { nombreLugar?: string; usuario?: string; password?: string; fotoPerfil?: string | null } = {};
    if (nombreLugar.trim() !== sucursal?.nombreLugar) updates.nombreLugar = nombreLugar.trim();
    if (usuario.trim() !== sucursal?.usuario) updates.usuario = usuario.trim();
    if (password) updates.password = password;
    if (fotoPreview !== (sucursal?.fotoPerfil ?? null)) updates.fotoPerfil = fotoPreview;
    if (Object.keys(updates).length === 0) {
      navigate('/admin');
      return;
    }
    setLoading(true);
    try {
      await storageApi.admin.updateSucursal(id, updates);
      navigate('/admin');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  if (loadError) {
    return (
      <div className="card text-red-700">
        {loadError}
        <button type="button" onClick={() => navigate('/admin')} className="btn-secondary mt-4">
          Volver
        </button>
      </div>
    );
  }

  if (!sucursal) {
    return (
      <div className="card text-center py-8 text-gray-500">
        Cargando...
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <button
        type="button"
        onClick={() => navigate('/admin')}
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a sucursales
      </button>
      <div className="card">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Editar sucursal</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del lugar</label>
            <input
              type="text"
              value={nombreLugar}
              onChange={(e) => setNombreLugar(e.target.value)}
              className="input-field"
              placeholder="Ej: Savia Centro"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario (para iniciar sesión)</label>
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="input-field"
              placeholder="Ej: Savia"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña (dejá vacío para no cambiar)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="Dejar en blanco = sin cambios"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Foto de perfil</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="input-field"
            />
            {fotoPreview && (
              <div className="mt-2 w-24 h-24 rounded-lg overflow-hidden border border-gray-200">
                <img src={fotoPreview} alt="Vista previa" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
