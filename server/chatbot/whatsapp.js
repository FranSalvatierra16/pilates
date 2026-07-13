/** Placeholder: el envío a WhatsApp lo hace n8n.
 *  Este módulo queda para lógica futura (templates, normalización de payload, etc.).
 */
export function payloadParaN8n({ telefono, reply }) {
  return {
    telefono,
    mensaje: reply,
  };
}
