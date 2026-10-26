/** Teléfono listo para wa.me (Argentina: 54 9 + área + número). Null si no alcanza. */
export function telefonoWhatsApp(telefono: string | undefined | null): string | null {
  if (!telefono || !telefono.trim()) return null;
  let digits = telefono.replace(/\D/g, '');
  if (digits.startsWith('15') && digits.length === 12) digits = digits.slice(2);
  if (digits.length < 8) return null;
  let num = digits;
  if (!num.startsWith('54')) num = '54' + num;
  if (num.startsWith('54') && num.length >= 11 && num[2] !== '9') num = '549' + num.slice(2);
  return num.length >= 12 ? num : null;
}

export function urlWhatsApp(telefono: string | undefined | null, texto: string): string | null {
  const phone = telefonoWhatsApp(telefono);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(texto)}`;
}
