'use client';

import { useToastStore } from '@/stores/toastStore';

const ICONS: Record<string, string> = {
  success: 'fas fa-check-circle',
  error: 'fas fa-exclamation-circle',
  info: 'fas fa-info-circle',
};

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismissToast(t.id)}>
          <i className={`${ICONS[t.type]} toast-icon`}></i>
          <span className="toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
