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

type ToastContextValue = {
  showToast: (message: string, options?: ToastOptions) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
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

  const value = useMemo<ToastContextValue>(() => ({
    showToast,
    success: (message, duration) => showToast(message, { type: 'success', duration }),
    error: (message, duration) => showToast(message, { type: 'error', duration }),
    info: (message, duration) => showToast(message, { type: 'info', duration }),
    warning: (message, duration) => showToast(message, { type: 'warning', duration }),
  }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div className="fixed top-4 right-4 left-4 sm:left-auto z-[100] pointer-events-none space-y-3">
          {toasts.map((toast) => {
            const style = TOAST_STYLES[toast.type];
            return (
              <div
                key={toast.id}
                className={`pointer-events-auto ml-auto w-full sm:max-w-md rounded-xl border shadow-lg ${style.wrapper}`}
              >
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="mt-0.5 flex-shrink-0">{style.icon}</div>
                  <p className="text-sm font-medium whitespace-pre-line flex-1">{toast.message}</p>
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
        </div>,
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
