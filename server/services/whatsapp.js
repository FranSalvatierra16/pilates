import { chatbotAvisoWhatsappFromEnv } from '../chatbot/config.js';

/**
 * Envío de WhatsApp vía GREEN-API (mismo proveedor que n8n).
 *
 * Variables de entorno:
 *   GREEN_API_URL              (opcional, default https://api.green-api.com)
 *   GREEN_API_ID_INSTANCE      o GREEN_API_INSTANCE_ID
 *   GREEN_API_TOKEN_INSTANCE   o GREEN_API_TOKEN
 *   CHATBOT_AVISO_WHATSAPP     (opcional; default 5492235029881)
 */

const DIAS_CORTO = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

function greenApiCreds() {
  const id =
    (process.env.GREEN_API_ID_INSTANCE || process.env.GREEN_API_INSTANCE_ID || '').trim();
  const token =
    (process.env.GREEN_API_TOKEN_INSTANCE || process.env.GREEN_API_TOKEN || '').trim();
  const apiUrl = (process.env.GREEN_API_URL || 'https://api.green-api.com').replace(/\/$/, '');
  if (!id || !token) return null;
  return { id, token, apiUrl };
}

/** Solo dígitos; normaliza a formato internacional AR (549…) cuando aplica. */
export function normalizarTelefonoWhatsApp(telefono) {
  let digits = String(telefono || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  // 15XXXXXXXX → sacar 15
  if (digits.startsWith('15') && digits.length === 12) digits = digits.slice(2);
  // Sin país: 10 dígitos (11xxxxxxxx) o 11 con 15
  if (!digits.startsWith('54')) {
    if (digits.length === 10 || digits.length === 11) digits = '54' + digits;
  }
  // Argentina móvil: 54 + 9 + área + número (ej. 54911…)
  if (digits.startsWith('54') && digits.length >= 12 && digits[2] !== '9') {
    digits = '549' + digits.slice(2);
  }
  return digits;
}

export function chatIdFromTelefono(telefono) {
  const digits = normalizarTelefonoWhatsApp(telefono);
  if (!digits || digits.length < 10) return null;
  return `${digits}@c.us`;
}

export function telefonoAvisoProfesorFromEnv() {
  return chatbotAvisoWhatsappFromEnv();
}

/**
 * Envía un texto por GREEN-API. No lanza si falla (log + return false).
 */
export async function enviarWhatsApp(telefono, mensaje) {
  const creds = greenApiCreds();
  if (!creds) {
    console.warn('[whatsapp] Faltan GREEN_API_ID_INSTANCE / GREEN_API_TOKEN_INSTANCE');
    return { ok: false, skipped: true, reason: 'no_creds' };
  }
  const chatId = chatIdFromTelefono(telefono);
  if (!chatId) {
    console.warn('[whatsapp] Teléfono inválido:', String(telefono).slice(0, 6));
    return { ok: false, skipped: true, reason: 'bad_phone' };
  }
  const text = String(mensaje || '').trim();
  if (!text) return { ok: false, skipped: true, reason: 'empty' };

  const url = `${creds.apiUrl}/waInstance${creds.id}/sendMessage/${creds.token}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message: text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[whatsapp] sendMessage error', res.status, body);
      return { ok: false, status: res.status, body };
    }
    return { ok: true, chatId, body };
  } catch (e) {
    console.error('[whatsapp] sendMessage fail', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

function labelTurno(turno, semana) {
  if (!turno) return 'clase';
  const dia =
    turno.dia != null
      ? DIAS_CORTO[Number(turno.dia_semana ?? turno.dia)] || String(turno.dia)
      : DIAS_CORTO[Number(turno.dia_semana)] || `Día ${turno.dia_semana}`;
  const hora = String(turno.hora || '').slice(0, 5);
  const titulo = String(turno.titulo || '').trim();
  const parts = [semana ? String(semana) : null, `${dia} ${hora}`, titulo || null].filter(Boolean);
  return parts.join(' · ');
}

function nombreAlumno(alumno) {
  return `${alumno?.nombre || ''} ${alumno?.apellido || ''}`.trim() || 'Alumno/a';
}

/**
 * Avisa al celular configurado (profe).
 * Fire-and-forget: nunca tira el flujo principal.
 *
 * tipos: liberar | recuperar | anotar | nuevo | prueba | consulta | hablar
 */
export async function avisarProfesorChatbot({
  tipo,
  alumno,
  turno,
  semana,
  extraLabel,
  telefonoCliente,
  consultaTexto,
} = {}) {
  const dest = telefonoAvisoProfesorFromEnv();
  if (!dest) {
    console.warn('[whatsapp] CHATBOT_AVISO_WHATSAPP no configurado — no se avisa al profe');
    return { ok: false, skipped: true, reason: 'no_dest' };
  }

  const nombre = nombreAlumno(alumno);
  const clase = extraLabel || labelTurno(turno, semana);
  const telCliente = normalizarTelefonoWhatsApp(telefonoCliente || alumno?.telefono || '');
  const contacto = telCliente ? `\n📱 WhatsApp: +${telCliente}\n🔗 https://wa.me/${telCliente}` : '';

  let mensaje;
  if (tipo === 'liberar') {
    mensaje = `🔔 *Liberó una clase*\n\n👤 ${nombre}${contacto}\n🗓️ ${clase}\n\n(Chatbot Savia3)`;
  } else if (tipo === 'recuperar' || tipo === 'anotar') {
    mensaje = `🔔 *Se anotó a una clase*\n\n👤 ${nombre}${contacto}\n🗓️ ${clase}\n\n(Chatbot Savia3)`;
  } else if (tipo === 'prueba' || tipo === 'nuevo') {
    mensaje = `🌱 *Alumno/a nuevo a prueba*\n\n👤 ${nombre}${contacto}\n🗓️ ${clase}\n\n(Chatbot Savia3)`;
  } else if (tipo === 'hablar' || tipo === 'consulta') {
    const texto = String(consultaTexto || '').trim();
    mensaje = `👩‍🏫 *Quiere hablar con una profesora*\n\n📱 WhatsApp del interesado: +${telCliente || 'desconocido'}${
      telCliente ? `\n🔗 https://wa.me/${telCliente}` : ''
    }${texto ? `\n\n💬 Mensaje:\n${texto}` : '\n\n(Todavía no dejó mensaje; espera tu contacto.)'}\n\n(Chatbot Savia3)`;
  } else {
    mensaje = `🔔 Aviso chatbot\n👤 ${nombre}${contacto}\n🗓️ ${clase}`;
  }

  return enviarWhatsApp(dest, mensaje);
}
