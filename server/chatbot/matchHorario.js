/**
 * Resolver elección de horario por número O por texto libre (ej. "Martes 18:00").
 * También soporta varios días a la misma hora: "martes miércoles jueves a las 7".
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
  const dias = parseDiasMensaje(texto);
  return dias[0] || null;
}

/** Todos los días mencionados, en el orden en que aparecen en el texto. */
export function parseDiasMensaje(texto) {
  const t = normalizar(texto);
  if (!t) return [];

  const hits = [];
  for (const full of DIAS_FULL) {
    let from = 0;
    while (from < t.length) {
      const idx = t.indexOf(full, from);
      if (idx < 0) break;
      const before = idx === 0 || /\s/.test(t[idx - 1]);
      const afterEnd = idx + full.length;
      const after = afterEnd >= t.length || /\s/.test(t[afterEnd]);
      if (before && after) hits.push({ dia: full, idx });
      from = idx + full.length;
    }
  }
  for (const [alias, full] of Object.entries(DIAS_ALIASES)) {
    const re = new RegExp(`\\b${alias}\\b`, 'g');
    let m;
    while ((m = re.exec(t))) {
      hits.push({ dia: full, idx: m.index });
    }
  }

  hits.sort((a, b) => a.idx - b.idx);
  const out = [];
  const seen = new Set();
  for (const h of hits) {
    if (seen.has(h.dia)) continue;
    seen.add(h.dia);
    out.push(h.dia);
  }
  return out;
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

function filtrarMatchesPorPreferencias(matches, texto) {
  let out = [...matches];
  const semanaPref = preferSemana(texto);
  const pideRecup = quiereRecuperacion(texto);

  if (semanaPref === 'proxima') {
    const filtrado = out.filter((o) => /pr[oó]xima/i.test(String(o.etiquetaSemana || '')));
    if (filtrado.length) out = filtrado;
  } else if (semanaPref === 'esta') {
    const filtrado = out.filter((o) => /esta/i.test(String(o.etiquetaSemana || '')));
    if (filtrado.length) out = filtrado;
  } else {
    const esta = out.filter((o) => /esta/i.test(String(o.etiquetaSemana || '')));
    if (esta.length) out = esta;
  }

  if (pideRecup) {
    const filtrado = out.filter((o) => o.tipo === 'recuperacion');
    if (filtrado.length) out = filtrado;
  } else {
    const fijas = out.filter((o) => o.tipo !== 'recuperacion');
    if (fijas.length) out = fijas;
  }

  return out;
}

function matchesDiaHora(lista, dia, hora) {
  return lista.filter((o) => {
    const dOk = diaKeyFromNombre(o.dia) === dia;
    const hOk = String(o.hora || '').slice(0, 5) === hora;
    return dOk && hOk;
  });
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

  const dias = parseDiasMensaje(raw);
  const hora = parseHoraMensaje(raw);
  if (!dias.length || !hora) {
    return {
      ok: false,
      reason: 'parse',
      hint: 'Escribí el día y la hora, por ejemplo: *Martes 18:00*',
    };
  }

  if (dias.length === 1) {
    let matches = filtrarMatchesPorPreferencias(matchesDiaHora(lista, dias[0], hora), raw);
    if (!matches.length) {
      return {
        ok: false,
        reason: 'no_match',
        hint: `No encontré *${capitalize(dias[0])} ${hora}* en la lista. Probá otra hora o mirá los horarios de arriba.`,
      };
    }
    if (matches.length > 1) {
      return {
        ok: false,
        reason: 'ambiguous',
        matches,
        hint: `Hay más de una clase en ${capitalize(dias[0])} ${hora}. Aclará con *esta semana* o *próxima semana*${matches.some((o) => o.tipo === 'recuperacion') ? ', o *recup*' : ''}.`,
      };
    }
    const opcion = matches[0];
    const index = lista.indexOf(opcion);
    return { ok: true, index, opcion };
  }

  // Varios días: devolver el primero (compat). Para N días usar resolverEleccionHorariosMultiples.
  let matches = filtrarMatchesPorPreferencias(matchesDiaHora(lista, dias[0], hora), raw);
  if (!matches.length) {
    return {
      ok: false,
      reason: 'no_match',
      hint: `No encontré *${capitalize(dias[0])} ${hora}* en la lista.`,
    };
  }
  const opcion = matches[0];
  return { ok: true, index: lista.indexOf(opcion), opcion };
}

/**
 * Resuelve varios días + una hora en un solo mensaje.
 * Ej: "martes miercoles jueves a las 7"
 *
 * @returns {{ ok: true, opciones: object[] } | { ok: false, reason: string, hint?: string, faltantes?: string[] }}
 */
export function resolverEleccionHorariosMultiples(mensaje, opciones) {
  const lista = Array.isArray(opciones) ? opciones : [];
  if (!lista.length) return { ok: false, reason: 'empty' };

  const raw = String(mensaje || '').trim();
  if (/^\d{1,3}$/.test(raw)) {
    const one = resolverEleccionHorario(raw, lista);
    if (!one.ok) return one;
    return { ok: true, opciones: [one.opcion] };
  }

  const dias = parseDiasMensaje(raw);
  const hora = parseHoraMensaje(raw);
  if (!dias.length || !hora) {
    return {
      ok: false,
      reason: 'parse',
      hint: 'Escribí día(s) y hora, ej: *Martes 18:00* o *Martes Miércoles Jueves 07:00*',
    };
  }

  if (dias.length === 1) {
    const one = resolverEleccionHorario(raw, lista);
    if (!one.ok) return one;
    return { ok: true, opciones: [one.opcion] };
  }

  const elegidas = [];
  const faltantes = [];
  const usados = new Set();

  for (const dia of dias) {
    let matches = filtrarMatchesPorPreferencias(matchesDiaHora(lista, dia, hora), raw);
    matches = matches.filter((o) => !usados.has(String(o.turnoId)));
    if (!matches.length) {
      faltantes.push(`${capitalize(dia)} ${hora}`);
      continue;
    }
    const opcion = matches[0];
    usados.add(String(opcion.turnoId));
    elegidas.push(opcion);
  }

  if (!elegidas.length) {
    return {
      ok: false,
      reason: 'no_match',
      faltantes,
      hint: `No encontré esos horarios a las *${hora}*. Mirale los disponibles arriba.`,
    };
  }

  return {
    ok: true,
    opciones: elegidas,
    faltantes: faltantes.length ? faltantes : undefined,
  };
}

function capitalize(s) {
  const t = String(s || '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** Texto de ayuda breve debajo de las listas */
export const HINT_ELEGIR_HORARIO =
  'Escribí *día y hora*, ej: *Martes 18:00*\n(también: *Martes Miércoles Jueves 07:00*)';
