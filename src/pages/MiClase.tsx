import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, UserPlus, UserMinus, Loader2 } from 'lucide-react';
import { DIAS_SEMANA } from '../types';

const getBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

type TurnoPortal = {
  id: string;
  diaSemana: number;
  hora: string;
  titulo: string;
  cupo: number;
  inscriptos: number;
  yaInscripto: boolean;
};

type PortalData = {
  alumno: { id: string; nombre: string; apellido: string };
  turnos: TurnoPortal[];
};

const NOMBRE_DIA = [...DIAS_SEMANA, 'Domingo'];

const MiClase = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);

  useEffect(() => {
    if (!token.trim()) {
      setError('Faltó el link. Pedile al estudio el link para gestionar tus clases.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const base = getBase();
        const res = await fetch(`${base}/api/alumno-portal?token=${encodeURIComponent(token)}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (!cancelled) setError(err.error || 'Link inválido o expirado.');
          if (!cancelled) setLoading(false);
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setError('');
        }
      } catch (e) {
        if (!cancelled) setError('No se pudo cargar. Revisá tu conexión.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const inscribir = async (turnoId: string) => {
    setActioning(turnoId);
    try {
      const base = getBase();
      const res = await fetch(`${base}/api/alumno-portal/inscribir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, turnoId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error || 'No se pudo inscribir.');
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              turnos: prev.turnos.map((t) =>
                t.id === turnoId ? { ...t, yaInscripto: true, inscriptos: t.inscriptos + 1 } : t
              ),
            }
          : null
      );
    } finally {
      setActioning(null);
    }
  };

  const liberar = async (turnoId: string) => {
    setActioning(turnoId);
    try {
      const base = getBase();
      const res = await fetch(`${base}/api/alumno-portal/liberar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, turnoId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || 'No se pudo liberar el cupo.');
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              turnos: prev.turnos.map((t) =>
                t.id === turnoId ? { ...t, yaInscripto: false, inscriptos: t.inscriptos - 1 } : t
              ),
            }
          : null
      );
    } finally {
      setActioning(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
          <p className="text-gray-600">Cargando tus clases...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <p className="text-sm text-gray-500 mt-2">Si el link se venció, pedile al estudio que te envíe uno nuevo.</p>
        </div>
      </div>
    );
  }

  const nombreCompleto = [data.alumno.apellido, data.alumno.nombre].filter(Boolean).join(', ') || 'Alumno';

  return (
    <div className="min-h-screen bg-gray-100 pb-safe">
      <div className="max-w-lg mx-auto p-4 pt-6">
        <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary-600" />
            Mis clases
          </h1>
          <p className="text-sm text-gray-600 mt-1">Hola, {nombreCompleto}. Acá podés sumarte a una clase o liberar tu cupo.</p>
        </div>

        <div className="space-y-3">
          {data.turnos.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">
              Todavía no hay clases cargadas. Cuando el estudio agregue turnos, van a aparecer acá.
            </div>
          ) : (
            data.turnos.map((t) => (
              <div key={t.id} className="bg-white rounded-xl shadow p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 truncate">{t.titulo || 'Clase'}</p>
                  <p className="text-sm text-gray-600">
                    {NOMBRE_DIA[t.diaSemana] ?? `Día ${t.diaSemana}`} — {t.hora}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t.inscriptos}/{t.cupo} inscriptos
                  </p>
                </div>
                <div className="flex-shrink-0">
                  {t.yaInscripto ? (
                    <button
                      type="button"
                      onClick={() => liberar(t.id)}
                      disabled={!!actioning}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 font-medium text-sm disabled:opacity-50 touch-manipulation"
                    >
                      {actioning === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                      Liberar cupo
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => inscribir(t.id)}
                      disabled={!!actioning || t.inscriptos >= t.cupo}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                    >
                      {actioning === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                      Sumarme
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default MiClase;
