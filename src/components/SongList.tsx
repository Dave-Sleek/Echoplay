import React from 'react';
import type { Song } from '../types/music';
import { SongRow } from './SongRow';

interface SongListProps {
  songs: Song[];
  contextQueue?: Song[];
  showAlbum?: boolean;
  numbered?: boolean;
}

export const SongList: React.FC<SongListProps> = ({
  songs,
  contextQueue,
  showAlbum = true,
  numbered = false,
}) => {
  const queue = contextQueue ?? songs;
  return (
    <div className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
      {songs.map((song, idx) => (
        <SongRow
          key={song.id}
          song={song}
          contextQueue={queue}
          showAlbum={showAlbum}
          indexLabel={numbered ? idx + 1 : undefined}
        />
      ))}
    </div>
  );
};
