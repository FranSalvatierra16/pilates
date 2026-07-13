import { getPool } from '../db/index.js';
import { ESTADOS } from './estados.js';

function normalizarTelefono(telefono) {
  return String(telefono || '').replace(/\D/g, '');
}

export async function obtenerOCrearSesion(telefono) {
  const db = await getPool();
  if (!db) throw new Error('Base de datos no configurada');

  const tel = normalizarTelefono(telefono);
  if (!tel) throw new Error('Teléfono inválido');

  const { rows } = await db.query(
    `SELECT id, telefono, estado, ultimo_menu, contexto, ultima_interaccion
     FROM chatbot_sessions
     WHERE telefono = $1`,
    [tel]
  );

  if (rows[0]) {
    const s = rows[0];
    return {
      ...s,
      contexto: s.contexto && typeof s.contexto === 'object' ? s.contexto : {},
    };
  }

  const { rows: created } = await db.query(
    `INSERT INTO chatbot_sessions (telefono, estado, ultimo_menu, contexto)
     VALUES ($1, $2, $2, '{}'::jsonb)
     ON CONFLICT (telefono) DO UPDATE SET
       ultima_interaccion = NOW(),
       updated_at = NOW()
     RETURNING id, telefono, estado, ultimo_menu, contexto, ultima_interaccion`,
    [tel, ESTADOS.MENU_PRINCIPAL]
  );

  const s = created[0];
  return {
    ...s,
    contexto: s.contexto && typeof s.contexto === 'object' ? s.contexto : {},
  };
}

export async function actualizarSesion(telefono, { estado, ultimoMenu, contexto, mergeContexto = true } = {}) {
  const db = await getPool();
  if (!db) throw new Error('Base de datos no configurada');

  const tel = normalizarTelefono(telefono);
  const sesion = await obtenerOCrearSesion(tel);

  const nuevoEstado = estado ?? sesion.estado;
  const nuevoMenu = ultimoMenu ?? sesion.ultimo_menu ?? nuevoEstado;
  const nuevoContexto = mergeContexto
    ? { ...(sesion.contexto || {}), ...(contexto || {}) }
    : contexto != null
      ? contexto
      : sesion.contexto || {};

  await db.query(
    `UPDATE chatbot_sessions SET
       estado = $2,
       ultimo_menu = $3,
       contexto = $4::jsonb,
       ultima_interaccion = NOW(),
       updated_at = NOW()
     WHERE telefono = $1`,
    [tel, nuevoEstado, nuevoMenu, JSON.stringify(nuevoContexto)]
  );

  return {
    telefono: tel,
    estado: nuevoEstado,
    ultimo_menu: nuevoMenu,
    contexto: nuevoContexto,
  };
}

export { normalizarTelefono };
