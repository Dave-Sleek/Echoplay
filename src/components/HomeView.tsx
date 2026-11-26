import React, { useMemo } from 'react';
import {
  ChevronRight,
  Clock,
  Disc3,
  Heart,
  ListMusic,
  Play,
  Plus,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import { useEchoPlay } from '../context/EchoPlayContext';
import { useLongPress } from '../hooks/useLongPress';
import type { Playlist, Song } from '../types/music';
import { formatDuration, getTimeOfDayGreeting } from '../utils/formatters';
import { triggerHaptic } from '../utils/haptics';
import { AlbumArtwork } from './AlbumArtwork';
import { EmptyState } from './EmptyState';
import { PlaylistCard } from './PlaylistCard';
import { PWAInstallButton } from './PWAInstallButton';
import { SongList } from './SongList';

const RecentPlayedCard: React.FC<{
  song: Song;
  onPlay: () => void;
  onLongPress: () => void;
}> = ({ song, onPlay, onLongPress }) => {
  const handlers = useLongPress({
    onLongPress,
    onClick: () => {
      triggerHaptic('tap');
      onPlay();
    },
  });

  return (
    <button
      type="button"
      {...handlers}
      className="group w-36 sm:w-40 shrink-0 text-left select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-2xl"
    >
      <div className="relative aspect-square rounded-2xl overflow-hidden shadow-md">
        <AlbumArtwork
          artworkId={song.artworkId}
          fallbackKey={`${song.album}-${song.artist}`}
          alt={song.title}
          sizeClass="w-full h-full"
          radiusClass="rounded-2xl"
        />
      </div>
      <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-white truncate">
        {song.title}
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
        {song.artist}
      </p>
    </button>
  );
};

const RecentAddedCard: React.FC<{
  song: Song;
  onPlay: () => void;
  onLongPress: () => void;
}> = ({ song, onPlay, onLongPress }) => {
  const handlers = useLongPress({
    onLongPress,
    onClick: () => {
      triggerHaptic('tap');
      onPlay();
    },
  });

  return (
    <button
      type="button"
      {...handlers}
      className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/75 dark:bg-[#13151B]/85 border border-black/[0.05] dark:border-white/[0.06] hover:bg-white dark:hover:bg-[#191C25] text-left transition-colors min-h-[60px] select-none"
    >
      <AlbumArtwork
        artworkId={song.artworkId}
        fallbackKey={`${song.album}-${song.artist}`}
        alt={song.title}
        sizeClass="w-12 h-12"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
          {song.title}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5 tabular-nums">
          {song.artist} · {formatDuration(song.duration)}
        </p>
      </div>
    </button>
  );
};

interface HomeViewProps {
  onOpenPlaylist: (playlist: Playlist) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onOpenPlaylist }) => {
  const {
    songs,
    playlists,
    setImportModalOpen,
    setActiveTab,
    playSong,
    playList,
    setActionSheetTarget,
  } = useEchoPlay();

  const songMap = useMemo(() => {
    const map = new Map<string, Song>();
    for (const s of songs) map.set(s.id, s);
    return map;
  }, [songs]);

  const recentlyPlayed = useMemo(
    () =>
      songs
        .filter((s) => s.lastPlayedAt !== undefined)
        .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
        .slice(0, 10),
    [songs]
  );

  const favorites = useMemo(
    () => songs.filter((s) => s.isFavorite),
    [songs]
  );

  const recentlyAdded = useMemo(
    () => [...songs].sort((a, b) => b.addedAt - a.addedAt).slice(0, 8),
    [songs]
  );

  const greeting = getTimeOfDayGreeting();

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[var(--accent)] tracking-wide">
            {greeting}
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white text-balance">
            Your music, your moment.
          </h1>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <PWAInstallButton compact />
          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap');
              setImportModalOpen(true);
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold inline-flex items-center gap-2 shadow-sm transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Import Music
          </button>
        </div>
      </header>

      {/* Empty Library Welcome */}
      {songs.length === 0 ? (
        <div className="space-y-6">
          <EmptyState
            icon={Disc3}
            title="Your offline library is ready"
            description="Scan your Android phone, select a Music folder, or import audio files from your device. Everything stays saved locally in your offline library."
            actionLabel="Scan & Import Music"
            onAction={() => {
              triggerHaptic('tap');
              setImportModalOpen(true);
            }}
            secondaryNote="Zero accounts. Zero uploads. Works completely offline after installation."
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-white/75 dark:bg-[#13151B] border border-black/[0.06] dark:border-white/[0.07]">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                iPhone Files & iCloud
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Select multiple audio tracks at once using the native iOS file browser.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/75 dark:bg-[#13151B] border border-black/[0.06] dark:border-white/[0.07]">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                Lock Screen Controls
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Integrated Media Session artwork and controls for iPhone lock screen & AirPods.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/75 dark:bg-[#13151B] border border-black/[0.06] dark:border-white/[0.07]">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                Private Local Storage
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Stored permanently in IndexedDB so your music stays ready even in Airplane Mode.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Quick Play Banner */}
          <div className="flex items-center justify-between gap-4 p-4 sm:p-5 rounded-3xl bg-white/80 dark:bg-[#141720] border border-black/[0.06] dark:border-white/[0.07]">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                Local Library
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 tabular-nums">
                {songs.length} {songs.length === 1 ? 'track' : 'tracks'} stored on this device
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('playPause');
                  void playList(songs, 0, false);
                }}
                className="min-h-[44px] px-4 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current" />
                Play All
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('playPause');
                  void playList(songs, 0, true);
                }}
                className="min-h-[44px] px-4 rounded-xl bg-black/6 dark:bg-white/10 text-zinc-900 dark:text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-black/10 dark:hover:bg-white/15 transition-colors whitespace-nowrap"
              >
                <Shuffle className="w-4 h-4" />
                Shuffle
              </button>
            </div>
          </div>

          {/* Recently Played */}
          {recentlyPlayed.length > 0 && (
            <section aria-labelledby="recent-played-heading" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2
                  id="recent-played-heading"
                  className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2"
                >
                  <Clock className="w-4 h-4 text-[var(--accent)]" />
                  Recently Played
                </h2>
              </div>

              <div className="flex gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar">
                {recentlyPlayed.map((song) => (
                  <RecentPlayedCard
                    key={song.id}
                    song={song}
                    onPlay={() => void playSong(song, recentlyPlayed)}
                    onLongPress={() => setActionSheetTarget({ song })}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Favorites */}
          <section aria-labelledby="favorites-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2
                id="favorites-heading"
                className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2"
              >
                <Heart className="w-4 h-4 text-[var(--accent)]" />
                Favorites
              </h2>
              {favorites.length > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('playPause');
                      void playList(favorites, 0, true);
                    }}
                    className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors inline-flex items-center gap-1"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    Shuffle Favorites
                  </button>
                </div>
              )}
            </div>

            {favorites.length === 0 ? (
              <div className="p-5 rounded-2xl bg-white/65 dark:bg-[#13151B]/70 border border-black/[0.05] dark:border-white/[0.06] text-sm text-zinc-500 dark:text-zinc-400">
                Tap the heart icon on any song to save your favorites here.
              </div>
            ) : (
              <div className="rounded-3xl bg-white/75 dark:bg-[#13151B]/85 border border-black/[0.05] dark:border-white/[0.06] p-2 sm:p-3">
                <SongList songs={favorites.slice(0, 5)} contextQueue={favorites} />
              </div>
            )}
          </section>

          {/* Recently Added */}
          <section aria-labelledby="recently-added-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2
                id="recently-added-heading"
                className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                Recently Added
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('library')}
                className="min-h-[40px] px-2.5 rounded-xl text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white inline-flex items-center gap-0.5 transition-colors"
              >
                Library
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {recentlyAdded.slice(0, 6).map((song) => (
                <RecentAddedCard
                  key={song.id}
                  song={song}
                  onPlay={() => void playSong(song, recentlyAdded)}
                  onLongPress={() => setActionSheetTarget({ song })}
                />
              ))}
            </div>
          </section>

          {/* Playlists */}
          <section aria-labelledby="home-playlists-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2
                id="home-playlists-heading"
                className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2"
              >
                <ListMusic className="w-4 h-4 text-[var(--accent)]" />
                Playlists
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('playlists')}
                className="min-h-[40px] px-2.5 rounded-xl text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white inline-flex items-center gap-0.5 transition-colors"
              >
                See All
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {playlists.length === 0 ? (
              <div className="p-5 rounded-2xl bg-white/65 dark:bg-[#13151B]/70 border border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Organize your tracks into offline playlists.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('playlists')}
                  className="min-h-[40px] px-3.5 rounded-xl bg-black/6 dark:bg-white/10 text-xs font-semibold text-zinc-900 dark:text-white whitespace-nowrap shrink-0"
                >
                  Create Playlist
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
                {playlists.slice(0, 4).map((pl) => (
                  <PlaylistCard
                    key={pl.id}
                    playlist={pl}
                    songMap={songMap}
                    onSelect={onOpenPlaylist}
                  />
                ))}
              </div>
            )}
          </section>

          {/* All Songs */}
          <section aria-labelledby="home-allsongs-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2
                id="home-allsongs-heading"
                className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white"
              >
                All Songs
              </h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                {songs.length} total
              </span>
            </div>

            <div className="rounded-3xl bg-white/75 dark:bg-[#13151B]/85 border border-black/[0.05] dark:border-white/[0.06] p-2 sm:p-3">
              <SongList songs={songs} />
            </div>
          </section>
        </>
      )}
    </div>
  );
};
