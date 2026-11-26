import React from 'react';
import { Heart, MoreHorizontal } from 'lucide-react';
import { useEchoPlay } from '../context/EchoPlayContext';
import { useLongPress } from '../hooks/useLongPress';
import type { Song } from '../types/music';
import { formatDuration } from '../utils/formatters';
import { triggerHaptic } from '../utils/haptics';
import { AlbumArtwork } from './AlbumArtwork';

interface SongRowProps {
  song: Song;
  contextQueue?: Song[];
  showAlbum?: boolean;
  indexLabel?: number;
  trailingExtra?: React.ReactNode;
  onRemoveFromContext?: () => void;
  removeContextLabel?: string;
}

export const SongRow: React.FC<SongRowProps> = ({
  song,
  contextQueue,
  showAlbum = true,
  indexLabel,
  trailingExtra,
  onRemoveFromContext,
  removeContextLabel = 'Remove from playlist',
}) => {
  const {
    currentSong,
    isPlaying,
    playSong,
    toggleFavorite,
    setActionSheetTarget,
  } = useEchoPlay();

  const isCurrent = currentSong?.id === song.id;

  const openActions = () => {
    setActionSheetTarget({
      song,
      onRemoveFromContext,
      removeContextLabel,
    });
  };

  const longPressHandlers = useLongPress({
    onLongPress: openActions,
    onClick: () => {
      triggerHaptic('tap');
      void playSong(song, contextQueue);
    },
  });

  return (
    <div
      className={`group relative flex items-center gap-3 px-2 py-2 rounded-2xl transition-colors select-none ${
        isCurrent
          ? 'bg-[var(--accent-soft)]'
          : 'hover:bg-black/[0.035] dark:hover:bg-white/[0.04]'
      }`}
    >
      <button
        type="button"
        {...longPressHandlers}
        className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-xl"
      >
        {indexLabel !== undefined && (
          <span
            className={`w-6 text-center text-xs font-medium tabular-nums shrink-0 ${
              isCurrent ? 'text-[var(--accent)] font-semibold' : 'text-zinc-400 dark:text-zinc-500'
            }`}
          >
            {indexLabel}
          </span>
        )}
        <AlbumArtwork
          artworkId={song.artworkId}
          fallbackKey={`${song.album}-${song.artist}`}
          alt={`${song.title} artwork`}
          sizeClass="w-12 h-12"
          radiusClass="rounded-xl"
          showEqualizer={isCurrent}
          isPlaying={isPlaying}
        />
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-semibold truncate leading-snug ${
              isCurrent ? 'text-[var(--accent)]' : 'text-zinc-900 dark:text-white'
            }`}
          >
            {song.title}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
            <span>{song.artist}</span>
            {showAlbum && song.album && song.album !== 'Single / Unknown Album' && (
              <>
                <span aria-hidden="true"> · </span>
                <span>{song.album}</span>
              </>
            )}
          </p>
        </div>
      </button>

      <div className="flex items-center gap-1 shrink-0">
        {trailingExtra}

        <button
          type="button"
          onClick={() => void toggleFavorite(song.id)}
          aria-label={song.isFavorite ? `Remove ${song.title} from favorites` : `Favorite ${song.title}`}
          className={`min-w-[40px] min-h-[44px] flex items-center justify-center rounded-xl transition-colors ${
            song.isFavorite
              ? 'text-[var(--accent)]'
              : 'text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <Heart className="w-4 h-4" fill={song.isFavorite ? 'currentColor' : 'none'} />
        </button>

        <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums w-10 text-right hidden sm:inline">
          {formatDuration(song.duration)}
        </span>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap');
            openActions();
          }}
          aria-label={`More options for ${song.title}`}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
