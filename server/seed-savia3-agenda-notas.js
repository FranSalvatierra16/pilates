/**
 * Inserta notas de agenda de ejemplo en la sucursal Savia3 (estudio / tareas).
 *
 *   DATABASE_URL=... npm run seed:savia3-agenda-notas
 *   SUCURSAL_SEED_ID=<uuid> DATABASE_URL=... npm run seed:savia3-agenda-notas
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
  if (!r.rows.length) {
    const { rows: all } = await client.query('SELECT id, nombre_lugar, usuario FROM sucursales ORDER BY nombre_lugar');
    console.error('No Savia3. Sucursales:', all.map((x) => `${x.nombre_lugar} (${x.id})`).join('; '));
    throw new Error('Definí SUCURSAL_SEED_ID.');
  }
  return r.rows[0];
}

/** Notas con fechas en abril 2026 + algunas sin fecha. */
const NOTAS = [
  {
    titulo: 'Comprar insumos de limpieza',
    contenido: 'Desinfectante, rollos de papel y bolsas.',
    fecha: '2026-04-21',
    hora: '08:30',
    importante: false,
  },
  {
    titulo: 'Revisión aire acondicionado',
    contenido: 'Técnico confirmado por la tarde.',
    fecha: '2026-04-24',
    hora: '15:00',
    importante: true,
  },
  {
    titulo: 'Pedir repuestos elasticidad',
    contenido: 'Bands y loops para Mat — pedido al mayorista.',
    fecha: '2026-04-25',
    hora: null,
    importante: false,
  },
  {
    titulo: 'Renovar seguro del local',
    contenido: 'Vence a fin de mes; adjuntar póliza en Drive.',
    fecha: '2026-04-28',
    hora: '11:00',
    importante: true,
  },
  {
    titulo: 'Capacitación equipo — recepción',
    contenido: '15 min antes de abrir: nuevo protocolo de anotaciones.',
    fecha: '2026-04-26',
    hora: '07:45',
    importante: false,
  },
  {
    titulo: 'Stock agua y toallas',
    contenido: 'Completar depósito del vestuario.',
    fecha: '2026-04-22',
    hora: '18:00',
    importante: false,
  },
  {
    titulo: 'Contactar contadora',
    contenido: 'Cierre de IVA y sueldos abril.',
    fecha: '2026-04-29',
    hora: '10:30',
    importante: true,
  },
  {
    titulo: 'Lista de espera — reformer miércoles',
    contenido: 'Avisar si liberan dos cupos.',
    fecha: '2026-04-23',
    hora: null,
    importante: false,
  },
  {
    titulo: 'Mantenimiento reformer 2',
    contenido: 'Ruido en carro; dejar anotado para service.',
    fecha: null,
    hora: null,
    importante: false,
  },
  {
    titulo: 'Ideas posteos Instagram',
    contenido: 'Reels de ejercicios de respiración + horarios de mayo.',
    fecha: null,
    hora: null,
    importante: false,
  },
  {
    titulo: 'Reunión proveedor café',
    contenido: 'Degustación y precio por kilo.',
    fecha: '2026-04-27',
    hora: '14:00',
    importante: false,
  },
];

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

    let n = 0;
    for (const nota of NOTAS) {
      await client.query(
        `INSERT INTO agenda_notas (id, sucursal_id, titulo, contenido, fecha, hora, importante, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          crypto.randomUUID(),
          sid,
          nota.titulo,
          nota.contenido || '',
          nota.fecha || null,
          nota.hora || null,
          nota.importante === true,
        ]
      );
      n++;
    }
    console.log(`Insertadas ${n} notas de agenda.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
