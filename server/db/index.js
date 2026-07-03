import pg from 'pg';

let pool = null;

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_PUBLIC_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_CONNECTION_STRING
  );
}

export async function getPool() {
  if (pool) return pool;
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.warn(
      'Ninguna variable de base de datos definida (DATABASE_URL, DATABASE_PUBLIC_URL, POSTGRES_URL). Revisá Railway → Variables.'
    );
    return null;
  }
  pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.includes('railway') || databaseUrl.includes('amazonaws.com') || databaseUrl.includes('neon.tech')
        ? { rejectUnauthorized: false }
        : undefined,
    max: 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 8_000,
    allowExitOnIdle: false,
  });
  pool.on('error', (err) => {
    console.error('[Pool] Error en cliente idle:', err?.code || err?.message || err);
  });
  return pool;
}
