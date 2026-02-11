import { useState, useEffect, useRef } from 'react';
import { Plus, X, UserPlus, Search, Check, XCircle, RotateCcw, ChevronDown, ChevronUp, Trash2, Move, Save, GraduationCap } from 'lucide-react';
import { Turno, Alumno, DIAS_SEMANA, Asistencia, EstadisticasAsistencia, Profesor } from '../types';
import { storage } from '../utils/storage';
import { storageHybrid } from '../utils/storage-hybrid';

// Horarios disponibles: 7:00-12:00 cada hora, y 16:00-21:00 cada hora
const HORARIOS_MANANA = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00'];
const HORARIOS_TARDE = ['16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

// Función para obtener el número de semana (YYYY-WW)
const getSemanaActual = (): string => {
  const hoy = new Date();
  const año = hoy.getFullYear();
  const inicioAño = new Date(año, 0, 1);
  const dias = Math.floor((hoy.getTime() - inicioAño.getTime()) / (24 * 60 * 60 * 1000));
  const semana = Math.ceil((dias + inicioAño.getDay() + 1) / 7);
  return `${año}-${semana.toString().padStart(2, '0')}`;
};

const Calendario = () => {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [alumnosFiltrados, setAlumnosFiltrados] = useState<Alumno[]>([]);
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const semanaActual = getSemanaActual();
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showModalEditarTurno, setShowModalEditarTurno] = useState(false);
  const [showEstadisticas, setShowEstadisticas] = useState(false);
  const [showPopupAlumno, setShowPopupAlumno] = useState<{
    alumno: Alumno;
    turnoId: string;
    diaSemana: number;
    hora: string;
    position: { x: number; y: number };
  } | null>(null);
  const [showMoverAlumno, setShowMoverAlumno] = useState(false);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<{ diaSemana: number; hora: string } | null>(null);
  const [turnoParaEditar, setTurnoParaEditar] = useState<Turno | null>(null);
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState('');
  const [formDataTurno, setFormDataTurno] = useState({
    titulo: '',
    profesorId: '',
  });
  const [turnoDestino, setTurnoDestino] = useState<{ diaSemana: number; hora: string } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      await loadTurnos();
      await loadAlumnos();
      await loadProfesores();
      await loadAsistencias();
    })();
  }, [semanaActual]);

  const loadTurnos = async () => {
    try {
      const data = await storageHybrid.turnos.getAll();
      setTurnos(data);
    } catch (error) {
      console.error('Error loading turnos:', error);
      setTurnos(storage.turnos.getAll());
    }
  };

  const loadAlumnos = async () => {
    try {
      const data = await storageHybrid.alumnos.getAll();
      setAlumnos(data);
      setAlumnosFiltrados(data);
    } catch (error) {
      console.error('Error loading alumnos:', error);
      const alumnosLocal = storage.alumnos.getAll();
      setAlumnos(alumnosLocal);
      setAlumnosFiltrados(alumnosLocal);
    }
  };

  const loadProfesores = async () => {
    const data = await storageHybrid.profesores.getAll();
    setProfesores(data);
  };

  const loadAsistencias = async () => {
    const asistenciasSemana = await storageHybrid.asistencias.getBySemana(semanaActual);
    setAsistencias(asistenciasSemana);
  };

  // Días de la semana: 0 = Lunes, 1 = Martes, ..., 5 = Sábado (sin domingo)
  const diasSemana = [0, 1, 2, 3, 4, 5];

  const getTurnoDelDia = (diaSemana: number, hora: string): Turno | undefined => {
    return turnos.find(t => t.diaSemana === diaSemana && t.hora === hora);
  };

  const getAlumnosDelTurno = (turno: Turno | undefined): Alumno[] => {
    if (!turno) return [];
    return turno.alumnoIds
      .map(id => alumnos.find(a => a.id === id))
      .filter((a): a is Alumno => a !== undefined);
  };

  const handleAgregarAlumno = (diaSemana: number, hora: string) => {
    setTurnoSeleccionado({ diaSemana, hora });
    setAlumnoSeleccionado('');
    setFiltroBusqueda('');
    setAlumnosFiltrados(alumnos);
    setShowModal(true);
  };

  const handleEditarTurno = (diaSemana: number, hora: string) => {
    const turno = getTurnoDelDia(diaSemana, hora);
    if (turno) {
      setTurnoParaEditar(turno);
      setFormDataTurno({
        titulo: turno.titulo || '',
        profesorId: turno.profesorId || '',
      });
    } else {
      // Si no existe el turno, crear uno nuevo vacío
      setTurnoParaEditar({
        id: Date.now().toString(),
        diaSemana,
        hora,
        titulo: '',
        profesorId: '',
        alumnoIds: [],
        createdAt: new Date().toISOString(),
      });
      setFormDataTurno({
        titulo: '',
        profesorId: '',
      });
    }
    setShowModalEditarTurno(true);
  };

  const handleCerrarModal = () => {
    setShowModal(false);
    setTurnoSeleccionado(null);
    setAlumnoSeleccionado('');
    setFiltroBusqueda('');
  };

  useEffect(() => {
    // Filtrar alumnos cuando cambia el filtro de búsqueda
    if (!filtroBusqueda.trim()) {
      setAlumnosFiltrados(alumnos);
    } else {
      const busqueda = filtroBusqueda.toLowerCase().trim();
      const filtrados = alumnos.filter(alumno => 
        alumno.nombre.toLowerCase().includes(busqueda) ||
        alumno.apellido.toLowerCase().includes(busqueda) ||
        alumno.dni.includes(busqueda) ||
        `${alumno.nombre} ${alumno.apellido}`.toLowerCase().includes(busqueda)
      );
      setAlumnosFiltrados(filtrados);
    }
  }, [filtroBusqueda, alumnos]);

  const handleGuardarAlumno = async () => {
    if (!turnoSeleccionado || !alumnoSeleccionado) return;

    try {
      const turnoExistente = getTurnoDelDia(turnoSeleccionado.diaSemana, turnoSeleccionado.hora);

      if (turnoExistente) {
        // Si el turno ya existe, agregar el alumno si no está
        if (!turnoExistente.alumnoIds.includes(alumnoSeleccionado)) {
          await storageHybrid.turnos.update(turnoExistente.id, {
            alumnoIds: [...turnoExistente.alumnoIds, alumnoSeleccionado],
          });
        }
      } else {
        // Crear nuevo turno (solo con el alumno, sin título ni profesor)
        const nuevoTurno: Turno = {
          id: Date.now().toString(),
          diaSemana: turnoSeleccionado.diaSemana,
          hora: turnoSeleccionado.hora,
          titulo: '',
          profesorId: '',
          alumnoIds: [alumnoSeleccionado],
          createdAt: new Date().toISOString(),
        };
        await storageHybrid.turnos.add(nuevoTurno);
      }

      await loadTurnos();
      handleCerrarModal();
    } catch (error) {
      console.error('Error guardando turno:', error);
      alert('Error al guardar el turno. Por favor intentá nuevamente.');
    }
  };

  const handleGuardarEdicionTurno = async () => {
    if (!turnoParaEditar) return;

    try {
      const turnoExistente = getTurnoDelDia(turnoParaEditar.diaSemana, turnoParaEditar.hora);
      
      if (turnoExistente) {
        // Actualizar turno existente
        await storageHybrid.turnos.update(turnoExistente.id, {
          titulo: formDataTurno.titulo,
          profesorId: formDataTurno.profesorId,
        });
      } else {
        // Crear nuevo turno solo con título y profesor (sin alumnos)
        await storageHybrid.turnos.add({
          ...turnoParaEditar,
          titulo: formDataTurno.titulo,
          profesorId: formDataTurno.profesorId,
        });
      }
      
      await loadTurnos();
      setShowModalEditarTurno(false);
      setTurnoParaEditar(null);
    } catch (error) {
      console.error('Error actualizando turno:', error);
      alert('Error al actualizar el turno. Por favor intentá nuevamente.');
    }
  };

  const handleEliminarAlumno = async (turnoId: string, alumnoId: string) => {
    const turno = turnos.find(t => t.id === turnoId);
    if (!turno) return;

    try {
      const nuevosAlumnoIds = turno.alumnoIds.filter(id => id !== alumnoId);
      
      // Actualizar con los alumnos restantes (puede quedar vacío, no importa)
      await storageHybrid.turnos.update(turnoId, { alumnoIds: nuevosAlumnoIds });

      await loadTurnos();
      setShowPopupAlumno(null);
    } catch (error) {
      console.error('Error eliminando alumno del turno:', error);
      alert('Error al eliminar el alumno del turno. Por favor intentá nuevamente.');
    }
  };

  const handleMoverAlumno = async () => {
    if (!showPopupAlumno || !turnoDestino) return;

    try {
      // Eliminar del turno original
      await handleEliminarAlumno(showPopupAlumno.turnoId, showPopupAlumno.alumno.id);
      
      // Agregar al turno destino
      const turnoDestinoExistente = getTurnoDelDia(turnoDestino.diaSemana, turnoDestino.hora);
      
      if (turnoDestinoExistente) {
        // Si el turno ya existe, agregar el alumno si no está
        if (!turnoDestinoExistente.alumnoIds.includes(showPopupAlumno.alumno.id)) {
          await storageHybrid.turnos.update(turnoDestinoExistente.id, {
            alumnoIds: [...turnoDestinoExistente.alumnoIds, showPopupAlumno.alumno.id],
          });
        }
      } else {
        // Crear nuevo turno (sin copiar título ni profesor del turno original)
        const nuevoTurno: Turno = {
          id: Date.now().toString(),
          diaSemana: turnoDestino.diaSemana,
          hora: turnoDestino.hora,
          titulo: '',
          profesorId: '',
          alumnoIds: [showPopupAlumno.alumno.id],
          createdAt: new Date().toISOString(),
        };
        await storageHybrid.turnos.add(nuevoTurno);
      }

      await loadTurnos();
      setShowPopupAlumno(null);
      setShowMoverAlumno(false);
      setTurnoDestino(null);
    } catch (error) {
      console.error('Error moviendo alumno:', error);
      alert('Error al mover el alumno. Por favor intentá nuevamente.');
    }
  };

  const handleAbrirPopupAlumno = (e: React.MouseEvent, alumno: Alumno, turno: Turno, diaSemana: number, hora: string) => {
    e.stopPropagation();
    setShowPopupAlumno({
      alumno,
      turnoId: turno.id,
      diaSemana,
      hora,
      position: { x: e.clientX, y: e.clientY },
    });
    setShowMoverAlumno(false);
    setTurnoDestino(null);
  };

  // Cerrar popup al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setShowPopupAlumno(null);
        setShowMoverAlumno(false);
      }
    };

    if (showPopupAlumno) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPopupAlumno]);

  const getEstadoAsistencia = (turnoId: string, alumnoId: string): 'asistio' | 'no_asistio' | null => {
    const asistencia = asistencias.find(
      a => a.turnoId === turnoId && a.alumnoId === alumnoId && a.semana === semanaActual
    );
    return asistencia?.estado || null;
  };

  const handleMarcarAsistencia = async (turnoId: string, alumnoId: string, estado: 'asistio' | 'no_asistio') => {
    const asistenciaExistente = asistencias.find(
      a => a.turnoId === turnoId && a.alumnoId === alumnoId && a.semana === semanaActual
    );

    if (asistenciaExistente) {
      if (asistenciaExistente.estado === estado) {
        await storageHybrid.asistencias.update(asistenciaExistente.id, { estado: null });
      } else {
        await storageHybrid.asistencias.update(asistenciaExistente.id, { estado });
      }
    } else {
      const nuevaAsistencia: Asistencia = {
        id: Date.now().toString(),
        turnoId,
        alumnoId,
        estado,
        semana: semanaActual,
        createdAt: new Date().toISOString(),
      };
      await storageHybrid.asistencias.add(nuevaAsistencia);
    }

    await loadAsistencias();
  };

  const handleReiniciarSemana = async () => {
    if (confirm('¿Estás seguro de que querés reiniciar todas las asistencias de esta semana? Esto volverá todos los estados a gris.')) {
      await storageHybrid.asistencias.deleteBySemana(semanaActual);
      await loadAsistencias();
    }
  };

  const calcularEstadisticas = (alumnoId: string): EstadisticasAsistencia => {
    const turnosDelAlumno = turnos.filter(t => t.alumnoIds.includes(alumnoId));
    const totalClases = turnosDelAlumno.length;
    
    let clasesAsistidas = 0;
    let clasesNoAsistidas = 0;

    turnosDelAlumno.forEach(turno => {
      const asistencia = asistencias.find(
        a => a.turnoId === turno.id && a.alumnoId === alumnoId && a.semana === semanaActual
      );
      if (asistencia?.estado === 'asistio') {
        clasesAsistidas++;
      } else if (asistencia?.estado === 'no_asistio') {
        clasesNoAsistidas++;
      }
    });

    return {
      alumnoId,
      totalClases,
      clasesAsistidas,
      clasesNoAsistidas,
    };
  };

  const renderAlumnoEnTurno = (alumno: Alumno, turno: Turno | undefined, diaSemana: number, hora: string) => {
    if (!turno) return null;
    
    const estadoAsistencia = getEstadoAsistencia(turno.id, alumno.id);
    const bgColor = estadoAsistencia === 'asistio' 
      ? 'bg-green-100 text-green-900' 
      : estadoAsistencia === 'no_asistio'
      ? 'bg-red-100 text-red-900'
      : 'bg-primary-100 text-primary-900';
    
    return (
      <div
        key={alumno.id}
        className={`${bgColor} px-2 py-1 rounded text-xs flex items-center gap-1 group/item hover:opacity-90 transition-colors cursor-pointer`}
        onClick={(e) => handleAbrirPopupAlumno(e, alumno, turno, diaSemana, hora)}
      >
        <span className="truncate flex-1" title={`${alumno.nombre} ${alumno.apellido}`}>
          {alumno.nombre} {alumno.apellido}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleMarcarAsistencia(turno.id, alumno.id, 'asistio');
            }}
            className={`p-0.5 rounded transition-colors ${
              estadoAsistencia === 'asistio'
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-600 hover:bg-green-300'
            }`}
            title="Marcar como asistió"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleMarcarAsistencia(turno.id, alumno.id, 'no_asistio');
            }}
            className={`p-0.5 rounded transition-colors ${
              estadoAsistencia === 'no_asistio'
                ? 'bg-red-600 text-white'
                : 'bg-gray-200 text-gray-600 hover:bg-red-300'
            }`}
            title="Marcar como no asistió"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <h1 className="text-3xl font-bold text-gray-900">Calendario de Turnos</h1>
        <div className="flex gap-3 items-center">
          <button
            onClick={handleReiniciarSemana}
            className="btn-secondary flex items-center gap-2"
            title="Reiniciar asistencias de esta semana"
          >
            <RotateCcw className="w-4 h-4" />
            Reiniciar Semana
          </button>
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              💡 Los turnos se repiten cada semana. Los alumnos siempre van a los mismos días y horarios.
              Usá ✓ para marcar asistencia (verde) o ✗ para marcar inasistencia (rojo).
            </p>
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="min-w-full">
          {/* Header con días de la semana */}
          <div className="grid grid-cols-8 border-b border-gray-200 bg-primary-50">
            <div className="p-3 font-semibold text-gray-700 border-r border-gray-200">Hora</div>
            {diasSemana.map((diaIndex) => (
              <div
                key={diaIndex}
                className="p-3 text-center font-semibold border-r border-gray-200 last:border-r-0 text-gray-700"
              >
                <div className="text-sm uppercase">{DIAS_SEMANA[diaIndex]}</div>
              </div>
            ))}
          </div>

          {/* Horarios mañana */}
          <div className="border-b border-gray-300">
            <div className="bg-gray-50 px-3 py-2 font-semibold text-gray-700 text-sm">
              Mañana (7:00 - 12:00)
            </div>
            {HORARIOS_MANANA.map((hora) => (
              <div key={hora} className="grid grid-cols-8 border-b border-gray-200 hover:bg-gray-50">
                <div className="p-3 font-medium text-gray-700 border-r border-gray-200 bg-gray-50">
                  {hora}
                </div>
                {diasSemana.map((diaIndex) => {
                  const turno = getTurnoDelDia(diaIndex, hora);
                  const alumnosTurno = getAlumnosDelTurno(turno);
                  const profesor = turno?.profesorId ? profesores.find(p => p.id === turno.profesorId) : null;
                  return (
                    <div
                      key={`${diaIndex}-${hora}`}
                      className="p-2 min-h-[80px] border-r border-gray-200 last:border-r-0 relative group hover:bg-gray-50"
                    >
                      {/* Botón de Profesor - Siempre visible */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditarTurno(diaIndex, hora);
                        }}
                        className="absolute top-1 left-1 w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-purple-600 hover:bg-purple-700 rounded text-white z-20"
                        title="Editar título y profesor"
                      >
                        <GraduationCap className="w-4 h-4" />
                      </button>
                      
                      {/* Título y Profesor */}
                      {(turno?.titulo || profesor) && (
                        <div className="mb-2 pb-2 border-b border-gray-200">
                          {turno?.titulo && (
                            <div className="text-xs font-semibold text-gray-700 mb-1">
                              {turno.titulo}
                            </div>
                          )}
                          {profesor && (
                            <div className="text-xs text-gray-600">
                              Prof: {profesor.nombre} {profesor.apellido}
                            </div>
                          )}
                        </div>
                      )}
                      {alumnosTurno.length > 0 ? (
                        <div className="space-y-1 relative z-10">
                          {alumnosTurno.map((alumno) => renderAlumnoEnTurno(alumno, turno, diaIndex, hora))}
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Plus className="w-5 h-5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      )}
                      <button
                        onClick={() => handleAgregarAlumno(diaIndex, hora)}
                        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-primary-600 hover:bg-primary-700 rounded text-white z-20"
                        title="Agregar alumno"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Horarios tarde */}
          <div>
            <div className="bg-gray-50 px-3 py-2 font-semibold text-gray-700 text-sm">
              Tarde (16:00 - 21:00)
            </div>
            {HORARIOS_TARDE.map((hora) => (
              <div key={hora} className="grid grid-cols-8 border-b border-gray-200 hover:bg-gray-50 last:border-b-0">
                <div className="p-3 font-medium text-gray-700 border-r border-gray-200 bg-gray-50">
                  {hora}
                </div>
                {diasSemana.map((diaIndex) => {
                  const turno = getTurnoDelDia(diaIndex, hora);
                  const alumnosTurno = getAlumnosDelTurno(turno);
                  const profesor = turno?.profesorId ? profesores.find(p => p.id === turno.profesorId) : null;
                  return (
                    <div
                      key={`${diaIndex}-${hora}`}
                      className="p-2 min-h-[80px] border-r border-gray-200 last:border-r-0 relative group hover:bg-gray-50"
                    >
                      {/* Botón de Profesor - Siempre visible */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditarTurno(diaIndex, hora);
                        }}
                        className="absolute top-1 left-1 w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-purple-600 hover:bg-purple-700 rounded text-white z-20"
                        title="Editar título y profesor"
                      >
                        <GraduationCap className="w-4 h-4" />
                      </button>
                      
                      {/* Título y Profesor */}
                      {(turno?.titulo || profesor) && (
                        <div className="mb-2 pb-2 border-b border-gray-200">
                          {turno?.titulo && (
                            <div className="text-xs font-semibold text-gray-700 mb-1">
                              {turno.titulo}
                            </div>
                          )}
                          {profesor && (
                            <div className="text-xs text-gray-600">
                              Prof: {profesor.nombre} {profesor.apellido}
                            </div>
                          )}
                        </div>
                      )}
                      {alumnosTurno.length > 0 ? (
                        <div className="space-y-1 relative z-10">
                          {alumnosTurno.map((alumno) => renderAlumnoEnTurno(alumno, turno, diaIndex, hora))}
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Plus className="w-5 h-5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      )}
                      <button
                        onClick={() => handleAgregarAlumno(diaIndex, hora)}
                        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-primary-600 hover:bg-primary-700 rounded text-white z-20"
                        title="Agregar alumno"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Estadísticas de asistencias - Colapsable */}
      <div className="mt-6">
        <button
          onClick={() => setShowEstadisticas(!showEstadisticas)}
          className="w-full btn-secondary flex items-center justify-between mb-4"
        >
          <span className="font-semibold">Estadísticas de Asistencia - Semana Actual</span>
          {showEstadisticas ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </button>
        
        {showEstadisticas && (
          <div className="card">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {alumnos.map((alumno) => {
                const stats = calcularEstadisticas(alumno.id);
                if (stats.totalClases === 0) return null;
                return (
                  <div key={alumno.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-2">
                      {alumno.nombre} {alumno.apellido}
                    </h3>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total clases:</span>
                        <span className="font-semibold">{stats.totalClases}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-600">✓ Asistió:</span>
                        <span className="font-semibold text-green-600">{stats.clasesAsistidas}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-red-600">✗ No asistió:</span>
                        <span className="font-semibold text-red-600">{stats.clasesNoAsistidas}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-gray-300">
                        <span className="text-gray-600">Sin marcar:</span>
                        <span className="font-semibold text-gray-600">
                          {stats.totalClases - stats.clasesAsistidas - stats.clasesNoAsistidas}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {alumnos.filter(a => calcularEstadisticas(a.id).totalClases > 0).length === 0 && (
              <p className="text-gray-500 text-center py-4">No hay alumnos asignados a turnos aún</p>
            )}
          </div>
        )}
      </div>

      {showModal && turnoSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">
                Agregar Alumno al Turno
              </h2>
              <button
                onClick={handleCerrarModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  <strong>Día:</strong> {DIAS_SEMANA[turnoSeleccionado.diaSemana]}
                </p>
                <p className="text-sm text-gray-600 mb-4">
                  <strong>Hora:</strong> {turnoSeleccionado.hora}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Buscar Alumno
                </label>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    value={filtroBusqueda}
                    onChange={(e) => setFiltroBusqueda(e.target.value)}
                    placeholder="Buscar por nombre, apellido o DNI..."
                    className="input-field pl-10"
                  />
                </div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seleccionar Alumno *
                </label>
                <select
                  value={alumnoSeleccionado}
                  onChange={(e) => setAlumnoSeleccionado(e.target.value)}
                  className="input-field"
                  size={Math.min(alumnosFiltrados.length + 1, 8)}
                >
                  <option value="">Seleccionar alumno</option>
                  {alumnosFiltrados.map((alumno) => {
                    const turno = getTurnoDelDia(turnoSeleccionado.diaSemana, turnoSeleccionado.hora);
                    const yaAsignado = turno?.alumnoIds.includes(alumno.id);
                    return (
                      <option
                        key={alumno.id}
                        value={alumno.id}
                        disabled={yaAsignado}
                      >
                        {alumno.nombre} {alumno.apellido} - DNI: {alumno.dni} {yaAsignado ? '(Ya asignado)' : ''}
                      </option>
                    );
                  })}
                </select>
                {filtroBusqueda && alumnosFiltrados.length === 0 && (
                  <p className="text-sm text-gray-500 mt-2">
                    No se encontraron alumnos con ese criterio de búsqueda
                  </p>
                )}
                {filtroBusqueda && alumnosFiltrados.length > 0 && (
                  <p className="text-sm text-gray-500 mt-2">
                    Mostrando {alumnosFiltrados.length} de {alumnos.length} alumnos
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={handleCerrarModal}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGuardarAlumno}
                  disabled={!alumnoSeleccionado}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <UserPlus className="w-4 h-4" />
                  Agregar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para editar título y profesor del turno */}
      {showModalEditarTurno && turnoParaEditar && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">
                Editar Turno
              </h2>
              <button
                onClick={() => {
                  setShowModalEditarTurno(false);
                  setTurnoParaEditar(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  <strong>Día:</strong> {DIAS_SEMANA[turnoParaEditar.diaSemana]}
                </p>
                <p className="text-sm text-gray-600 mb-4">
                  <strong>Hora:</strong> {turnoParaEditar.hora}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Título de la Clase
                </label>
                <input
                  type="text"
                  value={formDataTurno.titulo}
                  onChange={(e) => setFormDataTurno({ ...formDataTurno, titulo: e.target.value })}
                  className="input-field"
                  placeholder="Ej: Pilates Mat, Pilates con Máquinas, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Profesor
                </label>
                <select
                  value={formDataTurno.profesorId}
                  onChange={(e) => setFormDataTurno({ ...formDataTurno, profesorId: e.target.value })}
                  className="input-field"
                >
                  <option value="">Seleccionar profesor</option>
                  {profesores.map((profesor) => (
                    <option key={profesor.id} value={profesor.id}>
                      {profesor.nombre} {profesor.apellido}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowModalEditarTurno(false);
                    setTurnoParaEditar(null);
                  }}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGuardarEdicionTurno}
                  className="btn-primary flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Popup de información del alumno */}
      {showPopupAlumno && (
        <div
          ref={popupRef}
          className="fixed bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-50 min-w-[280px]"
          style={{
            left: `${Math.min(showPopupAlumno.position.x, window.innerWidth - 300)}px`,
            top: `${Math.min(showPopupAlumno.position.y + 10, window.innerHeight - 200)}px`,
          }}
        >
          <div className="mb-3">
            <h3 className="font-bold text-gray-900 text-lg mb-1">
              {showPopupAlumno.alumno.nombre} {showPopupAlumno.alumno.apellido}
            </h3>
            <p className="text-sm text-gray-600">DNI: {showPopupAlumno.alumno.dni}</p>
            <p className="text-xs text-gray-500 mt-1">
              Turno actual: {DIAS_SEMANA[showPopupAlumno.diaSemana]} {showPopupAlumno.hora}
            </p>
            {(showPopupAlumno.alumno.descripcion ?? '').trim() ? (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-0.5">Notas</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{showPopupAlumno.alumno.descripcion}</p>
              </div>
            ) : null}
          </div>

          {!showMoverAlumno ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                {(() => {
                  const estadoAsistencia = getEstadoAsistencia(showPopupAlumno.turnoId, showPopupAlumno.alumno.id);
                  return (
                    <>
                      <button
                        onClick={() => handleMarcarAsistencia(showPopupAlumno.turnoId, showPopupAlumno.alumno.id, 'asistio')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-sm transition-colors ${
                          estadoAsistencia === 'asistio'
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-green-200'
                        }`}
                        title="Marcar asistió"
                      >
                        <Check className="w-5 h-5" />
                        Asistió
                      </button>
                      <button
                        onClick={() => handleMarcarAsistencia(showPopupAlumno.turnoId, showPopupAlumno.alumno.id, 'no_asistio')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-sm transition-colors ${
                          estadoAsistencia === 'no_asistio'
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-red-200'
                        }`}
                        title="Marcar no asistió"
                      >
                        <XCircle className="w-5 h-5" />
                        No asistió
                      </button>
                    </>
                  );
                })()}
              </div>
              <button
                onClick={() => {
                  setShowMoverAlumno(true);
                }}
                className="w-full btn-secondary flex items-center justify-center gap-2 text-sm"
              >
                <Move className="w-4 h-4" />
                Mover a otro turno
              </button>
              <button
                onClick={() => {
                  if (confirm(`¿Estás seguro de que querés eliminar a ${showPopupAlumno.alumno.nombre} ${showPopupAlumno.alumno.apellido} de este turno?`)) {
                    handleEliminarAlumno(showPopupAlumno.turnoId, showPopupAlumno.alumno.id);
                  }
                }}
                className="w-full btn-danger flex items-center justify-center gap-2 text-sm"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar del turno
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seleccionar nuevo turno
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={turnoDestino?.diaSemana ?? ''}
                    onChange={(e) => {
                      const dia = parseInt(e.target.value);
                      if (dia >= 0 && turnoDestino) {
                        setTurnoDestino({ ...turnoDestino, diaSemana: dia });
                      } else if (dia >= 0) {
                        setTurnoDestino({ diaSemana: dia, hora: HORARIOS_MANANA[0] });
                      }
                    }}
                    className="input-field text-sm"
                  >
                    <option value="">Día</option>
                    {diasSemana.map((diaIndex) => (
                      <option key={diaIndex} value={diaIndex}>
                        {DIAS_SEMANA[diaIndex]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={turnoDestino?.hora ?? ''}
                    onChange={(e) => {
                      const hora = e.target.value;
                      if (hora && turnoDestino) {
                        setTurnoDestino({ ...turnoDestino, hora });
                      } else if (hora) {
                        setTurnoDestino({ diaSemana: 0, hora });
                      }
                    }}
                    className="input-field text-sm"
                  >
                    <option value="">Hora</option>
                    {HORARIOS_MANANA.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                    {HORARIOS_TARDE.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowMoverAlumno(false);
                    setTurnoDestino(null);
                  }}
                  className="flex-1 btn-secondary text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleMoverAlumno}
                  disabled={!turnoDestino || !turnoDestino.hora || turnoDestino.diaSemana < 0}
                  className="flex-1 btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Mover
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Calendario;
