import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Check, RotateCcw, Plus, AlertTriangle, Save } from 'lucide-react';
import { HorasProfesMes } from '../types';
import { storageApi } from '../utils/storage-api';
import { formatCurrency } from '../utils/format';
import { hoyISO, parseFechaLocal } from '../utils/date';
import { useToast } from '../components/ToastProvider';

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const SIN_CLASE = '__sin_clase__';

function mesActual(): string {
  return hoyISO().slice(0, 7);
}

function moverMes(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nombreMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  const txt = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function etiquetaFecha(fecha: string): string {
  const d = parseFechaLocal(fecha);
  const ds = d.getDay() === 0 ? 6 : d.getDay() - 1;
  return `${DIAS_CORTOS[ds]} ${d.getDate()}/${d.getMonth() + 1}`;
}

const HorasProfes = () => {
  const toast = useToast();
  const [mes, setMes] = useState(mesActual);
  const [data, setData] = useState<HorasProfesMes | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalDuenasInput, setTotalDuenasInput] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [filtroProfe, setFiltroProfe] = useState('');
  const [extra, setExtra] = useState({ fecha: '', hora: '', profesorId: '' });

  const cargar = useCallback(async (m: string, silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const res = await storageApi.horasProfes.getMes(m);
      setData(res);
      setTotalDuenasInput(res.totalDuenas ? String(res.totalDuenas) : '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron cargar las horas');
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void cargar(mes);
  }, [mes, cargar]);

  const profById = useMemo(() => new Map((data?.profesores ?? []).map((p) => [p.id, p])), [data]);
  const nombreProfe = (id: string | null) => {
    if (!id) return 'Sin profe';
    const p = profById.get(id);
    return p ? `${p.nombre} ${p.apellido}`.trim() : 'Sin profe';
  };

  const guardarTotalDuenas = async () => {
    setGuardando(true);
    try {
      await storageApi.horasProfes.setTotalDuenas(mes, Math.max(0, Number(totalDuenasInput) || 0));
      await cargar(mes, true);
      toast.success('Total guardado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarProfeClase = async (fecha: string, hora: string, value: string, profesorFijoId: string | null) => {
    try {
      if (value === SIN_CLASE) {
        await storageApi.horasProfes.setClase({ fecha, hora, sinClase: true });
      } else if (value && value === profesorFijoId) {
        await storageApi.horasProfes.setClase({ fecha, hora, restablecer: true });
      } else if (value) {
        await storageApi.horasProfes.setClase({ fecha, hora, profesorId: value });
      }
      await cargar(mes, true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };

  const restablecerClase = async (fecha: string, hora: string) => {
    try {
      await storageApi.horasProfes.setClase({ fecha, hora, restablecer: true });
      await cargar(mes, true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo restablecer');
    }
  };

  const agregarClaseExtra = async () => {
    if (!extra.fecha || !/^\d{2}:\d{2}$/.test(extra.hora) || !extra.profesorId) {
      toast.error('Completá fecha, hora y profe.');
      return;
    }
    try {
      await storageApi.horasProfes.setClase({ fecha: extra.fecha, hora: extra.hora, profesorId: extra.profesorId });
      setExtra({ fecha: '', hora: '', profesorId: '' });
      await cargar(mes, true);
      toast.success('Clase agregada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo agregar');
    }
  };

  const togglePagoDia = async (profesorId: string, fecha: string, pagado: boolean) => {
    try {
      await storageApi.horasProfes.setPagoDia({ profesorId, fecha, pagado });
      await cargar(mes, true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };

  const marcarTodoPagado = async (profesorId: string, fechas: string[]) => {
    try {
      await Promise.all(fechas.map((fecha) => storageApi.horasProfes.setPagoDia({ profesorId, fecha, pagado: true })));
      await cargar(mes, true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };

  const diasFiltrados = useMemo(() => {
    if (!data) return [];
    if (!filtroProfe) return data.dias;
    return data.dias
      .map((d) => ({
        ...d,
        clases: d.clases.filter((c) => (filtroProfe === SIN_CLASE ? !c.profesorId && !c.sinClase : c.profesorId === filtroProfe)),
      }))
      .filter((d) => d.clases.length > 0);
  }, [data, filtroProfe]);

  const hoy = hoyISO();
  const duenas = (data?.profesores ?? []).filter((p) => p.tipo === 'duena');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <Link to="/profesores" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Volver a profesores">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="page-title-wrap">
            <span className="page-title-accent" aria-hidden />
            <h1 className="page-title">Horas de profes</h1>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
          <button type="button" onClick={() => setMes(moverMes(mes, -1))} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Mes anterior">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="min-w-[10rem] text-center font-semibold text-gray-800">{nombreMes(mes)}</span>
          <button type="button" onClick={() => setMes(moverMes(mes, 1))} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Mes siguiente">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading || !data ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : data.profesores.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">
          Primero cargá las profes en <Link to="/profesores" className="text-primary-700 underline">Profesores</Link> y asignalas a las clases del calendario.
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            Las horas salen de las clases del calendario (cada clase = 1 hora) con la profe asignada. Los días cerrados no cuentan.
            Si un día dio otra profe o no hubo clase, cambialo abajo en <strong>Clases del mes</strong>.
          </p>

          {data.horasSinProfe > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>
                Hay <strong>{data.horasSinProfe}</strong> {data.horasSinProfe === 1 ? 'clase' : 'clases'} sin profe asignada este mes.{' '}
                <button type="button" className="underline font-medium" onClick={() => setFiltroProfe(SIN_CLASE)}>
                  Ver cuáles
                </button>
              </span>
            </div>
          )}

          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Profes dueñas</h2>
            <p className="text-sm text-gray-500 mb-4">Escribí el total del mes y se reparte según las horas que dio cada una.</p>
            <div className="flex flex-wrap items-end gap-2 mb-4">
              <div className="flex-1 min-w-[10rem]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Total a repartir</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={totalDuenasInput}
                  onChange={(e) => setTotalDuenasInput(e.target.value)}
                  className="input-field"
                  placeholder="Ej: 1500000"
                />
              </div>
              <button type="button" onClick={guardarTotalDuenas} disabled={guardando} className="btn-primary flex items-center gap-2">
                <Save className="w-4 h-4" />
                Guardar
              </button>
            </div>
            {duenas.length === 0 ? (
              <p className="text-sm text-gray-500">No hay profes marcadas como dueñas.</p>
            ) : (
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                {data.reparto.map((r) => (
                  <div key={r.profesorId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div>
                      <p className="font-medium text-gray-900">{nombreProfe(r.profesorId)}</p>
                      <p className="text-xs text-gray-500">
                        {r.horas} h · {r.porcentaje.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%
                      </p>
                    </div>
                    <p className="text-lg font-bold text-violet-800">{formatCurrency(r.monto)}</p>
                  </div>
                ))}
                <div className="flex justify-between p-3 text-sm text-gray-600 bg-gray-50">
                  <span>Total horas dueñas: {data.horasDuenasTotal} h</span>
                  <span>{formatCurrency(data.totalDuenas)}</span>
                </div>
              </div>
            )}
          </div>

          {data.suplentes.map((s) => {
            const pendientes = s.dias.filter((d) => !d.pagado);
            return (
              <div key={s.profesorId} className="card">
                <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{nombreProfe(s.profesorId)}</h2>
                    <p className="text-sm text-gray-500">Suplente · {formatCurrency(s.precioHora)} por hora</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Falta pagarle</p>
                    <p className={`text-2xl font-bold ${s.pendiente > 0 ? 'text-red-600' : 'text-green-700'}`}>{formatCurrency(s.pendiente)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4 text-center text-sm">
                  <div className="rounded-lg bg-gray-50 p-2">
                    <p className="text-gray-500">Horas</p>
                    <p className="font-semibold text-gray-900">{s.horas}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2">
                    <p className="text-gray-500">Total</p>
                    <p className="font-semibold text-gray-900">{formatCurrency(s.total)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2">
                    <p className="text-gray-500">Pagado</p>
                    <p className="font-semibold text-green-700">{formatCurrency(s.pagado)}</p>
                  </div>
                </div>
                {s.precioHora <= 0 && (
                  <p className="mb-3 text-sm text-amber-700">Falta cargar el precio por hora en Profesores → Editar.</p>
                )}
                {s.dias.length === 0 ? (
                  <p className="text-sm text-gray-500">No tiene clases asignadas este mes.</p>
                ) : (
                  <>
                    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                      {s.dias.map((d) => (
                        <li key={d.fecha} className="flex items-center justify-between gap-3 p-3">
                          <div>
                            <p className="font-medium text-gray-900">
                              {etiquetaFecha(d.fecha)}
                              {d.fecha > hoy && <span className="ml-2 text-xs text-gray-400">(programado)</span>}
                            </p>
                            <p className="text-xs text-gray-500">
                              {d.horas} h · {formatCurrency(d.monto)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => togglePagoDia(s.profesorId, d.fecha, !d.pagado)}
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                              d.pagado
                                ? 'border-green-300 bg-green-50 text-green-800'
                                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {d.pagado && <Check className="w-4 h-4" />}
                            {d.pagado ? 'Pagado' : 'No pagado'}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {pendientes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => marcarTodoPagado(s.profesorId, pendientes.map((d) => d.fecha))}
                        className="mt-3 btn-secondary text-sm"
                      >
                        Marcar todo como pagado
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}

          <div className="card">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
              <h2 className="text-lg font-bold text-gray-900">Clases del mes</h2>
              <select value={filtroProfe} onChange={(e) => setFiltroProfe(e.target.value)} className="input-field w-auto">
                <option value="">Todas las profes</option>
                {data.profesores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} {p.apellido}
                  </option>
                ))}
                <option value={SIN_CLASE}>Sin profe asignada</option>
              </select>
            </div>

            <div className="mb-4 rounded-lg border border-dashed border-gray-300 p-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Agregar clase extra (fuera del horario fijo)</p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="date"
                  value={extra.fecha}
                  min={`${mes}-01`}
                  max={`${mes}-31`}
                  onChange={(e) => setExtra({ ...extra, fecha: e.target.value })}
                  className="input-field w-auto"
                />
                <input
                  type="time"
                  step={3600}
                  value={extra.hora}
                  onChange={(e) => setExtra({ ...extra, hora: e.target.value.slice(0, 5) })}
                  className="input-field w-auto"
                />
                <select value={extra.profesorId} onChange={(e) => setExtra({ ...extra, profesorId: e.target.value })} className="input-field w-auto">
                  <option value="">Profe…</option>
                  {data.profesores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} {p.apellido}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={agregarClaseExtra} className="btn-secondary flex items-center gap-1">
                  <Plus className="w-4 h-4" />
                  Agregar
                </button>
              </div>
            </div>

            {diasFiltrados.length === 0 ? (
              <p className="text-sm text-gray-500">No hay clases para mostrar.</p>
            ) : (
              <div className="space-y-3">
                {diasFiltrados.map((d) => (
                  <div key={d.fecha} className={`rounded-lg border ${d.fecha === hoy ? 'border-primary-300' : 'border-gray-100'}`}>
                    <div className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-t-lg">
                      <span className="font-semibold text-gray-800">{etiquetaFecha(d.fecha)}</span>
                      {d.cerrado && <span className="text-xs text-gray-500">Día cerrado</span>}
                    </div>
                    {d.clases.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-gray-400">Sin clases</p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {d.clases.map((c) => (
                          <li key={c.hora} className="flex flex-wrap items-center gap-2 px-3 py-2">
                            <span className="w-14 font-mono text-sm text-gray-700">{c.hora}</span>
                            <span className="flex-1 min-w-[6rem] text-sm text-gray-500 truncate">
                              {c.extra ? 'Clase extra' : c.titulo || 'Clase'}
                            </span>
                            <select
                              value={c.sinClase ? SIN_CLASE : c.profesorId ?? ''}
                              onChange={(e) => cambiarProfeClase(d.fecha, c.hora, e.target.value, c.profesorFijoId)}
                              className={`input-field w-auto text-sm py-1 ${
                                c.sinClase
                                  ? 'bg-gray-100 text-gray-500 line-through'
                                  : !c.profesorId
                                    ? 'border-amber-300 bg-amber-50'
                                    : c.cambiado
                                      ? 'border-blue-300 bg-blue-50'
                                      : ''
                              }`}
                            >
                              {!c.profesorId && !c.sinClase && <option value="">Sin profe</option>}
                              {data.profesores.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.nombre} {p.apellido}
                                  {p.id === c.profesorFijoId ? ' (fija)' : ''}
                                </option>
                              ))}
                              <option value={SIN_CLASE}>No hubo clase</option>
                            </select>
                            {c.cambiado && (
                              <button
                                type="button"
                                onClick={() => restablecerClase(d.fecha, c.hora)}
                                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                                title={c.extra ? 'Quitar clase extra' : `Volver a ${nombreProfe(c.profesorFijoId)}`}
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default HorasProfes;
