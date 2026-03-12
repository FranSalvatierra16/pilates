import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogIn, AlertCircle } from 'lucide-react';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const result = await login(username, password);
    if ('role' in result && result.role) {
      navigate(result.role === 'admin' ? '/admin' : '/dashboard');
    } else {
      setError('error' in result ? result.error : 'Usuario o contraseña incorrectos');
    }
  };

  const esCuentaDesactivada = error && error.toLowerCase().includes('desactivada por falta de pago');

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary-100 text-primary-600 mb-4">
            <LogIn className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Iniciar sesión</h1>
          <p className="text-gray-600 text-sm">Ingresá con tu usuario y contraseña</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field w-full"
              placeholder="Ingresá tu usuario"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field w-full"
              placeholder="Ingresá tu contraseña"
              required
            />
          </div>

          {error && (
            <div
              className={`px-4 py-3 rounded-lg flex items-start gap-3 ${
                esCuentaDesactivada
                  ? 'bg-amber-50 border border-amber-300 text-amber-900'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}
            >
              {esCuentaDesactivada && (
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden />
              )}
              <span className="font-medium">{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full py-3 text-lg"
          >
            Iniciar Sesión
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;

