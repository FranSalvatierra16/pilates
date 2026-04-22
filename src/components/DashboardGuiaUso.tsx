import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  BookOpen,
  Calendar,
  CreditCard,
  DoorOpen,
  FileText,
  GraduationCap,
  Link2,
  Sparkles,
  Users,
  Wallet,
  Smartphone,
  ChevronDown,
} from 'lucide-react';

type BloqueGuia = {
  icon: LucideIcon;
  iconBg: string;
  titulo: string;
  pitch: string;
  bullets: string[];
  to: string;
  cta: string;
};

const bloques: BloqueGuia[] = [
  {
    icon: Calendar,
    iconBg: 'bg-violet-500',
    titulo: 'Calendario de turnos',
    pitch: 'El corazón del estudio: una sola vista de la semana con cupos, asistencias y recuperaciones sin hojas sueltas.',
    bullets: [
      'Creá turnos por día y hora con cupo máximo; el sistema avisa cuando se llena.',
      'Marcá asistencia con un clic: el alumno y el equipo ven el historial ordenado.',
      'Compartí por WhatsApp los lugares libres para llenar aulas sin llamadas de más.',
      'Configurá horarios de mañana y tarde para que la grilla refleje tu realidad.',
    ],
    to: '/calendario',
    cta: 'Ir al calendario',
  },
  {
    icon: Users,
    iconBg: 'bg-blue-500',
    titulo: 'Alumnos',
    pitch: 'Cada persona con su plan, cuota y contacto: menos “¿quién debía?” y más tiempo en la clase.',
    bullets: [
      'Alta y edición con actividad, vencimiento y recordatorios por WhatsApp.',
      'Ves de un vistazo cuotas al día, que vencen hoy o vencidas para cobrar con prioridad.',
      'Registrá pagos desde la ficha y mantené la relación con el alumno centralizada.',
    ],
    to: '/alumnos',
    cta: 'Ver alumnos',
  },
  {
    icon: GraduationCap,
    iconBg: 'bg-indigo-500',
    titulo: 'Profesores',
    pitch: 'Asigná quién dicta cada clase y ordená el equipo como en un estudio profesional.',
    bullets: ['Carga simple de docentes para usar en turnos y reportes.'],
    to: '/profesores',
    cta: 'Profesores',
  },
  {
    icon: BookOpen,
    iconBg: 'bg-emerald-500',
    titulo: 'Actividades y planes',
    pitch: 'Prueba, 2× semana, pack mensual: tus modalidades con precio claro para cobrar sin confusiones.',
    bullets: [
      'Definí límites de clases por semana cuando lo necesites.',
      'Cada alumno queda atado a su plan: el calendario y el portal respetan las reglas.',
    ],
    to: '/actividades',
    cta: 'Actividades',
  },
  {
    icon: DoorOpen,
    iconBg: 'bg-sky-500',
    titulo: 'Control de acceso',
    pitch: 'En recepción: DNI, estado de cuota y registro de ingreso en segundos — con asistencia del día cuando corresponde.',
    bullets: [
      'Ideal para mostrar en tablet o PC en la entrada.',
      'Menos filas y más control sin depender solo del papel.',
    ],
    to: '/acceso',
    cta: 'Abrir acceso',
  },
  {
    icon: CreditCard,
    iconBg: 'bg-teal-500',
    titulo: 'Pagos',
    pitch: 'Efectivo y transferencia con trazabilidad: lo que cobrás hoy queda alineado con la caja y con cada alumno.',
    bullets: [
      'Historial filtrable y totales del período cuando desbloqueás finanzas con PIN.',
      'Protección opcional para que solo quien corresponda vea montos sensibles.',
    ],
    to: '/pagos',
    cta: 'Ir a pagos',
  },
  {
    icon: Wallet,
    iconBg: 'bg-amber-500',
    titulo: 'Caja',
    pitch: 'Cerrá el día o el mes con números que cierran: ingresos, gastos y saldo sin Excel paralelo.',
    bullets: [
      'Misma lógica que Pagos para que no haya dos verdades.',
      'Cierres guardados para auditoría y tranquilidad del dueño.',
    ],
    to: '/caja',
    cta: 'Ver caja',
  },
  {
    icon: Bell,
    iconBg: 'bg-rose-500',
    titulo: 'Notificaciones',
    pitch: 'Cupo liberado, recuperación nueva, avisos del estudio: todo el equipo entero sin estar pegados al calendario todo el día.',
    bullets: [
      'Desde la campana del menú ves lo último; en la pantalla completa revisás el historial.',
      'Marcá leídas cuando ya tomaste acción.',
    ],
    to: '/notificaciones',
    cta: 'Notificaciones',
  },
  {
    icon: FileText,
    iconBg: 'bg-slate-600',
    titulo: 'Agenda',
    pitch: 'Notas del día a día del estudio: lo que no entra en un turno pero sí en tu operación.',
    bullets: ['Recordatorios por fecha y bloque “sin fecha” para pendientes generales.'],
    to: '/agenda',
    cta: 'Abrir agenda',
  },
  {
    icon: Link2,
    iconBg: 'bg-cyan-500',
    titulo: 'Registros por link',
    pitch: 'Compartí un enlace de inscripción y convertí interesados en alumnos sin cargar datos a mano dos veces.',
    bullets: ['Revisá quién se anotó y pasalos a alumno formal cuando cierres la venta.'],
    to: '/registros-link',
    cta: 'Registros por link',
  },
  {
    icon: Smartphone,
    iconBg: 'bg-primary-600',
    titulo: 'Portal “Tu clase” (alumnos)',
    pitch: 'El alumno gestiona su semana solo: libera cupo o se anota a recuperar sin saturar WhatsApp del estudio.',
    bullets: [
      'Compartí el enlace de Tu clase; el alumno entra con DNI.',
      'Menos ida y vuelta y más autonomía para vos y para ellos.',
    ],
    to: '/mi-clase?modo=recuperar',
    cta: 'Vista alumno (demo)',
  },
];

export default function DashboardGuiaUso() {
  return (
    <section
      id="guia-uso"
      className="mt-10 sm:mt-14 scroll-mt-28"
      aria-labelledby="guia-uso-titulo"
    >
      <div className="rounded-2xl border border-gray-200/80 bg-white shadow-sm overflow-hidden">
        <div className="relative px-5 py-8 sm:px-10 sm:py-10 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white">
          <div
            className="absolute inset-0 opacity-[0.12] pointer-events-none bg-[radial-gradient(circle_at_30%_20%,white,transparent_55%)]"
            aria-hidden
          />
          <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 text-primary-100/95 text-xs font-semibold uppercase tracking-widest mb-2">
                <Sparkles className="w-3.5 h-3.5" aria-hidden />
                Todo el sistema en un vistazo
              </p>
              <h2 id="guia-uso-titulo" className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">
                Guía del estudio: qué hace cada módulo
              </h2>
              <p className="mt-3 text-sm sm:text-base text-primary-50/95 leading-relaxed">
                No es un manual aburrido: es el mapa para que tu equipo use el sistema con confianza, cobre mejor y
                ofrezca una experiencia moderna a tus alumnos — desde el calendario hasta la caja y las notificaciones.
              </p>
            </div>
            <div className="shrink-0 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-3 text-sm text-primary-50 max-w-xs">
              <strong className="text-white block mb-1">Tip</strong>
              Desplegá cada bloque para ver beneficios concretos. Los botones te llevan directo a la pantalla.
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-100 bg-gray-50/40">
          {bloques.map((b) => {
            const Icon = b.icon;
            return (
              <details
                key={b.titulo}
                className="group bg-white open:bg-primary-50/30 transition-colors"
              >
                <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-4 sm:px-6 sm:py-5 touch-manipulation [&::-webkit-details-marker]:hidden">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${b.iconBg} text-white shadow-md`}>
                    <Icon className="w-5 h-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <span className="font-semibold text-gray-900 text-base sm:text-lg block">{b.titulo}</span>
                    <span className="text-sm text-gray-600 leading-snug block mt-0.5">{b.pitch}</span>
                  </div>
                  <ChevronDown
                    className="w-5 h-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="px-4 pb-5 sm:px-6 sm:pb-6 pt-0 sm:pl-[4.25rem]">
                  <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 leading-relaxed mb-5 marker:text-primary-500">
                    {b.bullets.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                  <Link
                    to={b.to}
                    className="inline-flex items-center justify-center rounded-xl bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 shadow-md shadow-primary-900/15 hover:bg-primary-700 transition-colors min-h-[44px]"
                  >
                    {b.cta}
                  </Link>
                </div>
              </details>
            );
          })}
        </div>

        <div className="px-5 py-4 sm:px-6 bg-gray-50 border-t border-gray-100 text-center text-xs sm:text-sm text-gray-500">
          ¿Necesitás el texto plano para imprimir? También está en{' '}
          <a href="/docs/MANUAL-USO-APP.md" className="text-primary-600 font-medium hover:underline" target="_blank" rel="noopener noreferrer">
            MANUAL-USO-APP.md
          </a>
          .
        </div>
      </div>
    </section>
  );
}
