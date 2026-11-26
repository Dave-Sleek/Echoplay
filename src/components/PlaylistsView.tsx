import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, ListMusic, Plus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEchoPlay } from '../context/EchoPlayContext';
import type { Playlist, Song } from '../types/music';
import { compressImageFileToDataUrl } from '../utils/artwork';
import { EmptyState } from './EmptyState';
import { PlaylistCard } from './PlaylistCard';
import { PlaylistDetail } from './PlaylistDetail';

interface PlaylistsViewProps {
  selectedPlaylistId: string | null;
  onSelectPlaylistId: (id: string | null) => void;
}

export const PlaylistsView: React.FC<PlaylistsViewProps> = ({
  selectedPlaylistId,
  onSelectPlaylistId,
}) => {
  const { songs, playlists, createPlaylist, showToast } = useEchoPlay();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [artworkDataUrl, setArtworkDataUrl] = useState<string | undefined>(undefined);
  const artInputRef = useRef<HTMLInputElement>(null);

  const songMap = useMemo(() => {
    const map = new Map<string, Song>();
    for (const s of songs) map.set(s.id, s);
    return map;
  }, [songs]);

  const activePlaylist = useMemo<Playlist | undefined>(
    () =>
      selectedPlaylistId
        ? playlists.find((p) => p.id === selectedPlaylistId)
        : undefined,
    [playlists, selectedPlaylistId]
  );

  const handleArtPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await compressImageFileToDataUrl(file, 512);
      setArtworkDataUrl(url);
    } catch {
      showToast('Unable to read image file', 'error');
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const created = await createPlaylist(name.trim(), description.trim(), artworkDataUrl);
    setName('');
    setDescription('');
    setArtworkDataUrl(undefined);
    setShowCreateModal(false);
    onSelectPlaylistId(created.id);
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {activePlaylist ? (
        <motion.div
          key={`detail-${activePlaylist.id}`}
          initial={{ x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 32, opacity: 0 }}
          transition={{
            x: { type: 'spring' as const, stiffness: 420, damping: 32, mass: 0.8 },
            opacity: { duration: 0.18 },
          }}
          className="w-full will-change-transform"
        >
          <PlaylistDetail
            playlist={activePlaylist}
            onBack={() => onSelectPlaylistId(null)}
          />
        </motion.div>
      ) : (
        <motion.div
          key="playlists-overview"
          initial={{ x: -28, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -28, opacity: 0 }}
          transition={{
            x: { type: 'spring' as const, stiffness: 420, damping: 32, mass: 0.8 },
            opacity: { duration: 0.18 },
          }}
          className="space-y-6 will-change-transform"
        >
          <header className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Playlists
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 tabular-nums">
                {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'} saved locally
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setName('');
                setDescription('');
                setArtworkDataUrl(undefined);
                setShowCreateModal(true);
              }}
              className="min-h-[44px] px-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              New Playlist
            </button>
          </header>

          {playlists.length === 0 ? (
            <EmptyState
              icon={ListMusic}
              title="No playlists yet"
              description="Create custom playlists for workouts, commutes, or late-night listening. Playlists stay stored locally on your device."
              actionLabel="Create Playlist"
              onAction={() => setShowCreateModal(true)}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {playlists.map((pl) => (
                <PlaylistCard
                  key={pl.id}
                  playlist={pl}
                  songMap={songMap}
                  onSelect={(p) => onSelectPlaylistId(p.id)}
                />
              ))}
            </div>
          )}

          {/* Create Playlist Modal (Portaled to document.body to escape transformed container) */}
          {typeof document !== 'undefined' &&
            showCreateModal &&
            createPortal(
              <div
                className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
                onClick={() => setShowCreateModal(false)}
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-playlist-title"
              >
                <form
                  onSubmit={handleCreateSubmit}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#171920] border-t sm:border border-black/10 dark:border-white/10 p-5 sm:p-6 pb-[calc(24px+env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto"
                >
                  <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto mb-2 sm:hidden" />

                  <div className="flex items-center justify-between">
                    <h2 id="create-playlist-title" className="text-lg font-bold text-zinc-900 dark:text-white">
                      New Playlist
                    </h2>
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      aria-label="Close"
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-xl"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <input
                    ref={artInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleArtPick}
                  />

                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => artInputRef.current?.click()}
                      className="w-20 h-20 rounded-2xl overflow-hidden bg-black/5 dark:bg-white/8 border border-black/10 dark:border-white/10 flex items-center justify-center shrink-0"
                    >
                      {artworkDataUrl ? (
                        <img
                          src={artworkDataUrl}
                          alt="Selected cover"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImagePlus className="w-6 h-6 text-zinc-500" />
                      )}
                    </button>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      <button
                        type="button"
                        onClick={() => artInputRef.current?.click()}
                        className="text-sm font-semibold text-[var(--accent)] block"
                      >
                        Select Cover Artwork
                      </button>
                      <span className="mt-0.5 block">
                        Optional — otherwise generated automatically from tracks.
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">
                      Playlist Name
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Night Drive, Morning Run..."
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-black/5 dark:bg-white/7 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">
                      Description
                    </label>
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional description..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/7 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!name.trim()}
                    className="w-full min-h-[48px] rounded-2xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-sm font-semibold transition-colors"
                  >
                    Create Playlist
                  </button>
                </form>
              </div>,
              document.body
            )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
