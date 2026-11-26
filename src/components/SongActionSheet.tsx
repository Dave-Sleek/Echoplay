import React, { useState } from 'react';
import {
  Heart,
  Info,
  ListEnd,
  ListPlus,
  ListStart,
  Trash2,
} from 'lucide-react';
import { useEchoPlay } from '../context/EchoPlayContext';
import { formatDuration } from '../utils/formatters';
import { triggerHaptic } from '../utils/haptics';
import { AlbumArtwork } from './AlbumArtwork';
import { ConfirmDialog } from './ConfirmDialog';

export const SongActionSheet: React.FC = () => {
  const {
    actionSheetTarget,
    setActionSheetTarget,
    songs,
    playNext,
    addToQueue,
    setPlaylistTargetForSong,
    setInfoTargetSong,
    toggleFavorite,
    removeSong,
  } = useEchoPlay();

  const [pendingDeleteSongId, setPendingDeleteSongId] = useState<string | null>(null);
  const [pendingDeleteTitle, setPendingDeleteTitle] = useState<string>('');

  const liveSong = actionSheetTarget
    ? songs.find((s) => s.id === actionSheetTarget.song.id) ?? actionSheetTarget.song
    : null;

  return (
    <>
      {actionSheetTarget && liveSong && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm"
          onClick={() => setActionSheetTarget(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#171920] border-t sm:border border-black/10 dark:border-white/10 p-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto mb-4 sm:hidden" />

            <div className="flex items-center gap-3 pb-4 border-b border-black/8 dark:border-white/8">
              <AlbumArtwork
                artworkId={liveSong.artworkId}
                fallbackKey={`${liveSong.album}-${liveSong.artist}`}
                alt={liveSong.title}
                sizeClass="w-12 h-12"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                  {liveSong.title}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5 tabular-nums">
                  {liveSong.artist} · {formatDuration(liveSong.duration)}
                </p>
              </div>
            </div>

            <div className="mt-2 flex flex-col">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  playNext(liveSong);
                  setActionSheetTarget(null);
                }}
                className="min-h-[48px] px-3 flex items-center gap-3 rounded-xl text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/6 transition-colors text-left"
              >
                <ListStart className="w-4 h-4 text-zinc-500" />
                Play Next
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  addToQueue(liveSong);
                  setActionSheetTarget(null);
                }}
                className="min-h-[48px] px-3 flex items-center gap-3 rounded-xl text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/6 transition-colors text-left"
              >
                <ListEnd className="w-4 h-4 text-zinc-500" />
                Add to Queue
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setPlaylistTargetForSong(liveSong);
                  setActionSheetTarget(null);
                }}
                className="min-h-[48px] px-3 flex items-center gap-3 rounded-xl text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/6 transition-colors text-left"
              >
                <ListPlus className="w-4 h-4 text-zinc-500" />
                Add to Playlist
              </button>

              <button
                type="button"
                onClick={() => {
                  void toggleFavorite(liveSong.id);
                  setActionSheetTarget(null);
                }}
                className="min-h-[48px] px-3 flex items-center gap-3 rounded-xl text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/6 transition-colors text-left"
              >
                <Heart
                  className={`w-4 h-4 ${
                    liveSong.isFavorite ? 'text-[var(--accent)]' : 'text-zinc-500'
                  }`}
                  fill={liveSong.isFavorite ? 'currentColor' : 'none'}
                />
                {liveSong.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setInfoTargetSong(liveSong);
                  setActionSheetTarget(null);
                }}
                className="min-h-[48px] px-3 flex items-center gap-3 rounded-xl text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/6 transition-colors text-left"
              >
                <Info className="w-4 h-4 text-zinc-500" />
                Track Info
              </button>

              {actionSheetTarget.onRemoveFromContext && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap');
                    actionSheetTarget.onRemoveFromContext?.();
                    setActionSheetTarget(null);
                  }}
                  className="min-h-[48px] px-3 flex items-center gap-3 rounded-xl text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors text-left"
                >
                  <Trash2 className="w-4 h-4" />
                  {actionSheetTarget.removeContextLabel || 'Remove from playlist'}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setPendingDeleteSongId(liveSong.id);
                  setPendingDeleteTitle(liveSong.title);
                  setActionSheetTarget(null);
                }}
                className="min-h-[48px] px-3 flex items-center gap-3 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors text-left"
              >
                <Trash2 className="w-4 h-4" />
                Delete from Device
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteSongId !== null}
        title="Delete song from device?"
        description={`"${pendingDeleteTitle}" will be permanently removed from EchoPlay's local IndexedDB storage and any playlists containing it.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setPendingDeleteSongId(null)}
        onConfirm={() => {
          if (pendingDeleteSongId) {
            void removeSong(pendingDeleteSongId);
          }
          setPendingDeleteSongId(null);
        }}
      />
    </>
  );
};
