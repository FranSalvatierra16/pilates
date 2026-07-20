/** Pie estándar: 0 = atrás / 00 = menú principal */
export const PIE_NAV =
  `0️⃣ Volver atrás
0️⃣0️⃣ Menú principal
(o escribí *menu*)`;

export function conNav(texto, { atrasLabel = 'Volver atrás' } = {}) {
  const t = String(texto || '').replace(/\n*0️⃣[^\n]*/g, '').trimEnd();
  return `${t}

0️⃣ ${atrasLabel}
0️⃣0️⃣ Menú principal
(o escribí *menu*)`;
}

export function menuPrincipal() {
  return `🌿 ¡Hola! Bienvenido a *Fgest*!

Soy el asistente del estudio 😊

¿Cómo puedo ayudarte?

1️⃣ Conocer Fgest
2️⃣ Quiero anotarme (nuevo / prueba)
3️⃣ Ya soy alumno/a
4️⃣ Hablar con una profesora

✍️ También podés escribir tu consulta directamente.
(Escribí *menu* o *hola* para volver acá)`;
}

export function menuAlumno() {
  return `😊 Perfecto.

Elegí una opción:

1️⃣ Ver vencimiento
2️⃣ Liberar una clase (fija o recuperación)
3️⃣ Recuperar una clase
4️⃣ Ver mis horarios
5️⃣ Cambiar un turno fijo

${PIE_NAV}`;
}

export function menuNuevo() {
  return `🌱 ¡Genial que quieras sumarte!

Elegí una opción:

1️⃣ Ver actividades / planes
2️⃣ Ver horarios con cupo libre
3️⃣ Anotarme a una *clase de prueba*
4️⃣ Anotarme a una *actividad* (plan semanal)

${PIE_NAV}`;
}

export function pedirDni(accionLabel) {
  return conNav(
    `🔑 Para ${accionLabel}, necesito tu DNI.

Escribí solo los números (sin puntos).`,
    { atrasLabel: 'Cancelar (menú alumno)' }
  );
}

export function textoConocerSavia() {
  return conNav(
    `💚 *Fgest* es un entrenamiento en formato circuito donde trabajás con Reformer, Chair, Barril y Unidad de Pared.

Podés enfocarte en fuerza, movilidad, postura o rehabilitación.

🎁 Tenés una clase de prueba gratuita.

Para anotarte: *2* en el menú.`,
    { atrasLabel: 'Menú principal' }
  );
}

export function textoHablarProfesora() {
  return `😊 Perfecto. Ya avisamos a una profesora: se va a comunicar con vos.

Podés dejar tu consulta por escrito ahora (se la reenviamos).

⏸️ Mientras hablen, el asistente *no responde* para no molestar.

Cuando quieras volver al menú automático, escribí *menu*.`;
}

export function textoConsultaRecibida() {
  return `✅ Listo, se lo pasamos a una profesora.

⏸️ El asistente queda en pausa. Escribí *menu* si querés usar el bot otra vez.`;
}

export function textoOpcionInvalida(menuFn) {
  return `No entendí esa opción 🙈

${menuFn()}`;
}

export function pedirDatosNuevo() {
  return conNav(
    `✍️ Escribí en *un solo mensaje* tu *nombre, apellido y DNI*.

Ejemplo:
*Juan Pérez 40123456*`,
    { atrasLabel: 'Menú nuevo' }
  );
}

export function pedirNombreNuevo() {
  return conNav(`✍️ ¿Cómo es tu *nombre*?

(Solo el nombre, sin apellido)`, { atrasLabel: 'Menú nuevo' });
}

export function pedirApellidoNuevo() {
  return conNav(`✍️ ¿Y tu *apellido*?`, { atrasLabel: 'Paso anterior (nombre)' });
}

export function pedirDniNuevo() {
  return conNav(`🔑 Escribí tu *DNI* (solo números, sin puntos).`, {
    atrasLabel: 'Paso anterior (apellido)',
  });
}

export function pedirEmailNuevo() {
  return conNav(
    `📧 Escribí tu *email*.

Si no querés dejarlo, respondé con *-* (guión).`,
    { atrasLabel: 'Paso anterior (DNI)' }
  );
}

export function formatoFecha(fecha) {
  if (!fecha) return 'sin fecha cargada';
  const d = typeof fecha === 'string' ? fecha.slice(0, 10) : new Date(fecha).toISOString().slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return String(fecha);
  return `${day}/${m}/${y}`;
}
