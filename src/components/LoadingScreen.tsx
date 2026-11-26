import React from 'react';
import { Disc3 } from 'lucide-react';

export const LoadingScreen: React.FC = () => {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F7F7F5] dark:bg-[#0A0B0E] text-zinc-900 dark:text-white px-6">
      <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-xl">
        <Disc3 className="w-8 h-8 text-white animate-spin" style={{ animationDuration: '3s' }} />
      </div>
      <p className="mt-4 font-display text-lg font-semibold tracking-tight">EchoPlay</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Loading your local library...</p>
    </div>
  );
};
