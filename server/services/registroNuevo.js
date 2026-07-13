import crypto from 'node:crypto';
import { getPool } from '../db/index.js';
import { getSucursalChatbot, buscarAlumnoPorDni, normalizarDni } from './alumnos.js';
import {
  getSemanaActual,
  semanaPortalSiguiente,
  getFechaFromSemanaYDia,
  listarCuposDisponibles,
} from './turnos.js';
import { avisarProfesorChatbot } from './whatsapp.js';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function formatoPrecio(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n ?? '');
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(v);
}

/**
 * Actividades / planes de la sucursal del chatbot.
 */
export async function listarActividadesChatbot() {
  const db = await getPool();
  const sucursal = await getSucursalChatbot();
  if (!db || !sucursal) return [];

  const { rows } = await db.query(
    `SELECT id, nombre, precio, clases_por_semana
     FROM actividades
     WHERE sucursal_id = $1
     ORDER BY precio ASC NULLS LAST, nombre ASC`,
    [sucursal.id]
  );

  return rows.map((r) => ({
    id: r.id,
    nombre: String(r.nombre || '').trim() || 'Actividad',
    precio: Number(r.precio) || 0,
    clasesPorSemana: r.clases_por_semana != null ? Number(r.clases_por_semana) : null,
    labelPrecio: formatoPrecio(r.precio),
  }));
}

/**
 * Horarios con cupo libre (esta + próxima semana) para mostrar / anotar prueba.
 */
export async function listarHorariosParaNuevo({ limite = 20 } = {}) {
  return listarCuposDisponibles({ limite });
}

/**
 * Alta de alumno a prueba + inscripción en el turno elegido.
 */
export async function registrarAlumnoNuevo({
  nombre,
  apellido,
  dni,
  telefono,
  email,
  actividadId,
  turnoId,
  semana,
}) {
  const db = await getPool();
  if (!db) throw new Error('Base de datos no configurada');

  const sucursal = await getSucursalChatbot();
  if (!sucursal) throw new Error('No se encontró la sucursal del chatbot');

  const dniNorm = normalizarDni(dni);
  if (!dniNorm || dniNorm.length < 6) {
    throw Object.assign(new Error('DNI inválido'), { status: 400 });
  }

  const existente = await buscarAlumnoPorDni(dniNorm);
  if (existente) {
    throw Object.assign(
      new Error('Ya hay un alumno activo con ese DNI. Usá la opción “Ya soy alumno/a”.'),
      { status: 409, alumno: existente }
    );
  }

  const nombreOk = String(nombre || '').trim();
  const apellidoOk = String(apellido || '').trim();
  if (!nombreOk || !apellidoOk) {
    throw Object.assign(new Error('Faltan nombre o apellido'), { status: 400 });
  }

  const tel = String(telefono || '').replace(/\D/g, '');
  const emailOk = String(email || '').trim() || `${tel || 'nuevo'}@whatsapp.local`;

  let actividad = null;
  if (actividadId) {
    const { rows } = await db.query(
      'SELECT id, nombre, precio, clases_por_semana FROM actividades WHERE id = $1 AND sucursal_id = $2',
      [actividadId, sucursal.id]
    );
    actividad = rows[0] || null;
    if (!actividad) {
      throw Object.assign(new Error('Actividad no encontrada'), { status: 404 });
    }
  }

  const semanaVista = String(semana || '').trim() || getSemanaActual();

  const { rows: turnoRows } = await db.query(
    'SELECT id, dia_semana, hora, titulo, cupo, alumno_ids FROM turnos WHERE id = $1 AND sucursal_id = $2',
    [turnoId, sucursal.id]
  );
  if (!turnoRows.length) {
    throw Object.assign(new Error('Turno no encontrado'), { status: 404 });
  }
  const turno = turnoRows[0];

  const cupos = await listarCuposDisponibles({ limite: 50 });
  const cupoOk = cupos.find((c) => c.turnoId === turnoId && c.semana === semanaVista);
  if (!cupoOk || cupoOk.libres <= 0) {
    throw Object.assign(new Error('Ese horario ya no tiene cupo libre. Elegí otro.'), { status: 400 });
  }

  const alumnoId = crypto.randomUUID();
  const desc = `Alta por WhatsApp (chatbot). Clase de prueba.`;

  await db.query(
    `INSERT INTO alumnos (
       id, sucursal_id, nombre, apellido, dni, telefono, email,
       fecha_vencimiento_cuota, actividad_id, a_prueba,
       clases_asistidas, clases_para_recuperar, descripcion, activo, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,true,0,0,$9,true,NOW())`,
    [alumnoId, sucursal.id, nombreOk, apellidoOk, dniNorm, tel, emailOk, actividad?.id || null, desc]
  );

  const ids = [...(turno.alumno_ids || []).map(String)];
  if (!ids.includes(alumnoId)) ids.push(alumnoId);
  await db.query('UPDATE turnos SET alumno_ids = $1 WHERE id = $2 AND sucursal_id = $3', [
    ids,
    turnoId,
    sucursal.id,
  ]);

  await db.query(
    `INSERT INTO inscripciones_turno (id, turno_id, alumno_id, semana_desde, a_prueba, created_at)
     VALUES ($1, $2, $3, $4, true, NOW())`,
    [crypto.randomUUID(), turnoId, alumnoId, semanaVista]
  );

  try {
    await db.query(
      'INSERT INTO notificaciones (id, sucursal_id, tipo, alumno_id, turno_id) VALUES ($1, $2, $3, $4, $5)',
      [crypto.randomUUID(), sucursal.id, 'inscribio', alumnoId, turnoId]
    );
  } catch (err) {
    console.error('[chatbot registro] notificación', err?.message || err);
  }

  const dia = DIAS[Number(turno.dia_semana)] || `Día ${turno.dia_semana}`;
  const hora = String(turno.hora || '').slice(0, 5);
  const titulo = String(turno.titulo || 'Clase').trim() || 'Clase';
  const fecha = getFechaFromSemanaYDia(semanaVista, turno.dia_semana);
  const etiquetaSemana = semanaVista === getSemanaActual() ? 'Esta semana' : 'Próxima semana';

  const result = {
    ok: true,
    alumno: {
      id: alumnoId,
      nombre: nombreOk,
      apellido: apellidoOk,
      dni: dniNorm,
      telefono: tel,
      email: emailOk,
      sucursal_id: sucursal.id,
      a_prueba: true,
    },
    actividad: actividad
      ? {
          id: actividad.id,
          nombre: actividad.nombre,
          precio: Number(actividad.precio) || 0,
          clasesPorSemana: actividad.clases_por_semana,
        }
      : null,
    clase: {
      turnoId,
      semana: semanaVista,
      dia,
      hora,
      titulo,
      fecha,
      etiquetaSemana,
      label: `${etiquetaSemana} · ${dia} ${String(fecha).slice(8, 10)}/${String(fecha).slice(5, 7)} ${hora} — ${titulo}`,
    },
  };

  avisarProfesorChatbot({
    tipo: 'nuevo',
    alumno: result.alumno,
    turno,
    semana: etiquetaSemana,
    extraLabel: result.clase.label,
  }).catch((e) => console.error('[whatsapp registro]', e?.message || e));

  return result;
}

export { getSemanaActual, semanaPortalSiguiente };
