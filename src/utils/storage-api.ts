import { Alumno, Actividad, Pago, Turno, Gasto, Asistencia, Profesor, RegistroLink } from '../types';

const getBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = getBase() + path;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T;
  return res.json();
}

export const storageApi = {
  alumnos: {
    getAll: (): Promise<Alumno[]> => request<Alumno[]>('/api/alumnos'),
    add: (alumno: Alumno): Promise<void> =>
      request('/api/alumnos', { method: 'POST', body: JSON.stringify(alumno) }),
    update: (id: string, updates: Partial<Alumno>): Promise<void> =>
      request(`/api/alumnos/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    delete: (id: string): Promise<void> => request(`/api/alumnos/${id}`, { method: 'DELETE' }),
    findByDni: async (dni: string): Promise<Alumno | undefined> => {
      const data = await request<Alumno | null>(`/api/alumnos/findByDni?dni=${encodeURIComponent(dni)}`);
      return data ?? undefined;
    },
  },
  registroLink: {
    getAll: (): Promise<RegistroLink[]> => request<RegistroLink[]>('/api/registro-link'),
    submit: (data: {
      nombre: string;
      apellido: string;
      dni: string;
      telefono: string;
      email: string;
      actividadId?: string;
    }): Promise<{ ok: boolean; id: string }> =>
      request('/api/registro-link', { method: 'POST', body: JSON.stringify(data) }),
    agregarAlumno: (id: string): Promise<{ ok: boolean; alumnoId: string }> =>
      request(`/api/registro-link/${id}/agregar`, { method: 'POST' }),
    delete: (id: string): Promise<void> =>
      request(`/api/registro-link/${id}`, { method: 'DELETE' }),
  },
  actividades: {
    getAll: (): Promise<Actividad[]> => request<Actividad[]>('/api/actividades'),
    getById: async (id: string): Promise<Actividad | undefined> => {
      try {
        return await request<Actividad>(`/api/actividades/${id}`);
      } catch {
        return undefined;
      }
    },
    add: (actividad: Actividad): Promise<void> =>
      request('/api/actividades', { method: 'POST', body: JSON.stringify(actividad) }),
    update: (id: string, updates: Partial<Actividad>): Promise<void> =>
      request(`/api/actividades/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    delete: (id: string): Promise<void> => request(`/api/actividades/${id}`, { method: 'DELETE' }),
  },
  pagos: {
    getAll: (): Promise<Pago[]> => request<Pago[]>('/api/pagos'),
    add: (pago: Pago): Promise<void> =>
      request('/api/pagos', { method: 'POST', body: JSON.stringify(pago) }),
    getByAlumnoId: (alumnoId: string): Promise<Pago[]> =>
      request<Pago[]>(`/api/pagos/by-alumno/${alumnoId}`),
  },
  gastos: {
    getAll: (): Promise<Gasto[]> => request<Gasto[]>('/api/gastos'),
    add: (gasto: Gasto): Promise<void> =>
      request('/api/gastos', { method: 'POST', body: JSON.stringify(gasto) }),
    update: (id: string, updates: Partial<Gasto>): Promise<void> =>
      request(`/api/gastos/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    delete: (id: string): Promise<void> => request(`/api/gastos/${id}`, { method: 'DELETE' }),
  },
  profesores: {
    getAll: (): Promise<Profesor[]> => request<Profesor[]>('/api/profesores'),
    getById: async (id: string): Promise<Profesor | undefined> => {
      const list = await request<Profesor[]>('/api/profesores');
      return list.find((p) => p.id === id);
    },
    add: (profesor: Profesor): Promise<void> =>
      request('/api/profesores', { method: 'POST', body: JSON.stringify(profesor) }),
    update: (id: string, updates: Partial<Profesor>): Promise<void> =>
      request(`/api/profesores/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    delete: (id: string): Promise<void> => request(`/api/profesores/${id}`, { method: 'DELETE' }),
  },
  turnos: {
    getAll: (): Promise<Turno[]> => request<Turno[]>('/api/turnos'),
    add: (turno: Turno): Promise<void> =>
      request('/api/turnos', { method: 'POST', body: JSON.stringify(turno) }),
    update: (id: string, updates: Partial<Turno>): Promise<void> =>
      request(`/api/turnos/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    delete: (id: string): Promise<void> => request(`/api/turnos/${id}`, { method: 'DELETE' }),
    findByDiaSemana: (diaSemana: number): Promise<Turno[]> =>
      request<Turno[]>(`/api/turnos/by-dia/${diaSemana}`),
    findByDiaSemanaYHora: async (diaSemana: number, hora: string): Promise<Turno | undefined> => {
      const data = await request<Turno | null>(
        `/api/turnos/by-dia-hora?diaSemana=${diaSemana}&hora=${encodeURIComponent(hora)}`
      );
      return data ?? undefined;
    },
    getByAlumnoId: (alumnoId: string): Promise<Turno[]> =>
      request<Turno[]>(`/api/turnos/by-alumno/${alumnoId}`),
  },
  asistencias: {
    getAll: (): Promise<Asistencia[]> => request<Asistencia[]>('/api/asistencias'),
    getBySemana: (semana: string): Promise<Asistencia[]> =>
      request<Asistencia[]>(`/api/asistencias/by-semana/${encodeURIComponent(semana)}`),
    findByTurnoYAlumno: async (
      turnoId: string,
      alumnoId: string,
      semana: string
    ): Promise<Asistencia | undefined> => {
      const list = await request<Asistencia[]>(`/api/asistencias/by-semana/${encodeURIComponent(semana)}`);
      return list.find((a) => a.turnoId === turnoId && a.alumnoId === alumnoId);
    },
    add: (asistencia: Asistencia): Promise<void> =>
      request('/api/asistencias', { method: 'POST', body: JSON.stringify(asistencia) }),
    update: (id: string, updates: Partial<Asistencia>): Promise<void> =>
      request(`/api/asistencias/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    delete: (id: string): Promise<void> => request(`/api/asistencias/${id}`, { method: 'DELETE' }),
    deleteBySemana: (semana: string): Promise<void> =>
      request(`/api/asistencias/by-semana/${encodeURIComponent(semana)}`, { method: 'DELETE' }),
  },
};
