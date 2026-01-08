import { useState } from 'react';
import { Search, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { storage } from '../utils/storage';
import { isCuotaVencida, isCuotaVenceHoy, formatDate } from '../utils/date';
import { formatCurrency } from '../utils/format';

const Acceso = () => {
  const [dni, setDni] = useState('');
  const [alumno, setAlumno] = useState<ReturnType<typeof storage.alumnos.findByDni> | null>(null);
  const [mensaje, setMensaje] = useState('');

  const handleSearch = () => {
    if (!dni.trim()) {
      setMensaje('Por favor ingresá un DNI');
      setAlumno(null);
      return;
    }

    const encontrado = storage.alumnos.findByDni(dni.trim());
    
    if (!encontrado) {
      setMensaje('Alumno no encontrado');
      setAlumno(null);
      return;
    }

    setAlumno(encontrado);
    setMensaje('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const getActividad = () => {
    if (!alumno) return null;
    return storage.actividades.getById(alumno.actividadId);
  };

  const isVencida = alumno ? isCuotaVencida(alumno.fechaVencimientoCuota) : false;
  const venceHoy = alumno ? isCuotaVenceHoy(alumno.fechaVencimientoCuota) : false;
  const actividad = getActividad();
  
  // Determinar el estado: vencida > vence hoy > al día
  const estadoAcceso = isVencida ? 'vencida' : venceHoy ? 'venceHoy' : 'alDia';

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Control de Acceso</h1>

      <div className="max-w-2xl mx-auto">
        <div className="card mb-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ingresá el DNI del alumno"
              className="input-field flex-1"
              autoFocus
            />
            <button
              onClick={handleSearch}
              className="btn-primary flex items-center gap-2"
            >
              <Search className="w-5 h-5" />
              Buscar
            </button>
          </div>
        </div>

        {mensaje && !alumno && (
          <div className="card bg-yellow-50 border border-yellow-200">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-yellow-600" />
              <p className="text-yellow-800 font-medium">{mensaje}</p>
            </div>
          </div>
        )}

        {alumno && (
          <div className="space-y-6">
            {/* Estado de Acceso */}
            <div className={`card ${
              estadoAcceso === 'vencida'
                ? 'bg-red-50 border-2 border-red-500' 
                : estadoAcceso === 'venceHoy'
                ? 'bg-yellow-50 border-2 border-yellow-500'
                : 'bg-green-50 border-2 border-green-500'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {estadoAcceso === 'vencida' ? (
                    <XCircle className="w-12 h-12 text-red-600" />
                  ) : estadoAcceso === 'venceHoy' ? (
                    <AlertCircle className="w-12 h-12 text-yellow-600" />
                  ) : (
                    <CheckCircle2 className="w-12 h-12 text-green-600" />
                  )}
                  <div>
                    <h2 className={`text-2xl font-bold ${
                      estadoAcceso === 'vencida' 
                        ? 'text-red-900' 
                        : estadoAcceso === 'venceHoy'
                        ? 'text-yellow-900'
                        : 'text-green-900'
                    }`}>
                      {estadoAcceso === 'vencida' 
                        ? 'ACCESO DENEGADO' 
                        : estadoAcceso === 'venceHoy'
                        ? 'ATENCIÓN: CUOTA VENCE HOY'
                        : 'ACCESO PERMITIDO'}
                    </h2>
                    <p className={`text-sm ${
                      estadoAcceso === 'vencida' 
                        ? 'text-red-700' 
                        : estadoAcceso === 'venceHoy'
                        ? 'text-yellow-700'
                        : 'text-green-700'
                    }`}>
                      {estadoAcceso === 'vencida' 
                        ? 'La cuota está vencida. Por favor actualizar el pago.'
                        : estadoAcceso === 'venceHoy'
                        ? 'La cuota vence hoy. Se recomienda actualizar el pago lo antes posible.'
                        : 'El alumno tiene acceso permitido.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Información del Alumno */}
            <div className="card">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Información del Alumno
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Nombre Completo</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {alumno.nombre} {alumno.apellido}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">DNI</p>
                  <p className="text-lg font-semibold text-gray-900">{alumno.dni}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Teléfono</p>
                  <p className="text-lg font-semibold text-gray-900">{alumno.telefono}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Email</p>
                  <p className="text-lg font-semibold text-gray-900">{alumno.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Actividad</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {actividad ? actividad.nombre : 'Sin actividad'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Precio Mensual</p>
                  <p className="text-lg font-semibold text-primary-600">
                    {actividad ? formatCurrency(actividad.precio) : '-'}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500 mb-1">Fecha Vencimiento Cuota</p>
                  <p className={`text-lg font-semibold ${
                    estadoAcceso === 'vencida' 
                      ? 'text-red-600' 
                      : estadoAcceso === 'venceHoy'
                      ? 'text-yellow-600'
                      : 'text-green-600'
                  }`}>
                    {formatDate(alumno.fechaVencimientoCuota)}
                    {estadoAcceso === 'venceHoy' && (
                      <span className="ml-2 text-sm font-normal">⚠️ Vence hoy</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 card bg-blue-50 border border-blue-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm text-blue-800">
                <strong>Instrucciones:</strong> Ingresá el DNI del alumno para verificar su estado de acceso.
                El sistema mostrará: <strong className="text-red-700">Rojo</strong> si está vencida, <strong className="text-yellow-700">Amarillo</strong> si vence hoy, o <strong className="text-green-700">Verde</strong> si está al día.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Acceso;

