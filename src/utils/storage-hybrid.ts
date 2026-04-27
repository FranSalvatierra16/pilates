import {
  Alumno,
  Actividad,
  Pago,
  Turno,
  Gasto,
  Asistencia,
  Profesor,
  Recuperacion,
  AsistenciaHistorialItem,
  InscripcionTurno,
  CierreCaja,
  AgendaNota,
  LiberacionSemana,
  PlanificacionTipoEjercicio,
  PlanificacionMaquina,
  PlanificacionEjercicio,
  PlanificacionPlan,
  PlanificacionPlanItem,
  PlanificacionDiaItem,
  FinanzasEstado,
} from '../types';
import { buildCierreRetiro } from './cierre-caja';
import { horaActualInput } from './date';
import { storage } from './storage';
import { storageSupabase } from './storage-supabase';
import { storageApi } from './storage-api';
import * as finanzasLocal from './finanzas-local';
import { clearFinanzasSession, getFinanzasExpiresAtMs } from './finanzas-session';

// En producción usamos la API por defecto (así funciona aunque Docker no reciba VITE_USE_API)
const useApi = () => {
  if (import.meta.env.VITE_USE_API === 'false') return false;
  if (import.meta.env.VITE_USE_API === 'true') return true;
  return import.meta.env.PROD;
};

const useSupabase = () => {
  if (useApi()) return false;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return !!(url && url.length > 0 && key && key.length > 0);
};

const backend = () => (useApi() ? storageApi : useSupabase() ? storageSupabase : null);

export const storageHybrid = {
  alumnos: {
    getAll: async (includeInactive = false): Promise<Alumno[]> => {
      const b = backend();
      if (b) return await b.alumnos.getAll(includeInactive);
      const all = storage.alumnos.getAll();
      return includeInactive ? all : all.filter((a) => a.activo !== false);
    },
    add: async (alumno: Alumno): Promise<void> => {
      const b = backend();
      if (b) await b.alumnos.add(alumno);
      else storage.alumnos.add(alumno);
    },
    update: async (id: string, updates: Partial<Alumno>): Promise<void> => {
      const b = backend();
      if (b) await b.alumnos.update(id, updates);
      else storage.alumnos.update(id, updates);
    },
    delete: async (id: string): Promise<void> => {
      const b = backend();
      if (b) await b.alumnos.delete(id);
      else storage.alumnos.delete(id);
    },
    findByDni: async (dni: string): Promise<Alumno | undefined> => {
      const b = backend();
      if (b) return await b.alumnos.findByDni(dni);
      return storage.alumnos.findByDni(dni);
    },
    getAsistencias: async (alumnoId: string): Promise<AsistenciaHistorialItem[]> => {
      if (useApi()) return await storageApi.alumnos.getAsistencias(alumnoId);
      return storage.alumnos.getAsistencias(alumnoId);
    },
  },

  actividades: {
    getAll: async (): Promise<Actividad[]> => {
      const b = backend();
      if (b) return await b.actividades.getAll();
      return storage.actividades.getAll();
    },
    add: async (actividad: Actividad): Promise<void> => {
      const b = backend();
      if (b) await b.actividades.add(actividad);
      else storage.actividades.add(actividad);
    },
    update: async (id: string, updates: Partial<Actividad>): Promise<void> => {
      const b = backend();
      if (b) await b.actividades.update(id, updates);
      else storage.actividades.update(id, updates);
    },
    delete: async (id: string): Promise<void> => {
      const b = backend();
      if (b) await b.actividades.delete(id);
      else storage.actividades.delete(id);
    },
    getById: async (id: string): Promise<Actividad | undefined> => {
      const b = backend();
      if (b) return await b.actividades.getById(id);
      return storage.actividades.getById(id);
    },
  },

  pagos: {
    getAll: async (): Promise<Pago[]> => {
      const b = backend();
      if (b) return await b.pagos.getAll();
      let all = storage.pagos.getAll();
      if (finanzasLocal.finanzasLocalRestringido()) {
        all = finanzasLocal.filtrarPagosHoyLocal(all);
      }
      return all;
    },
    add: async (pago: Pago): Promise<void> => {
      const b = backend();
      if (b) await b.pagos.add(pago);
      else storage.pagos.add(pago);
    },
    getByAlumnoId: async (alumnoId: string): Promise<Pago[]> => {
      const b = backend();
      if (b) return await b.pagos.getByAlumnoId(alumnoId);
      return storage.pagos.getByAlumnoId(alumnoId);
    },
    delete: async (id: string): Promise<void> => {
      const b = backend();
      if (b) await b.pagos.delete(id);
      else storage.pagos.delete(id);
    },
  },

  gastos: {
    getAll: async (): Promise<Gasto[]> => {
      const b = backend();
      if (b) return await b.gastos.getAll();
      if (finanzasLocal.finanzasLocalRestringido()) return [];
      return storage.gastos.getAll();
    },
    add: async (gasto: Gasto): Promise<void> => {
      const b = backend();
      if (b) await b.gastos.add(gasto);
      else storage.gastos.add(gasto);
    },
    update: async (id: string, updates: Partial<Gasto>): Promise<void> => {
      const b = backend();
      if (b) await b.gastos.update(id, updates);
      else storage.gastos.update(id, updates);
    },
    delete: async (id: string): Promise<void> => {
      const b = backend();
      if (b) await b.gastos.delete(id);
      else storage.gastos.delete(id);
    },
  },

  cierresCaja: {
    getAll: async (): Promise<CierreCaja[]> => {
      if (useApi()) return storageApi.cierresCaja.getAll();
      if (finanzasLocal.finanzasLocalRestringido()) return [];
      return storage.cierresCaja.getAll();
    },
    getById: async (id: string): Promise<CierreCaja | undefined> => {
      if (useApi()) return storageApi.cierresCaja.getById(id);
      if (finanzasLocal.finanzasLocalRestringido()) return undefined;
      return storage.cierresCaja.getById(id);
    },
    crear: async (input: {
      descripcion: string;
      fecha: string;
      montoRetirado: number;
      horaCierre?: string;
    }): Promise<CierreCaja> => {
      if (useApi()) return storageApi.cierresCaja.create(input);
      const [pagos, gastos, existentes] = await Promise.all([
        storageHybrid.pagos.getAll(),
        storageHybrid.gastos.getAll(),
        storage.cierresCaja.getAll(),
      ]);
      const cierre = buildCierreRetiro(
        input.descripcion,
        input.fecha,
        input.horaCierre ?? horaActualInput(),
        input.montoRetirado,
        pagos,
        gastos,
        existentes
      );
      storage.cierresCaja.add(cierre);
      return cierre;
    },
  },

  finanzas: {
    getEstado: async (): Promise<FinanzasEstado> => {
      if (useApi()) return storageApi.finanzas.getEstado();
      return finanzasLocal.getEstadoLocal();
    },
    desbloquear: async (pin: string): Promise<void> => {
      if (useApi()) {
        await storageApi.finanzas.desbloquear(pin);
        return;
      }
      await finanzasLocal.desbloquearLocal(pin);
    },
    bloquearSesion: (): void => {
      clearFinanzasSession();
      finanzasLocal.clearUnlockLocal();
    },
    getUnlockExpiryMs: (): number | null => {
      if (useApi()) return getFinanzasExpiresAtMs();
      return finanzasLocal.getUnlockUntilMs();
    },
    crearPin: async (body: { pin: string; pinConfirm: string; autoBloqueoMinutos: number }): Promise<void> => {
      if (useApi()) {
        await storageApi.finanzas.crearPin(body);
        return;
      }
      await finanzasLocal.crearPinLocal(body.pin, body.pinConfirm, body.autoBloqueoMinutos);
    },
    actualizarPin: async (body: {
      pinActual: string;
      pin?: string;
      pinConfirm?: string;
      autoBloqueoMinutos?: number;
    }): Promise<void> => {
      if (useApi()) {
        await storageApi.finanzas.actualizarPin(body);
        return;
      }
      await finanzasLocal.cambiarPinLocal(body);
    },
    actualizarSoloAuto: async (autoBloqueoMinutos: number): Promise<void> => {
      if (useApi()) {
        await storageApi.finanzas.actualizarPin({ autoBloqueoMinutos });
        return;
      }
      finanzasLocal.actualizarSoloAutoLocal(autoBloqueoMinutos);
    },
    quitarPin: async (pinActual: string): Promise<void> => {
      if (useApi()) {
        await storageApi.finanzas.quitarPin(pinActual);
        return;
      }
      await finanzasLocal.quitarPinLocal(pinActual);
    },
  },

  agendaNotas: {
    getAll: async (): Promise<AgendaNota[]> => {
      if (useApi()) return storageApi.agendaNotas.getAll();
      const b: any = backend();
      if (b?.agendaNotas) return await b.agendaNotas.getAll();
      return storage.agendaNotas.getAll();
    },
    add: async (nota: AgendaNota): Promise<void> => {
      if (useApi()) await storageApi.agendaNotas.add(nota);
      else {
        const b: any = backend();
        if (b?.agendaNotas) await b.agendaNotas.add(nota);
        else storage.agendaNotas.add(nota);
      }
    },
    update: async (id: string, updates: Partial<AgendaNota>): Promise<void> => {
      if (useApi()) await storageApi.agendaNotas.update(id, updates);
      else {
        const b: any = backend();
        if (b?.agendaNotas) await b.agendaNotas.update(id, updates);
        else storage.agendaNotas.update(id, updates);
      }
    },
    delete: async (id: string): Promise<void> => {
      if (useApi()) await storageApi.agendaNotas.delete(id);
      else {
        const b: any = backend();
        if (b?.agendaNotas) await b.agendaNotas.delete(id);
        else storage.agendaNotas.delete(id);
      }
    },
  },

  turnos: {
    getAll: async (): Promise<Turno[]> => {
      const b = backend();
      if (b) return await b.turnos.getAll();
      return storage.turnos.getAll();
    },
    add: async (turno: Turno): Promise<void> => {
      const b = backend();
      if (b) await b.turnos.add(turno);
      else storage.turnos.add(turno);
    },
    update: async (id: string, updates: Partial<Turno>): Promise<void> => {
      const b = backend();
      if (b) await b.turnos.update(id, updates);
      else storage.turnos.update(id, updates);
    },
    delete: async (id: string): Promise<void> => {
      const b = backend();
      if (b) await b.turnos.delete(id);
      else storage.turnos.delete(id);
    },
    findByDiaSemana: async (diaSemana: number): Promise<Turno[]> => {
      const b = backend();
      if (b) return await b.turnos.findByDiaSemana(diaSemana);
      return storage.turnos.findByDiaSemana(diaSemana);
    },
    findByDiaSemanaYHora: async (diaSemana: number, hora: string): Promise<Turno | undefined> => {
      const b = backend();
      if (b) return await b.turnos.findByDiaSemanaYHora(diaSemana, hora);
      return storage.turnos.findByDiaSemanaYHora(diaSemana, hora);
    },
    getByAlumnoId: async (alumnoId: string): Promise<Turno[]> => {
      const b = backend();
      if (b) return await b.turnos.getByAlumnoId(alumnoId);
      return storage.turnos.getByAlumnoId(alumnoId);
    },
    ajustarCupo: async (): Promise<{ turnosActualizados: number; alumnosEliminados: number }> => {
      if (useApi()) return await storageApi.turnos.ajustarCupo();
      const todos = storage.turnos.getAll();
      let turnosActualizados = 0;
      let alumnosEliminados = 0;
      const cupo = 6;
      for (const t of todos) {
        const max = (t as Turno & { cupo?: number }).cupo ?? cupo;
        if (t.alumnoIds.length > max) {
          storage.turnos.update(t.id, { alumnoIds: t.alumnoIds.slice(0, max) });
          turnosActualizados++;
          alumnosEliminados += t.alumnoIds.length - max;
        }
      }
      return { turnosActualizados, alumnosEliminados };
    },
  },

  profesores: {
    getAll: async (): Promise<Profesor[]> => {
      if (useApi()) return await storageApi.profesores.getAll();
      return storage.profesores.getAll();
    },
    getById: async (id: string): Promise<Profesor | undefined> => {
      if (useApi()) return await storageApi.profesores.getById(id);
      return storage.profesores.getById(id);
    },
    add: async (profesor: Profesor): Promise<void> => {
      if (useApi()) await storageApi.profesores.add(profesor);
      else storage.profesores.add(profesor);
    },
    update: async (id: string, updates: Partial<Profesor>): Promise<void> => {
      if (useApi()) await storageApi.profesores.update(id, updates);
      else storage.profesores.update(id, updates);
    },
    delete: async (id: string): Promise<void> => {
      if (useApi()) await storageApi.profesores.delete(id);
      else storage.profesores.delete(id);
    },
  },

  asistencias: {
    getAll: async (): Promise<Asistencia[]> => {
      if (useApi()) return await storageApi.asistencias.getAll();
      return storage.asistencias.getAll();
    },
    getBySemana: async (semana: string): Promise<Asistencia[]> => {
      if (useApi()) return await storageApi.asistencias.getBySemana(semana);
      return storage.asistencias.getBySemana(semana);
    },
    findByTurnoYAlumno: async (
      turnoId: string,
      alumnoId: string,
      semana: string
    ): Promise<Asistencia | undefined> => {
      if (useApi()) return await storageApi.asistencias.findByTurnoYAlumno(turnoId, alumnoId, semana);
      return storage.asistencias.findByTurnoYAlumno(turnoId, alumnoId, semana);
    },
    add: async (asistencia: Asistencia): Promise<void> => {
      if (useApi()) await storageApi.asistencias.add(asistencia);
      else storage.asistencias.add(asistencia);
    },
    update: async (id: string, updates: Partial<Asistencia>): Promise<void> => {
      if (useApi()) await storageApi.asistencias.update(id, updates);
      else storage.asistencias.update(id, updates);
    },
    delete: async (id: string): Promise<void> => {
      if (useApi()) await storageApi.asistencias.delete(id);
      else storage.asistencias.delete(id);
    },
    deleteBySemana: async (semana: string): Promise<void> => {
      if (useApi()) await storageApi.asistencias.deleteBySemana(semana);
      else storage.asistencias.deleteBySemana(semana);
    },
  },

  recuperaciones: {
    getBySemana: async (semana: string): Promise<Recuperacion[]> => {
      if (useApi()) return await storageApi.recuperaciones.getBySemana(semana);
      return storage.recuperaciones.getBySemana(semana);
    },
    add: async (recuperacion: Recuperacion): Promise<void> => {
      if (useApi()) await storageApi.recuperaciones.add(recuperacion);
      else storage.recuperaciones.add(recuperacion);
    },
    delete: async (id: string): Promise<void> => {
      if (useApi()) await storageApi.recuperaciones.delete(id);
      else storage.recuperaciones.delete(id);
    },
    deleteBySemana: async (semana: string): Promise<void> => {
      if (useApi()) await storageApi.recuperaciones.deleteBySemana(semana);
      else storage.recuperaciones.deleteBySemana(semana);
    },
  },

  liberacionesSemana: {
    getBySemana: async (semana: string): Promise<LiberacionSemana[]> => {
      if (useApi()) return await storageApi.liberacionesSemana.getBySemana(semana);
      return storage.liberacionesSemana.getBySemana(semana);
    },
    add: async (item: LiberacionSemana): Promise<void> => {
      if (useApi()) await storageApi.liberacionesSemana.add({ turnoId: item.turnoId, alumnoId: item.alumnoId, semana: item.semana });
      else storage.liberacionesSemana.add(item);
    },
    delete: async (id: string): Promise<void> => {
      if (useApi()) await storageApi.liberacionesSemana.delete(id);
      else storage.liberacionesSemana.delete(id);
    },
  },

  inscripcionesTurno: {
    getAll: async (): Promise<InscripcionTurno[]> => {
      if (useApi()) return await storageApi.inscripcionesTurno.getAll();
      return storage.inscripcionesTurno.getAll();
    },
    add: async (insc: InscripcionTurno): Promise<void> => {
      if (useApi()) await storageApi.inscripcionesTurno.add(insc);
      else storage.inscripcionesTurno.add(insc);
    },
    deleteByTurnoYAlumno: async (turnoId: string, alumnoId: string): Promise<void> => {
      if (useApi()) await storageApi.inscripcionesTurno.deleteByTurnoYAlumno(turnoId, alumnoId);
      else storage.inscripcionesTurno.deleteByTurnoYAlumno(turnoId, alumnoId);
    },
  },

  planificacion: {
    getTipos: async (): Promise<PlanificacionTipoEjercicio[]> => {
      if (useApi()) return storageApi.planificacion.getTipos();
      return storage.planificacion.getTipos();
    },
    addTipo: async (nombre: string): Promise<PlanificacionTipoEjercicio> => {
      if (useApi()) return storageApi.planificacion.addTipo(nombre);
      const row: PlanificacionTipoEjercicio = {
        id: `pt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        nombre: nombre.trim(),
        createdAt: new Date().toISOString(),
      };
      const list = storage.planificacion.getTipos();
      list.push(row);
      storage.planificacion.saveTipos(list);
      return row;
    },
    deleteTipo: async (id: string): Promise<void> => {
      if (useApi()) return storageApi.planificacion.deleteTipo(id);
      storage.planificacion.saveTipos(storage.planificacion.getTipos().filter((t) => t.id !== id));
    },
    getMaquinas: async (): Promise<PlanificacionMaquina[]> => {
      if (useApi()) return storageApi.planificacion.getMaquinas();
      return storage.planificacion.getMaquinas();
    },
    addMaquina: async (nombre: string): Promise<PlanificacionMaquina> => {
      if (useApi()) return storageApi.planificacion.addMaquina(nombre);
      const row: PlanificacionMaquina = {
        id: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        nombre: nombre.trim(),
        createdAt: new Date().toISOString(),
      };
      const list = storage.planificacion.getMaquinas();
      list.push(row);
      storage.planificacion.saveMaquinas(list);
      return row;
    },
    deleteMaquina: async (id: string): Promise<void> => {
      if (useApi()) return storageApi.planificacion.deleteMaquina(id);
      storage.planificacion.saveMaquinas(storage.planificacion.getMaquinas().filter((m) => m.id !== id));
    },
    getEjercicios: async (): Promise<PlanificacionEjercicio[]> => {
      if (useApi()) return storageApi.planificacion.getEjercicios();
      return storage.planificacion.getEjercicios();
    },
    addEjercicio: async (
      body: Partial<PlanificacionEjercicio> & { nombre: string }
    ): Promise<PlanificacionEjercicio> => {
      if (useApi()) return storageApi.planificacion.addEjercicio(body);
      const modo = body.modoSeries === 'serie_1_2_3' ? 'serie_1_2_3' : 'tres_iguales';
      const row: PlanificacionEjercicio = {
        id: `pe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        nombre: body.nombre.trim(),
        descripcion: (body.descripcion || '').trim(),
        tipoId: body.tipoId ?? null,
        maquinaId: body.maquinaId ?? null,
        maquinaSecundariaId: body.maquinaSecundariaId ?? null,
        modoSeries: modo,
        unidad: modo === 'tres_iguales' ? (body.unidad === 'cantidad' ? 'cantidad' : 'duracion') : null,
        valor: modo === 'tres_iguales' ? String(body.valor || '').trim() : null,
        numSeries: modo === 'tres_iguales' ? Math.min(10, Math.max(1, Number(body.numSeries) || 3)) : 3,
        seriesDetalle:
          modo === 'serie_1_2_3' && Array.isArray(body.seriesDetalle) && body.seriesDetalle.length === 3
            ? body.seriesDetalle.map((x) => ({
                unidad: x.unidad === 'cantidad' ? 'cantidad' : 'duracion',
                valor: String(x.valor || '').trim(),
              }))
            : null,
        createdAt: new Date().toISOString(),
      };
      const list = storage.planificacion.getEjercicios();
      list.push(row);
      storage.planificacion.saveEjercicios(list);
      return row;
    },
    updateEjercicio: async (id: string, body: Partial<PlanificacionEjercicio>): Promise<PlanificacionEjercicio> => {
      if (useApi()) return storageApi.planificacion.updateEjercicio(id, body);
      const list = storage.planificacion.getEjercicios();
      const i = list.findIndex((e) => e.id === id);
      if (i === -1) throw new Error('No encontrado');
      list[i] = { ...list[i], ...body, id: list[i].id, createdAt: list[i].createdAt };
      storage.planificacion.saveEjercicios(list);
      return list[i];
    },
    deleteEjercicio: async (id: string): Promise<void> => {
      if (useApi()) return storageApi.planificacion.deleteEjercicio(id);
      storage.planificacion.saveEjercicios(storage.planificacion.getEjercicios().filter((e) => e.id !== id));
    },
    getPlanes: async (): Promise<PlanificacionPlan[]> => {
      if (useApi()) return storageApi.planificacion.getPlanes();
      return storage.planificacion.getPlanes();
    },
    getPlanById: async (id: string): Promise<PlanificacionPlan> => {
      if (useApi()) return storageApi.planificacion.getPlanById(id);
      const planes = storage.planificacion.getPlanes();
      const p = planes.find((x) => x.id === id);
      if (!p) throw new Error('No encontrado');
      const ej = storage.planificacion.getEjercicios();
      const map = storage.planificacion.getItemsMap();
      const raw = (map[id] || []).slice().sort((a, b) => a.orden - b.orden);
      const items: PlanificacionPlanItem[] = raw.map((it) => ({
        ...it,
        ejercicioNombre: ej.find((e) => e.id === it.ejercicioId)?.nombre || '—',
      }));
      return { ...p, items };
    },
    addPlan: async (body: { nombre: string; descripcion?: string }): Promise<PlanificacionPlan> => {
      if (useApi()) return storageApi.planificacion.addPlan(body);
      const row: PlanificacionPlan = {
        id: `pp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        nombre: body.nombre.trim(),
        descripcion: (body.descripcion || '').trim(),
        createdAt: new Date().toISOString(),
      };
      const list = storage.planificacion.getPlanes();
      list.push(row);
      storage.planificacion.savePlanes(list);
      return row;
    },
    updatePlan: async (id: string, body: { nombre?: string; descripcion?: string }): Promise<PlanificacionPlan> => {
      if (useApi()) return storageApi.planificacion.updatePlan(id, body);
      const list = storage.planificacion.getPlanes();
      const i = list.findIndex((p) => p.id === id);
      if (i === -1) throw new Error('No encontrado');
      list[i] = {
        ...list[i],
        nombre: body.nombre !== undefined ? body.nombre.trim() : list[i].nombre,
        descripcion: body.descripcion !== undefined ? body.descripcion.trim() : list[i].descripcion,
      };
      storage.planificacion.savePlanes(list);
      return list[i];
    },
    deletePlan: async (id: string): Promise<void> => {
      if (useApi()) return storageApi.planificacion.deletePlan(id);
      storage.planificacion.savePlanes(storage.planificacion.getPlanes().filter((p) => p.id !== id));
      const m = storage.planificacion.getItemsMap();
      delete m[id];
      storage.planificacion.saveItemsMap(m);
    },
    putPlanItems: async (
      planId: string,
      items: { ejercicioId: string; notas?: string }[]
    ): Promise<{ items: PlanificacionPlan['items'] }> => {
      if (useApi()) return storageApi.planificacion.putPlanItems(planId, items);
      const ej = storage.planificacion.getEjercicios();
      const out: PlanificacionPlanItem[] = [];
      items.forEach((it, orden) => {
        if (!ej.some((e) => e.id === it.ejercicioId)) return;
        out.push({
          id: `pi-${planId}-${orden}-${Date.now()}`,
          planId,
          orden,
          ejercicioId: it.ejercicioId,
          notas: (it.notas || '').trim(),
          ejercicioNombre: ej.find((e) => e.id === it.ejercicioId)?.nombre,
        });
      });
      const m = storage.planificacion.getItemsMap();
      m[planId] = out;
      storage.planificacion.saveItemsMap(m);
      return { items: out };
    },
    getFecha: async (fecha: string): Promise<{ fecha: string; items: PlanificacionDiaItem[] }> => {
      if (useApi()) return storageApi.planificacion.getFecha(fecha);
      const m = storage.planificacion.getDiaItemsMap();
      const raw = (m[fecha] || []).slice().sort((a, b) => a.orden - b.orden);
      const ejList = storage.planificacion.getEjercicios();
      return {
        fecha,
        items: raw.map((it) => ({
          ...it,
          fecha: it.fecha || fecha,
          ejercicioNombre: ejList.find((e) => e.id === it.ejercicioId)?.nombre || '—',
        })),
      };
    },
    putFechaItems: async (
      fecha: string,
      items: { ejercicioId: string; notas?: string }[]
    ): Promise<{ items: PlanificacionDiaItem[] }> => {
      if (useApi()) return storageApi.planificacion.putFechaItems(fecha, items);
      const ejList = storage.planificacion.getEjercicios();
      const out: PlanificacionDiaItem[] = [];
      items.forEach((it, orden) => {
        if (!ejList.some((e) => e.id === it.ejercicioId)) return;
        out.push({
          id: `di-${fecha}-${orden}-${Math.random().toString(36).slice(2, 9)}`,
          fecha,
          orden,
          ejercicioId: it.ejercicioId,
          notas: (it.notas || '').trim(),
          ejercicioNombre: ejList.find((e) => e.id === it.ejercicioId)?.nombre,
        });
      });
      const m = storage.planificacion.getDiaItemsMap();
      m[fecha] = out;
      storage.planificacion.saveDiaItemsMap(m);
      return { items: out };
    },
    getCalendarioNotasRango: async (desde: string, hasta: string): Promise<Record<string, string>> => {
      if (useApi()) return storageApi.planificacion.getCalendarioNotasRango(desde, hasta);
      const all = storage.planificacion.getCalendarioNotasMap();
      const out: Record<string, string> = {};
      const [y1, m1, d1] = desde.split('-').map(Number);
      const [y2, m2, d2] = hasta.split('-').map(Number);
      const cur = new Date(y1, m1 - 1, d1);
      const end = new Date(y2, m2 - 1, d2);
      while (cur <= end) {
        const k = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        if (all[k]) out[k] = all[k];
        cur.setDate(cur.getDate() + 1);
      }
      return out;
    },
    putCalendarioNota: async (fecha: string, texto: string): Promise<void> => {
      if (useApi()) return storageApi.planificacion.putCalendarioNota(fecha, texto);
      const all = { ...storage.planificacion.getCalendarioNotasMap() };
      const t = texto.trim();
      if (!t) delete all[fecha];
      else all[fecha] = texto;
      storage.planificacion.saveCalendarioNotasMap(all);
    },
  },
};
