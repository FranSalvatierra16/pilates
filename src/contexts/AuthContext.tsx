import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { setAuthToken, storageApi } from '../utils/storage-api';
import { clearFinanzasSession } from '../utils/finanzas-session';
import { clearUnlockLocal } from '../utils/finanzas-local';

const TOKEN_KEY = 'savia_token';
const ROLE_KEY = 'savia_role';
const SUCURSAL_ID_KEY = 'savia_sucursalId';
const SUCURSAL_NOMBRE_KEY = 'savia_sucursalNombre';
const FOTO_PERFIL_KEY = 'savia_fotoPerfil';
const PLANIFICACION_KEY = 'savia_planificacion_habilitada';

export type Role = 'admin' | 'sucursal';

interface AuthContextType {
  isAuthenticated: boolean;
  role: Role | null;
  token: string | null;
  sucursalId: string | null;
  sucursalNombre: string | null;
  fotoPerfil: string | null;
  /** Solo sucursal: módulo planificación (admin lo activa por sede) */
  planificacionHabilitada: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<{ role: Role } | { error: string }>;
  logout: () => void;
  /** Sincroniza el flag con el servidor (ej. después de que admin habilita planificación) */
  refreshPlanificacionFlag: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const useApi = () => {
  if (import.meta.env.VITE_USE_API === 'false') return false;
  if (import.meta.env.VITE_USE_API === 'true') return true;
  return import.meta.env.PROD;
};
const getApiBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

function readPlanificacionStored(): boolean {
  return localStorage.getItem(PLANIFICACION_KEY) === 'true';
}

type AuthState = {
  isAuthenticated: boolean;
  role: Role | null;
  token: string | null;
  sucursalId: string | null;
  sucursalNombre: string | null;
  fotoPerfil: string | null;
  planificacionHabilitada: boolean;
};

function loadStored(): AuthState {
  const token = localStorage.getItem(TOKEN_KEY);
  const role = localStorage.getItem(ROLE_KEY) as Role | null;
  if (!token || !role) {
    return {
      isAuthenticated: false,
      role: null,
      token: null,
      sucursalId: null,
      sucursalNombre: null,
      fotoPerfil: null,
      planificacionHabilitada: false,
    };
  }
  let sucursalId = localStorage.getItem(SUCURSAL_ID_KEY);
  if (!sucursalId && role === 'sucursal') {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      sucursalId = payload.sucursalId || payload.sub || null;
      if (sucursalId) localStorage.setItem(SUCURSAL_ID_KEY, sucursalId);
    } catch {
      // ignore
    }
  }
  const planificacionHabilitada = role === 'sucursal' ? readPlanificacionStored() : false;
  return {
    isAuthenticated: true,
    role,
    token,
    sucursalId,
    sucursalNombre: localStorage.getItem(SUCURSAL_NOMBRE_KEY),
    fotoPerfil: localStorage.getItem(FOTO_PERFIL_KEY),
    planificacionHabilitada,
  };
}

const initialState = loadStored();
if (initialState.token) setAuthToken(initialState.token);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>(initialState);

  useEffect(() => {
    if (state.isAuthenticated && state.role) {
      setAuthToken(state.token);
      if (state.token) localStorage.setItem(TOKEN_KEY, state.token);
      else localStorage.removeItem(TOKEN_KEY);
      localStorage.setItem(ROLE_KEY, state.role);
      if (state.sucursalId) localStorage.setItem(SUCURSAL_ID_KEY, state.sucursalId);
      else localStorage.removeItem(SUCURSAL_ID_KEY);
      if (state.sucursalNombre) localStorage.setItem(SUCURSAL_NOMBRE_KEY, state.sucursalNombre);
      else localStorage.removeItem(SUCURSAL_NOMBRE_KEY);
      if (state.fotoPerfil) localStorage.setItem(FOTO_PERFIL_KEY, state.fotoPerfil);
      else localStorage.removeItem(FOTO_PERFIL_KEY);
      if (state.role === 'sucursal') {
        localStorage.setItem(PLANIFICACION_KEY, state.planificacionHabilitada ? 'true' : 'false');
      }
    } else {
      setAuthToken(null);
      clearFinanzasSession();
      clearUnlockLocal();
      [TOKEN_KEY, ROLE_KEY, SUCURSAL_ID_KEY, SUCURSAL_NOMBRE_KEY, FOTO_PERFIL_KEY, PLANIFICACION_KEY].forEach((k) =>
        localStorage.removeItem(k)
      );
    }
  }, [
    state.isAuthenticated,
    state.token,
    state.role,
    state.sucursalId,
    state.sucursalNombre,
    state.fotoPerfil,
    state.planificacionHabilitada,
  ]);

  const refreshPlanificacionFlag = useCallback(async () => {
    if (!useApi()) {
      setState((s) => (s.role === 'sucursal' ? { ...s, planificacionHabilitada: true } : s));
      return;
    }
    if (state.role !== 'sucursal' || !state.token) return;
    try {
      const { planificacionHabilitada } = await storageApi.sucursal.getFeatures();
      setState((s) => ({ ...s, planificacionHabilitada }));
    } catch {
      /* ignore */
    }
  }, [state.role, state.token]);

  const login = useCallback(async (username: string, password: string): Promise<{ role: Role } | { error: string }> => {
    if (useApi()) {
      const body = JSON.stringify({ usuario: username.trim(), password });
      const url = getApiBase() + '/api/auth/login';
      const attemptLogin = async (): Promise<{ role: Role } | { error: string }> => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok && data.token && data.role) {
          const role = data.role as Role;
          const planificacionHabilitada = role === 'sucursal' && data.planificacionHabilitada === true;
          setAuthToken(data.token);
          localStorage.setItem(TOKEN_KEY, data.token);
          localStorage.setItem(ROLE_KEY, role);
          if (data.sucursalId) localStorage.setItem(SUCURSAL_ID_KEY, data.sucursalId);
          else localStorage.removeItem(SUCURSAL_ID_KEY);
          if (data.sucursalNombre) localStorage.setItem(SUCURSAL_NOMBRE_KEY, data.sucursalNombre);
          else localStorage.removeItem(SUCURSAL_NOMBRE_KEY);
          if (data.fotoPerfil) localStorage.setItem(FOTO_PERFIL_KEY, data.fotoPerfil);
          else localStorage.removeItem(FOTO_PERFIL_KEY);
          if (role === 'sucursal') {
            localStorage.setItem(PLANIFICACION_KEY, planificacionHabilitada ? 'true' : 'false');
          }
          setState({
            isAuthenticated: true,
            token: data.token,
            role,
            sucursalId: data.sucursalId ?? null,
            sucursalNombre: data.sucursalNombre ?? null,
            fotoPerfil: data.fotoPerfil ?? null,
            planificacionHabilitada: role === 'sucursal' ? planificacionHabilitada : false,
          });
          return { role };
        }
        const errMsg = typeof data.error === 'string' ? data.error : '';
        if (res.status === 503 || /conexión|conectar|interrumpió|reintentá/i.test(errMsg)) {
          return { error: errMsg || 'No se pudo conectar con el servidor. Revisá tu internet e intentá de nuevo.' };
        }
        return { error: errMsg || 'Usuario o contraseña incorrectos' };
      };
      try {
        const first = await attemptLogin();
        if ('role' in first) return first;
        const retryable =
          first.error.includes('conectar') ||
          first.error.includes('conexión') ||
          first.error.includes('interrumpió') ||
          first.error.includes('reintentá');
        if (retryable) {
          await new Promise((r) => setTimeout(r, 800));
          return attemptLogin();
        }
        return first;
      } catch {
        return { error: 'No se pudo conectar con el servidor. Revisá tu internet e intentá de nuevo.' };
      }
    }
    if (username === 'Savia' && password === '2286') {
      localStorage.setItem(PLANIFICACION_KEY, 'true');
      setState({
        isAuthenticated: true,
        token: null,
        role: 'sucursal',
        sucursalId: null,
        sucursalNombre: 'Savia',
        fotoPerfil: null,
        planificacionHabilitada: true,
      });
      return { role: 'sucursal' };
    }
    return { error: 'Usuario o contraseña incorrectos' };
  }, []);

  const logout = useCallback(() => {
    setState({
      isAuthenticated: false,
      role: null,
      token: null,
      sucursalId: null,
      sucursalNombre: null,
      fotoPerfil: null,
      planificacionHabilitada: false,
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: state.isAuthenticated,
        role: state.role,
        token: state.token,
        sucursalId: state.sucursalId,
        sucursalNombre: state.sucursalNombre,
        fotoPerfil: state.fotoPerfil,
        planificacionHabilitada: state.planificacionHabilitada,
        isAdmin: state.role === 'admin',
        login,
        logout,
        refreshPlanificacionFlag,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
