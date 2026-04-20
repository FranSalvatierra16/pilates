/**
 * Seed: 60 ejercicios de prueba + secuencia Lun–Vie de ESTA semana (calendario local).
 * Sucursal: Savia3 (nombre_lugar o usuario contiene "savia3").
 *
 * Ejecutar: npm run seed:planif-savia3
 * Requiere DATABASE_URL (o POSTGRES_URL).
 *
 * Si no existe sucursal Savia3 en la base, forzá el id:
 *   PLANIF_SEED_SUCURSAL_ID=<uuid> npm run seed:planif-savia3
 *
 * Para borrar datos de prueba en una sucursal: npm run seed:planif-cleanup (misma variable de id).
 *
 * Re-ejecutar: borra solo datos seed-s3-* de esa sucursal y vuelve a insertar.
 */
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { startOfWeek, addDays, format } from 'date-fns';

const __dirname = dirname(fileURLToPath(import.meta.url));

const getDatabaseUrl = () =>
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_CONNECTION_STRING;

const PREFIX = 'seed-s3';

/** 60 nombres tipo pilates / estudio para probar filtros y listas */
const EJERCICIOS_60 = [
  'Respiración costal',
  'Imprint',
  'Pelvic curl',
  'Chest lift',
  'Roll up',
  'Single leg stretch',
  'Double leg stretch',
  'Spine stretch',
  'Saw',
  'Swan prep',
  'Swimming',
  'Shoulder bridge',
  'Side kick — aducción',
  'Side kick — extensión',
  'Clam shell',
  'Side plank modificado',
  'Teaser prep',
  'Hundred — nivel 1',
  'Leg pull front',
  'Leg pull back',
  'Push up — secuencia',
  'Plank forearm',
  'Mermaid',
  'Spine twist',
  'Jackknife prep',
  'Rollover',
  'Open leg rocker',
  'Corkscrew suave',
  'Criss cross',
  'Scissors',
  'Lower lift',
  'Frog en reformer',
  'Footwork — punta',
  'Footwork — talón',
  'Lat pull sentado',
  'Pull straps',
  'T — barra',
  'Back stroke',
  'Knee stretch — round',
  'Knee stretch — flat',
  'Stomach massage — round',
  'Short box — round',
  'Short box — side',
  'Tree',
  'Russian squat',
  'Semi-circle',
  'Running',
  'Arm circles — cadillac',
  'Roll down bar',
  'Breathing — silla',
  'Pike en silla',
  'Cat stretch barrel',
  'Back extension barrel',
  'Side bends — barrel',
  'Estabilidad tobillos',
  'Puente glúteo',
  'Zancada estática',
  'Sentadilla con apoyo',
  'Movilidad hombros',
  'Cooldown — flexión suave',
];

function mondayToFridayISO() {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  return [0, 1, 2, 3, 4].map((d) => format(addDays(monday, d), 'yyyy-MM-dd'));
}

async function ensurePlanificacionSchema(pool) {
  const { rows } = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'planificacion_ejercicio'
    ) AS ok
  `);
  if (rows[0]?.ok) return;
  console.log('Aplicando server/schema.sql (tablas de planificación ausentes)...');
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

async function main() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error('Falta DATABASE_URL. Ejemplo: DATABASE_URL=postgres://... npm run seed:planif-savia3');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') || databaseUrl.includes('amazonaws.com') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await ensurePlanificacionSchema(pool);
  } catch (e) {
    console.error('No se pudo aplicar schema.sql. Probá: npm run db:schema');
    console.error(e);
    await pool.end();
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const forzarId = (process.env.PLANIF_SEED_SUCURSAL_ID || process.env.SUCURSAL_SEED_ID || '').trim();

    let sucursales;
    if (forzarId) {
      const r = await client.query('SELECT id, nombre_lugar, usuario FROM sucursales WHERE id = $1', [forzarId]);
      sucursales = r.rows;
      if (sucursales.length === 0) {
        throw new Error(`No hay sucursal con id PLANIF_SEED_SUCURSAL_ID=${forzarId}`);
      }
    } else {
      let r = await client.query(
        `SELECT id, nombre_lugar, usuario FROM sucursales
         WHERE LOWER(TRIM(nombre_lugar)) IN ('savia3', 'savia 3')
            OR LOWER(nombre_lugar) LIKE '%savia3%'
            OR LOWER(REPLACE(nombre_lugar, ' ', '')) LIKE '%savia3%'
            OR LOWER(usuario) IN ('savia3', 'savia3!')
            OR LOWER(usuario) LIKE 'savia3%'
         ORDER BY nombre_lugar
         LIMIT 5`
      );
      sucursales = r.rows;
    }

    if (sucursales.length === 0) {
      const { rows: all } = await client.query('SELECT id, nombre_lugar, usuario FROM sucursales ORDER BY nombre_lugar');
      console.error('No se encontró sucursal Savia3. Sucursales en la base:');
      all.forEach((s) => console.error(`  - ${s.nombre_lugar} (${s.usuario}) id=${s.id}`));
      throw new Error(
        'Usá PLANIF_SEED_SUCURSAL_ID=<uuid> npm run seed:planif-savia3 (obligatorio si no tenés nombre/usuario Savia3). Para borrar un seed cargado por error: npm run seed:planif-cleanup'
      );
    }

    const suc = sucursales[0];
    const sid = suc.id;
    console.log(`Sucursal: ${suc.nombre_lugar} (usuario: ${suc.usuario}) id=${sid}`);

    await client.query(
      'ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS planificacion_habilitada BOOLEAN NOT NULL DEFAULT false'
    );
    await client.query('UPDATE sucursales SET planificacion_habilitada = true WHERE id = $1', [sid]);

    const fechasSemana = mondayToFridayISO();
    const [lun, mar, mie, jue, vie] = fechasSemana;
    console.log('Semana actual Lun–Vie:', fechasSemana.join(', '));

    // Limpieza de corridas anteriores (ítems que usan ejercicios seed, luego ejercicios)
    await client.query(`DELETE FROM planificacion_dia_item WHERE sucursal_id = $1 AND ejercicio_id LIKE $2`, [
      sid,
      `${PREFIX}-ej-%`,
    ]);
    await client.query(`DELETE FROM planificacion_ejercicio WHERE sucursal_id = $1 AND id LIKE $2`, [sid, `${PREFIX}-ej-%`]);

    const tipos = [
      { id: `${PREFIX}-tipo-1`, nombre: 'Movilidad' },
      { id: `${PREFIX}-tipo-2`, nombre: 'Fuerza' },
      { id: `${PREFIX}-tipo-3`, nombre: 'Estabilidad' },
      { id: `${PREFIX}-tipo-4`, nombre: 'Flexibilidad' },
      { id: `${PREFIX}-tipo-5`, nombre: 'Coordinación' },
    ];
    const maquinas = [
      { id: `${PREFIX}-mq-1`, nombre: 'Reformer' },
      { id: `${PREFIX}-mq-2`, nombre: 'Cadillac' },
      { id: `${PREFIX}-mq-3`, nombre: 'Silla' },
      { id: `${PREFIX}-mq-4`, nombre: 'Barrel' },
    ];

    for (const t of tipos) {
      await client.query(
        `INSERT INTO planificacion_tipo_ejercicio (id, sucursal_id, nombre) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre`,
        [t.id, sid, t.nombre]
      );
    }
    for (const m of maquinas) {
      await client.query(
        `INSERT INTO planificacion_maquina (id, sucursal_id, nombre) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre`,
        [m.id, sid, m.nombre]
      );
    }

    const tipoIds = tipos.map((t) => t.id);
    const mqIds = maquinas.map((m) => m.id);

    for (let i = 0; i < 60; i++) {
      const n = i + 1;
      const id = `${PREFIX}-ej-${String(n).padStart(2, '0')}`;
      const nombre = `${String(n).padStart(2, '0')}. ${EJERCICIOS_60[i]}`;
      const tipoId = tipoIds[i % tipoIds.length];
      const maquinaId = mqIds[i % mqIds.length];
      const maquinaSecundariaId = i % 7 === 0 ? mqIds[(i + 1) % mqIds.length] : null;

      await client.query(
        `INSERT INTO planificacion_ejercicio (
          id, sucursal_id, nombre, descripcion, tipo_id, maquina_id, maquina_secundaria_id,
          modo_series, unidad, valor, num_series, series_detalle
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'tres_iguales', 'duracion', $8, 3, NULL)`,
        [
          id,
          sid,
          nombre,
          `Ejercicio demo #${n} para pruebas de planificación.`,
          tipoId,
          maquinaId,
          maquinaSecundariaId,
          `${20 + (i % 10) * 5} seg`,
        ]
      );
    }

    const ejIds = Array.from({ length: 60 }, (_, i) => `${PREFIX}-ej-${String(i + 1).padStart(2, '0')}`);

    /** 12 ejercicios por día: bloques de índices 0–11, 12–23, … */
    const dias = [
      { fecha: lun, label: 'Lunes', offset: 0 },
      { fecha: mar, label: 'Martes', offset: 12 },
      { fecha: mie, label: 'Miércoles', offset: 24 },
      { fecha: jue, label: 'Jueves', offset: 36 },
      { fecha: vie, label: 'Viernes', offset: 48 },
    ];

    for (const { fecha, label, offset } of dias) {
      for (let o = 0; o < 12; o++) {
        const ejId = ejIds[offset + o];
        const itemId = `${PREFIX}-di-${fecha}-${o}`;
        await client.query(
          `INSERT INTO planificacion_dia_item (id, sucursal_id, fecha, orden, ejercicio_id, notas)
           VALUES ($1, $2, $3::date, $4, $5, $6)`,
          [itemId, sid, fecha, o, ejId, o === 0 ? `Bloque ${label} — semana demo` : '']
        );
      }
      console.log(`✓ ${label} ${fecha}: 12 ítems`);
    }

    await client.query('COMMIT');
    console.log(
      `\nListo: 60 ejercicios + secuencia Lun–Vie (${fechasSemana[0]} … ${fechasSemana[4]}) en "${suc.nombre_lugar}". Editá en Planificación → Por día.`
    );
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
