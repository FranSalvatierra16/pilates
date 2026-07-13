export function menuPrincipal() {
  return `🌿 ¡Hola! Bienvenido a Savia Pilates (Savia3 — prueba)!

Soy el asistente del estudio 😊

¿Cómo puedo ayudarte?

1️⃣ Conocer Savia Pilates
2️⃣ Ya soy alumno/a
3️⃣ Hablar con una profesora

✍️ También podés escribir tu consulta directamente.
0️⃣ Volver a este menú`;
}

export function menuAlumno() {
  return `😊 Perfecto.

Elegí una opción:

1️⃣ Ver vencimiento
2️⃣ Liberar una clase (esta / próxima semana)
3️⃣ Recuperar una clase
4️⃣ Ver mis horarios

0️⃣ Volver al menú principal`;
}

export function pedirDni(accionLabel) {
  return `🔑 Para ${accionLabel}, necesito tu DNI.

Escribí solo los números (sin puntos).

0️⃣ Cancelar y volver`;
}

export function textoConocerSavia() {
  return `💚 Savia Pilates es un entrenamiento en formato circuito donde trabajás con Reformer, Chair, Barril y Unidad de Pared.

Podés enfocarte en fuerza, movilidad, postura o rehabilitación.

🎁 Además tenés una clase de prueba gratuita.

0️⃣ Volver al menú principal`;
}

export function textoHablarProfesora() {
  return `😊 Perfecto. En unos minutos una profesora se va a comunicar con vos.

Si preferís, también podés dejar tu consulta escribiendo el número 3️⃣ otra vez o volviendo al menú.

0️⃣ Volver al menú principal`;
}

export function textoConsultaRecibida() {
  return `✅ Recibimos tu mensaje. Una profesora te va a responder a la brevedad.

0️⃣ Volver al menú principal`;
}

export function textoOpcionInvalida(menuFn) {
  return `No entendí esa opción 🙈

${menuFn()}`;
}

export function formatoFecha(fecha) {
  if (!fecha) return 'sin fecha cargada';
  const d = typeof fecha === 'string' ? fecha.slice(0, 10) : new Date(fecha).toISOString().slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return String(fecha);
  return `${day}/${m}/${y}`;
}
