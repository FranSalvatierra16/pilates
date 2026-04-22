/**
 * Savia3: inserta N alumnos de prueba (50 por defecto) y los reparte en turnos
 * ocupando la mayoría de cada cupo (deja 1–2 lugares libres salvo cupos chicos).
 *
 *   DATABASE_URL=... npm run seed:savia3-alumnos-cupos
 *   SEED_ALUMNOS_COUNT=50 SUCURSAL_SEED_ID=<uuid> DATABASE_URL=... npm run seed:savia3-alumnos-cupos
 *
 * DNI: prefijo 99 + batch + índice (re-ejecutar no choca si cambia el batch por tiempo).
 */
import 'dotenv/config';
import pg from 'pg';
import crypto from 'node:crypto';

const getDatabaseUrl = () =>
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_CONNECTION_STRING;

const NUM = Math.min(500, Math.max(1, parseInt(process.env.SEED_ALUMNOS_COUNT || '50', 10) || 50));

function sslForUrl(databaseUrl) {
  return databaseUrl.includes('railway') || databaseUrl.includes('amazonaws.com')
    ? { rejectUnauthorized: false }
    : undefined;
}

/** Igual que getSemanaActual en src/utils/date.ts */
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

const NOMBRES = [
  'Francisco', 'María', 'Juan', 'Ana', 'Carlos', 'Lucía', 'Martín', 'Sofía', 'Diego', 'Valentina',
  'Javier', 'Camila', 'Luis', 'Victoria', 'Pablo', 'Emma', 'Andrés', 'Mía', 'Miguel', 'Isabella',
  'Ricardo', 'Luna', 'Fernando', 'Martina', 'Gonzalo', 'Sara', 'Emilio', 'Elena', 'Nicolás', 'Rocío',
  'Alejandro', 'Clara', 'Daniel', 'Julia', 'Gabriel', 'Héctor', 'Adriana', 'Ignacio', 'Carla', 'Bruno',
  'Paula', 'Tomás', 'Luciana', 'Facundo', 'Agustina', 'Renata', 'Mateo', 'Olivia', 'Benjamín', 'Julieta',
];
const APELLIDOS = [
  'García', 'Rodríguez', 'Martínez', 'López', 'González', 'Pérez', 'Fernández', 'Gómez', 'Díaz', 'Torres',
  'Ruiz', 'Hernández', 'Sánchez', 'Romero', 'Flores', 'Acosta', 'Benítez', 'Silva', 'Mendoza', 'Castro',
  'Vargas', 'Ríos', 'Suárez', 'Molina', 'Ortiz', 'Núñez', 'Cabrera', 'Ramos', 'Vega', 'Ibarra',
  'Maldonado', 'Ponce', 'Quiroga', 'Rojas', 'Salinas', 'Toledo', 'Uribe', 'Vera', 'Yáñez', 'Acuña',
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
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

/** Objetivo de ocupación: casi lleno pero no siempre al 100 % (1 o 2 cupos libres si cupo >= 3). */
function targetOcupacion(cupo, actual) {
  const cap = Math.max(1, Number(cupo) || 6);
  if (cap <= 2) return cap;
  const dejarLibres = cap >= 4 ? 1 + Math.floor(Math.random() * 2) : 1;
  return Math.min(cap, Math.max(actual, cap - dejarLibres));
}

async function main() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error('Falta DATABASE_URL.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: sslForUrl(databaseUrl) });
  const client = await pool.connect();
  const semanaDesde = getSemanaActual();

  try {
    await client.query('BEGIN');
    const suc = await resolveSucursal(client);
    const sid = suc.id;
    console.log(`Sucursal: ${suc.nombre_lugar} (${suc.usuario}) id=${sid}`);
    console.log(`Semana inscripción (semana_desde): ${semanaDesde}`);
    console.log(`Alumnos a crear: ${NUM}\n`);

    let { rows: acts } = await client.query(
      'SELECT id FROM actividades WHERE sucursal_id = $1 ORDER BY created_at NULLS LAST LIMIT 1',
      [sid]
    );
    let actividadId = acts[0]?.id;
    if (!actividadId) {
      actividadId = crypto.randomUUID();
      await client.query(
        `INSERT INTO actividades (id, sucursal_id, nombre, precio, created_at) VALUES ($1, $2, $3, $4, NOW())`,
        [actividadId, sid, 'Clase grupal', 30000]
      );
      console.log('Creada actividad por defecto para asignar alumnos.\n');
    }

    const { rows: fvRow } = await client.query(
      `SELECT ((timezone('America/Argentina/Buenos_Aires', now()))::date + interval '45 days')::text AS d`
    );
    const fechaVenc = fvRow[0].d;

    const batch = Date.now().toString(36).slice(-8);
    const creados = [];

    for (let i = 0; i < NUM; i++) {
      const id = crypto.randomUUID();
      const dni = `99${batch}${String(i).padStart(3, '0')}`.slice(0, 32);
      const nombre = randomItem(NOMBRES);
      const apellido = randomItem(APELLIDOS);
      const telefono = `2235${String(100000 + i).slice(-6)}`;
      const email = `seed.${batch}.${i}@cupos.local`;

      await client.query(
        `INSERT INTO alumnos (id, sucursal_id, nombre, apellido, dni, telefono, email, fecha_vencimiento_cuota, actividad_id, clases_asistidas, clases_para_recuperar, descripcion, activo, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, 0, 0, NULL, true, NOW())`,
        [id, sid, nombre, apellido, dni, telefono, email, fechaVenc, actividadId]
      );
      creados.push(id);
    }
    console.log(`Insertados ${creados.length} alumnos.\n`);

    const { rows: turnosRows } = await client.query(
      `SELECT id, cupo, COALESCE(alumno_ids, ARRAY[]::text[]) AS alumno_ids FROM turnos WHERE sucursal_id = $1`,
      [sid]
    );

    if (turnosRows.length === 0) {
      console.log('No hay turnos en esta sucursal: los alumnos quedan sin clase asignada.');
      await client.query('COMMIT');
      return;
    }

    let poolIds = shuffle(creados);
    const inscribir = async (turnoId, ids, alumnoId) => {
      const insId = crypto.randomUUID();
      await client.query(
        `INSERT INTO inscripciones_turno (id, turno_id, alumno_id, semana_desde, created_at) VALUES ($1, $2, $3, $4, NOW())`,
        [insId, turnoId, alumnoId, semanaDesde]
      );
      ids.push(alumnoId);
    };

    let asignaciones = 0;
    for (const t of shuffle(turnosRows)) {
      const ids = [...(t.alumno_ids || [])];
      const cap = t.cupo ?? 6;
      let meta = targetOcupacion(cap, ids.length);
      while (ids.length < meta && poolIds.length > 0) {
        const aid = poolIds.pop();
        if (!aid || ids.includes(aid)) continue;
        await inscribir(t.id, ids, aid);
        asignaciones++;
      }
      await client.query(`UPDATE turnos SET alumno_ids = $1 WHERE id = $2 AND sucursal_id = $3`, [ids, t.id, sid]);
    }

    let guard = 0;
    while (poolIds.length > 0 && guard < 5000) {
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
      let colocado = false;
      for (const t of shuffle(trows)) {
        const ids = [...(t.alumno_ids || [])];
        const cap = t.cupo ?? 6;
        if (ids.length < cap && !ids.includes(aid)) {
          await inscribir(t.id, ids, aid);
          asignaciones++;
          await client.query(`UPDATE turnos SET alumno_ids = $1 WHERE id = $2 AND sucursal_id = $3`, [ids, t.id, sid]);
          colocado = true;
          break;
        }
      }
      if (!colocado) break;
      poolIds.shift();
    }

    await client.query('COMMIT');
    console.log(`Inscripciones + turnos actualizados: ${asignaciones} asignaciones.`);
    if (poolIds.length > 0) {
      console.log(`Quedaron ${poolIds.length} alumno(s) sin turno (cupo insuficiente en todas las clases).`);
    }
    console.log('\nListo.');
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
