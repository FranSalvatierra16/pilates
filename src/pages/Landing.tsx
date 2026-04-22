import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
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
  Users,
  Wallet,
  Check,
  Sparkles,
} from 'lucide-react';
import { useToast } from '../components/ToastProvider';

const APP_NAME = import.meta.env.VITE_APP_NAME || 'FitGest';

/** Días de prueba con alcance equivalente al plan Premium (producto completo). */
const PRUEBA_GRATIS_DIAS = 3;

const WHATSAPP_DIGITS =
  String(import.meta.env.VITE_WHATSAPP_NUMBER || '5492235029881').replace(/\D/g, '') || '5492235029881';

function mensajeWhatsAppPruebaGratis() {
  return [
    'Hola 👋',
    '',
    `Me interesa la *prueba gratis de ${PRUEBA_GRATIS_DIAS} días* de ${APP_NAME} con el *producto completo* (como el plan Premium: estudio + portal alumno).`,
    '',
    'Quiero coordinar el acceso y resolver dudas.',
    '',
    '¡Gracias!',
  ].join('\n');
}

function abrirWhatsAppConTexto(text: string) {
  const url = `https://wa.me/${WHATSAPP_DIGITS}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function abrirWhatsAppPruebaGratis() {
  abrirWhatsAppConTexto(mensajeWhatsAppPruebaGratis());
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
  /** Centro de notificaciones: cupos, recuperaciones, etc. */
  notificacionesCel: '/landing/notificaciones-cel.png',
} as const;

/** Logo de marca (también PWA / favicon en `public/fitgest.png`). */
const BRAND_LOGO_SRC = '/fitgest.png';

function BrandMark({
  className = '',
  size = 40,
  alt = '',
}: {
  className?: string;
  size?: number;
  /** Vacío cuando el nombre de marca va al lado (accesibilidad). */
  alt?: string;
}) {
  return (
    <img
      src={BRAND_LOGO_SRC}
      alt={alt}
      width={size}
      height={size}
      decoding="async"
      className={`shrink-0 rounded-full object-cover ring-1 ring-white/15 ${className}`}
    />
  );
}

function BrowserChrome({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl sm:rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/40 overflow-hidden ring-1 ring-white/5 ${className}`}
    >
      <div className="flex items-center gap-2 px-2.5 py-2 sm:px-3 sm:py-2.5 bg-slate-800/95 border-b border-white/5">
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
    <figure className="w-full max-w-[min(100%,280px)] shrink-0 mx-auto sm:mx-0">
      <div className="rounded-[1.85rem] sm:rounded-[2.25rem] p-1.5 sm:p-2 bg-gradient-to-b from-brand-800/90 to-slate-950 shadow-2xl ring-1 ring-white/10">
        <div className="rounded-[1.5rem] sm:rounded-[1.85rem] overflow-hidden border border-black/50 bg-black">
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="w-full h-auto object-cover object-top block"
          />
        </div>
      </div>
      <figcaption className="text-center text-[11px] sm:text-xs text-slate-400 mt-3 leading-snug px-2">
        {label}
      </figcaption>
    </figure>
  );
}

function precioArsLabel(monto: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(monto);
}

const PLANES = {
  basico: {
    nombre: 'Esencial',
    precioArs: 30_000,
    descripcion: 'Solo la parte del estudio: menos módulos y sin el portal web para alumnos.',
    items: [
      'Una sucursal',
      'Acceso al panel del equipo (no incluye portal del alumno)',
      'Calendario con cupos, asistencias, liberaciones y recuperaciones',
      'Alumnos y actividades en versión reducida',
    ],
  },
  premium: {
    nombre: 'Premium',
    precioArs: 45_000,
    descripcion: 'Estudio + alumno: todo el flujo del estudio y el portal para que cada alumno gestione su clase.',
    items: [
      'Una sucursal',
      'Panel del estudio con todas las funciones (Pagos, Caja, Agenda, notificaciones, etc.)',
      'Portal del alumno: ver clase, liberar cupo y recuperaciones desde el celular',
      'Incluye lo operativo del Esencial, con módulos y automatizaciones completas',
    ],
  },
} as const;

function mensajeWhatsAppPlanEsencial() {
  const p = PLANES.basico;
  const precio = precioArsLabel(p.precioArs);
  return [
    'Hola 👋',
    '',
    `Me interesa el *plan ${p.nombre}* de ${APP_NAME} (${precio} / mes, una sucursal, solo panel del estudio).`,
    '',
    'Quiero más información y cómo contratarlo.',
    '',
    '¡Gracias!',
  ].join('\n');
}

function mensajeWhatsAppPlanPremium() {
  const p = PLANES.premium;
  const precio = precioArsLabel(p.precioArs);
  return [
    'Hola 👋',
    '',
    `Me interesa el *plan ${p.nombre}* de ${APP_NAME} (${precio} / mes, una sucursal: estudio + portal del alumno).`,
    '',
    'Quiero más información y cómo contratarlo.',
    '',
    '¡Gracias!',
  ].join('\n');
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

/**
 * Solo mueve el scroll horizontal del carrusel (nunca `scrollIntoView`: sube toda la página).
 * En auto-avance usamos `auto` porque `smooth` + snap en iOS a veces “empuja” el scroll del documento.
 */
function scrollCarouselSlideIntoView(
  scroller: HTMLDivElement,
  index: number,
  behavior: ScrollBehavior = 'auto'
) {
  const slide = scroller.querySelector<HTMLElement>(`[data-slide-index="${index}"]`);
  if (!slide) return;
  const sRect = scroller.getBoundingClientRect();
  const slideRect = slide.getBoundingClientRect();
  const slideLeftInContent = scroller.scrollLeft + (slideRect.left - sRect.left);
  const target =
    slideLeftInContent - (scroller.clientWidth - slideRect.width) / 2;
  const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  scroller.scrollTo({ left: Math.max(0, Math.min(target, maxLeft)), behavior });
}

function viewportHeight() {
  if (typeof window === 'undefined') return 0;
  return window.visualViewport?.height ?? window.innerHeight;
}

function isDesktopCarouselAutoplay() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(min-width: 640px)').matches;
}

function EscritorioCarousel() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const resumeAfterTouchRef = useRef<number | null>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = ESCRITORIO_SLIDES.length;

  const pauseForScrollInteraction = useCallback(() => {
    if (resumeAfterTouchRef.current) {
      window.clearTimeout(resumeAfterTouchRef.current);
      resumeAfterTouchRef.current = null;
    }
    setPaused(true);
  }, []);

  const scheduleResumeAuto = useCallback(() => {
    if (resumeAfterTouchRef.current) window.clearTimeout(resumeAfterTouchRef.current);
    resumeAfterTouchRef.current = window.setTimeout(() => {
      setPaused(false);
      resumeAfterTouchRef.current = null;
    }, 6500);
  }, []);

  useEffect(
    () => () => {
      if (resumeAfterTouchRef.current) window.clearTimeout(resumeAfterTouchRef.current);
    },
    []
  );

  const go = useCallback((dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const behavior: ScrollBehavior = isDesktopCarouselAutoplay() ? 'smooth' : 'auto';
    setActive((a) => {
      const next = (a + dir + n) % n;
      requestAnimationFrame(() => scrollCarouselSlideIntoView(el, next, behavior));
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
      if (!isDesktopCarouselAutoplay()) return;
      const wrap = wrapRef.current;
      const el = scrollerRef.current;
      if (!el || !wrap) return;
      const r = wrap.getBoundingClientRect();
      const vh = viewportHeight();
      if (r.bottom < 48 || r.top > vh - 48) return;
      setActive((a) => {
        const next = (a + 1) % n;
        requestAnimationFrame(() => scrollCarouselSlideIntoView(el, next, 'auto'));
        return next;
      });
    }, 6000);
    return () => window.clearInterval(t);
  }, [paused, n]);

  return (
    <div
      ref={wrapRef}
      className="relative mb-12 sm:mb-16"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false);
      }}
    >
      <p className="text-center text-[13px] leading-snug text-slate-400 mb-3 px-2 sm:hidden">
        Deslizá el dedo para ver cada pantalla
      </p>

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
        className="flex gap-4 sm:gap-6 overflow-x-auto overscroll-x-contain overscroll-y-contain scroll-auto sm:scroll-smooth snap-x snap-mandatory touch-pan-x pb-3 pt-1 px-4 sm:px-12 scroll-ps-4 scroll-pe-4 [-webkit-overflow-scrolling:touch] [-ms-overflow-style:none] [scrollbar-width:none] sm:[scrollbar-width:thin] [&::-webkit-scrollbar]:hidden sm:[&::-webkit-scrollbar]:block sm:[&::-webkit-scrollbar]:h-1.5 sm:[&::-webkit-scrollbar-thumb]:rounded-full sm:[&::-webkit-scrollbar-thumb]:bg-white/20"
        tabIndex={-1}
        role="region"
        aria-roledescription="carrusel"
        aria-label="Capturas de escritorio de la aplicación"
        onPointerDown={pauseForScrollInteraction}
        onPointerUp={scheduleResumeAuto}
        onPointerCancel={scheduleResumeAuto}
      >
        {ESCRITORIO_SLIDES.map((slide, i) => (
          <div
            key={slide.label}
            data-slide-index={i}
            className="snap-center shrink-0 w-[min(calc(100vw-2rem),920px)] sm:w-[min(92vw,920px)] mx-auto"
          >
            <BrowserChrome>
              <img
                src={slide.src}
                alt={slide.alt}
                loading={slide.eager ? 'eager' : 'lazy'}
                decoding="async"
                className="w-full h-auto max-h-[min(48svh,420px)] sm:max-h-[min(72vh,580px)] object-cover object-top"
              />
            </BrowserChrome>
            <p className="text-center text-[11px] sm:text-xs text-slate-500 mt-2.5 sm:mt-3">
              {slide.label} · escritorio
            </p>
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-2 mt-3 sm:mt-2" role="tablist" aria-label="Indicador de capturas">
        {ESCRITORIO_SLIDES.map((s, i) => (
          <button
            key={s.label}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`Ver ${s.label}`}
            onClick={() => {
              const el = scrollerRef.current;
              if (!el) return;
              scrollCarouselSlideIntoView(el, i, isDesktopCarouselAutoplay() ? 'smooth' : 'auto');
              setActive(i);
            }}
            className="p-2 -m-0.5 touch-manipulation rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
          >
            <span
              className={`block h-2 rounded-full transition-all ${
                i === active ? 'w-7 bg-brand-400' : 'w-2 bg-white/25'
              }`}
            />
          </button>
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
    icon: Bell,
    title: 'Notificaciones en el celular',
    text: 'Recibí avisos de cupo liberado, nuevas recuperaciones y movimientos del estudio en el centro de notificaciones del teléfono, como cualquier app que usás a diario.',
  },
  {
    icon: Shield,
    title: 'Finanzas y seguridad',
    text: 'Cada estudio con su propia cuenta; opciones de seguridad en caja y pagos cuando la operación lo pida.',
  },
];

export default function Landing() {
  const toast = useToast();

  const toastWhatsAppAbierto = () => {
    toast.success(
      'Se abrió WhatsApp. Si no ves la pestaña, permití ventanas emergentes para este sitio.'
    );
  };

  const handleWhatsAppPrueba = () => {
    abrirWhatsAppPruebaGratis();
    toastWhatsAppAbierto();
  };

  const handleWhatsAppPlanEsencial = () => {
    abrirWhatsAppConTexto(mensajeWhatsAppPlanEsencial());
    toastWhatsAppAbierto();
  };

  const handleWhatsAppPlanPremium = () => {
    abrirWhatsAppConTexto(mensajeWhatsAppPlanPremium());
    toastWhatsAppAbierto();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        className="absolute inset-0 bg-[url('/saviaFondo.png')] bg-cover bg-center opacity-[0.12] pointer-events-none"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-slate-950 via-emerald-950/35 to-slate-900 pointer-events-none"
        aria-hidden
      />

      <header className="sticky top-0 z-20 border-b border-white/10 backdrop-blur-lg bg-slate-950/90 pt-[max(0.25rem,env(safe-area-inset-top))]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <Link to="/" className="flex items-center gap-2.5 sm:gap-3 min-w-0 group shrink-0">
              <BrandMark size={38} className="shadow-lg shadow-black/30 ring-white/20 group-hover:ring-brand-400/40 transition" />
              <span className="font-semibold text-base sm:text-lg tracking-tight truncate text-white">
                {APP_NAME}
              </span>
            </Link>
            <nav className="flex flex-wrap w-full sm:w-auto items-center justify-end gap-2 sm:gap-3 sm:shrink-0">
              <a
                href="#app"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xs sm:text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white px-3 transition touch-manipulation sm:border-transparent sm:bg-transparent sm:hover:bg-white/5 sm:px-3"
              >
                La app
              </a>
              <a
                href="#planes"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xs sm:text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white px-3 transition touch-manipulation sm:border-transparent sm:bg-transparent sm:hover:bg-white/5 sm:px-3"
              >
                Planes
              </a>
              <a
                href="#prueba-gratis"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-accent-500/35 bg-accent-600/15 hover:bg-accent-600/25 text-accent-50 text-xs sm:text-sm font-semibold px-3 transition touch-manipulation"
              >
                Prueba gratis
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-10 sm:pt-20 sm:pb-16">
          <p className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-brand-500/35 bg-brand-900/50 text-brand-100 text-[11px] sm:text-xs font-medium px-3 py-1.5 mb-4 sm:mb-5 sm:justify-start">
            <BrandMark size={22} className="ring-brand-400/40" />
            <span className="text-left leading-snug">Gestión para estudios de Pilates y fitness</span>
          </p>
          <h1 className="text-[1.65rem] leading-[1.12] sm:text-4xl sm:leading-tight lg:text-[3.25rem] font-bold tracking-tight text-white max-w-3xl text-balance">
            El escritorio donde ves turnos, alumnos, pagos y agenda en un solo lugar.
          </h1>
          <p className="mt-4 sm:mt-5 text-base sm:text-xl text-slate-400 max-w-2xl leading-relaxed">
            {APP_NAME} replica la forma de trabajar de tu estudio: calendario con cupos y asistencias, cuotas y cobros,
            caja con cierres, notas del día a día y un portal para que el alumno gestione su clase y sus recuperaciones.
          </p>
          <div className="mt-6 sm:mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <a
              href="#planes"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white font-semibold px-5 sm:px-6 py-3.5 text-[15px] sm:text-base shadow-xl shadow-brand-900/50 transition touch-manipulation"
            >
              Ver planes y precios
              <ArrowRight className="w-5 h-5 shrink-0" aria-hidden />
            </a>
            <a
              href="#prueba-gratis"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-accent-500/40 bg-accent-600/15 hover:bg-accent-600/25 active:bg-accent-600/30 text-accent-50 font-medium px-5 sm:px-6 py-3.5 text-[15px] sm:text-base transition touch-manipulation"
            >
              Prueba gratis {PRUEBA_GRATIS_DIAS} días
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-500 max-w-2xl leading-relaxed">
            <strong className="text-slate-400 font-medium">Prueba gratis {PRUEBA_GRATIS_DIAS} días:</strong> accedés al
            producto completo —misma experiencia que el plan Premium (panel del estudio + portal del alumno)— para
            evaluarlo sin compromiso. Coordinamos el alta por WhatsApp.
          </p>
        </section>

        <section
          id="app"
          className="scroll-mt-[calc(5.5rem+env(safe-area-inset-top))] sm:scroll-mt-24 border-t border-white/10 bg-gradient-to-b from-slate-900/60 to-transparent"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-20">
            <div className="max-w-2xl mb-8 sm:mb-12">
              <p className="text-brand-300 text-[11px] sm:text-xs font-semibold uppercase tracking-widest mb-1.5 sm:mb-2">
                Producto real
              </p>
              <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight text-balance leading-tight">
                Así se ve en el día a día
              </h2>
              <p className="mt-2 sm:mt-3 text-slate-400 text-sm sm:text-base leading-relaxed">
                Un vistazo al calendario, al equipo y a las finanzas — y cómo lo vive el alumno en el celular.
              </p>
            </div>

            <p className="text-center text-sm text-slate-500 mb-4 hidden sm:block">
              Deslizá con el mouse o usá las flechas; también rota solo cada pocos segundos.
            </p>
            <EscritorioCarousel />

            <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-slate-900/40 px-4 py-8 sm:px-10 sm:py-12">
              <h3 className="text-lg sm:text-2xl font-bold text-white text-center text-balance px-1">
                También en el celular
              </h3>
              <p className="text-center text-[13px] sm:text-sm text-slate-400 mt-2 max-w-2xl mx-auto leading-relaxed px-1">
                El equipo navega por el menú lateral con todos los módulos; el alumno ve la semana, su portal y los cobros con la misma claridad.
              </p>
              <div className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-10 sm:gap-x-8 sm:gap-y-12 justify-items-center max-w-[1200px] mx-auto">
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

              <div className="mt-12 sm:mt-14 pt-10 sm:pt-12 border-t border-white/10">
                <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
                  <div className="text-center lg:text-left order-2 lg:order-1">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 mb-4 ring-1 ring-brand-500/25">
                      <Bell className="w-5 h-5" aria-hidden />
                    </div>
                    <h3 className="text-lg sm:text-2xl font-bold text-white text-balance leading-tight">
                      Recibí tus notificaciones
                    </h3>
                    <p className="mt-3 text-[13px] sm:text-sm text-slate-400 leading-relaxed max-w-md mx-auto lg:mx-0">
                      Cupos liberados, recuperaciones nuevas y avisos del estudio llegan al celular como en cualquier app
                      moderna: mirás el centro de notificaciones y seguís el turno sin entrar al calendario.
                    </p>
                  </div>
                  <div className="flex justify-center order-1 lg:order-2">
                    <figure className="w-full max-w-[min(100%,300px)]">
                      <img
                        src={LANDING_IMG.notificacionesCel}
                        alt={`Ejemplos de notificaciones de ${APP_NAME}: cupo liberado y recuperaciones en el celular`}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-auto rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/10 object-cover object-top"
                      />
                      <figcaption className="text-center text-[11px] sm:text-xs text-slate-500 mt-3 leading-snug px-1">
                        Ejemplo real en el teléfono · cupos y recuperaciones
                      </figcaption>
                    </figure>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-18">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-10 lg:gap-14 items-start">
            <div>
              <h2 className="text-xl sm:text-3xl font-bold text-white text-balance leading-tight">
                Pensado como lo usás en el estudio
              </h2>
              <p className="mt-2 sm:mt-3 text-slate-400 text-sm sm:text-base leading-relaxed">
                El recorrido natural: semana en el calendario, alumnos y cuotas, ingresos en Pagos y Caja, y pendientes en la Agenda.
                El alumno usa el portal para liberar una fija o recuperar en otro horario, sin pisar los cupos.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                <li className="flex gap-2">
                  <span className="text-brand-400 font-bold">·</span>
                  <span>
                    <strong className="text-white">Actividades</strong> con precios y frecuencia (1x, 2x, 3x por semana, prueba, etc.) para que cada alumno refleje su plan.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-brand-400 font-bold">·</span>
                  <span>
                    <strong className="text-white">Pagos y Caja</strong> con efectivo y transferencia, resúmenes del período abierto y cierres guardados por fecha.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-brand-400 font-bold">·</span>
                  <span>
                    <strong className="text-white">Agenda</strong> con notas por día (importantes o no) y sección de notas sin fecha para lo operativo del estudio.
                  </span>
                </li>
              </ul>
            </div>
            <div className="rounded-xl sm:rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-8">
              <h3 className="text-xs sm:text-sm font-semibold text-brand-200 uppercase tracking-wide">
                Flujo típico
              </h3>
              <ol className="mt-4 space-y-4 text-sm text-slate-300">
                <li className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-brand-300 font-bold text-xs">
                    1
                  </span>
                  <span>
                    <strong className="text-white">Calendario</strong> — cargás turnos, ves quién va a cada hora y marcás asistencia o situaciones especiales.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-brand-300 font-bold text-xs">
                    2
                  </span>
                  <span>
                    <strong className="text-white">Alumnos</strong> — controlás cuotas, registrás cobros y contactás por WhatsApp cuando haga falta.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-brand-300 font-bold text-xs">
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

        <section
          id="planes"
          className="scroll-mt-[calc(5.5rem+env(safe-area-inset-top))] sm:scroll-mt-24 border-t border-white/10 bg-gradient-to-b from-slate-900/80 via-slate-950/90 to-slate-950"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-20">
            <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-12 px-1">
              <p className="text-brand-300 text-[11px] sm:text-xs font-semibold uppercase tracking-widest mb-2">
                Suscripción mensual · precios en pesos
              </p>
              <h2 className="text-2xl sm:text-4xl font-bold text-white text-balance leading-tight">
                Dos planes, una sucursal
              </h2>
              <p className="mt-2 sm:mt-3 text-slate-400 text-sm sm:text-base leading-relaxed">
                Ambos incluyen <strong className="text-slate-300">una sola sede</strong>. El plan{' '}
                <strong className="text-slate-300">Esencial</strong> es solo la parte sucursal, con menos funciones y
                sin portal para alumnos. <strong className="text-slate-300">Premium</strong> suma la experiencia
                completa del alumno (portal) y todos los módulos del estudio.
              </p>
            </div>

            <div className="max-w-4xl mx-auto mb-8 sm:mb-10 rounded-2xl sm:rounded-3xl border border-accent-500/35 bg-gradient-to-br from-accent-950/50 via-slate-900/70 to-brand-950/40 px-5 py-6 sm:px-8 sm:py-7 text-center shadow-lg shadow-black/25">
              <p className="text-accent-200/95 text-[11px] sm:text-xs font-bold uppercase tracking-widest">
                Antes de elegir plan
              </p>
              <h3 className="mt-2 text-lg sm:text-xl font-bold text-white text-balance">
                Prueba gratis {PRUEBA_GRATIS_DIAS} días con el producto completo
              </h3>
              <p className="mt-2 text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
                Probá todo lo que ofrece el plan <strong className="text-slate-300">Premium</strong>: módulos del
                estudio, finanzas, agenda, notificaciones y <strong className="text-slate-300">portal del alumno</strong>.
                Coordinamos el acceso por WhatsApp; sin tarjeta en la web.
              </p>
              <button
                type="button"
                onClick={handleWhatsAppPrueba}
                className="mt-5 inline-flex min-h-11 w-full max-w-sm mx-auto items-center justify-center gap-2 rounded-xl bg-accent-500/90 hover:bg-accent-400 text-slate-950 text-sm font-bold px-5 py-3 shadow-md shadow-black/30 transition touch-manipulation"
              >
                <MessageCircle className="w-4 h-4 shrink-0" aria-hidden />
                Quiero la prueba gratis
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-5 sm:gap-6 lg:gap-8 items-stretch max-w-4xl mx-auto">
              <div
                role="button"
                tabIndex={0}
                onClick={handleWhatsAppPlanEsencial}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  handleWhatsAppPlanEsencial();
                }}
                aria-label={`Contactar por WhatsApp: plan ${PLANES.basico.nombre}`}
                className="rounded-2xl sm:rounded-3xl border border-white/10 bg-slate-900/50 p-6 sm:p-8 flex flex-col shadow-xl shadow-black/20 cursor-pointer outline-none transition hover:border-white/20 hover:bg-slate-900/65 focus-visible:ring-2 focus-visible:ring-brand-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <h3 className="text-lg sm:text-xl font-bold text-white">{PLANES.basico.nombre}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{PLANES.basico.descripcion}</p>
                <div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
                    {precioArsLabel(PLANES.basico.precioArs)}
                  </span>
                  <span className="text-slate-500 text-sm font-medium">/ mes</span>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-slate-300 flex-1">
                  {PLANES.basico.items.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-emerald-400 mt-0.5">
                        <Check className="w-3 h-3" strokeWidth={3} aria-hidden />
                      </span>
                      <span className="leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 text-white text-sm font-semibold px-4 py-3">
                  <MessageCircle className="w-4 h-4 shrink-0 text-emerald-400/90" aria-hidden />
                  Quiero el plan Esencial
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={handleWhatsAppPlanPremium}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  handleWhatsAppPlanPremium();
                }}
                aria-label={`Contactar por WhatsApp: plan ${PLANES.premium.nombre}`}
                className="relative rounded-2xl sm:rounded-3xl border border-brand-400/40 bg-gradient-to-b from-brand-950/80 to-slate-950 p-6 sm:p-8 flex flex-col shadow-2xl shadow-brand-950/40 ring-1 ring-brand-500/20 cursor-pointer outline-none transition hover:border-brand-300/55 focus-visible:ring-2 focus-visible:ring-brand-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-brand-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-950 shadow-lg pointer-events-none">
                  <Sparkles className="w-3.5 h-3.5" aria-hidden />
                  Recomendado
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 mt-2">
                  {PLANES.premium.nombre}
                </h3>
                <p className="mt-2 text-sm text-brand-100/80 leading-relaxed">{PLANES.premium.descripcion}</p>
                <div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
                    {precioArsLabel(PLANES.premium.precioArs)}
                  </span>
                  <span className="text-brand-200/70 text-sm font-medium">/ mes</span>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-slate-200 flex-1">
                  {PLANES.premium.items.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/25 text-brand-200 mt-0.5">
                        <Check className="w-3 h-3" strokeWidth={3} aria-hidden />
                      </span>
                      <span className="leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-slate-950 text-sm font-bold px-4 py-3 shadow-lg shadow-black/30">
                  <MessageCircle className="w-4 h-4 shrink-0" aria-hidden />
                  Quiero el plan Premium
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-slate-500 mt-8 max-w-lg mx-auto leading-relaxed px-2">
              Precios en pesos argentinos (ARS) por mes. La prueba gratis de {PRUEBA_GRATIS_DIAS} días es con alcance
              Premium (producto completo). Por WhatsApp acordamos el alta, la forma de pago y lo incluido en cada plan.
            </p>
          </div>
        </section>

        <section className="border-t border-white/10 bg-slate-900/35 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-18">
            <h2 className="text-xl sm:text-3xl font-bold text-white text-center max-w-2xl mx-auto text-balance leading-tight px-1">
              Funciones que ves en la app, explicadas en la landing
            </h2>
            <p className="text-center text-slate-400 mt-2 max-w-xl mx-auto text-[13px] sm:text-sm leading-relaxed px-2">
              Misma lógica que en tus pantallas de escritorio; acá resumida para quien llega por primera vez.
            </p>
            <ul className="mt-8 sm:mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 lg:gap-6">
              {highlights.map(({ icon: Icon, title, text }) => (
                <li
                  key={title}
                  className="rounded-xl sm:rounded-2xl border border-white/10 bg-slate-950/55 p-4 sm:p-6 hover:border-brand-500/25 hover:bg-slate-900/70 transition duration-300"
                >
                  <div className="inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-brand-500/15 text-brand-300 mb-2.5 sm:mb-3">
                    <Icon className="w-[18px] h-[18px] sm:w-5 sm:h-5" aria-hidden />
                  </div>
                  <h3 className="text-[15px] sm:text-base font-semibold text-white leading-snug">{title}</h3>
                  <p className="mt-1.5 sm:mt-2 text-[13px] sm:text-sm text-slate-400 leading-relaxed">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="prueba-gratis"
          className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-18 scroll-mt-[calc(5.5rem+env(safe-area-inset-top))] sm:scroll-mt-24"
        >
          <div className="rounded-2xl sm:rounded-3xl border border-brand-500/30 bg-gradient-to-br from-brand-900/50 via-slate-900/80 to-indigo-950/40 p-5 sm:p-12">
            <div className="max-w-xl mx-auto text-center px-1">
              <p className="text-brand-200 text-[11px] sm:text-xs font-semibold uppercase tracking-widest mb-2">
                Plan Premium · sin cargo
              </p>
              <h2 className="text-xl sm:text-3xl font-bold text-white text-balance leading-tight">
                Prueba gratis {PRUEBA_GRATIS_DIAS} días con el producto completo
              </h2>
              <p className="mt-2 sm:mt-3 text-slate-400 text-sm sm:text-base leading-relaxed">
                Te damos acceso a <strong className="text-slate-300">todo</strong> lo que incluye el plan Premium
                (estudio + portal del alumno) durante <strong className="text-slate-300">{PRUEBA_GRATIS_DIAS} días</strong>{' '}
                para que lo uses en serio. Por <strong className="text-slate-300">WhatsApp</strong> se abre el chat con
                un mensaje ya armado; coordinamos el alta. No hace falta completar formularios acá.
              </p>
            </div>
            <div className="mt-8 sm:mt-10 max-w-md mx-auto">
              <button
                type="button"
                onClick={handleWhatsAppPrueba}
                className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-accent-500 to-orange-600 hover:from-amber-300 hover:via-accent-400 hover:to-orange-500 active:opacity-95 text-white font-semibold px-5 sm:px-6 py-3.5 sm:py-4 text-[15px] sm:text-base shadow-lg shadow-orange-950/45 transition touch-manipulation"
              >
                <MessageCircle className="w-5 h-5 shrink-0" aria-hidden />
                Hablar por WhatsApp
                <ArrowRight className="w-5 h-5 shrink-0" aria-hidden />
              </button>
              <p className="text-center text-xs text-slate-500 leading-relaxed mt-4">
                Si no se abre la pestaña, permití ventanas emergentes para este sitio.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 px-4 py-8 sm:py-10 text-center text-[11px] sm:text-xs text-slate-500 leading-relaxed">
        <div className="flex flex-col items-center gap-3 max-w-md mx-auto">
          <BrandMark size={48} alt={`Logo ${APP_NAME}`} className="opacity-90" />
          <p className="text-balance">
            © {new Date().getFullYear()} {APP_NAME}. Gestión para estudios de Pilates y fitness.
          </p>
        </div>
      </footer>
    </div>
  );
}
