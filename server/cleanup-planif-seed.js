/**
 * Quita de la base todo lo insertado por seed-planificacion-savia3 (prefijo seed-s3-).
 *
 * Uso:
 *   PLANIF_SEED_SUCURSAL_ID=<uuid> npm run seed:planif-cleanup
 *
 * Sin id: lista sucursales y sale con error (así no borrás en todas por accidente).
 */
import 'dotenv/config';
import pg from 'pg';

const PREFIX = 'seed-s3';

const getDatabaseUrl = () =>
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_CONNECTION_STRING;

async function main() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error('Falta DATABASE_URL.');
    process.exit(1);
  }

  const sid = (process.env.PLANIF_SEED_SUCURSAL_ID || process.env.SUCURSAL_SEED_ID || '').trim();
  if (!sid) {
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('railway') || databaseUrl.includes('amazonaws.com') ? { rejectUnauthorized: false } : undefined,
    });
    const { rows } = await pool.query('SELECT id, nombre_lugar, usuario FROM sucursales ORDER BY nombre_lugar');
    await pool.end();
    console.error('Definí la sucursal donde se cargó el seed por error, por ejemplo:');
    console.error('  PLANIF_SEED_SUCURSAL_ID=<uuid> npm run seed:planif-cleanup\n');
    console.error('Sucursales:');
    rows.forEach((s) => console.error(`  ${s.id}  ${s.nombre_lugar} (${s.usuario})`));
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') || databaseUrl.includes('amazonaws.com') ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: suc } = await client.query('SELECT nombre_lugar, usuario FROM sucursales WHERE id = $1', [sid]);
    if (suc.length === 0) {
      throw new Error(`No existe sucursal id=${sid}`);
    }
    console.log(`Limpiando seed ${PREFIX}-* en: ${suc[0].nombre_lugar} (${suc[0].usuario})`);

    const r1 = await client.query(
      `DELETE FROM planificacion_dia_item WHERE sucursal_id = $1 AND (ejercicio_id LIKE $2 OR id LIKE $3)`,
      [sid, `${PREFIX}-ej-%`, `${PREFIX}-di-%`]
    );
    console.log(`  planificacion_dia_item: ${r1.rowCount} filas`);

    const r2 = await client.query(`DELETE FROM planificacion_ejercicio WHERE sucursal_id = $1 AND id LIKE $2`, [
      sid,
      `${PREFIX}-ej-%`,
    ]);
    console.log(`  planificacion_ejercicio: ${r2.rowCount} filas`);

    const r3 = await client.query(`DELETE FROM planificacion_tipo_ejercicio WHERE sucursal_id = $1 AND id LIKE $2`, [
      sid,
      `${PREFIX}-tipo-%`,
    ]);
    console.log(`  planificacion_tipo_ejercicio: ${r3.rowCount} filas`);

    const r4 = await client.query(`DELETE FROM planificacion_maquina WHERE sucursal_id = $1 AND id LIKE $2`, [
      sid,
      `${PREFIX}-mq-%`,
    ]);
    console.log(`  planificacion_maquina: ${r4.rowCount} filas`);

    await client.query('COMMIT');
    console.log('\nListo: datos de prueba del seed eliminados en esa sucursal.');
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
