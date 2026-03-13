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
  const [pagoMensual, setPagoMensual] = useState<string>('');
  const [fechaVencimientoCuenta, setFechaVencimientoCuenta] = useState<string>('');
  const [activa, setActiva] = useState(true);
  const [horaInicioManana, setHoraInicioManana] = useState('07:00');
  const [horaFinManana, setHoraFinManana] = useState('12:00');
  const [horaInicioTarde, setHoraInicioTarde] = useState('16:00');
  const [horaFinTarde, setHoraFinTarde] = useState('21:00');
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
          setPagoMensual(s.pagoMensual != null ? String(s.pagoMensual) : '');
          setFechaVencimientoCuenta(s.fechaVencimientoCuenta || '');
          setActiva(s.activa !== false);
          setHoraInicioManana(s.horaInicioManana || '07:00');
          setHoraFinManana(s.horaFinManana || '12:00');
          setHoraInicioTarde(s.horaInicioTarde || '16:00');
          setHoraFinTarde(s.horaFinTarde || '21:00');
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
    const updates: {
      nombreLugar?: string;
      usuario?: string;
      password?: string;
      fotoPerfil?: string | null;
      pagoMensual?: number | null;
      fechaVencimientoCuenta?: string | null;
      activa?: boolean;
      horaInicioManana?: string;
      horaFinManana?: string;
      horaInicioTarde?: string;
      horaFinTarde?: string;
    } = {
      nombreLugar: nombreLugar.trim(),
      usuario: usuario.trim(),
      activa,
    };
    if (password.trim()) updates.password = password.trim();
    if (fotoPreview !== undefined) updates.fotoPerfil = fotoPreview;
    updates.pagoMensual = pagoMensual.trim() === '' ? null : Number(pagoMensual);
    updates.fechaVencimientoCuenta = fechaVencimientoCuenta.trim() || null;
    updates.horaInicioManana = horaInicioManana;
    updates.horaFinManana = horaFinManana;
    updates.horaInicioTarde = horaInicioTarde;
    updates.horaFinTarde = horaFinTarde;
    setLoading(true);
    try {
      await storageApi.admin.updateSucursal(id, updates);
      navigate('/admin');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      setError(msg);
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Pago mensual ($)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={pagoMensual}
              onChange={(e) => setPagoMensual(e.target.value)}
              className="input-field"
              placeholder="Ej: 5000 (dejá vacío si no aplica)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha vencimiento cuenta</label>
            <input
              type="date"
              value={fechaVencimientoCuenta}
              onChange={(e) => setFechaVencimientoCuenta(e.target.value)}
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-0.5">Fecha en que se vence el acceso al sistema (opcional)</p>
          </div>
          <div className="border-t border-gray-200 pt-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Horarios de clase</h3>
            <p className="text-xs text-gray-500 mb-3">Rango de horarios en que esta sucursal da clases (ej. Savia 7–12, Nes 9–13)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mañana desde</label>
                <select value={horaInicioManana} onChange={(e) => setHoraInicioManana(e.target.value)} className="input-field text-sm">
                  {Array.from({ length: 24 }, (_, i) => (i.toString().padStart(2, '0') + ':00')).map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mañana hasta</label>
                <select value={horaFinManana} onChange={(e) => setHoraFinManana(e.target.value)} className="input-field text-sm">
                  {Array.from({ length: 24 }, (_, i) => (i.toString().padStart(2, '0') + ':00')).map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tarde desde</label>
                <select value={horaInicioTarde} onChange={(e) => setHoraInicioTarde(e.target.value)} className="input-field text-sm">
                  {Array.from({ length: 24 }, (_, i) => (i.toString().padStart(2, '0') + ':00')).map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tarde hasta</label>
                <select value={horaFinTarde} onChange={(e) => setHoraFinTarde(e.target.value)} className="input-field text-sm">
                  {Array.from({ length: 24 }, (_, i) => (i.toString().padStart(2, '0') + ':00')).map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="activa"
              checked={activa}
              onChange={(e) => setActiva(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="activa" className="text-sm font-medium text-gray-700">
              Cuenta activa (si la desactivás, no podrá iniciar sesión hasta que la reactives)
            </label>
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
