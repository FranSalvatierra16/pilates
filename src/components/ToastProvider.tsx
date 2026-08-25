import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastOptions = {
  type?: ToastType;
  duration?: number;
};

type ConfirmOptions = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'primary';
};

type ConfirmState = {
  open: boolean;
  message: string;
  title: string;
  confirmText: string;
  cancelText: string;
  tone: 'danger' | 'primary';
  resolve: ((value: boolean) => void) | null;
};

type ToastContextValue = {
  showToast: (message: string, options?: ToastOptions) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_META: Record<
  ToastType,
  { title: string; panel: string; iconWrap: string; icon: ReactNode; accent: string }
> = {
  success: {
    title: 'Listo',
    panel: 'bg-[#FBF8F3]/95 border-emerald-900/10',
    iconWrap: 'bg-emerald-100/90 text-emerald-800',
    icon: <CheckCircle2 className="w-5 h-5" strokeWidth={1.75} />,
    accent: 'bg-emerald-700',
  },
  error: {
    title: 'Atención',
    panel: 'bg-[#FBF8F3]/95 border-rose-900/10',
    iconWrap: 'bg-rose-100/90 text-rose-800',
    icon: <AlertCircle className="w-5 h-5" strokeWidth={1.75} />,
    accent: 'bg-rose-700',
  },
  info: {
    title: 'Aviso',
    panel: 'bg-[#FBF8F3]/95 border-stone-800/10',
    iconWrap: 'bg-stone-200/90 text-stone-800',
    icon: <Info className="w-5 h-5" strokeWidth={1.75} />,
    accent: 'bg-stone-700',
  },
  warning: {
    title: 'Importante',
    panel: 'bg-[#FBF8F3]/95 border-amber-900/10',
    iconWrap: 'bg-amber-100/90 text-amber-900',
    icon: <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />,
    accent: 'bg-amber-700',
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    message: '',
    title: 'Confirmar acción',
    confirmText: 'Aceptar',
    cancelText: 'Cancelar',
    tone: 'danger',
    resolve: null,
  });
  const nextIdRef = useRef(1);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, options?: ToastOptions) => {
    if (!message?.trim()) return;
    const id = nextIdRef.current++;
    const type = options?.type || 'info';
    const duration = options?.duration ?? 4500;
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => removeToast(id), duration);
  }, [removeToast]);

  const closeConfirm = useCallback((value: boolean) => {
    setConfirmState((prev) => {
      prev.resolve?.(value);
      return {
        open: false,
        message: '',
        title: 'Confirmar acción',
        confirmText: 'Aceptar',
        cancelText: 'Cancelar',
        tone: 'danger',
        resolve: null,
      };
    });
  }, []);

  const confirm = useCallback((message: string, options?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({
        open: true,
        message,
        title: options?.title || 'Confirmar acción',
        confirmText: options?.confirmText || 'Aceptar',
        cancelText: options?.cancelText || 'Cancelar',
        tone: options?.tone || 'danger',
        resolve,
      });
    });
  }, []);

  const value = useMemo<ToastContextValue>(() => ({
    showToast,
    success: (message, duration) => showToast(message, { type: 'success', duration }),
    error: (message, duration) => showToast(message, { type: 'error', duration }),
    info: (message, duration) => showToast(message, { type: 'info', duration }),
    warning: (message, duration) => showToast(message, { type: 'warning', duration }),
    confirm,
  }), [showToast, confirm]);

  const hasToasts = toasts.length > 0;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <>
          {hasToasts && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center p-5 sm:p-8"
              role="presentation"
            >
              <div
                className="absolute inset-0 bg-[#2C241C]/35 backdrop-blur-[2px]"
                aria-hidden
                onClick={() => setToasts([])}
              />
              <div className="relative w-full max-w-[22rem] space-y-3">
                {toasts.map((toast) => {
                  const meta = TOAST_META[toast.type];
                  return (
                    <div
                      key={toast.id}
                      className={`pointer-events-auto overflow-hidden rounded-3xl border shadow-[0_24px_60px_rgba(44,36,28,0.28)] backdrop-blur-xl ${meta.panel}`}
                      role="status"
                    >
                      <div className={`h-1 w-full ${meta.accent}`} />
                      <div className="flex items-start gap-3.5 px-5 py-4">
                        <div
                          className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${meta.iconWrap}`}
                        >
                          {meta.icon}
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                            {meta.title}
                          </p>
                          <p className="mt-1 text-[15px] font-medium leading-snug text-stone-800 whitespace-pre-line">
                            {toast.message}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeToast(toast.id)}
                          className="flex-shrink-0 rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-900/5 hover:text-stone-700"
                          aria-label="Cerrar mensaje"
                        >
                          <X className="w-4 h-4" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {confirmState.open && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-5">
              <div className="absolute inset-0 bg-[#2C241C]/40 backdrop-blur-[3px]" aria-hidden />
              <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-stone-800/10 bg-[#FBF8F3] shadow-[0_28px_70px_rgba(44,36,28,0.3)]">
                <div
                  className={`h-1 w-full ${
                    confirmState.tone === 'danger' ? 'bg-rose-700' : 'bg-stone-800'
                  }`}
                />
                <div className="p-6 sm:p-7">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${
                        confirmState.tone === 'danger'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-stone-200 text-stone-800'
                      }`}
                    >
                      <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold tracking-tight text-stone-900">
                        {confirmState.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-stone-600 whitespace-pre-line">
                        {confirmState.message}
                      </p>
                    </div>
                  </div>
                  <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => closeConfirm(false)}
                      className="rounded-2xl px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-900/5"
                    >
                      {confirmState.cancelText}
                    </button>
                    <button
                      type="button"
                      onClick={() => closeConfirm(true)}
                      className={`rounded-2xl px-5 py-3 text-sm font-semibold text-white transition-colors ${
                        confirmState.tone === 'danger'
                          ? 'bg-rose-800 hover:bg-rose-900'
                          : 'bg-stone-800 hover:bg-stone-900'
                      }`}
                    >
                      {confirmState.confirmText}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast debe usarse dentro de ToastProvider');
  }
  return ctx;
}
