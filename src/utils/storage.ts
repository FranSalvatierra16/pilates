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
} from '../types';
import { getFechaFromSemanaYDia } from './date';

const STORAGE_KEYS = {
  alumnos: 'savia_alumnos',
  actividades: 'savia_actividades',
  pagos: 'savia_pagos',
  turnos: 'savia_turnos',
  gastos: 'savia_gastos',
  asistencias: 'savia_asistencias',
  profesores: 'savia_profesores',
  recuperaciones: 'savia_recuperaciones',
  liberacionesSemana: 'savia_liberaciones_semana',
  inscripcionesTurno: 'savia_inscripciones_turno',
  cierresCaja: 'savia_cierres_caja',
  agendaNotas: 'savia_agenda_notas',
  planifTipos: 'savia_planif_tipos',
  planifMaquinas: 'savia_planif_maquinas',
  planifEjercicios: 'savia_planif_ejercicios',
  planifPlanes: 'savia_planif_planes',
  planifPlanItems: 'savia_planif_plan_items',
  planifDiaItems: 'savia_planif_dia_items',
  planifCalNotas: 'savia_planif_cal_notas',
} as const;

export const storage = {
  alumnos: {
    getAll: (): Alumno[] => {
      const data = localStorage.getItem(STORAGE_KEYS.alumnos);
      return data ? JSON.parse(data) : [];
    },
    save: (alumnos: Alumno[]): void => {
      localStorage.setItem(STORAGE_KEYS.alumnos, JSON.stringify(alumnos));
    },
    add: (alumno: Alumno): void => {
      const alumnos = storage.alumnos.getAll();
      alumnos.push({ ...alumno, activo: alumno.activo !== false });
      storage.alumnos.save(alumnos);
    },
    update: (id: string, updates: Partial<Alumno>): void => {
      const alumnos = storage.alumnos.getAll();
      const index = alumnos.findIndex(a => a.id === id);
      if (index !== -1) {
        alumnos[index] = { ...alumnos[index], ...updates };
        storage.alumnos.save(alumnos);
      }
    },
    delete: (id: string): void => {
      const alumnos = storage.alumnos.getAll().map(a => a.id === id ? { ...a, activo: false } : a);
      storage.alumnos.save(alumnos);
    },
    findByDni: (dni: string): Alumno | undefined => {
      return storage.alumnos.getAll().find(a => a.dni === dni && a.activo !== false);
    },
    getAsistencias: (alumnoId: string): AsistenciaHistorialItem[] => {
      const asis = storage.asistencias.getAll().filter(a => a.alumnoId === alumnoId && a.estado !== null);
      const turnos = storage.turnos.getAll();
      return asis.map(a => {
        const t = turnos.find(x => x.id === a.turnoId);
        const diaSemana = t?.diaSemana ?? 0;
        const hora = t?.hora ?? '';
        const titulo = t?.titulo ?? 'Clase';
        const fecha = getFechaFromSemanaYDia(a.semana, diaSemana);
        return { id: a.id, turnoId: a.turnoId, semana: a.semana, diaSemana, hora, titulo, fecha, estado: a.estado!, createdAt: a.createdAt };
      }).sort((x, y) => new Date(y.fecha).getTime() - new Date(x.fecha).getTime()).slice(0, 200);
    },
  },
  
  actividades: {
    getAll: (): Actividad[] => {
      const data = localStorage.getItem(STORAGE_KEYS.actividades);
      return data ? JSON.parse(data) : [];
    },
    save: (actividades: Actividad[]): void => {
      localStorage.setItem(STORAGE_KEYS.actividades, JSON.stringify(actividades));
    },
    add: (actividad: Actividad): void => {
      const actividades = storage.actividades.getAll();
      actividades.push(actividad);
      storage.actividades.save(actividades);
    },
    update: (id: string, updates: Partial<Actividad>): void => {
      const actividades = storage.actividades.getAll();
      const index = actividades.findIndex(a => a.id === id);
      if (index !== -1) {
        actividades[index] = { ...actividades[index], ...updates };
        storage.actividades.save(actividades);
      }
    },
    delete: (id: string): void => {
      const actividades = storage.actividades.getAll().filter(a => a.id !== id);
      storage.actividades.save(actividades);
    },
    getById: (id: string): Actividad | undefined => {
      return storage.actividades.getAll().find(a => a.id === id);
    },
  },
  
  pagos: {
    getAll: (): Pago[] => {
      const data = localStorage.getItem(STORAGE_KEYS.pagos);
      return data ? JSON.parse(data) : [];
    },
    save: (pagos: Pago[]): void => {
      localStorage.setItem(STORAGE_KEYS.pagos, JSON.stringify(pagos));
    },
    add: (pago: Pago): void => {
      const pagos = storage.pagos.getAll();
      pagos.push(pago);
      storage.pagos.save(pagos);
    },
    getByAlumnoId: (alumnoId: string): Pago[] => {
      return storage.pagos.getAll().filter(p => p.alumnoId === alumnoId);
    },
    delete: (id: string): void => {
      const pagos = storage.pagos.getAll().filter(p => p.id !== id);
      storage.pagos.save(pagos);
    },
  },
  
  turnos: {
    getAll: (): Turno[] => {
      const data = localStorage.getItem(STORAGE_KEYS.turnos);
      return data ? JSON.parse(data) : [];
    },
    save: (turnos: Turno[]): void => {
      localStorage.setItem(STORAGE_KEYS.turnos, JSON.stringify(turnos));
    },
    add: (turno: Turno): void => {
      const turnos = storage.turnos.getAll();
      turnos.push(turno);
      storage.turnos.save(turnos);
    },
    update: (id: string, updates: Partial<Turno>): void => {
      const turnos = storage.turnos.getAll();
      const index = turnos.findIndex(t => t.id === id);
      if (index !== -1) {
        turnos[index] = { ...turnos[index], ...updates };
        storage.turnos.save(turnos);
      }
    },
    delete: (id: string): void => {
      const turnos = storage.turnos.getAll().filter(t => t.id !== id);
      storage.turnos.save(turnos);
    },
    findByDiaSemana: (diaSemana: number): Turno[] => {
      return storage.turnos.getAll().filter(t => t.diaSemana === diaSemana);
    },
    findByDiaSemanaYHora: (diaSemana: number, hora: string): Turno | undefined => {
      return storage.turnos.getAll().find(t => t.diaSemana === diaSemana && t.hora === hora);
    },
    getByAlumnoId: (alumnoId: string): Turno[] => {
      return storage.turnos.getAll().filter(t => t.alumnoIds.includes(alumnoId));
    },
  },
  
  gastos: {
    getAll: (): Gasto[] => {
      const data = localStorage.getItem(STORAGE_KEYS.gastos);
      return data ? JSON.parse(data) : [];
    },
    save: (gastos: Gasto[]): void => {
      localStorage.setItem(STORAGE_KEYS.gastos, JSON.stringify(gastos));
    },
    add: (gasto: Gasto): void => {
      const gastos = storage.gastos.getAll();
      gastos.push(gasto);
      storage.gastos.save(gastos);
    },
    update: (id: string, updates: Partial<Gasto>): void => {
      const gastos = storage.gastos.getAll();
      const index = gastos.findIndex(g => g.id === id);
      if (index !== -1) {
        gastos[index] = { ...gastos[index], ...updates };
        storage.gastos.save(gastos);
      }
    },
    delete: (id: string): void => {
      const gastos = storage.gastos.getAll().filter(g => g.id !== id);
      storage.gastos.save(gastos);
    },
  },
  
  asistencias: {
    getAll: (): Asistencia[] => {
      const data = localStorage.getItem(STORAGE_KEYS.asistencias);
      return data ? JSON.parse(data) : [];
    },
    save: (asistencias: Asistencia[]): void => {
      localStorage.setItem(STORAGE_KEYS.asistencias, JSON.stringify(asistencias));
    },
    add: (asistencia: Asistencia): void => {
      const asistencias = storage.asistencias.getAll();
      asistencias.push(asistencia);
      storage.asistencias.save(asistencias);
    },
    update: (id: string, updates: Partial<Asistencia>): void => {
      const asistencias = storage.asistencias.getAll();
      const index = asistencias.findIndex(a => a.id === id);
      if (index !== -1) {
        asistencias[index] = { ...asistencias[index], ...updates };
        storage.asistencias.save(asistencias);
      }
    },
    delete: (id: string): void => {
      const asistencias = storage.asistencias.getAll().filter(a => a.id !== id);
      storage.asistencias.save(asistencias);
    },
    findByTurnoYAlumno: (turnoId: string, alumnoId: string, semana: string): Asistencia | undefined => {
      return storage.asistencias.getAll().find(
        a => a.turnoId === turnoId && a.alumnoId === alumnoId && a.semana === semana
      );
    },
    getBySemana: (semana: string): Asistencia[] => {
      return storage.asistencias.getAll().filter(a => a.semana === semana);
    },
    deleteBySemana: (semana: string): void => {
      const asistencias = storage.asistencias.getAll().filter(a => a.semana !== semana);
      storage.asistencias.save(asistencias);
    },
  },
  
  profesores: {
    getAll: (): Profesor[] => {
      const data = localStorage.getItem(STORAGE_KEYS.profesores);
      return data ? JSON.parse(data) : [];
    },
    save: (profesores: Profesor[]): void => {
      localStorage.setItem(STORAGE_KEYS.profesores, JSON.stringify(profesores));
    },
    add: (profesor: Profesor): void => {
      const profesores = storage.profesores.getAll();
      profesores.push(profesor);
      storage.profesores.save(profesores);
    },
    update: (id: string, updates: Partial<Profesor>): void => {
      const profesores = storage.profesores.getAll();
      const index = profesores.findIndex(p => p.id === id);
      if (index !== -1) {
        profesores[index] = { ...profesores[index], ...updates };
        storage.profesores.save(profesores);
      }
    },
    delete: (id: string): void => {
      const profesores = storage.profesores.getAll().filter(p => p.id !== id);
      storage.profesores.save(profesores);
    },
    getById: (id: string): Profesor | undefined => {
      return storage.profesores.getAll().find(p => p.id === id);
    },
  },

  recuperaciones: {
    getAll: (): Recuperacion[] => {
      const data = localStorage.getItem(STORAGE_KEYS.recuperaciones);
      return data ? JSON.parse(data) : [];
    },
    save: (recuperaciones: Recuperacion[]): void => {
      localStorage.setItem(STORAGE_KEYS.recuperaciones, JSON.stringify(recuperaciones));
    },
    getBySemana: (semana: string): Recuperacion[] => {
      return storage.recuperaciones.getAll().filter(r => r.semana === semana);
    },
    add: (recuperacion: Recuperacion): void => {
      const list = storage.recuperaciones.getAll();
      list.push(recuperacion);
      storage.recuperaciones.save(list);
    },
    delete: (id: string): void => {
      const list = storage.recuperaciones.getAll().filter(r => r.id !== id);
      storage.recuperaciones.save(list);
    },
    deleteBySemana: (semana: string): void => {
      const list = storage.recuperaciones.getAll().filter(r => r.semana !== semana);
      storage.recuperaciones.save(list);
    },
  },

  liberacionesSemana: {
    getAll: (): LiberacionSemana[] => {
      const data = localStorage.getItem(STORAGE_KEYS.liberacionesSemana);
      return data ? JSON.parse(data) : [];
    },
    save: (list: LiberacionSemana[]): void => {
      localStorage.setItem(STORAGE_KEYS.liberacionesSemana, JSON.stringify(list));
    },
    getBySemana: (semana: string): LiberacionSemana[] => {
      return storage.liberacionesSemana.getAll().filter((item) => item.semana === semana);
    },
    add: (item: LiberacionSemana): void => {
      const list = storage.liberacionesSemana.getAll();
      list.push(item);
      storage.liberacionesSemana.save(list);
    },
    delete: (id: string): void => {
      const list = storage.liberacionesSemana.getAll().filter((item) => item.id !== id);
      storage.liberacionesSemana.save(list);
    },
  },

  inscripcionesTurno: {
    getAll: (): InscripcionTurno[] => {
      const data = localStorage.getItem(STORAGE_KEYS.inscripcionesTurno);
      return data ? JSON.parse(data) : [];
    },
    save: (list: InscripcionTurno[]): void => {
      localStorage.setItem(STORAGE_KEYS.inscripcionesTurno, JSON.stringify(list));
    },
    add: (insc: InscripcionTurno): void => {
      const list = storage.inscripcionesTurno.getAll();
      list.push(insc);
      storage.inscripcionesTurno.save(list);
    },
    deleteByTurnoYAlumno: (turnoId: string, alumnoId: string): void => {
      const list = storage.inscripcionesTurno.getAll().filter(
        i => !(i.turnoId === turnoId && i.alumnoId === alumnoId)
      );
      storage.inscripcionesTurno.save(list);
    },
  },

  cierresCaja: {
    getAll: (): CierreCaja[] => {
      const data = localStorage.getItem(STORAGE_KEYS.cierresCaja);
      return data ? JSON.parse(data) : [];
    },
    save: (cierres: CierreCaja[]): void => {
      localStorage.setItem(STORAGE_KEYS.cierresCaja, JSON.stringify(cierres));
    },
    add: (cierre: CierreCaja): void => {
      const list = storage.cierresCaja.getAll();
      list.push(cierre);
      storage.cierresCaja.save(list);
    },
    getById: (id: string): CierreCaja | undefined => {
      return storage.cierresCaja.getAll().find((c) => c.id === id);
    },
  },

  agendaNotas: {
    getAll: (): AgendaNota[] => {
      const data = localStorage.getItem(STORAGE_KEYS.agendaNotas);
      return data ? JSON.parse(data) : [];
    },
    save: (notas: AgendaNota[]): void => {
      localStorage.setItem(STORAGE_KEYS.agendaNotas, JSON.stringify(notas));
    },
    add: (nota: AgendaNota): void => {
      const notas = storage.agendaNotas.getAll();
      notas.push(nota);
      storage.agendaNotas.save(notas);
    },
    update: (id: string, updates: Partial<AgendaNota>): void => {
      const notas = storage.agendaNotas.getAll();
      const index = notas.findIndex((n) => n.id === id);
      if (index !== -1) {
        notas[index] = { ...notas[index], ...updates };
        storage.agendaNotas.save(notas);
      }
    },
    delete: (id: string): void => {
      const notas = storage.agendaNotas.getAll().filter((n) => n.id !== id);
      storage.agendaNotas.save(notas);
    },
  },

  planificacion: {
    getTipos: (): PlanificacionTipoEjercicio[] => {
      const data = localStorage.getItem(STORAGE_KEYS.planifTipos);
      return data ? JSON.parse(data) : [];
    },
    saveTipos: (rows: PlanificacionTipoEjercicio[]): void => {
      localStorage.setItem(STORAGE_KEYS.planifTipos, JSON.stringify(rows));
    },
    getMaquinas: (): PlanificacionMaquina[] => {
      const data = localStorage.getItem(STORAGE_KEYS.planifMaquinas);
      return data ? JSON.parse(data) : [];
    },
    saveMaquinas: (rows: PlanificacionMaquina[]): void => {
      localStorage.setItem(STORAGE_KEYS.planifMaquinas, JSON.stringify(rows));
    },
    getEjercicios: (): PlanificacionEjercicio[] => {
      const data = localStorage.getItem(STORAGE_KEYS.planifEjercicios);
      if (!data) return [];
      const arr = JSON.parse(data) as PlanificacionEjercicio[];
      return arr.map((e) => ({
        ...e,
        maquinaSecundariaId: e.maquinaSecundariaId ?? null,
      }));
    },
    saveEjercicios: (rows: PlanificacionEjercicio[]): void => {
      localStorage.setItem(STORAGE_KEYS.planifEjercicios, JSON.stringify(rows));
    },
    getPlanes: (): PlanificacionPlan[] => {
      const data = localStorage.getItem(STORAGE_KEYS.planifPlanes);
      return data ? JSON.parse(data) : [];
    },
    savePlanes: (rows: PlanificacionPlan[]): void => {
      localStorage.setItem(STORAGE_KEYS.planifPlanes, JSON.stringify(rows));
    },
    getItemsMap: (): Record<string, PlanificacionPlanItem[]> => {
      const data = localStorage.getItem(STORAGE_KEYS.planifPlanItems);
      return data ? JSON.parse(data) : {};
    },
    saveItemsMap: (m: Record<string, PlanificacionPlanItem[]>): void => {
      localStorage.setItem(STORAGE_KEYS.planifPlanItems, JSON.stringify(m));
    },
    getDiaItemsMap: (): Record<string, PlanificacionDiaItem[]> => {
      const data = localStorage.getItem(STORAGE_KEYS.planifDiaItems);
      if (!data) return {};
      const raw = JSON.parse(data) as Record<string, PlanificacionDiaItem[]>;
      const out: Record<string, PlanificacionDiaItem[]> = {};
      for (const [k, items] of Object.entries(raw)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
        out[k] = (items || []).map((it, orden) => ({
          ...it,
          fecha: it.fecha || k,
          orden: typeof it.orden === 'number' ? it.orden : orden,
        }));
      }
      return out;
    },
    saveDiaItemsMap: (m: Record<string, PlanificacionDiaItem[]>): void => {
      localStorage.setItem(STORAGE_KEYS.planifDiaItems, JSON.stringify(m));
    },
    /** Notas por fecha YYYY-MM-DD (solo modo local / sin API). */
    getCalendarioNotasMap: (): Record<string, string> => {
      const data = localStorage.getItem(STORAGE_KEYS.planifCalNotas);
      if (!data) return {};
      try {
        const raw = JSON.parse(data) as Record<string, string>;
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === 'string') out[k] = v;
        }
        return out;
      } catch {
        return {};
      }
    },
    saveCalendarioNotasMap: (m: Record<string, string>): void => {
      localStorage.setItem(STORAGE_KEYS.planifCalNotas, JSON.stringify(m));
    },
  },
};

