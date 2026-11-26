import React, { useState } from 'react';
import { Check, ListMusic, Plus, X } from 'lucide-react';
import { useEchoPlay } from '../context/EchoPlayContext';

export const AddToPlaylistModal: React.FC = () => {
  const {
    playlistTargetForSong,
    setPlaylistTargetForSong,
    playlists,
    addSongsToPlaylist,
    createPlaylist,
  } = useEchoPlay();

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  if (!playlistTargetForSong) return null;

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const pl = await createPlaylist(newName.trim(), '');
      await addSongsToPlaylist(pl.id, [playlistTargetForSong.id]);
      setNewName('');
      setPlaylistTargetForSong(null);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setPlaylistTargetForSong(null)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-playlist-title"
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#171920] border-t sm:border border-black/10 dark:border-white/10 p-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] shadow-2xl max-h-[82dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto mb-3 sm:hidden" />

        <div className="flex items-center justify-between gap-3 pb-3 border-b border-black/8 dark:border-white/8">
          <div className="min-w-0">
            <h3 id="add-playlist-title" className="text-lg font-semibold text-zinc-900 dark:text-white">
              Add to Playlist
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {playlistTargetForSong.title}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPlaylistTargetForSong(null)}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreateAndAdd} className="mt-4 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New playlist name..."
            className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-black/5 dark:bg-white/7 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={!newName.trim() || creating}
            className="min-h-[44px] px-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create
          </button>
        </form>

        <div className="mt-4 overflow-y-auto flex-1 space-y-1">
          {playlists.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-6">
              No playlists yet. Create one above.
            </p>
          ) : (
            playlists.map((pl) => {
              const alreadyIn = pl.songIds.includes(playlistTargetForSong.id);
              return (
                <button
                  key={pl.id}
                  type="button"
                  disabled={alreadyIn}
                  onClick={async () => {
                    await addSongsToPlaylist(pl.id, [playlistTargetForSong.id]);
                    setPlaylistTargetForSong(null);
                  }}
                  className="w-full min-h-[52px] px-3 py-2 rounded-2xl flex items-center justify-between gap-3 hover:bg-black/5 dark:hover:bg-white/6 disabled:opacity-60 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <ListMusic className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                        {pl.name}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                        {pl.songIds.length} {pl.songIds.length === 1 ? 'song' : 'songs'}
                      </p>
                    </div>
                  </div>
                  {alreadyIn && (
                    <span className="text-xs font-medium text-emerald-500 flex items-center gap-1 shrink-0">
                      <Check className="w-4 h-4" /> Added
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
