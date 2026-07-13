/**
 * El chatbot (WhatsApp / n8n) trabaja solo con esta sucursal de prueba.
 * Override: CHATBOT_SUCURSAL_ID o CHATBOT_SUCURSAL_USUARIO en el entorno.
 */
export const CHATBOT_SUCURSAL_DEFAULT_ID = '55b80665-f82a-44c5-b075-7c8ecf406134'; // FitGest / usuario Savia3
export const CHATBOT_SUCURSAL_DEFAULT_USUARIO = 'Savia3';

/** Celular del profe a avisar (liberar / anotar). Override: CHATBOT_AVISO_WHATSAPP */
export const CHATBOT_AVISO_WHATSAPP_DEFAULT = '5492235029881';

export function chatbotSucursalIdFromEnv() {
  const fromEnv = (process.env.CHATBOT_SUCURSAL_ID || '').trim();
  return fromEnv || CHATBOT_SUCURSAL_DEFAULT_ID;
}

export function chatbotSucursalUsuarioFromEnv() {
  const fromEnv = (process.env.CHATBOT_SUCURSAL_USUARIO || '').trim();
  return fromEnv || CHATBOT_SUCURSAL_DEFAULT_USUARIO;
}

/**
 * Celular del profe / dueño a avisar cuando liberan o se anotan (WhatsApp).
 * Default: 5492235029881 — override con CHATBOT_AVISO_WHATSAPP.
 */
export function chatbotAvisoWhatsappFromEnv() {
  return (
    process.env.CHATBOT_AVISO_WHATSAPP ||
    process.env.CHATBOT_PROFESOR_WHATSAPP ||
    process.env.CHATBOT_PROFESOR_TELEFONO ||
    CHATBOT_AVISO_WHATSAPP_DEFAULT
  ).trim();
}
