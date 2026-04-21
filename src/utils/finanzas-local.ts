import bcrypt from 'bcryptjs';
import type { FinanzasEstado, Pago } from '../types';

const KEY_HASH = 'savia_finanzas_pin_hash';
const KEY_AUTO = 'savia_finanzas_auto_min';
const SS_UNLOCK = 'savia_finanzas_unlock_until';

export function fechaHoyArgentina(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function readHash(): string | null {
  try {
    return localStorage.getItem(KEY_HASH);
  } catch {
    return null;
  }
}

function readAuto(): number {
  try {
    const v = localStorage.getItem(KEY_AUTO);
    const n = Number(v);
    return Math.max(1, Math.min(480, Number.isFinite(n) ? n : 15));
  } catch {
    return 15;
  }
}

export function finanzasLocalRestringido(): boolean {
  const h = readHash();
  if (!h) return false;
  const until = Number(sessionStorage.getItem(SS_UNLOCK) || 0);
  return !until || Date.now() > until;
}

export function getEstadoLocal(): FinanzasEstado {
  const pinConfigurado = !!readHash();
  const until = Number(sessionStorage.getItem(SS_UNLOCK) || 0);
  const desbloqueado = !pinConfigurado || (until > 0 && Date.now() < until);
  return { pinConfigurado, autoBloqueoMinutos: readAuto(), desbloqueado };
}

export function getUnlockUntilMs(): number | null {
  try {
    const u = Number(sessionStorage.getItem(SS_UNLOCK) || 0);
    if (!u) return null;
    return u;
  } catch {
    return null;
  }
}

export async function desbloquearLocal(pin: string): Promise<void> {
  const h = readHash();
  if (!h) throw new Error('No hay PIN configurado');
  const ok = await bcrypt.compare(pin, h);
  if (!ok) throw new Error('PIN incorrecto');
  const autoMin = readAuto();
  sessionStorage.setItem(SS_UNLOCK, String(Date.now() + autoMin * 60 * 1000));
}

export async function crearPinLocal(pin: string, pinConfirm: string, autoBloqueoMinutos: number): Promise<void> {
  if (readHash()) throw new Error('Ya existe un PIN');
  if (pin.length < 4 || pin.length > 72) throw new Error('El PIN debe tener entre 4 y 72 caracteres');
  if (pin !== pinConfirm) throw new Error('Los PIN no coinciden');
  const hash = await bcrypt.hash(pin, 10);
  const auto = Math.max(1, Math.min(480, Number(autoBloqueoMinutos) || 15));
  localStorage.setItem(KEY_HASH, hash);
  localStorage.setItem(KEY_AUTO, String(auto));
}

export function actualizarSoloAutoLocal(autoBloqueoMinutos: number): void {
  const auto = Math.max(1, Math.min(480, Number(autoBloqueoMinutos) || 15));
  localStorage.setItem(KEY_AUTO, String(auto));
}

export async function cambiarPinLocal(params: {
  pinActual: string;
  pin?: string;
  pinConfirm?: string;
  autoBloqueoMinutos?: number;
}): Promise<void> {
  const h = readHash();
  if (!h) throw new Error('No hay PIN');
  const ok = await bcrypt.compare(params.pinActual, h);
  if (!ok) throw new Error('PIN actual incorrecto');
  if (params.autoBloqueoMinutos !== undefined) {
    actualizarSoloAutoLocal(params.autoBloqueoMinutos);
  }
  if (params.pin) {
    if (params.pin.length < 4 || params.pin.length > 72) throw new Error('El PIN debe tener entre 4 y 72 caracteres');
    if (params.pin !== params.pinConfirm) throw new Error('Los PIN no coinciden');
    localStorage.setItem(KEY_HASH, await bcrypt.hash(params.pin, 10));
  }
}

export async function quitarPinLocal(pinActual: string): Promise<void> {
  const h = readHash();
  if (!h) return;
  const ok = await bcrypt.compare(pinActual, h);
  if (!ok) throw new Error('PIN incorrecto');
  localStorage.removeItem(KEY_HASH);
  localStorage.removeItem(KEY_AUTO);
  sessionStorage.removeItem(SS_UNLOCK);
}

export function filtrarPagosHoyLocal(pagos: Pago[]): Pago[] {
  const hoy = fechaHoyArgentina();
  return pagos.filter((p) => String(p.fecha).slice(0, 10) === hoy);
}

export function clearUnlockLocal() {
  try {
    sessionStorage.removeItem(SS_UNLOCK);
  } catch {
    /* ignore */
  }
}
