import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Save, Star, Trash2 } from 'lucide-react';
import { AgendaNota } from '../types';
import { storageHybrid } from '../utils/storage-hybrid';
import { useToast } from '../components/ToastProvider';

const DIAS_CORTOS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

function hoyISO() {
  const now = new Date();
  const tz = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

function inicioMes(fecha: Date) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

function formatMesAnio(fecha: Date) {
  return fecha.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

function formatFechaLarga(fechaISO: string) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(y, (m || 1) - 1, d || 1);
  return fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function buildCalendarDays(baseMonth: Date) {
  const firstDay = inicioMes(baseMonth);
  const day = firstDay.getDay();
  const mondayIndex = day === 0 ? 6 : day - 1;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - mondayIndex);
  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    const iso = new Date(current.getTime() - current.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    return {
      date: current,
      iso,
      isCurrentMonth: current.getMonth() === baseMonth.getMonth(),
    };
  });
}

export default function Agenda() {
  const toast = useToast();
  const [notas, setNotas] = useState<AgendaNota[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [selectedDate, setSelectedDate] = useState(hoyISO);
  const [monthCursor, setMonthCursor] = useState(() => inicioMes(new Date()));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    titulo: '',
    contenido: '',
    hora: '',
    importante: false,
  });

  const loadNotas = async () => {
    try {
      setLoading(true);
      const data = await storageHybrid.agendaNotas.getAll();
      setNotas(
        [...data].sort((a, b) =>
          a.fecha.localeCompare(b.fecha) ||
          (a.hora || '').localeCompare(b.hora || '') ||
          Number(b.importante === true) - Number(a.importante === true)
        )
      );
    } catch (error) {
      console.error('Error loading agenda notas:', error);
      toast.error('No se pudieron cargar las notas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotas();
  }, []);

  const calendarDays = useMemo(() => buildCalendarDays(monthCursor), [monthCursor]);

  const notasPorFecha = useMemo(() => {
    const map = new Map<string, AgendaNota[]>();
    notas.forEach((nota) => {
      const list = map.get(nota.fecha) || [];
      list.push(nota);
      map.set(nota.fecha, list);
    });
    return map;
  }, [notas]);

  const notasDelDia = useMemo(() => {
    return [...(notasPorFecha.get(selectedDate) || [])].sort((a, b) =>
      Number(b.importante === true) - Number(a.importante === true) ||
      (a.hora || '').localeCompare(b.hora || '') ||
      b.createdAt.localeCompare(a.createdAt)
    );
  }, [notasPorFecha, selectedDate]);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      titulo: '',
      contenido: '',
      hora: '',
      importante: false,
    });
  };

  const handleSave = async () => {
    if (!form.titulo.trim()) {
      toast.warning('Escribí un título para la nota.');
      return;
    }

    try {
      setGuardando(true);
      if (editingId) {
        await storageHybrid.agendaNotas.update(editingId, {
          titulo: form.titulo.trim(),
          contenido: form.contenido.trim(),
          fecha: selectedDate,
          hora: form.hora || '',
          importante: form.importante,
        });
        toast.success('Nota actualizada.');
      } else {
        await storageHybrid.agendaNotas.add({
          id: Date.now().toString(),
          titulo: form.titulo.trim(),
          contenido: form.contenido.trim(),
          fecha: selectedDate,
          hora: form.hora || '',
          importante: form.importante,
          createdAt: new Date().toISOString(),
        });
        toast.success('Nota agregada.');
      }
      await loadNotas();
      resetForm();
    } catch (error) {
      console.error('Error saving agenda nota:', error);
      toast.error('No se pudo guardar la nota.');
    } finally {
      setGuardando(false);
    }
  };

  const handleEdit = (nota: AgendaNota) => {
    setSelectedDate(nota.fecha);
    const [y, m] = nota.fecha.split('-').map(Number);
    setMonthCursor(new Date(y, (m || 1) - 1, 1));
    setEditingId(nota.id);
    setForm({
      titulo: nota.titulo,
      contenido: nota.contenido || '',
      hora: nota.hora || '',
      importante: nota.importante === true,
    });
  };

  const handleDelete = async (nota: AgendaNota) => {
    const ok = await toast.confirm(`¿Querés eliminar "${nota.titulo}"?`, {
      title: 'Eliminar nota',
      confirmText: 'Eliminar',
    });
    if (!ok) return;
    try {
      await storageHybrid.agendaNotas.delete(nota.id);
      await loadNotas();
      if (editingId === nota.id) resetForm();
      toast.success('Nota eliminada.');
    } catch (error) {
      console.error('Error deleting agenda nota:', error);
      toast.error('No se pudo eliminar la nota.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary-100 text-primary-600">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <h1 className="page-title text-xl sm:text-2xl font-semibold text-gray-800">Agenda</h1>
            <p className="text-sm text-gray-500">Notas importantes, recordatorios y pendientes del estudio</p>
          </div>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="btn-secondary flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Nueva nota
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.95fr]">
        <div className="card">
          <div className="flex items-center justify-between gap-3 mb-4">
            <button
              type="button"
              onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 capitalize">{formatMesAnio(monthCursor)}</h2>
            <button
              type="button"
              onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2">
            {DIAS_CORTOS.map((dia) => (
              <div key={dia} className="text-center text-xs font-semibold text-gray-500 py-2">
                {dia}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day) => {
              const count = notasPorFecha.get(day.iso)?.length || 0;
              const hasImportant = (notasPorFecha.get(day.iso) || []).some((nota) => nota.importante === true);
              const isSelected = day.iso === selectedDate;
              const isToday = day.iso === hoyISO();
              return (
                <button
                  key={day.iso}
                  type="button"
                  onClick={() => setSelectedDate(day.iso)}
                  className={`min-h-[78px] rounded-xl border p-2 text-left transition-colors ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50'
                      : day.isCurrentMonth
                        ? 'border-gray-200 bg-white hover:border-primary-300'
                        : 'border-gray-100 bg-gray-50 text-gray-400'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-sm font-semibold ${isToday ? 'text-primary-600' : ''}`}>
                      {day.date.getDate()}
                    </span>
                    {hasImportant && <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />}
                  </div>
                  {count > 0 && (
                    <div className="mt-3 inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                      {count} nota{count === 1 ? '' : 's'}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900 capitalize">{formatFechaLarga(selectedDate)}</h2>
                <p className="text-sm text-gray-500">{notasDelDia.length} nota{notasDelDia.length === 1 ? '' : 's'} en esta fecha</p>
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  const [y, m] = e.target.value.split('-').map(Number);
                  setMonthCursor(new Date(y, (m || 1) - 1, 1));
                }}
                className="input-field w-auto"
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                <input
                  type="text"
                  value={form.titulo}
                  onChange={(e) => setForm((prev) => ({ ...prev, titulo: e.target.value }))}
                  className="input-field"
                  placeholder="Ej: Llamar al service de reformers"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                  <input
                    type="time"
                    value={form.hora}
                    onChange={(e) => setForm((prev) => ({ ...prev, hora: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <label className="flex items-center gap-2 mt-7 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.importante}
                    onChange={(e) => setForm((prev) => ({ ...prev, importante: e.target.checked }))}
                    className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Marcar como importante</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nota</label>
                <textarea
                  value={form.contenido}
                  onChange={(e) => setForm((prev) => ({ ...prev, contenido: e.target.value }))}
                  className="input-field min-h-[110px]"
                  placeholder="Recordatorio, tarea, aviso interno..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={guardando}
                  className="btn-primary flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {guardando ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Agregar nota'}
                </button>
                {editingId && (
                  <button type="button" onClick={resetForm} className="btn-secondary">
                    Cancelar edición
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-base font-bold text-gray-900 mb-4">Notas del día</h3>
            {loading ? (
              <p className="text-sm text-gray-500">Cargando notas...</p>
            ) : notasDelDia.length === 0 ? (
              <p className="text-sm text-gray-500">No hay notas para esta fecha.</p>
            ) : (
              <div className="space-y-3">
                {notasDelDia.map((nota) => (
                  <div
                    key={nota.id}
                    className={`rounded-xl border p-4 ${nota.importante ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-gray-900">{nota.titulo}</h4>
                          {nota.importante && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                              Importante
                            </span>
                          )}
                          {nota.hora && (
                            <span className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                              {nota.hora}
                            </span>
                          )}
                        </div>
                        {nota.contenido && (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2">{nota.contenido}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(nota)}
                          className="text-sm text-primary-600 hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(nota)}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                          aria-label="Eliminar nota"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
