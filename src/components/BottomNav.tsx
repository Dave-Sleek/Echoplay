import React from 'react';
import { Disc3, Home, Library, ListMusic, Plus, Settings } from 'lucide-react';
import { useEchoPlay } from '../context/EchoPlayContext';
import type { AppTab } from '../types/music';
import { triggerHaptic } from '../utils/haptics';

const NAV_ITEMS: Array<{ id: AppTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, setImportModalOpen, songs, playlists } = useEchoPlay();

  return (
    <>
      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Primary navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-[#101217]/92 backdrop-blur-xl border-t border-black/[0.06] dark:border-white/[0.08] pb-safe"
      >
        <div className="grid grid-cols-4 h-16 items-center max-w-lg mx-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setActiveTab(item.id);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors focus-visible:outline-none ${
                  isActive
                    ? 'text-[var(--accent)]'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-[22px] h-[22px]" />
                <span className="text-[11px] font-medium tracking-tight leading-none whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Desktop Left Sidebar Rail */}
      <aside
        aria-label="Desktop navigation"
        className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 z-30 bg-white/80 dark:bg-[#0E1015]/95 backdrop-blur-xl border-r border-black/[0.06] dark:border-white/[0.07] p-5"
      >
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent)] flex items-center justify-center text-white shadow-md">
            <Disc3 className="w-5 h-5" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-zinc-900 dark:text-white whitespace-nowrap">
            EchoPlay
          </span>
        </div>

        <nav className="mt-7 space-y-1 flex-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setActiveTab(item.id);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full min-h-[44px] px-3.5 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.07] space-y-3">
          <div className="px-2 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between tabular-nums">
            <span>{songs.length} songs</span>
            <span>{playlists.length} playlists</span>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap');
              setImportModalOpen(true);
            }}
            className="w-full min-h-[44px] px-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Import Music
          </button>
        </div>
      </aside>
    </>
  );
};
