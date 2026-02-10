import { useState, useEffect } from 'react';
import { Actividad } from '../types';

const getBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

const RegistroLink = () => {
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    telefono: '',
    email: '',
    actividadId: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base = getBase();
        const res = await fetch(`${base}/api/actividades`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setActividades(data);
        }
      } catch {
        if (!cancelled) setActividades([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      const base = getBase();
      const res = await fetch(`${base}/api/registro-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          apellido: form.apellido.trim(),
          dni: form.dni.trim(),
          telefono: form.telefono.trim(),
          email: form.email.trim(),
          actividadId: form.actividadId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'No se pudo enviar. Intentá de nuevo.');
        setSending(false);
        return;
      }
      setSent(true);
    } catch {
      setError('Error de conexión. Revisá tu internet e intentá de nuevo.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 safe-area-pb">
        <div className="card w-full max-w-md text-center">
          <div className="text-5xl mb-4 text-green-600">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Registro exitoso!</h1>
          <p className="text-gray-600 mb-2">
            Recibimos tus datos correctamente.
          </p>
          <p className="text-gray-700 font-medium">
            Pronto nos estaremos comunicando por WhatsApp para agendar tu turno.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-8 safe-area-pb">
      <div className="card w-full max-w-md">
        <div className="text-center mb-6">
          <img src="/savia.png" alt="SAVIA" className="h-14 w-auto mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">Inscripción</h1>
          <p className="text-gray-600 text-sm mt-1">Completá tus datos y te contactamos</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className="input-field text-base py-3"
              placeholder="Tu nombre"
              required
              autoComplete="given-name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Apellido</label>
            <input
              type="text"
              value={form.apellido}
              onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))}
              className="input-field text-base py-3"
              placeholder="Tu apellido"
              required
              autoComplete="family-name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">DNI</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.dni}
              onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value.replace(/\D/g, '') }))}
              className="input-field text-base py-3"
              placeholder="Sin puntos"
              required
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input
              type="tel"
              value={form.telefono}
              onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
              className="input-field text-base py-3"
              placeholder="Ej. 223 123 4567"
              required
              autoComplete="tel"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="input-field text-base py-3"
              placeholder="tu@email.com"
              required
              autoComplete="email"
            />
          </div>
          {!loading && actividades.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Actividad de interés (opcional)</label>
              <select
                value={form.actividadId}
                onChange={(e) => setForm((f) => ({ ...f, actividadId: e.target.value }))}
                className="input-field text-base py-3"
              >
                <option value="">Elegir...</option>
                {actividades.map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="btn-primary w-full py-3 text-base mt-2 disabled:opacity-60"
          >
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RegistroLink;
