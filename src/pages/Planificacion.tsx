import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Trash2,
  X,
  Save,
  ClipboardList,
  Dumbbell,
  Layers,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Copy,
  Download,
} from 'lucide-react';
import {
  PlanificacionEjercicio,
  PlanificacionMaquina,
  PlanificacionTipoEjercicio,
  SerieDetallePlan,
  DIAS_SEMANA,
} from '../types';
import { storageHybrid } from '../utils/storage-hybrid';
import { useToast } from '../components/ToastProvider';
import { useAuth } from '../contexts/AuthContext';
import {
  getSemanaAnterior,
  getSemanaSiguiente,
  getRangoSemana,
  getFechaFromSemanaYDia,
  getSemanaFromDate,
  parseFechaLocal,
  formatDate,
  fechaDefaultPlanificacionStudio,
  getDiaSemanaCalendarioDesdeISO,
  hoyISO,
  getSemanaActual,
} from '../utils/date';

const DIAS_GRID = [0, 1, 2, 3, 4, 5] as const;

function etiquetaDiaCalendario(iso: string): string {
  const d = parseFechaLocal(iso);
  const js = d.getDay();
  if (js === 0) return 'Domingo';
  return DIAS_SEMANA[js - 1];
}

function etiquetaMaquinas(ej: PlanificacionEjercicio, maquinas: PlanificacionMaquina[]): string {
  const a = maquinas.find((m) => m.id === ej.maquinaId)?.nombre;
  const b = maquinas.find((m) => m.id === ej.maquinaSecundariaId)?.nombre;
  if (a && b) return `${a} · ${b}`;
  return a || b || '—';
}

function resumenSeries(e: PlanificacionEjercicio): string {
  if (e.modoSeries === 'tres_iguales') {
    const u = e.unidad === 'cantidad' ? 'cantidad' : 'duración';
    return `${e.numSeries} series iguales (${u}: ${e.valor ?? '—'})`;
  }
  if (e.seriesDetalle?.length === 3) {
    return e.seriesDetalle.map((s, i) => `Serie ${i + 1}: ${s.valor}`).join(' · ');
  }
  return '—';
}

const emptySerie = (): SerieDetallePlan => ({ unidad: 'duracion', valor: '' });

const Planificacion = () => {
  const toast = useToast();
  const { planificacionHabilitada, refreshPlanificacionFlag } = useAuth();
  const [tab, setTab] = useState<'catalogo' | 'ejercicios' | 'semana'>('catalogo');
  const [tipos, setTipos] = useState<PlanificacionTipoEjercicio[]>([]);
  const [maquinas, setMaquinas] = useState<PlanificacionMaquina[]>([]);
  const [ejercicios, setEjercicios] = useState<PlanificacionEjercicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevoTipo, setNuevoTipo] = useState('');
  const [nuevaMaq, setNuevaMaq] = useState('');
  const [showModalEj, setShowModalEj] = useState(false);
  const [editingEj, setEditingEj] = useState<PlanificacionEjercicio | null>(null);
  const [formEj, setFormEj] = useState({
    nombre: '',
    descripcion: '',
    tipoId: '',
    maquinaId: '',
    maquinaSecundariaId: '',
    modoSeries: 'tres_iguales' as 'tres_iguales' | 'serie_1_2_3',
    unidad: 'duracion' as 'duracion' | 'cantidad',
    valor: '',
    numSeries: '3',
    s1: emptySerie(),
    s2: emptySerie(),
    s3: emptySerie(),
  });
  const [semanaVista, setSemanaVista] = useState(() =>
    getSemanaFromDate(parseFechaLocal(fechaDefaultPlanificacionStudio()))
  );
  const [fechaSeleccionada, setFechaSeleccionada] = useState(fechaDefaultPlanificacionStudio);
  const [itemsOrden, setItemsOrden] = useState<{ ejercicioId: string; notas: string }[]>([]);
  const [filtroTipoId, setFiltroTipoId] = useState('');
  const [filtroMaquinaId, setFiltroMaquinaId] = useState('');
  const [busquedaEj, setBusquedaEj] = useState('');
  const [fechaCopiarDestino, setFechaCopiarDestino] = useState('');
  const [fechaTraerOrigen, setFechaTraerOrigen] = useState('');
  const [modalReemplazoIdx, setModalReemplazoIdx] = useState<number | null>(null);
  const [busquedaReemplazo, setBusquedaReemplazo] = useState('');

  const loadAll = useCallback(async () => {
    if (!planificacionHabilitada) return;
    try {
      setLoading(true);
      const [t, m, e] = await Promise.all([
        storageHybrid.planificacion.getTipos(),
        storageHybrid.planificacion.getMaquinas(),
        storageHybrid.planificacion.getEjercicios(),
      ]);
      setTipos(t);
      setMaquinas(m);
      setEjercicios(e);
    } catch (err) {
      console.error(err);
      toast.error('No se pudieron cargar los datos de planificación.');
    } finally {
      setLoading(false);
    }
  }, [planificacionHabilitada, toast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    void refreshPlanificacionFlag();
  }, [refreshPlanificacionFlag]);

  useEffect(() => {
    if (!planificacionHabilitada) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await storageHybrid.planificacion.getFecha(fechaSeleccionada);
        if (cancelled) return;
        setItemsOrden(
          (data.items || []).map((it) => ({ ejercicioId: it.ejercicioId, notas: it.notas || '' }))
        );
      } catch (err) {
        console.error(err);
        if (!cancelled) toast.error('No se pudo cargar la secuencia del día.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planificacionHabilitada, fechaSeleccionada, toast]);

  const ejerciciosFiltrados = useMemo(() => {
    const q = busquedaEj.trim().toLowerCase();
    return ejercicios.filter((ej) => {
      if (filtroTipoId && ej.tipoId !== filtroTipoId) return false;
      if (filtroMaquinaId) {
        const ok =
          ej.maquinaId === filtroMaquinaId || ej.maquinaSecundariaId === filtroMaquinaId;
        if (!ok) return false;
      }
      if (q) {
        const n = `${ej.nombre} ${ej.descripcion || ''}`.toLowerCase();
        if (!n.includes(q)) return false;
      }
      return true;
    });
  }, [ejercicios, filtroTipoId, filtroMaquinaId, busquedaEj]);

  const openModalEjercicio = (ej?: PlanificacionEjercicio) => {
    if (ej) {
      setEditingEj(ej);
      const sd = ej.seriesDetalle;
      setFormEj({
        nombre: ej.nombre,
        descripcion: ej.descripcion || '',
        tipoId: ej.tipoId || '',
        maquinaId: ej.maquinaId || '',
        maquinaSecundariaId: ej.maquinaSecundariaId || '',
        modoSeries: ej.modoSeries,
        unidad: ej.unidad === 'cantidad' ? 'cantidad' : 'duracion',
        valor: ej.valor || '',
        numSeries: String(ej.numSeries || 3),
        s1: sd?.[0] || emptySerie(),
        s2: sd?.[1] || emptySerie(),
        s3: sd?.[2] || emptySerie(),
      });
    } else {
      setEditingEj(null);
      setFormEj({
        nombre: '',
        descripcion: '',
        tipoId: '',
        maquinaId: '',
        maquinaSecundariaId: '',
        modoSeries: 'tres_iguales',
        unidad: 'duracion',
        valor: '',
        numSeries: '3',
        s1: emptySerie(),
        s2: emptySerie(),
        s3: emptySerie(),
      });
    }
    setShowModalEj(true);
  };

  const guardarEjercicio = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = formEj.nombre.trim();
    if (!nombre) {
      toast.warning('Nombre del ejercicio obligatorio');
      return;
    }
    try {
      if (formEj.modoSeries === 'tres_iguales') {
        const valor = formEj.valor.trim();
        if (!valor) {
          toast.warning('Indicá duración o cantidad');
          return;
        }
        const num = Math.min(10, Math.max(1, parseInt(formEj.numSeries, 10) || 3));
        const body = {
          nombre,
          descripcion: formEj.descripcion.trim(),
          tipoId: formEj.tipoId || null,
          maquinaId: formEj.maquinaId || null,
          maquinaSecundariaId: formEj.maquinaSecundariaId || null,
          modoSeries: 'tres_iguales' as const,
          unidad: formEj.unidad,
          valor,
          numSeries: num,
        };
        if (editingEj) {
          await storageHybrid.planificacion.updateEjercicio(editingEj.id, body);
        } else {
          await storageHybrid.planificacion.addEjercicio(body);
        }
      } else {
        const seriesDetalle = [formEj.s1, formEj.s2, formEj.s3].map((s) => ({
          unidad: s.unidad === 'cantidad' ? 'cantidad' as const : 'duracion' as const,
          valor: s.valor.trim(),
        }));
        if (seriesDetalle.some((s) => !s.valor)) {
          toast.warning('Completá las 3 series');
          return;
        }
        const body = {
          nombre,
          descripcion: formEj.descripcion.trim(),
          tipoId: formEj.tipoId || null,
          maquinaId: formEj.maquinaId || null,
          maquinaSecundariaId: formEj.maquinaSecundariaId || null,
          modoSeries: 'serie_1_2_3' as const,
          seriesDetalle,
        };
        if (editingEj) {
          await storageHybrid.planificacion.updateEjercicio(editingEj.id, body);
        } else {
          await storageHybrid.planificacion.addEjercicio(body);
        }
      }
      setShowModalEj(false);
      await loadAll();
      toast.success(editingEj ? 'Ejercicio actualizado' : 'Ejercicio guardado');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo guardar el ejercicio');
    }
  };

  const eliminarEjercicio = async (id: string) => {
    const ok = await toast.confirm('¿Eliminar este ejercicio de la biblioteca?', {
      title: 'Eliminar ejercicio',
      confirmText: 'Eliminar',
    });
    if (!ok) return;
    try {
      await storageHybrid.planificacion.deleteEjercicio(id);
      await loadAll();
      toast.success('Ejercicio eliminado');
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  const guardarItemsDia = async () => {
    try {
      await storageHybrid.planificacion.putFechaItems(fechaSeleccionada, itemsOrden);
      toast.success('Secuencia guardada para esta fecha');
      const data = await storageHybrid.planificacion.getFecha(fechaSeleccionada);
      setItemsOrden(
        (data.items || []).map((it) => ({ ejercicioId: it.ejercicioId, notas: it.notas || '' }))
      );
    } catch {
      toast.error('No se pudo guardar la secuencia');
    }
  };

  const cambiarSemana = (dir: 'prev' | 'next') => {
    const s = dir === 'prev' ? getSemanaAnterior(semanaVista) : getSemanaSiguiente(semanaVista);
    setSemanaVista(s);
    const idx = getDiaSemanaCalendarioDesdeISO(fechaSeleccionada);
    setFechaSeleccionada(getFechaFromSemanaYDia(s, idx));
  };

  const elegirDiaGrilla = (diaIndex: number) => {
    setFechaSeleccionada(getFechaFromSemanaYDia(semanaVista, diaIndex));
  };

  const agregarEjAlDia = (ejercicioId: string) => {
    if (itemsOrden.some((x) => x.ejercicioId === ejercicioId)) {
      toast.warning('Ese ejercicio ya está en la lista del día');
      return;
    }
    setItemsOrden((prev) => [...prev, { ejercicioId, notas: '' }]);
  };

  const quitarItem = (index: number) => {
    setItemsOrden((prev) => prev.filter((_, i) => i !== index));
  };

  const copiarSecuenciaAOtraFecha = async () => {
    const dest = fechaCopiarDestino.trim();
    if (!dest) {
      toast.warning('Elegí la fecha destino');
      return;
    }
    if (dest === fechaSeleccionada) {
      toast.warning('La fecha destino tiene que ser distinta a la que estás editando');
      return;
    }
    const ok = await toast.confirm(
      `¿Copiar estos ${itemsOrden.length} ejercicios al ${formatDate(dest)}? Se reemplaza lo que hubiera guardado ese día.`,
      { title: 'Copiar secuencia', confirmText: 'Copiar' }
    );
    if (!ok) return;
    try {
      await storageHybrid.planificacion.putFechaItems(dest, itemsOrden);
      toast.success(`Secuencia copiada al ${formatDate(dest)}`);
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const traerSecuenciaDesdeOtraFecha = async () => {
    const orig = fechaTraerOrigen.trim();
    if (!orig) {
      toast.warning('Elegí la fecha de origen');
      return;
    }
    try {
      const data = await storageHybrid.planificacion.getFecha(orig);
      setItemsOrden(
        (data.items || []).map((it) => ({ ejercicioId: it.ejercicioId, notas: it.notas || '' }))
      );
      toast.success(
        `Cargada la secuencia del ${formatDate(orig)}. Revisá y tocá «Guardar» para dejarla en ${formatDate(fechaSeleccionada)}.`
      );
    } catch {
      toast.error('No se pudo cargar esa fecha');
    }
  };

  const ejerciciosParaReemplazo = useMemo(() => {
    const q = busquedaReemplazo.trim().toLowerCase();
    return ejercicios.filter((ej) => {
      if (!q) return true;
      return `${ej.nombre} ${ej.descripcion || ''}`.toLowerCase().includes(q);
    });
  }, [ejercicios, busquedaReemplazo]);

  const aplicarReemplazo = (nuevoEjercicioId: string) => {
    if (modalReemplazoIdx === null) return;
    const idx = modalReemplazoIdx;
    const anterior = itemsOrden[idx]?.ejercicioId;
    setItemsOrden((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ejercicioId: nuevoEjercicioId } : row))
    );
    setModalReemplazoIdx(null);
    setBusquedaReemplazo('');
    if (nuevoEjercicioId !== anterior) {
      toast.success('Ejercicio reemplazado (guardá la secuencia para persistir)');
    }
  };

  if (!planificacionHabilitada) {
    return (
      <div className="card max-w-lg mx-auto text-center py-12">
        <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">Planificación no habilitada</h1>
        <p className="text-gray-600 text-sm">
          El administrador puede activar esta función para tu sede desde el panel admin (editar sucursal).
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-title-wrap mb-6">
        <span className="page-title-accent" aria-hidden />
        <h1 className="page-title">Planificación</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tipos y máquinas propios del estudio, ejercicios reutilizables y secuencia por fecha: cada día del calendario
          (Lunes a Sábado) puede tener su plan distinto según la semana.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {(
          [
            { id: 'catalogo' as const, label: 'Tipos y máquinas', icon: Layers },
            { id: 'ejercicios' as const, label: 'Ejercicios', icon: Dumbbell },
            { id: 'semana' as const, label: 'Por día', icon: CalendarDays },
          ] as const
        ).map((x) => {
          const Icon = x.icon;
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                tab === x.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {x.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="card text-center py-12 text-gray-500">Cargando…</div>
      ) : (
        <>
          {tab === 'catalogo' && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="card">
                <h2 className="font-semibold text-gray-900 mb-3">Tipos de ejercicio</h2>
                <p className="text-xs text-gray-500 mb-3">Ej.: fuerza, movilidad, estabilidad…</p>
                <div className="flex gap-2 mb-4">
                  <input
                    className="input-field flex-1"
                    placeholder="Nombre nuevo"
                    value={nuevoTipo}
                    onChange={(e) => setNuevoTipo(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={async () => {
                      const n = nuevoTipo.trim();
                      if (!n) return;
                      await storageHybrid.planificacion.addTipo(n);
                      setNuevoTipo('');
                      await loadAll();
                    }}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {tipos.map((t) => (
                    <li key={t.id} className="flex justify-between items-center gap-2 p-2 rounded-lg bg-gray-50 text-sm">
                      <span>{t.nombre}</span>
                      <button
                        type="button"
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        onClick={async () => {
                          await storageHybrid.planificacion.deleteTipo(t.id);
                          await loadAll();
                        }}
                        aria-label="Eliminar tipo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card">
                <h2 className="font-semibold text-gray-900 mb-3">Máquinas / aparatos</h2>
                <p className="text-xs text-gray-500 mb-3">Ej.: reformer, cadillac, silla…</p>
                <div className="flex gap-2 mb-4">
                  <input
                    className="input-field flex-1"
                    placeholder="Nombre nuevo"
                    value={nuevaMaq}
                    onChange={(e) => setNuevaMaq(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={async () => {
                      const n = nuevaMaq.trim();
                      if (!n) return;
                      await storageHybrid.planificacion.addMaquina(n);
                      setNuevaMaq('');
                      await loadAll();
                    }}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {maquinas.map((m) => (
                    <li key={m.id} className="flex justify-between items-center gap-2 p-2 rounded-lg bg-gray-50 text-sm">
                      <span>{m.nombre}</span>
                      <button
                        type="button"
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        onClick={async () => {
                          await storageHybrid.planificacion.deleteMaquina(m.id);
                          await loadAll();
                        }}
                        aria-label="Eliminar máquina"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tab === 'ejercicios' && (
            <div className="card overflow-hidden p-0">
              <div className="p-4 flex justify-between items-center flex-wrap gap-2 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Biblioteca de ejercicios</h2>
                <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => openModalEjercicio()}>
                  <Plus className="w-4 h-4" />
                  Nuevo ejercicio
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-primary-50 text-left text-xs uppercase text-gray-600">
                    <tr>
                      <th className="px-4 py-3">Nombre</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Máquinas</th>
                      <th className="px-4 py-3">Series</th>
                      <th className="px-4 py-3 w-24" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ejercicios.map((ej) => (
                      <tr key={ej.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{ej.nombre}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {tipos.find((t) => t.id === ej.tipoId)?.nombre || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{etiquetaMaquinas(ej, maquinas)}</td>
                        <td className="px-4 py-3 text-gray-700 text-xs">{resumenSeries(ej)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="text-primary-600 text-xs mr-2"
                            onClick={() => openModalEjercicio(ej)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="text-red-600 p-1 hover:bg-red-50 rounded"
                            onClick={() => void eliminarEjercicio(ej.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ejercicios.length === 0 && (
                  <p className="text-center text-gray-500 py-8">Todavía no hay ejercicios guardados.</p>
                )}
              </div>
            </div>
          )}

          {tab === 'semana' && (
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="card space-y-4">
                <h2 className="font-semibold text-gray-900">Semana (como el calendario)</h2>
                <p className="text-xs text-gray-500">
                  Cada fecha guarda su propia secuencia: el lunes de esta semana es independiente del lunes pasado. Elegí
                  el día en la grilla (Lun–Sáb) y editá a la derecha.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary inline-flex items-center gap-1 px-2 py-2"
                    onClick={() => cambiarSemana('prev')}
                    aria-label="Semana anterior"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm font-medium text-gray-800 min-w-[10rem] text-center flex-1">
                    {getRangoSemana(semanaVista)}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary inline-flex items-center gap-1 px-2 py-2"
                    onClick={() => cambiarSemana('next')}
                    aria-label="Semana siguiente"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
                {semanaVista !== getSemanaActual() && (
                  <button
                    type="button"
                    className="text-sm text-primary-600 hover:underline"
                    onClick={() => {
                      const s = getSemanaActual();
                      setSemanaVista(s);
                      const idx = getDiaSemanaCalendarioDesdeISO(fechaSeleccionada);
                      setFechaSeleccionada(getFechaFromSemanaYDia(s, idx));
                    }}
                  >
                    Ir a la semana actual
                  </button>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Otra fecha</label>
                  <input
                    type="date"
                    className="input-field max-w-[200px]"
                    value={fechaSeleccionada}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      setFechaSeleccionada(v);
                      setSemanaVista(getSemanaFromDate(parseFechaLocal(v)));
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DIAS_GRID.map((diaIndex) => {
                    const fechaIso = getFechaFromSemanaYDia(semanaVista, diaIndex);
                    const nombre = DIAS_SEMANA[diaIndex];
                    const sel = fechaIso === fechaSeleccionada;
                    const hoy = fechaIso === hoyISO();
                    return (
                      <button
                        key={fechaIso}
                        type="button"
                        onClick={() => elegirDiaGrilla(diaIndex)}
                        className={`rounded-lg border px-2 py-2 text-left text-sm transition-colors touch-manipulation ${
                          sel
                            ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-400'
                            : 'border-gray-200 bg-white hover:border-primary-300'
                        }`}
                      >
                        <span className="block font-medium text-gray-900">{nombre}</span>
                        <span className={`text-xs ${hoy ? 'text-primary-600 font-semibold' : 'text-gray-500'}`}>
                          {formatDate(fechaIso)}
                          {hoy ? ' · Hoy' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-medium text-gray-700 mb-2">Filtrar ejercicios para agregar</p>
                  <div className="flex flex-col gap-2">
                    <input
                      className="input-field"
                      placeholder="Buscar por nombre o descripción…"
                      value={busquedaEj}
                      onChange={(e) => setBusquedaEj(e.target.value)}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        className="input-field"
                        value={filtroTipoId}
                        onChange={(e) => setFiltroTipoId(e.target.value)}
                      >
                        <option value="">Todos los tipos</option>
                        {tipos.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nombre}
                          </option>
                        ))}
                      </select>
                      <select
                        className="input-field"
                        value={filtroMaquinaId}
                        onChange={(e) => setFiltroMaquinaId(e.target.value)}
                      >
                        <option value="">Todas las máquinas</option>
                        {maquinas.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 mb-1">
                    Tocá un ejercicio para sumarlo al día (misma lista que en la biblioteca).
                  </p>
                  <ul className="max-h-64 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-100">
                    {ejerciciosFiltrados.map((ej) => (
                      <li key={ej.id}>
                        <button
                          type="button"
                          onClick={() => agregarEjAlDia(ej.id)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 transition-colors"
                        >
                          <span className="font-medium text-gray-900">{ej.nombre}</span>
                          <span className="block text-xs text-gray-500 mt-0.5">
                            {tipos.find((t) => t.id === ej.tipoId)?.nombre || '—'} · {etiquetaMaquinas(ej, maquinas)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {ejerciciosFiltrados.length === 0 && (
                    <p className="text-sm text-gray-500 py-3 text-center">No hay ejercicios con este filtro.</p>
                  )}
                </div>
              </div>
              <div className="card">
                <h2 className="font-semibold text-gray-900 mb-3">Secuencia de esta fecha</h2>
                <p className="text-sm text-gray-600 mb-3">
                  <strong>
                    {etiquetaDiaCalendario(fechaSeleccionada)} · {formatDate(fechaSeleccionada)}
                  </strong>{' '}
                  — solo esta fecha. Ordená con las flechas o agregá desde la lista y guardá.
                </p>
                <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 mb-4 space-y-3">
                  <p className="text-xs font-medium text-gray-700">Copiar entre fechas</p>
                  <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 items-end">
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-xs text-gray-600 mb-1">Traer secuencia desde</label>
                      <input
                        type="date"
                        className="input-field text-sm"
                        value={fechaTraerOrigen}
                        onChange={(e) => setFechaTraerOrigen(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-secondary inline-flex items-center gap-1.5 text-sm"
                      onClick={() => void traerSecuenciaDesdeOtraFecha()}
                    >
                      <Download className="w-4 h-4" />
                      Traer al día actual
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 items-end border-t border-gray-200 pt-3">
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-xs text-gray-600 mb-1">Copiar esta secuencia a</label>
                      <input
                        type="date"
                        className="input-field text-sm"
                        value={fechaCopiarDestino}
                        onChange={(e) => setFechaCopiarDestino(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-primary inline-flex items-center gap-1.5 text-sm"
                      onClick={() => void copiarSecuenciaAOtraFecha()}
                      disabled={itemsOrden.length === 0}
                    >
                      <Copy className="w-4 h-4" />
                      Copiar (guarda allá)
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    «Traer» carga en pantalla (podés editar antes de guardar). «Copiar» escribe ya en la otra fecha.
                  </p>
                </div>
                <ol className="space-y-2 mb-4">
                  {itemsOrden.map((it, idx) => {
                    const ej = ejercicios.find((e) => e.id === it.ejercicioId);
                    return (
                      <li
                        key={`${it.ejercicioId}-${idx}`}
                        className="flex flex-wrap items-start gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100"
                      >
                        <span className="text-gray-400 text-xs w-6">{idx + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm">{ej?.nombre || '—'}</p>
                          {ej && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {tipos.find((t) => t.id === ej.tipoId)?.nombre || '—'} · {etiquetaMaquinas(ej, maquinas)} ·{' '}
                              {resumenSeries(ej)}
                            </p>
                          )}
                          <input
                            className="input-field text-xs mt-1 py-1"
                            placeholder="Notas (opcional)"
                            value={it.notas}
                            onChange={(e) => {
                              const v = e.target.value;
                              setItemsOrden((prev) =>
                                prev.map((row, i) => (i === idx ? { ...row, notas: v } : row))
                              );
                            }}
                          />
                        </div>
                        <div className="flex gap-1 items-center flex-shrink-0">
                          <button
                            type="button"
                            className="btn-secondary text-xs py-1 px-2"
                            disabled={idx === 0}
                            onClick={() =>
                              setItemsOrden((prev) => {
                                const n = [...prev];
                                [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
                                return n;
                              })
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn-secondary text-xs py-1 px-2"
                            disabled={idx >= itemsOrden.length - 1}
                            onClick={() =>
                              setItemsOrden((prev) => {
                                const n = [...prev];
                                [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]];
                                return n;
                              })
                            }
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="p-1.5 rounded text-primary-600 hover:bg-primary-50"
                            title="Reemplazar por otro ejercicio"
                            aria-label="Reemplazar ejercicio"
                            onClick={() => {
                              setBusquedaReemplazo('');
                              setModalReemplazoIdx(idx);
                            }}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className="text-red-600 p-1"
                            onClick={() => quitarItem(idx)}
                            aria-label="Quitar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => void guardarItemsDia()}>
                  Guardar secuencia de esta fecha
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showModalEj && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">{editingEj ? 'Editar ejercicio' : 'Nuevo ejercicio'}</h2>
              <button type="button" className="p-2 text-gray-400 hover:text-gray-600" onClick={() => setShowModalEj(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={guardarEjercicio} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  className="input-field"
                  required
                  value={formEj.nombre}
                  onChange={(e) => setFormEj((f) => ({ ...f, nombre: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea
                  className="input-field min-h-[72px]"
                  value={formEj.descripcion}
                  onChange={(e) => setFormEj((f) => ({ ...f, descripcion: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  className="input-field"
                  value={formEj.tipoId}
                  onChange={(e) => setFormEj((f) => ({ ...f, tipoId: e.target.value }))}
                >
                  <option value="">—</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Máquina principal</label>
                  <select
                    className="input-field"
                    value={formEj.maquinaId}
                    onChange={(e) => setFormEj((f) => ({ ...f, maquinaId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {maquinas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Máquina alternativa (opcional)
                  </label>
                  <p className="text-xs text-gray-500 mb-1">Mismo ejercicio en dos aparatos distintos.</p>
                  <select
                    className="input-field"
                    value={formEj.maquinaSecundariaId}
                    onChange={(e) => setFormEj((f) => ({ ...f, maquinaSecundariaId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {maquinas.map((m) => (
                      <option key={m.id} value={m.id} disabled={m.id === formEj.maquinaId}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Series</label>
                <div className="flex gap-4 mb-2">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={formEj.modoSeries === 'tres_iguales'}
                      onChange={() => setFormEj((f) => ({ ...f, modoSeries: 'tres_iguales' }))}
                    />
                    Varias series iguales
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={formEj.modoSeries === 'serie_1_2_3'}
                      onChange={() => setFormEj((f) => ({ ...f, modoSeries: 'serie_1_2_3' }))}
                    />
                    Serie 1, 2 y 3 distintas
                  </label>
                </div>
                {formEj.modoSeries === 'tres_iguales' ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-600">Medición</label>
                        <select
                          className="input-field"
                          value={formEj.unidad}
                          onChange={(e) =>
                            setFormEj((f) => ({
                              ...f,
                              unidad: e.target.value === 'cantidad' ? 'cantidad' : 'duracion',
                            }))
                          }
                        >
                          <option value="duracion">Duración</option>
                          <option value="cantidad">Cantidad (reps)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Nº de series</label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          className="input-field"
                          value={formEj.numSeries}
                          onChange={(e) => setFormEj((f) => ({ ...f, numSeries: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Valor (ej. 45 seg o 12 reps)</label>
                      <input
                        className="input-field"
                        value={formEj.valor}
                        onChange={(e) => setFormEj((f) => ({ ...f, valor: e.target.value }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(['s1', 's2', 's3'] as const).map((key, i) => (
                      <div key={key} className="flex flex-wrap gap-2 items-end border border-gray-100 rounded-lg p-2">
                        <span className="text-xs font-medium text-gray-500 w-full">Serie {i + 1}</span>
                        <select
                          className="input-field flex-1 min-w-[120px]"
                          value={formEj[key].unidad}
                          onChange={(e) =>
                            setFormEj((f) => ({
                              ...f,
                              [key]: {
                                ...f[key],
                                unidad: e.target.value === 'cantidad' ? 'cantidad' : 'duracion',
                              },
                            }))
                          }
                        >
                          <option value="duracion">Duración</option>
                          <option value="cantidad">Cantidad</option>
                        </select>
                        <input
                          className="input-field flex-1 min-w-[120px]"
                          placeholder="Ej. 30 seg"
                          value={formEj[key].valor}
                          onChange={(e) =>
                            setFormEj((f) => ({
                              ...f,
                              [key]: { ...f[key], valor: e.target.value },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" className="btn-secondary" onClick={() => setShowModalEj(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary inline-flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalReemplazoIdx !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">Reemplazar ejercicio</h2>
              <button
                type="button"
                className="p-2 text-gray-400 hover:text-gray-600"
                onClick={() => {
                  setModalReemplazoIdx(null);
                  setBusquedaReemplazo('');
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-hidden flex flex-col gap-3">
              <p className="text-xs text-gray-600">
                Elegí otro ejercicio de la biblioteca; se mantienen las notas de este ítem.
              </p>
              <input
                className="input-field"
                placeholder="Buscar en la biblioteca…"
                value={busquedaReemplazo}
                onChange={(e) => setBusquedaReemplazo(e.target.value)}
                autoFocus
              />
              <ul className="overflow-y-auto max-h-64 rounded-lg border border-gray-100 divide-y divide-gray-100">
                {ejerciciosParaReemplazo.map((ej) => (
                  <li key={ej.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-primary-50 transition-colors"
                      onClick={() => aplicarReemplazo(ej.id)}
                    >
                      <span className="font-medium text-gray-900">{ej.nombre}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">
                        {tipos.find((t) => t.id === ej.tipoId)?.nombre || '—'} · {etiquetaMaquinas(ej, maquinas)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {ejerciciosParaReemplazo.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-2">No hay coincidencias.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Planificacion;
