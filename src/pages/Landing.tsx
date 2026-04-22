import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  MessageCircle,
  RefreshCw,
  Shield,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { useToast } from '../components/ToastProvider';

const APP_NAME = import.meta.env.VITE_APP_NAME || 'FitGest';

const WHATSAPP_DIGITS =
  String(import.meta.env.VITE_WHATSAPP_NUMBER || '5492235029881').replace(/\D/g, '') || '5492235029881';

function mensajeWhatsAppPruebaGratis() {
  return [
    'Hola 👋',
    '',
    `Me interesa la *prueba gratis* de ${APP_NAME} y quiero *más información* para conocer cómo funciona.`,
    '',
    '¡Gracias!',
  ].join('\n');
}

function abrirWhatsAppPruebaGratis() {
  const text = mensajeWhatsAppPruebaGratis();
  const url = `https://wa.me/${WHATSAPP_DIGITS}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Capturas en `public/landing/` (no hace falta usar todas). */
const LANDING_IMG = {
  calendario: '/landing/calendario.png',
  alumnos: '/landing/alumnos.png',
  actividades: '/landing/actividades.png',
  agenda: '/landing/agenda.png',
  pagos: '/landing/pagos.png',
  caja: '/landing/caja.png',
  calendarioCel: '/landing/calendarioCel.jpeg',
  portalCel: '/landing/mialumnoCel1.jpeg',
  pagosCel: '/landing/pagosCel.jpeg',
  /** Menú lateral móvil (Dashboard, Calendario, Alumnos, etc.) */
  panelCel: '/landing/panelCel.png',
} as const;

function BrowserChrome({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/40 overflow-hidden ring-1 ring-white/5 ${className}`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-800/95 border-b border-white/5">
        <span className="flex gap-1.5 shrink-0" aria-hidden>
          <span className="w-2.5 h-2.5 rounded-full bg-red-400/90" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400/90" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/90" />
        </span>
        <span className="text-[10px] text-slate-500 font-mono truncate flex-1 text-center">{APP_NAME}</span>
      </div>
      <div className="bg-slate-950">{children}</div>
    </div>
  );
}

function PhoneFrame({ src, alt, label }: { src: string; alt: string; label: string }) {
  return (
    <figure className="w-[min(100%,260px)] shrink-0 mx-auto sm:mx-0">
      <div className="rounded-[2.25rem] p-2 bg-gradient-to-b from-slate-600 to-slate-900 shadow-2xl ring-1 ring-white/10">
        <div className="rounded-[1.85rem] overflow-hidden border border-black/50 bg-black">
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="w-full h-auto object-cover object-top block"
          />
        </div>
      </div>
      <figcaption className="text-center text-xs text-slate-500 mt-3 leading-snug px-1">{label}</figcaption>
    </figure>
  );
}

const ESCRITORIO_SLIDES = [
  {
    src: LANDING_IMG.calendario,
    alt: 'Calendario de turnos: semana, cupos y asistencias',
    label: 'Calendario',
    eager: true,
  },
  {
    src: LANDING_IMG.alumnos,
    alt: 'Listado de alumnos con cuotas y actividades',
    label: 'Alumnos',
    eager: false,
  },
  {
    src: LANDING_IMG.actividades,
    alt: 'Actividades y planes con precios',
    label: 'Actividades',
    eager: false,
  },
  {
    src: LANDING_IMG.pagos,
    alt: 'Pagos por alumno y método',
    label: 'Pagos',
    eager: false,
  },
  {
    src: LANDING_IMG.caja,
    alt: 'Caja y resumen de saldos',
    label: 'Caja',
    eager: false,
  },
  {
    src: LANDING_IMG.agenda,
    alt: 'Agenda con notas por día',
    label: 'Agenda',
    eager: false,
  },
] as const;

function EscritorioCarousel() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = ESCRITORIO_SLIDES.length;

  const go = useCallback((dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    setActive((a) => {
      const next = (a + dir + n) % n;
      const slide = el.querySelector<HTMLElement>(`[data-slide-index="${next}"]`);
      requestAnimationFrame(() => slide?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }));
      return next;
    });
  }, [n]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const slides = el.querySelectorAll<HTMLElement>('[data-slide-index]');
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = Number((e.target as HTMLElement).dataset.slideIndex);
          if (!Number.isNaN(i)) setActive(i);
        }
      },
      { root: el, threshold: 0.55 }
    );
    slides.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => {
      const el = scrollerRef.current;
      if (!el) return;
      setActive((a) => {
        const next = (a + 1) % n;
        const slide = el.querySelector<HTMLElement>(`[data-slide-index="${next}"]`);
        requestAnimationFrame(() => slide?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }));
        return next;
      });
    }, 6000);
    return () => window.clearInterval(t);
  }, [paused, n]);

  return (
    <div
      className="relative mb-14 sm:mb-16"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false);
      }}
    >
      <p className="text-center text-xs text-slate-500 mb-3 sm:hidden">Deslizá horizontalmente para ver más pantallas</p>

      <button
        type="button"
        aria-label="Captura anterior"
        onClick={() => go(-1)}
        className="hidden sm:flex absolute left-0 top-[42%] z-10 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-slate-950/90 text-white shadow-lg hover:bg-slate-800 transition -translate-x-1 lg:-translate-x-2"
      >
        <ChevronLeft className="w-6 h-6" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Captura siguiente"
        onClick={() => go(1)}
        className="hidden sm:flex absolute right-0 top-[42%] z-10 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-slate-950/90 text-white shadow-lg hover:bg-slate-800 transition translate-x-1 lg:translate-x-2"
      >
        <ChevronRight className="w-6 h-6" aria-hidden />
      </button>

      <div
        ref={scrollerRef}
        className="flex gap-5 sm:gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 pt-1 px-1 sm:px-12 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20"
        tabIndex={0}
        role="region"
        aria-roledescription="carrusel"
        aria-label="Capturas de escritorio de la aplicación"
      >
        {ESCRITORIO_SLIDES.map((slide, i) => (
          <div
            key={slide.label}
            data-slide-index={i}
            className="snap-center shrink-0 w-[min(100%,min(92vw,920px))] mx-auto"
          >
            <BrowserChrome>
              <img
                src={slide.src}
                alt={slide.alt}
                loading={slide.eager ? 'eager' : 'lazy'}
                decoding="async"
                className="w-full h-auto max-h-[min(72vh,580px)] object-cover object-top"
              />
            </BrowserChrome>
            <p className="text-center text-xs text-slate-500 mt-3">{slide.label} · escritorio</p>
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-2 mt-2" role="tablist" aria-label="Indicador de capturas">
        {ESCRITORIO_SLIDES.map((s, i) => (
          <button
            key={s.label}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`Ver ${s.label}`}
            onClick={() => {
              const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-slide-index="${i}"]`);
              el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
              setActive(i);
            }}
            className={`h-2 rounded-full transition-all ${
              i === active ? 'w-7 bg-primary-400' : 'w-2 bg-white/25 hover:bg-white/40'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

const highlights = [
  {
    icon: CalendarDays,
    title: 'Calendario de turnos',
    text: 'Semana a semana: cupos por clase, asistencias, alumnos fijos en cada horario. Se ven recuperaciones y liberaciones de cupo para que el equipo entienda el aula de un vistazo.',
  },
  {
    icon: Users,
    title: 'Alumnos y cuotas',
    text: 'Listado con actividad y precio, vencimiento al día o vencido, registro de pagos y recordatorios por WhatsApp sin salir del listado.',
  },
  {
    icon: BookOpen,
    title: 'Actividades y planes',
    text: 'Definí modalidades (1x, 2x, 3x por semana, prueba, etc.) con precio y límite cuando lo necesites. Cada alumno queda asociado a su plan.',
  },
  {
    icon: CreditCard,
    title: 'Pagos',
    text: 'Ingresos por efectivo o transferencia, montos y alumno, alineados con lo que ves en caja y con el historial por persona.',
  },
  {
    icon: Wallet,
    title: 'Caja',
    text: 'Saldo del período, cierres guardados, efectivo vs transferencia y neto del mes: pensado para cerrar turno con números claros.',
  },
  {
    icon: LayoutDashboard,
    title: 'Agenda del estudio',
    text: 'Notas por día en el calendario, recordatorios importantes y bloque “sin fecha” para pendientes generales del estudio.',
  },
  {
    icon: Smartphone,
    title: 'Portal “Tu clase”',
    text: 'El alumno entra con su enlace: ve sus clases fijas, puede liberar la de la semana y anotarse en otro horario para recuperar, con cupos y reglas de la sucursal.',
  },
  {
    icon: RefreshCw,
    title: 'Recuperaciones y cupos',
    text: 'Flujo pensado para liberar una clase fija, acumular recupero y tomar cupo en otro turno sin pisar la lógica del calendario.',
  },
  {
    icon: Shield,
    title: 'Multi-sucursal y finanzas',
    text: 'Cada estudio con su propia cuenta; opciones de seguridad en caja y pagos cuando la operación lo pida.',
  },
];

export default function Landing() {
  const toast = useToast();

  const handleWhatsAppPrueba = () => {
    abrirWhatsAppPruebaGratis();
    toast.success(
      'Se abrió WhatsApp. Si no ves la pestaña, permití ventanas emergentes para este sitio.'
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div
        className="absolute inset-0 bg-[url('/saviaFondo.png')] bg-cover bg-center opacity-[0.12] pointer-events-none"
        aria-hidden
      />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-900 pointer-events-none" aria-hidden />

      <header className="relative z-10 border-b border-white/10 backdrop-blur-md bg-slate-950/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/20 text-primary-300 ring-1 ring-primary-400/30">
              <Sparkles className="w-5 h-5" aria-hidden />
            </span>
            <span className="font-semibold text-lg tracking-tight truncate">{APP_NAME}</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3 shrink-0">
            <a
              href="#app"
              className="hidden md:inline-flex text-sm font-medium text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition"
            >
              La app
            </a>
            <Link
              to="/mi-clase?modo=recuperar"
              className="hidden sm:inline-flex text-sm font-medium text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition"
            >
              Soy alumno
            </Link>
            <Link
              to="/entrada"
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold px-4 py-2.5 shadow-lg shadow-primary-900/40 transition"
            >
              Entrar
              <ArrowRight className="w-4 h-4" aria-hidden />
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-12 sm:pb-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary-500/30 bg-primary-500/10 text-primary-200 text-xs font-medium px-3 py-1 mb-5">
            <Sparkles className="w-3.5 h-3.5" aria-hidden />
            Gestión para estudios de Pilates y fitness
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold tracking-tight text-white max-w-3xl leading-[1.08]">
            El escritorio donde ves turnos, alumnos, pagos y agenda en un solo lugar.
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-slate-400 max-w-2xl leading-relaxed">
            {APP_NAME} replica la forma de trabajar de tu estudio: calendario con cupos y asistencias, cuotas y cobros,
            caja con cierres, notas del día a día y un portal para que el alumno gestione su clase y sus recuperaciones.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Link
              to="/entrada"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-semibold px-6 py-3.5 text-base shadow-xl shadow-primary-900/50 transition"
            >
              Entrar al sistema
              <ArrowRight className="w-5 h-5" aria-hidden />
            </Link>
            <a
              href="#prueba-gratis"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white font-medium px-6 py-3.5 text-base transition"
            >
              Prueba gratis por WhatsApp
            </a>
          </div>
        </section>

        <section id="app" className="scroll-mt-24 border-t border-white/10 bg-gradient-to-b from-slate-900/60 to-transparent">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <div className="max-w-2xl mb-10 sm:mb-12">
              <p className="text-primary-300 text-xs font-semibold uppercase tracking-widest mb-2">Producto real</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Así se ve en el día a día</h2>
              <p className="mt-3 text-slate-400 text-sm sm:text-base leading-relaxed">
                Un vistazo al calendario, al equipo y a las finanzas — y cómo lo vive el alumno en el celular.
              </p>
            </div>

            <p className="text-center text-sm text-slate-500 mb-4 hidden sm:block">
              Deslizá con el mouse o usá las flechas; también rota solo cada pocos segundos.
            </p>
            <EscritorioCarousel />

            <div className="rounded-3xl border border-white/10 bg-slate-900/40 px-5 py-10 sm:px-10 sm:py-12">
              <h3 className="text-xl sm:text-2xl font-bold text-white text-center">También en el celular</h3>
              <p className="text-center text-sm text-slate-400 mt-2 max-w-2xl mx-auto">
                El equipo navega por el menú lateral con todos los módulos; el alumno ve la semana, su portal y los cobros con la misma claridad.
              </p>
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-12 justify-items-center max-w-[1200px] mx-auto">
                <PhoneFrame
                  src={LANDING_IMG.panelCel}
                  alt={`Menú lateral de ${APP_NAME} en el celular: Dashboard, Calendario, Alumnos, Pagos, Caja, Agenda y más`}
                  label="Menú lateral · todos los módulos"
                />
                <PhoneFrame
                  src={LANDING_IMG.calendarioCel}
                  alt="Calendario en vista móvil"
                  label="Calendario y turnos en el celu"
                />
                <PhoneFrame
                  src={LANDING_IMG.portalCel}
                  alt="Portal del alumno: mis clases y recuperar"
                  label="Portal Tu clase · recuperar o liberar"
                />
                <PhoneFrame
                  src={LANDING_IMG.pagosCel}
                  alt="Pagos en vista móvil"
                  label="Pagos y resumen donde haga falta"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-18">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">Pensado como lo usás en el estudio</h2>
              <p className="mt-3 text-slate-400 text-sm sm:text-base leading-relaxed">
                El recorrido natural: semana en el calendario, alumnos y cuotas, ingresos en Pagos y Caja, y pendientes en la Agenda.
                El alumno usa el portal para liberar una fija o recuperar en otro horario, sin pisar los cupos.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                <li className="flex gap-2">
                  <span className="text-primary-400 font-bold">·</span>
                  <span>
                    <strong className="text-white">Actividades</strong> con precios y frecuencia (1x, 2x, 3x por semana, prueba, etc.) para que cada alumno refleje su plan.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-400 font-bold">·</span>
                  <span>
                    <strong className="text-white">Pagos y Caja</strong> con efectivo y transferencia, resúmenes del período abierto y cierres guardados por fecha.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-400 font-bold">·</span>
                  <span>
                    <strong className="text-white">Agenda</strong> con notas por día (importantes o no) y sección de notas sin fecha para lo operativo del estudio.
                  </span>
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 sm:p-8">
              <h3 className="text-sm font-semibold text-primary-200 uppercase tracking-wide">Flujo típico</h3>
              <ol className="mt-4 space-y-4 text-sm text-slate-300">
                <li className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/20 text-primary-300 font-bold text-xs">
                    1
                  </span>
                  <span>
                    <strong className="text-white">Calendario</strong> — cargás turnos, ves quién va a cada hora y marcás asistencia o situaciones especiales.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/20 text-primary-300 font-bold text-xs">
                    2
                  </span>
                  <span>
                    <strong className="text-white">Alumnos</strong> — controlás cuotas, registrás cobros y contactás por WhatsApp cuando haga falta.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/20 text-primary-300 font-bold text-xs">
                    3
                  </span>
                  <span>
                    <strong className="text-white">Pagos / Caja</strong> — consolidás lo cobrado y el saldo del período; el alumno usa el portal para liberar o recuperar.
                  </span>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 bg-slate-900/35 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-18">
            <h2 className="text-2xl sm:text-3xl font-bold text-white text-center max-w-2xl mx-auto">
              Funciones que ves en la app, explicadas en la landing
            </h2>
            <p className="text-center text-slate-400 mt-2 max-w-xl mx-auto text-sm">
              Misma lógica que en tus pantallas de escritorio; acá resumida para quien llega por primera vez.
            </p>
            <ul className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
              {highlights.map(({ icon: Icon, title, text }) => (
                <li
                  key={title}
                  className="rounded-2xl border border-white/10 bg-slate-950/55 p-5 sm:p-6 hover:border-primary-500/25 hover:bg-slate-900/70 transition duration-300"
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/15 text-primary-300 mb-3">
                    <Icon className="w-5 h-5" aria-hidden />
                  </div>
                  <h3 className="text-base font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="prueba-gratis" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-18 scroll-mt-24">
          <div className="rounded-3xl border border-primary-500/25 bg-gradient-to-br from-primary-900/40 to-slate-900/80 p-8 sm:p-12">
            <div className="max-w-xl mx-auto text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-white">Tu prueba gratis y más info</h2>
              <p className="mt-3 text-slate-400 text-sm sm:text-base leading-relaxed">
                Hablamos por <strong className="text-slate-300">WhatsApp</strong>: se abre el chat con un mensaje armado para pedir la prueba gratis y detalles sobre {APP_NAME}.
                No hace falta completar formularios acá.
              </p>
            </div>
            <div className="mt-10 max-w-md mx-auto">
              <button
                type="button"
                onClick={handleWhatsAppPrueba}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-4 text-base shadow-lg shadow-emerald-950/40 transition"
              >
                <MessageCircle className="w-5 h-5 shrink-0" aria-hidden />
                Hablar por WhatsApp
                <ArrowRight className="w-5 h-5 shrink-0" aria-hidden />
              </button>
              <p className="text-center text-xs text-slate-500 leading-relaxed mt-4">
                Si no se abre la pestaña, permití ventanas emergentes para este sitio.
              </p>
            </div>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-sm">
              <Link to="/entrada" className="text-primary-300 hover:text-primary-200 font-medium hover:underline">
                Ya tengo cuenta — ir al acceso
              </Link>
              <span className="hidden sm:inline text-slate-600" aria-hidden>
                |
              </span>
              <Link to="/login" className="text-slate-400 hover:text-slate-200 hover:underline">
                Iniciar sesión
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 py-8 text-center text-xs text-slate-500">
        <p>
          © {new Date().getFullYear()} {APP_NAME}. Gestión para estudios de Pilates y fitness.
        </p>
      </footer>
    </div>
  );
}
