import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Edit, Trash2, X, Save, CreditCard, FileText, MessageCircle, History, Link2, Calendar } from 'lucide-react';
import { Alumno, Pago, MetodoPago, Actividad, AsistenciaHistorialItem } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { storage } from '../utils/storage';
import { storageHybrid } from '../utils/storage-hybrid';
import { formatDate, isCuotaVencida, isCuotaVenceHoy, calcularFechaVencimiento } from '../utils/date';
import { formatCurrency } from '../utils/format';

/** Normaliza teléfono para WhatsApp (Argentina: 54 9 área número). Devuelve null si no hay número válido. */
function normalizePhoneForWhatsApp(telefono: string): string | null {
  if (!telefono || !telefono.trim()) return null;
  let digits = telefono.replace(/\D/g, '');
  if (digits.startsWith('15') && digits.length === 12) digits = digits.slice(2);
  if (digits.length < 8) return null;
  let num = digits;
  if (!num.startsWith('54')) num = '54' + num;
  if (num.startsWith('54') && num.length >= 11 && num[2] !== '9') num = '549' + num.slice(2);
  return num.length >= 12 ? num : null;
}

/** Arma mensaje de recordatorio por WhatsApp según estado de cuota. nombreLugar = sucursal/estudio (ej. Savia). */
function getWhatsAppRecordatorio(alumno: Alumno, nombreLugar: string = ''): { url: string | null; tooltip: string } {
  const nombre = [alumno.nombre, alumno.apellido].filter(Boolean).join(' ') || 'Hola';
  const phone = normalizePhoneForWhatsApp(alumno.telefono || '');
  const tieneFecha = alumno.fechaVencimientoCuota && alumno.fechaVencimientoCuota.trim() !== '';
  const vencida = tieneFecha && isCuotaVencida(alumno.fechaVencimientoCuota);
  const venceHoy = tieneFecha && isCuotaVenceHoy(alumno.fechaVencimientoCuota);
  const fechaStr = tieneFecha ? formatDate(alumno.fechaVencimientoCuota) : '';
  const marca = nombreLugar.trim() || 'Savia';

  const cierre = '\n\nMuchas gracias por confiar en nosotras! Te vemos la próxima clase 🫶🏼';

  let text = '';
  if (vencida) {
    text = tieneFecha
      ? `Hola ${nombre}! Este es un mensaje automático de ${marca}, te recordamos que tu cuota venció el día ${fechaStr}.${cierre}`
      : `Hola ${nombre}! Este es un mensaje automático de ${marca}, te recordamos que tu cuota está vencida.${cierre}`;
  } else if (venceHoy) {
    text = `Hola ${nombre}! Este es un mensaje automático de ${marca}, te recordamos que tu cuota vence hoy.${cierre}`;
  } else if (tieneFecha) {
    text = `Hola ${nombre}! Este es un mensaje automático de ${marca}, te recordamos que tu cuota vence el día ${fechaStr}.${cierre}`;
  } else {
    text = `Hola ${nombre}! Este es un mensaje automático de ${marca}, te recordamos que tenés pendiente el pago de la cuota.${cierre}`;
  }

  const tooltip = vencida
    ? 'Recordatorio por WhatsApp (cuota vencida)'
    : venceHoy
    ? 'Recordatorio por WhatsApp (vence hoy)'
    : tieneFecha
    ? `Recordatorio por WhatsApp (vence ${fechaStr})`
    : 'Recordatorio por WhatsApp (pendiente de pago)';

  if (!phone) return { url: null, tooltip: 'Agregá teléfono al alumno para enviar por WhatsApp' };
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  return { url, tooltip };
}

const Alumnos = () => {
  const { sucursalNombre } = useAuth();
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [alumnosFiltrados, setAlumnosFiltrados] = useState<Alumno[]>([]);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [filtroVencimiento, setFiltroVencimiento] = useState<'todos' | 'mes-vencido' | 'vence-hoy'>('todos');
  const [ordenarPorVencimientoCercano, setOrdenarPorVencimientoCercano] = useState(false);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showModalPago, setShowModalPago] = useState(false);
  const [showModalDescripcion, setShowModalDescripcion] = useState(false);
  const [alumnoDescripcion, setAlumnoDescripcion] = useState<Alumno | null>(null);
  const [textoDescripcion, setTextoDescripcion] = useState('');
  const [editingAlumno, setEditingAlumno] = useState<Alumno | null>(null);
  const [alumnoParaPagar, setAlumnoParaPagar] = useState<Alumno | null>(null);
  const [showModalHistorial, setShowModalHistorial] = useState(false);
  const [alumnoHistorial, setAlumnoHistorial] = useState<Alumno | null>(null);
  const [historialPagos, setHistorialPagos] = useState<Pago[]>([]);
  const [historialAsistencias, setHistorialAsistencias] = useState<AsistenciaHistorialItem[]>([]);
  const [historialAsistenciasLoading, setHistorialAsistenciasLoading] = useState(false);
  /** IDs de alumnos que tienen al menos un pago (para no mostrar "Al día" si nunca pagó) */
  const [alumnoIdsConPago, setAlumnoIdsConPago] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    telefono: '',
    email: '',
    fechaVencimientoCuota: '',
    actividadId: '',
    descripcion: '',
  });
  const [formDataPago, setFormDataPago] = useState({
    monto: '',
    metodoPago: 'efectivo' as MetodoPago,
    fecha: new Date().toISOString().split('T')[0],
    fechaVencimiento: '',
  });

  const refNombre = useRef<HTMLInputElement>(null);
  const refApellido = useRef<HTMLInputElement>(null);
  const refDni = useRef<HTMLInputElement>(null);
  const refTelefono = useRef<HTMLInputElement>(null);
  const refEmail = useRef<HTMLInputElement>(null);
  const refActividad = useRef<HTMLSelectElement>(null);
  const refDescripcion = useRef<HTMLTextAreaElement>(null);
  const refFecha = useRef<HTMLInputElement>(null);

  const focusNext = (e: React.KeyboardEvent, next: React.RefObject<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      next.current?.focus();
    }
  };

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const fn = () => setIsMobile(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Filtrar por búsqueda
    let filtrados = alumnos;
    if (filtroBusqueda.trim()) {
      const busqueda = filtroBusqueda.toLowerCase().trim();
      filtrados = alumnos.filter(alumno =>
        alumno.nombre.toLowerCase().includes(busqueda) ||
        alumno.apellido.toLowerCase().includes(busqueda) ||
        alumno.dni.includes(busqueda) ||
        `${alumno.nombre} ${alumno.apellido}`.toLowerCase().includes(busqueda)
      );
    }
    // Filtrar por vencimiento
    if (filtroVencimiento === 'mes-vencido') {
      filtrados = filtrados.filter(alumno =>
        alumno.fechaVencimientoCuota && alumno.fechaVencimientoCuota !== '' && isCuotaVencida(alumno.fechaVencimientoCuota)
      );
    } else if (filtroVencimiento === 'vence-hoy') {
      filtrados = filtrados.filter(alumno =>
        alumno.fechaVencimientoCuota && alumno.fechaVencimientoCuota !== '' && isCuotaVenceHoy(alumno.fechaVencimientoCuota)
      );
    }
    setAlumnosFiltrados(filtrados);
  }, [filtroBusqueda, filtroVencimiento, alumnos]);

  // Ordenar por apellido y luego nombre (alfabético); si "por vencimiento cercano" está activo, filtrar y ordenar por fecha
  const alumnosAMostrar = useMemo(() => {
    const porApellidoNombre = [...alumnosFiltrados].sort((a, b) => {
      const apA = (a.apellido || '').toLowerCase().trim();
      const apB = (b.apellido || '').toLowerCase().trim();
      const cmpAp = apA.localeCompare(apB, 'es');
      if (cmpAp !== 0) return cmpAp;
      const nA = (a.nombre || '').toLowerCase().trim();
      const nB = (b.nombre || '').toLowerCase().trim();
      return nA.localeCompare(nB, 'es');
    });
    if (!ordenarPorVencimientoCercano) return porApellidoNombre;
    const sinVencidos = porApellidoNombre.filter(
      (a) => !a.fechaVencimientoCuota || a.fechaVencimientoCuota === '' || !isCuotaVencida(a.fechaVencimientoCuota)
    );
    return [...sinVencidos].sort((a, b) => {
      const fa = a.fechaVencimientoCuota && a.fechaVencimientoCuota !== '' ? a.fechaVencimientoCuota : '9999-12-31';
      const fb = b.fechaVencimientoCuota && b.fechaVencimientoCuota !== '' ? b.fechaVencimientoCuota : '9999-12-31';
      return fa.localeCompare(fb);
    });
  }, [alumnosFiltrados, ordenarPorVencimientoCercano]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [alumnosData, actividadesData, pagosData] = await Promise.all([
        storageHybrid.alumnos.getAll(),
        storageHybrid.actividades.getAll(),
        storageHybrid.pagos.getAll().catch(() => [] as Pago[]),
      ]);
      setAlumnos(alumnosData);
      setAlumnosFiltrados(alumnosData);
      setActividades(actividadesData);
      const ids = new Set<string>();
      pagosData.forEach((p) => { if (p.alumnoId) ids.add(p.alumnoId); });
      setAlumnoIdsConPago(ids);
    } catch (error) {
      console.error('Error loading data:', error);
      const alumnosLocal = storage.alumnos.getAll();
      setAlumnos(alumnosLocal);
      setAlumnosFiltrados(alumnosLocal);
      setActividades(storage.actividades.getAll());
      try {
        const pagosLocal = storage.pagos.getAll();
        const ids = new Set<string>();
        pagosLocal.forEach((p: Pago) => { if (p.alumnoId) ids.add(p.alumnoId); });
        setAlumnoIdsConPago(ids);
      } catch {
        setAlumnoIdsConPago(new Set());
      }
    } finally {
      setLoading(false);
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


  const resetForm = () => {
    setFormData({
      nombre: '',
      apellido: '',
      dni: '',
      telefono: '',
      email: '',
      fechaVencimientoCuota: '',
      actividadId: '',
      descripcion: '',
    });
    setEditingAlumno(null);
  };

  const handleOpenModal = (alumno?: Alumno) => {
    if (alumno) {
      setEditingAlumno(alumno);
      setFormData({
        nombre: alumno.nombre,
        apellido: alumno.apellido,
        dni: alumno.dni,
        telefono: alumno.telefono,
        email: alumno.email,
        fechaVencimientoCuota: alumno.fechaVencimientoCuota,
        actividadId: alumno.actividadId,
        descripcion: alumno.descripcion ?? '',
      });
    } else {
      // Para nuevo alumno, dejar sin fecha de vencimiento (pendiente de pago)
      setFormData({
        nombre: '',
        apellido: '',
        dni: '',
        telefono: '',
        email: '',
        fechaVencimientoCuota: '', // Sin fecha hasta que se pague
        actividadId: '',
        descripcion: '',
      });
      setEditingAlumno(null);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingAlumno) {
        // Si es edición, usar la fecha que se ingresó o calcularla
        const fechaVencimiento = formData.fechaVencimientoCuota || calcularFechaVencimiento(new Date().toISOString().split('T')[0]);
        await storageHybrid.alumnos.update(editingAlumno.id, {
          ...formData,
          fechaVencimientoCuota: fechaVencimiento,
          descripcion: formData.descripcion ?? '',
        });
      } else {
        // Crear nuevo alumno sin fecha de vencimiento (pendiente de pago)
        const nuevoAlumno: Alumno = {
          id: Date.now().toString(),
          ...formData,
          fechaVencimientoCuota: '', // Sin fecha hasta que se pague
          clasesAsistidas: 0, // Iniciar contador en 0
          descripcion: formData.descripcion ?? '',
          createdAt: new Date().toISOString(),
        };
        await storageHybrid.alumnos.add(nuevoAlumno);
      }
      
      await loadAlumnos();
      handleCloseModal();
    } catch (error: unknown) {
      console.error('Error saving alumno:', error);
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('Ya existe un alumno con este DNI') || msg.includes('409')) {
        alert('Ya existe un alumno con este DNI. Revisá la lista o usá otro DNI.');
      } else {
        alert('Error al guardar el alumno. Por favor intentá nuevamente.');
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de que querés eliminar este alumno?')) {
      try {
        await storageHybrid.alumnos.delete(id);
        await loadAlumnos();
      } catch (error) {
        console.error('Error deleting alumno:', error);
        alert('Error al eliminar el alumno. Por favor intentá nuevamente.');
      }
    }
  };

  const handlePagarCuota = (alumno: Alumno) => {
    setAlumnoParaPagar(alumno);
    const actividad = actividades.find(a => a.id === alumno.actividadId);
    const fechaPago = new Date().toISOString().split('T')[0];
    const fechaVencimientoCalculada = calcularFechaVencimiento(fechaPago);
    setFormDataPago({
      monto: actividad ? actividad.precio.toString() : '',
      metodoPago: 'efectivo',
      fecha: fechaPago,
      fechaVencimiento: fechaVencimientoCalculada,
    });
    setShowModalPago(true);
  };

  const handleCerrarModalPago = () => {
    setShowModalPago(false);
    setAlumnoParaPagar(null);
    setFormDataPago({
      monto: '',
      metodoPago: 'efectivo',
      fecha: new Date().toISOString().split('T')[0],
      fechaVencimiento: '',
    });
  };

  const handleSubmitPago = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!alumnoParaPagar) return;

    const monto = parseFloat(formDataPago.monto);
    if (isNaN(monto) || monto <= 0) {
      alert('El monto debe ser un número válido mayor a 0');
      return;
    }

    try {
      // Usar la fecha de vencimiento del formulario (puede ser editada o calculada automáticamente)
      const nuevaFechaVencimiento = formDataPago.fechaVencimiento || calcularFechaVencimiento(formDataPago.fecha);

      // Crear el pago
      const nuevoPago: Pago = {
        id: Date.now().toString(),
        alumnoId: alumnoParaPagar.id,
        monto: monto,
        metodoPago: formDataPago.metodoPago,
        fecha: formDataPago.fecha,
        createdAt: new Date().toISOString(),
      };

      // Guardar el pago
      await storageHybrid.pagos.add(nuevoPago);

      // Actualizar la fecha de vencimiento del alumno y reiniciar contador de clases
      await storageHybrid.alumnos.update(alumnoParaPagar.id, {
        fechaVencimientoCuota: nuevaFechaVencimiento,
        clasesAsistidas: 0, // Reiniciar contador al pagar
      });

      await loadAlumnos();
      setAlumnoIdsConPago((prev) => new Set(prev).add(alumnoParaPagar.id));
      handleCerrarModalPago();
      alert('Pago registrado exitosamente. La fecha de vencimiento se actualizó automáticamente.');
    } catch (error) {
      console.error('Error saving pago:', error);
      alert('Error al registrar el pago. Por favor intentá nuevamente.');
    }
  };

  const getActividadNombre = (actividadId: string) => {
    const actividad = actividades.find(a => a.id === actividadId);
    return actividad ? actividad.nombre : 'Sin actividad';
  };

  const getActividadPrecio = (actividadId: string) => {
    const actividad = actividades.find(a => a.id === actividadId);
    return actividad ? actividad.precio : 0;
  };

  const handleOpenDescripcion = (alumno: Alumno) => {
    setAlumnoDescripcion(alumno);
    setTextoDescripcion(alumno.descripcion ?? '');
    setShowModalDescripcion(true);
  };

  const handleOpenHistorial = async (alumno: Alumno) => {
    setAlumnoHistorial(alumno);
    setShowModalHistorial(true);
    setHistorialAsistencias([]);
    try {
      const todos = await storageHybrid.pagos.getAll();
      const delAlumno = todos
        .filter((p) => p.alumnoId === alumno.id)
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      setHistorialPagos(delAlumno);
    } catch {
      const todos = storage.pagos.getAll();
      const delAlumno = todos
        .filter((p) => p.alumnoId === alumno.id)
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      setHistorialPagos(delAlumno);
    }
    setHistorialAsistenciasLoading(true);
    try {
      const asis = await storageHybrid.alumnos.getAsistencias(alumno.id);
      setHistorialAsistencias(asis);
    } catch {
      setHistorialAsistencias([]);
    } finally {
      setHistorialAsistenciasLoading(false);
    }
  };

  const handleCopiarLinkClases = async (alumno: Alumno) => {
    let token = alumno.linkToken?.trim();
    if (!token) {
      token = `${alumno.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      try {
        await storageHybrid.alumnos.update(alumno.id, { linkToken: token });
        setAlumnos((prev) => prev.map((a) => (a.id === alumno.id ? { ...a, linkToken: token } : a)));
        setAlumnosFiltrados((prev) => prev.map((a) => (a.id === alumno.id ? { ...a, linkToken: token } : a)));
      } catch (e) {
        console.error(e);
        alert('No se pudo generar el link. ¿Estás conectado al servidor?');
        return;
      }
    }
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/mi-clase?token=${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      alert('Link copiado. Enviale este link al alumno para que pueda sumarse o liberar cupo en las clases.');
    } catch {
      prompt('Copiá este link y envialo al alumno:', url);
    }
  };

  const handleGuardarDescripcion = async () => {
    if (!alumnoDescripcion) return;
    try {
      await storageHybrid.alumnos.update(alumnoDescripcion.id, { descripcion: textoDescripcion });
      setAlumnos(prev => prev.map(a => a.id === alumnoDescripcion.id ? { ...a, descripcion: textoDescripcion } : a));
      setAlumnosFiltrados(prev => prev.map(a => a.id === alumnoDescripcion.id ? { ...a, descripcion: textoDescripcion } : a));
      setShowModalDescripcion(false);
      setAlumnoDescripcion(null);
    } catch (e) {
      console.error(e);
      alert('Error al guardar la descripción.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 sm:mb-8">
        <div className="page-title-wrap">
          <span className="page-title-accent" aria-hidden />
          <h1 className="page-title">Alumnos</h1>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px]"
        >
          <Plus className="w-5 h-5" />
          Nuevo Alumno
        </button>
      </div>

      {/* Búsqueda y filtros por vencimiento */}
      <div className="mb-6">
        <div className="card">
          <div className="flex flex-wrap gap-3 items-center">
            <input
              type="text"
              value={filtroBusqueda}
              onChange={(e) => setFiltroBusqueda(e.target.value)}
              placeholder="Buscar por nombre, apellido o DNI..."
              className="input-field flex-1 min-w-0 sm:min-w-[200px]"
            />
            {filtroBusqueda && (
              <button
                onClick={() => setFiltroBusqueda('')}
                className="btn-secondary"
              >
                Limpiar
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200 items-center">
            <span className="text-sm text-gray-500 w-full sm:w-auto">Vencimiento:</span>
            <button
              type="button"
              onClick={() => setFiltroVencimiento('todos')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filtroVencimiento === 'todos'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFiltroVencimiento('mes-vencido')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filtroVencimiento === 'mes-vencido'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Mes vencido
            </button>
            <button
              type="button"
              onClick={() => setFiltroVencimiento('vence-hoy')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filtroVencimiento === 'vence-hoy'
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Se vencen hoy
            </button>
            <button
              type="button"
              onClick={() => setOrdenarPorVencimientoCercano((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                ordenarPorVencimientoCercano
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title="Ordenar por vencimiento más cercano (los vencidos no se muestran)"
            >
              Por vencimiento cercano
            </button>
          </div>
          {(filtroBusqueda || filtroVencimiento !== 'todos' || ordenarPorVencimientoCercano) && (
            <p className="text-sm text-gray-500 mt-2">
              Mostrando {alumnosAMostrar.length} de {alumnos.length} alumnos
              {ordenarPorVencimientoCercano && alumnosAMostrar.length < alumnosFiltrados.length && ' (sin vencidos)'}
            </p>
          )}
        </div>
      </div>

      {alumnosAMostrar.length === 0 && alumnos.length > 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">
            No hay alumnos que coincidan con el filtro{filtroVencimiento !== 'todos' ? ' de vencimiento' : ''}.
          </p>
          <button
            onClick={() => { setFiltroBusqueda(''); setFiltroVencimiento('todos'); setOrdenarPorVencimientoCercano(false); }}
            className="btn-secondary"
          >
            Ver todos
          </button>
        </div>
      ) : alumnos.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No hay alumnos registrados aún</p>
          <button onClick={() => handleOpenModal()} className="btn-primary">
            Agregar primer alumno
          </button>
        </div>
      ) : isMobile ? (
        /* Vista móvil: tarjetas por alumno, todo entra en pantalla */
        <div className="space-y-3">
          {alumnosAMostrar.map((alumno) => {
            const tienePagos = alumnoIdsConPago.has(alumno.id);
            const tieneFechaVencimiento = alumno.fechaVencimientoCuota && alumno.fechaVencimientoCuota !== '';
            const vencida = tieneFechaVencimiento ? isCuotaVencida(alumno.fechaVencimientoCuota) : false;
            const venceHoy = tieneFechaVencimiento ? isCuotaVenceHoy(alumno.fechaVencimientoCuota) : false;
            const estado = !tienePagos ? 'pendiente' : !tieneFechaVencimiento ? 'pendiente' : vencida ? 'vencida' : venceHoy ? 'venceHoy' : 'alDia';
            return (
              <div key={alumno.id} className="card p-4 border border-gray-200">
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-base">
                      {[alumno.apellido, alumno.nombre].filter(Boolean).join(', ') || '—'}
                    </h3>
                    <p className="text-sm text-gray-500">DNI {alumno.dni}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {(() => {
                      const wa = getWhatsAppRecordatorio(alumno, sucursalNombre || '');
                      return wa.url ? (
                        <a href={wa.url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-green-600 hover:bg-green-50 touch-manipulation" title={wa.tooltip} aria-label="Recordatorio WhatsApp"><MessageCircle className="w-5 h-5" /></a>
                      ) : (
                        <span className="p-2 rounded-lg text-gray-300 cursor-not-allowed" title={wa.tooltip}><MessageCircle className="w-5 h-5" /></span>
                      );
                    })()}
                    <button onClick={() => handlePagarCuota(alumno)} className="p-2 rounded-lg text-green-600 hover:bg-green-50 touch-manipulation" title="Pagar cuota" aria-label="Pagar"><CreditCard className="w-5 h-5" /></button>
                    <button onClick={() => handleOpenDescripcion(alumno)} className={`p-2 rounded-lg touch-manipulation ${alumno.descripcion ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-400 hover:bg-gray-100'}`} title="Notas" aria-label="Notas"><FileText className="w-5 h-5" /></button>
                    <button onClick={() => handleOpenHistorial(alumno)} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 touch-manipulation" title="Historial de pagos" aria-label="Historial de pagos"><History className="w-5 h-5" /></button>
                    <button onClick={() => handleCopiarLinkClases(alumno)} className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-50 touch-manipulation" title="Link para que el alumno sume o libere cupo en clases" aria-label="Link clases"><Link2 className="w-5 h-5" /></button>
                    <button onClick={() => handleOpenModal(alumno)} className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 touch-manipulation" title="Editar" aria-label="Editar"><Edit className="w-5 h-5" /></button>
                    <button onClick={() => handleDelete(alumno.id)} className="p-2 rounded-lg text-red-600 hover:bg-red-50 touch-manipulation" title="Eliminar" aria-label="Eliminar"><Trash2 className="w-5 h-5" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Contacto: </span>
                    <span className="text-gray-900">{alumno.telefono || '—'}</span>
                    {alumno.email && <span className="text-gray-600"> · {alumno.email}</span>}
                  </div>
                  <div>
                    <span className="text-gray-500">Actividad: </span>
                    <span className="text-gray-900">{getActividadNombre(alumno.actividadId)}</span>
                    <span className="text-gray-600"> — {formatCurrency(getActividadPrecio(alumno.actividadId))}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Vencimiento: </span>
                    {estado === 'pendiente' ? (
                      <span className="text-orange-600 font-medium">Pendiente de pago</span>
                    ) : (
                      <span className={`font-medium ${estado === 'vencida' ? 'text-red-600' : estado === 'venceHoy' ? 'text-amber-600' : 'text-green-600'}`}>
                        {formatDate(alumno.fechaVencimientoCuota)}
                        {estado === 'vencida' && ' (Vencida)'}
                        {estado === 'venceHoy' && ' (Vence hoy)'}
                        {estado === 'alDia' && ' (Al día)'}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between text-gray-500 text-xs pt-1 border-t border-gray-100">
                    <span>Clases este mes: <strong className="text-primary-600">{alumno.clasesAsistidas || 0}</strong></span>
                    <span>Registro: {formatDate(alumno.createdAt.split('T')[0])}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-hidden p-0 -mx-2 sm:mx-0">
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full min-w-[800px]">
              <thead className="bg-primary-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Alumno</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">DNI</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Contacto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Actividad</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Vencimiento</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Clases</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Fecha Registro</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {alumnosAMostrar.map((alumno) => {
                  const tienePagos = alumnoIdsConPago.has(alumno.id);
                  const tieneFechaVencimiento = alumno.fechaVencimientoCuota && alumno.fechaVencimientoCuota !== '';
                  const vencida = tieneFechaVencimiento ? isCuotaVencida(alumno.fechaVencimientoCuota) : false;
                  const venceHoy = tieneFechaVencimiento ? isCuotaVenceHoy(alumno.fechaVencimientoCuota) : false;
                  const estado = !tienePagos ? 'pendiente' : !tieneFechaVencimiento ? 'pendiente' : vencida ? 'vencida' : venceHoy ? 'venceHoy' : 'alDia';
                  return (
                    <tr key={alumno.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{[alumno.apellido, alumno.nombre].filter(Boolean).join(', ') || '—'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{alumno.dni}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{alumno.telefono}</div>
                        <div className="text-sm text-gray-500">{alumno.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{getActividadNombre(alumno.actividadId)}</div>
                        <div className="text-sm text-gray-500">{formatCurrency(getActividadPrecio(alumno.actividadId))}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {estado === 'pendiente' ? (
                          <>
                            <div className="text-sm font-medium text-orange-600">Pendiente de pago</div>
                            <div className="text-xs text-orange-500">⚠️ Sin fecha de vencimiento</div>
                          </>
                        ) : (
                          <>
                            <div className={`text-sm font-medium ${estado === 'vencida' ? 'text-red-600' : estado === 'venceHoy' ? 'text-yellow-600' : 'text-green-600'}`}>
                              {formatDate(alumno.fechaVencimientoCuota)}
                            </div>
                            <div className={`text-xs ${estado === 'vencida' ? 'text-red-500' : estado === 'venceHoy' ? 'text-yellow-500' : 'text-green-500'}`}>
                              {estado === 'vencida' ? 'Vencida' : estado === 'venceHoy' ? '⚠️ Vence hoy' : 'Al día'}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-primary-600">{alumno.clasesAsistidas || 0}</div>
                        <div className="text-xs text-gray-500">este mes</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatDate(alumno.createdAt.split('T')[0])}</div>
                        <div className="text-xs text-gray-500">{new Date(alumno.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2 items-center">
                          {(() => {
                            const wa = getWhatsAppRecordatorio(alumno, sucursalNombre || '');
                            return wa.url ? (
                              <a href={wa.url} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-900 p-1 rounded" title={wa.tooltip}><MessageCircle className="w-4 h-4" /></a>
                            ) : (
                              <span className="text-gray-300 cursor-not-allowed p-1 rounded" title={wa.tooltip}><MessageCircle className="w-4 h-4" /></span>
                            );
                          })()}
                          <button onClick={() => handlePagarCuota(alumno)} className="text-green-600 hover:text-green-900 p-1 rounded" title="Pagar cuota"><CreditCard className="w-4 h-4" /></button>
                          <button onClick={() => handleOpenDescripcion(alumno)} className={`p-1 rounded ${alumno.descripcion ? 'text-amber-600 hover:text-amber-800' : 'text-gray-400 hover:text-gray-600'}`} title="Descripción / Notas"><FileText className="w-4 h-4" /></button>
                          <button onClick={() => handleOpenHistorial(alumno)} className="p-1 rounded text-gray-600 hover:text-gray-900" title="Historial de pagos"><History className="w-4 h-4" /></button>
                          <button onClick={() => handleCopiarLinkClases(alumno)} className="p-1 rounded text-indigo-600 hover:text-indigo-900" title="Link para clases (sumarse/liberar cupo)"><Link2 className="w-4 h-4" /></button>
                          <button onClick={() => handleOpenModal(alumno)} className="text-primary-600 hover:text-primary-900" title="Editar"><Edit className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(alumno.id)} className="text-red-600 hover:text-red-900" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                {editingAlumno ? 'Editar Alumno' : 'Nuevo Alumno'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 -m-2 text-gray-400 hover:text-gray-600 touch-manipulation"
                aria-label="Cerrar"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto overscroll-contain">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre
                  </label>
                  <input
                    ref={refNombre}
                    type="text"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    onKeyDown={(e) => focusNext(e, refApellido)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Apellido
                  </label>
                  <input
                    ref={refApellido}
                    type="text"
                    value={formData.apellido}
                    onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                    onKeyDown={(e) => focusNext(e, refDni)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    DNI
                  </label>
                  <input
                    ref={refDni}
                    type="text"
                    value={formData.dni}
                    onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                    onKeyDown={(e) => focusNext(e, refTelefono)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Teléfono
                  </label>
                  <input
                    ref={refTelefono}
                    type="tel"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    onKeyDown={(e) => focusNext(e, refEmail)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    ref={refEmail}
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    onKeyDown={(e) => focusNext(e, refActividad)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Actividad
                  </label>
                  <select
                    ref={refActividad}
                    value={formData.actividadId}
                    onChange={(e) => setFormData({ ...formData, actividadId: e.target.value })}
                    onKeyDown={(e) => focusNext(e, refDescripcion)}
                    className="input-field"
                  >
                    <option value="">Seleccionar actividad</option>
                    {actividades.map((act) => (
                      <option key={act.id} value={act.id}>
                        {act.nombre} - {formatCurrency(act.precio)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descripción / Notas (opcional)
                  </label>
                  <textarea
                    ref={refDescripcion}
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                    placeholder="Notas, observaciones, preferencias..."
                    className="input-field min-h-[80px] resize-y"
                    rows={3}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha Vencimiento Cuota (se puede establecer al pagar)
                  </label>
                  <input
                    ref={refFecha}
                    type="date"
                    value={formData.fechaVencimientoCuota}
                    onChange={(e) => setFormData({ ...formData, fechaVencimientoCuota: e.target.value })}
                    className="input-field"
                    disabled={!editingAlumno && !formData.fechaVencimientoCuota}
                    placeholder={editingAlumno ? '' : 'Se establecerá al registrar el primer pago'}
                  />
                  {!editingAlumno && (
                    <p className="text-xs text-gray-500 mt-1">
                      💡 La fecha de vencimiento se establecerá automáticamente cuando registres el primer pago desde el botón de pago.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  {editingAlumno ? 'Guardar Cambios' : 'Crear Alumno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModalPago && alumnoParaPagar && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
              <h2 className="text-lg sm:text-2xl font-bold text-gray-900 pr-2 truncate">
                Pago — {[alumnoParaPagar.apellido, alumnoParaPagar.nombre].filter(Boolean).join(', ')}
              </h2>
              <button
                onClick={handleCerrarModalPago}
                className="p-2 -m-2 text-gray-400 hover:text-gray-600 touch-manipulation flex-shrink-0"
                aria-label="Cerrar"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmitPago} className="p-4 sm:p-6 space-y-4 overflow-y-auto overscroll-contain">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>Alumno:</strong> {[alumnoParaPagar.apellido, alumnoParaPagar.nombre].filter(Boolean).join(', ')}
                </p>
                <p className="text-sm text-blue-800 mt-1">
                  <strong>DNI:</strong> {alumnoParaPagar.dni}
                </p>
                <p className="text-sm text-blue-800 mt-1">
                  <strong>Cuota actual vence:</strong> {formatDate(alumnoParaPagar.fechaVencimientoCuota)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Monto *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formDataPago.monto}
                  onChange={(e) => setFormDataPago({ ...formDataPago, monto: e.target.value })}
                  className="input-field"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Método de Pago *
                </label>
                <select
                  required
                  value={formDataPago.metodoPago}
                  onChange={(e) => setFormDataPago({ ...formDataPago, metodoPago: e.target.value as MetodoPago })}
                  className="input-field"
                >
                  <option value="efectivo">💵 Efectivo</option>
                  <option value="transferencia">💳 Transferencia</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha del Pago *
                </label>
                <input
                  type="date"
                  required
                  value={formDataPago.fecha}
                  onChange={(e) => {
                    const nuevaFecha = e.target.value;
                    const nuevaFechaVencimiento = calcularFechaVencimiento(nuevaFecha);
                    setFormDataPago({ 
                      ...formDataPago, 
                      fecha: nuevaFecha,
                      fechaVencimiento: nuevaFechaVencimiento
                    });
                  }}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha de Vencimiento *
                </label>
                <input
                  type="date"
                  required
                  value={formDataPago.fechaVencimiento}
                  onChange={(e) => setFormDataPago({ ...formDataPago, fechaVencimiento: e.target.value })}
                  className="input-field"
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 Se calcula automáticamente un mes después de la fecha de pago, pero podés editarla si necesitás.
                </p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <p className="text-sm text-green-800">
                  💡 <strong>Nota:</strong> La fecha de vencimiento se calcula automáticamente un mes después de la fecha del pago, pero podés editarla manualmente si lo necesitás.
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleCerrarModalPago}
                  className="btn-secondary min-h-[44px]"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex items-center gap-2 min-h-[44px]">
                  <CreditCard className="w-4 h-4" />
                  Registrar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial de pagos */}
      {showModalHistorial && alumnoHistorial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 flex items-center gap-2 min-w-0 truncate">
                <History className="w-5 h-5 text-primary-500 flex-shrink-0" />
                <span className="truncate">Historial de pagos — {[alumnoHistorial.apellido, alumnoHistorial.nombre].filter(Boolean).join(', ')}</span>
              </h2>
              <button
                type="button"
                onClick={() => { setShowModalHistorial(false); setAlumnoHistorial(null); setHistorialPagos([]); setHistorialAsistencias([]); }}
                className="p-2 -m-2 text-gray-400 hover:text-gray-600 rounded-lg touch-manipulation flex-shrink-0"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto min-h-0">
              {historialPagos.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Sin pagos registrados para este alumno.</p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {historialPagos.map((pago) => (
                      <li key={pago.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-gray-900">{formatDate(pago.fecha)}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pago.metodoPago === 'efectivo' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                            {pago.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 flex-shrink-0">{formatCurrency(pago.monto)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Total cobrado</span>
                    <span className="text-lg font-bold text-primary-600">
                      {formatCurrency(historialPagos.reduce((s, p) => s + p.monto, 0))}
                    </span>
                  </div>
                </>
              )}

              {/* Historial de asistencias */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary-500" />
                  Historial de asistencias
                </h3>
                {historialAsistenciasLoading ? (
                  <p className="text-sm text-gray-500">Cargando...</p>
                ) : historialAsistencias.length === 0 ? (
                  <p className="text-sm text-gray-500">Sin asistencias registradas.</p>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 mb-3">
                      Este mes: {(() => {
                        const now = new Date();
                        const thisYear = now.getFullYear();
                        const thisMonth = now.getMonth();
                        const inMonth = historialAsistencias.filter((a) => {
                          const d = new Date(a.fecha);
                          return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
                        });
                        const asistieron = inMonth.filter((a) => (a.estado ?? 'asistio') === 'asistio').length;
                        const noAsistieron = inMonth.filter((a) => a.estado === 'no_asistio').length;
                        return `${asistieron} asistieron${noAsistieron > 0 ? `, ${noAsistieron} no asistieron` : ''}`;
                      })()} · Total: {historialAsistencias.length} clases
                    </p>
                    <div className="space-y-4 max-h-64 overflow-y-auto">
                      {(() => {
                        const porMes = new Map<string, AsistenciaHistorialItem[]>();
                        historialAsistencias.forEach((a) => {
                          const d = new Date(a.fecha);
                          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                          if (!porMes.has(key)) porMes.set(key, []);
                          porMes.get(key)!.push(a);
                        });
                        const meses = Array.from(porMes.entries()).sort(([a], [b]) => b.localeCompare(a));
                        return meses.map(([key, items]) => {
                          const [y, m] = key.split('-').map(Number);
                          const nombreMes = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                          const diasDelMes = new Date(y, m, 0).getDate();
                          const primerDia = new Date(y, m - 1, 1).getDay();
                          const diasAsistio = new Set(items.filter((i) => (i.estado ?? 'asistio') === 'asistio').map((i) => new Date(i.fecha).getDate()));
                          const diasNoAsistio = new Set(items.filter((i) => i.estado === 'no_asistio').map((i) => new Date(i.fecha).getDate()));
                          const offset = (primerDia + 6) % 7;
                          return (
                            <div key={key} className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                              <p className="text-xs font-semibold text-gray-700 mb-2 capitalize">{nombreMes}</p>
                              <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
                                {['L', 'M', 'X', 'J', 'V', 'S'].map((d) => (
                                  <span key={d} className="text-[10px] text-gray-500 font-medium">{d}</span>
                                ))}
                                <span className="hidden" aria-hidden />
                              </div>
                              <div className="grid grid-cols-7 gap-0.5 text-center mb-2 [&>span:nth-child(7n)]:hidden">
                                {Array.from({ length: offset }, (_, i) => (
                                  <span key={`e-${i}`} />
                                ))}
                                {Array.from({ length: diasDelMes }, (_, i) => {
                                  const dia = i + 1;
                                  const asiste = diasAsistio.has(dia);
                                  const noAsiste = diasNoAsistio.has(dia) && !asiste;
                                  const itemsDia = items.filter((x) => new Date(x.fecha).getDate() === dia);
                                  const tituloAsist = itemsDia.filter((x) => (x.estado ?? 'asistio') === 'asistio').map((x) => `${x.hora} ${x.titulo}`).join(', ');
                                  const tituloNoAsist = itemsDia.filter((x) => x.estado === 'no_asistio').map((x) => `${x.hora} ${x.titulo}`).join(', ');
                                  const title = asiste ? `${dia} - Asistió: ${tituloAsist}` : noAsiste ? `${dia} - No asistió: ${tituloNoAsist}` : undefined;
                                  return (
                                    <span
                                      key={dia}
                                      className={`text-xs w-6 h-6 flex items-center justify-center rounded mx-auto ${
                                        asiste ? 'bg-green-500 text-white font-medium' : noAsiste ? 'bg-red-500 text-white font-medium' : 'text-gray-400'
                                      }`}
                                      title={title}
                                    >
                                      {dia}
                                    </span>
                                  );
                                })}
                              </div>
                              <ul className="space-y-1 text-xs">
                                {items.map((a) => (
                                  <li key={a.id} className={`flex items-center gap-2 ${(a.estado ?? 'asistio') === 'asistio' ? 'text-green-700' : 'text-red-700'}`}>
                                    <span className="shrink-0 font-medium w-20">
                                      {formatDate(a.fecha)}
                                    </span>
                                    <span className="shrink-0">{a.hora}</span>
                                    <span className="truncate">{a.titulo || 'Clase'}</span>
                                    <span className="shrink-0 text-[10px] font-medium">
                                      {(a.estado ?? 'asistio') === 'asistio' ? 'Asistió' : 'No asistió'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => { setShowModalHistorial(false); setAlumnoHistorial(null); setHistorialPagos([]); setHistorialAsistencias([]); }}
                className="btn-secondary w-full"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Descripción / Notas */}
      {showModalDescripcion && alumnoDescripcion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 flex items-center gap-2 min-w-0 truncate">
                <FileText className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="truncate">Notas — {[alumnoDescripcion.apellido, alumnoDescripcion.nombre].filter(Boolean).join(', ')}</span>
              </h2>
              <button
                type="button"
                onClick={() => { setShowModalDescripcion(false); setAlumnoDescripcion(null); }}
                className="p-2 -m-2 text-gray-400 hover:text-gray-600 rounded-lg touch-manipulation flex-shrink-0"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-sm text-gray-500 mb-2">
                Podés editar las notas acá y guardar. No hace falta abrir &quot;Editar&quot;.
              </p>
              <textarea
                value={textoDescripcion}
                onChange={(e) => setTextoDescripcion(e.target.value)}
                placeholder="Agregá notas, observaciones, preferencias..."
                className="input-field min-h-[120px] resize-y"
                rows={5}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => { setShowModalDescripcion(false); setAlumnoDescripcion(null); }}
                className="btn-secondary"
              >
                Cerrar
              </button>
              <button type="button" onClick={handleGuardarDescripcion} className="btn-primary flex items-center gap-2">
                <Save className="w-4 h-4" />
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Alumnos;

