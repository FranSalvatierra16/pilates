import { useState } from 'react';
import { Search, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Alumno, Actividad } from '../types';
import { storage } from '../utils/storage';
import { storageHybrid } from '../utils/storage-hybrid';
import { isCuotaVencida, isCuotaVenceHoy, formatDate, getSemanaActual } from '../utils/date';
import { formatCurrency } from '../utils/format';
import { Turno } from '../types';

const Acceso = () => {
  const [dni, setDni] = useState('');
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [mensaje, setMensaje] = useState('');
  const [loading, setLoading] = useState(false);

  const loadActividades = async () => {
    try {
      const data = await storageHybrid.actividades.getAll();
      setActividades(data);
    } catch (error) {
      console.error('Error loading actividades:', error);
      setActividades(storage.actividades.getAll());
    }
  };

  /** Lunes=0 ... Domingo=6 (mismo criterio que Calendario) */
  const getDiaSemanaApp = (fecha: Date): number => {
    return (fecha.getDay() + 6) % 7;
  };

  /** Marca asistencia "asistio" automática en turnos de HOY para la semana actual */
  const marcarAsistenciaAutomaticaHoy = async (alumnoId: string) => {
    const semana = getSemanaActual();
    const hoy = getDiaSemanaApp(new Date());
    if (hoy < 0 || hoy > 6) return;

    const [turnos, inscripciones, recuperaciones] = await Promise.all([
      storageHybrid.turnos.getAll(),
      storageHybrid.inscripcionesTurno.getAll().catch(() => [] as { turnoId: string; alumnoId: string; semanaDesde: string }[]),
      storageHybrid.recuperaciones.getBySemana(semana).catch(() => [] as { turnoId: string; alumnoId: string; semana: string }[]),
    ]);

    const turnosHoy = (turnos || []).filter((t: Turno) => t.diaSemana === hoy);
    if (turnosHoy.length === 0) return;

    for (const turno of turnosHoy) {
      const regular =
        (turno.alumnoIds || []).includes(alumnoId) &&
        (() => {
          const ins = inscripciones.find((i) => i.turnoId === turno.id && i.alumnoId === alumnoId);
          return !ins || ins.semanaDesde <= semana;
        })();

      const recupera = recuperaciones.some((r) => r.turnoId === turno.id && r.alumnoId === alumnoId);
      if (!regular && !recupera) continue;

      const existente = await storageHybrid.asistencias.findByTurnoYAlumno(turno.id, alumnoId, semana);
      if (existente) {
        if (existente.estado !== 'asistio') {
          await storageHybrid.asistencias.update(existente.id, { estado: 'asistio' });
        }
      } else {
        await storageHybrid.asistencias.add({
          id: crypto.randomUUID(),
          turnoId: turno.id,
          alumnoId,
          estado: 'asistio',
          semana,
          createdAt: new Date().toISOString(),
        });
      }
    }
  };

  const handleSearch = async () => {
    if (!dni.trim()) {
      setMensaje('Por favor ingresá un DNI');
      setAlumno(null);
      return;
    }

    try {
      setLoading(true);
      const encontrado = await storageHybrid.alumnos.findByDni(dni.trim());
      
      if (!encontrado) {
        setMensaje('Alumno no encontrado');
        setAlumno(null);
        return;
      }

      setAlumno(encontrado);
      setMensaje('');
      
      // Incrementar contador de clases si tiene acceso permitido
      const tieneAcceso = !isCuotaVencida(encontrado.fechaVencimientoCuota);
      if (tieneAcceso && encontrado.fechaVencimientoCuota) {
        try {
          await storageHybrid.alumnos.update(encontrado.id, {
            clasesAsistidas: (encontrado.clasesAsistidas || 0) + 1,
          });
          // Recargar el alumno para mostrar el contador actualizado
          const actualizado = await storageHybrid.alumnos.findByDni(dni.trim());
          if (actualizado) {
            setAlumno(actualizado);
          }
        } catch (error) {
          console.error('Error incrementando contador de clases:', error);
        }
      }

      // Marcar asistencia automática en Calendario (turnos de hoy en semana actual)
      if (tieneAcceso) {
        try {
          await marcarAsistenciaAutomaticaHoy(encontrado.id);
        } catch (error) {
          console.error('Error marcando asistencia automática:', error);
        }
      }
      
      // Cargar actividades si no están cargadas
      if (actividades.length === 0) {
        await loadActividades();
      }
    } catch (error) {
      console.error('Error searching alumno:', error);
      // Fallback a localStorage
      const encontrado = storage.alumnos.findByDni(dni.trim());
      if (!encontrado) {
        setMensaje('Alumno no encontrado');
        setAlumno(null);
        return;
      }
      setAlumno(encontrado);
      setMensaje('');
      if (actividades.length === 0) {
        setActividades(storage.actividades.getAll());
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const getActividad = () => {
    if (!alumno || !alumno.actividadId) return null;
    return actividades.find(a => a.id === alumno.actividadId);
  };

  const isVencida = alumno ? isCuotaVencida(alumno.fechaVencimientoCuota) : false;
  const venceHoy = alumno ? isCuotaVenceHoy(alumno.fechaVencimientoCuota) : false;
  const actividad = getActividad();
  
  // Determinar el estado: vencida > vence hoy > al día
  const estadoAcceso = isVencida ? 'vencida' : venceHoy ? 'venceHoy' : 'alDia';

  return (
    <div>
      <div className="page-title-wrap mb-6 sm:mb-8 mt-1">
        <span className="page-title-accent" aria-hidden />
        <h1 className="page-title">Control de Acceso</h1>
      </div>

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
              disabled={loading}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Search className="w-5 h-5" />
              {loading ? 'Buscando...' : 'Buscar'}
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
                <div>
                  <p className="text-sm text-gray-500 mb-1">Clases Asistidas (Este Mes)</p>
                  <p className="text-lg font-semibold text-primary-600">
                    {alumno.clasesAsistidas || 0}
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

