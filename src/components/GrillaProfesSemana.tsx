import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, RotateCcw } from 'lucide-react';
import { HorarioFijoProfes, ReemplazoProfeFecha } from '../types';
import { storageApi } from '../utils/storage-api';
import { parseFechaLocal } from '../utils/date';
import { useToast } from './ToastProvider';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const SIN_CLASE = '__sin_clase__';
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
  /** Lunes (YYYY-MM-DD) de la semana a editar. Sin valor = horario base que se repite todas las semanas. */
  lunes?: string;
  onCambio?: () => void;
}

const GrillaProfesSemana = ({ profesores, lunes, onCambio }: Props) => {
  const toast = useToast();
  const [data, setData] = useState<HorarioFijoProfes | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [accionando, setAccionando] = useState(false);
  const modoSemana = !!lunes;

  const cargar = useCallback(async () => {
    try {
      setData(await storageApi.horasProfes.getHorarioFijo(lunes));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cargar la grilla');
    } finally {
      setLoading(false);
    }
  }, [toast, lunes]);

  useEffect(() => {
    setLoading(true);
    void cargar();
  }, [cargar]);

  const colorPorProfe = useMemo(
    () => new Map(profesores.map((p, i) => [p.id, COLORES[i % COLORES.length]])),
    [profesores]
  );
  const baseSlot = useMemo(
    () => new Map((data?.clases ?? []).map((c) => [`${c.diaSemana}|${c.hora}`, c])),
    [data]
  );
  const cambiosPorClave = useMemo(
    () => new Map((data?.cambios ?? []).map((c) => [`${c.fecha}|${c.hora}`, c])),
    [data]
  );
  const horas = useMemo(() => [...(data?.manana ?? []), ...(data?.tarde ?? [])], [data]);

  const infoCelda = (dia: number, hora: string) => {
    const noDisp = (data?.horariosNoDisponiblesPorDia[dia] ?? []).includes(hora);
    const base = baseSlot.get(`${dia}|${hora}`)?.profesorId ?? '';
    if (!modoSemana || !data?.dias) {
      return { noDisp, cerrado: false, fecha: '', base, valor: base, cambio: undefined as ReemplazoProfeFecha | undefined };
    }
    const d = data.dias[dia];
    const cerrado = !!d && (d.cerrarTodo || d.horasCerradas.includes(hora));
    const cambio = d ? cambiosPorClave.get(`${d.fecha}|${hora}`) : undefined;
    const valor = cambio ? (cambio.sinClase ? SIN_CLASE : cambio.profesorId ?? '') : base;
    return { noDisp, cerrado, fecha: d?.fecha ?? '', base, valor, cambio };
  };

  const horasPorProfe = new Map<string, number>();
  for (let dia = 0; dia < 6; dia++) {
    for (const hora of horas) {
      const c = infoCelda(dia, hora);
      if (c.noDisp || c.cerrado || !c.valor || c.valor === SIN_CLASE) continue;
      horasPorProfe.set(c.valor, (horasPorProfe.get(c.valor) || 0) + 1);
    }
  }

  const asignarBase = async (diaSemana: number, hora: string, profesorId: string | null) => {
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
    await storageApi.horasProfes.setHorarioFijo({ diaSemana, hora, profesorId });
  };

  const asignarSemana = async (fecha: string, hora: string, valor: string, base: string) => {
    const volverABase = valor === base || (!valor && !base);
    setData((prev) => {
      if (!prev) return prev;
      const resto = (prev.cambios ?? []).filter((c) => !(c.fecha === fecha && c.hora === hora));
      if (volverABase) return { ...prev, cambios: resto };
      const nuevo: ReemplazoProfeFecha = {
        fecha,
        hora,
        profesorId: valor === SIN_CLASE ? null : valor,
        sinClase: valor === SIN_CLASE,
        reemplazaProfesorId: null,
        motivo: '',
        planificado: true,
      };
      return { ...prev, cambios: [...resto, nuevo] };
    });
    if (volverABase) {
      await storageApi.horasProfes.setClase({ fecha, hora, restablecer: true });
    } else if (valor === SIN_CLASE) {
      await storageApi.horasProfes.setClase({ fecha, hora, sinClase: true, planificado: true });
    } else {
      await storageApi.horasProfes.setClase({ fecha, hora, profesorId: valor, planificado: true });
    }
  };

  const onElegir = async (dia: number, hora: string, valor: string) => {
    const key = `${dia}|${hora}`;
    const c = infoCelda(dia, hora);
    setGuardando(key);
    try {
      if (modoSemana) await asignarSemana(c.fecha, hora, valor, c.base);
      else await asignarBase(dia, hora, valor || null);
      onCambio?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
      await cargar();
    } finally {
      setGuardando(null);
    }
  };

  const accionSemana = async (accion: 'copiar_anterior' | 'restablecer') => {
    if (!lunes) return;
    const ok = await toast.confirm(
      accion === 'copiar_anterior'
        ? 'Se reemplaza lo planificado en esta semana por lo que cargaste la semana anterior. Los reemplazos del calendario no se tocan.'
        : 'Esta semana vuelve al horario base. Los reemplazos del calendario no se tocan.',
      { title: accion === 'copiar_anterior' ? 'Copiar semana anterior' : 'Volver al horario base', confirmText: 'Sí, hacerlo' }
    );
    if (!ok) return;
    setAccionando(true);
    try {
      await storageApi.horasProfes.accionSemana(lunes, accion);
      await cargar();
      onCambio?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo aplicar');
    } finally {
      setAccionando(false);
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

  const renderCelda = (dia: number, hora: string) => {
    const c = infoCelda(dia, hora);
    const key = `${dia}|${hora}`;
    if (c.noDisp || c.cerrado) {
      return (
        <td key={dia} className="px-1 py-1">
          <div className="rounded-md bg-slate-100 px-2 py-1.5 text-center text-[11px] text-slate-400">
            {c.cerrado ? 'Cerrado' : 'No disp.'}
          </div>
        </td>
      );
    }
    const esReemplazo = !!c.cambio && !c.cambio.planificado;
    const esCambioSemana = !!c.cambio && c.cambio.planificado;
    const color =
      c.valor === SIN_CLASE
        ? 'bg-gray-100 border-gray-300 text-gray-400 line-through'
        : c.valor
          ? colorPorProfe.get(c.valor)
          : 'border-dashed border-gray-300 bg-white text-gray-400';
    const titulo = esReemplazo
      ? `Reemplazo cargado en el calendario${c.cambio?.motivo ? `: ${c.cambio.motivo}` : ''}`
      : esCambioSemana
        ? 'Cambiado solo esta semana'
        : undefined;
    return (
      <td key={dia} className="px-1 py-1">
        <div className="relative">
          <select
            value={c.valor}
            disabled={guardando === key}
            onChange={(e) => onElegir(dia, hora, e.target.value)}
            className={`w-full min-w-[6.5rem] rounded-md border px-1.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-60 ${color} ${
              esReemplazo ? 'ring-2 ring-blue-400' : esCambioSemana ? 'ring-2 ring-gray-700/60' : ''
            }`}
            title={titulo}
          >
            {!c.base && <option value="">—</option>}
            {profesores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.apellido}
                {modoSemana && p.id === c.base ? ' (base)' : ''}
              </option>
            ))}
            {modoSemana && <option value={SIN_CLASE}>No hay clase</option>}
          </select>
          {(esReemplazo || esCambioSemana) && (
            <span
              className={`pointer-events-none absolute -top-1.5 -right-1 rounded-full px-1 text-[9px] font-bold text-white ${
                esReemplazo ? 'bg-blue-500' : 'bg-gray-700'
              }`}
            >
              {esReemplazo ? 'R' : '✎'}
            </span>
          )}
        </div>
      </td>
    );
  };

  const renderBloque = (titulo: string, lista: string[]) => (
    <>
      <tr>
        <td colSpan={7} className="bg-gray-50 px-2 py-1.5 text-xs font-semibold text-gray-600">
          {titulo}
        </td>
      </tr>
      {lista.map((hora) => (
        <tr key={hora} className="border-t border-gray-100">
          <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-mono text-sm text-gray-700 border-r border-gray-100">{hora}</td>
          {DIAS.map((_, dia) => renderCelda(dia, hora))}
        </tr>
      ))}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {profesores.map((p) => (
            <span
              key={p.id}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${colorPorProfe.get(p.id)}`}
            >
              {p.nombre} {p.apellido}
              {p.tipo === 'suplente' && <span className="opacity-70">(suplente)</span>}
              <span className="opacity-80">· {horasPorProfe.get(p.id) || 0} h{modoSemana ? '' : '/sem'}</span>
            </span>
          ))}
        </div>
        {modoSemana && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={accionando}
              onClick={() => accionSemana('copiar_anterior')}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <Copy className="w-4 h-4" />
              Copiar semana anterior
            </button>
            <button
              type="button"
              disabled={accionando}
              onClick={() => accionSemana('restablecer')}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              Volver al base
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-white">
              <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left text-xs font-semibold text-gray-500 border-r border-gray-100">Hora</th>
              {DIAS.map((d, i) => {
                const fecha = data.dias?.[i]?.fecha;
                const f = fecha ? parseFechaLocal(fecha) : null;
                return (
                  <th key={d} className="px-1 py-2 text-center text-xs font-semibold text-gray-600">
                    {d}
                    {f && <span className="block font-normal text-gray-400">{f.getDate()}/{f.getMonth() + 1}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.manana.length > 0 && renderBloque('Mañana', data.manana)}
            {data.tarde.length > 0 && renderBloque('Tarde', data.tarde)}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        {modoSemana ? (
          <>
            Lo que elijas acá vale solo para esta semana. <span className="font-semibold">✎</span> = cambiado esta semana,{' '}
            <span className="font-semibold text-blue-600">R</span> = reemplazo cargado desde el calendario. Si elegís la profe marcada
            como <em>(base)</em>, vuelve al horario base.
          </>
        ) : (
          <>Horario base: se repite todas las semanas. Si una semana trabaja otra profe, cambialo en la pestaña de esa semana.</>
        )}
      </p>
    </div>
  );
};

export default GrillaProfesSemana;
