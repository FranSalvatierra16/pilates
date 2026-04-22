/**
 * Savia3: agrega un pago por alumno @foto-demo.local que aún no tiene ninguno.
 * La pantalla Alumnos usa “hay fila en pagos” para dejar de mostrar Pendiente de pago.
 *
 *   DATABASE_URL=... npm run fix:foto-demo-pagos
 */
import 'dotenv/config';
import pg from 'pg';
import crypto from 'node:crypto';

const getDatabaseUrl = () =>
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_CONNECTION_STRING;

function sslForUrl(databaseUrl) {
  return databaseUrl.includes('railway') || databaseUrl.includes('amazonaws.com')
    ? { rejectUnauthorized: false }
    : undefined;
}

async function resolveSucursal(client) {
  const forzarId = (process.env.SUCURSAL_SEED_ID || process.env.PLANIF_SEED_SUCURSAL_ID || '').trim();
  if (forzarId) {
    const r = await client.query('SELECT id, nombre_lugar FROM sucursales WHERE id = $1', [forzarId]);
    if (r.rows.length === 0) throw new Error(`No hay sucursal ${forzarId}`);
    return r.rows[0];
  }
  const r = await client.query(
    `SELECT id, nombre_lugar FROM sucursales
     WHERE LOWER(TRIM(nombre_lugar)) IN ('savia3', 'savia 3')
        OR LOWER(nombre_lugar) LIKE '%savia3%'
        OR LOWER(REPLACE(nombre_lugar, ' ', '')) LIKE '%savia3%'
        OR LOWER(usuario) IN ('savia3', 'savia3!')
        OR LOWER(usuario) LIKE 'savia3%'
     LIMIT 1`
  );
  if (!r.rows.length) throw new Error('No Savia3. Usá SUCURSAL_SEED_ID=');
  return r.rows[0];
}

async function main() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error('Falta DATABASE_URL');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: sslForUrl(databaseUrl) });
  const client = await pool.connect();
  try {
    const suc = await resolveSucursal(client);
    const sid = suc.id;
    console.log(`${suc.nombre_lugar} (${sid})`);

    const { rows: alumnos } = await client.query(
      `SELECT a.id, a.fecha_vencimiento_cuota::text AS fv, COALESCE(act.precio, 37000)::numeric AS monto
         FROM alumnos a
         LEFT JOIN actividades act ON act.id = a.actividad_id
        WHERE a.sucursal_id = $1
          AND a.email LIKE '%@foto-demo.local'
          AND NOT EXISTS (SELECT 1 FROM pagos p WHERE p.alumno_id = a.id)`,
      [sid]
    );

    if (alumnos.length === 0) {
      console.log('Nada que corregir (todos tienen pago o no hay @foto-demo.local).');
      await pool.end();
      return;
    }

    const { rows: defFv } = await client.query(
      `SELECT ((timezone('America/Argentina/Buenos_Aires', now()))::date + interval '45 days')::text AS d`
    );
    const fvDefault = defFv[0].d;

    let n = 0;
    for (const a of alumnos) {
      const fv = a.fv || fvDefault;
      await client.query(
        `INSERT INTO pagos (id, alumno_id, monto, metodo_pago, fecha, created_at, descripcion, sucursal_id, hora)
         VALUES ($1, $2, $3, 'transferencia', ($4::date - interval '1 month')::date, NOW(), NULL, NULL, '10:00')`,
        [crypto.randomUUID(), a.id, Number(a.monto) || 37000, fv]
      );
      n++;
    }
    console.log(`Insertados ${n} pago(s). Recargá Alumnos.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
