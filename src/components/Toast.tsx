import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/format';

interface ToastInput {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'info' | 'warn';
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { id: number }) | null>(null);
  const counter = useRef(0);

  const show = useCallback((next: ToastInput) => {
    counter.current += 1;
    setToast({ ...next, id: counter.current });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.onAction ? 7000 : 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={cn('toast', toast.tone === 'warn' && 'toast--warn')}>
            <span>{toast.message}</span>
            {toast.onAction && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  toast.onAction?.();
                  setToast(null);
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
