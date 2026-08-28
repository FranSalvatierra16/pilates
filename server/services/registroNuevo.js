import crypto from 'node:crypto';
import { getPool } from '../db/index.js';
import { getSucursalChatbot, buscarAlumnoPorDni, buscarAlumnoPorDniEnSucursal, normalizarDni } from './alumnos.js';
import {
  getSemanaActual,
  semanaPortalSiguiente,
  getFechaFromSemanaYDia,
  listarCuposDisponibles,
} from './turnos.js';
import { avisarProfesorChatbot } from './whatsapp.js';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function errorDniDuplicado(existente) {
  const nombre = existente
    ? `*${existente.nombre || ''} ${existente.apellido || ''}*`.trim()
    : null;
  const msg = nombre
    ? `Ese DNI ya está cargado como ${nombre}. Si sos vos, usá la opción “Ya soy alumno/a”.`
    : 'Ese DNI ya está registrado. Si sos vos, usá la opción “Ya soy alumno/a”.';
  return Object.assign(new Error(msg), { status: 409, alumno: existente || null });
}

function esErrorDniUnique(err) {
  return (
    err?.code === '23505' &&
    (err.constraint === 'alumnos_dni_key' || err.constraint === 'alumnos_sucursal_id_dni_key')
  );
}

async function assertDniLibreParaAlta(dniNorm, sucursalId) {
  const existente = await buscarAlumnoPorDniEnSucursal(dniNorm, sucursalId);
  if (!existente) return null;
  throw errorDniDuplicado(existente);
}

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
 * Horarios fijos únicos (un slot por turno) con cupo esta semana — para armar plan semanal.
 */
export async function listarHorariosFijosParaAlta({ limite = 60, excluirTurnoIds = [] } = {}) {
  const semanaActual = getSemanaActual();
  const cupos = await listarCuposDisponibles({ limite: 200 });
  const excluidos = new Set((excluirTurnoIds || []).map(String));
  const seen = new Set();
  const out = [];

  for (const c of cupos) {
    if (c.semana !== semanaActual) continue;
    const tid = String(c.turnoId);
    if (excluidos.has(tid) || seen.has(tid)) continue;
    seen.add(tid);
    out.push({
      ...c,
      etiquetaSemana: 'Horarios fijos',
      label: `${c.dia} ${c.hora}`,
    });
  }

  return out.slice(0, Math.max(1, Number(limite) || 60));
}

function labelClaseFromTurno(turno, semanaVista) {
  const dia = DIAS[Number(turno.dia_semana)] || `Día ${turno.dia_semana}`;
  const hora = String(turno.hora || '').slice(0, 5);
  const titulo = String(turno.titulo || 'Clase').trim() || 'Clase';
  const fecha = getFechaFromSemanaYDia(semanaVista, turno.dia_semana);
  const etiquetaSemana = semanaVista === getSemanaActual() ? 'Esta semana' : 'Próxima semana';
  return {
    turnoId: turno.id,
    semana: semanaVista,
    dia,
    hora,
    titulo,
    fecha,
    etiquetaSemana,
    label: `${dia} ${hora} — ${titulo}`,
  };
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

  await assertDniLibreParaAlta(dniNorm, sucursal.id);

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

  try {
    await db.query(
      `INSERT INTO alumnos (
         id, sucursal_id, nombre, apellido, dni, telefono, email,
         fecha_vencimiento_cuota, actividad_id, a_prueba,
         clases_asistidas, clases_para_recuperar, descripcion, activo, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,true,0,0,$9,true,NOW())`,
      [alumnoId, sucursal.id, nombreOk, apellidoOk, dniNorm, tel, emailOk, actividad?.id || null, desc]
    );
  } catch (err) {
    if (esErrorDniUnique(err)) {
      const existente = await buscarAlumnoPorDni(dniNorm);
      throw errorDniDuplicado(existente);
    }
    throw err;
  }

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

  const clase = labelClaseFromTurno(turno, semanaVista);

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
    clase,
  };

  avisarProfesorChatbot({
    tipo: 'nuevo',
    alumno: result.alumno,
    turno,
    semana: clase.etiquetaSemana,
    extraLabel: clase.label,
  }).catch((e) => console.error('[whatsapp registro]', e?.message || e));

  return result;
}

/**
 * Alta regular (plan semanal): N turnos fijos, sin a_prueba.
 * `turnos`: [{ turnoId, semana? }, ...]
 */
export async function registrarAlumnoActividad({
  nombre,
  apellido,
  dni,
  telefono,
  email,
  actividadId,
  turnos,
  clasesEsperadas = null,
}) {
  const db = await getPool();
  if (!db) throw new Error('Base de datos no configurada');

  const sucursal = await getSucursalChatbot();
  if (!sucursal) throw new Error('No se encontró la sucursal del chatbot');

  const dniNorm = normalizarDni(dni);
  if (!dniNorm || dniNorm.length < 6) {
    throw Object.assign(new Error('DNI inválido'), { status: 400 });
  }

  await assertDniLibreParaAlta(dniNorm, sucursal.id);

  const nombreOk = String(nombre || '').trim();
  const apellidoOk = String(apellido || '').trim();
  if (!nombreOk || !apellidoOk) {
    throw Object.assign(new Error('Faltan nombre o apellido'), { status: 400 });
  }

  const lista = Array.isArray(turnos) ? turnos.filter((t) => t?.turnoId) : [];
  if (!lista.length) {
    throw Object.assign(new Error('Faltan horarios para el plan'), { status: 400 });
  }
  const idsUnicos = [...new Set(lista.map((t) => String(t.turnoId)))];
  if (idsUnicos.length !== lista.length) {
    throw Object.assign(new Error('Elegiste el mismo horario más de una vez'), { status: 400 });
  }

  const tel = String(telefono || '').replace(/\D/g, '');
  const emailOk = String(email || '').trim() || `${tel || 'nuevo'}@whatsapp.local`;
  const semanaVista = getSemanaActual();

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

  let nEsperado = Number(clasesEsperadas);
  if (!Number.isFinite(nEsperado) || nEsperado <= 0) {
    nEsperado = Number(actividad?.clases_por_semana);
  }
  if (!Number.isFinite(nEsperado) || nEsperado <= 0) {
    const nom = String(actividad?.nombre || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const m = nom.match(/(\d+)\s*(x|veces|clase)/);
    if (m) nEsperado = Number(m[1]);
  }
  if (Number.isFinite(nEsperado) && nEsperado > 0 && lista.length !== nEsperado) {
    throw Object.assign(
      new Error(`Este plan es de ${nEsperado} clase${nEsperado === 1 ? '' : 's'} por semana. Elegí ${nEsperado}.`),
      { status: 400 }
    );
  }

  const cupos = await listarCuposDisponibles({ limite: 200 });
  const turnosDb = [];
  for (const item of lista) {
    const tid = item.turnoId;
    const { rows: turnoRows } = await db.query(
      'SELECT id, dia_semana, hora, titulo, cupo, alumno_ids FROM turnos WHERE id = $1 AND sucursal_id = $2',
      [tid, sucursal.id]
    );
    if (!turnoRows.length) {
      throw Object.assign(new Error('Uno de los turnos no existe'), { status: 404 });
    }
    const turno = turnoRows[0];
    const cupoOk = cupos.find((c) => c.turnoId === tid && c.semana === semanaVista && c.libres > 0);
    if (!cupoOk) {
      const dia = DIAS[Number(turno.dia_semana)] || 'Día';
      const hora = String(turno.hora || '').slice(0, 5);
      throw Object.assign(new Error(`Sin cupo en ${dia} ${hora}. Elegí otro.`), { status: 400 });
    }
    turnosDb.push(turno);
  }

  const alumnoId = crypto.randomUUID();
  const desc = `Alta por WhatsApp (chatbot). Actividad / plan semanal.`;

  try {
    await db.query(
      `INSERT INTO alumnos (
         id, sucursal_id, nombre, apellido, dni, telefono, email,
         fecha_vencimiento_cuota, actividad_id, a_prueba,
         clases_asistidas, clases_para_recuperar, descripcion, activo, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,false,0,0,$9,true,NOW())`,
      [alumnoId, sucursal.id, nombreOk, apellidoOk, dniNorm, tel, emailOk, actividad?.id || null, desc]
    );
  } catch (err) {
    if (esErrorDniUnique(err)) {
      const existente = await buscarAlumnoPorDni(dniNorm);
      throw errorDniDuplicado(existente);
    }
    throw err;
  }

  const clases = [];
  for (const turno of turnosDb) {
    const ids = [...(turno.alumno_ids || []).map(String)];
    if (!ids.includes(alumnoId)) ids.push(alumnoId);
    await db.query('UPDATE turnos SET alumno_ids = $1 WHERE id = $2 AND sucursal_id = $3', [
      ids,
      turno.id,
      sucursal.id,
    ]);
    await db.query(
      `INSERT INTO inscripciones_turno (id, turno_id, alumno_id, semana_desde, a_prueba, created_at)
       VALUES ($1, $2, $3, $4, false, NOW())`,
      [crypto.randomUUID(), turno.id, alumnoId, semanaVista]
    );
    try {
      await db.query(
        'INSERT INTO notificaciones (id, sucursal_id, tipo, alumno_id, turno_id) VALUES ($1, $2, $3, $4, $5)',
        [crypto.randomUUID(), sucursal.id, 'inscribio', alumnoId, turno.id]
      );
    } catch (err) {
      console.error('[chatbot registro actividad] notificación', err?.message || err);
    }
    clases.push(labelClaseFromTurno(turno, semanaVista));
  }

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
      a_prueba: false,
    },
    actividad: actividad
      ? {
          id: actividad.id,
          nombre: actividad.nombre,
          precio: Number(actividad.precio) || 0,
          clasesPorSemana: actividad.clases_por_semana,
        }
      : null,
    clases,
  };

  avisarProfesorChatbot({
    tipo: 'actividad',
    alumno: result.alumno,
    extraLabel: clases.map((c) => c.label).join(' | '),
  }).catch((e) => console.error('[whatsapp registro actividad]', e?.message || e));

  return result;
}

export { getSemanaActual, semanaPortalSiguiente };
