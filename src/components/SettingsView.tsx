import React, { useEffect, useState } from 'react';
import {
  Check,
  HardDrive,
  Info,
  Moon,
  PlusSquare,
  Share,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
} from 'lucide-react';
import { useEchoPlay } from '../context/EchoPlayContext';
import { getStorageStats, type StorageStats } from '../db/indexedDb';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { AccentTheme, RepeatMode } from '../types/music';
import { formatBytes } from '../utils/formatters';
import { setHapticsEnabled, triggerHaptic } from '../utils/haptics';
import { ConfirmDialog } from './ConfirmDialog';
import { PWAInstallButton } from './PWAInstallButton';

const ACCENTS: Array<{ id: AccentTheme; label: string; color: string }> = [
  { id: 'coral', label: 'Coral', color: '#FA3C52' },
  { id: 'amber', label: 'Amber', color: '#F59E0B' },
  { id: 'emerald', label: 'Emerald', color: '#10B981' },
  { id: 'indigo', label: 'Indigo', color: '#6366F1' },
];

export const SettingsView: React.FC = () => {
  const {
    settings,
    updateSettings,
    songs,
    playlists,
    clearRecentlyPlayed,
    clearMusicLibrary,
    resetAllData,
    setPlaybackRate,
  } = useEchoPlay();

  const { isInstalled } = usePWAInstall();
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    null | 'recent' | 'library' | 'reset'
  >(null);

  useEffect(() => {
    let active = true;
    getStorageStats()
      .then((s) => {
        if (active) setStats(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [songs.length, playlists.length]);

  const totalLocalBytes = stats ? stats.audioBytes + stats.artworkBytes : 0;
  const usagePercent =
    stats?.quotaBytes && stats.quotaBytes > 0
      ? Math.min(100, Math.round(((stats.usageBytes ?? totalLocalBytes) / stats.quotaBytes) * 100))
      : 0;

  return (
    <div className="space-y-7 max-w-3xl">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Settings
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Appearance, playback behavior, iPhone PWA installation, and local storage
        </p>
      </header>

      {/* Appearance & Theme */}
      <section className="rounded-3xl bg-white/80 dark:bg-[#13151B] border border-black/[0.06] dark:border-white/[0.07] p-5 space-y-5">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white">Appearance</h2>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Color Mode</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Dark mode is optimized for OLED iPhone screens
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-black/[0.05] dark:bg-white/[0.07]">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                void updateSettings({ theme: 'dark' });
              }}
              className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                settings.theme === 'dark'
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              Dark
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                void updateSettings({ theme: 'light' });
              }}
              className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                settings.theme === 'light'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              Light
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.06]">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">Accent Color</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {ACCENTS.map((item) => {
              const active = settings.accent === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    void updateSettings({ accent: item.id });
                  }}
                  className={`min-h-[44px] px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                    active
                      ? 'border-zinc-900 dark:border-white bg-black/[0.04] dark:bg-white/[0.08] text-zinc-900 dark:text-white'
                      : 'border-black/[0.07] dark:border-white/[0.08] text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center text-white"
                    style={{ backgroundColor: item.color }}
                  >
                    {active && <Check className="w-2.5 h-2.5" />}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Audio & Playback Preferences */}
      <section className="rounded-3xl bg-white/80 dark:bg-[#13151B] border border-black/[0.06] dark:border-white/[0.07] p-5 space-y-5">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white">
          Playback Preferences
        </h2>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">
              Default Shuffle on Startup
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Start new sessions with shuffle enabled
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.shuffleDefault}
            onClick={() => {
              triggerHaptic('selection');
              void updateSettings({ shuffleDefault: !settings.shuffleDefault });
            }}
            className={`w-12 h-7 rounded-full transition-colors p-0.5 flex items-center ${
              settings.shuffleDefault ? 'bg-[var(--accent)] justify-end' : 'bg-zinc-300 dark:bg-zinc-700 justify-start'
            }`}
          >
            <span className="w-6 h-6 rounded-full bg-white shadow-sm" />
          </button>
        </div>

        <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Default Repeat</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Repeat queue or single track
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-black/[0.05] dark:bg-white/[0.07]">
            {(['off', 'all', 'one'] as RepeatMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  void updateSettings({ repeatDefault: mode });
                }}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold capitalize transition-colors ${
                  settings.repeatDefault === mode
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {mode === 'one' ? 'One' : mode === 'all' ? 'All' : 'Off'}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Playback Speed</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Adjust current audio speed
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-black/[0.05] dark:bg-white/[0.07]">
            {[0.75, 1, 1.25, 1.5].map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setPlaybackRate(rate);
                }}
                className={`min-h-[36px] px-2.5 rounded-lg text-xs font-semibold tabular-nums transition-colors ${
                  settings.playbackRate === rate
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">
              Audio Normalization (ReplayGain)
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Automatically levels volume across tracks using ReplayGain tags or perceptual loudness analysis
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.audioNormalization ?? false}
            onClick={() => {
              triggerHaptic('tap');
              void updateSettings({ audioNormalization: !(settings.audioNormalization ?? false) });
            }}
            className={`w-12 h-7 rounded-full transition-colors p-0.5 flex items-center shrink-0 ${
              settings.audioNormalization ?? false
                ? 'bg-[var(--accent)] justify-end'
                : 'bg-zinc-300 dark:bg-zinc-700 justify-start'
            }`}
          >
            <span className="w-6 h-6 rounded-full bg-white shadow-sm" />
          </button>
        </div>

        <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">
              Haptic Feedback
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Subtle tactile pulses on playback controls and gestures (on iPhone, requires iOS 17.4+ with System Haptics enabled)
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.hapticsEnabled ?? true}
            onClick={() => {
              const next = !(settings.hapticsEnabled ?? true);
              setHapticsEnabled(next);
              void updateSettings({ hapticsEnabled: next });
              if (next) {
                triggerHaptic('playPause');
              }
            }}
            className={`w-12 h-7 rounded-full transition-colors p-0.5 flex items-center shrink-0 ${
              settings.hapticsEnabled ?? true
                ? 'bg-[var(--accent)] justify-end'
                : 'bg-zinc-300 dark:bg-zinc-700 justify-start'
            }`}
          >
            <span className="w-6 h-6 rounded-full bg-white shadow-sm" />
          </button>
        </div>
      </section>

      {/* Install on iPhone & Background Playback */}
      <section className="rounded-3xl bg-white/80 dark:bg-[#13151B] border border-black/[0.06] dark:border-white/[0.07] p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">
              iPhone App & Background Playback
            </h2>
          </div>
          {!isInstalled && <PWAInstallButton />}
        </div>

        {isInstalled ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
            EchoPlay is currently running as an installed standalone Home Screen app.
          </p>
        ) : (
          <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] space-y-2.5">
            <p className="text-xs font-semibold text-zinc-900 dark:text-white">
              Install on iPhone (Safari):
            </p>
            <ol className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1.5 leading-relaxed">
              <li>1. Open EchoPlay in <strong>Safari</strong> (other iOS browsers like Chrome cannot add full PWAs to Home Screen).</li>
              <li className="flex items-center gap-1.5 flex-wrap">
                2. Tap the <strong>Share</strong> button <Share className="w-3.5 h-3.5 inline text-[var(--accent)]" /> in Safari.
              </li>
              <li className="flex items-center gap-1.5 flex-wrap">
                3. Select <strong>Add to Home Screen</strong> <PlusSquare className="w-3.5 h-3.5 inline" />.
              </li>
              <li>4. Tap <strong>Add</strong>.</li>
            </ol>
          </div>
        )}

        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          EchoPlay uses the HTML5 Audio API and Media Session API to display track title, artist, album, and artwork on the iPhone Lock Screen, Control Center, and AirPods controls. Swipe down or across the Mini Player to dismiss playback, swipe up to open the full player, or swipe left on upcoming queue items to remove them.
        </p>
      </section>

      {/* Local Storage & Privacy */}
      <section className="rounded-3xl bg-white/80 dark:bg-[#13151B] border border-black/[0.06] dark:border-white/[0.07] p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <HardDrive className="w-5 h-5 text-[var(--accent)]" />
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">
            Local Storage & Privacy
          </h2>
        </div>

        <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs leading-relaxed">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            All music files, cover artwork, playlists, and playback history are stored strictly on your device using IndexedDB. EchoPlay never uploads your files or connects to any cloud server.
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-600 dark:text-zinc-400">
              Music & Artwork stored locally
            </span>
            <span className="font-semibold text-zinc-900 dark:text-white tabular-nums">
              {formatBytes(totalLocalBytes)}
              {stats?.quotaBytes ? ` of ${formatBytes(stats.quotaBytes)} available` : ''}
            </span>
          </div>
          {stats?.quotaBytes && (
            <div className="h-2 rounded-full bg-black/8 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-all"
                style={{ width: `${Math.max(usagePercent, totalLocalBytes > 0 ? 2 : 0)}%` }}
              />
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 tabular-nums pt-1">
            <span>{songs.length} audio files ({formatBytes(stats?.audioBytes || 0)})</span>
            <span>Artwork cache ({formatBytes(stats?.artworkBytes || 0)})</span>
          </div>
        </div>

        <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.06] flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={() => setConfirmAction('recent')}
            className="min-h-[44px] px-4 rounded-xl bg-black/[0.05] dark:bg-white/[0.07] hover:bg-black/[0.09] dark:hover:bg-white/[0.12] text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors"
          >
            Clear Recently Played
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction('library')}
            className="min-h-[44px] px-4 rounded-xl bg-red-500/10 hover:bg-red-500/18 text-xs font-semibold text-red-600 dark:text-red-400 inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete All Music
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction('reset')}
            className="min-h-[44px] px-4 rounded-xl border border-red-500/25 hover:bg-red-500/10 text-xs font-semibold text-red-600 dark:text-red-400 transition-colors"
          >
            Reset All App Data
          </button>
        </div>
      </section>

      {/* About EchoPlay */}
      <section className="rounded-3xl bg-white/80 dark:bg-[#13151B] border border-black/[0.06] dark:border-white/[0.07] p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-[var(--accent)]" />
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">About EchoPlay</h2>
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
          EchoPlay is an offline-first, privacy-focused local audio player crafted for iPhone Safari and Home Screen PWAs. Supports MP3, M4A, AAC, WAV, FLAC, and OGG playback with local ID3/MP4/FLAC artwork extraction.
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-500 tabular-nums pt-1">
          Version 1.0.0
        </p>
      </section>

      <ConfirmDialog
        open={confirmAction === 'recent'}
        title="Clear recently played?"
        description="This clears your listening history and play counts. Your imported songs and playlists will not be deleted."
        confirmLabel="Clear History"
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await clearRecentlyPlayed();
        }}
      />

      <ConfirmDialog
        open={confirmAction === 'library'}
        title="Delete all locally stored music?"
        description="All imported audio files, extracted artwork, and songs in playlists will be permanently erased from this device."
        confirmLabel="Delete All Music"
        destructive
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await clearMusicLibrary();
        }}
      />

      <ConfirmDialog
        open={confirmAction === 'reset'}
        title="Reset EchoPlay completely?"
        description="This will erase all locally stored music, playlists, history, and preferences from IndexedDB."
        confirmLabel="Reset Everything"
        destructive
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await resetAllData();
        }}
      />
    </div>
  );
};
