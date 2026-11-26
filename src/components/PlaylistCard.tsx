import React from 'react';
import { ListMusic } from 'lucide-react';
import type { Playlist, Song } from '../types/music';
import { formatDuration } from '../utils/formatters';
import { AlbumArtwork } from './AlbumArtwork';

interface PlaylistCardProps {
  playlist: Playlist;
  songMap: Map<string, Song>;
  onSelect: (playlist: Playlist) => void;
}

export const PlaylistCard: React.FC<PlaylistCardProps> = ({
  playlist,
  songMap,
  onSelect,
}) => {
  const songs = playlist.songIds
    .map((id) => songMap.get(id))
    .filter((s): s is Song => Boolean(s));
  const totalDuration = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const mosaicSongs = songs.slice(0, 4);

  return (
    <button
      type="button"
      onClick={() => onSelect(playlist)}
      className="group text-left rounded-2xl p-2.5 bg-white/75 dark:bg-[#14161E]/90 border border-black/[0.06] dark:border-white/[0.07] hover:bg-white dark:hover:bg-[#1A1D27] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-800">
        {playlist.artworkDataUrl ? (
          <img
            src={playlist.artworkDataUrl}
            alt={playlist.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : mosaicSongs.length >= 4 ? (
          <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
            {mosaicSongs.map((s) => (
              <AlbumArtwork
                key={s.id}
                artworkId={s.artworkId}
                fallbackKey={`${s.album}-${s.artist}`}
                alt={s.title}
                sizeClass="w-full h-full"
                radiusClass="rounded-none"
              />
            ))}
          </div>
        ) : mosaicSongs.length > 0 ? (
          <AlbumArtwork
            artworkId={mosaicSongs[0].artworkId}
            fallbackKey={`${mosaicSongs[0].album}-${mosaicSongs[0].artist}`}
            alt={playlist.name}
            sizeClass="w-full h-full"
            radiusClass="rounded-none"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[var(--accent-soft)] text-[var(--accent)]">
            <ListMusic className="w-10 h-10 opacity-80" />
          </div>
        )}
      </div>

      <div className="mt-2.5 px-0.5">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
          {playlist.name}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5 tabular-nums">
          {songs.length} {songs.length === 1 ? 'song' : 'songs'}
          {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
        </p>
      </div>
    </button>
  );
};
