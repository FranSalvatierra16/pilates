import { formatoFecha, PIE_NAV } from './menu.js';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_CORTO = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

/** Página grande: el formato por día ya es compacto. */
export const PAGE_SIZE = 40;

export function numOpcion(n) {
  const i = Number(n);
  const key = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
  if (i >= 0 && i <= 9) return key[i];
  return `*${i}.*`;
}

export function lineasOpciones(opciones, getLabel = (o) => o.label, offset = 0) {
  return opciones.map((o, i) => `${numOpcion(offset + i + 1)} ${getLabel(o)}`).join('\n');
}

function horaOk(o) {
  return String(o.hora || '').slice(0, 5);
}

function diaCortoFromName(dia) {
  const d = String(dia || '').trim();
  const idx = DIAS.findIndex((x) => x === d || x.toLowerCase().startsWith(d.slice(0, 3).toLowerCase()));
  if (idx >= 0) return DIAS_CORTO[idx];
  if (d.length >= 3) return d.slice(0, 3);
  return d || 'Día';
}

/** Etiqueta corta sin cupo, ej. "Esta semana · Lun 09:00" */
export function labelHorarioCorto(o) {
  if (!o) return '';
  if (o.dia || o.hora) {
    const sem = o.etiquetaSemana ? `${o.etiquetaSemana} · ` : '';
    return `${sem}${diaCortoFromName(o.dia)} ${horaOk(o)}`.trim();
  }
  return String(o.label || '')
    .replace(/\s*\(\d+\s*libres?\)\s*/gi, '')
    .trim();
}

function fechaCortaDeOpcion(o) {
  const f = o?.fecha ? String(o.fecha).slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return '';
  return `${f.slice(8, 10)}/${f.slice(5, 7)}`;
}

/**
 * Formato prolijo para WhatsApp:
 *
 * 🗓️ *Esta semana*
 *
 * *Lunes* (14/07)
 * 08:00 · 09:00 · 10:00
 *
 * *Martes*
 * 09:00 · 11:00 🔁
 */
export function textoHorariosPorDia(opciones, { numerados = false, offset = 0 } = {}) {
  if (!opciones.length) return '';

  const tagged = opciones.map((o, i) => ({ ...o, __n: offset + i + 1 }));

  const ordenSemana = [];
  const porSemana = new Map();
  for (const o of tagged) {
    const sem = o.etiquetaSemana || (o.semana ? String(o.semana) : 'Disponibles');
    if (!porSemana.has(sem)) {
      porSemana.set(sem, []);
      ordenSemana.push(sem);
    }
    porSemana.get(sem).push(o);
  }

  const bloques = [];
  for (const sem of ordenSemana) {
    const items = porSemana.get(sem) || [];
    bloques.push(`🗓️ *${sem}*`);

    const diasOrden = [];
    const porDia = new Map();
    for (const o of items) {
      const dia = o.dia || 'Día';
      if (!porDia.has(dia)) {
        porDia.set(dia, []);
        diasOrden.push(dia);
      }
      porDia.get(dia).push(o);
    }

    diasOrden.sort((a, b) => {
      const ia = DIAS.indexOf(a);
      const ib = DIAS.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    for (const dia of diasOrden) {
      const slots = porDia.get(dia) || [];
      const fechaTxt = fechaCortaDeOpcion(slots[0]);
      bloques.push('');
      bloques.push(`*${dia}*${fechaTxt ? ` (${fechaTxt})` : ''}`);

      if (numerados) {
        const ordenados = [...slots].sort((a, b) => a.__n - b.__n);
        bloques.push(
          ordenados
            .map((o) => {
              const marca = o.tipo === 'recuperacion' ? ' 🔁' : '';
              return `${o.__n}) ${horaOk(o)}${marca}`;
            })
            .join('  ·  ')
        );
      } else {
        const horas = [
          ...new Set(
            [...slots]
              .sort((a, b) => horaOk(a).localeCompare(horaOk(b)))
              .map((o) => `${horaOk(o)}${o.tipo === 'recuperacion' ? ' 🔁' : ''}`)
          ),
        ];
        bloques.push(horas.join('  ·  '));
      }
    }
    bloques.push('');
  }

  return bloques.join('\n').trim();
}

export function renderPaginaOpciones(opciones, page = 0, pageSize = PAGE_SIZE, getLabel = null) {
  const total = opciones.length;
  const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const p = Math.min(Math.max(0, Number(page) || 0), pages - 1);
  const offset = p * pageSize;
  const slice = opciones.slice(offset, offset + pageSize);

  const usaPorDia = !getLabel && slice.some((o) => o && (o.dia || o.hora));
  // Lista limpia por día (sin números); la elección es por "Martes 18:00"
  const lineas = usaPorDia
    ? textoHorariosPorDia(slice, { numerados: false, offset })
    : lineasOpciones(slice, getLabel || ((o) => labelHorarioCorto(o) || o.label), offset);

  const pie = [];
  if (p < pages - 1) pie.push(`${numOpcion(98)} Ver más horarios`);
  if (p > 0) pie.push(`${numOpcion(97)} Página anterior`);

  return {
    lineas,
    pie: pie.join('\n'),
    page: p,
    pages,
    total,
    header: pages > 1 ? `📄 Página ${p + 1} de ${pages}\n\n` : '',
  };
}

export function esPedidoMas(m) {
  const t = String(m || '').trim().toLowerCase();
  return t === '98' || t === 'mas' || t === 'más' || t === 'siguiente' || t === 'm';
}

export function esPedidoAnterior(m) {
  const t = String(m || '').trim().toLowerCase();
  return t === '97' || t === 'anterior' || t === 'atras' || t === 'atrás';
}

export function respuestaVencimiento(alumno) {
  const nombre = `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim();
  const fecha = formatoFecha(alumno.fecha_vencimiento_cuota);
  const sede = alumno.sucursal_nombre ? `\n📍 ${alumno.sucursal_nombre}` : '';

  return `👤 ${nombre}${sede}

📅 Tu cuota vence el *${fecha}*.

Si ya pagaste y no figura actualizado, avisale a tu estudio.

0️⃣ Volver al menú principal`;
}

export function respuestaHorarios(alumno, turnos) {
  const nombre = `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim();

  if (!turnos.length) {
    return `👤 ${nombre}

Todavía no tenés clases fijas cargadas en el sistema.

Consultá con tu estudio o pedí hablar con una profesora (opción 4️⃣ del menú principal).

0️⃣ Volver al menú principal`;
  }

  const comoOpciones = turnos.map((t) => ({
    dia: DIAS[Number(t.dia_semana)] || `Día ${t.dia_semana}`,
    hora: String(t.hora || '').slice(0, 5),
    etiquetaSemana: 'Tus fijos',
  }));
  const cuerpo = textoHorariosPorDia(comoOpciones, { numerados: false });

  return `👤 ${nombre}

🗓️ Tus horarios fijos:

${cuerpo}

0️⃣ Volver al menú principal`;
}

export function listaLiberarClases(alumno, opciones, page = 0) {
  const nombre = `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim();
  const liberables = opciones.filter((o) => !o.yaLiberada);

  if (!opciones.length) {
    return {
      texto: `👤 ${nombre}

No tenés clases fijas para liberar en esta semana ni la próxima.

0️⃣ Volver`,
      opciones: [],
    };
  }

  if (!liberables.length) {
    return {
      texto: `👤 ${nombre}

Todas tus clases de esta semana y la próxima ya están liberadas:

${textoHorariosPorDia(opciones, { numerados: false })}

0️⃣ Volver`,
      opciones: [],
    };
  }

  const pag = renderPaginaOpciones(liberables, page);
  return {
    texto: `👤 ${nombre}

¿Qué clase querés *liberar*?
(🔁 = recuperación)

${pag.header}${pag.lineas}
${pag.pie ? `\n${pag.pie}` : ''}

✏️ Escribí *día y hora*, ej: *Martes 18:00*
(si hay dos iguales: *Martes 18:00 próxima* o *Martes 18:00 recup*)

• Fija → suma 1 crédito
• Recuperación (R) → cancela y te devuelve el crédito

${PIE_NAV}`,
    opciones: liberables,
    page: pag.page,
  };
}

export function textoPedirMotivoLiberar(opcion) {
  const label = labelHorarioCorto(opcion) || opcion?.label || 'esa clase';
  return `📝 Liberás: *${label}*

¿Querés dejar un *motivo*? (opcional)

Escribí el motivo, o respondé *-* / *1* para liberar sin motivo.

Se lo avisamos a la profesora.

${PIE_NAV}`;
}

export function respuestaLiberacionOk(alumno, opcion, creditos, menuFn, result = {}) {
  const nombre = `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim();
  const menu = typeof menuFn === 'function' ? `\n\n${menuFn()}` : '';
  const motivo = String(result.motivo || '').trim();
  const lineaMotivo = motivo ? `\n💬 Motivo: _${motivo}_` : '';
  const esRecup = result.tipo === 'recuperacion' || opcion.tipo === 'recuperacion';
  if (esRecup) {
    return `✅ Listo ${nombre}

Cancelaste la *recuperación*:
*${labelHorarioCorto(opcion)}*${lineaMotivo}

💳 Créditos para recuperar: *${creditos}*${menu}`;
  }
  return `✅ Listo ${nombre}

Liberaste: *${labelHorarioCorto(opcion)}*${lineaMotivo}

💳 Créditos para recuperar: *${creditos}*

Ahora podés recuperar con la opción 3️⃣ del menú alumno.${menu}`;
}

export function respuestaLiberacionYaHecha(opcion, menuFn) {
  const menu = typeof menuFn === 'function' ? `\n\n${menuFn()}` : '\n\n0️⃣ Volver';
  return `Esa clase ya estaba liberada:
*${labelHorarioCorto(opcion)}*${menu}`;
}

export function listaRecuperarClases(alumno, opciones, creditos, page = 0) {
  const nombre = `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim();
  const cred = Number(creditos) || 0;

  if (cred <= 0) {
    return {
      texto: `👤 ${nombre}

No tenés créditos para recuperar (💳 *0*).

Primero liberá una clase fija (opción 2️⃣ del menú alumno).

0️⃣ Volver`,
      opciones: [],
    };
  }

  if (!opciones.length) {
    return {
      texto: `👤 ${nombre}

💳 Créditos: *${cred}*

No hay horarios disponibles en esta semana ni la próxima.

Probá más tarde o pedí ayuda a una profesora (opción 4️⃣ del menú principal).

0️⃣ Volver`,
      opciones: [],
    };
  }

  const pag = renderPaginaOpciones(opciones, page);
  return {
    texto: `👤 ${nombre}

💳 Créditos: *${cred}*

¿En qué horario querés *recuperar*?

${pag.header}${pag.lineas}
${pag.pie ? `\n${pag.pie}` : ''}

✏️ Escribí *día y hora*, ej: *Martes 18:00*
(o *Martes 18:00 próxima* si querés la semana que viene)

Al anotarte se descuenta 1 crédito.

${PIE_NAV}`,
    opciones,
    page: pag.page,
  };
}

export function respuestaRecuperacionOk(alumno, opcion, creditos, menuFn) {
  const nombre = `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim();
  const menu = typeof menuFn === 'function' ? `\n\n${menuFn()}` : '';
  return `✅ Listo ${nombre}

Te anotaste para recuperar:
*${labelHorarioCorto(opcion)}*

💳 Créditos restantes: *${creditos}*${menu}`;
}

export function respuestaRecuperacionYaHecha(opcion, menuFn) {
  const menu = typeof menuFn === 'function' ? `\n\n${menuFn()}` : '\n\n0️⃣ Volver';
  return `Ya estabas anotada/o en esa recuperación:
*${labelHorarioCorto(opcion)}*${menu}`;
}

export function respuestaDniNoEncontrado() {
  return `No encontré un alumno activo con ese DNI en *Savia3* (prueba) 😕

Si sos nuevo/a, volvé al menú (*0*) y elegí *2* para anotarte.

Si ya estás en el estudio, revisá el número o pedí hablar con una profesora (opción *4*).

Escribí tu DNI otra vez, o 0️⃣ para volver.`;
}

export function respuestaDniInvalido() {
  return `Ese DNI no parece válido. Escribí solo números (sin puntos).

0️⃣ Cancelar y volver`;
}

export function listaActividadesNuevo(actividades) {
  if (!actividades.length) {
    return {
      texto: `Todavía no hay actividades cargadas en el sistema.

Pedí hablar con una profesora (opción 4️⃣ del menú).

0️⃣ Volver`,
      opciones: [],
    };
  }

  const lineas = lineasOpciones(actividades, (a) => {
    const clases =
      a.clasesPorSemana != null && Number.isFinite(Number(a.clasesPorSemana))
        ? ` · ${a.clasesPorSemana} clase${Number(a.clasesPorSemana) === 1 ? '' : 's'}/sem`
        : '';
    return `*${a.nombre}* — ${a.labelPrecio}${clases}`;
  });

  return {
    texto: `📋 Actividades / planes en Savia3:

${lineas}

🎁 La clase de prueba es gratuita. Después el plan se coordina en el estudio.

Para anotarte: volvé al menú nuevo y elegí 3️⃣ (prueba) o 4️⃣ (actividad).

0️⃣ Volver`,
    opciones: actividades,
  };
}

export function listaHorariosNuevo(opciones) {
  if (!opciones.length) {
    return {
      texto: `No hay horarios disponibles en esta semana ni la próxima 😕

Probá más tarde o pedí hablar con una profesora (opción 4️⃣).

0️⃣ Volver`,
      opciones: [],
    };
  }

  return {
    texto: `🗓️ Horarios con cupo libre

${textoHorariosPorDia(opciones, { numerados: false })}

Para anotarte:
• 3️⃣ clase de prueba
• 4️⃣ actividad / plan

0️⃣ Volver`,
    opciones,
    page: 0,
  };
}

export function listaActividadesParaElegir(actividades, { modoAlta = 'prueba' } = {}) {
  if (!actividades.length) {
    return {
      texto: `No hay actividades cargadas. Avisale a una profesora (opción 4️⃣).

0️⃣ Cancelar`,
      opciones: [],
    };
  }

  const lineas = lineasOpciones(actividades, (a) => {
    const clases =
      a.clasesPorSemana != null && Number.isFinite(Number(a.clasesPorSemana))
        ? ` · ${a.clasesPorSemana} x sem`
        : '';
    return `*${a.nombre}* — ${a.labelPrecio}${clases}`;
  });

  const esAct = modoAlta === 'actividad';
  const tip = esAct
    ? `Vas a armar tu plan fijo. Si el plan es *2 x sem*, elegís *2* horarios.`
    : `(La prueba es gratis; el plan lo confirmás después en el estudio.)`;

  return {
    texto: `📋 ¿Qué *actividad / plan* te interesa?

${lineas}

${tip}

0️⃣ Cancelar`,
    opciones: actividades,
  };
}

export function listaHorariosParaElegir(opciones, page = 0, { titulo = null } = {}) {
  if (!opciones.length) {
    return {
      texto: `No quedó ningún horario disponible ahora 😕

Probá más tarde o pedí ayuda con la opción 4️⃣.

0️⃣ Cancelar`,
      opciones: [],
    };
  }

  const pag = renderPaginaOpciones(opciones, page);
  const head = titulo || '🗓️ Elegí el horario de tu *clase de prueba*:';
  return {
    texto: `${head}

${pag.header}${pag.lineas}
${pag.pie ? `\n${pag.pie}` : ''}

✏️ Escribí *día y hora*, ej: *Martes 18:00*

${PIE_NAV}`,
    opciones,
    page: pag.page,
  };
}

export function listaHorariosActividadPaso(opciones, page = 0, { paso = 1, total = 1, elegidosLabels = [] } = {}) {
  if (!opciones.length) {
    return {
      texto: `No hay más horarios con cupo para completar tu plan 😕

Pedí ayuda con la opción 4️⃣ del menú principal.

0️⃣ Cancelar`,
      opciones: [],
    };
  }

  const pag = renderPaginaOpciones(opciones, page);
  const ya =
    elegidosLabels.length > 0
      ? `\n✅ Ya elegiste:\n${elegidosLabels.map((l) => `• ${l}`).join('\n')}\n`
      : '';

  return {
    texto: `🗓️ Elegí el horario *${paso} de ${total}* de tu plan
${ya}
${pag.header}${pag.lineas}
${pag.pie ? `\n${pag.pie}` : ''}

✏️ Escribí *día y hora*, ej: *Martes 18:00*
También podés juntar días: *Martes Miércoles Jueves 07:00*

${PIE_NAV}`,
    opciones,
    page: pag.page,
  };
}

export function respuestaRegistroOk(result) {
  const a = result.alumno;
  const plan = result.actividad
    ? `\n📋 Plan de interés: *${result.actividad.nombre}*`
    : '';
  const claseLabel = labelHorarioCorto(result.clase) || result.clase?.label || '';
  return `✅ ¡Listo ${a.nombre}!

Te anotamos como *alumno/a a prueba* en Savia3.${plan}

🎁 Clase de prueba:
*${claseLabel}*

El estudio te va a confirmar. Si necesitás cambiar algo, escribí *4* (hablar con una profesora).

Cuando ya figuras como alumno/a, usá la opción *3* del menú.

0️⃣ Menú principal`;
}

export function respuestaRegistroActividadOk(result) {
  const a = result.alumno;
  const plan = result.actividad ? `📋 Plan: *${result.actividad.nombre}*\n` : '';
  const clases = Array.isArray(result.clases) ? result.clases : [];
  const lista = clases
    .map((c) => `• ${labelHorarioCorto(c) || c.label || `${c.dia} ${c.hora}`}`)
    .join('\n');

  return `✅ ¡Listo ${a.nombre}!

Te anotamos en Savia3 con tu plan semanal.
${plan}
🗓️ Tus turnos fijos:
${lista || '• (sin detalle)'}

El estudio te va a confirmar. Si necesitás cambiar un día, entrando como alumno/a usá la opción *5*.

0️⃣ Menú principal`;
}

export function listaTurnosParaCambiar(alumno, turnos) {
  const nombre = `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim();
  if (!turnos.length) {
    return {
      texto: `👤 ${nombre}

No tenés turnos fijos cargados para cambiar.

0️⃣ Volver`,
      opciones: [],
    };
  }

  const opciones = turnos.map((t) => {
    const dia = DIAS[Number(t.dia_semana)] || `Día ${t.dia_semana}`;
    const hora = String(t.hora || '').slice(0, 5);
    return {
      turnoId: t.id,
      dia,
      hora,
      titulo: t.titulo || 'Clase',
      etiquetaSemana: 'Tu fijo',
      label: `${dia} ${hora}`,
    };
  });

  const lineas = lineasOpciones(opciones, (o) => `*${o.dia}* ${o.hora}`);
  return {
    texto: `👤 ${nombre}

¿Qué turno fijo querés *cambiar*?

${lineas}

0️⃣ Volver`,
    opciones,
  };
}

export function listaDestinosCambiar(opciones, page = 0, origenLabel = '') {
  if (!opciones.length) {
    return {
      texto: `No hay otros horarios con cupo ahora 😕

Probá más tarde o pedí ayuda (opción 4️⃣).

0️⃣ Volver`,
      opciones: [],
    };
  }

  const pag = renderPaginaOpciones(opciones, page);
  return {
    texto: `🔄 Cambiar: *${origenLabel}*

Elegí el *nuevo* horario:

${pag.header}${pag.lineas}
${pag.pie ? `\n${pag.pie}` : ''}

✏️ Escribí *día y hora*, ej: *Miércoles 19:00*

${PIE_NAV}`,
    opciones,
    page: pag.page,
  };
}

export function textoConfirmarCambio(origenLabel, destinoLabel) {
  return `⚠️ ¿Estás seguro/a de cambiar?

❌ *${origenLabel}*
➡️ *${destinoLabel}*

1️⃣ Sí, cambiar
2️⃣ No, cancelar

${PIE_NAV}`;
}

export function respuestaCambioOk(alumno, origenLabel, destinoLabel, menuFn) {
  const nombre = `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim();
  const menu = typeof menuFn === 'function' ? `\n\n${menuFn()}` : '';
  return `✅ Listo ${nombre}

Cambiaste tu turno fijo:
*${origenLabel}* → *${destinoLabel}*${menu}`;
}
