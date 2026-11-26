import React from 'react';
import { X } from 'lucide-react';
import { useEchoPlay } from '../context/EchoPlayContext';
import { formatBytes, formatDuration } from '../utils/formatters';
import { AlbumArtwork } from './AlbumArtwork';

export const SongInfoModal: React.FC = () => {
  const { infoTargetSong, setInfoTargetSong } = useEchoPlay();

  if (!infoTargetSong) return null;

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Title', value: infoTargetSong.title },
    { label: 'Artist', value: infoTargetSong.artist },
    { label: 'Album', value: infoTargetSong.album },
    { label: 'Duration', value: formatDuration(infoTargetSong.duration) },
    { label: 'Format', value: infoTargetSong.format },
    { label: 'File Size', value: formatBytes(infoTargetSong.fileSize) },
    ...(infoTargetSong.year ? [{ label: 'Year', value: infoTargetSong.year }] : []),
    ...(infoTargetSong.trackNumber
      ? [{ label: 'Track', value: String(infoTargetSong.trackNumber) }]
      : []),
    ...(infoTargetSong.replayGainDb !== undefined
      ? [
          {
            label: 'ReplayGain',
            value: `${infoTargetSong.replayGainDb > 0 ? '+' : ''}${infoTargetSong.replayGainDb} dB`,
          },
        ]
      : []),
    { label: 'Plays', value: String(infoTargetSong.playCount || 0) },
    {
      label: 'Added',
      value: new Date(infoTargetSong.addedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    },
    { label: 'File Name', value: infoTargetSong.fileName },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setInfoTargetSong(null)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="song-info-title"
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#171920] border-t sm:border border-black/10 dark:border-white/10 p-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] shadow-2xl max-h-[85dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto mb-3 sm:hidden" />

        <div className="flex items-center justify-between gap-3 pb-4 border-b border-black/8 dark:border-white/8">
          <h3 id="song-info-title" className="text-lg font-semibold text-zinc-900 dark:text-white">
            Track Info
          </h3>
          <button
            type="button"
            onClick={() => setInfoTargetSong(null)}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <AlbumArtwork
            artworkId={infoTargetSong.artworkId}
            fallbackKey={`${infoTargetSong.album}-${infoTargetSong.artist}`}
            alt={infoTargetSong.title}
            sizeClass="w-16 h-16"
            radiusClass="rounded-2xl"
          />
          <div className="min-w-0">
            <p className="text-base font-semibold text-zinc-900 dark:text-white truncate">
              {infoTargetSong.title}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
              {infoTargetSong.artist}
            </p>
          </div>
        </div>

        <dl className="mt-5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {rows.map((row) => (
            <div key={row.label} className="py-2.5 flex items-baseline justify-between gap-4">
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400 shrink-0">
                {row.label}
              </dt>
              <dd className="text-sm text-zinc-900 dark:text-zinc-100 text-right truncate tabular-nums">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
};
