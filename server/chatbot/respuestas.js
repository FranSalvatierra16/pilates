import { formatoFecha } from './menu.js';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Cuántas opciones mostrar por mensaje (WhatsApp trunca listas largas). */
export const PAGE_SIZE = 8;

/** Números de opción legibles en WhatsApp (10️⃣ se ve mal / “repetido”). */
export function numOpcion(n) {
  const i = Number(n);
  const key = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
  if (i >= 0 && i <= 9) return key[i];
  return `*${i}.*`;
}

export function lineasOpciones(opciones, getLabel = (o) => o.label, offset = 0) {
  return opciones.map((o, i) => `${numOpcion(offset + i + 1)} ${getLabel(o)}`).join('\n');
}

/**
 * Página de opciones con numeración global (1..N) y pie “más / anterior”.
 */
export function renderPaginaOpciones(opciones, page = 0, pageSize = PAGE_SIZE, getLabel = (o) => o.label) {
  const total = opciones.length;
  const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const p = Math.min(Math.max(0, Number(page) || 0), pages - 1);
  const offset = p * pageSize;
  const slice = opciones.slice(offset, offset + pageSize);
  const lineas = lineasOpciones(slice, getLabel, offset);
  const pie = [];
  if (p < pages - 1) pie.push(`${numOpcion(98)} Ver más horarios`);
  if (p > 0) pie.push(`${numOpcion(97)} Página anterior`);
  return {
    lineas,
    pie: pie.join('\n'),
    page: p,
    pages,
    total,
    header: pages > 1 ? `📄 Página ${p + 1} de ${pages} · ${total} horarios\n\n` : '',
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

  const lineas = turnos.map((t) => {
    const dia = DIAS[Number(t.dia_semana)] || `Día ${t.dia_semana}`;
    return `• ${dia} ${t.hora} — ${t.titulo}`;
  });

  return `👤 ${nombre}

🗓️ Tus horarios fijos:

${lineas.join('\n')}

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
    const ya = lineasOpciones(opciones);
    return {
      texto: `👤 ${nombre}

Todas tus clases de esta semana y la próxima ya están liberadas:

${ya}

0️⃣ Volver`,
      opciones: [],
    };
  }

  const pag = renderPaginaOpciones(liberables, page);
  return {
    texto: `👤 ${nombre}

¿Qué clase querés *liberar*?
${pag.header}${pag.lineas}
${pag.pie ? `\n${pag.pie}` : ''}

Se suma 1 crédito para recuperar.

0️⃣ Cancelar y volver`,
    opciones: liberables,
    page: pag.page,
  };
}

export function respuestaLiberacionOk(alumno, opcion, creditos, menuFn) {
  const nombre = `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim();
  const menu = typeof menuFn === 'function' ? `\n\n${menuFn()}` : '';
  return `✅ Listo ${nombre}

Liberaste: *${opcion.label}*

💳 Créditos para recuperar: *${creditos}*

Ahora podés recuperar con la opción 3️⃣ del menú alumno.${menu}`;
}

export function respuestaLiberacionYaHecha(opcion, menuFn) {
  const menu = typeof menuFn === 'function' ? `\n\n${menuFn()}` : '\n\n0️⃣ Volver';
  return `Esa clase ya estaba liberada:
*${opcion.label}*${menu}`;
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

No hay cupos libres para recuperar en esta semana ni la próxima.

Probá más tarde o pedí ayuda a una profesora (opción 4️⃣ del menú principal).

0️⃣ Volver`,
      opciones: [],
    };
  }

  const pag = renderPaginaOpciones(opciones, page);
  return {
    texto: `👤 ${nombre}

💳 Créditos: *${cred}*

¿En qué clase querés *recuperar*?
${pag.header}${pag.lineas}
${pag.pie ? `\n${pag.pie}` : ''}

Al anotarte se descuenta 1 crédito.

0️⃣ Cancelar y volver`,
    opciones,
    page: pag.page,
  };
}

export function respuestaRecuperacionOk(alumno, opcion, creditos, menuFn) {
  const nombre = `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim();
  const menu = typeof menuFn === 'function' ? `\n\n${menuFn()}` : '';
  return `✅ Listo ${nombre}

Te anotaste para recuperar:
*${opcion.label}*

💳 Créditos restantes: *${creditos}*${menu}`;
}

export function respuestaRecuperacionYaHecha(opcion, menuFn) {
  const menu = typeof menuFn === 'function' ? `\n\n${menuFn()}` : '\n\n0️⃣ Volver';
  return `Ya estabas anotada/o en esa recuperación:
*${opcion.label}*${menu}`;
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

Para anotarte: volvé al menú nuevo y elegí 3️⃣.

0️⃣ Volver`,
    opciones: actividades,
  };
}

export function listaHorariosNuevo(opciones, page = 0) {
  if (!opciones.length) {
    return {
      texto: `No hay cupos libres en esta semana ni la próxima 😕

Probá más tarde o pedí hablar con una profesora (opción 4️⃣).

0️⃣ Volver`,
      opciones: [],
    };
  }

  // Solo consulta: listado compacto (sin numeración de elección)
  const maxShow = 25;
  const lineas = opciones.slice(0, maxShow).map((o) => `• ${o.label}`).join('\n');
  const extra =
    opciones.length > maxShow
      ? `\n… y ${opciones.length - maxShow} más.`
      : '';

  return {
    texto: `🗓️ Horarios con cupo libre (${opciones.length}):

${lineas}${extra}

Para anotarte a una clase de prueba: opción 3️⃣ del menú nuevo.

0️⃣ Volver`,
    opciones,
    page: 0,
  };
}

export function listaActividadesParaElegir(actividades) {
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

  return {
    texto: `📋 ¿Qué *actividad / plan* te interesa?

${lineas}

(La prueba es gratis; el plan lo confirmás después en el estudio.)

0️⃣ Cancelar`,
    opciones: actividades,
  };
}

export function listaHorariosParaElegir(opciones, page = 0) {
  if (!opciones.length) {
    return {
      texto: `No quedó ningún cupo libre ahora 😕

Probá más tarde o pedí ayuda con la opción 4️⃣.

0️⃣ Cancelar`,
      opciones: [],
    };
  }

  const pag = renderPaginaOpciones(opciones, page);
  return {
    texto: `🗓️ Elegí el horario de tu *clase de prueba*:
${pag.header}${pag.lineas}
${pag.pie ? `\n${pag.pie}` : ''}

0️⃣ Cancelar`,
    opciones,
    page: pag.page,
  };
}

export function respuestaRegistroOk(result) {
  const a = result.alumno;
  const plan = result.actividad
    ? `\n📋 Plan de interés: *${result.actividad.nombre}*`
    : '';
  return `✅ ¡Listo ${a.nombre}!

Te anotamos como *alumno/a a prueba* en Savia3.${plan}

🎁 Clase de prueba:
*${result.clase.label}*

El estudio te va a confirmar. Si necesitás cambiar algo, escribí *4* (hablar con una profesora).

Cuando ya figuras como alumno/a, usá la opción *3* del menú.

0️⃣ Menú principal`;
}
