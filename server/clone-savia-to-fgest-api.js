/**
 * Clona Savia → Fgest vía API de producción (DNIs +10).
 * Uso: node server/clone-savia-to-fgest-api.js
 */
import crypto from 'node:crypto';

const BASE = (process.env.CLONE_API_BASE || 'https://pilates-production-b49a.up.railway.app').replace(/\/$/, '');
const SOURCE_USER = process.env.CLONE_SOURCE_USER || 'Savia';
const SOURCE_PASS = process.env.CLONE_SOURCE_PASS || '2286';
const TARGET_USER = process.env.CLONE_TARGET_USER || 'Fgest';
const TARGET_PASS = process.env.CLONE_TARGET_PASS || '2286';
const DNI_OFFSET = BigInt(process.env.CLONE_DNI_OFFSET || '10');

async function login(usuario, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw new Error(`Login ${usuario} falló: ${data.error || res.status}`);
  }
  return data;
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, ok: res.ok };
}

function dniPlus10(dni) {
  const raw = String(dni || '').trim();
  if (!raw) return String(Date.now());
  if (/^\d+$/.test(raw)) return String(BigInt(raw) + DNI_OFFSET);
  return `${raw}+${DNI_OFFSET}`;
}

async function main() {
  console.log(`Clonando ${SOURCE_USER} → ${TARGET_USER} en ${BASE}`);
  const src = await login(SOURCE_USER, SOURCE_PASS);
  const dst = await login(TARGET_USER, TARGET_PASS);
  const srcTok = src.token;
  const dstTok = dst.token;

  const [actividades, profesores, alumnos, turnos, pagos, insc] = await Promise.all([
    api(srcTok, 'GET', '/api/actividades'),
    api(srcTok, 'GET', '/api/profesores'),
    api(srcTok, 'GET', '/api/alumnos?includeInactive=1'),
    api(srcTok, 'GET', '/api/turnos'),
    api(srcTok, 'GET', '/api/pagos'),
    api(srcTok, 'GET', '/api/inscripciones-turno'),
  ]);

  if (!actividades.ok || !profesores.ok || !alumnos.ok || !turnos.ok) {
    throw new Error('No pude leer datos de origen');
  }

  const actMap = new Map();
  const profMap = new Map();
  const alumnoMap = new Map();
  const turnoMap = new Map();
  const usedDnis = new Set();

  let cAct = 0;
  for (const a of actividades.data) {
    const id = crypto.randomUUID();
    actMap.set(a.id, id);
    const r = await api(dstTok, 'POST', '/api/actividades', {
      id,
      nombre: a.nombre,
      precio: a.precio,
      clasesPorSemana: a.clasesPorSemana,
      createdAt: a.createdAt,
    });
    if (r.ok) cAct++;
    else console.warn('actividad fail', a.nombre, r.status, r.data);
  }

  let cProf = 0;
  for (const p of profesores.data) {
    const id = crypto.randomUUID();
    profMap.set(p.id, id);
    const r = await api(dstTok, 'POST', '/api/profesores', {
      id,
      nombre: p.nombre,
      apellido: p.apellido,
      createdAt: p.createdAt,
    });
    if (r.ok) cProf++;
    else console.warn('profesor fail', p.nombre, r.status, r.data);
  }

  let cAlu = 0;
  for (const a of alumnos.data) {
    const id = crypto.randomUUID();
    alumnoMap.set(a.id, id);
    let dni = dniPlus10(a.dni);
    while (usedDnis.has(dni)) {
      dni = /^\d+$/.test(dni) ? String(BigInt(dni) + DNI_OFFSET) : `${dni}x`;
    }
    usedDnis.add(dni);
    const r = await api(dstTok, 'POST', '/api/alumnos', {
      id,
      nombre: a.nombre,
      apellido: a.apellido,
      dni,
      telefono: a.telefono,
      email: a.email,
      fechaVencimientoCuota: a.fechaVencimientoCuota || null,
      actividadId: a.actividadId ? actMap.get(a.actividadId) || null : null,
      aPrueba: a.aPrueba === true,
      clasesAsistidas: a.clasesAsistidas ?? 0,
      clasesParaRecuperar: a.clasesParaRecuperar ?? 0,
      descripcion: a.descripcion ?? null,
      activo: a.activo !== false,
      createdAt: a.createdAt,
    });
    if (r.ok) cAlu++;
    else console.warn('alumno fail', a.nombre, a.apellido, r.status, r.data);
  }

  let cTur = 0;
  for (const t of turnos.data) {
    const id = crypto.randomUUID();
    turnoMap.set(t.id, id);
    const alumnoIds = (t.alumnoIds || []).map((old) => alumnoMap.get(old)).filter(Boolean);
    const r = await api(dstTok, 'POST', '/api/turnos', {
      id,
      diaSemana: t.diaSemana,
      hora: t.hora,
      titulo: t.titulo,
      profesorId: t.profesorId ? profMap.get(t.profesorId) || null : null,
      alumnoIds,
      cupo: t.cupo ?? 6,
      destacado: !!t.destacado,
    });
    if (r.ok || r.status === 201) {
      cTur++;
      // si el POST no acepta id custom, capturar id creado
      if (r.data?.id && r.data.id !== id) turnoMap.set(t.id, r.data.id);
    } else console.warn('turno fail', t.diaSemana, t.hora, r.status, r.data);
  }

  // Releer turnos destino para mapear por franja si el POST no respetó id
  const destTurnos = await api(dstTok, 'GET', '/api/turnos');
  if (destTurnos.ok) {
    const bySlot = new Map();
    for (const t of destTurnos.data) {
      bySlot.set(`${t.diaSemana}|${String(t.hora).slice(0, 5)}|${t.titulo || ''}`, t.id);
    }
    for (const t of turnos.data) {
      if (!turnoMap.get(t.id) || !destTurnos.data.find((x) => x.id === turnoMap.get(t.id))) {
        const key = `${t.diaSemana}|${String(t.hora).slice(0, 5)}|${t.titulo || ''}`;
        if (bySlot.has(key)) turnoMap.set(t.id, bySlot.get(key));
      }
    }
  }

  let cPag = 0;
  if (pagos.ok) {
    for (const p of pagos.data) {
      const alumnoId = p.alumnoId ? alumnoMap.get(p.alumnoId) : null;
      if (!alumnoId) continue;
      const r = await api(dstTok, 'POST', '/api/pagos', {
        id: crypto.randomUUID(),
        alumnoId,
        monto: p.monto,
        metodoPago: p.metodoPago,
        fecha: p.fecha,
        hora: p.hora,
        descripcion: p.descripcion,
        createdAt: p.createdAt,
      });
      if (r.ok) cPag++;
    }
  }

  let cIns = 0;
  if (insc.ok) {
    for (const i of insc.data) {
      const turnoId = turnoMap.get(i.turnoId);
      const alumnoId = alumnoMap.get(i.alumnoId);
      if (!turnoId || !alumnoId) continue;
      const r = await api(dstTok, 'POST', '/api/inscripciones-turno', {
        turnoId,
        alumnoId,
        semanaDesde: i.semanaDesde,
        aPrueba: i.aPrueba === true,
      });
      if (r.ok || r.status === 201) cIns++;
    }
  }

  const check = await api(dstTok, 'GET', '/api/alumnos?includeInactive=1');
  const checkT = await api(dstTok, 'GET', '/api/turnos');
  console.log('Copiado:', {
    actividades: cAct,
    profesores: cProf,
    alumnos: cAlu,
    turnos: cTur,
    pagos: cPag,
    inscripciones: cIns,
  });
  console.log('Fgest ahora:', {
    alumnos: Array.isArray(check.data) ? check.data.length : check,
    turnos: Array.isArray(checkT.data) ? checkT.data.length : checkT,
  });
  console.log(`Login: usuario ${TARGET_USER} / clave ${TARGET_PASS}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
