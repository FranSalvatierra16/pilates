import { useEffect, useMemo, useState } from 'react';
import { HeartPulse, MessageCircle, Phone, Search, X } from 'lucide-react';
import FichaSaludForm from '../components/FichaSaludForm';
import { useAuth } from '../contexts/AuthContext';
import { avisosFicha, fechaVisibleFicha, normalizarFichaSalud } from '../data/fichaSalud';
import { Alumno } from '../types';
import { formatDate, hoyISO } from '../utils/date';
import { storageHybrid } from '../utils/storage-hybrid';

type Vista = 'revisar' | 'cargadas' | 'sin';

function telefonoWhatsApp(telefono: string): string | null {
  if (!telefono.trim()) return null;
  let digits = telefono.replace(/\D/g, '');
  if (digits.startsWith('15') && digits.length === 12) digits = digits.slice(2);
  if (digits.length < 8) return null;
  let num = digits;
  if (!num.startsWith('54')) num = '54' + num;
  if (num.startsWith('54') && num.length >= 11 && num[2] !== '9') num = '549' + num.slice(2);
  return num.length >= 12 ? num : null;
}

function nombreAlumno(alumno: Alumno): string {
  return [alumno.apellido, alumno.nombre].filter(Boolean).join(', ') || 'Sin nombre';
}

const FichasSalud = () => {
  const { sucursalNombre } = useAuth();
  const esSavia = /savia/i.test(sucursalNombre || '');
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<Vista>('revisar');
  const [busqueda, setBusqueda] = useState('');
  const [abierta, setAbierta] = useState<Alumno | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const data = await storageHybrid.alumnos.getAll(false);
        if (!cancel) setAlumnos(data);
      } catch {
        if (!cancel) setAlumnos([]);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return alumnos
      .map((alumno) => {
        const ficha = alumno.fichaSalud?.aceptaDeclaracion ? normalizarFichaSalud(alumno.fichaSalud) : null;
        const avisos = avisosFicha(ficha);
        return { alumno, ficha, avisos, cargada: !!ficha };
      })
      .filter((fila) => {
        if (q && !nombreAlumno(fila.alumno).toLowerCase().includes(q) && !(fila.alumno.dni || '').includes(q)) return false;
        if (vista === 'revisar') return fila.avisos.length > 0;
        if (vista === 'cargadas') return fila.cargada;
        return !fila.cargada;
      })
      .sort((a, b) => {
        if (vista === 'cargadas' && b.avisos.length !== a.avisos.length) return b.avisos.length - a.avisos.length;
        return nombreAlumno(a.alumno).localeCompare(nombreAlumno(b.alumno), 'es');
      });
  }, [alumnos, busqueda, vista]);

  const conteos = useMemo(() => {
    let cargadas = 0;
    let revisar = 0;
    for (const alumno of alumnos) {
      const completa = !!alumno.fichaSalud?.aceptaDeclaracion;
      if (!completa) continue;
      cargadas += 1;
      if (avisosFicha(normalizarFichaSalud(alumno.fichaSalud)).length > 0) revisar += 1;
    }
    return { cargadas, revisar, sin: alumnos.length - cargadas };
  }, [alumnos]);

  const fichaAbierta = abierta?.fichaSalud ? normalizarFichaSalud(abierta.fichaSalud) : null;

  return (
    <div className="pb-6">
      <div className="page-title-wrap mb-6">
        <span className="page-title-accent" aria-hidden />
        <h1 className="page-title">Fichas de salud</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <button type="button" onClick={() => setVista('revisar')} className={`card p-4 text-left ${vista === 'revisar' ? 'ring-2 ring-amber-500' : ''}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Para revisar</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{conteos.revisar}</p>
          <p className="text-sm text-gray-600">Medicación, enfermedad o algo para tener en cuenta</p>
        </button>
        <button type="button" onClick={() => setVista('cargadas')} className={`card p-4 text-left ${vista === 'cargadas' ? 'ring-2 ring-primary-500' : ''}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cargaron la ficha</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{conteos.cargadas}</p>
          <p className="text-sm text-gray-600">de {alumnos.length} alumnos activos</p>
        </button>
        <button type="button" onClick={() => setVista('sin')} className={`card p-4 text-left ${vista === 'sin' ? 'ring-2 ring-primary-500' : ''}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sin ficha</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{conteos.sin}</p>
          <p className="text-sm text-gray-600">Todavía no la completaron</p>
        </button>
      </div>

      <div className="card mb-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o DNI"
            className="input-field pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-12 text-gray-500">Cargando fichas...</div>
      ) : filas.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">
          {vista === 'revisar'
            ? 'Nadie marcó medicación, enfermedad ni otra cosa para tener en cuenta.'
            : vista === 'sin'
              ? 'Todos los alumnos activos tienen la ficha cargada.'
              : 'Todavía no hay fichas cargadas.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filas.map(({ alumno, ficha, avisos }) => (
            <button
              key={alumno.id}
              type="button"
              onClick={() => ficha && setAbierta(alumno)}
              disabled={!ficha}
              className="card w-full p-4 text-left disabled:cursor-default"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{nombreAlumno(alumno)}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {ficha
                      ? `Cargó la ficha el ${formatDate(fechaVisibleFicha(ficha, hoyISO()))}`
                      : 'Sin ficha'}
                  </p>
                </div>
                {avisos.length > 0 && (
                  <span className="shrink-0 rounded-full bg-amber-100 text-amber-900 text-xs font-semibold px-2 py-1">
                    {avisos.length} {avisos.length === 1 ? 'aviso' : 'avisos'}
                  </span>
                )}
                {ficha && avisos.length === 0 && (
                  <span className="shrink-0 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold px-2 py-1">
                    Sin avisos
                  </span>
                )}
              </div>
              {avisos.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {avisos.map((aviso) => (
                    <li key={aviso.id} className="text-sm text-amber-950 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      {aviso.texto}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          ))}
        </div>
      )}

      {abierta && fichaAbierta && (
        <div className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 ${esSavia ? 'bg-savia-ink/40' : 'bg-black/50'}`}>
          <div className={`shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border ${esSavia ? 'bg-savia-cream rounded-t-3xl sm:rounded-3xl border-savia-sandSoft font-savia' : 'bg-white rounded-t-2xl sm:rounded-xl border-gray-200'}`}>
            <div className={`flex justify-between items-center p-4 border-b ${esSavia ? 'border-savia-sandSoft' : 'border-gray-200'}`}>
              <h2 className={`text-base sm:text-lg flex items-center gap-2 min-w-0 ${esSavia ? 'font-saviaDisplay text-savia-ink' : 'font-semibold text-gray-900'}`}>
                <HeartPulse className={`w-5 h-5 shrink-0 ${esSavia ? 'text-savia-terra' : 'text-primary-600'}`} />
                <span className="truncate">{nombreAlumno(abierta)}</span>
              </h2>
              <button type="button" onClick={() => setAbierta(null)} className="p-2 -m-2 text-gray-400 hover:text-gray-600" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>
            {(() => {
              const crudo = fichaAbierta.contactoTelefono || '';
              const digitos = crudo.replace(/\D/g, '');
              if (digitos.length < 6) return null;
              const wa = telefonoWhatsApp(crudo);
              const quien = fichaAbierta.contactoNombre.trim() || 'contacto de emergencia';
              const marca = (sucursalNombre || '').trim() || 'el estudio';
              const texto = `Hola ${quien}! Te escribimos de ${marca} por ${[abierta.nombre, abierta.apellido].filter(Boolean).join(' ')}.`;
              const btn = 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold';
              return (
                <div className={`px-4 py-3 border-b ${esSavia ? 'border-savia-sandSoft bg-savia-terraSoft/40' : 'border-gray-200 bg-red-50'}`}>
                  <p className={`text-xs font-medium mb-2 truncate ${esSavia ? 'text-savia-terraDeep' : 'text-red-800'}`}>
                    Emergencia · {quien} · {crudo.trim()}
                  </p>
                  <div className="flex gap-2">
                    <a href={`tel:+${wa || digitos}`} className={`${btn} ${esSavia ? 'bg-savia-ink text-savia-cream' : 'bg-gray-800 text-white'}`}>
                      <Phone className="w-4 h-4" /> Llamar
                    </a>
                    {wa && (
                      <a href={`https://wa.me/${wa}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer" className={`${btn} bg-emerald-600 text-white`}>
                        <MessageCircle className="w-4 h-4" /> Escribir
                      </a>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="p-4 overflow-y-auto">
              <FichaSaludForm
                soloLectura
                savia={esSavia}
                ficha={fichaAbierta}
                alumno={{
                  nombre: abierta.nombre,
                  apellido: abierta.apellido,
                  telefono: abierta.telefono,
                  fechaNacimiento: abierta.fechaNacimiento,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FichasSalud;
