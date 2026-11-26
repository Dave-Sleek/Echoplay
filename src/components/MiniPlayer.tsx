import React, { useRef, useState } from 'react';
import { ListMusic, Pause, Play, SkipForward, X } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from 'motion/react';
import { useEchoPlay } from '../context/EchoPlayContext';
import { useLongPress } from '../hooks/useLongPress';
import { formatDuration } from '../utils/formatters';
import { triggerHaptic } from '../utils/haptics';
import { AlbumArtwork } from './AlbumArtwork';

export const MiniPlayer: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    togglePlayPause,
    nextTrack,
    setFullPlayerOpen,
    setQueueOpen,
    dismissMiniPlayer,
  } = useEchoPlay();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const didDragRef = useRef(false);
  const thresholdCrossedRef = useRef(false);
  const [exitDelta, setExitDelta] = useState<{ x: number; y: number }>({ x: 0, y: 110 });
  const [isDismissing, setIsDismissing] = useState(false);

  const opacity = useTransform([x, y], ([lx, ly]: number[]) => {
    const absX = Math.abs(lx);
    const posY = Math.max(0, ly);
    const dragFraction = Math.max(absX / 170, posY / 95);
    return Math.max(0.25, 1 - dragFraction * 0.7);
  });

  const scale = useTransform([x, y], ([lx, ly]: number[]) => {
    const absX = Math.abs(lx);
    const posY = Math.max(0, ly);
    const dragFraction = Math.min(1, Math.max(absX / 170, posY / 95));
    return 1 - dragFraction * 0.04;
  });

  const dismissHintOpacity = useTransform([x, y], ([lx, ly]: number[]) => {
    const absX = Math.abs(lx);
    const posY = Math.max(0, ly);
    const progress = Math.max(absX / 85, posY / 48);
    return Math.min(1, Math.max(0, (progress - 0.35) / 0.65));
  });

  const miniLongPress = useLongPress({
    onLongPress: () => {
      if (didDragRef.current) return;
      setQueueOpen(true);
    },
    onClick: () => {
      if (didDragRef.current) return;
      triggerHaptic('tap');
      setFullPlayerOpen(true);
    },
  });

  const handleDragStart = () => {
    didDragRef.current = true;
    thresholdCrossedRef.current = false;
    setIsDismissing(false);
  };

  const handleDrag = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const willDismiss = info.offset.y > 48 || Math.abs(info.offset.x) > 85;
    const willExpand = info.offset.y < -38;
    const crossed = willDismiss || willExpand;
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
    }, 150);

    // Swipe down -> Dismiss Mini Player
    if (info.offset.y > 48 || info.velocity.y > 320) {
      setExitDelta({ x: 0, y: 120 });
      setIsDismissing(true);
      dismissMiniPlayer();
      return;
    }

    // Swipe horizontally -> Dismiss Mini Player in swipe direction
    if (Math.abs(info.offset.x) > 85 || Math.abs(info.velocity.x) > 480) {
      const dir = info.offset.x !== 0 ? Math.sign(info.offset.x) : Math.sign(info.velocity.x);
      setExitDelta({ x: dir * 320, y: 0 });
      setIsDismissing(true);
      dismissMiniPlayer();
      return;
    }

    // Swipe up -> Expand Full-Screen Player (native iOS gesture)
    if (info.offset.y < -38 || info.velocity.y < -320) {
      triggerHaptic('tap');
      setFullPlayerOpen(true);
    }
  };

  const progress =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <AnimatePresence>
      {currentSong && (
        <div
          key="mini-player-wrapper"
          className="fixed left-0 right-0 lg:left-64 z-30 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] lg:bottom-0 px-2.5 pb-1.5 lg:px-4 lg:pb-3 pointer-events-none"
        >
          <motion.div
            key={currentSong.id}
            initial={{ y: 72, opacity: 0, scale: 0.96 }}
            animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            exit={
              isDismissing
                ? { x: exitDelta.x, y: exitDelta.y, opacity: 0, scale: 0.94 }
                : { y: 72, opacity: 0, scale: 0.96 }
            }
            transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.85 }}
            drag
            dragDirectionLock
            dragConstraints={{ left: -240, right: 240, top: -64, bottom: 120 }}
            dragElastic={0.35}
            dragSnapToOrigin
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            style={{ x, y, opacity, scale, touchAction: 'none' }}
            className="pointer-events-auto relative overflow-hidden rounded-2xl bg-white/92 dark:bg-[#171922]/94 backdrop-blur-xl border border-black/[0.08] dark:border-white/[0.1] shadow-xl will-change-transform"
          >
            {/* Progress bar at top edge */}
            <div className="h-[2.5px] w-full bg-black/5 dark:bg-white/10">
              <div
                className="h-full bg-[var(--accent)] transition-[width] duration-150 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Subtle swipe-to-dismiss pill feedback badge */}
            <motion.div
              style={{ opacity: dismissHintOpacity }}
              className="pointer-events-none absolute top-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-500 dark:text-red-400 text-[10px] font-semibold"
            >
              <X className="w-2.5 h-2.5" />
              <span>Dismiss</span>
            </motion.div>

            <div className="flex items-center justify-between gap-2 px-2.5 py-2 lg:px-4 lg:py-2.5">
              {/* Tap area to expand full-screen player; long-press opens Queue; swipe to dismiss/expand */}
              <button
                type="button"
                {...miniLongPress}
                className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-[44px] rounded-xl select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <AlbumArtwork
                  artworkId={currentSong.artworkId}
                  fallbackKey={`${currentSong.album}-${currentSong.artist}`}
                  alt={currentSong.title}
                  sizeClass="w-11 h-11"
                  radiusClass="rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate leading-tight">
                    {currentSong.title}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                    {currentSong.artist}
                  </p>
                </div>
              </button>

              <div
                className="flex items-center gap-1 shrink-0"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <span className="hidden md:inline text-xs text-zinc-500 dark:text-zinc-400 tabular-nums mr-2">
                  {formatDuration(currentTime)} / {formatDuration(duration)}
                </span>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap');
                    setQueueOpen(true);
                  }}
                  aria-label="Open queue"
                  className="hidden sm:flex min-w-[44px] min-h-[44px] items-center justify-center rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/8 transition-colors"
                >
                  <ListMusic className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={() => void togglePlayPause()}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/8 active:scale-95 transition-all"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void nextTrack()}
                  aria-label="Next track"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/8 active:scale-95 transition-all"
                >
                  <SkipForward className="w-5 h-5 fill-current" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
