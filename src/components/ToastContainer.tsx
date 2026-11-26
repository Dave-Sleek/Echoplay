import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useEchoPlay } from '../context/EchoPlayContext';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast, currentSong } = useEchoPlay();

  if (toasts.length === 0) return null;

  return (
    <div
      className={`fixed left-4 right-4 lg:left-auto lg:right-6 lg:w-96 z-50 flex flex-col gap-2 pointer-events-none transition-all ${
        currentSong
          ? 'bottom-[calc(146px+env(safe-area-inset-bottom,0px))] lg:bottom-24'
          : 'bottom-[calc(80px+env(safe-area-inset-bottom,0px))] lg:bottom-6'
      }`}
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon =
          toast.type === 'success'
            ? CheckCircle2
            : toast.type === 'error' || toast.type === 'warning'
              ? AlertCircle
              : Info;
        const iconColor =
          toast.type === 'success'
            ? 'text-emerald-400'
            : toast.type === 'error'
              ? 'text-red-400'
              : toast.type === 'warning'
                ? 'text-amber-400'
                : 'text-sky-400';

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl bg-zinc-900/95 dark:bg-[#1E212B]/95 text-white px-4 py-3 shadow-xl border border-white/10 backdrop-blur-md"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} />
              <span className="text-sm font-medium truncate">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
