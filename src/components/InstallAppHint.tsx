import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
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

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Hint para instalar la PWA (alumno o estudio).
 * En Chrome/Android usa beforeinstallprompt; en iOS muestra pasos de "Agregar a inicio".
 */
export default function InstallAppHint({ variant, className = '' }: Props) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isPwaStandalone()) return;
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  if (isPwaStandalone() || dismissed) return null;

  const titulo =
    variant === 'alumno' ? 'Instalá Tu clase en el celular' : 'Instalá la app del estudio';
  const detalle =
    variant === 'alumno'
      ? 'Así abrís directo recuperar / liberar, sin el login del estudio.'
      : 'Así abrís el sistema completo (calendario, alumnos, caja…) desde el ícono.';

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
      ) : isIos() ? (
        <p className="mt-2.5 text-xs leading-snug opacity-90 flex items-start gap-1.5">
          <Share className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Tocá <strong>Compartir</strong> y después <strong>Agregar a pantalla de inicio</strong>.
          </span>
        </p>
      ) : (
        <p className="mt-2.5 text-xs leading-snug opacity-80">
          En el menú del navegador buscá <strong>Instalar app</strong> o <strong>Agregar a la pantalla de inicio</strong>.
        </p>
      )}
    </div>
  );
}
