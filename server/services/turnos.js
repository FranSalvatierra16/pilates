import crypto from 'node:crypto';
import { getPool } from '../db/index.js';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function getSemanaActual() {
  const d = new Date();
  const año = d.getFullYear();
  const inicioAño = new Date(año, 0, 1);
  const dias = Math.floor((d - inicioAño) / (24 * 60 * 60 * 1000));
  const semana = Math.ceil((dias + inicioAño.getDay() + 1) / 7);
  return `${año}-${String(semana).padStart(2, '0')}`;
}

export function semanaPortalSiguiente(s) {
  const [y, w] = String(s || '')
    .split('-')
    .map((x) => Number(x));
  if (!y || Number.isNaN(w)) return s;
  if (w >= 52) return `${y + 1}-01`;
  return `${y}-${String(w + 1).padStart(2, '0')}`;
}

export function getFechaFromSemanaYDia(semana, diaSemana) {
  const [y, w] = String(semana || '').split('-').map(Number);
  if (!y || !w || Number.isNaN(Number(diaSemana))) return '';
  const jan1 = new Date(y, 0, 1);
  const dayOfJan1 = jan1.getDay();
  const mondayOffset = dayOfJan1 === 0 ? 6 : dayOfJan1 - 1;
  const mondayWeek1 = new Date(y, 0, 1 - mondayOffset);
  const d = new Date(mondayWeek1);
  d.setDate(d.getDate() + (w - 1) * 7 + Number(diaSemana));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatoFechaCorta(fecha) {
  if (!fecha) return '';
  const [y, m, day] = String(fecha).slice(0, 10).split('-');
  return `${day}/${m}`;
}

function dedupeTurnosPorFranja(turnoRows) {
  const sorted = [...turnoRows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const seen = new Set();
  const out = [];
  for (const r of sorted) {
    const hh = String(r.hora || '').slice(0, 5);
    const tit = String(r.titulo || 'Clase').trim().toLowerCase();
    const key = `${Number(r.dia_semana)}|${hh}|${tit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Clases fijas del alumno en esta semana y la próxima, con estado liberado o no.
 */
export async function listarClasesParaLiberar(alumno) {
  const db = await getPool();
  if (!db || !alumno?.id || !alumno?.sucursal_id) return { semanaActual: '', semanaSiguiente: '', opciones: [] };

  const semanaActual = getSemanaActual();
  const semanaSiguiente = semanaPortalSiguiente(semanaActual);

  const { rows: turnoRows } = await db.query(
    `SELECT id, dia_semana, hora, titulo, alumno_ids
     FROM turnos
     WHERE sucursal_id = $1
       AND $2 = ANY(alumno_ids)
     ORDER BY dia_semana, hora`,
    [alumno.sucursal_id, alumno.id]
  );

  const { rows: insRows } = await db.query(
    'SELECT turno_id, semana_desde FROM inscripciones_turno WHERE alumno_id = $1',
    [alumno.id]
  );
  const insByTurno = new Map(insRows.map((r) => [r.turno_id, r.semana_desde]));

  const turnos = dedupeTurnosPorFranja(turnoRows);
  const opciones = [];

  for (const semana of [semanaActual, semanaSiguiente]) {
    const etiquetaSemana = semana === semanaActual ? 'Esta semana' : 'Próxima semana';
    for (const t of turnos) {
      const desde = insByTurno.get(t.id);
      if (desde && desde > semana) continue;

      const { rows: lib } = await db.query(
        'SELECT id FROM liberaciones_semana WHERE turno_id = $1 AND alumno_id = $2 AND semana = $3 LIMIT 1',
        [t.id, alumno.id, semana]
      );
      const yaLiberada = lib.length > 0;
      const fecha = getFechaFromSemanaYDia(semana, t.dia_semana);
      const dia = DIAS[Number(t.dia_semana)] || `Día ${t.dia_semana}`;
      const titulo = String(t.titulo || 'Clase').trim() || 'Clase';
      const hora = String(t.hora || '').slice(0, 5);

      opciones.push({
        turnoId: t.id,
        semana,
        etiquetaSemana,
        dia,
        hora,
        titulo,
        fecha,
        yaLiberada,
        liberacionId: yaLiberada ? lib[0].id : null,
        label: `${etiquetaSemana} · ${dia} ${formatoFechaCorta(fecha)} ${hora} — ${titulo}${yaLiberada ? ' (ya liberada)' : ''}`,
      });
    }
  }

  return { semanaActual, semanaSiguiente, opciones };
}

/**
 * Libera una clase fija de una semana y suma 1 crédito (misma lógica que el portal).
 */
export async function liberarClaseFija(alumno, turnoId, semana) {
  const db = await getPool();
  if (!db) throw new Error('Base de datos no configurada');

  const semanaVista = String(semana || '').trim() || getSemanaActual();
  const { rows: turnoRows } = await db.query(
    'SELECT id, alumno_ids, dia_semana, hora, titulo FROM turnos WHERE id = $1 AND sucursal_id = $2',
    [turnoId, alumno.sucursal_id]
  );
  if (turnoRows.length === 0) throw Object.assign(new Error('Turno no encontrado'), { status: 404 });
  const t = turnoRows[0];
  const ids = t.alumno_ids || [];
  if (!ids.includes(alumno.id)) {
    throw Object.assign(new Error('Esta no es una clase fija tuya.'), { status: 400 });
  }

  const { rows: insRows } = await db.query(
    'SELECT semana_desde FROM inscripciones_turno WHERE turno_id = $1 AND alumno_id = $2 LIMIT 1',
    [turnoId, alumno.id]
  );
  if (insRows.length > 0 && insRows[0].semana_desde > semanaVista) {
    throw Object.assign(new Error('Todavía no tenés esa clase asignada en esa semana.'), { status: 400 });
  }

  const { rows: libRows } = await db.query(
    'SELECT id FROM liberaciones_semana WHERE turno_id = $1 AND alumno_id = $2 AND semana = $3',
    [turnoId, alumno.id, semanaVista]
  );
  if (libRows.length > 0) {
    return { ok: true, liberacionId: libRows[0].id, yaEstaba: true, turno: t, semana: semanaVista };
  }

  const id = crypto.randomUUID();
  await db.query(
    'INSERT INTO liberaciones_semana (id, turno_id, alumno_id, semana, created_at) VALUES ($1, $2, $3, $4, NOW())',
    [id, turnoId, alumno.id, semanaVista]
  );
  await db.query(
    'UPDATE alumnos SET clases_para_recuperar = COALESCE(clases_para_recuperar, 0) + 1 WHERE id = $1 AND sucursal_id = $2',
    [alumno.id, alumno.sucursal_id]
  );

  try {
    await db.query('UPDATE alumnos SET actividad_arrastre_procesado_hasta = NULL WHERE id = $1', [alumno.id]);
  } catch {
    /* ignore */
  }

  try {
    await db.query(
      'INSERT INTO notificaciones (id, sucursal_id, tipo, alumno_id, turno_id) VALUES ($1, $2, $3, $4, $5)',
      [crypto.randomUUID(), alumno.sucursal_id, 'liberar', alumno.id, turnoId]
    );
  } catch (err) {
    console.error('[chatbot liberar] notificación', err?.message || err);
  }

  return { ok: true, liberacionId: id, yaEstaba: false, turno: t, semana: semanaVista };
}

export { DIAS };
