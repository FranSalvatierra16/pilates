import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const useApi = () => {
  if (import.meta.env.VITE_USE_API === 'false') return false;
  if (import.meta.env.VITE_USE_API === 'true') return true;
  return import.meta.env.PROD;
};
const getApiBase = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const saved = localStorage.getItem('savia_authenticated');
    return saved === 'true';
  });

  useEffect(() => {
    if (isAuthenticated) {
      localStorage.setItem('savia_authenticated', 'true');
    } else {
      localStorage.removeItem('savia_authenticated');
    }
  }, [isAuthenticated]);

  const login = async (username: string, password: string): Promise<boolean> => {
    if (useApi()) {
      try {
        const res = await fetch(getApiBase() + '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario: username.trim(), password }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          setIsAuthenticated(true);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }
    if (username === 'Savia' && password === '2286') {
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('savia_authenticated');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
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
