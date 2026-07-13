import { getPool } from '../db/index.js';

/** Solo dígitos del DNI */
export function normalizarDni(dni) {
  return String(dni || '').replace(/\D/g, '');
}

/**
 * Busca alumno activo por DNI (todas las sucursales; si hay varios, el más reciente).
 */
export async function buscarAlumnoPorDni(dni) {
  const db = await getPool();
  if (!db) return null;

  const dniNorm = normalizarDni(dni);
  if (!dniNorm || dniNorm.length < 6) return null;

  const { rows } = await db.query(
    `SELECT a.id, a.nombre, a.apellido, a.dni, a.telefono, a.fecha_vencimiento_cuota,
            a.clases_para_recuperar, a.sucursal_id, a.activo,
            s.nombre_lugar AS sucursal_nombre
     FROM alumnos a
     LEFT JOIN sucursales s ON s.id = a.sucursal_id
     WHERE regexp_replace(COALESCE(a.dni, ''), '[^0-9]', '', 'g') = $1
       AND a.activo IS DISTINCT FROM false
     ORDER BY a.created_at DESC
     LIMIT 1`,
    [dniNorm]
  );

  return rows[0] || null;
}

/**
 * Turnos fijos del alumno (día + hora + título).
 */
export async function horariosFijosAlumno(alumnoId) {
  const db = await getPool();
  if (!db) return [];

  const { rows } = await db.query(
    `SELECT t.dia_semana, t.hora, COALESCE(NULLIF(TRIM(t.titulo), ''), 'Clase') AS titulo
     FROM turnos t
     WHERE $1 = ANY(t.alumno_ids)
        OR EXISTS (
          SELECT 1 FROM inscripciones_turno i
          WHERE i.turno_id = t.id AND i.alumno_id = $1
        )
     ORDER BY t.dia_semana, t.hora`,
    [alumnoId]
  );

  return rows;
}
