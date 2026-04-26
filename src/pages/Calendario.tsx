import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { Plus, X, UserPlus, Search, Check, XCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Trash2, Move, Save, GraduationCap, Users, Settings, RefreshCw, Star, MessageCircle, FileText, Mail, Share2, StickyNote, Sparkles } from 'lucide-react';
import { Turno, Alumno, Actividad, DIAS_SEMANA, Asistencia, EstadisticasAsistencia, Profesor, Recuperacion, LiberacionSemana, InscripcionTurno } from '../types';
import { storage } from '../utils/storage';
import { storageHybrid } from '../utils/storage-hybrid';
import { storageApi } from '../utils/storage-api';
import { formatDate, isCuotaVencida, isCuotaPorVencer, isCuotaVenceHoy, getFechaFromSemanaYDia } from '../utils/date';
import { useToast } from '../components/ToastProvider';
import { useAuth } from '../contexts/AuthContext';

// Horarios por defecto (modo local); en API se cargan desde la sucursal
const horariosManana_DEFAULT = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00'];
const horariosTarde_DEFAULT = ['16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
const HORAS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0') + ':00');
const HORARIOS_NO_DISPONIBLES_VACIOS: Record<number, string[]> = {
  0: [],
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
  6: [],
};

const generarHorasDesdeHasta = (inicio: string, fin: string): string[] => {
  const [hI, mI] = (inicio || '07:00').split(':').map(Number);
  const [hF, mF] = (fin || '12:00').split(':').map(Number);
  let min = hI * 60 + mI;
  const end = hF * 60 + mF;
  const out: string[] = [];
  while (min <= end) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    out.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    min += 60;
  }
  return out;
};

const normalizarHorariosNoDisponibles = (
  raw?: Record<number | string, string[]>,
  horasValidas?: string[]
): Record<number, string[]> => {
  const out: Record<number, string[]> = { ...HORARIOS_NO_DISPONIBLES_VACIOS };
  const horasPermitidas = horasValidas ? new Set(horasValidas) : null;
  if (!raw) return out;
  for (let dia = 0; dia <= 6; dia++) {
    const lista = raw[dia] ?? raw[String(dia)];
    if (!Array.isArray(lista)) continue;
    out[dia] = Array.from(new Set(
      lista.filter((hora) => !horasPermitidas || horasPermitidas.has(hora))
    )).sort((a, b) => a.localeCompare(b));
  }
  return out;
};

type ReporteTurnoItem = {
  id: string;
  fecha: string;
  diaSemana: number;
  diaLabel: string;
  hora: string;
  titulo: string;
  profesor: string;
  cupo: number;
  ocupacion: number;
  fijas: number;
  recuperaciones: number;
  libres: number;
  llena: boolean;
};

type ReporteDiaItem = {
  fecha: string;
  titulo: string;
  turnos: ReporteTurnoItem[];
};

type ReporteVistaPrevia = {
  desde: string;
  hasta: string;
  totalClases: number;
  totalFijas: number;
  totalRecuperaciones: number;
  totalLlenas: number;
  totalLibres: number;
  dias: ReporteDiaItem[];
};

const getFechasEntre = (desde: string, hasta: string) => {
  const start = new Date(`${desde}T00:00:00`);
  const end = new Date(`${hasta}T00:00:00`);
  const fechas: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    const iso = new Date(current.getTime() - current.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    fechas.push(iso);
    current.setDate(current.getDate() + 1);
  }
  return fechas;
};

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

/** Dado una fecha, devuelve la semana (YYYY-WW) que la contiene (lunes a domingo) */
const getSemanaFromDate = (fecha: Date): string => {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const lunes = new Date(d);
  lunes.setDate(lunes.getDate() - diff);
  const y = lunes.getFullYear();
  const jan1 = new Date(y, 0, 1);
  const dayOfJan1 = jan1.getDay();
  const mondayOffset = dayOfJan1 === 0 ? 6 : dayOfJan1 - 1;
  const mondayWeek1 = new Date(y, 0, 1 - mondayOffset);
  const semanas = Math.floor((lunes.getTime() - mondayWeek1.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${y}-${semanas.toString().padStart(2, '0')}`;
};

const Calendario = () => {
  const toast = useToast();
  const [horariosManana, setHorariosManana] = useState<string[]>(horariosManana_DEFAULT);
  const [horariosTarde, setHorariosTarde] = useState<string[]>(horariosTarde_DEFAULT);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
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
    liberadaSemana?: boolean;
    liberacionId?: string;
    recuperacionId?: string;
    aPrueba?: boolean;
    position: { x: number; y: number };
  } | null>(null);
  const [showMoverAlumno, setShowMoverAlumno] = useState(false);
  const [savingLiberacionSemana, setSavingLiberacionSemana] = useState(false);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<{ diaSemana: number; hora: string } | null>(null);
  const [turnoParaEditar, setTurnoParaEditar] = useState<Turno | null>(null);
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState('');
  /** Cómo se da de alta al agregar desde el modal: fija, recuperación semanal o inscripción fija a prueba (violeta) */
  const [tipoAgregarAlumno, setTipoAgregarAlumno] = useState<'fija' | 'recuperar' | 'prueba'>('fija');
  const [recuperaciones, setRecuperaciones] = useState<Recuperacion[]>([]);
  const [liberacionesSemana, setLiberacionesSemana] = useState<LiberacionSemana[]>([]);
  const [inscripciones, setInscripciones] = useState<InscripcionTurno[]>([]);
  const CUPO_DEFAULT = 6;
  const parseCupo = (value: string, fallback = CUPO_DEFAULT) => {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.max(1, parsed);
  };
  const [formDataTurno, setFormDataTurno] = useState({
    titulo: '',
    profesorId: '',
    cupo: CUPO_DEFAULT,
    destacado: false,
  });
  const [cupoTurnoInput, setCupoTurnoInput] = useState(String(CUPO_DEFAULT));
  const [showModalAumentarCupo, setShowModalAumentarCupo] = useState(false);
  const [showModalCompartirDisponibles, setShowModalCompartirDisponibles] = useState(false);
  const [showModalHorarios, setShowModalHorarios] = useState(false);
  const [horaInicioManana, setHoraInicioManana] = useState('07:00');
  const [horaFinManana, setHoraFinManana] = useState('12:00');
  const [horaInicioTarde, setHoraInicioTarde] = useState('16:00');
  const [horaFinTarde, setHoraFinTarde] = useState('21:00');
  const [horariosNoDisponiblesPorDia, setHorariosNoDisponiblesPorDia] = useState<Record<number, string[]>>(
    HORARIOS_NO_DISPONIBLES_VACIOS
  );
  const [horariosSaving, setHorariosSaving] = useState(false);
  const [horariosError, setHorariosError] = useState('');
  const [horariosSaved, setHorariosSaved] = useState(false);
  const [cupoGlobal, setCupoGlobal] = useState(CUPO_DEFAULT);
  const [cupoGlobalInput, setCupoGlobalInput] = useState(String(CUPO_DEFAULT));
  const [formCompartirDisponibles, setFormCompartirDisponibles] = useState({
    diasSeleccionados: [] as number[],
    horaDesde: '',
    horaHasta: '',
    mostrarLugares: true,
  });
  const [mensajeDisponibles, setMensajeDisponibles] = useState('');
  const [generandoDisponibles, setGenerandoDisponibles] = useState(false);
  const [turnoDestino, setTurnoDestino] = useState<{ diaSemana: number; hora: string } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [showModalReporte, setShowModalReporte] = useState(false);
  const [reporteDesde, setReporteDesde] = useState(getFechaFromSemanaYDia(getSemanaActual(), 0));
  const [reporteHasta, setReporteHasta] = useState(getFechaFromSemanaYDia(getSemanaActual(), 5));
  const [generandoVistaReporte, setGenerandoVistaReporte] = useState(false);
  const [reportePreview, setReportePreview] = useState<ReporteVistaPrevia | null>(null);

  const { planificacionHabilitada } = useAuth();
  const [notasPlanifPorFecha, setNotasPlanifPorFecha] = useState<Record<string, string>>({});
  const [modalNotaFecha, setModalNotaFecha] = useState<string | null>(null);
  const [draftNotaTexto, setDraftNotaTexto] = useState('');
  const [guardandoNotaPlanif, setGuardandoNotaPlanif] = useState(false);
  /** Tamaño/posición del viewport visible (teclado móvil). */
  const [notaPlanifViewport, setNotaPlanifViewport] = useState<{ h: number; top: number } | null>(null);
  const notaPlanifTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const [selectedDiaMobile, setSelectedDiaMobile] = useState<number | null>(null);
  const [selectedBloqueMobile, setSelectedBloqueMobile] = useState<'todos' | 'manana' | 'tarde'>('todos');
  const horariosMananaModal = useMemo(
    () => generarHorasDesdeHasta(horaInicioManana, horaFinManana),
    [horaInicioManana, horaFinManana]
  );
  const horariosTardeModal = useMemo(
    () => generarHorasDesdeHasta(horaInicioTarde, horaFinTarde),
    [horaInicioTarde, horaFinTarde]
  );
  const todasLasHorasModal = useMemo(
    () => Array.from(new Set([...horariosMananaModal, ...horariosTardeModal])).sort((a, b) => a.localeCompare(b)),
    [horariosMananaModal, horariosTardeModal]
  );

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
          setHorariosNoDisponiblesPorDia(normalizarHorariosNoDisponibles(h.horariosNoDisponiblesPorDia, [...(h.manana || []), ...(h.tarde || [])]));
        } catch {
          setHorariosManana(horariosManana_DEFAULT);
          setHorariosTarde(horariosTarde_DEFAULT);
          setHorariosNoDisponiblesPorDia(HORARIOS_NO_DISPONIBLES_VACIOS);
        }
      }
      await loadTurnos();
      await loadAlumnos();
      await loadActividades();
      await loadProfesores();
      await loadAsistencias();
      await loadRecuperaciones();
      await loadLiberacionesSemana();
      await loadInscripciones();
    })();
  }, [semanaVista]);

  useEffect(() => {
    if (!planificacionHabilitada) {
      setNotasPlanifPorFecha({});
      return;
    }
    const desde = getFechaFromSemanaYDia(semanaVista, 0);
    const hasta = getFechaFromSemanaYDia(semanaVista, 5);
    let cancelled = false;
    void (async () => {
      try {
        const notas = await storageHybrid.planificacion.getCalendarioNotasRango(desde, hasta);
        if (!cancelled) setNotasPlanifPorFecha(notas);
      } catch {
        if (!cancelled) setNotasPlanifPorFecha({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planificacionHabilitada, semanaVista]);

  /** Modal nota: seguir visualViewport para que el teclado no tape el texto (iOS / Android). */
  useLayoutEffect(() => {
    if (!modalNotaFecha) {
      setNotaPlanifViewport(null);
      return;
    }
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) {
      setNotaPlanifViewport({ h: window.innerHeight, top: 0 });
      return;
    }
    const sync = () => {
      setNotaPlanifViewport({ h: vv.height, top: vv.offsetTop });
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, [modalNotaFecha]);

  useEffect(() => {
    if (showModalHorarios && useApi()) {
      storageApi.sucursal.getHorarios().then((data) => {
        setHoraInicioManana(data.horaInicioManana || '07:00');
        setHoraFinManana(data.horaFinManana || '12:00');
        setHoraInicioTarde(data.horaInicioTarde || '16:00');
        setHoraFinTarde(data.horaFinTarde || '21:00');
        setHorariosNoDisponiblesPorDia(
          normalizarHorariosNoDisponibles(data.horariosNoDisponiblesPorDia, [...(data.manana || []), ...(data.tarde || [])])
        );
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

  const loadActividades = async () => {
    try {
      const data = await storageHybrid.actividades.getAll();
      setActividades(data);
    } catch (error) {
      console.error('Error loading actividades:', error);
      setActividades(storage.actividades.getAll());
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

  const loadLiberacionesSemana = async () => {
    try {
      const data = await storageHybrid.liberacionesSemana.getBySemana(semanaVista);
      setLiberacionesSemana(data);
    } catch {
      setLiberacionesSemana([]);
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

  const abrirModalNotaPlanif = (fecha: string) => {
    setModalNotaFecha(fecha);
    setDraftNotaTexto(notasPlanifPorFecha[fecha] || '');
  };
  const cerrarModalNotaPlanif = () => {
    setModalNotaFecha(null);
    setDraftNotaTexto('');
  };
  const guardarNotaPlanif = async () => {
    if (!modalNotaFecha) return;
    setGuardandoNotaPlanif(true);
    try {
      await storageHybrid.planificacion.putCalendarioNota(modalNotaFecha, draftNotaTexto);
      setNotasPlanifPorFecha((prev) => {
        const next = { ...prev };
        if (!draftNotaTexto.trim()) delete next[modalNotaFecha];
        else next[modalNotaFecha] = draftNotaTexto;
        return next;
      });
      toast.success('Nota guardada');
      cerrarModalNotaPlanif();
    } catch {
      toast.error('No se pudo guardar la nota');
    } finally {
      setGuardandoNotaPlanif(false);
    }
  };

  // Etiquetas dinámicas según horarios de la sucursal (ej. Nes 9–13h, Savia 7–12h)
  const labelManana = horariosManana.length ? `${horariosManana[0]} - ${horariosManana[horariosManana.length - 1]}` : 'Mañana';
  const labelTarde = horariosTarde.length ? `${horariosTarde[0]} - ${horariosTarde[horariosTarde.length - 1]}` : 'Tarde';
  const labelMananaShort = horariosManana.length
    ? `${parseInt(horariosManana[0].split(':')[0], 10)}–${parseInt(horariosManana[horariosManana.length - 1].split(':')[0], 10)}h`
    : '7–12h';
  const labelTardeShort = horariosTarde.length
    ? `${parseInt(horariosTarde[0].split(':')[0], 10)}–${parseInt(horariosTarde[horariosTarde.length - 1].split(':')[0], 10)}h`
    : '16–21h';
  const todasLasHoras = useMemo(
    () => Array.from(new Set([...horariosManana, ...horariosTarde])).sort((a, b) => a.localeCompare(b)),
    [horariosManana, horariosTarde]
  );

  const isHorarioDisponibleEnDia = (diaSemana: number, hora: string) => {
    return !(horariosNoDisponiblesPorDia[diaSemana] || []).includes(hora);
  };

  const toggleHorarioNoDisponible = (diaSemana: number, hora: string) => {
    setHorariosNoDisponiblesPorDia((prev) => {
      const actuales = prev[diaSemana] || [];
      const siguiente = actuales.includes(hora)
        ? actuales.filter((item) => item !== hora)
        : [...actuales, hora].sort((a, b) => a.localeCompare(b));
      return {
        ...prev,
        [diaSemana]: siguiente,
      };
    });
  };

  const getTurnoDelDia = (diaSemana: number, hora: string): Turno | undefined => {
    return turnos.find(t => t.diaSemana === diaSemana && t.hora === hora);
  };

  type AlumnoEnTurno = {
    alumno: Alumno;
    isRecuperacion: boolean;
    liberadaSemana?: boolean;
    liberacionId?: string;
    recuperacionId?: string;
    usaCredito?: boolean;
    aPrueba?: boolean;
  };
  const buscarLiberacionSemana = (turnoId: string, alumnoId: string, semana = semanaVista) =>
    liberacionesSemana.find((item) => item.turnoId === turnoId && item.alumnoId === alumnoId && item.semana === semana);

  const contarOcupacionTurno = (items: AlumnoEnTurno[]) =>
    items.filter((item) => item.isRecuperacion || !item.liberadaSemana).length;

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
      .map((a) => {
        const liberacion = buscarLiberacionSemana(turno.id, a.id);
        const ins = inscripciones.find((i) => i.turnoId === turno.id && i.alumnoId === a.id);
        const act = actividades.find((x) => x.id === a.actividadId);
        const actividadNombrePrueba = act?.nombre?.trim().toLowerCase() === 'prueba';
        return {
          alumno: a,
          isRecuperacion: false,
          liberadaSemana: !!liberacion,
          liberacionId: liberacion?.id,
          aPrueba: !!ins?.aPrueba || actividadNombrePrueba,
        };
      });
    const recs: AlumnoEnTurno[] = recuperaciones
      .filter(r => r.turnoId === turno.id)
      .map(r => {
        const a = alumnos.find(x => x.id === r.alumnoId);
        return a ? { alumno: a, isRecuperacion: true, recuperacionId: r.id, usaCredito: r.usaCredito } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return [...regulares, ...recs];
  };

  const getActividadDelAlumno = (alumnoId: string) => {
    const alumno = alumnos.find((a) => a.id === alumnoId);
    if (!alumno?.actividadId) return undefined;
    return actividades.find((a) => a.id === alumno.actividadId);
  };

  const getClasesUsadasSemanaAlumno = (alumnoId: string) => {
    const clasesFijas = turnos.filter((t) => {
      if (!t.alumnoIds.includes(alumnoId)) return false;
      const ins = inscripciones.find((i) => i.turnoId === t.id && i.alumnoId === alumnoId);
      if (ins && ins.semanaDesde > semanaVista) return false;
      return !buscarLiberacionSemana(t.id, alumnoId);
    }).length;
    const clasesRecuperacion = recuperaciones.filter((r) => r.alumnoId === alumnoId && r.semana === semanaVista).length;
    return clasesFijas + clasesRecuperacion;
  };

  const abrirModalCompartirDisponibles = () => {
    setFormCompartirDisponibles({
      diasSeleccionados: [],
      horaDesde: '',
      horaHasta: '',
      mostrarLugares: true,
    });
    setMensajeDisponibles('');
    setShowModalCompartirDisponibles(true);
  };

  const toggleDiaCompartir = (dia: number) => {
    setFormCompartirDisponibles((prev) => {
      const yaEsta = prev.diasSeleccionados.includes(dia);
      return {
        ...prev,
        diasSeleccionados: yaEsta
          ? prev.diasSeleccionados.filter((d) => d !== dia)
          : [...prev.diasSeleccionados, dia].sort((a, b) => a - b),
      };
    });
  };

  const generarMensajeTurnosDisponibles = async () => {
    const { diasSeleccionados, horaDesde, horaHasta, mostrarLugares } = formCompartirDisponibles;
    if (diasSeleccionados.length === 0) {
      toast.warning('Elegí al menos un día para generar el mensaje.');
      return;
    }
    if (horaDesde && horaHasta && horaHasta < horaDesde) {
      toast.warning('La hora hasta no puede ser anterior a la hora desde.');
      return;
    }

    setGenerandoDisponibles(true);
    try {
      const lineasPorDia = diasSeleccionados.map((diaSemana) => {
        const turnosDelDia = todasLasHoras
          .filter((hora) => !horaDesde || hora >= horaDesde)
          .filter((hora) => !horaHasta || hora <= horaHasta)
          .filter((hora) => isHorarioDisponibleEnDia(diaSemana, hora))
          .map((hora) => getTurnoDelDia(diaSemana, hora))
          .filter((turno): turno is Turno => turno !== undefined)
          .map((turno) => {
            const alumnasFijasVisibles = getAlumnosDelTurno(turno).filter((item) => !item.isRecuperacion && !item.liberadaSemana).length;
            const cupo = turno.cupo ?? CUPO_DEFAULT;
            const disponibles = Math.max(0, cupo - alumnasFijasVisibles);
            return {
              hora: turno.hora,
              titulo: turno.titulo?.trim() || 'Clase',
              disponibles,
            };
          })
          .filter((turno) => turno.disponibles > 0);

        return {
          diaSemana,
          turnos: turnosDelDia,
        };
      }).filter((item) => item.turnos.length > 0);

      const diasCortos = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
      const descripcionDias = diasSeleccionados.length === diasSemana.length
        ? 'Todos'
        : diasSeleccionados.map((dia) => diasCortos[dia]).join('/');
      const rangoHorario = horaDesde || horaHasta
        ? ` ${horaDesde || '00:00'}-${horaHasta || '23:59'}`
        : '';
      const encabezado = `Disponibles ${descripcionDias}${rangoHorario}`;
      const cuerpo = lineasPorDia.map(({ diaSemana, turnos }) => {
        const detalleTurnos = turnos.map((turno) =>
          mostrarLugares
            ? `${turno.hora} (${turno.disponibles})`
            : `${turno.hora}`
        );
        return `${diasCortos[diaSemana]}: ${detalleTurnos.join(' | ')}`;
      });

      const mensaje = lineasPorDia.length > 0
        ? [encabezado, ...cuerpo].join('\n').trim()
        : `${encabezado}\nSin lugares.`;

      setMensajeDisponibles(mensaje);
    } finally {
      setGenerandoDisponibles(false);
    }
  };

  const copiarMensajeDisponibles = async () => {
    if (!mensajeDisponibles.trim()) {
      toast.warning('Primero generá el mensaje.');
      return;
    }
    try {
      await navigator.clipboard.writeText(mensajeDisponibles);
      toast.success('Mensaje copiado.');
    } catch {
      toast.error('No se pudo copiar el mensaje.');
    }
  };

  const abrirWhatsAppDisponibles = () => {
    if (!mensajeDisponibles.trim()) {
      toast.warning('Primero generá el mensaje.');
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(mensajeDisponibles)}`, '_blank', 'noopener,noreferrer');
  };

  const handleAgregarAlumno = (diaSemana: number, hora: string) => {
    if (!isHorarioDisponibleEnDia(diaSemana, hora)) {
      toast.warning('Ese horario está marcado como no disponible para ese día.');
      return;
    }
    setTurnoSeleccionado({ diaSemana, hora });
    setAlumnoSeleccionado('');
    setTipoAgregarAlumno('fija');
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
      setCupoTurnoInput(String(turno.cupo ?? CUPO_DEFAULT));
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
      setCupoTurnoInput(String(CUPO_DEFAULT));
    }
    setShowModalEditarTurno(true);
  };

  const handleCerrarModal = () => {
    setShowModal(false);
    setTurnoSeleccionado(null);
    setAlumnoSeleccionado('');
    setTipoAgregarAlumno('fija');
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
      const alumnoActual = alumnos.find((a) => a.id === alumnoSeleccionado);
      if (!alumnoActual) {
        toast.warning('No se encontró el alumno seleccionado.');
        return;
      }
      const cupo = turnoExistente?.cupo ?? CUPO_DEFAULT;
      const alumnosVisiblesEnTurno = getAlumnosDelTurno(turnoExistente);
      const recsEnTurno = alumnosVisiblesEnTurno.filter((a) => a.isRecuperacion);
      const totalEnTurno = contarOcupacionTurno(alumnosVisiblesEnTurno);

      if (tipoAgregarAlumno === 'recuperar') {
        const yaRecuperacion = recsEnTurno.some((r) => r.alumno.id === alumnoSeleccionado);
        if (yaRecuperacion) {
          handleCerrarModal();
          return;
        }
        if (totalEnTurno >= cupo) {
          toast.warning('Esta clase ya tiene el cupo completo.');
          return;
        }
        const actividad = getActividadDelAlumno(alumnoSeleccionado);
        const limiteSemanal = actividad?.clasesPorSemana ?? null;
        const clasesUsadasSemana = getClasesUsadasSemanaAlumno(alumnoSeleccionado);
        const usaCredito = limiteSemanal != null && clasesUsadasSemana >= limiteSemanal;
        if (usaCredito && (alumnoActual.clasesParaRecuperar || 0) <= 0) {
          toast.warning('Este alumno no tiene clases para recuperar disponibles.');
          return;
        }
        const rec: Recuperacion = {
          id: Date.now().toString(),
          turnoId: turnoExistente?.id ?? '',
          alumnoId: alumnoSeleccionado,
          semana: semanaVista,
          usaCredito,
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
        if (usaCredito) {
          await storageHybrid.alumnos.update(alumnoSeleccionado, {
            clasesParaRecuperar: Math.max(0, (alumnoActual.clasesParaRecuperar || 0) - 1),
          });
        }
      } else {
        if (turnoExistente) {
          if (totalEnTurno >= cupo) {
            toast.warning('Esta clase ya tiene el cupo completo. Aumentá el cupo desde el ícono de editar (titulo/profesor) o desde "Aumentar cupo".');
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
              aPrueba: tipoAgregarAlumno === 'prueba',
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
            aPrueba: tipoAgregarAlumno === 'prueba',
            createdAt: new Date().toISOString(),
          });
        }
      }

      await loadTurnos();
      await loadAlumnos();
      await loadInscripciones();
      await loadRecuperaciones();
      handleCerrarModal();
    } catch (error) {
      console.error('Error guardando turno:', error);
      toast.error('Error al guardar el turno. Por favor intentá nuevamente.');
    }
  };

  const handleGuardarEdicionTurno = async () => {
    if (!turnoParaEditar) return;

    try {
      const turnoExistente = getTurnoDelDia(turnoParaEditar.diaSemana, turnoParaEditar.hora);
      const cupo = parseCupo(cupoTurnoInput, formDataTurno.cupo);
      
      if (turnoExistente) {
        await storageHybrid.turnos.update(turnoExistente.id, {
          titulo: formDataTurno.titulo,
          profesorId: formDataTurno.profesorId,
          cupo,
          destacado: formDataTurno.destacado,
        });
      } else {
        await storageHybrid.turnos.add({
          ...turnoParaEditar,
          titulo: formDataTurno.titulo,
          profesorId: formDataTurno.profesorId,
          cupo,
          destacado: formDataTurno.destacado,
        });
      }
      
      await loadTurnos();
      setShowModalEditarTurno(false);
      setTurnoParaEditar(null);
    } catch (error) {
      console.error('Error actualizando turno:', error);
      toast.error('Error al actualizar el turno. Por favor intentá nuevamente.');
    }
  };

  const handleEliminarAlumno = async (turnoId: string, alumnoId: string, recuperacionId?: string) => {
    try {
      if (recuperacionId) {
        const recuperacion = recuperaciones.find((r) => r.id === recuperacionId);
        await storageHybrid.recuperaciones.delete(recuperacionId);
        if (recuperacion?.usaCredito) {
          const alumno = alumnos.find((a) => a.id === alumnoId);
          if (alumno) {
            await storageHybrid.alumnos.update(alumnoId, {
              clasesParaRecuperar: (alumno.clasesParaRecuperar || 0) + 1,
            });
          }
        }
        await loadAlumnos();
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
      toast.error('Error al eliminar el alumno del turno. Por favor intentá nuevamente.');
    }
  };

  const handleMoverAlumno = async () => {
    if (!showPopupAlumno || !turnoDestino) return;
    if (showPopupAlumno.isRecuperacion) return; // No mover recuperaciones

    try {
      const alumnoIdMover = showPopupAlumno.alumno.id;
      const conservarPrueba = !!showPopupAlumno.aPrueba;
      // Eliminar del turno original
      await handleEliminarAlumno(showPopupAlumno.turnoId, alumnoIdMover);
      
      // Agregar al turno destino
      const turnoDestinoExistente = getTurnoDelDia(turnoDestino.diaSemana, turnoDestino.hora);
      
      if (turnoDestinoExistente) {
        // Si el turno ya existe, agregar el alumno si no está
        if (!turnoDestinoExistente.alumnoIds.includes(alumnoIdMover)) {
          await storageHybrid.turnos.update(turnoDestinoExistente.id, {
            alumnoIds: [...turnoDestinoExistente.alumnoIds, alumnoIdMover],
          });
          await storageHybrid.inscripcionesTurno.add({
            id: Date.now().toString(),
            turnoId: turnoDestinoExistente.id,
            alumnoId: alumnoIdMover,
            semanaDesde: semanaVista,
            aPrueba: conservarPrueba,
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
          alumnoIds: [alumnoIdMover],
          createdAt: new Date().toISOString(),
        };
        await storageHybrid.turnos.add(nuevoTurno);
        await storageHybrid.inscripcionesTurno.add({
          id: (Date.now() + 1).toString(),
          turnoId: nuevoTurno.id,
          alumnoId: alumnoIdMover,
          semanaDesde: semanaVista,
          aPrueba: conservarPrueba,
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
      toast.error('Error al mover el alumno. Por favor intentá nuevamente.');
    }
  };

  const handleLiberarClaseSemana = async () => {
    if (!showPopupAlumno || showPopupAlumno.isRecuperacion || showPopupAlumno.liberadaSemana) return;
    const ok = await toast.confirm(
      `¿Querés liberar el cupo semanal de ${showPopupAlumno.alumno.nombre} ${showPopupAlumno.alumno.apellido} en ${DIAS_SEMANA[showPopupAlumno.diaSemana]} ${showPopupAlumno.hora}?`,
      { title: 'Liberar cupo semanal', confirmText: 'Liberar', cancelText: 'Cancelar' }
    );
    if (!ok) return;
    try {
      setSavingLiberacionSemana(true);
      const liberacionIdLocal = `${Date.now()}`;
      await storageHybrid.liberacionesSemana.add({
        id: liberacionIdLocal,
        turnoId: showPopupAlumno.turnoId,
        alumnoId: showPopupAlumno.alumno.id,
        semana: semanaVista,
        createdAt: new Date().toISOString(),
      });
      if (!useApi()) {
        await storageHybrid.alumnos.update(showPopupAlumno.alumno.id, {
          clasesParaRecuperar: (showPopupAlumno.alumno.clasesParaRecuperar || 0) + 1,
        });
      }
      await loadLiberacionesSemana();
      await loadAlumnos();
      setShowPopupAlumno(null);
      toast.success('Se liberó el cupo de esa clase para esta semana.');
    } catch (error) {
      console.error('Error liberando clase semanal:', error);
      toast.error(error instanceof Error ? error.message : 'No se pudo liberar el cupo de esta semana.');
    } finally {
      setSavingLiberacionSemana(false);
    }
  };

  const handleCancelarLiberacionSemana = async () => {
    if (!showPopupAlumno || showPopupAlumno.isRecuperacion || !showPopupAlumno.liberadaSemana || !showPopupAlumno.liberacionId) return;
    const ok = await toast.confirm(
      `¿Querés cancelar la liberación semanal de ${showPopupAlumno.alumno.nombre} ${showPopupAlumno.alumno.apellido} para ${DIAS_SEMANA[showPopupAlumno.diaSemana]} ${showPopupAlumno.hora}?`,
      { title: 'Cancelar liberación', confirmText: 'Cancelar liberación', cancelText: 'Volver' }
    );
    if (!ok) return;
    try {
      setSavingLiberacionSemana(true);
      await storageHybrid.liberacionesSemana.delete(showPopupAlumno.liberacionId);
      if (!useApi()) {
        await storageHybrid.alumnos.update(showPopupAlumno.alumno.id, {
          clasesParaRecuperar: Math.max(0, (showPopupAlumno.alumno.clasesParaRecuperar || 0) - 1),
        });
      }
      await loadLiberacionesSemana();
      await loadAlumnos();
      setShowPopupAlumno(null);
      toast.success('La liberación de esa semana se canceló.');
    } catch (error) {
      console.error('Error cancelando liberación semanal:', error);
      toast.error(error instanceof Error ? error.message : 'No se pudo cancelar la liberación semanal.');
    } finally {
      setSavingLiberacionSemana(false);
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
      toast.error('Error al marcar el horario. Reintentá.');
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
      liberadaSemana: item.liberadaSemana,
      liberacionId: item.liberacionId,
      recuperacionId: item.recuperacionId,
      aPrueba: item.aPrueba,
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

  const getAsistenciaSemana = (turnoId: string, alumnoId: string): Asistencia | undefined => {
    return asistencias.find(
      (a) => a.turnoId === turnoId && a.alumnoId === alumnoId && a.semana === semanaVista
    );
  };

  const getEstadoAsistencia = (turnoId: string, alumnoId: string): 'asistio' | 'no_asistio' | null => {
    return getAsistenciaSemana(turnoId, alumnoId)?.estado || null;
  };

  const handleMarcarAsistencia = async (turnoId: string, alumnoId: string, estado: 'asistio' | 'no_asistio') => {
    const asistenciaExistente = getAsistenciaSemana(turnoId, alumnoId);
    const siguienteEstado = asistenciaExistente
      ? (asistenciaExistente.estado === estado ? null : estado)
      : estado;
    const alumno = alumnos.find((a) => a.id === alumnoId);
    const eraNoAsistio = asistenciaExistente?.estado === 'no_asistio';
    const seraNoAsistio = siguienteEstado === 'no_asistio';
    const teniaCreditoOtorgado = asistenciaExistente?.creditoOtorgado === true;

    if (asistenciaExistente) {
      if (asistenciaExistente.estado === estado) {
        await storageHybrid.asistencias.update(asistenciaExistente.id, {
          estado: null,
          creditoOtorgado: false,
        });
      } else {
        await storageHybrid.asistencias.update(asistenciaExistente.id, {
          estado,
          creditoOtorgado: false,
        });
      }
    } else {
      const nuevaAsistencia: Asistencia = {
        id: Date.now().toString(),
        turnoId,
        alumnoId,
        estado,
        creditoOtorgado: false,
        semana: semanaVista,
        createdAt: new Date().toISOString(),
      };
      await storageHybrid.asistencias.add(nuevaAsistencia);
    }

    if (alumno && eraNoAsistio && !seraNoAsistio && teniaCreditoOtorgado) {
      await storageHybrid.alumnos.update(alumnoId, {
        clasesParaRecuperar: Math.max(0, (alumno.clasesParaRecuperar || 0) - 1),
      });
      await loadAlumnos();
    }

    // La recuperación se mantiene para el historial de esa semana (no se elimina al confirmar asistencia)
    await loadAsistencias();
  };

  const handleToggleCreditoInasistencia = async (turnoId: string, alumnoId: string) => {
    const asistencia = getAsistenciaSemana(turnoId, alumnoId);
    const alumno = alumnos.find((a) => a.id === alumnoId);

    if (!asistencia || asistencia.estado !== 'no_asistio') {
      toast.warning('Primero marcá la inasistencia para poder dar un crédito.');
      return;
    }
    if (!alumno) {
      toast.warning('No se encontró el alumno seleccionado.');
      return;
    }

    const otorgarCredito = asistencia.creditoOtorgado !== true;
    const ok = await toast.confirm(
      otorgarCredito
        ? `¿Querés darle un crédito a ${alumno.nombre} ${alumno.apellido} por esta inasistencia?`
        : `¿Querés quitar el crédito otorgado a ${alumno.nombre} ${alumno.apellido}?`,
      {
        title: otorgarCredito ? 'Dar crédito' : 'Quitar crédito',
        confirmText: otorgarCredito ? 'Dar crédito' : 'Quitar crédito',
      }
    );
    if (!ok) return;

    await storageHybrid.asistencias.update(asistencia.id, { creditoOtorgado: otorgarCredito });
    await storageHybrid.alumnos.update(alumnoId, {
      clasesParaRecuperar: Math.max(0, (alumno.clasesParaRecuperar || 0) + (otorgarCredito ? 1 : -1)),
    });
    await loadAsistencias();
    await loadAlumnos();
    toast.success(otorgarCredito ? 'Crédito otorgado.' : 'Crédito quitado.');
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
      const horariosNoDisponiblesNormalizados = normalizarHorariosNoDisponibles(
        horariosNoDisponiblesPorDia,
        todasLasHorasModal
      );
      await storageApi.sucursal.updateHorarios({
        horaInicioManana,
        horaFinManana,
        horaInicioTarde,
        horaFinTarde,
        horariosNoDisponiblesPorDia: horariosNoDisponiblesNormalizados,
      });
      const h = await storageApi.sucursal.getHorarios();
      setHorariosManana(h.manana?.length ? h.manana : horariosManana_DEFAULT);
      setHorariosTarde(h.tarde?.length ? h.tarde : horariosTarde_DEFAULT);
      setHorariosNoDisponiblesPorDia(normalizarHorariosNoDisponibles(h.horariosNoDisponiblesPorDia, [...(h.manana || []), ...(h.tarde || [])]));
      setHorariosSaved(true);
      setTimeout(() => setHorariosSaved(false), 3000);
    } catch (err) {
      setHorariosError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setHorariosSaving(false);
    }
  };

  const handleAumentarCupo = async () => {
    const valor = parseCupo(cupoGlobalInput, cupoGlobal);
    try {
      for (const t of turnos) {
        await storageHybrid.turnos.update(t.id, { cupo: valor });
      }
      await loadTurnos();
      setShowModalAumentarCupo(false);
    } catch (e) {
      console.error(e);
      toast.error('Error al actualizar el cupo. Reintentá.');
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

  const getDiaSemanaFromFecha = (fechaIso: string) => {
    const day = new Date(`${fechaIso}T12:00:00`).getDay();
    return day === 0 ? 6 : day - 1;
  };

  const getAlumnosDelTurnoEnSemana = (
    turno: Turno | undefined,
    semana: string,
    recuperacionesSemana: Recuperacion[],
    liberacionesDeSemana: LiberacionSemana[] = liberacionesSemana
  ): AlumnoEnTurno[] => {
    if (!turno) return [];
    const regulares: AlumnoEnTurno[] = turno.alumnoIds
      .filter((id) => {
        const ins = inscripciones.find((i) => i.turnoId === turno.id && i.alumnoId === id);
        return !ins || ins.semanaDesde <= semana;
      })
      .map((id) => alumnos.find((a) => a.id === id))
      .filter((a): a is Alumno => a !== undefined)
      .map((alumno) => {
        const ins = inscripciones.find((i) => i.turnoId === turno.id && i.alumnoId === alumno.id);
        const act = actividades.find((x) => x.id === alumno.actividadId);
        const actividadNombrePrueba = act?.nombre?.trim().toLowerCase() === 'prueba';
        return {
          alumno,
          isRecuperacion: false,
          liberadaSemana: liberacionesDeSemana.some(
            (item) => item.turnoId === turno.id && item.alumnoId === alumno.id && item.semana === semana
          ),
          aPrueba: !!ins?.aPrueba || actividadNombrePrueba,
        };
      });
    const recs: AlumnoEnTurno[] = recuperacionesSemana
      .filter((r) => r.turnoId === turno.id)
      .map((r) => {
        const alumno = alumnos.find((item) => item.id === r.alumnoId);
        return alumno ? { alumno, isRecuperacion: true, recuperacionId: r.id, usaCredito: r.usaCredito } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    return [...regulares, ...recs];
  };

  const abrirModalReporte = () => {
    setReporteDesde(getFechaFromSemanaYDia(semanaVista, 0));
    setReporteHasta(getFechaFromSemanaYDia(semanaVista, 5));
    setReportePreview(null);
    setShowModalReporte(true);
  };

  const generarVistaPreviaReporte = async () => {
    if (!reporteDesde || !reporteHasta) {
      toast.warning('Elegí ambas fechas para generar el reporte.');
      return;
    }
    if (reporteDesde > reporteHasta) {
      toast.warning('La fecha desde no puede ser mayor que la fecha hasta.');
      return;
    }

    try {
      setGenerandoVistaReporte(true);
      const fechas = getFechasEntre(reporteDesde, reporteHasta).filter((fecha) => diasSemana.includes(getDiaSemanaFromFecha(fecha)));
      const semanas = Array.from(
        new Set(fechas.map((fecha) => getSemanaFromDate(new Date(`${fecha}T12:00:00`))))
      );
      const recuperacionesPorSemanaEntries = await Promise.all(
        semanas.map(async (semana) => {
          try {
            const data = await storageHybrid.recuperaciones.getBySemana(semana);
            return [semana, data] as const;
          } catch {
            return [semana, []] as const;
          }
        })
      );
      const recuperacionesPorSemana = Object.fromEntries(recuperacionesPorSemanaEntries) as Record<string, Recuperacion[]>;
      const liberacionesPorSemanaEntries = await Promise.all(
        semanas.map(async (semana) => {
          try {
            const data = await storageHybrid.liberacionesSemana.getBySemana(semana);
            return [semana, data] as const;
          } catch {
            return [semana, []] as const;
          }
        })
      );
      const liberacionesPorSemana = Object.fromEntries(liberacionesPorSemanaEntries) as Record<string, LiberacionSemana[]>;

      const dias = fechas
        .map((fecha) => {
          const diaSemana = getDiaSemanaFromFecha(fecha);
          const semana = getSemanaFromDate(new Date(`${fecha}T12:00:00`));
          const turnosDia = turnos
            .filter((turno) => turno.diaSemana === diaSemana)
            .sort((a, b) => a.hora.localeCompare(b.hora));
          const turnosReporte = turnosDia.map((turno) => {
            const alumnosTurno = getAlumnosDelTurnoEnSemana(
              turno,
              semana,
              recuperacionesPorSemana[semana] || [],
              liberacionesPorSemana[semana] || []
            );
            const recuperacionesTurno = alumnosTurno.filter((item) => item.isRecuperacion).length;
            const fijasTurno = alumnosTurno.filter((item) => !item.isRecuperacion && !item.liberadaSemana).length;
            const cupo = turno.cupo ?? CUPO_DEFAULT;
            const ocupacionTurno = contarOcupacionTurno(alumnosTurno);
            const libres = Math.max(0, cupo - ocupacionTurno);
            const profesor = turno.profesorId
              ? profesores.find((item) => item.id === turno.profesorId)
              : null;
            return {
              id: `${fecha}-${turno.id}`,
              fecha,
              diaSemana,
              diaLabel: DIAS_SEMANA[diaSemana],
              hora: turno.hora,
              titulo: turno.titulo?.trim() || 'Clase',
              profesor: profesor ? `${profesor.nombre} ${profesor.apellido}` : 'Sin profesor',
              cupo,
              ocupacion: ocupacionTurno,
              fijas: fijasTurno,
              recuperaciones: recuperacionesTurno,
              libres,
              llena: ocupacionTurno >= cupo,
            };
          });
          return {
            fecha,
            titulo: `${DIAS_SEMANA[diaSemana]} ${formatDate(fecha)}`,
            turnos: turnosReporte,
          };
        })
        .filter((dia) => dia.turnos.length > 0);

      const turnosReporte = dias.flatMap((dia) => dia.turnos);
      setReportePreview({
        desde: reporteDesde,
        hasta: reporteHasta,
        totalClases: turnosReporte.length,
        totalFijas: turnosReporte.reduce((acc, item) => acc + item.fijas, 0),
        totalRecuperaciones: turnosReporte.reduce((acc, item) => acc + item.recuperaciones, 0),
        totalLlenas: turnosReporte.filter((item) => item.llena).length,
        totalLibres: turnosReporte.reduce((acc, item) => acc + item.libres, 0),
        dias,
      });
    } catch (error) {
      console.error('Error generando vista previa del reporte:', error);
      toast.error('No se pudo generar la vista previa.');
    } finally {
      setGenerandoVistaReporte(false);
    }
  };

  const crearDocumentoReporte = async (reporte: ReporteVistaPrevia) => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const marginX = 14;
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = doc.internal.pageSize.getWidth() - marginX * 2;
    let y = 16;

    const addLine = (
      text: string,
      opts?: { bold?: boolean; size?: number; gapBefore?: number; color?: [number, number, number] }
    ) => {
      if (opts?.gapBefore) y += opts.gapBefore;
      doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
      doc.setFontSize(opts?.size || 11);
      doc.setTextColor(...(opts?.color || [31, 41, 55]));
      const lines = doc.splitTextToSize(text, maxWidth);
      const blockHeight = lines.length * ((opts?.size || 11) * 0.38 + 1.5);
      if (y + blockHeight > pageHeight - 12) {
        doc.addPage();
        y = 16;
      }
      doc.text(lines, marginX, y);
      y += blockHeight;
      doc.setTextColor(31, 41, 55);
    };

    addLine('Reporte de clases', { bold: true, size: 18 });
    addLine(`${formatDate(reporte.desde)} al ${formatDate(reporte.hasta)}`, { size: 11 });
    addLine(
      `Clases: ${reporte.totalClases} | Fijas: ${reporte.totalFijas} | Recuperaciones: ${reporte.totalRecuperaciones}`,
      { gapBefore: 4 }
    );
    addLine(`Lugares libres: ${reporte.totalLibres} | Llenas: ${reporte.totalLlenas}`);

    reporte.dias.forEach((dia) => {
      addLine(dia.titulo, { bold: true, size: 13, gapBefore: 5 });
      dia.turnos.forEach((turno) => {
        addLine(
          `${turno.hora} - ${turno.titulo} | ${turno.ocupacion}/${turno.cupo} | Fijas ${turno.fijas} | Rec ${turno.recuperaciones} | Libres ${turno.libres}`,
          { size: 10, color: turno.llena ? [220, 38, 38] : [31, 41, 55] }
        );
        addLine(`Prof: ${turno.profesor}`, { size: 9 });
      });
    });

    return doc;
  };

  const descargarReportePDF = async () => {
    if (!reportePreview) {
      toast.warning('Primero generá la vista previa del reporte.');
      return;
    }
    try {
      setExportandoPdf(true);
      const doc = await crearDocumentoReporte(reportePreview);
      doc.save(`reporte-clases-${reportePreview.desde}-${reportePreview.hasta}.pdf`);
      toast.success('PDF generado.');
    } catch (error) {
      console.error('Error exportando PDF:', error);
      toast.error('No se pudo generar el PDF.');
    } finally {
      setExportandoPdf(false);
    }
  };

  const generarTextoReporteCompartible = (reporte: ReporteVistaPrevia) => {
    const lineas = [
      `Reporte ${formatDate(reporte.desde)} al ${formatDate(reporte.hasta)}`,
      `Clases: ${reporte.totalClases} | Fijas: ${reporte.totalFijas} | Rec: ${reporte.totalRecuperaciones} | Libres: ${reporte.totalLibres} | Llenas: ${reporte.totalLlenas}`,
      ...reporte.dias.map((dia) => {
        const detalle = dia.turnos
          .map((turno) => `${turno.hora} ${turno.titulo}${turno.llena ? ' [LLENA]' : ` (${turno.libres} libres)`}`)
          .join(' | ');
        return `${dia.titulo}: ${detalle}`;
      }),
    ];
    return lineas.join('\n');
  };

  const compartirReportePorWhatsApp = () => {
    if (!reportePreview) {
      toast.warning('Primero generá la vista previa del reporte.');
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(generarTextoReporteCompartible(reportePreview))}`, '_blank');
  };

  const compartirReportePorGmail = () => {
    if (!reportePreview) {
      toast.warning('Primero generá la vista previa del reporte.');
      return;
    }
    const subject = `Reporte de clases ${formatDate(reportePreview.desde)} al ${formatDate(reportePreview.hasta)}`;
    const body = generarTextoReporteCompartible(reportePreview);
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const compartirReportePDF = async () => {
    if (!reportePreview) {
      toast.warning('Primero generá la vista previa del reporte.');
      return;
    }
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      toast.warning('En este dispositivo no se puede compartir el PDF directo. Descargalo y envialo por WhatsApp o Gmail.');
      return;
    }
    try {
      setExportandoPdf(true);
      const doc = await crearDocumentoReporte(reportePreview);
      const blob = doc.output('blob');
      const file = new File([blob], `reporte-clases-${reportePreview.desde}-${reportePreview.hasta}.pdf`, {
        type: 'application/pdf',
      });
      if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
        toast.warning('Tu navegador no permite adjuntar el PDF directo. Descargalo y compartilo manualmente.');
        return;
      }
      await navigator.share({
        title: `Reporte ${formatDate(reportePreview.desde)} al ${formatDate(reportePreview.hasta)}`,
        text: 'Reporte de clases en PDF',
        files: [file],
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('Error compartiendo PDF:', error);
        toast.error('No se pudo compartir el PDF.');
      }
    } finally {
      setExportandoPdf(false);
    }
  };

  const renderAlumnoEnTurno = (item: AlumnoEnTurno, turno: Turno | undefined, diaSemana: number, hora: string) => {
    if (!turno) return null;
    const { alumno, isRecuperacion, liberadaSemana, aPrueba } = item;
    
    const estadoAsistencia = getEstadoAsistencia(turno.id, alumno.id);
    const tieneFecha = alumno.fechaVencimientoCuota && alumno.fechaVencimientoCuota.trim() !== '';
    const vencido = tieneFecha && isCuotaVencida(alumno.fechaVencimientoCuota);
    const porVencer = tieneFecha && !vencido && (isCuotaVenceHoy(alumno.fechaVencimientoCuota) || isCuotaPorVencer(alumno.fechaVencimientoCuota, 3));
    // Recuperación: amarillo; liberó: slate; a prueba: violeta; luego cuota
    let bgColor = 'bg-primary-100 text-primary-900';
    if (isRecuperacion) bgColor = 'bg-amber-200 text-amber-900 border-l-4 border-amber-500';
    else if (liberadaSemana) bgColor = 'bg-slate-200 text-slate-800 border-l-4 border-slate-500';
    else if (aPrueba) bgColor = 'bg-violet-200 text-violet-900 border-l-4 border-violet-600';
    else if (vencido) bgColor = 'bg-red-200 text-red-900 border-l-4 border-red-600';
    else if (porVencer) bgColor = 'bg-amber-100 text-amber-900 border-l-4 border-amber-500';
    
    return (
      <div
        key={isRecuperacion ? `rec-${item.recuperacionId}` : alumno.id}
        className={`${bgColor} px-2 py-1 rounded text-xs flex items-center gap-1 group/item hover:opacity-90 transition-colors cursor-pointer`}
        onClick={(e) => handleAbrirPopupAlumno(e, item, turno, diaSemana, hora)}
      >
        {isRecuperacion && <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 text-amber-700" aria-label="Recuperación" />}
        {!isRecuperacion && aPrueba && (
          <Sparkles className="w-3.5 h-3.5 flex-shrink-0 text-violet-700" aria-label="A prueba" />
        )}
        <span
          className="truncate flex-1"
          title={`${alumno.nombre} ${alumno.apellido}${isRecuperacion ? ' (recuperación)' : liberadaSemana ? ' (liberó esta semana)' : aPrueba ? ' (a prueba)' : ''}${tieneFecha ? ` — Vence: ${formatDate(alumno.fechaVencimientoCuota)}` : ' — Sin fecha de vencimiento'}`}
        >
          {alumno.nombre} {alumno.apellido}
        </span>
        {liberadaSemana && !isRecuperacion && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-700">Lib.</span>
        )}
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
          {planificacionHabilitada && (
            <p className="text-sm text-gray-600 max-w-xl">
              Podés guardar una <strong className="font-medium">nota de planificación</strong> por día (botón Nota en cada
              columna o en la vista móvil).
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
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
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <Search className="w-4 h-4 text-gray-500" />
              <input
                type="date"
                value={getFechaFromSemanaYDia(semanaVista, 0)}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    setSemanaVista(getSemanaFromDate(new Date(val)));
                  }
                }}
                className="input-field py-1.5 px-2 text-sm w-[140px]"
                title="Ir a fecha"
              />
            </label>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={abrirModalCompartirDisponibles}
            className="btn-secondary flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px]"
            title="Compartir turnos disponibles por WhatsApp"
          >
            <MessageCircle className="w-4 h-4" />
            Compartir disponibles
          </button>
          <button
            type="button"
            onClick={() => setShowModalHorarios(true)}
            className="btn-secondary flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px]"
            title="Configurar horarios de clase"
          >
            <Settings className="w-4 h-4" />
            Horarios
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
            {planificacionHabilitada && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Nota de planificación (por día)</p>
                <div className="flex flex-wrap gap-1.5">
                  {diasSemana.map((diaIndex) => {
                    const f = getFechaFromSemanaYDia(semanaVista, diaIndex);
                    const mark = !!notasPlanifPorFecha[f]?.trim();
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => abrirModalNotaPlanif(f)}
                        className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium touch-manipulation ${
                          mark ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}
                      >
                        <StickyNote className="w-3.5 h-3.5" />
                        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][diaIndex]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
                      const ocupacionTurno = contarOcupacionTurno(alumnosTurno);
                      const lleno = ocupacionTurno >= cupo;
                      const destacado = turno?.destacado ?? false;
                      const horarioDisponible = isHorarioDisponibleEnDia(diaIndex, hora);
                      return (
                        <div
                          key={hora}
                          className={`border rounded-xl p-3 ${
                            !horarioDisponible
                              ? 'border-slate-300 bg-slate-100'
                              : destacado
                                ? 'border-amber-300 bg-amber-100'
                                : 'border-gray-200 bg-gray-50/80'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="font-semibold text-gray-900">{hora}</span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => horarioDisponible && handleToggleDestacado(diaIndex, hora)}
                                disabled={!horarioDisponible}
                                className={`p-2 rounded-lg touch-manipulation ${destacado ? 'bg-amber-500 text-amber-950' : 'bg-gray-200 text-gray-600'} disabled:opacity-40`}
                                title={destacado ? 'Quitar destacado' : 'Destacar horario importante'}
                              >
                                <Star className={`w-4 h-4 ${destacado ? 'fill-current' : ''}`} />
                              </button>
                              <button
                                type="button"
                                onClick={() => horarioDisponible && handleEditarTurno(diaIndex, hora)}
                                disabled={!horarioDisponible}
                                className="p-2 rounded-lg bg-purple-600 text-white touch-manipulation disabled:opacity-40"
                                title="Editar título y profesor"
                              >
                                <GraduationCap className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => !lleno && horarioDisponible && handleAgregarAlumno(diaIndex, hora)}
                                disabled={lleno || !horarioDisponible}
                                className="p-2 rounded-lg bg-primary-600 text-white disabled:opacity-50 touch-manipulation"
                                title={!horarioDisponible ? 'Horario no disponible' : lleno ? 'Clase llena' : 'Agregar alumno'}
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {!horarioDisponible && (
                            <p className="text-xs font-medium text-slate-600 mb-2">Horario no disponible</p>
                          )}
                          {turno && (
                            <div className="mb-2 text-sm">
                              {turno.titulo && <p className="font-medium text-gray-800">{turno.titulo}</p>}
                              {profesor && <p className="text-gray-600">Prof: {profesor.nombre} {profesor.apellido}</p>}
                              <p className={`flex items-center gap-1 ${lleno ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                                <Users className="w-4 h-4" />
                                {ocupacionTurno}/{cupo} alumnos
                              </p>
                            </div>
                          )}
                          <div className="space-y-1.5">
                            {alumnosTurno.map((alumno) => renderAlumnoEnTurno(alumno, turno, diaIndex, hora))}
                          </div>
                          {horarioDisponible && !lleno && ocupacionTurno === 0 && (
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
                      const ocupacionTurno = contarOcupacionTurno(alumnosTurno);
                      const lleno = ocupacionTurno >= cupo;
                      const destacado = turno?.destacado ?? false;
                      const horarioDisponible = isHorarioDisponibleEnDia(diaIndex, hora);
                      return (
                        <div
                          key={hora}
                          className={`border rounded-xl p-3 ${
                            !horarioDisponible
                              ? 'border-slate-300 bg-slate-100'
                              : destacado
                                ? 'border-amber-300 bg-amber-100'
                                : 'border-gray-200 bg-gray-50/80'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="font-semibold text-gray-900">{hora}</span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => horarioDisponible && handleToggleDestacado(diaIndex, hora)}
                                disabled={!horarioDisponible}
                                className={`p-2 rounded-lg touch-manipulation ${destacado ? 'bg-amber-500 text-amber-950' : 'bg-gray-200 text-gray-600'} disabled:opacity-40`}
                                title={destacado ? 'Quitar destacado' : 'Destacar horario importante'}
                              >
                                <Star className={`w-4 h-4 ${destacado ? 'fill-current' : ''}`} />
                              </button>
                              <button
                                type="button"
                                onClick={() => horarioDisponible && handleEditarTurno(diaIndex, hora)}
                                disabled={!horarioDisponible}
                                className="p-2 rounded-lg bg-purple-600 text-white touch-manipulation disabled:opacity-40"
                                title="Editar título y profesor"
                              >
                                <GraduationCap className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => !lleno && horarioDisponible && handleAgregarAlumno(diaIndex, hora)}
                                disabled={lleno || !horarioDisponible}
                                className="p-2 rounded-lg bg-primary-600 text-white disabled:opacity-50 touch-manipulation"
                                title={!horarioDisponible ? 'Horario no disponible' : lleno ? 'Clase llena' : 'Agregar alumno'}
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {!horarioDisponible && (
                            <p className="text-xs font-medium text-slate-600 mb-2">Horario no disponible</p>
                          )}
                          {turno && (
                            <div className="mb-2 text-sm">
                              {turno.titulo && <p className="font-medium text-gray-800">{turno.titulo}</p>}
                              {profesor && <p className="text-gray-600">Prof: {profesor.nombre} {profesor.apellido}</p>}
                              <p className={`flex items-center gap-1 ${lleno ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                                <Users className="w-4 h-4" />
                                {ocupacionTurno}/{cupo} alumnos
                              </p>
                            </div>
                          )}
                          <div className="space-y-1.5">
                            {alumnosTurno.map((alumno) => renderAlumnoEnTurno(alumno, turno, diaIndex, hora))}
                          </div>
                          {horarioDisponible && !lleno && ocupacionTurno === 0 && (
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
                {diasSemana.map((diaIndex) => {
                  const fechaCol = getFechaFromSemanaYDia(semanaVista, diaIndex);
                  const tieneNota = !!notasPlanifPorFecha[fechaCol]?.trim();
                  return (
                    <div
                      key={diaIndex}
                      className="p-2 sm:p-3 text-center font-semibold border-r border-gray-200 last:border-r-0 text-gray-700 min-w-[72px]"
                    >
                      <div className="text-xs sm:text-sm uppercase">{DIAS_SEMANA[diaIndex]}</div>
                      <div className="text-[10px] text-gray-500 font-normal mt-0.5">{formatDate(fechaCol)}</div>
                      {planificacionHabilitada && (
                        <button
                          type="button"
                          onClick={() => abrirModalNotaPlanif(fechaCol)}
                          className={`mt-1 inline-flex items-center justify-center gap-0.5 rounded-lg px-1.5 py-1 text-[10px] sm:text-[11px] font-medium w-full max-w-[104px] mx-auto leading-tight ${
                            tieneNota
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent'
                          }`}
                          title="Nota de planificación del día"
                        >
                          <StickyNote className="w-3 h-3 shrink-0" />
                          {tieneNota ? 'Ver nota' : 'Nota'}
                        </button>
                      )}
                    </div>
                  );
                })}
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
                      const cupo = turno?.cupo ?? CUPO_DEFAULT;
                      const ocupacionTurno = contarOcupacionTurno(alumnosTurno);
                      const lleno = ocupacionTurno >= cupo;
                      const destacado = turno?.destacado ?? false;
                      const horarioDisponible = isHorarioDisponibleEnDia(diaIndex, hora);
                      return (
                        <div
                          key={`${diaIndex}-${hora}`}
                          className={`p-2 min-h-[72px] sm:min-h-[80px] min-w-[72px] border-r border-gray-200 last:border-r-0 relative group ${
                            !horarioDisponible ? 'bg-slate-100' : destacado ? 'bg-amber-100' : 'hover:bg-gray-50'
                          }`}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); if (horarioDisponible) handleEditarTurno(diaIndex, hora); }}
                            disabled={!horarioDisponible}
                            className="absolute top-1 left-1 w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-purple-600 hover:bg-purple-700 rounded text-white z-20 disabled:opacity-40"
                            title={horarioDisponible ? 'Editar título y profesor' : 'Horario no disponible'}
                          >
                            <GraduationCap className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (horarioDisponible) handleToggleDestacado(diaIndex, hora); }}
                            disabled={!horarioDisponible}
                            className={`absolute top-1 right-9 sm:right-8 w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity rounded z-20 touch-manipulation ${destacado ? 'bg-amber-500 text-amber-950' : 'bg-gray-200 text-gray-600 hover:bg-amber-200 hover:text-amber-700'} disabled:opacity-40`}
                            title={!horarioDisponible ? 'Horario no disponible' : destacado ? 'Quitar destacado' : 'Destacar horario importante'}
                          >
                            <Star className={`w-4 h-4 ${destacado ? 'fill-current' : ''}`} />
                          </button>
                          {!horarioDisponible && !turno && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="text-[11px] font-medium text-slate-500">No disponible</span>
                            </div>
                          )}
                          {turno && (
                            <div className="mb-1 sm:mb-2 pb-1 sm:pb-2 border-b border-gray-200">
                              {turno.titulo && <div className="text-xs font-semibold text-gray-700 mb-0.5 truncate">{turno.titulo}</div>}
                              {profesor && <div className="text-xs text-gray-600 truncate">Prof: {profesor.nombre} {profesor.apellido}</div>}
                              <div className={`text-xs flex items-center gap-1 mt-0.5 ${lleno ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                                <Users className="w-3.5 h-3.5 flex-shrink-0" />
                                {ocupacionTurno}/{cupo}
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
                            const lleno = ocupacionTurno >= cupo;
                            return (
                              <button
                                onClick={() => !lleno && horarioDisponible && handleAgregarAlumno(diaIndex, hora)}
                                disabled={lleno || !horarioDisponible}
                                className="absolute top-1 right-1 w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-primary-600 hover:bg-primary-700 rounded text-white z-20 disabled:opacity-50 touch-manipulation"
                                title={!horarioDisponible ? 'Horario no disponible' : lleno ? 'Clase llena' : 'Agregar alumno'}
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
                      const cupo = turno?.cupo ?? CUPO_DEFAULT;
                      const ocupacionTurno = contarOcupacionTurno(alumnosTurno);
                      const lleno = ocupacionTurno >= cupo;
                      const destacado = turno?.destacado ?? false;
                      const horarioDisponible = isHorarioDisponibleEnDia(diaIndex, hora);
                      return (
                        <div
                          key={`${diaIndex}-${hora}`}
                          className={`p-2 min-h-[72px] sm:min-h-[80px] min-w-[72px] border-r border-gray-200 last:border-r-0 relative group ${
                            !horarioDisponible ? 'bg-slate-100' : destacado ? 'bg-amber-100' : 'hover:bg-gray-50'
                          }`}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); if (horarioDisponible) handleEditarTurno(diaIndex, hora); }}
                            disabled={!horarioDisponible}
                            className="absolute top-1 left-1 w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-purple-600 hover:bg-purple-700 rounded text-white z-20 disabled:opacity-40"
                            title={horarioDisponible ? 'Editar título y profesor' : 'Horario no disponible'}
                          >
                            <GraduationCap className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (horarioDisponible) handleToggleDestacado(diaIndex, hora); }}
                            disabled={!horarioDisponible}
                            className={`absolute top-1 right-9 sm:right-8 w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity rounded z-20 touch-manipulation ${destacado ? 'bg-amber-500 text-amber-950' : 'bg-gray-200 text-gray-600 hover:bg-amber-200 hover:text-amber-700'} disabled:opacity-40`}
                            title={!horarioDisponible ? 'Horario no disponible' : destacado ? 'Quitar destacado' : 'Destacar horario importante'}
                          >
                            <Star className={`w-4 h-4 ${destacado ? 'fill-current' : ''}`} />
                          </button>
                          {!horarioDisponible && !turno && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="text-[11px] font-medium text-slate-500">No disponible</span>
                            </div>
                          )}
                          {turno && (
                            <div className="mb-1 sm:mb-2 pb-1 sm:pb-2 border-b border-gray-200">
                              {turno.titulo && <div className="text-xs font-semibold text-gray-700 mb-0.5 truncate">{turno.titulo}</div>}
                              {profesor && <div className="text-xs text-gray-600 truncate">Prof: {profesor.nombre} {profesor.apellido}</div>}
                              <div className={`text-xs flex items-center gap-1 mt-0.5 ${lleno ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                                <Users className="w-3.5 h-3.5 flex-shrink-0" />
                                {ocupacionTurno}/{cupo}
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
                            const lleno = ocupacionTurno >= cupo;
                            return (
                              <button
                                onClick={() => !lleno && horarioDisponible && handleAgregarAlumno(diaIndex, hora)}
                                disabled={lleno || !horarioDisponible}
                                className="absolute top-1 right-1 w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-primary-600 hover:bg-primary-700 rounded text-white z-20 disabled:opacity-50 touch-manipulation"
                                title={!horarioDisponible ? 'Horario no disponible' : lleno ? 'Clase llena' : 'Agregar alumno'}
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
            const ok = await toast.confirm('¿Recortar todas las clases al cupo configurado? Se quitarán alumnos de las clases que tengan más del cupo (los últimos de la lista).', {
              title: 'Ajustar cupos',
              confirmText: 'Recortar',
            });
            if (!ok) return;
            try {
              const { turnosActualizados, alumnosEliminados } = await storageHybrid.turnos.ajustarCupo();
              await loadTurnos();
              toast.success(turnosActualizados === 0
                ? 'Todas las clases ya respetan el cupo.'
                : `Listo: ${turnosActualizados} clase(s) ajustadas. Se quitaron ${alumnosEliminados} alumno(s) en total.`);
            } catch (e) {
              console.error(e);
              toast.error('Error al ajustar. Reintentá.');
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
            setCupoGlobalInput(String(CUPO_DEFAULT));
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

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={abrirModalReporte}
          className="btn-secondary flex items-center justify-center gap-2 min-h-[44px] w-full sm:w-auto"
          title="Ver y exportar reporte en PDF"
        >
          <FileText className="w-4 h-4" />
          Ver reporte PDF
        </button>
      </div>

      {showModalReporte && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Reporte PDF</h2>
                <p className="text-sm text-gray-600 mt-1">Elegí un rango de fechas, revisá la vista previa y después descargalo o compartilo.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowModalReporte(false)}
                className="p-2 -m-2 text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="block text-sm font-medium text-gray-700 mb-2">Desde</span>
                  <input
                    type="date"
                    value={reporteDesde}
                    onChange={(e) => setReporteDesde(e.target.value)}
                    className="input-field"
                  />
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-gray-700 mb-2">Hasta</span>
                  <input
                    type="date"
                    value={reporteHasta}
                    onChange={(e) => setReporteHasta(e.target.value)}
                    className="input-field"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={generarVistaPreviaReporte}
                    disabled={generandoVistaReporte}
                    className="btn-primary w-full min-h-[44px] disabled:opacity-60"
                  >
                    {generandoVistaReporte ? 'Generando vista previa...' : 'Generar vista previa'}
                  </button>
                </div>
              </div>

              {reportePreview && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Clases</div>
                      <div className="text-2xl font-bold text-gray-900">{reportePreview.totalClases}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Fijas</div>
                      <div className="text-2xl font-bold text-gray-900">{reportePreview.totalFijas}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Recuperaciones</div>
                      <div className="text-2xl font-bold text-gray-900">{reportePreview.totalRecuperaciones}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Libres</div>
                      <div className="text-2xl font-bold text-gray-900">{reportePreview.totalLibres}</div>
                    </div>
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-red-500">Llenas</div>
                      <div className="text-2xl font-bold text-red-600">{reportePreview.totalLlenas}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200">
                    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                      <h3 className="font-semibold text-gray-900">Vista previa</h3>
                      <p className="text-xs text-gray-500 mt-1">Las clases llenas se muestran en rojo.</p>
                    </div>
                    <div className="max-h-[42vh] overflow-y-auto divide-y divide-gray-200">
                      {reportePreview.dias.length > 0 ? (
                        reportePreview.dias.map((dia) => (
                          <div key={dia.fecha} className="p-4">
                            <h4 className="font-semibold text-gray-900 mb-3">{dia.titulo}</h4>
                            <div className="space-y-2">
                              {dia.turnos.map((turno) => (
                                <div
                                  key={turno.id}
                                  className={`rounded-lg border p-3 ${turno.llena ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                    <div className={`font-semibold ${turno.llena ? 'text-red-600' : 'text-gray-900'}`}>
                                      {turno.hora} - {turno.titulo}
                                    </div>
                                    <div className={`text-sm ${turno.llena ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                                      {turno.ocupacion}/{turno.cupo} alumnos
                                      {turno.llena ? ' · LLENA' : ` · ${turno.libres} libres`}
                                    </div>
                                  </div>
                                  <div className="text-sm text-gray-600 mt-1">
                                    Prof: {turno.profesor} | Fijas: {turno.fijas} | Recuperaciones: {turno.recuperaciones}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-gray-500">No hay clases en el rango elegido.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                    WhatsApp y Gmail comparten el resumen. Si tu celular o navegador lo permite, también podés compartir el PDF directo.
                  </div>

                  <div className="flex flex-col sm:flex-row justify-end gap-3">
                    <button
                      type="button"
                      onClick={compartirReportePDF}
                      disabled={exportandoPdf}
                      className="btn-secondary flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-60"
                    >
                      <Share2 className="w-4 h-4" />
                      Compartir PDF
                    </button>
                    <button
                      type="button"
                      onClick={compartirReportePorWhatsApp}
                      className="btn-secondary flex items-center justify-center gap-2 min-h-[44px]"
                    >
                      <MessageCircle className="w-4 h-4" />
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={compartirReportePorGmail}
                      className="btn-secondary flex items-center justify-center gap-2 min-h-[44px]"
                    >
                      <Mail className="w-4 h-4" />
                      Gmail
                    </button>
                    <button
                      type="button"
                      onClick={descargarReportePDF}
                      disabled={exportandoPdf}
                      className="btn-primary flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-60"
                    >
                      <FileText className="w-4 h-4" />
                      {exportandoPdf ? 'Generando PDF...' : 'Descargar PDF'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {modalNotaFecha && (
        <div
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] sm:flex sm:items-center sm:justify-center sm:p-6"
          aria-hidden={false}
        >
          <div
            className="bg-white shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden border border-amber-100/90 ring-1 ring-black/5 rounded-t-3xl sm:rounded-2xl sm:relative sm:mx-auto sm:max-h-[92vh] sm:h-auto min-h-0"
            style={
              isMobile
                ? {
                    position: 'fixed',
                    left: 0,
                    right: 0,
                    zIndex: 51,
                    top: notaPlanifViewport?.top ?? 0,
                    height: notaPlanifViewport?.h ?? (typeof window !== 'undefined' ? window.innerHeight : '100dvh'),
                    maxHeight: notaPlanifViewport?.h ?? (typeof window !== 'undefined' ? window.innerHeight : '100dvh'),
                  }
                : undefined
            }
            role="dialog"
            aria-labelledby="modal-nota-planif-titulo"
            aria-modal="true"
          >
            <div className="flex-shrink-0 px-4 sm:px-8 pt-4 sm:pt-6 pb-3 sm:pb-5 bg-gradient-to-br from-amber-50 via-white to-violet-50/60 border-b border-amber-100/80">
              <div className="flex justify-between items-start gap-3 sm:gap-4">
                <div className="flex gap-3 sm:gap-4 min-w-0">
                  <div className="hidden sm:flex h-14 w-14 shrink-0 rounded-2xl bg-amber-100/90 border border-amber-200/80 items-center justify-center text-amber-900 shadow-sm">
                    <StickyNote className="w-7 h-7" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-amber-800/90 mb-0.5 sm:mb-1">
                      Planificación del día
                    </p>
                    <h2 id="modal-nota-planif-titulo" className="text-xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                      {formatDate(modalNotaFecha)}
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-600 mt-1 sm:mt-2 leading-relaxed max-w-2xl hidden sm:block">
                      Escribí series, máquinas y abreviaturas como quieras. Guardá vacío para borrar la nota de este día.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={cerrarModalNotaPlanif}
                  className="shrink-0 p-2.5 rounded-xl text-gray-500 hover:text-gray-800 hover:bg-white/80 border border-transparent hover:border-amber-200/60 transition-colors touch-manipulation"
                  aria-label="Cerrar"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col px-4 sm:px-8 py-3 sm:py-6 bg-slate-50/40 overflow-hidden">
              <label htmlFor="nota-planif-textarea" className="sr-only">
                Contenido de la nota de planificación
              </label>
              <textarea
                ref={notaPlanifTextareaRef}
                id="nota-planif-textarea"
                className="w-full flex-1 min-h-[120px] sm:min-h-[min(58vh,520px)] rounded-xl border-2 border-gray-200 bg-white px-4 py-4 sm:px-5 sm:py-5 text-base font-mono leading-relaxed text-gray-900 placeholder:text-gray-400 whitespace-pre-wrap shadow-inner focus:outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100/80 transition-shadow resize-none sm:resize-y"
                value={draftNotaTexto}
                onChange={(e) => setDraftNotaTexto(e.target.value)}
                onFocus={(e) => {
                  window.setTimeout(() => {
                    try {
                      e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    } catch {
                      /* noop */
                    }
                  }, 280);
                }}
                placeholder="Ej. oso atrás, plancha, R- estocada, T- abs, TRX escalador… (podés pegar listas largas)"
                spellCheck={false}
                autoComplete="off"
                enterKeyHint="done"
              />
            </div>

            <div className="flex-shrink-0 px-4 sm:px-8 py-3 sm:py-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-5 bg-white border-t border-gray-200/90 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 shadow-[0_-4px_24px_rgba(0,0,0,0.04)]">
              <button
                type="button"
                onClick={cerrarModalNotaPlanif}
                className="btn-secondary min-h-[48px] px-6 w-full sm:w-auto text-base touch-manipulation"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void guardarNotaPlanif()}
                disabled={guardandoNotaPlanif}
                className="btn-primary min-h-[48px] px-8 w-full sm:w-auto text-base font-semibold disabled:opacity-60 shadow-md shadow-primary-600/15 touch-manipulation"
              >
                {guardandoNotaPlanif ? 'Guardando…' : 'Guardar nota'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                <fieldset className="mt-4 space-y-2">
                  <legend className="text-sm font-medium text-gray-700 mb-2">Tipo de alta</legend>
                  <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-gray-200 p-3 has-[:checked]:border-primary-400 has-[:checked]:bg-primary-50/50">
                    <input
                      type="radio"
                      name="tipoAgregarAlumno"
                      checked={tipoAgregarAlumno === 'fija'}
                      onChange={() => setTipoAgregarAlumno('fija')}
                      className="mt-1 border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span>
                      <span className="text-sm font-medium text-gray-800 block">Clase fija</span>
                      <span className="text-xs text-gray-600">Inscripción habitual al horario.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-gray-200 p-3 has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50/60">
                    <input
                      type="radio"
                      name="tipoAgregarAlumno"
                      checked={tipoAgregarAlumno === 'recuperar'}
                      onChange={() => setTipoAgregarAlumno('recuperar')}
                      className="mt-1 border-gray-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span>
                      <span className="text-sm font-medium text-gray-800 block">Recuperar</span>
                      <span className="text-xs text-gray-600">Temporal para esta semana; desaparece al reiniciar semana.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-gray-200 p-3 has-[:checked]:border-violet-400 has-[:checked]:bg-violet-50/70">
                    <input
                      type="radio"
                      name="tipoAgregarAlumno"
                      checked={tipoAgregarAlumno === 'prueba'}
                      onChange={() => setTipoAgregarAlumno('prueba')}
                      className="mt-1 border-gray-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span>
                      <span className="text-sm font-medium text-gray-800 block">A prueba</span>
                      <span className="text-xs text-gray-600">Misma inscripción fija; en el calendario se muestra en violeta.</span>
                    </span>
                  </label>
                </fieldset>
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
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold text-gray-800">Horarios no disponibles por día</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        Marcá los horarios que no existen ese día. Esos casilleros se verán grisados en el calendario.
                      </p>
                    </div>
                    {todasLasHorasModal.length === 0 ? (
                      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Ajustá primero al menos un rango de mañana o tarde.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {diasSemana.map((dia) => (
                          <div key={dia}>
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <span className="text-sm font-medium text-gray-700">{DIAS_SEMANA[dia]}</span>
                              <button
                                type="button"
                                onClick={() => setHorariosNoDisponiblesPorDia((prev) => ({ ...prev, [dia]: [] }))}
                                className="text-xs text-gray-500 hover:underline"
                              >
                                Limpiar
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {todasLasHorasModal.map((hora) => {
                                const deshabilitado = (horariosNoDisponiblesPorDia[dia] || []).includes(hora);
                                return (
                                  <button
                                    key={`${dia}-${hora}`}
                                    type="button"
                                    onClick={() => toggleHorarioNoDisponible(dia, hora)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                      deshabilitado
                                        ? 'bg-slate-200 text-slate-700 border-slate-300'
                                        : 'bg-white text-gray-700 border-gray-300 hover:border-primary-300'
                                    }`}
                                  >
                                    {hora}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
                  value={cupoTurnoInput}
                  onChange={(e) => {
                    setCupoTurnoInput(e.target.value);
                    if (e.target.value !== '') {
                      setFormDataTurno({ ...formDataTurno, cupo: parseCupo(e.target.value, formDataTurno.cupo) });
                    }
                  }}
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
                value={cupoGlobalInput}
                onChange={(e) => {
                  setCupoGlobalInput(e.target.value);
                  if (e.target.value !== '') {
                    setCupoGlobal(parseCupo(e.target.value, cupoGlobal));
                  }
                }}
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

      {showModalCompartirDisponibles && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Compartir turnos disponibles</h2>
                <p className="text-sm text-gray-600 mt-1">Elegí días y horario para armar un mensaje listo para WhatsApp.</p>
                <p className="text-xs text-amber-700 mt-1">Las recuperaciones no se cuentan como ocupación en este mensaje.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowModalCompartirDisponibles(false)}
                className="p-2 -m-2 text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <label className="block text-sm font-medium text-gray-700">Días</label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setFormCompartirDisponibles((prev) => ({ ...prev, diasSeleccionados: diasSemana }))}
                      className="text-sm text-primary-600 hover:underline"
                    >
                      Todos los días
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormCompartirDisponibles((prev) => ({ ...prev, diasSeleccionados: [] }))}
                      className="text-sm text-gray-500 hover:underline"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {diasSemana.map((dia) => {
                    const activo = formCompartirDisponibles.diasSeleccionados.includes(dia);
                    return (
                      <button
                        key={dia}
                        type="button"
                        onClick={() => toggleDiaCompartir(dia)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          activo
                            ? 'bg-primary-600 text-white border-primary-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-primary-300'
                        }`}
                      >
                        {DIAS_SEMANA[dia]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Hora desde</label>
                  <select
                    value={formCompartirDisponibles.horaDesde}
                    onChange={(e) => setFormCompartirDisponibles((prev) => ({ ...prev, horaDesde: e.target.value }))}
                    className="input-field"
                  >
                    <option value="">Cualquier hora</option>
                    {todasLasHoras.map((hora) => (
                      <option key={hora} value={hora}>{hora}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Hora hasta</label>
                  <select
                    value={formCompartirDisponibles.horaHasta}
                    onChange={(e) => setFormCompartirDisponibles((prev) => ({ ...prev, horaHasta: e.target.value }))}
                    className="input-field"
                  >
                    <option value="">Cualquier hora</option>
                    {todasLasHoras.map((hora) => (
                      <option key={hora} value={hora}>{hora}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Mostrar en el mensaje</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFormCompartirDisponibles((prev) => ({ ...prev, mostrarLugares: true }))}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      formCompartirDisponibles.mostrarLugares
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-primary-300'
                    }`}
                  >
                    Con lugares
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormCompartirDisponibles((prev) => ({ ...prev, mostrarLugares: false }))}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      !formCompartirDisponibles.mostrarLugares
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-primary-300'
                    }`}
                  >
                    Sin lugares
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={generarMensajeTurnosDisponibles}
                  disabled={generandoDisponibles}
                  className="btn-primary min-h-[44px]"
                >
                  {generandoDisponibles ? 'Generando...' : 'Generar mensaje'}
                </button>
                <button
                  type="button"
                  onClick={copiarMensajeDisponibles}
                  className="btn-secondary min-h-[44px]"
                >
                  Copiar mensaje
                </button>
                <button
                  type="button"
                  onClick={abrirWhatsAppDisponibles}
                  className="btn-secondary min-h-[44px]"
                >
                  Abrir WhatsApp
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Vista previa</label>
                <textarea
                  value={mensajeDisponibles}
                  readOnly
                  rows={12}
                  className="input-field min-h-[260px] resize-y"
                  placeholder="Acá va a aparecer el mensaje para compartir."
                />
              </div>
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
              {!showPopupAlumno.isRecuperacion && showPopupAlumno.aPrueba && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-200 text-violet-900">
                  <Sparkles className="w-3 h-3" />
                  A prueba
                </span>
              )}
              {showPopupAlumno.liberadaSemana && !showPopupAlumno.isRecuperacion && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-800">
                  Liberó esta semana
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600">DNI: {showPopupAlumno.alumno.dni}</p>
            <p className="text-xs text-gray-500 mt-1">
              Turno actual: {DIAS_SEMANA[showPopupAlumno.diaSemana]} {showPopupAlumno.hora}
            </p>
            {showPopupAlumno.liberadaSemana && !showPopupAlumno.isRecuperacion && (
              <p className="text-xs text-slate-600 mt-1">
                La liberación impacta solo esta semana; su clase fija sigue activa para las próximas.
              </p>
            )}
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
                  const asistenciaActual = getAsistenciaSemana(showPopupAlumno.turnoId, showPopupAlumno.alumno.id);
                  const estadoAsistencia = asistenciaActual?.estado || null;
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
              {(() => {
                const asistenciaActual = getAsistenciaSemana(showPopupAlumno.turnoId, showPopupAlumno.alumno.id);
                if (asistenciaActual?.estado !== 'no_asistio') return null;
                const creditoOtorgado = asistenciaActual.creditoOtorgado === true;
                return (
                  <>
                    <div className={`px-3 py-2 rounded-lg text-xs font-medium ${creditoOtorgado ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                      {creditoOtorgado ? 'Esta inasistencia ya tiene un crédito otorgado.' : 'Esta inasistencia no otorga crédito automáticamente.'}
                    </div>
                    <button
                      onClick={() => handleToggleCreditoInasistencia(showPopupAlumno.turnoId, showPopupAlumno.alumno.id)}
                      className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-sm transition-colors ${
                        creditoOtorgado
                          ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                          : 'bg-primary-600 text-white hover:bg-primary-700'
                      }`}
                    >
                      {creditoOtorgado ? 'Quitar crédito' : 'Dar crédito'}
                    </button>
                  </>
                );
              })()}
              {!showPopupAlumno.isRecuperacion && !showPopupAlumno.liberadaSemana && (
                <button
                  onClick={handleLiberarClaseSemana}
                  disabled={savingLiberacionSemana}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-sm transition-colors bg-amber-100 text-amber-900 hover:bg-amber-200 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  {savingLiberacionSemana ? 'Liberando...' : 'Liberar cupo esta semana'}
                </button>
              )}
              {!showPopupAlumno.isRecuperacion && showPopupAlumno.liberadaSemana && (
                <button
                  onClick={handleCancelarLiberacionSemana}
                  disabled={savingLiberacionSemana}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-sm transition-colors bg-emerald-100 text-emerald-900 hover:bg-emerald-200 disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" />
                  {savingLiberacionSemana ? 'Restaurando...' : 'Cancelar liberación semanal'}
                </button>
              )}
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
                onClick={async () => {
                  const msg = showPopupAlumno.isRecuperacion
                    ? `¿Quitar a ${showPopupAlumno.alumno.nombre} ${showPopupAlumno.alumno.apellido} de esta recuperación?`
                    : `¿Estás seguro de que querés eliminar a ${showPopupAlumno.alumno.nombre} ${showPopupAlumno.alumno.apellido} de este turno?`;
                  const ok = await toast.confirm(msg, {
                    title: showPopupAlumno.isRecuperacion ? 'Quitar recuperación' : 'Eliminar del turno',
                    confirmText: showPopupAlumno.isRecuperacion ? 'Quitar' : 'Eliminar',
                  });
                  if (ok) {
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
