/** Detecta navegadores embebidos (WhatsApp, Instagram, etc.) donde NO se puede instalar la PWA. */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/WhatsApp|FBAN|FBAV|Instagram|Line\/|MicroMessenger|Twitter|TikTok/i.test(ua)) return true;
  // iOS WebView (sin Safari completo)
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (isIOS && /AppleWebKit/i.test(ua) && !/Safari/i.test(ua)) return true;
  return false;
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}
