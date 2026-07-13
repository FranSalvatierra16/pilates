/**
 * Resolver elección de horario por número O por texto libre (ej. "Martes 18:00").
 */

const DIAS_FULL = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const DIAS_ALIASES = {
  lun: 'lunes',
  mar: 'martes',
  mie: 'miercoles',
  mier: 'miercoles',
  jue: 'jueves',
  vie: 'viernes',
  sab: 'sabado',
  dom: 'domingo',
};

function normalizar(s) {
  return String(s || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¡!¿?.,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function diaKeyFromNombre(dia) {
  const d = normalizar(dia);
  if (!d) return '';
  if (DIAS_FULL.includes(d)) return d;
  const corto = d.slice(0, 3);
  return DIAS_ALIASES[corto] || d;
}

/** "18:00", "18", "18hs", "18.00", "6pm" → "18:00" */
export function parseHoraMensaje(texto) {
  const t = normalizar(texto);
  let m = t.match(/\b([01]?\d|2[0-3])\s*[:.h]\s*([0-5]\d)\b/);
  if (m) return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
  m = t.match(/\b([01]?\d|2[0-3])\s*(?:hs|h|hrs)?\b/);
  if (m) return `${String(m[1]).padStart(2, '0')}:00`;
  return null;
}

export function parseDiaMensaje(texto) {
  const t = normalizar(texto);
  for (const full of DIAS_FULL) {
    if (t.includes(full)) return full;
  }
  for (const [alias, full] of Object.entries(DIAS_ALIASES)) {
    // palabra completa o borde
    const re = new RegExp(`\\b${alias}\\b`);
    if (re.test(t)) return full;
  }
  return null;
}

function preferSemana(texto) {
  const t = normalizar(texto);
  if (/\b(proxima|proximo|prox|siguiente)\b/.test(t)) return 'proxima';
  if (/\b(esta)\b/.test(t)) return 'esta';
  return null;
}

function quiereRecuperacion(texto) {
  const t = normalizar(texto);
  if (/\b(recup|recuperacion|recuperar)\b/.test(t)) return true;
  if (/\d{1,2}\s*[:.h]?\s*\d{0,2}\s*r\b/.test(t)) return true;
  if (/\br\b/.test(t) && /\d/.test(t)) return true;
  return false;
}

/**
 * @returns {{ ok: true, index: number, opcion: object } | { ok: false, reason: string, matches?: object[], hint?: string }}
 */
export function resolverEleccionHorario(mensaje, opciones) {
  const lista = Array.isArray(opciones) ? opciones : [];
  if (!lista.length) return { ok: false, reason: 'empty' };

  const raw = String(mensaje || '').trim();
  const soloNumero = /^\d{1,3}$/.test(raw);
  if (soloNumero) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= lista.length) {
      return { ok: true, index: n - 1, opcion: lista[n - 1] };
    }
    return { ok: false, reason: 'bad_number', hint: `El número tiene que ser entre 1 y ${lista.length}.` };
  }

  const dia = parseDiaMensaje(raw);
  const hora = parseHoraMensaje(raw);
  if (!dia || !hora) {
    return {
      ok: false,
      reason: 'parse',
      hint: 'Escribí el día y la hora, por ejemplo: *Martes 18:00*',
    };
  }

  const semanaPref = preferSemana(raw);
  const pideRecup = quiereRecuperacion(raw);

  let matches = lista.filter((o) => {
    const dOk = diaKeyFromNombre(o.dia) === dia;
    const hOk = String(o.hora || '').slice(0, 5) === hora;
    return dOk && hOk;
  });

  if (semanaPref === 'proxima') {
    const filtrado = matches.filter((o) => /pr[oó]xima/i.test(String(o.etiquetaSemana || '')));
    if (filtrado.length) matches = filtrado;
  } else if (semanaPref === 'esta') {
    const filtrado = matches.filter((o) => /esta/i.test(String(o.etiquetaSemana || '')));
    if (filtrado.length) matches = filtrado;
  } else {
    // Sin aclaración → preferí esta semana si hay
    const esta = matches.filter((o) => /esta/i.test(String(o.etiquetaSemana || '')));
    if (esta.length) matches = esta;
  }

  if (pideRecup) {
    const filtrado = matches.filter((o) => o.tipo === 'recuperacion');
    if (filtrado.length) matches = filtrado;
  } else {
    // Sin pedir recup → preferí fija si hay
    const fijas = matches.filter((o) => o.tipo !== 'recuperacion');
    if (fijas.length) matches = fijas;
  }

  if (!matches.length) {
    return {
      ok: false,
      reason: 'no_match',
      hint: `No encontré *${capitalize(dia)} ${hora}* en la lista. Probá otra hora o mirá los horarios de arriba.`,
    };
  }

  if (matches.length > 1) {
    return {
      ok: false,
      reason: 'ambiguous',
      matches,
      hint: `Hay más de una clase en ${capitalize(dia)} ${hora}. Aclará con *esta semana* o *próxima semana*${matches.some((o) => o.tipo === 'recuperacion') ? ', o *recup*' : ''}.`,
    };
  }

  const opcion = matches[0];
  const index = lista.indexOf(opcion);
  return { ok: true, index, opcion };
}

function capitalize(s) {
  const t = String(s || '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** Texto de ayuda breve debajo de las listas */
export const HINT_ELEGIR_HORARIO =
  'Escribí *día y hora*, ej: *Martes 18:00*\n(también sirve el número)';
