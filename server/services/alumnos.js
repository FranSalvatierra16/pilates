import { getPool } from '../db/index.js';
import { chatbotSucursalIdFromEnv, chatbotSucursalUsuarioFromEnv } from '../chatbot/config.js';

/** Solo dígitos del DNI */
export function normalizarDni(dni) {
  return String(dni || '').replace(/\D/g, '');
}

/**
 * Fecha de vencimiento de cuota como YYYY-MM-DD (o '').
 */
export function fechaCuotaAlumno(alumno) {
  const raw = alumno?.fecha_vencimiento_cuota ?? alumno?.fechaVencimientoCuota ?? '';
  if (!raw) return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  return String(raw).slice(0, 10);
}

/**
 * true si la cuota está vencida (fecha estrictamente anterior a hoy, TZ Argentina).
 * Sin fecha cargada → no se considera vencida (no bloquea).
 */
export function cuotaVencidaAlumno(alumno) {
  const f = fechaCuotaAlumno(alumno);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  try {
    const hoy = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })
    );
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const d = String(hoy.getDate()).padStart(2, '0');
    const hoyStr = `${y}-${m}-${d}`;
    return f < hoyStr;
  } catch {
    return false;
  }
}

export function mensajeCuotaVencidaRecuperar() {
  return 'Tu cuota está vencida. Regularizá el pago para poder recuperar una clase.';
}

/**
 * Lanza error 400 si la cuota está vencida (recuperar requiere cuota al día).
 */
export function assertCuotaAlDiaParaRecuperar(alumno) {
  if (cuotaVencidaAlumno(alumno)) {
    throw Object.assign(new Error(mensajeCuotaVencidaRecuperar()), { status: 400 });
  }
}

let sucursalChatbotCache = null;

/**
 * Resuelve la sucursal del chatbot (Fgest).
 * Prioridad: CHATBOT_SUCURSAL_USUARIO → CHATBOT_SUCURSAL_ID → defaults Fgest.
 * (Usuario primero para no quedar pegados a un ID viejo de Savia/Savia3 en Railway.)
 */
export async function getSucursalChatbot() {
  if (sucursalChatbotCache) return sucursalChatbotCache;

  const db = await getPool();
  if (!db) return null;

  const idEnv = chatbotSucursalIdFromEnv();
  const usuarioEnv = chatbotSucursalUsuarioFromEnv();

  let row = null;
  if (usuarioEnv) {
    const { rows } = await db.query(
      `SELECT id, nombre_lugar, usuario FROM sucursales
       WHERE LOWER(TRIM(usuario)) = LOWER(TRIM($1))
       LIMIT 1`,
      [usuarioEnv]
    );
    row = rows[0] || null;
  }
  if (!row && idEnv) {
    const { rows } = await db.query(
      `SELECT id, nombre_lugar, usuario FROM sucursales WHERE id = $1 LIMIT 1`,
      [idEnv]
    );
    row = rows[0] || null;
  }

  if (row) {
    if (String(row.usuario || '').toLowerCase() !== 'fgest') {
      console.warn(
        '[chatbot] Atención: sucursal resuelta no es Fgest:',
        row.usuario,
        row.id
      );
    }
    sucursalChatbotCache = row;
  }
  return row;
}

/**
 * Busca alumno activo por DNI solo en la sucursal del chatbot (Fgest).
 */
export async function buscarAlumnoPorDni(dni) {
  const db = await getPool();
  if (!db) return null;

  const dniNorm = normalizarDni(dni);
  if (!dniNorm || dniNorm.length < 6) return null;

  const sucursal = await getSucursalChatbot();
  if (!sucursal) {
    console.warn('[chatbot] No se encontró sucursal Fgest / CHATBOT_SUCURSAL_ID');
    return null;
  }

  const { rows } = await db.query(
    `SELECT a.id, a.nombre, a.apellido, a.dni, a.telefono, a.fecha_vencimiento_cuota,
            a.clases_para_recuperar, a.sucursal_id, a.activo,
            s.nombre_lugar AS sucursal_nombre
     FROM alumnos a
     LEFT JOIN sucursales s ON s.id = a.sucursal_id
     WHERE regexp_replace(COALESCE(a.dni, ''), '[^0-9]', '', 'g') = $1
       AND a.sucursal_id = $2
       AND a.activo IS DISTINCT FROM false
     ORDER BY a.created_at DESC
     LIMIT 1`,
    [dniNorm, sucursal.id]
  );

  return rows[0] || null;
}

/**
 * Busca alumno activo por DNI en una sucursal concreta.
 */
export async function buscarAlumnoPorDniEnSucursal(dni, sucursalId) {
  const db = await getPool();
  if (!db || !sucursalId) return null;

  const dniNorm = normalizarDni(dni);
  if (!dniNorm || dniNorm.length < 6) return null;

  const { rows } = await db.query(
    `SELECT a.id, a.nombre, a.apellido, a.dni, a.telefono, a.fecha_vencimiento_cuota,
            a.clases_para_recuperar, a.sucursal_id, a.activo
     FROM alumnos a
     WHERE regexp_replace(COALESCE(a.dni, ''), '[^0-9]', '', 'g') = $1
       AND a.sucursal_id = $2
       AND a.activo IS DISTINCT FROM false
     ORDER BY a.created_at DESC
     LIMIT 1`,
    [dniNorm, sucursalId]
  );

  return rows[0] || null;
}

/**
 * Busca cualquier alumno con ese DNI (cualquier sucursal, activo o no).
 * Solo informativo (p. ej. avisos); no usar para bloquear altas entre sedes.
 */
export async function buscarAlumnoPorDniGlobal(dni) {
  const db = await getPool();
  if (!db) return null;

  const dniNorm = normalizarDni(dni);
  if (!dniNorm || dniNorm.length < 6) return null;

  const { rows } = await db.query(
    `SELECT a.id, a.nombre, a.apellido, a.dni, a.telefono, a.fecha_vencimiento_cuota,
            a.clases_para_recuperar, a.sucursal_id, a.activo,
            s.nombre_lugar AS sucursal_nombre, s.usuario AS sucursal_usuario
     FROM alumnos a
     LEFT JOIN sucursales s ON s.id = a.sucursal_id
     WHERE regexp_replace(COALESCE(a.dni, ''), '[^0-9]', '', 'g') = $1
     ORDER BY
       CASE WHEN a.activo IS DISTINCT FROM false THEN 0 ELSE 1 END,
       a.created_at DESC
     LIMIT 1`,
    [dniNorm]
  );

  return rows[0] || null;
}

/**
 * Antes de asignar un DNI: libera el número en fichas inactivas (histórico)
 * y detecta conflicto con otro alumno activo de la misma sucursal.
 * @param {object} opts
 * @param {boolean} [opts.soloDniCanonico] Si true, solo cuenta otro activo con dni = dígitos limpios
 *   (permite corregir "39098938h" → "39098938" sin chocar con otro registro sucio).
 */
export async function resolverConflictoDniAlumno(
  db,
  { sucursalId, dniNorm, excludeId = null, soloDniCanonico = false }
) {
  await db.query(
    `UPDATE alumnos
        SET dni = $1 || '-inactivo-' || id
      WHERE sucursal_id = $4
        AND ($2::text IS NULL OR id <> $2)
        AND activo = false
        AND regexp_replace(COALESCE(dni, ''), '[^0-9]', '', 'g') = $3`,
    [dniNorm, excludeId, dniNorm, sucursalId]
  );

  const filtroDni = soloDniCanonico
    ? 'dni = $3'
    : "regexp_replace(COALESCE(dni, ''), '[^0-9]', '', 'g') = $3";

  const { rows } = await db.query(
    `SELECT id, nombre, apellido FROM alumnos
      WHERE sucursal_id = $1
        AND ($2::text IS NULL OR id <> $2)
        AND activo IS DISTINCT FROM false
        AND ${filtroDni}
      LIMIT 1`,
    [sucursalId, excludeId, dniNorm]
  );

  return rows[0] || null;
}

/**
 * Turnos fijos del alumno (día + hora + título), solo de su sucursal.
 */
export async function horariosFijosAlumno(alumnoId) {
  const db = await getPool();
  if (!db) return [];

  const sucursal = await getSucursalChatbot();

  const { rows } = await db.query(
    `SELECT t.id, t.dia_semana, t.hora, COALESCE(NULLIF(TRIM(t.titulo), ''), 'Clase') AS titulo
     FROM turnos t
     WHERE t.sucursal_id = COALESCE($2, t.sucursal_id)
       AND (
         $1 = ANY(t.alumno_ids)
         OR EXISTS (
           SELECT 1 FROM inscripciones_turno i
           WHERE i.turno_id = t.id AND i.alumno_id = $1
         )
       )
     ORDER BY t.dia_semana, t.hora`,
    [alumnoId, sucursal?.id || null]
  );

  return rows;
}
