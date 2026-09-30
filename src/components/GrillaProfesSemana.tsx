import { useCallback, useEffect, useMemo, useState } from 'react';
import { HorarioFijoProfes } from '../types';
import { storageApi } from '../utils/storage-api';
import { useToast } from './ToastProvider';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const COLORES = [
  'bg-violet-100 border-violet-300 text-violet-900',
  'bg-sky-100 border-sky-300 text-sky-900',
  'bg-emerald-100 border-emerald-300 text-emerald-900',
  'bg-amber-100 border-amber-300 text-amber-900',
  'bg-rose-100 border-rose-300 text-rose-900',
  'bg-teal-100 border-teal-300 text-teal-900',
  'bg-orange-100 border-orange-300 text-orange-900',
  'bg-indigo-100 border-indigo-300 text-indigo-900',
];

type ProfeOpcion = { id: string; nombre: string; apellido: string; tipo: 'duena' | 'suplente' };

interface Props {
  profesores: ProfeOpcion[];
  onCambio?: () => void;
}

const GrillaProfesSemana = ({ profesores, onCambio }: Props) => {
  const toast = useToast();
  const [data, setData] = useState<HorarioFijoProfes | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setData(await storageApi.horasProfes.getHorarioFijo());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cargar la grilla');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const colorPorProfe = useMemo(
    () => new Map(profesores.map((p, i) => [p.id, COLORES[i % COLORES.length]])),
    [profesores]
  );

  const clasePorSlot = useMemo(
    () => new Map((data?.clases ?? []).map((c) => [`${c.diaSemana}|${c.hora}`, c])),
    [data]
  );

  const horasPorProfe = useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    for (const c of data.clases) {
      if (c.diaSemana > 5 || !c.profesorId) continue;
      const noDisp = data.horariosNoDisponiblesPorDia[c.diaSemana] ?? [];
      if (noDisp.includes(c.hora)) continue;
      m.set(c.profesorId, (m.get(c.profesorId) || 0) + 1);
    }
    return m;
  }, [data]);

  const asignar = async (diaSemana: number, hora: string, profesorId: string | null) => {
    const key = `${diaSemana}|${hora}`;
    setGuardando(key);
    setData((prev) => {
      if (!prev) return prev;
      const existe = prev.clases.some((c) => c.diaSemana === diaSemana && c.hora === hora);
      const clases = existe
        ? prev.clases.map((c) => (c.diaSemana === diaSemana && c.hora === hora ? { ...c, profesorId } : c))
        : profesorId
          ? [...prev.clases, { diaSemana, hora, titulo: '', profesorId, alumnos: 0 }]
          : prev.clases;
      return { ...prev, clases };
    });
    try {
      await storageApi.horasProfes.setHorarioFijo({ diaSemana, hora, profesorId });
      onCambio?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
      await cargar();
    } finally {
      setGuardando(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }
  if (!data) return null;

  const renderBloque = (titulo: string, horas: string[]) => (
    <>
      <tr>
        <td colSpan={7} className="bg-gray-50 px-2 py-1.5 text-xs font-semibold text-gray-600">
          {titulo}
        </td>
      </tr>
      {horas.map((hora) => (
        <tr key={hora} className="border-t border-gray-100">
          <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-mono text-sm text-gray-700 border-r border-gray-100">{hora}</td>
          {DIAS.map((_, dia) => {
            const noDisp = (data.horariosNoDisponiblesPorDia[dia] ?? []).includes(hora);
            const clase = clasePorSlot.get(`${dia}|${hora}`);
            const profeId = clase?.profesorId ?? '';
            const color = profeId ? colorPorProfe.get(profeId) : '';
            const key = `${dia}|${hora}`;
            if (noDisp) {
              return (
                <td key={dia} className="px-1 py-1">
                  <div className="rounded-md bg-slate-100 px-2 py-1.5 text-center text-[11px] text-slate-400">No disp.</div>
                </td>
              );
            }
            return (
              <td key={dia} className="px-1 py-1">
                <select
                  value={profeId}
                  disabled={guardando === key}
                  onChange={(e) => asignar(dia, hora, e.target.value || null)}
                  className={`w-full min-w-[6.5rem] rounded-md border px-1.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-60 ${
                    color || 'border-dashed border-gray-300 bg-white text-gray-400'
                  }`}
                  title={clase?.alumnos ? `${clase.alumnos} alumno(s) fijos` : undefined}
                >
                  <option value="">—</option>
                  {profesores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} {p.apellido}
                    </option>
                  ))}
                </select>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {profesores.map((p) => (
          <span
            key={p.id}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${colorPorProfe.get(p.id)}`}
          >
            {p.nombre} {p.apellido}
            {p.tipo === 'suplente' && <span className="opacity-70">(suplente)</span>}
            <span className="opacity-80">· {horasPorProfe.get(p.id) || 0} h/sem</span>
          </span>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-white">
              <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left text-xs font-semibold text-gray-500 border-r border-gray-100">Hora</th>
              {DIAS.map((d) => (
                <th key={d} className="px-1 py-2 text-center text-xs font-semibold text-gray-600">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.manana.length > 0 && renderBloque('Mañana', data.manana)}
            {data.tarde.length > 0 && renderBloque('Tarde', data.tarde)}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        Esta es la profe fija de cada clase (se repite todas las semanas). Para un día puntual, reemplazala desde el calendario
        con el botón de editar turno.
      </p>
    </div>
  );
};

export default GrillaProfesSemana;
