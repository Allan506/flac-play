import { useEffect } from 'react';
import { AlertIcon, CheckIcon, CloseIcon } from './Icons';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, toast.kind === 'error' ? 6500 : 4200);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className={`toast toast-${toast.kind}`} role="status" aria-live="polite">
      <span className="toast-icon">
        {toast.kind === 'error' ? <AlertIcon size={17} /> : <CheckIcon size={17} />}
      </span>
      <p>{toast.text}</p>
      <button type="button" className="icon-button" onClick={onDismiss} aria-label="Cerrar aviso">
        <CloseIcon size={15} />
      </button>
    </div>
  );
}
