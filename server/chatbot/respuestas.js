import { formatoFecha } from './menu.js';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

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

Consultá con tu estudio o pedí hablar con una profesora (opción 3️⃣ del menú).

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

export function respuestaCancelar(alumno) {
  const nombre = `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim();
  const creditos = Number(alumno.clases_para_recuperar) || 0;

  return `👤 ${nombre}

Para liberar una clase, elegí una de la lista (esta semana y la próxima).

💳 Créditos actuales: *${creditos}*

0️⃣ Volver al menú alumno`;
}

export function listaLiberarClases(alumno, opciones) {
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
    const ya = opciones.map((o, i) => `${i + 1}️⃣ ${o.label}`).join('\n');
    return {
      texto: `👤 ${nombre}

Todas tus clases de esta semana y la próxima ya están liberadas:

${ya}

0️⃣ Volver`,
      opciones: [],
    };
  }

  const lineas = liberables.map((o, i) => `${i + 1}️⃣ ${o.label}`);
  return {
    texto: `👤 ${nombre}

¿Qué clase querés *liberar*?

${lineas.join('\n')}

Se suma 1 crédito para recuperar.

0️⃣ Cancelar y volver`,
    opciones: liberables,
  };
}

export function respuestaLiberacionOk(alumno, opcion, creditos) {
  const nombre = `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim();
  return `✅ Listo ${nombre}

Liberaste: *${opcion.label}*

💳 Créditos para recuperar: *${creditos}*

Ahora podés recuperar con la opción 3️⃣ del menú alumno.

0️⃣ Menú alumno`;
}

export function respuestaLiberacionYaHecha(opcion) {
  return `Esa clase ya estaba liberada:
*${opcion.label}*

0️⃣ Volver`;
}

export function listaRecuperarClases(alumno, opciones, creditos) {
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

Probá más tarde o pedí ayuda a una profesora (opción 3️⃣ del menú principal).

0️⃣ Volver`,
      opciones: [],
    };
  }

  const lineas = opciones.map((o, i) => `${i + 1}️⃣ ${o.label}`);
  return {
    texto: `👤 ${nombre}

💳 Créditos: *${cred}*

¿En qué clase querés *recuperar*?

${lineas.join('\n')}

Al anotarte se descuenta 1 crédito.

0️⃣ Cancelar y volver`,
    opciones,
  };
}

export function respuestaRecuperacionOk(alumno, opcion, creditos) {
  const nombre = `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim();
  return `✅ Listo ${nombre}

Te anotaste para recuperar:
*${opcion.label}*

💳 Créditos restantes: *${creditos}*

0️⃣ Menú alumno`;
}

export function respuestaRecuperacionYaHecha(opcion) {
  return `Ya estabas anotada/o en esa recuperación:
*${opcion.label}*

0️⃣ Volver`;
}

export function respuestaDniNoEncontrado() {
  return `No encontré un alumno activo con ese DNI en *Savia3* (prueba) 😕

Revisá el número e intentá de nuevo, o pedí hablar con una profesora (opción 3️⃣ del menú).

Escribí tu DNI otra vez, o 0️⃣ para volver.`;
}

export function respuestaDniInvalido() {
  return `Ese DNI no parece válido. Escribí solo números (sin puntos).

0️⃣ Cancelar y volver`;
}
