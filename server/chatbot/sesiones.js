import { getPool } from '../db/index.js';

export async function obtenerSesion(telefono) {
  const db = await getPool();

  const { rows } = await db.query(
    `SELECT * FROM chatbot_sessions
     WHERE telefono=$1`,
    [telefono]
  );

  return rows[0] || null;
}

export async function guardarEstado(telefono, estado) {
  const db = await getPool();

  await db.query(`
    INSERT INTO chatbot_sessions
      (telefono, estado)
    VALUES ($1,$2)
    ON CONFLICT (telefono)
    DO UPDATE SET
      estado=EXCLUDED.estado,
      updated_at=NOW()
  `,[telefono,estado]);
}