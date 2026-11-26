import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { triggerHaptic } from '../utils/haptics';

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
  // Dismiss on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => {
            triggerHaptic('tap');
            onCancel();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 36, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#171920] border-t sm:border border-black/10 dark:border-white/10 p-5 sm:p-6 pb-[calc(24px+env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top pill for mobile sheet drag cue */}
            <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto mb-4 sm:hidden" />

            <div className="flex items-start gap-3.5">
              {destructive ? (
                <div className="w-11 h-11 rounded-2xl bg-red-500/12 text-red-500 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              ) : (
                <div className="w-11 h-11 rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)] flex items-center justify-center shrink-0">
                  <Info className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3
                  id="confirm-dialog-title"
                  className="text-lg font-bold text-zinc-900 dark:text-white leading-snug"
                >
                  {title}
                </h3>
                <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {description}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  onCancel();
                }}
                className="flex-1 sm:flex-none min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-300 bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 transition-colors whitespace-nowrap"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(destructive ? 'dismiss' : 'tap');
                  onConfirm();
                }}
                className={`flex-1 sm:flex-none min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors whitespace-nowrap shadow-sm ${
                  destructive
                    ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                    : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] active:scale-98'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
