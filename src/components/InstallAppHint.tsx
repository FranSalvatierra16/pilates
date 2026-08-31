import { useEffect, useState } from 'react';
import { Download, ExternalLink, Share, X } from 'lucide-react';
import { isAndroidDevice, isInAppBrowser, isIosDevice } from '../utils/browser';
import { isPwaStandalone } from '../utils/pwa-role';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type Props = {
  /** Texto corto según el público */
  variant: 'alumno' | 'estudio';
  className?: string;
};

/**
 * Hint para instalar la PWA (alumno o estudio).
 * En Chrome/Android usa beforeinstallprompt; en iOS muestra pasos de "Agregar a inicio".
 * Si está dentro de WhatsApp/Instagram, pide abrir en Safari/Chrome (ahí no se puede instalar).
 */
export default function InstallAppHint({ variant, className = '' }: Props) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [copied, setCopied] = useState(false);
  const inApp = isInAppBrowser();
  const ios = isIosDevice();
  const android = isAndroidDevice();

  useEffect(() => {
    if (isPwaStandalone() || inApp) return;
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, [inApp]);

  if (isPwaStandalone() || dismissed) return null;

  const titulo =
    variant === 'alumno' ? 'Instalá Tu clase en el celular' : 'Instalá la app del estudio';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      prompt('Copiá este link y abrilo en Safari o Chrome:', window.location.href);
    }
  };

  const onInstall = async () => {
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } finally {
      setInstalling(false);
    }
  };

  // WhatsApp / Instagram / Facebook: no permiten instalar PWA
  if (inApp) {
    return (
      <div
        className={`relative rounded-2xl border px-3.5 py-3 text-left border-amber-300 bg-amber-50 text-amber-950 ${className}`}
      >
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-2 p-1 rounded-lg opacity-60 hover:opacity-100"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold pr-6">Abrí este link en el navegador</p>
        <p className="text-xs mt-1.5 leading-snug opacity-90">
          Desde WhatsApp o Instagram <strong>no se puede instalar</strong> la app.
          {ios
            ? ' Tocá ⋯ / Compartir → Abrir en Safari, y ahí agregala a Inicio.'
            : ' Tocá ⋮ → Abrir en Chrome, y ahí instalá la app.'}
        </p>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold bg-amber-800 text-white"
        >
          <ExternalLink className="w-4 h-4" />
          {copied ? '¡Link copiado!' : 'Copiar link'}
        </button>
      </div>
    );
  }

  const detalle =
    variant === 'alumno'
      ? 'Así abrís directo recuperar / liberar, sin el login del estudio.'
      : 'Así abrís el sistema completo (calendario, alumnos, caja…) desde el ícono.';

  return (
    <div
      className={`relative rounded-2xl border px-3.5 py-3 text-left ${
        variant === 'alumno'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
          : 'border-primary-200 bg-primary-50 text-primary-950'
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 p-1 rounded-lg opacity-60 hover:opacity-100"
        aria-label="Cerrar"
      >
        <X className="w-4 h-4" />
      </button>
      <p className="text-sm font-semibold pr-6">{titulo}</p>
      <p className="text-xs mt-1 opacity-80 leading-snug">{detalle}</p>

      {deferred ? (
        <button
          type="button"
          onClick={() => void onInstall()}
          disabled={installing}
          className={`mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
            variant === 'alumno'
              ? 'bg-emerald-700 text-white'
              : 'bg-primary-600 text-white'
          }`}
        >
          <Download className="w-4 h-4" />
          {installing ? 'Instalando…' : 'Instalar app'}
        </button>
      ) : ios ? (
        <p className="mt-2.5 text-xs leading-snug opacity-90 flex items-start gap-1.5">
          <Share className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            En <strong>Safari</strong>: tocá <strong>Compartir</strong> y después{' '}
            <strong>Agregar a pantalla de inicio</strong>.
          </span>
        </p>
      ) : android ? (
        <p className="mt-2.5 text-xs leading-snug opacity-80">
          En <strong>Chrome</strong>: menú ⋮ → <strong>Instalar app</strong> o{' '}
          <strong>Agregar a la pantalla de inicio</strong>.
        </p>
      ) : (
        <p className="mt-2.5 text-xs leading-snug opacity-80">
          En el menú del navegador buscá <strong>Instalar app</strong> o{' '}
          <strong>Agregar a la pantalla de inicio</strong>.
        </p>
      )}
    </div>
  );
}
