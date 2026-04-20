import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  X,
  Save,
  ClipboardList,
  Dumbbell,
  Layers,
  ListOrdered,
} from 'lucide-react';
import {
  PlanificacionEjercicio,
  PlanificacionMaquina,
  PlanificacionPlan,
  PlanificacionTipoEjercicio,
  SerieDetallePlan,
} from '../types';
import { storageHybrid } from '../utils/storage-hybrid';
import { useToast } from '../components/ToastProvider';
import { useAuth } from '../contexts/AuthContext';

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
  const [tab, setTab] = useState<'catalogo' | 'ejercicios' | 'planes'>('catalogo');
  const [tipos, setTipos] = useState<PlanificacionTipoEjercicio[]>([]);
  const [maquinas, setMaquinas] = useState<PlanificacionMaquina[]>([]);
  const [ejercicios, setEjercicios] = useState<PlanificacionEjercicio[]>([]);
  const [planes, setPlanes] = useState<PlanificacionPlan[]>([]);
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
    modoSeries: 'tres_iguales' as 'tres_iguales' | 'serie_1_2_3',
    unidad: 'duracion' as 'duracion' | 'cantidad',
    valor: '',
    numSeries: '3',
    s1: emptySerie(),
    s2: emptySerie(),
    s3: emptySerie(),
  });
  const [planSeleccionado, setPlanSeleccionado] = useState<PlanificacionPlan | null>(null);
  const [nuevoPlanNombre, setNuevoPlanNombre] = useState('');
  const [itemsOrden, setItemsOrden] = useState<{ ejercicioId: string; notas: string }[]>([]);

  const loadAll = useCallback(async () => {
    if (!planificacionHabilitada) return;
    try {
      setLoading(true);
      const [t, m, e, p] = await Promise.all([
        storageHybrid.planificacion.getTipos(),
        storageHybrid.planificacion.getMaquinas(),
        storageHybrid.planificacion.getEjercicios(),
        storageHybrid.planificacion.getPlanes(),
      ]);
      setTipos(t);
      setMaquinas(m);
      setEjercicios(e);
      setPlanes(p);
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

  const openModalEjercicio = (ej?: PlanificacionEjercicio) => {
    if (ej) {
      setEditingEj(ej);
      const sd = ej.seriesDetalle;
      setFormEj({
        nombre: ej.nombre,
        descripcion: ej.descripcion || '',
        tipoId: ej.tipoId || '',
        maquinaId: ej.maquinaId || '',
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

  const crearPlan = async () => {
    const n = nuevoPlanNombre.trim();
    if (!n) {
      toast.warning('Nombre del plan');
      return;
    }
    try {
      await storageHybrid.planificacion.addPlan({ nombre: n });
      setNuevoPlanNombre('');
      await loadAll();
      toast.success('Plan creado');
    } catch {
      toast.error('No se pudo crear el plan');
    }
  };

  const abrirPlan = async (p: PlanificacionPlan) => {
    try {
      const full = await storageHybrid.planificacion.getPlanById(p.id);
      setPlanSeleccionado(full);
      setItemsOrden(
        (full.items || []).map((it) => ({ ejercicioId: it.ejercicioId, notas: it.notas || '' }))
      );
    } catch {
      toast.error('No se pudo abrir el plan');
    }
  };

  const guardarItemsPlan = async () => {
    if (!planSeleccionado) return;
    try {
      await storageHybrid.planificacion.putPlanItems(planSeleccionado.id, itemsOrden);
      toast.success('Orden guardado');
      await loadAll();
      const full = await storageHybrid.planificacion.getPlanById(planSeleccionado.id);
      setPlanSeleccionado(full);
    } catch {
      toast.error('No se pudo guardar el orden');
    }
  };

  const agregarEjAlPlan = (ejercicioId: string) => {
    if (itemsOrden.some((x) => x.ejercicioId === ejercicioId)) {
      toast.warning('Ese ejercicio ya está en el plan');
      return;
    }
    setItemsOrden((prev) => [...prev, { ejercicioId, notas: '' }]);
  };

  const quitarItem = (index: number) => {
    setItemsOrden((prev) => prev.filter((_, i) => i !== index));
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
          Tipos y máquinas propios del estudio, ejercicios reutilizables y planes de clase ordenados.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {(
          [
            { id: 'catalogo' as const, label: 'Tipos y máquinas', icon: Layers },
            { id: 'ejercicios' as const, label: 'Ejercicios', icon: Dumbbell },
            { id: 'planes' as const, label: 'Planes', icon: ListOrdered },
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
                      <th className="px-4 py-3">Máquina</th>
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
                        <td className="px-4 py-3 text-gray-600">
                          {maquinas.find((m) => m.id === ej.maquinaId)?.nombre || '—'}
                        </td>
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

          {tab === 'planes' && (
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="card">
                <h2 className="font-semibold text-gray-900 mb-3">Planes de clase</h2>
                <div className="flex gap-2 mb-4">
                  <input
                    className="input-field flex-1"
                    placeholder="Nombre del plan (ej. Clase mat lunes)"
                    value={nuevoPlanNombre}
                    onChange={(e) => setNuevoPlanNombre(e.target.value)}
                  />
                  <button type="button" className="btn-primary" onClick={() => void crearPlan()}>
                    Crear
                  </button>
                </div>
                <ul className="space-y-2">
                  {planes.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => void abrirPlan(p)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          planSeleccionado?.id === p.id
                            ? 'border-primary-400 bg-primary-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <span className="font-medium text-gray-900">{p.nombre}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {planes.length === 0 && <p className="text-gray-500 text-sm">Creá un plan para armar la secuencia.</p>}
              </div>
              <div className="card">
                <h2 className="font-semibold text-gray-900 mb-3">Contenido del plan</h2>
                {!planSeleccionado ? (
                  <p className="text-gray-500 text-sm">Elegí un plan a la izquierda.</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-600 mb-3">
                      <strong>{planSeleccionado.nombre}</strong> — arrastrá el orden con los botones o agregá desde la lista.
                    </p>
                    <p className="text-xs font-medium text-gray-700 mb-2">Agregar ejercicio</p>
                    <select
                      className="input-field mb-4"
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) {
                          agregarEjAlPlan(v);
                          e.target.value = '';
                        }
                      }}
                    >
                      <option value="">Seleccionar ejercicio guardado…</option>
                      {ejercicios.map((ej) => (
                        <option key={ej.id} value={ej.id}>
                          {ej.nombre}
                        </option>
                      ))}
                    </select>
                    <ol className="space-y-2 mb-4">
                      {itemsOrden.map((it, idx) => (
                        <li
                          key={`${it.ejercicioId}-${idx}`}
                          className="flex flex-wrap items-start gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100"
                        >
                          <span className="text-gray-400 text-xs w-6">{idx + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-sm">
                              {ejercicios.find((e) => e.id === it.ejercicioId)?.nombre || '—'}
                            </p>
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
                          <div className="flex gap-1">
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
                              className="text-red-600 p-1"
                              onClick={() => quitarItem(idx)}
                              aria-label="Quitar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => void guardarItemsPlan()}>
                      Guardar orden del plan
                    </button>
                  </>
                )}
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
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Máquina</label>
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
    </div>
  );
};

export default Planificacion;
