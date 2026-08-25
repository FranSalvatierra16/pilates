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

const TOAST_STYLES: Record<ToastType, { wrapper: string; icon: ReactNode }> = {
  success: {
    wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
  },
  error: {
    wrapper: 'border-red-200 bg-red-50 text-red-900',
    icon: <AlertCircle className="w-5 h-5 text-red-600" />,
  },
  info: {
    wrapper: 'border-blue-200 bg-blue-50 text-blue-900',
    icon: <Info className="w-5 h-5 text-blue-600" />,
  },
  warning: {
    wrapper: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
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
    const duration = options?.duration ?? 4000;
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

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center p-4 sm:p-6">
            <div className="w-full max-w-sm space-y-3">
              {toasts.map((toast) => {
                const style = TOAST_STYLES[toast.type];
                return (
                  <div
                    key={toast.id}
                    className={`pointer-events-auto w-full rounded-2xl border shadow-2xl ring-1 ring-black/5 ${style.wrapper}`}
                    role="status"
                  >
                    <div className="flex items-start gap-3 px-4 py-3.5">
                      <div className="mt-0.5 flex-shrink-0">{style.icon}</div>
                      <p className="text-sm font-medium whitespace-pre-line flex-1 leading-snug">{toast.message}</p>
                      <button
                        type="button"
                        onClick={() => removeToast(toast.id)}
                        className="flex-shrink-0 opacity-60 hover:opacity-100"
                        aria-label="Cerrar mensaje"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {confirmState.open && (
            <div className="fixed inset-0 z-[110] bg-black/45 flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200">
                <div className="p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex-shrink-0 rounded-full p-2 ${confirmState.tone === 'danger' ? 'bg-red-100 text-red-600' : 'bg-primary-100 text-primary-600'}`}>
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900">{confirmState.title}</h3>
                      <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">{confirmState.message}</p>
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => closeConfirm(false)}
                      className="btn-secondary"
                    >
                      {confirmState.cancelText}
                    </button>
                    <button
                      type="button"
                      onClick={() => closeConfirm(true)}
                      className={confirmState.tone === 'danger' ? 'btn-danger' : 'btn-primary'}
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
