export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** none = sin token; jwt = Bearer sucursal; admin = Bearer admin; finanzas = jwt + opcional X-Finanzas-Token */
export type AuthKind = 'none' | 'jwt' | 'admin' | 'finanzas' | 'portal';

export interface ApiEndpointDoc {
  group: string;
  title: string;
  method: HttpMethod;
  path: string;
  auth: AuthKind;
  /** Dónde se llama en el frontend */
  client?: string;
  query?: string;
  body?: string;
  response?: string;
  notes?: string;
}

export const API_BASE_HINT =
  'En producción: https://pilates-production-b49a.up.railway.app (o tu dominio). En local con Vite: vacío (mismo origen) o VITE_API_URL.';

export const AUTH_NOTES: Record<AuthKind, string> = {
  none: 'Sin Authorization.',
  jwt: 'Header: Authorization: Bearer <token> (login sucursal o admin según ruta).',
  admin: 'Header: Authorization: Bearer <token> (usuario admin).',
  finanzas: 'Authorization: Bearer <token>. Si la sucursal tiene PIN en Caja/Pagos, también X-Finanzas-Token: <token finanzas> (POST /api/sucursal/finanzas/desbloquear).',
  portal: 'Sin JWT. Identificación por token de link del alumno o dni + sucursalId en query/body.',
};

export const API_ENDPOINTS: ApiEndpointDoc[] = [
  // —— Auth ——
  {
    group: 'Autenticación',
    title: 'Login estudio o admin',
    method: 'POST',
    path: '/api/auth/login',
    auth: 'none',
    client: 'AuthContext.login → fetch directo',
    body: `{
  "usuario": "Femme Garay",
  "password": "tu-clave"
}`,
    response: `{
  "ok": true,
  "token": "eyJhbG...",
  "role": "sucursal",
  "sucursalId": "uuid",
  "sucursalNombre": "Femme Garay",
  "fotoPerfil": null,
  "planificacionHabilitada": false
}`,
    notes: 'role puede ser "sucursal" o "admin". Guardar token en localStorage (savia_token) y enviarlo en cada request.',
  },
  {
    group: 'Autenticación',
    title: 'Healthcheck',
    method: 'GET',
    path: '/api/health',
    auth: 'none',
    client: 'Layout.tsx (estado conexión)',
    response: '{ "ok": true, "db": true }',
  },

  // —— Públicas ——
  {
    group: 'Públicas',
    title: 'Manifest PWA',
    method: 'GET',
    path: '/api/manifest.webmanifest',
    auth: 'none',
    query: '?sucursalId=<uuid> o ?brand=fitgest',
  },
  {
    group: 'Públicas',
    title: 'Logo / marca sucursal',
    method: 'GET',
    path: '/api/public/sucursal-logo/:id',
    auth: 'none',
  },
  {
    group: 'Públicas',
    title: 'Datos marca (registro)',
    method: 'GET',
    path: '/api/public/sucursal-brand',
    auth: 'none',
    query: '?sucursalId=<uuid>',
  },
  {
    group: 'Públicas',
    title: 'Solicitud prueba gratis',
    method: 'POST',
    path: '/api/public/solicitud-prueba',
    auth: 'none',
    body: '{ "email": "a@mail.com", "telefono": "+549..." }',
  },
  {
    group: 'Públicas',
    title: 'Actividades (formulario registro)',
    method: 'GET',
    path: '/api/actividades',
    auth: 'none',
    client: 'RegistroLink.tsx',
    query: '?sucursalId=<uuid> (opcional, sin Authorization)',
  },
  {
    group: 'Públicas',
    title: 'Enviar registro web',
    method: 'POST',
    path: '/api/registro-link',
    auth: 'none',
    client: 'storageApi.registroLink.submit / RegistroLink.tsx',
    body: `{
  "nombre": "Ana",
  "apellido": "Pérez",
  "dni": "12345678",
  "telefono": "223...",
  "email": "ana@mail.com",
  "actividadId": "opcional"
}`,
  },

  // —— Admin ——
  {
    group: 'Admin',
    title: 'Listar sucursales',
    method: 'GET',
    path: '/api/admin/sucursales',
    auth: 'admin',
    client: 'storageApi.admin.getSucursales',
  },
  {
    group: 'Admin',
    title: 'Crear sucursal',
    method: 'POST',
    path: '/api/admin/sucursales',
    auth: 'admin',
    client: 'storageApi.admin.createSucursal',
    body: `{
  "nombreLugar": "Nuevo Studio",
  "usuario": "NuevoStudio",
  "password": "clave123",
  "fotoPerfil": null
}`,
  },
  {
    group: 'Admin',
    title: 'Editar sucursal',
    method: 'PATCH',
    path: '/api/admin/sucursales/:id',
    auth: 'admin',
    client: 'storageApi.admin.updateSucursal',
    body: '{ "nombreLugar": "...", "activa": true, "planificacionHabilitada": true, "password": "nueva" }',
  },

  // —— Alumnos ——
  {
    group: 'Alumnos',
    title: 'Listar alumnos',
    method: 'GET',
    path: '/api/alumnos',
    auth: 'jwt',
    client: 'storageApi.alumnos.getAll',
    query: '?includeInactive=1 (opcional)',
  },
  {
    group: 'Alumnos',
    title: 'Crear alumno',
    method: 'POST',
    path: '/api/alumnos',
    auth: 'jwt',
    client: 'storageApi.alumnos.add',
    body: `{
  "id": "timestamp-string",
  "nombre": "Ana",
  "apellido": "Pérez",
  "dni": "12345678",
  "telefono": "223...",
  "email": "ana@mail.com",
  "fechaVencimientoCuota": "2026-07-01",
  "actividadId": "uuid-actividad",
  "aPrueba": false,
  "activo": true
}`,
  },
  {
    group: 'Alumnos',
    title: 'Actualizar alumno',
    method: 'PATCH',
    path: '/api/alumnos/:id',
    auth: 'jwt',
    client: 'storageApi.alumnos.update',
    body: '{ "fechaVencimientoCuota": "2026-08-01", "activo": false, "descripcion": "..." }',
  },
  {
    group: 'Alumnos',
    title: 'Eliminar alumno',
    method: 'DELETE',
    path: '/api/alumnos/:id',
    auth: 'jwt',
    client: 'storageApi.alumnos.delete',
  },
  {
    group: 'Alumnos',
    title: 'Buscar por DNI',
    method: 'GET',
    path: '/api/alumnos/findByDni',
    auth: 'jwt',
    client: 'storageApi.alumnos.findByDni',
    query: '?dni=12345678',
  },
  {
    group: 'Alumnos',
    title: 'Historial asistencias',
    method: 'GET',
    path: '/api/alumnos/:id/asistencias',
    auth: 'jwt',
    client: 'storageApi.alumnos.getAsistencias',
  },
  {
    group: 'Alumnos',
    title: 'Registros web pendientes',
    method: 'GET',
    path: '/api/registro-link',
    auth: 'jwt',
    client: 'storageApi.registroLink.getAll',
  },
  {
    group: 'Alumnos',
    title: 'Aprobar registro → crear alumno',
    method: 'POST',
    path: '/api/registro-link/:id/agregar',
    auth: 'jwt',
    client: 'storageApi.registroLink.agregarAlumno',
  },
  {
    group: 'Alumnos',
    title: 'Descartar registro web',
    method: 'DELETE',
    path: '/api/registro-link/:id',
    auth: 'jwt',
    client: 'storageApi.registroLink.delete',
  },

  // —— Actividades ——
  {
    group: 'Actividades',
    title: 'Listar actividades (autenticado)',
    method: 'GET',
    path: '/api/actividades',
    auth: 'jwt',
    client: 'storageApi.actividades.getAll',
  },
  {
    group: 'Actividades',
    title: 'Obtener una actividad',
    method: 'GET',
    path: '/api/actividades/:id',
    auth: 'jwt',
    client: 'storageApi.actividades.getById',
  },
  {
    group: 'Actividades',
    title: 'Crear actividad',
    method: 'POST',
    path: '/api/actividades',
    auth: 'jwt',
    body: '{ "id": "...", "nombre": "2x semana", "precio": 45000, "clasesPorSemana": 2 }',
  },
  {
    group: 'Actividades',
    title: 'Editar actividad',
    method: 'PATCH',
    path: '/api/actividades/:id',
    auth: 'jwt',
    body: '{ "precio": 48000, "clasesPorSemana": 3 }',
  },
  {
    group: 'Actividades',
    title: 'Eliminar actividad',
    method: 'DELETE',
    path: '/api/actividades/:id',
    auth: 'jwt',
  },

  // —— Pagos y finanzas ——
  {
    group: 'Pagos / Caja',
    title: 'Listar pagos',
    method: 'GET',
    path: '/api/pagos',
    auth: 'finanzas',
    client: 'storageApi.pagos.getAll',
  },
  {
    group: 'Pagos / Caja',
    title: 'Pagos de un alumno',
    method: 'GET',
    path: '/api/pagos/by-alumno/:alumnoId',
    auth: 'finanzas',
    client: 'storageApi.pagos.getByAlumnoId',
  },
  {
    group: 'Pagos / Caja',
    title: 'Registrar pago',
    method: 'POST',
    path: '/api/pagos',
    auth: 'finanzas',
    body: `{
  "id": "...",
  "alumnoId": "uuid",
  "monto": 45000,
  "metodoPago": "efectivo",
  "fecha": "2026-07-03",
  "hora": "10:30"
}`,
  },
  {
    group: 'Pagos / Caja',
    title: 'Eliminar pago',
    method: 'DELETE',
    path: '/api/pagos/:id',
    auth: 'finanzas',
  },
  {
    group: 'Pagos / Caja',
    title: 'Listar gastos',
    method: 'GET',
    path: '/api/gastos',
    auth: 'finanzas',
    client: 'storageApi.gastos.getAll',
  },
  {
    group: 'Pagos / Caja',
    title: 'Registrar gasto',
    method: 'POST',
    path: '/api/gastos',
    auth: 'finanzas',
    body: `{
  "id": "...",
  "descripcion": "Insumos",
  "monto": 5000,
  "metodoPago": "efectivo",
  "fecha": "2026-07-03",
  "profesorId": null
}`,
  },
  {
    group: 'Pagos / Caja',
    title: 'Editar gasto',
    method: 'PATCH',
    path: '/api/gastos/:id',
    auth: 'finanzas',
  },
  {
    group: 'Pagos / Caja',
    title: 'Eliminar gasto',
    method: 'DELETE',
    path: '/api/gastos/:id',
    auth: 'finanzas',
  },
  {
    group: 'Pagos / Caja',
    title: 'Listar cierres de caja',
    method: 'GET',
    path: '/api/cierres-caja',
    auth: 'finanzas',
    client: 'storageApi.cierresCaja.getAll',
  },
  {
    group: 'Pagos / Caja',
    title: 'Detalle cierre',
    method: 'GET',
    path: '/api/cierres-caja/:id',
    auth: 'finanzas',
  },
  {
    group: 'Pagos / Caja',
    title: 'Nuevo cierre de caja',
    method: 'POST',
    path: '/api/cierres-caja',
    auth: 'finanzas',
    body: `{
  "descripcion": "Retiro banco",
  "fecha": "2026-07-03",
  "montoRetirado": 100000,
  "horaCierre": "18:00"
}`,
  },
  {
    group: 'Pagos / Caja',
    title: 'Estado PIN finanzas',
    method: 'GET',
    path: '/api/sucursal/finanzas/estado',
    auth: 'jwt',
    client: 'storageApi.finanzas.getEstado',
  },
  {
    group: 'Pagos / Caja',
    title: 'Desbloquear con PIN',
    method: 'POST',
    path: '/api/sucursal/finanzas/desbloquear',
    auth: 'jwt',
    body: '{ "pin": "1234" }',
    response: '{ "token": "...", "expiresAt": 1234567890 }',
    notes: 'Guardar token y enviarlo como header X-Finanzas-Token en pagos/gastos/cierres.',
  },

  // —— Profesores ——
  {
    group: 'Profesores',
    title: 'CRUD profesores',
    method: 'GET',
    path: '/api/profesores',
    auth: 'jwt',
    client: 'storageApi.profesores.*',
    notes: 'POST crear, PATCH /:id editar, DELETE /:id eliminar. Body: { id, nombre, apellido }.',
  },

  // —— Calendario / turnos ——
  {
    group: 'Calendario',
    title: 'Listar turnos',
    method: 'GET',
    path: '/api/turnos',
    auth: 'jwt',
    client: 'storageApi.turnos.getAll',
  },
  {
    group: 'Calendario',
    title: 'Crear turno',
    method: 'POST',
    path: '/api/turnos',
    auth: 'jwt',
    body: `{
  "id": "...",
  "diaSemana": 0,
  "hora": "09:00",
  "titulo": "Mat",
  "profesorId": "uuid",
  "alumnoIds": [],
  "cupo": 6
}`,
    notes: 'diaSemana: 0=Lunes … 6=Domingo.',
  },
  {
    group: 'Calendario',
    title: 'Editar turno',
    method: 'PATCH',
    path: '/api/turnos/:id',
    auth: 'jwt',
    body: '{ "alumnoIds": ["..."], "cupo": 6, "titulo": "Reformer" }',
  },
  {
    group: 'Calendario',
    title: 'Eliminar turno',
    method: 'DELETE',
    path: '/api/turnos/:id',
    auth: 'jwt',
  },
  {
    group: 'Calendario',
    title: 'Turnos por día',
    method: 'GET',
    path: '/api/turnos/by-dia/:diaSemana',
    auth: 'jwt',
  },
  {
    group: 'Calendario',
    title: 'Turno por día y hora',
    method: 'GET',
    path: '/api/turnos/by-dia-hora',
    auth: 'jwt',
    query: '?diaSemana=0&hora=09:00',
  },
  {
    group: 'Calendario',
    title: 'Turnos de un alumno',
    method: 'GET',
    path: '/api/turnos/by-alumno/:alumnoId',
    auth: 'jwt',
  },
  {
    group: 'Calendario',
    title: 'Unificar turnos duplicados',
    method: 'POST',
    path: '/api/turnos/unificar-duplicados',
    auth: 'jwt',
    client: 'storageApi.turnos.unificarDuplicados',
  },
  {
    group: 'Calendario',
    title: 'Asistencias de la semana',
    method: 'GET',
    path: '/api/asistencias/by-semana/:semana',
    auth: 'jwt',
    query: 'semana formato YYYY-WW (ej. 2026-27)',
  },
  {
    group: 'Calendario',
    title: 'Marcar asistencia',
    method: 'POST',
    path: '/api/asistencias',
    auth: 'jwt',
    body: `{
  "id": "...",
  "turnoId": "...",
  "alumnoId": "...",
  "estado": "asistio",
  "semana": "2026-27",
  "creditoOtorgado": false
}`,
  },
  {
    group: 'Calendario',
    title: 'Actualizar asistencia',
    method: 'PATCH',
    path: '/api/asistencias/:id',
    auth: 'jwt',
    body: '{ "estado": "no_asistio", "creditoOtorgado": true }',
  },
  {
    group: 'Calendario',
    title: 'Recuperaciones de la semana',
    method: 'GET',
    path: '/api/recuperaciones/by-semana/:semana',
    auth: 'jwt',
  },
  {
    group: 'Calendario',
    title: 'Agregar recuperación (estudio)',
    method: 'POST',
    path: '/api/recuperaciones',
    auth: 'jwt',
    body: '{ "id": "...", "turnoId": "...", "alumnoId": "...", "semana": "2026-27", "usaCredito": true }',
  },
  {
    group: 'Calendario',
    title: 'Liberaciones fijas de la semana',
    method: 'GET',
    path: '/api/liberaciones-semana/by-semana/:semana',
    auth: 'jwt',
  },
  {
    group: 'Calendario',
    title: 'Liberar fija (estudio)',
    method: 'POST',
    path: '/api/liberaciones-semana',
    auth: 'jwt',
    body: '{ "turnoId": "...", "alumnoId": "...", "semana": "2026-27" }',
  },
  {
    group: 'Calendario',
    title: 'Inscripciones fijas desde semana',
    method: 'GET',
    path: '/api/inscripciones-turno',
    auth: 'jwt',
  },
  {
    group: 'Calendario',
    title: 'Nueva inscripción fija',
    method: 'POST',
    path: '/api/inscripciones-turno',
    auth: 'jwt',
    body: '{ "id": "...", "turnoId": "...", "alumnoId": "...", "semanaDesde": "2026-27", "aPrueba": false }',
  },

  // —— Sucursal ——
  {
    group: 'Sucursal',
    title: 'Horarios y plazos portal',
    method: 'GET',
    path: '/api/sucursal/horarios',
    auth: 'jwt',
    client: 'storageApi.sucursal.getHorarios',
  },
  {
    group: 'Sucursal',
    title: 'Actualizar horarios',
    method: 'PATCH',
    path: '/api/sucursal/horarios',
    auth: 'jwt',
    body: '{ "horaInicioManana": "07:00", "minutosAntesLiberarClase": 60 }',
  },
  {
    group: 'Sucursal',
    title: 'Features (planificación)',
    method: 'GET',
    path: '/api/sucursal/features',
    auth: 'jwt',
    response: '{ "planificacionHabilitada": true }',
  },
  {
    group: 'Sucursal',
    title: 'Cierres calendario (rango)',
    method: 'GET',
    path: '/api/sucursal/cierres-calendario',
    auth: 'jwt',
    query: '?desde=2026-07-01&hasta=2026-07-31',
  },
  {
    group: 'Sucursal',
    title: 'Guardar cierre día/hora',
    method: 'PUT',
    path: '/api/sucursal/cierres-calendario',
    auth: 'jwt',
    body: '{ "fecha": "2026-07-15", "semana": "2026-28", "cerrarTodo": false, "horasCerradas": ["09:00"] }',
  },

  // —— Agenda ——
  {
    group: 'Agenda',
    title: 'Notas agenda',
    method: 'GET',
    path: '/api/agenda-notas',
    auth: 'jwt',
    client: 'storageApi.agendaNotas.*',
    notes: 'POST crear, PATCH /:id, DELETE /:id.',
  },

  // —— Planificación ——
  {
    group: 'Planificación',
    title: 'Ejercicios, tipos, máquinas, planes',
    method: 'GET',
    path: '/api/planificacion/ejercicios',
    auth: 'jwt',
    client: 'storageApi.planificacion.*',
    notes: 'Ver también /tipos, /maquinas, /planes, /fechas/:fecha, PUT /fechas/:fecha/items, /calendario-notas.',
  },

  // —— Notificaciones ——
  {
    group: 'Notificaciones',
    title: 'Listar notificaciones',
    method: 'GET',
    path: '/api/notificaciones',
    auth: 'jwt',
    client: 'Layout.tsx, Notificaciones.tsx',
  },
  {
    group: 'Notificaciones',
    title: 'Marcar leídas',
    method: 'PATCH',
    path: '/api/notificaciones/marcar-leidas',
    auth: 'jwt',
    body: '{ "todas": true } o { "ids": ["id1", "id2"] }',
  },
  {
    group: 'Notificaciones',
    title: 'Push VAPID (estudio)',
    method: 'GET',
    path: '/api/push-vapid-public',
    auth: 'jwt',
  },
  {
    group: 'Notificaciones',
    title: 'Suscribir push (estudio)',
    method: 'POST',
    path: '/api/push-subscribe',
    auth: 'jwt',
    body: '{ "subscription": { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } } }',
  },
  {
    group: 'Notificaciones',
    title: 'Estado suscripción push',
    method: 'GET',
    path: '/api/push-status',
    auth: 'jwt',
  },

  // —— Portal alumno ——
  {
    group: 'Portal alumno',
    title: 'Datos portal (semana / turnos)',
    method: 'GET',
    path: '/api/alumno-portal',
    auth: 'portal',
    client: 'MiClase.tsx',
    query: '?token=<linkToken> o ?dni=123&sucursalId=uuid&modo=recuperar&semana=2026-27',
  },
  {
    group: 'Portal alumno',
    title: 'Inscribirse cupo liberado (fija)',
    method: 'POST',
    path: '/api/alumno-portal/inscribir',
    auth: 'portal',
    body: '{ "token": "..." , "turnoId": "..." } o { "dni": "...", "sucursalId": "...", "turnoId": "..." }',
  },
  {
    group: 'Portal alumno',
    title: 'Liberar cupo (fija)',
    method: 'POST',
    path: '/api/alumno-portal/liberar',
    auth: 'portal',
    body: '{ "token": "...", "turnoId": "..." }',
  },
  {
    group: 'Portal alumno',
    title: 'Liberar clase fija de la semana',
    method: 'POST',
    path: '/api/alumno-portal/liberar-clase-semana',
    auth: 'portal',
    body: '{ "dni": "...", "sucursalId": "...", "turnoId": "...", "semana": "2026-27" }',
  },
  {
    group: 'Portal alumno',
    title: 'Restaurar fija liberada',
    method: 'POST',
    path: '/api/alumno-portal/restaurar-clase-semana',
    auth: 'portal',
    body: '{ "dni": "...", "sucursalId": "...", "turnoId": "...", "semana": "2026-27", "liberacionId": "..." }',
  },
  {
    group: 'Portal alumno',
    title: 'Inscribir recuperación',
    method: 'POST',
    path: '/api/alumno-portal/inscribir-recuperacion',
    auth: 'portal',
    body: '{ "dni": "...", "sucursalId": "...", "turnoId": "...", "semana": "2026-27" }',
  },
  {
    group: 'Portal alumno',
    title: 'Liberar recuperación',
    method: 'POST',
    path: '/api/alumno-portal/liberar-recuperacion',
    auth: 'portal',
    body: '{ "dni": "...", "sucursalId": "...", "recuperacionId": "..." }',
  },
  {
    group: 'Portal alumno',
    title: 'Push VAPID (alumno)',
    method: 'GET',
    path: '/api/alumno-portal/push-vapid-public',
    auth: 'portal',
  },
  {
    group: 'Portal alumno',
    title: 'Push subscribe (alumno)',
    method: 'POST',
    path: '/api/alumno-portal/push-subscribe',
    auth: 'portal',
    body: '{ "token": "...", "dni": "...", "sucursalId": "...", "subscription": { ... } }',
  },
];

export const API_GROUPS = [...new Set(API_ENDPOINTS.map((e) => e.group))];
