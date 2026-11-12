import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, shows a text field and passes its value to onConfirm. */
  reasonLabel?: string;
  reasonDefault?: string;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

/**
 * In-app replacement for window.confirm / window.prompt.
 * Browsers silently block those dialogs inside sandboxed iframes (such as AI Studio's preview),
 * which made the delete, cancel and reset buttons do nothing.
 */
export const ConfirmDialog: React.FC<Props> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  danger = false,
  reasonLabel,
  reasonDefault = '',
  onConfirm,
  onCancel
}) => {
  const [reason, setReason] = useState(reasonDefault);

  useEffect(() => {
    if (isOpen) setReason(reasonDefault);
  }, [isOpen, reasonDefault]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-right space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              danger
                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600'
                : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600'
            }`}
          >
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
            {message && <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{message}</p>}
          </div>
        </div>

        {reasonLabel && (
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{reasonLabel}</label>
            <input
              type="text"
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reasonLabel ? reason.trim() : undefined)}
            className={`px-5 py-2 rounded-xl text-white text-xs font-bold shadow-md ${
              danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
