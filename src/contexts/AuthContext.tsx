import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CORRECT_USERNAME = 'Savia';
const CORRECT_PASSWORD = '1234';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    // Verificar si hay sesión guardada
    const saved = localStorage.getItem('savia_authenticated');
    return saved === 'true';
  });

  useEffect(() => {
    // Guardar estado de autenticación
    if (isAuthenticated) {
      localStorage.setItem('savia_authenticated', 'true');
    } else {
      localStorage.removeItem('savia_authenticated');
    }
  }, [isAuthenticated]);

  const login = (username: string, password: string): boolean => {
    if (username === CORRECT_USERNAME && password === CORRECT_PASSWORD) {
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

