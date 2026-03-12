/**
 * Actualiza la contraseña del usuario administrador en la base de datos.
 * No aplica schema ni crea la cuenta; solo actualiza clave_hash del usuario indicado.
 *
 * Uso (desde la raíz del proyecto):
 *   ADMIN_PASSWORD=nuevaContraseña node server/update-admin.js
 *   ADMIN_USER=miAdmin ADMIN_PASSWORD=nuevaContraseña node server/update-admin.js
 *
 * Requiere DATABASE_URL (o DATABASE_PUBLIC_URL, etc.) en .env o en el entorno.
 */
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';

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
    console.error('Falta DATABASE_URL. Definila en .env o en el entorno.');
    process.exit(1);
  }

  const adminUser = (process.env.ADMIN_USER || 'adminF').trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('Definí ADMIN_PASSWORD para actualizar la contraseña del admin.');
    console.error('Ejemplo: ADMIN_PASSWORD=nuevaClave node server/update-admin.js');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const { rows } = await pool.query('SELECT id FROM admin WHERE usuario = $1', [adminUser]);
    if (rows.length === 0) {
      console.error('No existe un admin con usuario "' + adminUser + '". Creá la cuenta con: npm run db:schema');
      process.exit(1);
    }
    const hash = await bcrypt.hash(adminPassword, 10);
    await pool.query('UPDATE admin SET clave_hash = $1 WHERE usuario = $2', [hash, adminUser]);
    console.log('Contraseña del admin "' + adminUser + '" actualizada correctamente.');
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
