import { useState, useEffect, useRef } from 'react';
import { Plus, X, UserPlus, Search, Check, XCircle, RotateCcw, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Trash2, Move, Save, GraduationCap, Users, Settings, RefreshCw, Star } from 'lucide-react';
import { Turno, Alumno, DIAS_SEMANA, Asistencia, EstadisticasAsistencia, Profesor } from '../types';
import { storage } from '../utils/storage';
import { storageHybrid } from '../utils/storage-hybrid';
import { storageApi } from '../utils/storage-api';
import { formatDate, isCuotaVencida, isCuotaPorVencer, isCuotaVenceHoy } from '../utils/date';

// Horarios por defecto (modo local); en API se cargan desde la sucursal
const horariosManana_DEFAULT = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00'];
const horariosTarde_DEFAULT = ['16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
const HORAS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0') + ':00');
const useApi = () => import.meta.env.VITE_USE_API === 'true' || (import.meta.env.VITE_USE_API !== 'false' && import.meta.env.PROD);

// Función para obtener el número de semana (YYYY-WW)
const getSemanaActual = (): string => {
  const hoy = new Date();
  const año = hoy.getFullYear();
  const inicioAño = new Date(año, 0, 1);
  const dias = Math.floor((hoy.getTime() - inicioAño.getTime()) / (24 * 60 * 60 * 1000));
  const semana = Math.ceil((dias + inicioAño.getDay() + 1) / 7);
  return `${año}-${semana.toString().padStart(2, '0')}`;
};

const getSemanaAnterior = (semana: string): string => {
  const [y, w] = semana.split('-').map(Number);
  if (w <= 1) return `${y - 1}-52`;
  return `${y}-${String(w - 1).padStart(2, '0')}`;
};

const getSemanaSiguiente = (semana: string): string => {
  const [y, w] = semana.split('-').map(Number);
  if (w >= 52) return `${y + 1}-01`;
  return `${y}-${String(w + 1).padStart(2, '0')}`;
};

const getRangoSemana = (semana: string): string => {
  const [y, w] = semana.split('-').map(Number);
  const jan1 = new Date(y, 0, 1);
  const dayOfJan1 = jan1.getDay();
  const mondayOffset = dayOfJan1 === 0 ? 6 : dayOfJan1 - 1;
  const mondayWeek1 = new Date(y, 0, 1 - mondayOffset);
  const lunes = new Date(mondayWeek1);
  lunes.setDate(lunes.getDate() + (w - 1) * 7);
  const domingo = new Date(lunes);
  domingo.setDate(domingo.getDate() + 6);
  return `${lunes.getDate()} ${lunes.toLocaleDateString('es-AR', { month: 'short' })} - ${domingo.getDate()} ${domingo.toLocaleDateString('es-AR', { month: 'short' })} ${domingo.getFullYear()}`;
};

const Calendario = () => {
  const [horariosManana, setHorariosManana] = useState<string[]>(horariosManana_DEFAULT);
  const [horariosTarde, setHorariosTarde] = useState<string[]>(horariosTarde_DEFAULT);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [alumnosFiltrados, setAlumnosFiltrados] = useState<Alumno[]>([]);
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [semanaVista, setSemanaVista] = useState(getSemanaActual);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showModalEditarTurno, setShowModalEditarTurno] = useState(false);
  const [showEstadisticas, setShowEstadisticas] = useState(false);
  const [showPopupAlumno, setShowPopupAlumno] = useState<{
    alumno: Alumno;
    turnoId: string;
    diaSemana: number;
    hora: string;
    isRecuperacion?: boolean;
    recuperacionId?: string;
    position: { x: number; y: number };
  } | null>(null);
  const [showMoverAlumno, setShowMoverAlumno] = useState(false);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<{ diaSemana: number; hora: string } | null>(null);
  const [turnoParaEditar, setTurnoParaEditar] = useState<Turno | null>(null);
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState('');
  const [esRecuperacion, setEsRecuperacion] = useState(false);
  const [recuperaciones, setRecuperaciones] = useState<{ id: string; turnoId: string; alumnoId: string; semana: string }[]>([]);
  const [inscripciones, setInscripciones] = useState<{ id: string; turnoId: string; alumnoId: string; semanaDesde: string }[]>([]);
  const CUPO_DEFAULT = 6;
  const [formDataTurno, setFormDataTurno] = useState({
    titulo: '',
    profesorId: '',
    cupo: CUPO_DEFAULT,
    destacado: false,
  });
  const [showModalAumentarCupo, setShowModalAumentarCupo] = useState(false);
  const [showModalHorarios, setShowModalHorarios] = useState(false);
  const [horaInicioManana, setHoraInicioManana] = useState('07:00');
  const [horaFinManana, setHoraFinManana] = useState('12:00');
  const [horaInicioTarde, setHoraInicioTarde] = useState('16:00');
  const [horaFinTarde, setHoraFinTarde] = useState('21:00');
  const [horariosSaving, setHorariosSaving] = useState(false);
  const [horariosError, setHorariosError] = useState('');
  const [horariosSaved, setHorariosSaved] = useState(false);
  const [cupoGlobal, setCupoGlobal] = useState(CUPO_DEFAULT);
  const [turnoDestino, setTurnoDestino] = useState<{ diaSemana: number; hora: string } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const [selectedDiaMobile, setSelectedDiaMobile] = useState<number | null>(null);
  const [selectedBloqueMobile, setSelectedBloqueMobile] = useState<'todos' | 'manana' | 'tarde'>('todos');

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const fn = () => setIsMobile(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  useEffect(() => {
    (async () => {
      if (useApi()) {
        try {
          const h = await storageApi.sucursal.getHorarios();
          setHorariosManana(h.manana?.length ? h.manana : horariosManana_DEFAULT);
          setHorariosTarde(h.tarde?.length ? h.tarde : horariosTarde_DEFAULT);
        } catch {
          setHorariosManana(horariosManana_DEFAULT);
          setHorariosTarde(horariosTarde_DEFAULT);
        }
      }
      await loadTurnos();
      await loadAlumnos();
      await loadProfesores();
      await loadAsistencias();
      await loadRecuperaciones();
      await loadInscripciones();
    })();
  }, [semanaVista]);

  useEffect(() => {
    if (showModalHorarios && useApi()) {
      storageApi.sucursal.getHorarios().then((data) => {
        setHoraInicioManana(data.horaInicioManana || '07:00');
        setHoraFinManana(data.horaFinManana || '12:00');
        setHoraInicioTarde(data.horaInicioTarde || '16:00');
        setHoraFinTarde(data.horaFinTarde || '21:00');
      }).catch(() => {});
    }
  }, [showModalHorarios]);

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
    const asistenciasSemana = await storageHybrid.asistencias.getBySemana(semanaVista);
    setAsistencias(asistenciasSemana);
  };

  const loadRecuperaciones = async () => {
    try {
      const data = await storageHybrid.recuperaciones.getBySemana(semanaVista);
      setRecuperaciones(data);
    } catch {
      setRecuperaciones([]);
    }
  };

  const loadInscripciones = async () => {
    try {
      const data = await storageHybrid.inscripcionesTurno.getAll();
      setInscripciones(data);
    } catch {
      setInscripciones([]);
    }
  };

  // Días de la semana: 0 = Lunes, 1 = Martes, ..., 5 = Sábado (sin domingo)
  const diasSemana = [0, 1, 2, 3, 4, 5];

  // Etiquetas dinámicas según horarios de la sucursal (ej. Nes 9–13h, Savia 7–12h)
  const labelManana = horariosManana.length ? `${horariosManana[0]} - ${horariosManana[horariosManana.length - 1]}` : 'Mañana';
  const labelTarde = horariosTarde.length ? `${horariosTarde[0]} - ${horariosTarde[horariosTarde.length - 1]}` : 'Tarde';
  const labelMananaShort = horariosManana.length
    ? `${parseInt(horariosManana[0].split(':')[0], 10)}–${parseInt(horariosManana[horariosManana.length - 1].split(':')[0], 10)}h`
    : '7–12h';
  const labelTardeShort = horariosTarde.length
    ? `${parseInt(horariosTarde[0].split(':')[0], 10)}–${parseInt(horariosTarde[horariosTarde.length - 1].split(':')[0], 10)}h`
    : '16–21h';

  const getTurnoDelDia = (diaSemana: number, hora: string): Turno | undefined => {
    return turnos.find(t => t.diaSemana === diaSemana && t.hora === hora);
  };

  type AlumnoEnTurno = { alumno: Alumno; isRecuperacion: boolean; recuperacionId?: string };
  const getAlumnosDelTurno = (turno: Turno | undefined): AlumnoEnTurno[] => {
    if (!turno) return [];
    // Solo mostrar alumnos cuya inscripción tiene semanaDesde <= semanaVista (semanas anteriores no los muestran)
    const regulares: AlumnoEnTurno[] = turno.alumnoIds
      .filter(id => {
        const ins = inscripciones.find(i => i.turnoId === turno.id && i.alumnoId === id);
        return !ins || ins.semanaDesde <= semanaVista;
      })
      .map(id => alumnos.find(a => a.id === id))
      .filter((a): a is Alumno => a !== undefined)
      .map(a => ({ alumno: a, isRecuperacion: false }));
    const recs: AlumnoEnTurno[] = recuperaciones
      .filter(r => r.turnoId === turno.id)
      .map(r => {
        const a = alumnos.find(x => x.id === r.alumnoId);
        return a ? { alumno: a, isRecuperacion: true, recuperacionId: r.id } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return [...regulares, ...recs];
  };

  const handleAgregarAlumno = (diaSemana: number, hora: string) => {
    setTurnoSeleccionado({ diaSemana, hora });
    setAlumnoSeleccionado('');
    setEsRecuperacion(false);
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
        cupo: turno.cupo ?? CUPO_DEFAULT,
        destacado: turno.destacado ?? false,
      });
    } else {
      setTurnoParaEditar({
        id: Date.now().toString(),
        diaSemana,
        hora,
        titulo: '',
        profesorId: '',
        alumnoIds: [],
        cupo: CUPO_DEFAULT,
        createdAt: new Date().toISOString(),
      });
      setFormDataTurno({
        titulo: '',
        profesorId: '',
        cupo: CUPO_DEFAULT,
        destacado: false,
      });
    }
    setShowModalEditarTurno(true);
  };

  const handleCerrarModal = () => {
    setShowModal(false);
    setTurnoSeleccionado(null);
    setAlumnoSeleccionado('');
    setEsRecuperacion(false);
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
      const cupo = turnoExistente?.cupo ?? CUPO_DEFAULT;
      const recsEnTurno = recuperaciones.filter(r => r.turnoId === (turnoExistente?.id ?? ''));
      const regularesVisibles = turnoExistente ? turnoExistente.alumnoIds.filter(id => {
        const ins = inscripciones.find(i => i.turnoId === turnoExistente.id && i.alumnoId === id);
        return !ins || ins.semanaDesde <= semanaVista;
      }).length : 0;
      const totalEnTurno = regularesVisibles + recsEnTurno.length;

      if (esRecuperacion) {
        const yaRecuperacion = recsEnTurno.some(r => r.alumnoId === alumnoSeleccionado);
        if (yaRecuperacion) {
          handleCerrarModal();
          return;
        }
        if (totalEnTurno >= cupo) {
          alert('Esta clase ya tiene el cupo completo.');
          return;
        }
        const rec: { id: string; turnoId: string; alumnoId: string; semana: string; createdAt: string } = {
          id: Date.now().toString(),
          turnoId: turnoExistente?.id ?? '',
          alumnoId: alumnoSeleccionado,
          semana: semanaVista,
          createdAt: new Date().toISOString(),
        };
        if (!turnoExistente) {
          const nuevoTurno: Turno = {
            id: Date.now().toString(),
            diaSemana: turnoSeleccionado.diaSemana,
            hora: turnoSeleccionado.hora,
            titulo: '',
            profesorId: '',
            alumnoIds: [],
            cupo: CUPO_DEFAULT,
            createdAt: new Date().toISOString(),
          };
          await storageHybrid.turnos.add(nuevoTurno);
          rec.turnoId = nuevoTurno.id;
        }
        await storageHybrid.recuperaciones.add(rec);
      } else {
        if (turnoExistente) {
          if (totalEnTurno >= cupo) {
            alert('Esta clase ya tiene el cupo completo. Aumentá el cupo desde el ícono de editar (titulo/profesor) o desde "Aumentar cupo".');
            return;
          }
          if (!turnoExistente.alumnoIds.includes(alumnoSeleccionado)) {
            await storageHybrid.turnos.update(turnoExistente.id, {
              alumnoIds: [...turnoExistente.alumnoIds, alumnoSeleccionado],
            });
            await storageHybrid.inscripcionesTurno.add({
              id: Date.now().toString(),
              turnoId: turnoExistente.id,
              alumnoId: alumnoSeleccionado,
              semanaDesde: semanaVista,
              createdAt: new Date().toISOString(),
            });
          }
        } else {
          const nuevoTurno: Turno = {
            id: Date.now().toString(),
            diaSemana: turnoSeleccionado.diaSemana,
            hora: turnoSeleccionado.hora,
            titulo: '',
            profesorId: '',
            alumnoIds: [alumnoSeleccionado],
            cupo: CUPO_DEFAULT,
            createdAt: new Date().toISOString(),
          };
          await storageHybrid.turnos.add(nuevoTurno);
          await storageHybrid.inscripcionesTurno.add({
            id: (Date.now() + 1).toString(),
            turnoId: nuevoTurno.id,
            alumnoId: alumnoSeleccionado,
            semanaDesde: semanaVista,
            createdAt: new Date().toISOString(),
          });
        }
      }

      await loadTurnos();
      await loadInscripciones();
      await loadRecuperaciones();
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
        await storageHybrid.turnos.update(turnoExistente.id, {
          titulo: formDataTurno.titulo,
          profesorId: formDataTurno.profesorId,
          cupo: formDataTurno.cupo,
          destacado: formDataTurno.destacado,
        });
      } else {
        await storageHybrid.turnos.add({
          ...turnoParaEditar,
          titulo: formDataTurno.titulo,
          profesorId: formDataTurno.profesorId,
          cupo: formDataTurno.cupo,
          destacado: formDataTurno.destacado,
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

  const handleEliminarAlumno = async (turnoId: string, alumnoId: string, recuperacionId?: string) => {
    try {
      if (recuperacionId) {
        await storageHybrid.recuperaciones.delete(recuperacionId);
        await loadRecuperaciones();
      } else {
        const turno = turnos.find(t => t.id === turnoId);
        if (!turno) return;
        const nuevosAlumnoIds = turno.alumnoIds.filter(id => id !== alumnoId);
        await storageHybrid.turnos.update(turnoId, { alumnoIds: nuevosAlumnoIds });
        await storageHybrid.inscripcionesTurno.deleteByTurnoYAlumno(turnoId, alumnoId);
        await loadTurnos();
        await loadInscripciones();
      }
      setShowPopupAlumno(null);
    } catch (error) {
      console.error('Error eliminando alumno del turno:', error);
      alert('Error al eliminar el alumno del turno. Por favor intentá nuevamente.');
    }
  };

  const handleMoverAlumno = async () => {
    if (!showPopupAlumno || !turnoDestino) return;
    if (showPopupAlumno.isRecuperacion) return; // No mover recuperaciones

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
          await storageHybrid.inscripcionesTurno.add({
            id: Date.now().toString(),
            turnoId: turnoDestinoExistente.id,
            alumnoId: showPopupAlumno.alumno.id,
            semanaDesde: semanaVista,
            createdAt: new Date().toISOString(),
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
        await storageHybrid.inscripcionesTurno.add({
          id: (Date.now() + 1).toString(),
          turnoId: nuevoTurno.id,
          alumnoId: showPopupAlumno.alumno.id,
          semanaDesde: semanaVista,
          createdAt: new Date().toISOString(),
        });
      }

      await loadTurnos();
      await loadInscripciones();
      setShowPopupAlumno(null);
      setShowMoverAlumno(false);
      setTurnoDestino(null);
    } catch (error) {
      console.error('Error moviendo alumno:', error);
      alert('Error al mover el alumno. Por favor intentá nuevamente.');
    }
  };

  const handleToggleDestacado = async (diaSemana: number, hora: string) => {
    const turno = getTurnoDelDia(diaSemana, hora);
    try {
      if (turno) {
        await storageHybrid.turnos.update(turno.id, { destacado: !turno.destacado });
      } else {
        const nuevoTurno: Turno = {
          id: Date.now().toString(),
          diaSemana,
          hora,
          titulo: '',
          profesorId: '',
          alumnoIds: [],
          cupo: CUPO_DEFAULT,
          destacado: true,
          createdAt: new Date().toISOString(),
        };
        await storageHybrid.turnos.add(nuevoTurno);
      }
      await loadTurnos();
    } catch (error) {
      console.error('Error al destacar:', error);
      alert('Error al marcar el horario. Reintentá.');
    }
  };

  const handleAbrirPopupAlumno = (e: React.MouseEvent, item: AlumnoEnTurno, turno: Turno, diaSemana: number, hora: string) => {
    e.stopPropagation();
    setShowPopupAlumno({
      alumno: item.alumno,
      turnoId: turno.id,
      diaSemana,
      hora,
      isRecuperacion: item.isRecuperacion,
      recuperacionId: item.recuperacionId,
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
      a => a.turnoId === turnoId && a.alumnoId === alumnoId && a.semana === semanaVista
    );
    return asistencia?.estado || null;
  };

  const handleMarcarAsistencia = async (turnoId: string, alumnoId: string, estado: 'asistio' | 'no_asistio') => {
    const asistenciaExistente = asistencias.find(
      a => a.turnoId === turnoId && a.alumnoId === alumnoId && a.semana === semanaVista
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
        semana: semanaVista,
        createdAt: new Date().toISOString(),
      };
      await storageHybrid.asistencias.add(nuevaAsistencia);
    }

    // La recuperación se mantiene para el historial de esa semana (no se elimina al confirmar asistencia)
    await loadAsistencias();
  };

  const handleReiniciarSemana = async () => {
    if (confirm('¿Estás seguro de que querés reiniciar todas las asistencias de esta semana? Esto volverá todos los estados (✓/✗) a gris. Los alumnos en recuperación se mantienen.')) {
      await storageHybrid.asistencias.deleteBySemana(semanaVista);
      await loadAsistencias();
    }
  };

  const handleSaveHorarios = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!useApi()) {
      setHorariosError('En modo local no se pueden guardar horarios.');
      return;
    }
    setHorariosError('');
    setHorariosSaved(false);
    setHorariosSaving(true);
    try {
      await storageApi.sucursal.updateHorarios({
        horaInicioManana,
        horaFinManana,
        horaInicioTarde,
        horaFinTarde,
      });
      const h = await storageApi.sucursal.getHorarios();
      setHorariosManana(h.manana?.length ? h.manana : horariosManana_DEFAULT);
      setHorariosTarde(h.tarde?.length ? h.tarde : horariosTarde_DEFAULT);
      setHorariosSaved(true);
      setTimeout(() => setHorariosSaved(false), 3000);
    } catch (err) {
      setHorariosError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setHorariosSaving(false);
    }
  };

  const handleAumentarCupo = async () => {
    const valor = Math.max(1, Math.floor(Number(cupoGlobal)) || CUPO_DEFAULT);
    try {
      for (const t of turnos) {
        await storageHybrid.turnos.update(t.id, { cupo: valor });
      }
      await loadTurnos();
      setShowModalAumentarCupo(false);
    } catch (e) {
      console.error(e);
      alert('Error al actualizar el cupo. Reintentá.');
    }
  };

  const calcularEstadisticas = (alumnoId: string): EstadisticasAsistencia => {
    const turnosDelAlumno = turnos.filter(t => t.alumnoIds.includes(alumnoId));
    const totalClases = turnosDelAlumno.length;
    
    let clasesAsistidas = 0;
    let clasesNoAsistidas = 0;

    turnosDelAlumno.forEach(turno => {
      const asistencia = asistencias.find(
        a => a.turnoId === turno.id && a.alumnoId === alumnoId && a.semana === semanaVista
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

  const renderAlumnoEnTurno = (item: AlumnoEnTurno, turno: Turno | undefined, diaSemana: number, hora: string) => {
    if (!turno) return null;
    const { alumno, isRecuperacion } = item;
    
    const estadoAsistencia = getEstadoAsistencia(turno.id, alumno.id);
    const tieneFecha = alumno.fechaVencimientoCuota && alumno.fechaVencimientoCuota.trim() !== '';
    const vencido = tieneFecha && isCuotaVencida(alumno.fechaVencimientoCuota);
    const porVencer = tieneFecha && !vencido && (isCuotaVenceHoy(alumno.fechaVencimientoCuota) || isCuotaPorVencer(alumno.fechaVencimientoCuota, 3));
    // Recuperación: amarillo + ícono; sino rojo/ámbar si vencido o por vencer; al día: primary
    let bgColor = 'bg-primary-100 text-primary-900';
    if (isRecuperacion) bgColor = 'bg-amber-200 text-amber-900 border-l-4 border-amber-500';
    else if (vencido) bgColor = 'bg-red-200 text-red-900 border-l-4 border-red-600';
    else if (porVencer) bgColor = 'bg-amber-100 text-amber-900 border-l-4 border-amber-500';
    
    return (
      <div
        key={isRecuperacion ? `rec-${item.recuperacionId}` : alumno.id}
        className={`${bgColor} px-2 py-1 rounded text-xs flex items-center gap-1 group/item hover:opacity-90 transition-colors cursor-pointer`}
        onClick={(e) => handleAbrirPopupAlumno(e, item, turno, diaSemana, hora)}
      >
        {isRecuperacion && <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 text-amber-700" aria-label="Recuperación" />}
        <span className="truncate flex-1" title={`${alumno.nombre} ${alumno.apellido}${isRecuperacion ? ' (recuperación)' : ''}${tieneFecha ? ` — Vence: ${formatDate(alumno.fechaVencimientoCuota)}` : ' — Sin fecha de vencimiento'}`}>
          {alumno.nombre} {alumno.apellido}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleMarcarAsistencia(turno.id, alumno.id, 'asistio');
            }}
            className={`min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 p-1.5 sm:p-0.5 rounded transition-colors flex items-center justify-center touch-manipulation ${
              estadoAsistencia === 'asistio'
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-600 hover:bg-green-300 active:bg-green-400'
            }`}
            title="Marcar como asistió"
          >
            <Check className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleMarcarAsistencia(turno.id, alumno.id, 'no_asistio');
            }}
            className={`min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 p-1.5 sm:p-0.5 rounded transition-colors flex items-center justify-center touch-manipulation ${
              estadoAsistencia === 'no_asistio'
                ? 'bg-red-600 text-white'
                : 'bg-gray-200 text-gray-600 hover:bg-red-300 active:bg-red-400'
            }`}
            title="Marcar como no asistió"
          >
            <XCircle className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="pb-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4 sm:mb-8">
        <div className="flex flex-col gap-2">
          <div className="page-title-wrap">
            <span className="page-title-accent" aria-hidden />
            <h1 className="page-title">Calendario de Turnos</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSemanaVista(getSemanaAnterior(semanaVista))}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 touch-manipulation"
              title="Semana anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium text-gray-700 min-w-[200px] text-center">
              {getRangoSemana(semanaVista)}
            </span>
            <button
              type="button"
              onClick={() => setSemanaVista(getSemanaSiguiente(semanaVista))}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 touch-manipulation"
              title="Semana siguiente"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            {semanaVista !== getSemanaActual() && (
              <button
                type="button"
                onClick={() => setSemanaVista(getSemanaActual)}
                className="text-xs text-primary-600 hover:underline"
              >
                Hoy
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => setShowModalHorarios(true)}
            className="btn-secondary flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px]"
            title="Configurar horarios de clase"
          >
            <Settings className="w-4 h-4" />
            Horarios
          </button>
          <button
            onClick={handleReiniciarSemana}
            className="btn-secondary flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px]"
            title="Reiniciar asistencias de esta semana"
          >
            <RotateCcw className="w-4 h-4" />
            Reiniciar Semana
          </button>
          <details className="bg-blue-50 rounded-lg border border-blue-200 overflow-hidden sm:block">
            <summary className="p-3 sm:p-4 text-sm text-blue-800 font-medium cursor-pointer touch-manipulation list-none flex items-center gap-2">
              <span className="text-blue-600">💡</span> Ayuda
            </summary>
            <p className="px-4 pb-4 pt-0 text-sm text-blue-800 sm:pt-0">
              Los turnos se repiten cada semana. Usá ✓ para asistencia (verde) o ✗ para inasistencia (rojo).
            </p>
          </details>
        </div>
      </div>

      {/* Vista móvil: por día y horario (lista vertical) */}
      {isMobile ? (
        <div>
          {/* Selector: día y horario (filtrar, sin scroll automático) */}
          <div className="sticky top-16 z-30 bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-sm p-3 mb-4 -mx-1">
            <p className="text-xs font-medium text-gray-500 mb-2">Ver día</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                type="button"
                onClick={() => setSelectedDiaMobile(null)}
                className={`px-3 py-2 rounded-lg text-sm font-medium touch-manipulation ${selectedDiaMobile === null ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Todos
              </button>
              {diasSemana.map((diaIndex) => (
                <button
                  key={diaIndex}
                  type="button"
                  onClick={() => setSelectedDiaMobile(diaIndex)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium touch-manipulation ${selectedDiaMobile === diaIndex ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][diaIndex]}
                </button>
              ))}
            </div>
            <p className="text-xs font-medium text-gray-500 mb-2">Ver horario</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedBloqueMobile('todos')}
                className={`px-3 py-2 rounded-lg text-sm font-medium touch-manipulation ${selectedBloqueMobile === 'todos' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setSelectedBloqueMobile('manana')}
                className={`px-3 py-2 rounded-lg text-sm font-medium touch-manipulation ${selectedBloqueMobile === 'manana' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'}`}
              >
                Mañana ({labelMananaShort})
              </button>
              <button
                type="button"
                onClick={() => setSelectedBloqueMobile('tarde')}
                className={`px-3 py-2 rounded-lg text-sm font-medium touch-manipulation ${selectedBloqueMobile === 'tarde' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'}`}
              >
                Tarde ({labelTardeShort})
              </button>
            </div>
          </div>

          <div className="space-y-6">
          {(selectedDiaMobile !== null ? [selectedDiaMobile] : diasSemana).map((diaIndex) => (
            <div key={diaIndex} className="card">
              <h2 className="text-lg font-bold text-primary-700 border-b border-primary-200 pb-2 mb-4">
                {DIAS_SEMANA[diaIndex]}
              </h2>
              <div className="space-y-5">
                {(selectedBloqueMobile === 'todos' || selectedBloqueMobile === 'manana') && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 mb-2">Mañana ({labelManana})</h3>
                  <div className="space-y-3">
                    {horariosManana.map((hora) => {
                      const turno = getTurnoDelDia(diaIndex, hora);
                      const alumnosTurno = getAlumnosDelTurno(turno);
                      const profesor = turno?.profesorId ? profesores.find(p => p.id === turno.profesorId) : null;
                      const cupo = turno?.cupo ?? CUPO_DEFAULT;
                      const lleno = alumnosTurno.length >= cupo;
                      const destacado = turno?.destacado ?? false;
                      return (
                        <div
                          key={hora}
                          className={`border rounded-xl p-3 ${destacado ? 'border-amber-300 bg-amber-100' : 'border-gray-200 bg-gray-50/80'}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="font-semibold text-gray-900">{hora}</span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleDestacado(diaIndex, hora)}
                                className={`p-2 rounded-lg touch-manipulation ${destacado ? 'bg-amber-500 text-amber-950' : 'bg-gray-200 text-gray-600'}`}
                                title={destacado ? 'Quitar destacado' : 'Destacar horario importante'}
                              >
                                <Star className={`w-4 h-4 ${destacado ? 'fill-current' : ''}`} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditarTurno(diaIndex, hora)}
                                className="p-2 rounded-lg bg-purple-600 text-white touch-manipulation"
                                title="Editar título y profesor"
                              >
                                <GraduationCap className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => !lleno && handleAgregarAlumno(diaIndex, hora)}
                                disabled={lleno}
                                className="p-2 rounded-lg bg-primary-600 text-white disabled:opacity-50 touch-manipulation"
                                title={lleno ? 'Clase llena' : 'Agregar alumno'}
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {turno && (
                            <div className="mb-2 text-sm">
                              {turno.titulo && <p className="font-medium text-gray-800">{turno.titulo}</p>}
                              {profesor && <p className="text-gray-600">Prof: {profesor.nombre} {profesor.apellido}</p>}
                              <p className="text-gray-500 flex items-center gap-1">
                                <Users className="w-4 h-4" />
                                {alumnosTurno.length}/{cupo} alumnos
                              </p>
                            </div>
                          )}
                          <div className="space-y-1.5">
                            {alumnosTurno.map((alumno) => renderAlumnoEnTurno(alumno, turno, diaIndex, hora))}
                          </div>
                          {!lleno && alumnosTurno.length === 0 && (
                            <button
                              type="button"
                              onClick={() => handleAgregarAlumno(diaIndex, hora)}
                              className="mt-2 w-full py-2 text-sm font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 touch-manipulation"
                            >
                              + Agregar alumno
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}
                {(selectedBloqueMobile === 'todos' || selectedBloqueMobile === 'tarde') && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 mb-2">Tarde ({labelTarde})</h3>
                  <div className="space-y-3">
                    {horariosTarde.map((hora) => {
                      const turno = getTurnoDelDia(diaIndex, hora);
                      const alumnosTurno = getAlumnosDelTurno(turno);
                      const profesor = turno?.profesorId ? profesores.find(p => p.id === turno.profesorId) : null;
                      const cupo = turno?.cupo ?? CUPO_DEFAULT;
                      const lleno = alumnosTurno.length >= cupo;
                      const destacado = turno?.destacado ?? false;
                      return (
                        <div
                          key={hora}
                          className={`border rounded-xl p-3 ${destacado ? 'border-amber-300 bg-amber-100' : 'border-gray-200 bg-gray-50/80'}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="font-semibold text-gray-900">{hora}</span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleDestacado(diaIndex, hora)}
                                className={`p-2 rounded-lg touch-manipulation ${destacado ? 'bg-amber-500 text-amber-950' : 'bg-gray-200 text-gray-600'}`}
                                title={destacado ? 'Quitar destacado' : 'Destacar horario importante'}
                              >
                                <Star className={`w-4 h-4 ${destacado ? 'fill-current' : ''}`} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditarTurno(diaIndex, hora)}
                                className="p-2 rounded-lg bg-purple-600 text-white touch-manipulation"
                                title="Editar título y profesor"
                              >
                                <GraduationCap className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => !lleno && handleAgregarAlumno(diaIndex, hora)}
                                disabled={lleno}
                                className="p-2 rounded-lg bg-primary-600 text-white disabled:opacity-50 touch-manipulation"
                                title={lleno ? 'Clase llena' : 'Agregar alumno'}
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {turno && (
                            <div className="mb-2 text-sm">
                              {turno.titulo && <p className="font-medium text-gray-800">{turno.titulo}</p>}
                              {profesor && <p className="text-gray-600">Prof: {profesor.nombre} {profesor.apellido}</p>}
                              <p className="text-gray-500 flex items-center gap-1">
                                <Users className="w-4 h-4" />
                                {alumnosTurno.length}/{cupo} alumnos
                              </p>
                            </div>
                          )}
                          <div className="space-y-1.5">
                            {alumnosTurno.map((alumno) => renderAlumnoEnTurno(alumno, turno, diaIndex, hora))}
                          </div>
                          {!lleno && alumnosTurno.length === 0 && (
                            <button
                              type="button"
                              onClick={() => handleAgregarAlumno(diaIndex, hora)}
                              className="mt-2 w-full py-2 text-sm font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 touch-manipulation"
                            >
                              + Agregar alumno
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}
              </div>
            </div>
          ))}
          </div>
        </div>
      ) : (
        <>
          <div
            className="card p-0 -mx-2 sm:mx-0 overflow-x-scroll sm:overflow-x-auto overflow-y-visible touch-pan-x"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="min-w-[720px] pr-4 sm:pr-0">
              <div className="grid grid-cols-8 border-b border-gray-200 bg-primary-50">
                <div className="sticky left-0 z-20 p-2 sm:p-3 font-semibold text-gray-700 border-r border-gray-200 bg-primary-50 shadow-[2px_0_4px_rgba(0,0,0,0.06)]">Hora</div>
                {diasSemana.map((diaIndex) => (
                  <div
                    key={diaIndex}
                    className="p-2 sm:p-3 text-center font-semibold border-r border-gray-200 last:border-r-0 text-gray-700 min-w-[72px]"
                  >
                    <div className="text-xs sm:text-sm uppercase">{DIAS_SEMANA[diaIndex]}</div>
                  </div>
                ))}
              </div>
              <div className="border-b border-gray-300">
                <div className="bg-gray-50 px-2 sm:px-3 py-2 font-semibold text-gray-700 text-xs sm:text-sm">
                  Mañana ({labelManana})
                </div>
                {horariosManana.map((hora) => (
                  <div key={hora} className="grid grid-cols-8 border-b border-gray-200 hover:bg-gray-50">
                    <div className="sticky left-0 z-10 p-2 sm:p-3 font-medium text-gray-700 border-r border-gray-200 bg-gray-50 shadow-[2px_0_4px_rgba(0,0,0,0.06)] min-w-[52px]">
                      {hora}
                    </div>
                    {diasSemana.map((diaIndex) => {
                      const turno = getTurnoDelDia(diaIndex, hora);
                      const alumnosTurno = getAlumnosDelTurno(turno);
                      const profesor = turno?.profesorId ? profesores.find(p => p.id === turno.profesorId) : null;
                      const destacado = turno?.destacado ?? false;
                      return (
                        <div
                          key={`${diaIndex}-${hora}`}
                          className={`p-2 min-h-[72px] sm:min-h-[80px] min-w-[72px] border-r border-gray-200 last:border-r-0 relative group ${destacado ? 'bg-amber-100' : 'hover:bg-gray-50'}`}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEditarTurno(diaIndex, hora); }}
                            className="absolute top-1 left-1 w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-purple-600 hover:bg-purple-700 rounded text-white z-20"
                            title="Editar título y profesor"
                          >
                            <GraduationCap className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleDestacado(diaIndex, hora); }}
                            className={`absolute top-1 right-9 sm:right-8 w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity rounded z-20 touch-manipulation ${destacado ? 'bg-amber-500 text-amber-950' : 'bg-gray-200 text-gray-600 hover:bg-amber-200 hover:text-amber-700'}`}
                            title={destacado ? 'Quitar destacado' : 'Destacar horario importante'}
                          >
                            <Star className={`w-4 h-4 ${destacado ? 'fill-current' : ''}`} />
                          </button>
                          {turno && (
                            <div className="mb-1 sm:mb-2 pb-1 sm:pb-2 border-b border-gray-200">
                              {turno.titulo && <div className="text-xs font-semibold text-gray-700 mb-0.5 truncate">{turno.titulo}</div>}
                              {profesor && <div className="text-xs text-gray-600 truncate">Prof: {profesor.nombre} {profesor.apellido}</div>}
                              <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                <Users className="w-3.5 h-3.5 flex-shrink-0" />
                                {alumnosTurno.length}/{turno.cupo ?? CUPO_DEFAULT}
                              </div>
                            </div>
                          )}
                          {alumnosTurno.length > 0 ? (
                            <div className="space-y-1 relative z-10">
                              {alumnosTurno.map((alumno) => renderAlumnoEnTurno(alumno, turno, diaIndex, hora))}
                            </div>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <Plus className="w-5 h-5 text-gray-400 opacity-0 sm:group-hover:opacity-100 transition-opacity" />
                            </div>
                          )}
                          {(() => {
                            const cupo = turno?.cupo ?? CUPO_DEFAULT;
                            const lleno = alumnosTurno.length >= cupo;
                            return (
                              <button
                                onClick={() => !lleno && handleAgregarAlumno(diaIndex, hora)}
                                disabled={lleno}
                                className="absolute top-1 right-1 w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-primary-600 hover:bg-primary-700 rounded text-white z-20 disabled:opacity-50 touch-manipulation"
                                title={lleno ? 'Clase llena' : 'Agregar alumno'}
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div>
                <div className="bg-gray-50 px-2 sm:px-3 py-2 font-semibold text-gray-700 text-xs sm:text-sm">
                  Tarde ({labelTarde})
                </div>
                {horariosTarde.map((hora) => (
                  <div key={hora} className="grid grid-cols-8 border-b border-gray-200 hover:bg-gray-50 last:border-b-0">
                    <div className="sticky left-0 z-10 p-2 sm:p-3 font-medium text-gray-700 border-r border-gray-200 bg-gray-50 shadow-[2px_0_4px_rgba(0,0,0,0.06)] min-w-[52px]">
                      {hora}
                    </div>
                    {diasSemana.map((diaIndex) => {
                      const turno = getTurnoDelDia(diaIndex, hora);
                      const alumnosTurno = getAlumnosDelTurno(turno);
                      const profesor = turno?.profesorId ? profesores.find(p => p.id === turno.profesorId) : null;
                      const destacado = turno?.destacado ?? false;
                      return (
                        <div
                          key={`${diaIndex}-${hora}`}
                          className={`p-2 min-h-[72px] sm:min-h-[80px] min-w-[72px] border-r border-gray-200 last:border-r-0 relative group ${destacado ? 'bg-amber-100' : 'hover:bg-gray-50'}`}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEditarTurno(diaIndex, hora); }}
                            className="absolute top-1 left-1 w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-purple-600 hover:bg-purple-700 rounded text-white z-20"
                            title="Editar título y profesor"
                          >
                            <GraduationCap className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleDestacado(diaIndex, hora); }}
                            className={`absolute top-1 right-9 sm:right-8 w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity rounded z-20 touch-manipulation ${destacado ? 'bg-amber-500 text-amber-950' : 'bg-gray-200 text-gray-600 hover:bg-amber-200 hover:text-amber-700'}`}
                            title={destacado ? 'Quitar destacado' : 'Destacar horario importante'}
                          >
                            <Star className={`w-4 h-4 ${destacado ? 'fill-current' : ''}`} />
                          </button>
                          {turno && (
                            <div className="mb-1 sm:mb-2 pb-1 sm:pb-2 border-b border-gray-200">
                              {turno.titulo && <div className="text-xs font-semibold text-gray-700 mb-0.5 truncate">{turno.titulo}</div>}
                              {profesor && <div className="text-xs text-gray-600 truncate">Prof: {profesor.nombre} {profesor.apellido}</div>}
                              <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                <Users className="w-3.5 h-3.5 flex-shrink-0" />
                                {alumnosTurno.length}/{turno.cupo ?? CUPO_DEFAULT}
                              </div>
                            </div>
                          )}
                          {alumnosTurno.length > 0 ? (
                            <div className="space-y-1 relative z-10">
                              {alumnosTurno.map((alumno) => renderAlumnoEnTurno(alumno, turno, diaIndex, hora))}
                            </div>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <Plus className="w-5 h-5 text-gray-400 opacity-0 sm:group-hover:opacity-100 transition-opacity" />
                            </div>
                          )}
                          {(() => {
                            const cupo = turno?.cupo ?? CUPO_DEFAULT;
                            const lleno = alumnosTurno.length >= cupo;
                            return (
                              <button
                                onClick={() => !lleno && handleAgregarAlumno(diaIndex, hora)}
                                disabled={lleno}
                                className="absolute top-1 right-1 w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-primary-600 hover:bg-primary-700 rounded text-white z-20 disabled:opacity-50 touch-manipulation"
                                title={lleno ? 'Clase llena' : 'Agregar alumno'}
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Botones cupo - abajo del calendario */}
      <div className="mt-4 sm:mt-6 flex flex-wrap justify-end gap-2 sm:gap-3">
        <button
          type="button"
          onClick={async () => {
            if (!confirm('¿Recortar todas las clases al cupo configurado? Se quitarán alumnos de las clases que tengan más del cupo (los últimos de la lista).')) return;
            try {
              const { turnosActualizados, alumnosEliminados } = await storageHybrid.turnos.ajustarCupo();
              await loadTurnos();
              alert(turnosActualizados === 0
                ? 'Todas las clases ya respetan el cupo.'
                : `Listo: ${turnosActualizados} clase(s) ajustadas. Se quitaron ${alumnosEliminados} alumno(s) en total.`);
            } catch (e) {
              console.error(e);
              alert('Error al ajustar. Reintentá.');
            }
          }}
          className="btn-secondary flex items-center justify-center gap-2 min-h-[44px] flex-1 sm:flex-initial"
        >
          <Users className="w-5 h-5" />
          Recortar al cupo
        </button>
        <button
          type="button"
          onClick={() => {
            setCupoGlobal(CUPO_DEFAULT);
            setShowModalAumentarCupo(true);
          }}
          className="btn-primary flex items-center justify-center gap-2 min-h-[44px] flex-1 sm:flex-initial"
        >
          <Users className="w-5 h-5" />
          Aumentar cupo
        </button>
      </div>

      {/* Estadísticas de asistencias - Colapsable */}
      <div className="mt-4 sm:mt-6">
        <button
          onClick={() => setShowEstadisticas(!showEstadisticas)}
          className="w-full btn-secondary flex items-center justify-between mb-4 min-h-[44px] px-4 touch-manipulation"
        >
          <span className="font-semibold text-left text-sm sm:text-base">Estadísticas - Semana Actual</span>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                Agregar Alumno al Turno
              </h2>
              <button
                onClick={handleCerrarModal}
                className="p-2 -m-2 text-gray-400 hover:text-gray-600 touch-manipulation"
                aria-label="Cerrar"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto overscroll-contain">
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
                    const yaEnTurno = getAlumnosDelTurno(turno).some(a => a.alumno.id === alumno.id);
                    const yaRecuperacion = recuperaciones.some(r => r.turnoId === turno?.id && r.alumnoId === alumno.id);
                    const yaAsignado = yaEnTurno || yaRecuperacion;
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
                <label className="flex items-center gap-2 mt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={esRecuperacion}
                    onChange={(e) => setEsRecuperacion(e.target.checked)}
                    className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Es para recuperar (temporal, desaparece al reiniciar semana)</span>
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 flex-shrink-0">
                <button
                  onClick={handleCerrarModal}
                  className="btn-secondary min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGuardarAlumno}
                  disabled={!alumnoSeleccionado}
                  className="btn-primary flex items-center gap-2 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <UserPlus className="w-4 h-4" />
                  Agregar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Horarios */}
      {showModalHorarios && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Horarios</h2>
              <button
                type="button"
                onClick={() => setShowModalHorarios(false)}
                className="p-2 -m-2 text-gray-400 hover:text-gray-600 touch-manipulation"
                aria-label="Cerrar"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain">
              {!useApi() ? (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-4">
                  En modo local no podés configurar horarios. Los horarios se configuran cuando la app está conectada a la base de datos (Railway).
                </p>
              ) : (
                <form onSubmit={handleSaveHorarios} className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Definí en qué horarios da clases esta sucursal. En el Calendario solo aparecerán estos bloques.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mañana: desde</label>
                      <select value={horaInicioManana} onChange={(e) => setHoraInicioManana(e.target.value)} className="input-field">
                        {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mañana: hasta</label>
                      <select value={horaFinManana} onChange={(e) => setHoraFinManana(e.target.value)} className="input-field">
                        {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tarde: desde</label>
                      <select value={horaInicioTarde} onChange={(e) => setHoraInicioTarde(e.target.value)} className="input-field">
                        {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tarde: hasta</label>
                      <select value={horaFinTarde} onChange={(e) => setHoraFinTarde(e.target.value)} className="input-field">
                        {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                  {horariosError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{horariosError}</div>
                  )}
                  {horariosSaved && (
                    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">Horarios guardados correctamente.</div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button type="submit" disabled={horariosSaving} className="btn-primary flex items-center gap-2">
                      <Save className="w-4 h-4" />
                      {horariosSaving ? 'Guardando...' : 'Guardar horarios'}
                    </button>
                    <button type="button" onClick={() => setShowModalHorarios(false)} className="btn-secondary">Cerrar</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal para editar título y profesor del turno */}
      {showModalEditarTurno && turnoParaEditar && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                Editar Turno
              </h2>
              <button
                onClick={() => {
                  setShowModalEditarTurno(false);
                  setTurnoParaEditar(null);
                }}
                className="p-2 -m-2 text-gray-400 hover:text-gray-600 touch-manipulation"
                aria-label="Cerrar"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto overscroll-contain">
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
              <button
                type="button"
                onClick={() => setFormDataTurno({ ...formDataTurno, destacado: !formDataTurno.destacado })}
                className={`w-full flex items-center gap-2 p-3 rounded-lg border-2 transition-colors ${formDataTurno.destacado ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-gray-50 hover:border-amber-300'}`}
              >
                <Star className={`w-5 h-5 flex-shrink-0 ${formDataTurno.destacado ? 'fill-amber-500 text-amber-600' : 'text-gray-400'}`} />
                <span className="text-sm font-medium text-gray-700">Horario importante (destacado)</span>
              </button>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cupo (máx. alumnos por clase)
                </label>
                <input
                  type="number"
                  min={1}
                  value={formDataTurno.cupo}
                  onChange={(e) => setFormDataTurno({ ...formDataTurno, cupo: Math.max(1, parseInt(e.target.value, 10) || 6) })}
                  className="input-field"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 flex-shrink-0">
                <button
                  onClick={() => {
                    setShowModalEditarTurno(false);
                    setTurnoParaEditar(null);
                  }}
                  className="btn-secondary min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGuardarEdicionTurno}
                  className="btn-primary flex items-center gap-2 min-h-[44px]"
                >
                  <Save className="w-4 h-4" />
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Aumentar cupo */}
      {showModalAumentarCupo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-sm w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Aumentar cupo</h2>
            <p className="text-sm text-gray-600 mb-4">
              Establecé el cupo (máx. alumnos) para todas las clases. Las que ya existan se actualizarán.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Cupo por clase</label>
              <input
                type="number"
                min={1}
                value={cupoGlobal}
                onChange={(e) => setCupoGlobal(Math.max(1, parseInt(e.target.value, 10) || CUPO_DEFAULT))}
                className="input-field"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowModalAumentarCupo(false)}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button type="button" onClick={handleAumentarCupo} className="btn-primary">
                Aplicar a todas las clases
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup de información del alumno */}
      {showPopupAlumno && (
        <div
          ref={popupRef}
          className="fixed bg-white shadow-xl border border-gray-200 p-4 z-50 min-w-[280px] max-w-[calc(100vw-2rem)] sm:max-w-md rounded-xl sm:rounded-lg"
          style={{
            left: window.innerWidth < 640
              ? '1rem'
              : `${Math.min(showPopupAlumno.position.x, window.innerWidth - 320)}px`,
            right: window.innerWidth < 640 ? '1rem' : undefined,
            top: window.innerWidth < 640
              ? 'auto'
              : `${Math.min(showPopupAlumno.position.y + 10, window.innerHeight - 200)}px`,
            bottom: window.innerWidth < 640 ? '1rem' : undefined,
          }}
        >
          <div className="mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-gray-900 text-lg mb-1">
                {showPopupAlumno.alumno.nombre} {showPopupAlumno.alumno.apellido}
              </h3>
              {showPopupAlumno.isRecuperacion && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-200 text-amber-900">
                  <RefreshCw className="w-3 h-3" />
                  Recuperación
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600">DNI: {showPopupAlumno.alumno.dni}</p>
            <p className="text-xs text-gray-500 mt-1">
              Turno actual: {DIAS_SEMANA[showPopupAlumno.diaSemana]} {showPopupAlumno.hora}
            </p>
            <p className="text-xs font-medium mt-1">
              Fecha de vencimiento:{' '}
              {(showPopupAlumno.alumno.fechaVencimientoCuota ?? '').trim() ? (
                <span className={isCuotaVencida(showPopupAlumno.alumno.fechaVencimientoCuota) ? 'text-red-600' : isCuotaVenceHoy(showPopupAlumno.alumno.fechaVencimientoCuota) || isCuotaPorVencer(showPopupAlumno.alumno.fechaVencimientoCuota, 3) ? 'text-amber-600' : 'text-gray-700'}>
                  {formatDate(showPopupAlumno.alumno.fechaVencimientoCuota)}
                  {isCuotaVencida(showPopupAlumno.alumno.fechaVencimientoCuota) && ' (vencida)'}
                  {(isCuotaVenceHoy(showPopupAlumno.alumno.fechaVencimientoCuota) || isCuotaPorVencer(showPopupAlumno.alumno.fechaVencimientoCuota, 3)) && !isCuotaVencida(showPopupAlumno.alumno.fechaVencimientoCuota) && ' (próximos días)'}
                </span>
              ) : (
                <span className="text-gray-500">Sin fecha / pendiente de pago</span>
              )}
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
              {!showPopupAlumno.isRecuperacion && (
                <button
                  onClick={() => {
                    setShowMoverAlumno(true);
                  }}
                  className="w-full btn-secondary flex items-center justify-center gap-2 text-sm"
                >
                  <Move className="w-4 h-4" />
                  Mover a otro turno
                </button>
              )}
              <button
                onClick={() => {
                  const msg = showPopupAlumno.isRecuperacion
                    ? `¿Quitar a ${showPopupAlumno.alumno.nombre} ${showPopupAlumno.alumno.apellido} de esta recuperación?`
                    : `¿Estás seguro de que querés eliminar a ${showPopupAlumno.alumno.nombre} ${showPopupAlumno.alumno.apellido} de este turno?`;
                  if (confirm(msg)) {
                    handleEliminarAlumno(showPopupAlumno.turnoId, showPopupAlumno.alumno.id, showPopupAlumno.recuperacionId);
                  }
                }}
                className="w-full btn-danger flex items-center justify-center gap-2 text-sm"
              >
                <Trash2 className="w-4 h-4" />
                {showPopupAlumno.isRecuperacion ? 'Quitar de recuperación' : 'Eliminar del turno'}
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
                        setTurnoDestino({ diaSemana: dia, hora: horariosManana[0] });
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
                    {horariosManana.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                    {horariosTarde.map((h) => (
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
