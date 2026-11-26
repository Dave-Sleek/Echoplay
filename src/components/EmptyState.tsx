import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryNote?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryNote,
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 rounded-3xl bg-white/70 dark:bg-[#13151B]/80 border border-black/5 dark:border-white/8">
      <div className="w-16 h-16 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mb-5">
        <Icon className="w-8 h-8" strokeWidth={1.75} />
      </div>
      <h3 className="text-xl font-semibold text-zinc-900 dark:text-white tracking-tight text-balance">
        {title}
      </h3>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 max-w-sm leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 min-h-[48px] px-6 py-3 rounded-2xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm shadow-lg shadow-black/15 active:scale-[0.98] transition-all whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
      {secondaryNote && (
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-500 max-w-xs">
          {secondaryNote}
        </p>
      )}
    </div>
  );
};
