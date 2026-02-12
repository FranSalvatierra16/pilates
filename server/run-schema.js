/**
 * Aplica el esquema (schema.sql) y el seed (admin + sucursal Savia) a la base de datos.
 * Útil cuando la BD no se actualizó al hacer deploy.
 *
 * Uso (desde la raíz del proyecto):
 *   node server/run-schema.js
 *
 * Necesitás tener DATABASE_URL (o DATABASE_PUBLIC_URL, etc.) en .env o en el entorno.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_PUBLIC_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_CONNECTION_STRING
  );
}

async function run() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error('Falta DATABASE_URL (o DATABASE_PUBLIC_URL / POSTGRES_URL).');
    console.error('Definila en .env o: DATABASE_URL="postgresql://..." node server/run-schema.js');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    console.log('Aplicando schema.sql...');
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('Schema aplicado.');

    // Seed admin
    const { rows: adminRows } = await pool.query('SELECT id FROM admin WHERE usuario = $1', ['adminF']);
    if (adminRows.length === 0) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || '2401', 10);
      await pool.query('INSERT INTO admin (id, usuario, clave_hash) VALUES ($1, $2, $3)', [
        crypto.randomUUID(),
        'adminF',
        hash,
      ]);
      console.log('Cuenta admin creada (usuario: adminF).');
    } else {
      console.log('Admin adminF ya existe.');
    }

    // Seed sucursal Savia
    const { rows: sucRows } = await pool.query('SELECT id FROM sucursales WHERE usuario = $1', ['Savia']);
    let saviaId = sucRows.length > 0 ? sucRows[0].id : null;
    if (sucRows.length === 0) {
      saviaId = crypto.randomUUID();
      const hash = await bcrypt.hash('2286', 10);
      await pool.query(
        'INSERT INTO sucursales (id, nombre_lugar, usuario, clave_hash) VALUES ($1, $2, $3, $4)',
        [saviaId, 'Savia', 'Savia', hash]
      );
      console.log('Sucursal Savia creada (usuario: Savia, clave: 2286).');
    } else {
      saviaId = sucRows[0].id;
      console.log('Sucursal Savia ya existe.');
    }

    // Asignar registros existentes sin sucursal a Savia
    if (saviaId) {
      for (const table of ['alumnos', 'actividades', 'gastos', 'profesores', 'turnos', 'registros_link']) {
        try {
          const r = await pool.query(`UPDATE ${table} SET sucursal_id = $1 WHERE sucursal_id IS NULL`, [saviaId]);
          if (r.rowCount > 0) console.log(`  ${table}: ${r.rowCount} registros asignados a Savia.`);
        } catch (e) {
          console.warn(`  ${table}: ${e.message}`);
        }
      }
    }

    console.log('Listo. Podés reiniciar la app o hacer un request a /api/health.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
