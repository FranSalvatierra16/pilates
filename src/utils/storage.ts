import { Alumno, Actividad, Pago, Turno, Gasto } from '../types';

const STORAGE_KEYS = {
  alumnos: 'savia_alumnos',
  actividades: 'savia_actividades',
  pagos: 'savia_pagos',
  turnos: 'savia_turnos',
  gastos: 'savia_gastos',
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
      alumnos.push(alumno);
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
      const alumnos = storage.alumnos.getAll().filter(a => a.id !== id);
      storage.alumnos.save(alumnos);
    },
    findByDni: (dni: string): Alumno | undefined => {
      return storage.alumnos.getAll().find(a => a.dni === dni);
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
};

