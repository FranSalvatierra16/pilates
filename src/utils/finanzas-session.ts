const TOKEN_KEY = 'savia_finanzas_token';
const EXPIRES_KEY = 'savia_finanzas_expires_at';

export function getFinanzasExpiresAtMs(): number | null {
  try {
    const e = sessionStorage.getItem(EXPIRES_KEY);
    if (!e) return null;
    const n = Number(e);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function getFinanzasToken(): string | null {
  try {
    const exp = getFinanzasExpiresAtMs();
    if (exp != null && Date.now() > exp) {
      clearFinanzasSession();
      return null;
    }
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setFinanzasSession(token: string, expiresAtMs: number) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(EXPIRES_KEY, String(expiresAtMs));
  } catch {
    /* ignore */
  }
}

export function clearFinanzasSession() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRES_KEY);
  } catch {
    /* ignore */
  }
}
