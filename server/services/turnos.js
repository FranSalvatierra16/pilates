import crypto from 'node:crypto';
import { getPool } from '../db/index.js';
import { getSucursalChatbot } from './alumnos.js';
import { avisarProfesorChatbot } from './whatsapp.js';

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
 * Clases fijas + recuperaciones del alumno (esta y próxima semana) para liberar/cancelar.
 */
export async function listarClasesParaLiberar(alumno) {
  const db = await getPool();
  if (!db || !alumno?.id || !alumno?.sucursal_id) return { semanaActual: '', semanaSiguiente: '', opciones: [] };

  const semanaActual = getSemanaActual();
  const semanaSiguiente = semanaPortalSiguiente(semanaActual);
  const semanas = [semanaActual, semanaSiguiente];

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

  for (const semana of semanas) {
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
        tipo: 'fija',
        recuperacionId: null,
        label: `${etiquetaSemana} · ${dia} ${formatoFechaCorta(fecha)} ${hora} — fija${yaLiberada ? ' (ya liberada)' : ''}`,
      });
    }
  }

  // Recuperaciones anotadas (para poder cancelarlas / "liberarlas")
  const { rows: recRows } = await db.query(
    `SELECT r.id AS recuperacion_id, r.turno_id, r.semana, r.usa_credito,
            t.dia_semana, t.hora, t.titulo
     FROM recuperaciones r
     JOIN turnos t ON t.id = r.turno_id
     WHERE r.alumno_id = $1
       AND r.semana = ANY($2::text[])
       AND t.sucursal_id = $3
     ORDER BY r.semana, t.dia_semana, t.hora`,
    [alumno.id, semanas, alumno.sucursal_id]
  );

  for (const r of recRows) {
    const semana = r.semana;
    const etiquetaSemana = semana === semanaActual ? 'Esta semana' : 'Próxima semana';
    const fecha = getFechaFromSemanaYDia(semana, r.dia_semana);
    const dia = DIAS[Number(r.dia_semana)] || `Día ${r.dia_semana}`;
    const titulo = String(r.titulo || 'Clase').trim() || 'Clase';
    const hora = String(r.hora || '').slice(0, 5);

    opciones.push({
      turnoId: r.turno_id,
      semana,
      etiquetaSemana,
      dia,
      hora,
      titulo,
      fecha,
      yaLiberada: false,
      liberacionId: null,
      tipo: 'recuperacion',
      recuperacionId: r.recuperacion_id,
      usaCredito: !!r.usa_credito,
      label: `${etiquetaSemana} · ${dia} ${formatoFechaCorta(fecha)} ${hora} — recup`,
    });
  }

  opciones.sort((a, b) => {
    if (a.semana !== b.semana) return a.semana < b.semana ? -1 : 1;
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    const hc = String(a.hora).localeCompare(String(b.hora));
    if (hc !== 0) return hc;
    // Fijas antes que recup en mismo horario
    if (a.tipo !== b.tipo) return a.tipo === 'fija' ? -1 : 1;
    return 0;
  });

  return { semanaActual, semanaSiguiente, opciones };
}

/**
 * Libera una clase fija O cancela una recuperación (chatbot).
 * @param {object} alumno
 * @param {string} turnoId
 * @param {string} semana
 * @param {{ tipo?: string, recuperacionId?: string }} [meta]
 */
export async function liberarClaseFija(alumno, turnoId, semana, meta = {}) {
  const db = await getPool();
  if (!db) throw new Error('Base de datos no configurada');

  const semanaVista = String(semana || '').trim() || getSemanaActual();
  const tipo = meta.tipo === 'recuperacion' || meta.recuperacionId ? 'recuperacion' : 'fija';

  if (tipo === 'recuperacion') {
    let rec = null;
    if (meta.recuperacionId) {
      const { rows } = await db.query(
        `SELECT id, turno_id, semana, usa_credito FROM recuperaciones
         WHERE id = $1 AND alumno_id = $2`,
        [meta.recuperacionId, alumno.id]
      );
      rec = rows[0] || null;
    } else {
      const { rows } = await db.query(
        `SELECT id, turno_id, semana, usa_credito FROM recuperaciones
         WHERE alumno_id = $1 AND turno_id = $2 AND semana = $3
         LIMIT 1`,
        [alumno.id, turnoId, semanaVista]
      );
      rec = rows[0] || null;
    }
    if (!rec) {
      throw Object.assign(new Error('No encontré esa recuperación para liberar.'), { status: 404 });
    }

    const { rows: turnoRows } = await db.query(
      'SELECT id, dia_semana, hora, titulo FROM turnos WHERE id = $1 AND sucursal_id = $2',
      [rec.turno_id, alumno.sucursal_id]
    );
    if (turnoRows.length === 0) throw Object.assign(new Error('Turno no encontrado'), { status: 404 });
    const t = turnoRows[0];

    const { rowCount } = await db.query(
      'DELETE FROM recuperaciones WHERE id = $1 AND alumno_id = $2',
      [rec.id, alumno.id]
    );
    if (rowCount === 0) {
      return { ok: true, yaEstaba: true, tipo: 'recuperacion', turno: t, semana: rec.semana };
    }

    if (rec.usa_credito) {
      await db.query(
        'UPDATE alumnos SET clases_para_recuperar = COALESCE(clases_para_recuperar, 0) + 1 WHERE id = $1 AND sucursal_id = $2',
        [alumno.id, alumno.sucursal_id]
      );
    }

    try {
      await db.query('UPDATE alumnos SET actividad_arrastre_procesado_hasta = NULL WHERE id = $1', [alumno.id]);
    } catch {
      /* ignore */
    }

    try {
      await db.query(
        'INSERT INTO notificaciones (id, sucursal_id, tipo, alumno_id, turno_id) VALUES ($1, $2, $3, $4, $5)',
        [crypto.randomUUID(), alumno.sucursal_id, 'liberar', alumno.id, rec.turno_id]
      );
    } catch (err) {
      console.error('[chatbot liberar recup] notificación', err?.message || err);
    }

    avisarProfesorChatbot({
      tipo: 'liberar',
      alumno,
      turno: t,
      semana: rec.semana,
      extraLabel: `Recuperación cancelada · ${rec.semana}`,
    }).catch((e) => console.error('[whatsapp liberar recup]', e?.message || e));

    return {
      ok: true,
      yaEstaba: false,
      tipo: 'recuperacion',
      devolvioCredito: !!rec.usa_credito,
      turno: t,
      semana: rec.semana,
    };
  }

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
    return { ok: true, liberacionId: libRows[0].id, yaEstaba: true, tipo: 'fija', turno: t, semana: semanaVista };
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

  avisarProfesorChatbot({
    tipo: 'liberar',
    alumno,
    turno: t,
    semana: semanaVista,
  }).catch((e) => console.error('[whatsapp liberar]', e?.message || e));

  return { ok: true, liberacionId: id, yaEstaba: false, tipo: 'fija', turno: t, semana: semanaVista };
}

/**
 * Ocupación efectiva de un turno en una semana (fijas sin liberar + recuperaciones).
 */
async function ocupacionTurnoSemana(db, turno, semana, sucursalId) {
  const cupo = Math.max(1, Number(turno.cupo ?? 6));
  const turnoId = turno.id;

  const { rows: insRows } = await db.query(
    'SELECT alumno_id, semana_desde FROM inscripciones_turno WHERE turno_id = $1',
    [turnoId]
  );
  const insMap = new Map(insRows.map((r) => [String(r.alumno_id), r.semana_desde]));

  const { rows: libRows } = await db.query(
    'SELECT alumno_id FROM liberaciones_semana WHERE turno_id = $1 AND semana = $2',
    [turnoId, semana]
  );
  const liberados = new Set(libRows.map((r) => String(r.alumno_id)));

  const ids = (turno.alumno_ids || []).map(String);
  const candidateIds = new Set(ids);
  const { rows: recRows } = await db.query(
    'SELECT id, alumno_id FROM recuperaciones WHERE turno_id = $1 AND semana = $2',
    [turnoId, semana]
  );
  for (const r of recRows) candidateIds.add(String(r.alumno_id));

  let valid = new Set();
  if (candidateIds.size > 0) {
    const { rows: act } = await db.query(
      `SELECT id FROM alumnos
       WHERE sucursal_id = $1 AND id = ANY($2::text[]) AND activo IS DISTINCT FROM false`,
      [sucursalId, [...candidateIds]]
    );
    valid = new Set(act.map((r) => String(r.id)));
  }

  const fijos = new Set();
  for (const aid of ids) {
    if (!valid.has(aid)) continue;
    const desde = insMap.get(aid);
    if (desde && String(desde) > String(semana)) continue;
    if (liberados.has(aid)) continue;
    fijos.add(aid);
  }

  let recCount = 0;
  const seenRec = new Set();
  for (const r of recRows) {
    if (!valid.has(String(r.alumno_id))) continue;
    if (seenRec.has(r.id)) continue;
    seenRec.add(r.id);
    recCount += 1;
  }

  return { ocupacion: fijos.size + recCount, cupo, libres: Math.max(0, cupo - (fijos.size + recCount)) };
}

/**
 * Ocupación de muchos turnos × semanas en pocas queries (para el chatbot).
 */
async function ocupacionBulk(db, turnos, semanas, sucursalId) {
  const turnoIds = turnos.map((t) => t.id);
  const mapa = new Map(); // `${turnoId}|${semana}` → { libres, cupo }

  if (!turnoIds.length || !semanas.length) return mapa;

  const { rows: insRows } = await db.query(
    `SELECT turno_id, alumno_id, semana_desde
     FROM inscripciones_turno WHERE turno_id = ANY($1::text[])`,
    [turnoIds]
  );
  const insByTurno = new Map();
  for (const r of insRows) {
    if (!insByTurno.has(r.turno_id)) insByTurno.set(r.turno_id, new Map());
    insByTurno.get(r.turno_id).set(String(r.alumno_id), r.semana_desde);
  }

  const { rows: libRows } = await db.query(
    `SELECT turno_id, semana, alumno_id
     FROM liberaciones_semana
     WHERE turno_id = ANY($1::text[]) AND semana = ANY($2::text[])`,
    [turnoIds, semanas]
  );
  const libs = new Set(libRows.map((r) => `${r.turno_id}|${r.semana}|${r.alumno_id}`));

  const { rows: recRows } = await db.query(
    `SELECT id, turno_id, semana, alumno_id
     FROM recuperaciones
     WHERE turno_id = ANY($1::text[]) AND semana = ANY($2::text[])`,
    [turnoIds, semanas]
  );
  const recsByKey = new Map();
  for (const r of recRows) {
    const k = `${r.turno_id}|${r.semana}`;
    if (!recsByKey.has(k)) recsByKey.set(k, []);
    recsByKey.get(k).push(r);
  }

  const candidateIds = new Set();
  for (const t of turnos) {
    for (const id of t.alumno_ids || []) candidateIds.add(String(id));
  }
  for (const r of recRows) candidateIds.add(String(r.alumno_id));

  let valid = new Set();
  if (candidateIds.size > 0) {
    const { rows: act } = await db.query(
      `SELECT id FROM alumnos
       WHERE sucursal_id = $1 AND id = ANY($2::text[]) AND activo IS DISTINCT FROM false`,
      [sucursalId, [...candidateIds]]
    );
    valid = new Set(act.map((r) => String(r.id)));
  }

  for (const t of turnos) {
    const cupo = Math.max(1, Number(t.cupo ?? 6));
    const ids = (t.alumno_ids || []).map(String);
    const insMap = insByTurno.get(t.id) || new Map();

    for (const semana of semanas) {
      const liberados = new Set();
      for (const aid of ids) {
        if (libs.has(`${t.id}|${semana}|${aid}`)) liberados.add(aid);
      }

      const fijos = new Set();
      for (const aid of ids) {
        if (!valid.has(aid)) continue;
        const desde = insMap.get(aid);
        if (desde && String(desde) > String(semana)) continue;
        if (liberados.has(aid)) continue;
        fijos.add(aid);
      }

      const recs = recsByKey.get(`${t.id}|${semana}`) || [];
      let recCount = 0;
      const seenRec = new Set();
      for (const r of recs) {
        if (!valid.has(String(r.alumno_id))) continue;
        if (seenRec.has(r.id)) continue;
        seenRec.add(r.id);
        recCount += 1;
      }

      mapa.set(`${t.id}|${semana}`, {
        cupo,
        ocupacion: fijos.size + recCount,
        libres: Math.max(0, cupo - (fijos.size + recCount)),
      });
    }
  }

  return mapa;
}

/**
 * Turnos con cupo libre para recuperar (esta semana y la próxima).
 * Excluye fijas propias no liberadas y slots donde ya está anotado.
 */
export async function listarClasesParaRecuperar(alumno) {
  const db = await getPool();
  if (!db || !alumno?.id || !alumno?.sucursal_id) {
    return { semanaActual: '', semanaSiguiente: '', opciones: [], creditos: 0 };
  }

  const creditos = Number(alumno.clases_para_recuperar) || 0;
  const semanaActual = getSemanaActual();
  const semanaSiguiente = semanaPortalSiguiente(semanaActual);
  const semanas = [semanaActual, semanaSiguiente];

  const { rows: turnoRows } = await db.query(
    `SELECT id, dia_semana, hora, titulo, cupo, alumno_ids
     FROM turnos
     WHERE sucursal_id = $1
     ORDER BY dia_semana, hora`,
    [alumno.sucursal_id]
  );
  const turnos = dedupeTurnosPorFranja(turnoRows);
  const turnoIds = turnos.map((t) => t.id);

  const { rows: insRows } = await db.query(
    'SELECT turno_id, semana_desde FROM inscripciones_turno WHERE alumno_id = $1',
    [alumno.id]
  );
  const insByTurno = new Map(insRows.map((r) => [r.turno_id, r.semana_desde]));

  const { rows: libPropiaRows } = await db.query(
    `SELECT turno_id, semana FROM liberaciones_semana
     WHERE alumno_id = $1 AND turno_id = ANY($2::text[]) AND semana = ANY($3::text[])`,
    [alumno.id, turnoIds.length ? turnoIds : ['__none__'], semanas]
  );
  const libPropia = new Set(libPropiaRows.map((r) => `${r.turno_id}|${r.semana}`));

  const { rows: yaRecRows } = await db.query(
    `SELECT turno_id, semana FROM recuperaciones
     WHERE alumno_id = $1 AND turno_id = ANY($2::text[]) AND semana = ANY($3::text[])`,
    [alumno.id, turnoIds.length ? turnoIds : ['__none__'], semanas]
  );
  const yaRec = new Set(yaRecRows.map((r) => `${r.turno_id}|${r.semana}`));

  const occMap = await ocupacionBulk(db, turnos, semanas, alumno.sucursal_id);
  const opciones = [];

  for (const semana of semanas) {
    const etiquetaSemana = semana === semanaActual ? 'Esta semana' : 'Próxima semana';

    for (const t of turnos) {
      const esFija =
        (t.alumno_ids || []).includes(alumno.id) &&
        (!insByTurno.has(t.id) || insByTurno.get(t.id) <= semana);

      if (esFija && !libPropia.has(`${t.id}|${semana}`)) continue;
      if (yaRec.has(`${t.id}|${semana}`)) continue;

      const occ = occMap.get(`${t.id}|${semana}`);
      if (!occ || occ.libres <= 0) continue;

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
        libres: occ.libres,
        cupo: occ.cupo,
        label: `${etiquetaSemana} · ${dia} ${formatoFechaCorta(fecha)} ${hora} — ${titulo} (${occ.libres} libres)`,
      });
    }
  }

  opciones.sort((a, b) => {
    if (a.semana !== b.semana) return a.semana < b.semana ? -1 : 1;
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    return String(a.hora).localeCompare(String(b.hora));
  });

  return {
    semanaActual,
    semanaSiguiente,
    opciones,
    creditos,
  };
}

/**
 * Anota recuperación y consume 1 crédito (flujo chatbot).
 */
export async function anotarRecuperacion(alumno, turnoId, semana) {
  const db = await getPool();
  if (!db) throw new Error('Base de datos no configurada');

  const semanaVista = String(semana || '').trim() || getSemanaActual();
  const creditos = Number(alumno.clases_para_recuperar) || 0;
  if (creditos <= 0) {
    throw Object.assign(new Error('No te quedan créditos para recuperar. Primero liberá una clase fija.'), {
      status: 400,
    });
  }

  const { rows: turnoRows } = await db.query(
    'SELECT id, alumno_ids, cupo, dia_semana, hora, titulo FROM turnos WHERE id = $1 AND sucursal_id = $2',
    [turnoId, alumno.sucursal_id]
  );
  if (turnoRows.length === 0) throw Object.assign(new Error('Turno no encontrado'), { status: 404 });
  const t = turnoRows[0];

  const { rows: exist } = await db.query(
    'SELECT id FROM recuperaciones WHERE alumno_id = $1 AND turno_id = $2 AND semana = $3',
    [alumno.id, turnoId, semanaVista]
  );
  if (exist.length > 0) {
    return { ok: true, recuperacionId: exist[0].id, yaEstaba: true, turno: t, semana: semanaVista };
  }

  const { rows: insRows } = await db.query(
    'SELECT semana_desde FROM inscripciones_turno WHERE turno_id = $1 AND alumno_id = $2 LIMIT 1',
    [turnoId, alumno.id]
  );
  const esFija =
    (t.alumno_ids || []).includes(alumno.id) &&
    (insRows.length === 0 || insRows[0].semana_desde <= semanaVista);
  if (esFija) {
    const { rows: libPropia } = await db.query(
      'SELECT id FROM liberaciones_semana WHERE turno_id = $1 AND alumno_id = $2 AND semana = $3 LIMIT 1',
      [turnoId, alumno.id, semanaVista]
    );
    if (libPropia.length === 0) {
      throw Object.assign(
        new Error('Esa ya es una clase fija tuya. Si vas a faltar, primero liberala.'),
        { status: 400 }
      );
    }
  }

  const occ = await ocupacionTurnoSemana(db, t, semanaVista, alumno.sucursal_id);
  if (!occ || occ.libres <= 0) {
    throw Object.assign(new Error('No hay cupo libre en esa clase.'), { status: 400 });
  }

  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO recuperaciones (id, turno_id, alumno_id, semana, usa_credito, origen_credito, created_at)
     VALUES ($1, $2, $3, $4, true, 'liberacion', NOW())`,
    [id, turnoId, alumno.id, semanaVista]
  );
  await db.query(
    'UPDATE alumnos SET clases_para_recuperar = GREATEST(0, COALESCE(clases_para_recuperar, 0) - 1) WHERE id = $1 AND sucursal_id = $2',
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
      [crypto.randomUUID(), alumno.sucursal_id, 'inscribio', alumno.id, turnoId]
    );
  } catch (err) {
    console.error('[chatbot recuperar] notificación', err?.message || err);
  }

  avisarProfesorChatbot({
    tipo: 'recuperar',
    alumno,
    turno: t,
    semana: semanaVista,
  }).catch((e) => console.error('[whatsapp recuperar]', e?.message || e));

  return { ok: true, recuperacionId: id, yaEstaba: false, turno: t, semana: semanaVista, usoCredito: true };
}

/**
 * Cupos libres (esta semana y la próxima) para interesados / clase de prueba.
 * No requiere alumno existente.
 */
export async function listarCuposDisponibles({ limite = 80 } = {}) {
  const db = await getPool();
  const sucursal = await getSucursalChatbot();
  if (!db || !sucursal) {
    return [];
  }

  const semanaActual = getSemanaActual();
  const semanaSiguiente = semanaPortalSiguiente(semanaActual);
  const semanas = [semanaActual, semanaSiguiente];

  const { rows: turnoRows } = await db.query(
    `SELECT id, dia_semana, hora, titulo, cupo, alumno_ids
     FROM turnos
     WHERE sucursal_id = $1
     ORDER BY dia_semana, hora`,
    [sucursal.id]
  );
  const turnos = dedupeTurnosPorFranja(turnoRows);
  const occMap = await ocupacionBulk(db, turnos, semanas, sucursal.id);
  const opciones = [];

  for (const semana of semanas) {
    const etiquetaSemana = semana === semanaActual ? 'Esta semana' : 'Próxima semana';
    for (const t of turnos) {
      const occ = occMap.get(`${t.id}|${semana}`);
      if (!occ || occ.libres <= 0) continue;

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
        libres: occ.libres,
        cupo: occ.cupo,
        label: `${etiquetaSemana} · ${dia} ${formatoFechaCorta(fecha)} ${hora} — ${titulo} (${occ.libres} libres)`,
      });
    }
  }

  opciones.sort((a, b) => {
    if (a.semana !== b.semana) return a.semana < b.semana ? -1 : 1;
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    return String(a.hora).localeCompare(String(b.hora));
  });

  return opciones.slice(0, Math.max(1, Number(limite) || 80));
}

/**
 * Cambia un turno fijo permanente: saca del origen y anota en el destino.
 */
export async function cambiarTurnoFijo(alumno, turnoOrigenId, turnoDestinoId) {
  const db = await getPool();
  if (!db) throw new Error('Base de datos no configurada');
  if (!alumno?.id || !alumno?.sucursal_id) {
    throw Object.assign(new Error('Alumno inválido'), { status: 400 });
  }
  if (!turnoOrigenId || !turnoDestinoId) {
    throw Object.assign(new Error('Faltan turnos'), { status: 400 });
  }
  if (String(turnoOrigenId) === String(turnoDestinoId)) {
    throw Object.assign(new Error('Elegí un horario distinto al actual'), { status: 400 });
  }

  const { rows: origenRows } = await db.query(
    'SELECT id, dia_semana, hora, titulo, cupo, alumno_ids FROM turnos WHERE id = $1 AND sucursal_id = $2',
    [turnoOrigenId, alumno.sucursal_id]
  );
  if (!origenRows.length) {
    throw Object.assign(new Error('No encontré el turno actual'), { status: 404 });
  }
  const origen = origenRows[0];
  const idsOrigen = (origen.alumno_ids || []).map(String);
  if (!idsOrigen.includes(String(alumno.id))) {
    throw Object.assign(new Error('Ese no es un turno fijo tuyo'), { status: 400 });
  }

  const { rows: destRows } = await db.query(
    'SELECT id, dia_semana, hora, titulo, cupo, alumno_ids FROM turnos WHERE id = $1 AND sucursal_id = $2',
    [turnoDestinoId, alumno.sucursal_id]
  );
  if (!destRows.length) {
    throw Object.assign(new Error('No encontré el nuevo turno'), { status: 404 });
  }
  const destino = destRows[0];
  const idsDest = (destino.alumno_ids || []).map(String);
  if (idsDest.includes(String(alumno.id))) {
    throw Object.assign(new Error('Ya estás en ese horario'), { status: 400 });
  }

  const semanaVista = getSemanaActual();
  const occ = await ocupacionTurnoSemana(db, destino, semanaVista, alumno.sucursal_id);
  if (!occ || occ.libres <= 0) {
    throw Object.assign(new Error('Ese horario ya no tiene cupo libre'), { status: 400 });
  }

  const nuevosOrigen = idsOrigen.filter((id) => id !== String(alumno.id));
  await db.query('UPDATE turnos SET alumno_ids = $1 WHERE id = $2 AND sucursal_id = $3', [
    nuevosOrigen,
    turnoOrigenId,
    alumno.sucursal_id,
  ]);
  await db.query(
    'DELETE FROM inscripciones_turno WHERE turno_id = $1 AND alumno_id = $2',
    [turnoOrigenId, alumno.id]
  );

  const nuevosDest = [...idsDest, String(alumno.id)];
  await db.query('UPDATE turnos SET alumno_ids = $1 WHERE id = $2 AND sucursal_id = $3', [
    nuevosDest,
    turnoDestinoId,
    alumno.sucursal_id,
  ]);
  await db.query(
    `INSERT INTO inscripciones_turno (id, turno_id, alumno_id, semana_desde, a_prueba, created_at)
     VALUES ($1, $2, $3, $4, false, NOW())`,
    [crypto.randomUUID(), turnoDestinoId, alumno.id, semanaVista]
  );

  try {
    await db.query(
      'INSERT INTO notificaciones (id, sucursal_id, tipo, alumno_id, turno_id) VALUES ($1, $2, $3, $4, $5)',
      [crypto.randomUUID(), alumno.sucursal_id, 'liberar', alumno.id, turnoOrigenId]
    );
    await db.query(
      'INSERT INTO notificaciones (id, sucursal_id, tipo, alumno_id, turno_id) VALUES ($1, $2, $3, $4, $5)',
      [crypto.randomUUID(), alumno.sucursal_id, 'inscribio', alumno.id, turnoDestinoId]
    );
  } catch (err) {
    console.error('[chatbot cambiar] notificación', err?.message || err);
  }

  const origenLabel = `${DIAS[Number(origen.dia_semana)] || 'Día'} ${String(origen.hora || '').slice(0, 5)}`;
  const destinoLabel = `${DIAS[Number(destino.dia_semana)] || 'Día'} ${String(destino.hora || '').slice(0, 5)}`;

  avisarProfesorChatbot({
    tipo: 'cambiar',
    alumno,
    extraLabel: `${origenLabel} → ${destinoLabel}`,
  }).catch((e) => console.error('[whatsapp cambiar]', e?.message || e));

  return {
    ok: true,
    origen: { ...origen, label: origenLabel },
    destino: { ...destino, label: destinoLabel },
    origenLabel,
    destinoLabel,
  };
}

export { DIAS };
