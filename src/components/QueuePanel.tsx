import React, { useRef } from 'react';
import { ArrowDown, ArrowUp, ListMusic, Trash2, X } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from 'motion/react';
import { useEchoPlay } from '../context/EchoPlayContext';
import type { Song } from '../types/music';
import { formatDuration } from '../utils/formatters';
import { triggerHaptic } from '../utils/haptics';
import { AlbumArtwork } from './AlbumArtwork';

interface QueueItemRowProps {
  song: Song;
  absIdx: number;
  isFirstUpcoming: boolean;
  isLastInQueue: boolean;
  onPlay: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

const SWIPE_DISMISS_THRESHOLD = -88;

const QueueItemRow: React.FC<QueueItemRowProps> = ({
  song,
  isFirstUpcoming,
  isLastInQueue,
  onPlay,
  onMoveUp,
  onMoveDown,
  onRemove,
}) => {
  const x = useMotionValue(0);
  const didDragRef = useRef(false);
  const thresholdCrossedRef = useRef(false);

  const deleteBgOpacity = useTransform(x, [-110, -24, 0], [1, 0.55, 0]);
  const deleteIconScale = useTransform(x, [-110, -48, 0], [1.08, 0.92, 0.75]);

  const handleDragStart = () => {
    didDragRef.current = true;
    thresholdCrossedRef.current = false;
  };

  const handleDrag = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const crossed = info.offset.x <= SWIPE_DISMISS_THRESHOLD;
    if (crossed && !thresholdCrossedRef.current) {
      thresholdCrossedRef.current = true;
      triggerHaptic('selection');
    } else if (!crossed && thresholdCrossedRef.current) {
      thresholdCrossedRef.current = false;
    }
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    window.setTimeout(() => {
      didDragRef.current = false;
    }, 140);

    if (info.offset.x <= SWIPE_DISMISS_THRESHOLD || info.velocity.x <= -420) {
      onRemove();
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -320, height: 0, marginBottom: 0 }}
      transition={{ type: 'spring', stiffness: 440, damping: 34 }}
      className="relative overflow-hidden rounded-2xl"
    >
      {/* iOS-style red swipe-to-dismiss reveal layer */}
      <motion.div
        style={{ opacity: deleteBgOpacity }}
        aria-hidden="true"
        className="absolute inset-0 bg-red-500 dark:bg-red-600 rounded-2xl flex items-center justify-end px-4 text-white pointer-events-none"
      >
        <motion.div
          style={{ scale: deleteIconScale }}
          className="flex items-center gap-1.5 text-xs font-semibold"
        >
          <Trash2 className="w-4 h-4" />
          <span>Remove</span>
        </motion.div>
      </motion.div>

      {/* Foreground draggable queue row */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -240, right: 0 }}
        dragElastic={{ left: 0.45, right: 0.1 }}
        dragSnapToOrigin
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{ x, touchAction: 'pan-y' }}
        className="relative flex items-center gap-2.5 px-2 py-1.5 rounded-2xl bg-white dark:bg-[#151821] hover:bg-zinc-50 dark:hover:bg-[#1B1F2B] transition-colors"
      >
        <button
          type="button"
          onClick={() => {
            if (didDragRef.current) return;
            triggerHaptic('tap');
            onPlay();
          }}
          className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-[44px]"
        >
          <AlbumArtwork
            artworkId={song.artworkId}
            fallbackKey={`${song.album}-${song.artist}`}
            alt={song.title}
            sizeClass="w-10 h-10"
            radiusClass="rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
              {song.title}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {song.artist} · {formatDuration(song.duration)}
            </p>
          </div>
        </button>

        <div
          className="flex items-center shrink-0"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={isFirstUpcoming}
            onClick={onMoveUp}
            aria-label={`Move ${song.title} up`}
            className="min-w-[36px] min-h-[44px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-25"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={isLastInQueue}
            onClick={onMoveDown}
            aria-label={`Move ${song.title} down`}
            className="min-w-[36px] min-h-[44px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-25"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${song.title} from queue`}
            className="min-w-[36px] min-h-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export const QueuePanel: React.FC = () => {
  const {
    isQueueOpen,
    setQueueOpen,
    queue,
    currentIndex,
    isPlaying,
    playList,
    removeFromQueue,
    reorderQueue,
    clearQueue,
  } = useEchoPlay();

  const currentSong = currentIndex >= 0 ? queue[currentIndex] : undefined;
  const upcoming = queue.slice(currentIndex + 1);

  return (
    <AnimatePresence>
      {isQueueOpen && (
        <motion.div
          key="queue-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => {
            triggerHaptic('tap');
            setQueueOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="queue-title"
        >
          <motion.div
            key="queue-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#151821] border-t sm:border border-black/10 dark:border-white/10 p-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] shadow-2xl h-[82dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto mb-3 sm:hidden" />

            <div className="flex items-center justify-between gap-3 pb-3 border-b border-black/8 dark:border-white/8">
              <div className="flex items-center gap-2.5">
                <ListMusic className="w-5 h-5 text-[var(--accent)]" />
                <h2 id="queue-title" className="text-lg font-bold text-zinc-900 dark:text-white">
                  Playing Queue
                </h2>
              </div>
              <div className="flex items-center gap-1">
                {upcoming.length > 0 && (
                  <button
                    type="button"
                    onClick={clearQueue}
                    className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors whitespace-nowrap"
                  >
                    Clear Up Next
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap');
                    setQueueOpen(false);
                  }}
                  aria-label="Close queue"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto mt-4 space-y-5">
              {currentSong && (
                <div>
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2 px-1">
                    Now Playing
                  </p>
                  <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-[var(--accent-soft)]">
                    <AlbumArtwork
                      artworkId={currentSong.artworkId}
                      fallbackKey={`${currentSong.album}-${currentSong.artist}`}
                      alt={currentSong.title}
                      sizeClass="w-12 h-12"
                      showEqualizer
                      isPlaying={isPlaying}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--accent)] truncate">
                        {currentSong.title}
                      </p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 truncate mt-0.5">
                        {currentSong.artist} · {formatDuration(currentSong.duration)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Up Next ({upcoming.length})
                  </p>
                  {upcoming.length > 0 && (
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      Swipe left to remove
                    </p>
                  )}
                </div>

                {upcoming.length === 0 ? (
                  <div className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    No upcoming songs in the queue.
                  </div>
                ) : (
                  <div className="space-y-1">
                    <AnimatePresence initial={false}>
                      {(() => {
                        const seenCounts = new Map<string, number>();
                        return upcoming.map((song, relIdx) => {
                          const absIdx = currentIndex + 1 + relIdx;
                          const occ = seenCounts.get(song.id) ?? 0;
                          seenCounts.set(song.id, occ + 1);
                          return (
                            <QueueItemRow
                              key={`${song.id}-${occ}`}
                              song={song}
                              absIdx={absIdx}
                              isFirstUpcoming={relIdx === 0}
                              isLastInQueue={absIdx === queue.length - 1}
                              onPlay={() => void playList(queue, absIdx)}
                              onMoveUp={() => reorderQueue(absIdx, absIdx - 1)}
                              onMoveDown={() => reorderQueue(absIdx, absIdx + 1)}
                              onRemove={() => removeFromQueue(absIdx)}
                            />
                          );
                        });
                      })()}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
