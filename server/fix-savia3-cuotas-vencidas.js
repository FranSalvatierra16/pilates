/**
 * Corrige cuotas en rojo (vencidas) para la sucursal Savia3:
 * recalcula fecha_vencimiento_cuota como en la app (último pago + 1 mes,
 * y si sigue vencida, +1 mes hasta quedar al día respecto de hoy en AR).
 *
 * Uso:
 *   DATABASE_URL=... npm run fix:savia3-cuotas
 *   SUCURSAL_SEED_ID=<uuid> DATABASE_URL=... npm run fix:savia3-cuotas
 *
 * Dry-run (solo lista, no actualiza):
 *   FIX_CUOTAS_DRY_RUN=1 DATABASE_URL=... npm run fix:savia3-cuotas
 */
import 'dotenv/config';
import pg from 'pg';
import { addMonths, parseISO, format, startOfDay } from 'date-fns';

const getDatabaseUrl = () =>
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_CONNECTION_STRING;

const DRY = String(process.env.FIX_CUOTAS_DRY_RUN || '').trim() === '1';

function sslForUrl(databaseUrl) {
  return databaseUrl.includes('railway') || databaseUrl.includes('amazonaws.com')
    ? { rejectUnauthorized: false }
    : undefined;
}

/** Igual que calcularFechaVencimiento en src/utils/date.ts */
function vencimientoDesdePago(fechaPagoYmd) {
  const fecha = parseISO(fechaPagoYmd);
  return format(addMonths(fecha, 1), 'yyyy-MM-dd');
}

/** Avanza de a un mes hasta que la fecha de vencimiento sea >= hoy (inicio de día local parseado). */
function alinearVencimientoNoVencido(ultimaFechaPagoYmd, hoyYmd) {
  let venc = vencimientoDesdePago(ultimaFechaPagoYmd);
  const hoy = startOfDay(parseISO(hoyYmd));
  while (parseISO(venc) < hoy) {
    venc = vencimientoDesdePago(venc);
  }
  return venc;
}

async function resolveSucursalId(client) {
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
    throw new Error('Definí SUCURSAL_SEED_ID=<uuid> o renombrá la sucursal para matchear savia3.');
  }
  return r.rows[0];
}

async function main() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error('Falta DATABASE_URL (o POSTGRES_URL).');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: sslForUrl(databaseUrl) });
  const client = await pool.connect();

  try {
    const suc = await resolveSucursalId(client);
    const sid = suc.id;
    console.log(`Sucursal: ${suc.nombre_lugar} (${suc.usuario}) id=${sid}`);
    if (DRY) console.log('Modo DRY-RUN: no se escribirá en la base.\n');

    const { rows: hoyRow } = await client.query(
      `SELECT (timezone('America/Argentina/Buenos_Aires', now()))::date::text AS hoy`
    );
    const hoy = hoyRow[0].hoy;

    const { rows: candidatos } = await client.query(
      `SELECT a.id,
              a.nombre,
              a.apellido,
              a.fecha_vencimiento_cuota::text AS venc_actual,
              (SELECT MAX(p.fecha)::text FROM pagos p WHERE p.alumno_id = a.id) AS ultimo_pago
       FROM alumnos a
       WHERE a.sucursal_id = $1
         AND COALESCE(a.activo, true)
         AND a.fecha_vencimiento_cuota IS NOT NULL
         AND a.fecha_vencimiento_cuota < (timezone('America/Argentina/Buenos_Aires', now()))::date
       ORDER BY a.apellido, a.nombre`,
      [sid]
    );

    if (candidatos.length === 0) {
      console.log('No hay alumnos activos con cuota vencida en esta sucursal.');
      await pool.end();
      return;
    }

    console.log(`Alumnos con cuota vencida: ${candidatos.length}\n`);

    let actualizados = 0;
    for (const row of candidatos) {
      const basePago = row.ultimo_pago || hoy;
      const nuevoVenc = alinearVencimientoNoVencido(basePago, hoy);
      console.log(
        `- ${row.apellido}, ${row.nombre} | venc ${row.venc_actual} → ${nuevoVenc} | último pago: ${row.ultimo_pago || '(ninguno, uso hoy AR)'}`
      );
      if (!DRY) {
        await client.query('UPDATE alumnos SET fecha_vencimiento_cuota = $1::date WHERE id = $2', [
          nuevoVenc,
          row.id,
        ]);
        actualizados++;
      }
    }

    if (DRY) {
      console.log(`\nDry-run: se habrían actualizado ${candidatos.length} alumno(s). Ejecutá sin FIX_CUOTAS_DRY_RUN=1 para aplicar.`);
    } else {
      console.log(`\nListo. Actualizados: ${actualizados}.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
