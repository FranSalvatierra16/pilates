import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { storageApi } from '../utils/storage-api';

const HORAS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, '0') + ':00'
);

const useApi = () => {
  if (import.meta.env.VITE_USE_API === 'false') return false;
  if (import.meta.env.VITE_USE_API === 'true') return true;
  return import.meta.env.PROD;
};

export default function Configuracion() {
  const [horaInicioManana, setHoraInicioManana] = useState('07:00');
  const [horaFinManana, setHoraFinManana] = useState('12:00');
  const [horaInicioTarde, setHoraInicioTarde] = useState('16:00');
  const [horaFinTarde, setHoraFinTarde] = useState('21:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!useApi()) {
      setLoading(false);
      return;
    }
    storageApi.sucursal
      .getHorarios()
      .then((data) => {
        setHoraInicioManana(data.horaInicioManana || '07:00');
        setHoraFinManana(data.horaFinManana || '12:00');
        setHoraInicioTarde(data.horaInicioTarde || '16:00');
        setHoraFinTarde(data.horaFinTarde || '21:00');
      })
      .catch(() => setError('No se pudieron cargar los horarios'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!useApi()) {
      setError('En modo local no se pueden guardar horarios. Usá la app conectada a Railway.');
      return;
    }
    setError('');
    setSaving(true);
    setSaved(false);
    try {
      await storageApi.sucursal.updateHorarios({
        horaInicioManana,
        horaFinManana,
        horaInicioTarde,
        horaFinTarde,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!useApi()) {
    return (
      <div>
        <h1 className="page-title">Configuración</h1>
        <div className="card bg-amber-50 border border-amber-200 text-amber-800">
          <p>En modo local no podés configurar horarios. Los horarios se configuran cuando la app está conectada a la base de datos (Railway).</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="page-title-accent" aria-hidden />
        <h1 className="page-title">Horarios de clase</h1>
      </div>
      <p className="text-gray-600 mb-6">
        Definí en qué horarios da clases esta sucursal. En el Calendario solo aparecerán estos bloques para crear turnos.
      </p>

      <form onSubmit={handleSave} className="card max-w-xl space-y-6">
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mañana: desde
            </label>
            <select
              value={horaInicioManana}
              onChange={(e) => setHoraInicioManana(e.target.value)}
              className="input-field"
            >
              {HORAS.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mañana: hasta
            </label>
            <select
              value={horaFinManana}
              onChange={(e) => setHoraFinManana(e.target.value)}
              className="input-field"
            >
              {HORAS.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tarde: desde
            </label>
            <select
              value={horaInicioTarde}
              onChange={(e) => setHoraInicioTarde(e.target.value)}
              className="input-field"
            >
              {HORAS.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tarde: hasta
            </label>
            <select
              value={horaFinTarde}
              onChange={(e) => setHoraFinTarde(e.target.value)}
              className="input-field"
            >
              {HORAS.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-sm text-gray-500">
          Ejemplo: Mañana 7:00–12:00 y Tarde 16:00–21:00 genera bloques cada hora en esos rangos.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
            Horarios guardados correctamente.
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar horarios'}
        </button>
      </form>
    </div>
  );
}
