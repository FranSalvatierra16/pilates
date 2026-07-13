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

/**
 * Guarda la última reply para filtrar duplicados de n8n/WhatsApp (mismo mensaje en pocos segundos).
 */
export async function guardarDedup(telefono, mensaje, estado, reply) {
  const now = Date.now();
  await actualizarSesion(telefono, {
    contexto: {
      dedup: {
        key: `${estado}|${String(mensaje || '').trim()}`,
        ts: now,
        reply: String(reply || '').slice(0, 3500),
      },
    },
    mergeContexto: true,
  });
}

export function replySiDuplicado(sesion, mensaje, ventanaMs = 10000) {
  const dedup = sesion?.contexto?.dedup;
  if (!dedup?.key || !dedup?.reply) return null;
  const key = `${sesion.estado}|${String(mensaje || '').trim()}`;
  if (dedup.key !== key) return null;
  if (Date.now() - Number(dedup.ts || 0) > ventanaMs) return null;
  return dedup.reply;
}

/**
 * Toma la selección en curso (evita doble anotación / doble respuesta de n8n).
 * Devuelve el contexto PREVIO (con opciones) si ganó el lock; null si ya estaba tomado.
 */
export async function reclamarEstado(telefono, estadoEsperado, { estadoFinal = ESTADOS.MENU_ALUMNO } = {}) {
  const db = await getPool();
  if (!db) return null;
  const tel = normalizarTelefono(telefono);
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT estado, contexto FROM chatbot_sessions WHERE telefono = $1 FOR UPDATE`,
      [tel]
    );
    const row = rows[0];
    if (!row || row.estado !== estadoEsperado) {
      await client.query('ROLLBACK');
      return null;
    }
    const ctx = row.contexto && typeof row.contexto === 'object' ? row.contexto : {};
    if (ctx.seleccionEnCurso) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE chatbot_sessions SET
         estado = $2,
         contexto = $3::jsonb,
         updated_at = NOW(),
         ultima_interaccion = NOW()
       WHERE telefono = $1`,
      [
        tel,
        estadoFinal,
        JSON.stringify({
          alumnoId: ctx.alumnoId || null,
          dni: ctx.dni || null,
          seleccionEnCurso: true,
        }),
      ]
    );
    await client.query('COMMIT');
    return ctx;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

export { normalizarTelefono };
