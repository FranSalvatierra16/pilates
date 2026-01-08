import { useState, useEffect } from 'react';
import { Plus, X, UserPlus } from 'lucide-react';
import { Turno, Alumno, DIAS_SEMANA } from '../types';
import { storage } from '../utils/storage';

// Horarios disponibles: 7:30-12:30 cada hora, y 16:00-21:00 cada hora
const HORARIOS_MANANA = ['07:30', '08:30', '09:30', '10:30', '11:30', '12:30'];
const HORARIOS_TARDE = ['16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

const Calendario = () => {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<{ diaSemana: number; hora: string } | null>(null);
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState('');

  useEffect(() => {
    loadTurnos();
    loadAlumnos();
  }, []);

  const loadTurnos = () => {
    setTurnos(storage.turnos.getAll());
  };

  const loadAlumnos = () => {
    setAlumnos(storage.alumnos.getAll());
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
    setShowModal(true);
  };

  const handleCerrarModal = () => {
    setShowModal(false);
    setTurnoSeleccionado(null);
    setAlumnoSeleccionado('');
  };

  const handleGuardarAlumno = () => {
    if (!turnoSeleccionado || !alumnoSeleccionado) return;

    const turnoExistente = getTurnoDelDia(turnoSeleccionado.diaSemana, turnoSeleccionado.hora);

    if (turnoExistente) {
      // Si el turno ya existe, agregar el alumno si no está
      if (!turnoExistente.alumnoIds.includes(alumnoSeleccionado)) {
        storage.turnos.update(turnoExistente.id, {
          alumnoIds: [...turnoExistente.alumnoIds, alumnoSeleccionado],
        });
      }
    } else {
      // Crear nuevo turno
      const nuevoTurno: Turno = {
        id: Date.now().toString(),
        diaSemana: turnoSeleccionado.diaSemana,
        hora: turnoSeleccionado.hora,
        alumnoIds: [alumnoSeleccionado],
        createdAt: new Date().toISOString(),
      };
      storage.turnos.add(nuevoTurno);
    }

    loadTurnos();
    handleCerrarModal();
  };

  const handleEliminarAlumno = (turnoId: string, alumnoId: string) => {
    const turno = turnos.find(t => t.id === turnoId);
    if (!turno) return;

    const nuevosAlumnoIds = turno.alumnoIds.filter(id => id !== alumnoId);
    
    if (nuevosAlumnoIds.length === 0) {
      // Si no quedan alumnos, eliminar el turno
      storage.turnos.delete(turnoId);
    } else {
      // Actualizar con los alumnos restantes
      storage.turnos.update(turnoId, { alumnoIds: nuevosAlumnoIds });
    }

    loadTurnos();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Calendario de Turnos</h1>
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 inline-block">
          <p className="text-sm text-blue-800">
            💡 Los turnos se repiten cada semana. Los alumnos siempre van a los mismos días y horarios.
          </p>
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
              Mañana (7:30 - 12:30)
            </div>
            {HORARIOS_MANANA.map((hora) => (
              <div key={hora} className="grid grid-cols-8 border-b border-gray-200 hover:bg-gray-50">
                <div className="p-3 font-medium text-gray-700 border-r border-gray-200 bg-gray-50">
                  {hora}
                </div>
                {diasSemana.map((diaIndex) => {
                  const turno = getTurnoDelDia(diaIndex, hora);
                  const alumnosTurno = getAlumnosDelTurno(turno);
                  return (
                    <div
                      key={`${diaIndex}-${hora}`}
                      className="p-2 min-h-[80px] border-r border-gray-200 last:border-r-0 relative group hover:bg-gray-50"
                    >
                      {alumnosTurno.length > 0 ? (
                        <div className="space-y-1 relative z-10">
                          {alumnosTurno.map((alumno) => (
                            <div
                              key={alumno.id}
                              className="bg-primary-100 text-primary-900 px-2 py-1 rounded text-xs flex items-center justify-between group/item hover:bg-primary-200"
                            >
                              <span className="truncate flex-1">
                                {alumno.nombre} {alumno.apellido}
                              </span>
                              <button
                                onClick={() => turno && handleEliminarAlumno(turno.id, alumno.id)}
                                className="ml-1 opacity-0 group-hover/item:opacity-100 text-red-600 hover:text-red-800 transition-opacity"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
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
                  return (
                    <div
                      key={`${diaIndex}-${hora}`}
                      className="p-2 min-h-[80px] border-r border-gray-200 last:border-r-0 relative group hover:bg-gray-50"
                    >
                      {alumnosTurno.length > 0 ? (
                        <div className="space-y-1 relative z-10">
                          {alumnosTurno.map((alumno) => (
                            <div
                              key={alumno.id}
                              className="bg-primary-100 text-primary-900 px-2 py-1 rounded text-xs flex items-center justify-between group/item hover:bg-primary-200"
                            >
                              <span className="truncate flex-1">
                                {alumno.nombre} {alumno.apellido}
                              </span>
                              <button
                                onClick={() => turno && handleEliminarAlumno(turno.id, alumno.id)}
                                className="ml-1 opacity-0 group-hover/item:opacity-100 text-red-600 hover:text-red-800 transition-opacity"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
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
                  Seleccionar Alumno *
                </label>
                <select
                  value={alumnoSeleccionado}
                  onChange={(e) => setAlumnoSeleccionado(e.target.value)}
                  className="input-field"
                >
                  <option value="">Seleccionar alumno</option>
                  {alumnos.map((alumno) => {
                    const turno = getTurnoDelDia(turnoSeleccionado.diaSemana, turnoSeleccionado.hora);
                    const yaAsignado = turno?.alumnoIds.includes(alumno.id);
                    return (
                      <option
                        key={alumno.id}
                        value={alumno.id}
                        disabled={yaAsignado}
                      >
                        {alumno.nombre} {alumno.apellido} {yaAsignado ? '(Ya asignado)' : ''}
                      </option>
                    );
                  })}
                </select>
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
    </div>
  );
};

export default Calendario;
