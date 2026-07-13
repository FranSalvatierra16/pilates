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

Para *cancelar / liberar* una clase de esta semana, usá el link *Tu clase* que te dio el estudio (portal del alumno).

Ahí podés liberar tu fija y generar crédito para recuperar.

💳 Créditos para recuperar: *${creditos}*

Si no tenés el link, pedilo a tu estudio (opción 3️⃣).

0️⃣ Volver al menú principal`;
}

export function respuestaRecuperar(alumno) {
  const nombre = `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim();
  const creditos = Number(alumno.clases_para_recuperar) || 0;

  return `👤 ${nombre}

Para *recuperar* una clase, entrá a *Tu clase* con tu DNI y anotate en un horario con cupo libre.

💳 Créditos disponibles: *${creditos}*

Si no tenés créditos, primero liberá una fija o pedí ayuda a una profesora (opción 3️⃣).

0️⃣ Volver al menú principal`;
}

export function respuestaDniNoEncontrado() {
  return `No encontré un alumno activo con ese DNI 😕

Revisá el número e intentá de nuevo, o pedí hablar con una profesora (opción 3️⃣ del menú).

Escribí tu DNI otra vez, o 0️⃣ para volver.`;
}

export function respuestaDniInvalido() {
  return `Ese DNI no parece válido. Escribí solo números (sin puntos).

0️⃣ Cancelar y volver`;
}
