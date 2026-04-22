/**
 * Savia3 / Railway: datos para capturas — alumnos con nombres realistas,
 * turnos bastante llenos, liberaciones de cupo y recuperaciones en la semana actual.
 *
 * Limpia solo demos previos: email @foto-demo.local o seed.%@cupos.local en esa sucursal.
 *
 *   DATABASE_URL=... npm run seed:savia3-foto-demo
 *   SEED_FOTO_ALUMNOS=50 DATABASE_URL=... npm run seed:savia3-foto-demo
 */
import 'dotenv/config';
import pg from 'pg';
import crypto from 'node:crypto';

const getDatabaseUrl = () =>
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_CONNECTION_STRING;

const NUM_ALUMNOS = Math.min(80, Math.max(20, parseInt(process.env.SEED_FOTO_ALUMNOS || '50', 10) || 50));

function sslForUrl(databaseUrl) {
  return databaseUrl.includes('railway') || databaseUrl.includes('amazonaws.com')
    ? { rejectUnauthorized: false }
    : undefined;
}

function getSemanaActual() {
  const hoy = new Date();
  const año = hoy.getFullYear();
  const inicioAño = new Date(año, 0, 1);
  const dias = Math.floor((hoy.getTime() - inicioAño.getTime()) / (24 * 60 * 60 * 1000));
  const semana = Math.ceil((dias + inicioAño.getDay() + 1) / 7);
  return `${año}-${String(semana).padStart(2, '0')}`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function resolveSucursal(client) {
  const forzarId = (process.env.SUCURSAL_SEED_ID || process.env.PLANIF_SEED_SUCURSAL_ID || '').trim();
  if (forzarId) {
    const r = await client.query('SELECT id, nombre_lugar, usuario FROM sucursales WHERE id = $1', [forzarId]);
    if (r.rows.length === 0) throw new Error(`No hay sucursal con id ${forzarId}`);
    return r.rows[0];
  }
  const r = await client.query(
    `SELECT id, nombre_lugar, usuario FROM sucursales
     WHERE LOWER(TRIM(nombre_lugar)) IN ('savia3', 'savia 3')
        OR LOWER(nombre_lugar) LIKE '%savia3%'
        OR LOWER(REPLACE(nombre_lugar, ' ', '')) LIKE '%savia3%'
        OR LOWER(usuario) IN ('savia3', 'savia3!')
        OR LOWER(usuario) LIKE 'savia3%'
     ORDER BY nombre_lugar
     LIMIT 1`
  );
  if (r.rows.length === 0) {
    const { rows: all } = await client.query('SELECT id, nombre_lugar, usuario FROM sucursales ORDER BY nombre_lugar');
    console.error('No se encontró Savia3. Sucursales:');
    all.forEach((s) => console.error(`  - ${s.nombre_lugar} (${s.usuario}) id=${s.id}`));
    throw new Error('Definí SUCURSAL_SEED_ID=<uuid>.');
  }
  return r.rows[0];
}

/** Parejas [nombre, apellido] realistas. */
const PERSONAS = [
  ['Valentina', 'Acosta'],
  ['Martín', 'Benítez'],
  ['Lucía', 'Castro'],
  ['Joaquín', 'Domínguez'],
  ['Camila', 'Ferreyra'],
  ['Tomás', 'Giménez'],
  ['Sofía', 'Herrera'],
  ['Ignacio', 'Ibarra'],
  ['Julieta', 'Juárez'],
  ['Facundo', 'Kramer'],
  ['Agustina', 'López'],
  ['Mateo', 'Morales'],
  ['Renata', 'Navarro'],
  ['Bruno', 'Ortiz'],
  ['Emma', 'Pérez'],
  ['Benjamín', 'Quiroga'],
  ['Olivia', 'Ramírez'],
  ['Simón', 'Suárez'],
  ['Isabella', 'Torres'],
  ['Lautaro', 'Vega'],
  ['Malena', 'Weiss'],
  ['Nicolás', 'Yáñez'],
  ['Mora', 'Zabala'],
  ['Felipe', 'Álvarez'],
  ['Victoria', 'Blanco'],
  ['Gonzalo', 'Correa'],
  ['Paula', 'Díaz'],
  ['Andrés', 'Estévez'],
  ['Carla', 'Franco'],
  ['Diego', 'Gallo'],
  ['Mariana', 'Haedo'],
  ['Pablo', 'Insúa'],
  ['Laura', 'Jerez'],
  ['Federico', 'Kovacs'],
  ['Daniela', 'Luna'],
  ['Ricardo', 'Mansilla'],
  ['Florencia', 'Núñez'],
  ['Emilio', 'Ocampo'],
  ['Catalina', 'Peralta'],
  ['Hernán', 'Quintana'],
  ['Ana', 'Rossi'],
  ['Lucas', 'Soria'],
  ['Gabriela', 'Tello'],
  ['Sebastián', 'Uribe'],
  ['Natalia', 'Vera'],
  ['Maximiliano', 'Wainer'],
  ['Carolina', 'Acuña'],
  ['Alejandro', 'Bustos'],
  ['Rocío', 'Cardozo'],
  ['Marcos', 'Delgado'],
  ['Verónica', 'Espinosa'],
  ['Leandro', 'Farías'],
  ['Silvina', 'Gómez'],
  ['Gustavo', 'Heinze'],
  ['Patricia', 'Irala'],
  ['Rodrigo', 'Ledesma'],
  ['Andrea', 'Maidana'],
  ['Christian', 'Nuñez'],
  ['Elena', 'Ortega'],
  ['Matías', 'Páez'],
  ['Claudia', 'Ramos'],
  ['Sergio', 'Sánchez'],
  ['Mónica', 'Taborda'],
  ['Walter', 'Vázquez'],
  ['Griselda', 'Zárate'],
  ['Fernando', 'Arias'],
  ['Romina', 'Bravo'],
  ['Javier', 'Cáceres'],
  ['Melina', 'Duarte'],
];

function targetOcupacion(cupo, actual) {
  const cap = Math.max(1, Number(cupo) || 6);
  if (cap <= 2) return cap;
  const dejarLibres = cap >= 4 ? 1 + Math.floor(Math.random() * 2) : 1;
  return Math.min(cap, Math.max(actual, cap - dejarLibres));
}

function armarListaPersonas(n) {
  const base = shuffle(PERSONAS);
  const out = [];
  for (let i = 0; i < n; i++) {
    const [nom, ape] = base[i % base.length];
    const suf = Math.floor(i / base.length);
    out.push([nom, suf === 0 ? ape : `${ape} ${suf + 1}`]);
  }
  return out;
}

async function limpiarDemoAnterior(client, sid) {
  const { rows } = await client.query(
    `SELECT id FROM alumnos WHERE sucursal_id = $1
       AND (email LIKE '%@foto-demo.local' OR email LIKE 'seed.%@cupos.local')`,
    [sid]
  );
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  console.log(`Limpiando ${ids.length} alumno(s) de demos anteriores…`);
  const idArr = ids;
  await client.query(`DELETE FROM liberaciones_semana WHERE alumno_id = ANY($1::text[])`, [idArr]);
  await client.query(`DELETE FROM recuperaciones WHERE alumno_id = ANY($1::text[])`, [idArr]);
  await client.query(`DELETE FROM inscripciones_turno WHERE alumno_id = ANY($1::text[])`, [idArr]);
  await client.query(`DELETE FROM notificaciones WHERE alumno_id = ANY($1::text[])`, [idArr]);
  await client.query(`DELETE FROM push_subscriptions WHERE alumno_id = ANY($1::text[])`, [idArr]);
  await client.query(`DELETE FROM asistencias WHERE alumno_id = ANY($1::text[])`, [idArr]);
  await client.query(`DELETE FROM pagos WHERE alumno_id = ANY($1::text[])`, [idArr]);
  await client.query(`DELETE FROM alumnos WHERE id = ANY($1::text[])`, [idArr]);

  const { rows: turnos } = await client.query(
    `SELECT id, COALESCE(alumno_ids, ARRAY[]::text[]) AS alumno_ids FROM turnos WHERE sucursal_id = $1`,
    [sid]
  );
  const set = new Set(ids);
  for (const t of turnos) {
    const next = (t.alumno_ids || []).filter((x) => !set.has(x));
    if (next.length !== (t.alumno_ids || []).length) {
      await client.query(`UPDATE turnos SET alumno_ids = $1 WHERE id = $2`, [next, t.id]);
    }
  }
}

async function cupoLibre(client, turnoId, semana) {
  const { rows } = await client.query(
    `SELECT t.cupo, COALESCE(t.alumno_ids, ARRAY[]::text[]) AS ids,
            COALESCE((SELECT COUNT(*)::int FROM liberaciones_semana l WHERE l.turno_id = t.id AND l.semana = $2), 0) AS libs,
            COALESCE((SELECT COUNT(*)::int FROM recuperaciones r WHERE r.turno_id = t.id AND r.semana = $2), 0) AS recs
       FROM turnos t WHERE t.id = $1`,
    [turnoId, semana]
  );
  if (rows.length === 0) return -1;
  const cupo = Number(rows[0].cupo) || 6;
  const n = (rows[0].ids || []).length;
  const libs = Number(rows[0].libs) || 0;
  const recs = Number(rows[0].recs) || 0;
  const totalFijos = Math.max(0, n - libs);
  return cupo - totalFijos - recs;
}

async function main() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error('Falta DATABASE_URL.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: sslForUrl(databaseUrl) });
  const client = await pool.connect();
  const semana = getSemanaActual();

  try {
    await client.query('BEGIN');
    const suc = await resolveSucursal(client);
    const sid = suc.id;
    console.log(`Sucursal: ${suc.nombre_lugar} (${suc.usuario}) id=${sid}`);
    console.log(`Semana: ${semana}\n`);

    await limpiarDemoAnterior(client, sid);

    let { rows: acts } = await client.query(
      'SELECT id FROM actividades WHERE sucursal_id = $1 ORDER BY created_at NULLS LAST LIMIT 1',
      [sid]
    );
    let actividadId = acts[0]?.id;
    if (!actividadId) {
      actividadId = crypto.randomUUID();
      await client.query(
        `INSERT INTO actividades (id, sucursal_id, nombre, precio, created_at) VALUES ($1, $2, $3, $4, NOW())`,
        [actividadId, sid, 'Pilates grupal', 32000]
      );
    }

    const { rows: fvRow } = await client.query(
      `SELECT ((timezone('America/Argentina/Buenos_Aires', now()))::date + interval '45 days')::text AS d`
    );
    const fechaVenc = fvRow[0].d;
    const batch = Date.now().toString(36).slice(-6);
    const listaPersonas = armarListaPersonas(NUM_ALUMNOS);
    const creados = [];

    for (let i = 0; i < NUM_ALUMNOS; i++) {
      const id = crypto.randomUUID();
      const [nombre, apellido] = listaPersonas[i];
      const dni = `97${batch}${String(i).padStart(3, '0')}`.slice(0, 32);
      const telefono = `2234${String(100000 + i).slice(-6)}`;
      const email = `alumno.${batch}.${i}@foto-demo.local`;

      await client.query(
        `INSERT INTO alumnos (id, sucursal_id, nombre, apellido, dni, telefono, email, fecha_vencimiento_cuota, actividad_id, clases_asistidas, clases_para_recuperar, descripcion, activo, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, 0, 0, NULL, true, NOW())`,
        [id, sid, nombre, apellido, dni, telefono, email, fechaVenc, actividadId]
      );
      creados.push({ id, nombre, apellido });
    }
    console.log(`Insertados ${creados.length} alumnos (@foto-demo.local).`);

    const { rows: preRows } = await client.query('SELECT precio::numeric AS p FROM actividades WHERE id = $1', [actividadId]);
    const montoCuota = preRows[0]?.p != null ? Number(preRows[0].p) : 37000;
    let pagosInsertados = 0;
    for (const row of creados) {
      await client.query(
        `INSERT INTO pagos (id, alumno_id, monto, metodo_pago, fecha, created_at, descripcion, sucursal_id, hora)
         VALUES ($1, $2, $3, 'transferencia', ($4::date - interval '1 month')::date, NOW(), NULL, NULL, '10:00')`,
        [crypto.randomUUID(), row.id, montoCuota, fechaVenc]
      );
      pagosInsertados++;
    }
    console.log(`Pagos iniciales (para estado “al día” en la lista): ${pagosInsertados}.\n`);

    const { rows: turnosRows } = await client.query(
      `SELECT id, cupo, COALESCE(alumno_ids, ARRAY[]::text[]) AS alumno_ids FROM turnos WHERE sucursal_id = $1`,
      [sid]
    );

    if (turnosRows.length === 0) {
      console.log('No hay turnos: solo alumnos creados.');
      await client.query('COMMIT');
      return;
    }

    let poolIds = shuffle(creados.map((c) => c.id));
    const inscribir = async (turnoId, ids, alumnoId) => {
      await client.query(
        `INSERT INTO inscripciones_turno (id, turno_id, alumno_id, semana_desde, created_at) VALUES ($1, $2, $3, $4, NOW())`,
        [crypto.randomUUID(), turnoId, alumnoId, semana]
      );
      ids.push(alumnoId);
    };

    let asignaciones = 0;
    for (const t of shuffle(turnosRows)) {
      const ids = [...(t.alumno_ids || [])];
      const cap = t.cupo ?? 6;
      const meta = targetOcupacion(cap, ids.length);
      while (ids.length < meta && poolIds.length > 0) {
        const aid = poolIds.pop();
        if (!aid || ids.includes(aid)) continue;
        await inscribir(t.id, ids, aid);
        asignaciones++;
      }
      await client.query(`UPDATE turnos SET alumno_ids = $1 WHERE id = $2 AND sucursal_id = $3`, [ids, t.id, sid]);
    }

    let guard = 0;
    while (poolIds.length > 0 && guard < 8000) {
      guard++;
      const { rows: trows } = await client.query(
        `SELECT id, cupo, COALESCE(alumno_ids, ARRAY[]::text[]) AS alumno_ids FROM turnos WHERE sucursal_id = $1`,
        [sid]
      );
      const conLugar = trows.filter((t) => {
        const cap = t.cupo ?? 6;
        const ids = [...(t.alumno_ids || [])];
        const maxSoft = cap <= 2 ? cap : cap - 1;
        return ids.length < maxSoft;
      });
      if (conLugar.length === 0) break;
      const t = conLugar[guard % conLugar.length];
      const ids = [...(t.alumno_ids || [])];
      const cap = t.cupo ?? 6;
      const maxSoft = cap <= 2 ? cap : cap - 1;
      if (ids.length >= maxSoft) continue;
      const aid = poolIds.pop();
      if (!aid || ids.includes(aid)) {
        if (aid) poolIds.unshift(aid);
        continue;
      }
      await inscribir(t.id, ids, aid);
      asignaciones++;
      await client.query(`UPDATE turnos SET alumno_ids = $1 WHERE id = $2 AND sucursal_id = $3`, [ids, t.id, sid]);
    }

    while (poolIds.length > 0) {
      const aid = poolIds[0];
      const { rows: trows } = await client.query(
        `SELECT id, cupo, COALESCE(alumno_ids, ARRAY[]::text[]) AS alumno_ids FROM turnos WHERE sucursal_id = $1`,
        [sid]
      );
      let ok = false;
      for (const t of shuffle(trows)) {
        const ids = [...(t.alumno_ids || [])];
        const cap = t.cupo ?? 6;
        if (ids.length < cap && !ids.includes(aid)) {
          await inscribir(t.id, ids, aid);
          asignaciones++;
          await client.query(`UPDATE turnos SET alumno_ids = $1 WHERE id = $2 AND sucursal_id = $3`, [ids, t.id, sid]);
          ok = true;
          break;
        }
      }
      if (!ok) break;
      poolIds.shift();
    }

    console.log(`Asignaciones a turnos (inscripciones): ${asignaciones}.`);
    if (poolIds.length) console.log(`Sin turno: ${poolIds.length} alumno(s).\n`);
    else console.log('');

    const { rows: turnosFresh } = await client.query(
      `SELECT id, cupo, COALESCE(alumno_ids, ARRAY[]::text[]) AS alumno_ids FROM turnos WHERE sucursal_id = $1`,
      [sid]
    );

    const candidatosLib = [];
    for (const t of turnosFresh) {
      const ids = [...(t.alumno_ids || [])];
      if (ids.length >= 2) {
        for (const aid of shuffle(ids).slice(0, 2)) {
          candidatosLib.push({ turnoId: t.id, alumnoId: aid });
        }
      } else if (ids.length === 1) {
        candidatosLib.push({ turnoId: t.id, alumnoId: ids[0] });
      }
    }
    shuffle(candidatosLib);
    const libsAInsertar = candidatosLib.slice(0, 6);
    const yaLib = new Set();
    const liberados = [];
    for (const { turnoId, alumnoId } of libsAInsertar) {
      const k = `${turnoId}:${alumnoId}`;
      if (yaLib.has(k)) continue;
      yaLib.add(k);
      const { rows: ex } = await client.query(
        `SELECT 1 FROM liberaciones_semana WHERE turno_id = $1 AND alumno_id = $2 AND semana = $3`,
        [turnoId, alumnoId, semana]
      );
      if (ex.length) continue;
      await client.query(
        `INSERT INTO liberaciones_semana (id, turno_id, alumno_id, semana, created_at) VALUES ($1, $2, $3, $4, NOW())`,
        [crypto.randomUUID(), turnoId, alumnoId, semana]
      );
      await client.query(
        `UPDATE alumnos SET clases_para_recuperar = COALESCE(clases_para_recuperar, 0) + 1 WHERE id = $1 AND sucursal_id = $2`,
        [alumnoId, sid]
      );
      liberados.push({ turnoId, alumnoId });
    }
    console.log(`Liberaciones de cupo (semana ${semana}): ${liberados.length}.`);

    const todosIds = creados.map((c) => c.id);
    const { rows: turnosParaRec } = await client.query(
      `SELECT id, cupo, COALESCE(alumno_ids, ARRAY[]::text[]) AS alumno_ids FROM turnos WHERE sucursal_id = $1`,
      [sid]
    );

    let recCount = 0;
    const conCredito = liberados.slice(0, 4);
    for (const { alumnoId } of conCredito) {
      const candidatosTurnos = shuffle(turnosParaRec).filter((t) => !(t.alumno_ids || []).includes(alumnoId));
      for (const t of candidatosTurnos) {
        const lib = await cupoLibre(client, t.id, semana);
        if (lib <= 0) continue;
        const { rows: dupe } = await client.query(
          `SELECT 1 FROM recuperaciones WHERE alumno_id = $1 AND turno_id = $2 AND semana = $3`,
          [alumnoId, t.id, semana]
        );
        if (dupe.length) continue;
        await client.query(
          `INSERT INTO recuperaciones (id, turno_id, alumno_id, semana, usa_credito, origen_credito, created_at)
           VALUES ($1, $2, $3, $4, true, 'liberacion', NOW())`,
          [crypto.randomUUID(), t.id, alumnoId, semana]
        );
        await client.query(
          `UPDATE alumnos SET clases_para_recuperar = GREATEST(0, COALESCE(clases_para_recuperar, 0) - 1) WHERE id = $1`,
          [alumnoId]
        );
        recCount++;
        break;
      }
    }

    const sinLib = shuffle(todosIds).filter((id) => !liberados.some((l) => l.alumnoId === id));
    for (const alumnoId of sinLib.slice(0, 5)) {
      const candidatosTurnos = shuffle(turnosParaRec).filter((t) => !(t.alumno_ids || []).includes(alumnoId));
      for (const t of candidatosTurnos) {
        const lib = await cupoLibre(client, t.id, semana);
        if (lib <= 0) continue;
        const { rows: dupe } = await client.query(
          `SELECT 1 FROM recuperaciones WHERE alumno_id = $1 AND turno_id = $2 AND semana = $3`,
          [alumnoId, t.id, semana]
        );
        if (dupe.length) continue;
        await client.query(
          `INSERT INTO recuperaciones (id, turno_id, alumno_id, semana, usa_credito, origen_credito, created_at)
           VALUES ($1, $2, $3, $4, false, NULL, NOW())`,
          [crypto.randomUUID(), t.id, alumnoId, semana]
        );
        recCount++;
        break;
      }
    }

    console.log(`Recuperaciones anotadas (semana ${semana}): ${recCount}.`);

    await client.query('COMMIT');
    console.log('\nListo. Refrescá el calendario / portal para las capturas.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
