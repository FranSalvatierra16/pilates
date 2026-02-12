import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

const TOKEN_KEY = 'savia_token';
const ROLE_KEY = 'savia_role';
const SUCURSAL_ID_KEY = 'savia_sucursalId';
const SUCURSAL_NOMBRE_KEY = 'savia_sucursalNombre';
const FOTO_PERFIL_KEY = 'savia_fotoPerfil';

export type Role = 'admin' | 'sucursal';

interface AuthContextType {
  isAuthenticated: boolean;
  role: Role | null;
  token: string | null;
  sucursalId: string | null;
  sucursalNombre: string | null;
  fotoPerfil: string | null;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<Role | false>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const useApi = () => {
  if (import.meta.env.VITE_USE_API === 'false') return false;
  if (import.meta.env.VITE_USE_API === 'true') return true;
  return import.meta.env.PROD;
};
const getApiBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

type AuthState = {
  isAuthenticated: boolean;
  role: Role | null;
  token: string | null;
  sucursalId: string | null;
  sucursalNombre: string | null;
  fotoPerfil: string | null;
};

function loadStored(): AuthState {
  const token = localStorage.getItem(TOKEN_KEY);
  const role = localStorage.getItem(ROLE_KEY) as Role | null;
  if (!token || !role) return { isAuthenticated: false, role: null, token: null, sucursalId: null, sucursalNombre: null, fotoPerfil: null };
  return {
    isAuthenticated: true,
    role,
    token,
    sucursalId: localStorage.getItem(SUCURSAL_ID_KEY),
    sucursalNombre: localStorage.getItem(SUCURSAL_NOMBRE_KEY),
    fotoPerfil: localStorage.getItem(FOTO_PERFIL_KEY),
  };
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>(loadStored);

  useEffect(() => {
    if (state.isAuthenticated && state.role) {
      if (state.token) localStorage.setItem(TOKEN_KEY, state.token);
      else localStorage.removeItem(TOKEN_KEY);
      localStorage.setItem(ROLE_KEY, state.role);
      if (state.sucursalId) localStorage.setItem(SUCURSAL_ID_KEY, state.sucursalId);
      else localStorage.removeItem(SUCURSAL_ID_KEY);
      if (state.sucursalNombre) localStorage.setItem(SUCURSAL_NOMBRE_KEY, state.sucursalNombre);
      else localStorage.removeItem(SUCURSAL_NOMBRE_KEY);
      if (state.fotoPerfil) localStorage.setItem(FOTO_PERFIL_KEY, state.fotoPerfil);
      else localStorage.removeItem(FOTO_PERFIL_KEY);
    } else {
      [TOKEN_KEY, ROLE_KEY, SUCURSAL_ID_KEY, SUCURSAL_NOMBRE_KEY, FOTO_PERFIL_KEY].forEach((k) => localStorage.removeItem(k));
    }
  }, [state.isAuthenticated, state.token, state.role, state.sucursalId, state.sucursalNombre, state.fotoPerfil]);

  const login = useCallback(async (username: string, password: string): Promise<Role | false> => {
    if (useApi()) {
      try {
        const res = await fetch(getApiBase() + '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario: username.trim(), password }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok && data.token && data.role) {
          const role = data.role as Role;
          localStorage.setItem(TOKEN_KEY, data.token);
          localStorage.setItem(ROLE_KEY, role);
          if (data.sucursalId) localStorage.setItem(SUCURSAL_ID_KEY, data.sucursalId);
          else localStorage.removeItem(SUCURSAL_ID_KEY);
          if (data.sucursalNombre) localStorage.setItem(SUCURSAL_NOMBRE_KEY, data.sucursalNombre);
          else localStorage.removeItem(SUCURSAL_NOMBRE_KEY);
          if (data.fotoPerfil) localStorage.setItem(FOTO_PERFIL_KEY, data.fotoPerfil);
          else localStorage.removeItem(FOTO_PERFIL_KEY);
          setState({
            isAuthenticated: true,
            token: data.token,
            role,
            sucursalId: data.sucursalId ?? null,
            sucursalNombre: data.sucursalNombre ?? null,
            fotoPerfil: data.fotoPerfil ?? null,
          });
          return role;
        }
        return false;
      } catch {
        return false;
      }
    }
    if (username === 'Savia' && password === '2286') {
      setState({
        isAuthenticated: true,
        token: null,
        role: 'sucursal',
        sucursalId: null,
        sucursalNombre: 'Savia',
        fotoPerfil: null,
      });
      return 'sucursal';
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setState({
      isAuthenticated: false,
      role: null,
      token: null,
      sucursalId: null,
      sucursalNombre: null,
      fotoPerfil: null,
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
        isAdmin: state.role === 'admin',
        login,
        logout,
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
