import {
  Alumno,
  Actividad,
  Pago,
  Turno,
  Gasto,
  Asistencia,
  AsistenciaHistorialItem,
  Profesor,
  RegistroLink,
  Sucursal,
  HorariosSucursal,
  Recuperacion,
  InscripcionTurno,
  CierreCaja,
  AgendaNota,
  LiberacionSemana,
  PlanificacionTipoEjercicio,
  PlanificacionMaquina,
  PlanificacionEjercicio,
  PlanificacionPlan,
  PlanificacionDiaItem,
  FinanzasEstado,
} from '../types';
import { clearFinanzasSession, getFinanzasToken, setFinanzasSession } from './finanzas-session';

const getBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

function getAuthHeaders(): Record<string, string> {
  const token = authToken ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('savia_token') : null);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const ft = getFinanzasToken();
  if (ft) headers['X-Finanzas-Token'] = ft;
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = getBase() + path;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...options?.headers },
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
    getAll: (includeInactive = false): Promise<Alumno[]> =>
      request<Alumno[]>(`/api/alumnos${includeInactive ? '?includeInactive=1' : ''}`),
    add: (alumno: Alumno): Promise<void> =>
      request('/api/alumnos', { method: 'POST', body: JSON.stringify(alumno) }),
    update: (id: string, updates: Partial<Alumno>): Promise<void> =>
      request(`/api/alumnos/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    delete: (id: string): Promise<void> => request(`/api/alumnos/${id}`, { method: 'DELETE' }),
    findByDni: async (dni: string): Promise<Alumno | undefined> => {
      const data = await request<Alumno | null>(`/api/alumnos/findByDni?dni=${encodeURIComponent(dni)}`);
      return data ?? undefined;
    },
    getAsistencias: (alumnoId: string): Promise<AsistenciaHistorialItem[]> =>
      request<AsistenciaHistorialItem[]>(`/api/alumnos/${encodeURIComponent(alumnoId)}/asistencias`),
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
    delete: (id: string): Promise<void> => request(`/api/pagos/${id}`, { method: 'DELETE' }),
  },
  gastos: {
    getAll: (): Promise<Gasto[]> => request<Gasto[]>('/api/gastos'),
    add: (gasto: Gasto): Promise<void> =>
      request('/api/gastos', { method: 'POST', body: JSON.stringify(gasto) }),
    update: (id: string, updates: Partial<Gasto>): Promise<void> =>
      request(`/api/gastos/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    delete: (id: string): Promise<void> => request(`/api/gastos/${id}`, { method: 'DELETE' }),
  },
  cierresCaja: {
    getAll: (): Promise<CierreCaja[]> => request<CierreCaja[]>('/api/cierres-caja'),
    getById: async (id: string): Promise<CierreCaja | undefined> => {
      try {
        return await request<CierreCaja>(`/api/cierres-caja/${encodeURIComponent(id)}`);
      } catch {
        return undefined;
      }
    },
    create: (body: {
      descripcion: string;
      fecha: string;
      montoRetirado: number;
      horaCierre?: string;
    }): Promise<CierreCaja> =>
      request<CierreCaja>('/api/cierres-caja', { method: 'POST', body: JSON.stringify(body) }),
  },
  agendaNotas: {
    getAll: (): Promise<AgendaNota[]> => request<AgendaNota[]>('/api/agenda-notas'),
    add: (nota: AgendaNota): Promise<void> =>
      request('/api/agenda-notas', { method: 'POST', body: JSON.stringify(nota) }),
    update: (id: string, updates: Partial<AgendaNota>): Promise<void> =>
      request(`/api/agenda-notas/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    delete: (id: string): Promise<void> => request(`/api/agenda-notas/${encodeURIComponent(id)}`, { method: 'DELETE' }),
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
  recuperaciones: {
    getBySemana: (semana: string): Promise<Recuperacion[]> =>
      request<Recuperacion[]>(`/api/recuperaciones/by-semana/${encodeURIComponent(semana)}`),
    add: (recuperacion: Recuperacion): Promise<void> =>
      request('/api/recuperaciones', { method: 'POST', body: JSON.stringify(recuperacion) }),
    delete: (id: string): Promise<void> => request(`/api/recuperaciones/${id}`, { method: 'DELETE' }),
    deleteBySemana: (semana: string): Promise<void> =>
      request(`/api/recuperaciones/by-semana/${encodeURIComponent(semana)}`, { method: 'DELETE' }),
  },
  liberacionesSemana: {
    getBySemana: (semana: string): Promise<LiberacionSemana[]> =>
      request<LiberacionSemana[]>(`/api/liberaciones-semana/by-semana/${encodeURIComponent(semana)}`),
    add: (body: { turnoId: string; alumnoId: string; semana: string }): Promise<LiberacionSemana> =>
      request<LiberacionSemana>('/api/liberaciones-semana', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: string): Promise<void> =>
      request(`/api/liberaciones-semana/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  inscripcionesTurno: {
    getAll: (): Promise<InscripcionTurno[]> => request<InscripcionTurno[]>('/api/inscripciones-turno'),
    add: (insc: InscripcionTurno): Promise<void> =>
      request('/api/inscripciones-turno', { method: 'POST', body: JSON.stringify(insc) }),
    deleteByTurnoYAlumno: (turnoId: string, alumnoId: string): Promise<void> =>
      request(`/api/inscripciones-turno/${encodeURIComponent(turnoId)}/${encodeURIComponent(alumnoId)}`, { method: 'DELETE' }),
  },
  sucursal: {
    getHorarios: (): Promise<HorariosSucursal> => request<HorariosSucursal>('/api/sucursal/horarios'),
    getCierresCalendarioRango: (desde: string, hasta: string): Promise<{ fecha: string; cerrarTodo: boolean; horasCerradas: string[] }[]> =>
      request(
        `/api/sucursal/cierres-calendario?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`
      ),
    putCierreCalendario: (body: {
      fecha: string;
      semana: string;
      cerrarTodo: boolean;
      horasCerradas: string[];
    }): Promise<{ ok: boolean; creditosOtorgados?: number; turnosNuevosCerrados?: number }> =>
      request('/api/sucursal/cierres-calendario', { method: 'PUT', body: JSON.stringify(body) }),
    deleteCierreCalendario: (fecha: string): Promise<{ ok: boolean }> =>
      request(`/api/sucursal/cierres-calendario/${encodeURIComponent(fecha)}`, { method: 'DELETE' }),
    updateHorarios: (data: {
      horaInicioManana?: string;
      horaFinManana?: string;
      horaInicioTarde?: string;
      horaFinTarde?: string;
      horariosNoDisponiblesPorDia?: Record<number, string[]>;
      minutosAntesAnotarseClase?: number;
      minutosAntesLiberarClase?: number;
    }): Promise<void> =>
      request('/api/sucursal/horarios', { method: 'PATCH', body: JSON.stringify(data) }),
    getFeatures: (): Promise<{ planificacionHabilitada: boolean }> =>
      request('/api/sucursal/features'),
  },
  finanzas: {
    getEstado: (): Promise<FinanzasEstado> => request<FinanzasEstado>('/api/sucursal/finanzas/estado'),
    desbloquear: async (pin: string): Promise<{ token: string; expiresAt: number }> => {
      const r = await request<{ token: string; expiresAt: number }>('/api/sucursal/finanzas/desbloquear', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      setFinanzasSession(r.token, r.expiresAt);
      return r;
    },
    crearPin: (body: { pin: string; pinConfirm: string; autoBloqueoMinutos: number }): Promise<void> =>
      request('/api/sucursal/finanzas/pin', { method: 'POST', body: JSON.stringify(body) }),
    actualizarPin: (body: {
      pinActual?: string;
      pin?: string;
      pinConfirm?: string;
      autoBloqueoMinutos?: number;
    }): Promise<void> =>
      request('/api/sucursal/finanzas/pin', { method: 'PATCH', body: JSON.stringify(body) }),
    quitarPin: async (pinActual: string): Promise<void> => {
      await request('/api/sucursal/finanzas/pin', {
        method: 'DELETE',
        body: JSON.stringify({ pinActual }),
      });
      clearFinanzasSession();
    },
    bloquearSesion: (): void => clearFinanzasSession(),
  },
  planificacion: {
    getTipos: (): Promise<PlanificacionTipoEjercicio[]> => request('/api/planificacion/tipos'),
    addTipo: (nombre: string): Promise<PlanificacionTipoEjercicio> =>
      request('/api/planificacion/tipos', { method: 'POST', body: JSON.stringify({ nombre }) }),
    deleteTipo: (id: string): Promise<void> =>
      request(`/api/planificacion/tipos/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    getMaquinas: (): Promise<PlanificacionMaquina[]> => request('/api/planificacion/maquinas'),
    addMaquina: (nombre: string): Promise<PlanificacionMaquina> =>
      request('/api/planificacion/maquinas', { method: 'POST', body: JSON.stringify({ nombre }) }),
    deleteMaquina: (id: string): Promise<void> =>
      request(`/api/planificacion/maquinas/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    getEjercicios: (): Promise<PlanificacionEjercicio[]> => request('/api/planificacion/ejercicios'),
    addEjercicio: (body: Partial<PlanificacionEjercicio> & { nombre: string }): Promise<PlanificacionEjercicio> =>
      request('/api/planificacion/ejercicios', { method: 'POST', body: JSON.stringify(body) }),
    updateEjercicio: (id: string, body: Partial<PlanificacionEjercicio>): Promise<PlanificacionEjercicio> =>
      request(`/api/planificacion/ejercicios/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deleteEjercicio: (id: string): Promise<void> =>
      request(`/api/planificacion/ejercicios/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    getPlanes: (): Promise<PlanificacionPlan[]> => request('/api/planificacion/planes'),
    getPlanById: (id: string): Promise<PlanificacionPlan> =>
      request(`/api/planificacion/planes/${encodeURIComponent(id)}`),
    addPlan: (body: { nombre: string; descripcion?: string }): Promise<PlanificacionPlan> =>
      request('/api/planificacion/planes', { method: 'POST', body: JSON.stringify(body) }),
    updatePlan: (id: string, body: { nombre?: string; descripcion?: string }): Promise<PlanificacionPlan> =>
      request(`/api/planificacion/planes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deletePlan: (id: string): Promise<void> =>
      request(`/api/planificacion/planes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    putPlanItems: (
      planId: string,
      items: { ejercicioId: string; notas?: string }[]
    ): Promise<{ items: PlanificacionPlan['items'] }> =>
      request(`/api/planificacion/planes/${encodeURIComponent(planId)}/items`, {
        method: 'PUT',
        body: JSON.stringify({ items }),
      }),
    getFecha: (fecha: string): Promise<{ fecha: string; items: PlanificacionDiaItem[] }> =>
      request(`/api/planificacion/fechas/${encodeURIComponent(fecha)}`),
    putFechaItems: (
      fecha: string,
      items: { ejercicioId: string; notas?: string }[]
    ): Promise<{ items: PlanificacionDiaItem[] }> =>
      request(`/api/planificacion/fechas/${encodeURIComponent(fecha)}/items`, {
        method: 'PUT',
        body: JSON.stringify({ items }),
      }),
    getCalendarioNotasRango: (desde: string, hasta: string): Promise<Record<string, string>> =>
      request<{ notas: Record<string, string> }>(
        `/api/planificacion/calendario-notas?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`
      ).then((r) => r.notas || {}),
    putCalendarioNota: (fecha: string, texto: string): Promise<void> =>
      request(`/api/planificacion/calendario-notas/${encodeURIComponent(fecha)}`, {
        method: 'PUT',
        body: JSON.stringify({ texto }),
      }),
  },
  admin: {
    getSucursales: (): Promise<Sucursal[]> => request<Sucursal[]>('/api/admin/sucursales'),
    createSucursal: (data: {
      nombreLugar: string;
      usuario: string;
      password: string;
      fotoPerfil?: string | null;
    }): Promise<{ ok: boolean; id: string }> =>
      request('/api/admin/sucursales', { method: 'POST', body: JSON.stringify(data) }),
    updateSucursal: (
      id: string,
      data: {
        nombreLugar?: string;
        usuario?: string;
        password?: string;
        fotoPerfil?: string | null;
        pagoMensual?: number | null;
        fechaVencimientoCuenta?: string | null;
        activa?: boolean;
        horaInicioManana?: string;
        horaFinManana?: string;
        horaInicioTarde?: string;
        horaFinTarde?: string;
        minutosAntesAnotarseClase?: number;
        minutosAntesLiberarClase?: number;
        planificacionHabilitada?: boolean;
      }
    ): Promise<void> =>
      request(`/api/admin/sucursales/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
};
