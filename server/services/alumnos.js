import { getPool } from '../db/index.js';
import { chatbotSucursalIdFromEnv, chatbotSucursalUsuarioFromEnv } from '../chatbot/config.js';

/** Solo dígitos del DNI */
export function normalizarDni(dni) {
  return String(dni || '').replace(/\D/g, '');
}

let sucursalChatbotCache = null;

/**
 * Resuelve la sucursal del chatbot (Fgest).
 */
export async function getSucursalChatbot() {
  if (sucursalChatbotCache) return sucursalChatbotCache;

  const db = await getPool();
  if (!db) return null;

  const idEnv = chatbotSucursalIdFromEnv();
  const usuarioEnv = chatbotSucursalUsuarioFromEnv();

  let row = null;
  if (idEnv) {
    const { rows } = await db.query(
      `SELECT id, nombre_lugar, usuario FROM sucursales WHERE id = $1 LIMIT 1`,
      [idEnv]
    );
    row = rows[0] || null;
  }
  if (!row && usuarioEnv) {
    const { rows } = await db.query(
      `SELECT id, nombre_lugar, usuario FROM sucursales
       WHERE LOWER(TRIM(usuario)) = LOWER(TRIM($1))
       LIMIT 1`,
      [usuarioEnv]
    );
    row = rows[0] || null;
  }

  if (row) sucursalChatbotCache = row;
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
