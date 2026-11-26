import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#171920] border border-black/10 dark:border-white/10 p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          {destructive && (
            <div className="w-10 h-10 rounded-full bg-red-500/12 text-red-500 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
          )}
          <div>
            <h3
              id="confirm-dialog-title"
              className="text-lg font-semibold text-zinc-900 dark:text-white"
            >
              {title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-white/8 hover:bg-zinc-200 dark:hover:bg-white/12 transition-colors whitespace-nowrap shrink-0"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 ${
              destructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
