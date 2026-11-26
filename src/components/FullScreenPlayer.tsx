import React, { useRef, useState } from 'react';
import {
  ChevronDown,
  FileText,
  Heart,
  Info,
  ListMusic,
  ListPlus,
  MoreHorizontal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
  type Variants,
} from 'motion/react';
import { useEchoPlay } from '../context/EchoPlayContext';
import { useLongPress } from '../hooks/useLongPress';
import { getPaletteForKey } from '../utils/artwork';
import { formatDuration } from '../utils/formatters';
import { triggerHaptic } from '../utils/haptics';
import { AlbumArtwork } from './AlbumArtwork';

export const FullScreenPlayer: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    shuffle,
    repeatMode,
    settings,
    isVolumeReadOnly,
    isFullPlayerOpen,
    setFullPlayerOpen,
    setQueueOpen,
    togglePlayPause,
    nextTrack,
    prevTrack,
    seekTo,
    toggleShuffle,
    cycleRepeat,
    toggleFavorite,
    setVolume,
    setPlaybackRate,
    setPlaylistTargetForSong,
    setInfoTargetSong,
  } = useEchoPlay();

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [slideDirection, setSlideDirection] = useState<number>(1);

  const didDragRef = useRef(false);
  const thresholdCrossedRef = useRef(false);
  const dragX = useMotionValue(0);

  // Dynamic visual HUD cues during drag
  const nextIndicatorOpacity = useTransform(dragX, [-90, -35, -5], [1, 0.75, 0]);
  const nextIndicatorScale = useTransform(dragX, [-90, -35, -5], [1, 0.9, 0.7]);
  const prevIndicatorOpacity = useTransform(dragX, [5, 35, 90], [0, 0.75, 1]);
  const prevIndicatorScale = useTransform(dragX, [5, 35, 90], [0.7, 0.9, 1]);

  const handleDragStart = () => {
    didDragRef.current = true;
    thresholdCrossedRef.current = false;
  };

  const handleDrag = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    dragX.set(info.offset.x);
    const crossed = Math.abs(info.offset.x) > 55 || Math.abs(info.velocity.x) > 350;
    if (crossed && !thresholdCrossedRef.current) {
      thresholdCrossedRef.current = true;
      triggerHaptic('selection');
    } else if (!crossed && thresholdCrossedRef.current) {
      thresholdCrossedRef.current = false;
    }
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    dragX.set(0);
    window.setTimeout(() => {
      didDragRef.current = false;
    }, 150);

    // Swipe left -> Next track
    if (info.offset.x < -55 || info.velocity.x < -350) {
      setSlideDirection(1);
      triggerHaptic('skip');
      void nextTrack();
      return;
    }

    // Swipe right -> Previous track
    if (info.offset.x > 55 || info.velocity.x > 350) {
      setSlideDirection(-1);
      triggerHaptic('skip');
      void prevTrack();
      return;
    }
  };

  const artworkLongPress = useLongPress({
    onLongPress: () => {
      if (didDragRef.current) return;
      setShowMoreMenu(true);
    },
  });

  const artworkVariants: Variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 160 : dir < 0 ? -160 : 0,
      opacity: 0,
      scale: 0.9,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        x: { type: 'spring' as const, stiffness: 360, damping: 28, mass: 0.8 },
        opacity: { duration: 0.22 },
        scale: { duration: 0.22 },
      },
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -160 : dir < 0 ? 160 : 0,
      opacity: 0,
      scale: 0.9,
      transition: {
        x: { type: 'spring' as const, stiffness: 360, damping: 28, mass: 0.8 },
        opacity: { duration: 0.2 },
        scale: { duration: 0.2 },
      },
    }),
  };

  const titleVariants: Variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 30 : dir < 0 ? -30 : 0,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
      transition: { duration: 0.2 },
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -30 : dir < 0 ? 30 : 0,
      opacity: 0,
      transition: { duration: 0.2 },
    }),
  };

  const displayedTime = isScrubbing ? scrubValue : currentTime;
  const effectiveDuration = duration > 0 ? duration : currentSong?.duration || 0;
  const progressPct =
    effectiveDuration > 0
      ? Math.min(100, Math.max(0, (displayedTime / effectiveDuration) * 100))
      : 0;

  const palette = getPaletteForKey(
    currentSong ? `${currentSong.album}-${currentSong.artist}` : 'echoplay'
  );

  const handleHeaderDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 55 || info.velocity.y > 350) {
      triggerHaptic('tap');
      setFullPlayerOpen(false);
    }
  };

  const rates = [0.75, 1, 1.25, 1.5];

  return (
    <AnimatePresence>
      {isFullPlayerOpen && currentSong && (
        <motion.div
          key="fullscreen-player"
          initial={{ y: '100%', opacity: 0.9, scale: 0.985 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: '100%', opacity: 0.9, scale: 0.985 }}
          transition={{
            type: 'spring' as const,
            stiffness: 350,
            damping: 33,
            mass: 0.85,
          }}
          className="fixed inset-0 z-50 flex flex-col bg-[#0C0D12] text-white overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Now Playing"
        >
          {/* Ambient radial artwork wash */}
          <div
            className="pointer-events-none absolute inset-0 opacity-65"
            style={{
              background: `radial-gradient(circle at 50% 24%, ${palette.bg2} 0%, ${palette.bg1} 48%, #0A0B0E 100%)`,
            }}
          />

          {/* Top Bar with iOS Sheet Grab Handle & Drag-to-Dismiss */}
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.3}
            onDragEnd={handleHeaderDragEnd}
            style={{ touchAction: 'pan-x' }}
            className="relative z-10 flex flex-col px-4 pt-[calc(8px+env(safe-area-inset-top,0px))] pb-1"
          >
            {/* Grab Handle */}
            <div
              onClick={() => {
                triggerHaptic('tap');
                setFullPlayerOpen(false);
              }}
              className="w-full flex justify-center py-1 cursor-pointer select-none"
              aria-label="Dismiss full player"
            >
              <div className="w-10 h-1.5 rounded-full bg-white/25 hover:bg-white/40 active:bg-white/50 transition-colors" />
            </div>

            <header className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setFullPlayerOpen(false);
                }}
                aria-label="Minimize player"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-white/8 hover:bg-white/15 transition-colors"
              >
                <ChevronDown className="w-6 h-6" />
              </button>

              <div className="text-center min-w-0 px-3">
                <p className="text-[11px] font-semibold tracking-wider uppercase text-white/60">
                  Now Playing
                </p>
                <p className="text-xs text-white/80 truncate max-w-[200px] sm:max-w-xs">
                  {currentSong.album}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setShowMoreMenu(true);
                }}
                aria-label="More playback options"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-white/8 hover:bg-white/15 transition-colors"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </header>
          </motion.div>

          {/* Main Content with subtle entrance cascade */}
          <motion.div
            initial={{ y: 22, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.06, duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex-1 flex flex-col justify-between max-w-xl w-full mx-auto px-6 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-1 overflow-y-auto"
          >
            {/* Artwork / Lyrics Toggle View with Gesture Carousel */}
            <div className="flex-1 flex flex-col items-center justify-center py-2 sm:py-3 min-h-[320px]">
              {showLyrics ? (
                <div className="w-full h-full max-h-[360px] rounded-3xl bg-black/35 border border-white/10 backdrop-blur-md p-6 flex flex-col">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <span className="text-sm font-semibold text-white">Lyrics</span>
                    <button
                      type="button"
                      onClick={() => setShowLyrics(false)}
                      aria-label="Show album artwork"
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-white/70 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto pt-4 text-sm leading-relaxed text-white/85 whitespace-pre-wrap">
                    {currentSong.lyrics ? (
                      currentSong.lyrics
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center py-8 text-white/55">
                        <FileText className="w-8 h-8 mb-3 opacity-60" />
                        <p className="font-medium text-white/80">No embedded lyrics found</p>
                        <p className="text-xs mt-1.5 max-w-xs">
                          EchoPlay works completely offline and checks your audio file’s embedded ID3/MP4 lyrics tags locally.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative w-full max-w-[310px] sm:max-w-[360px] aspect-square flex items-center justify-center">
                  {/* Next Track HUD Pill (revealed when swiping left) */}
                  <motion.div
                    style={{ opacity: nextIndicatorOpacity, scale: nextIndicatorScale }}
                    className="pointer-events-none absolute right-2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/20 text-white text-xs font-semibold shadow-2xl"
                  >
                    <span>Next</span>
                    <SkipForward className="w-3.5 h-3.5 text-[var(--accent)]" />
                  </motion.div>

                  {/* Previous Track HUD Pill (revealed when swiping right) */}
                  <motion.div
                    style={{ opacity: prevIndicatorOpacity, scale: prevIndicatorScale }}
                    className="pointer-events-none absolute left-2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/20 text-white text-xs font-semibold shadow-2xl"
                  >
                    <SkipBack className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>Previous</span>
                  </motion.div>

                  {/* Animated & Draggable Artwork Carousel Item */}
                  <AnimatePresence mode="popLayout" custom={slideDirection} initial={false}>
                    <motion.div
                      key={currentSong.id}
                      custom={slideDirection}
                      variants={artworkVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      drag="x"
                      dragDirectionLock
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.45}
                      dragSnapToOrigin
                      onDragStart={handleDragStart}
                      onDrag={handleDrag}
                      onDragEnd={handleDragEnd}
                      {...artworkLongPress}
                      style={{ touchAction: 'pan-y' }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Swipe left for next track, swipe right for previous track. Currently playing: ${currentSong.title}`}
                      className={`w-full h-full select-none cursor-grab active:cursor-grabbing will-change-transform transition-transform duration-300 ease-out focus:outline-none ${
                        isPlaying ? 'scale-100' : 'scale-[0.93]'
                      }`}
                    >
                      <AlbumArtwork
                        artworkId={currentSong.artworkId}
                        fallbackKey={`${currentSong.album}-${currentSong.artist}`}
                        alt={`${currentSong.title} cover art`}
                        sizeClass="w-full h-full"
                        radiusClass="rounded-3xl"
                        className="shadow-[0_24px_60px_rgba(0,0,0,0.55)] ring-1 ring-white/10 pointer-events-none"
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}

              {/* Subtle gesture hint */}
              {!showLyrics && (
                <div className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-white/40 font-medium select-none">
                  <span>Swipe artwork to skip track</span>
                </div>
              )}
            </div>

            {/* Track Meta & Controls */}
            <div className="space-y-4 pt-1">
              {/* Title, Artist, Favorite with smooth slide transition */}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1 overflow-hidden">
                  <AnimatePresence mode="popLayout" custom={slideDirection} initial={false}>
                    <motion.div
                      key={currentSong.id}
                      custom={slideDirection}
                      variants={titleVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                    >
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white truncate">
                        {currentSong.title}
                      </h2>
                      <p className="text-sm sm:text-base text-white/70 truncate mt-0.5">
                        {currentSong.artist}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleFavorite(currentSong.id)}
                  aria-label={
                    currentSong.isFavorite ? 'Remove from favorites' : 'Add to favorites'
                  }
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-colors shrink-0 ${
                    currentSong.isFavorite
                      ? 'text-[var(--accent)] bg-white/10'
                      : 'text-white/70 hover:text-white bg-white/5'
                  }`}
                >
                  <Heart
                    className="w-5 h-5"
                    fill={currentSong.isFavorite ? 'currentColor' : 'none'}
                  />
                </button>
              </div>

              {/* Scrubber */}
              <div>
                <input
                  type="range"
                  min={0}
                  max={effectiveDuration || 100}
                  step={0.25}
                  value={Math.min(displayedTime, effectiveDuration || 100)}
                  aria-label="Seek audio position"
                  onPointerDown={() => {
                    triggerHaptic('selection');
                    setIsScrubbing(true);
                    setScrubValue(currentTime);
                  }}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setScrubValue(val);
                    if (!isScrubbing) seekTo(val);
                  }}
                  onPointerUp={() => {
                    triggerHaptic('selection');
                    seekTo(scrubValue);
                    setIsScrubbing(false);
                  }}
                  onTouchEnd={() => {
                    seekTo(scrubValue);
                    setIsScrubbing(false);
                  }}
                  className="echo-slider w-full h-6"
                  style={{
                    backgroundImage: `linear-gradient(to right, #ffffff ${progressPct}%, rgba(255,255,255,0.22) ${progressPct}%)`,
                    backgroundSize: '100% 4px',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                  }}
                />
                <div className="flex items-center justify-between text-xs text-white/60 tabular-nums -mt-0.5">
                  <span>{formatDuration(displayedTime)}</span>
                  <span>{formatDuration(effectiveDuration)}</span>
                </div>
              </div>

              {/* Primary Transport Controls */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={toggleShuffle}
                  aria-label={shuffle ? 'Disable shuffle' : 'Enable shuffle'}
                  aria-pressed={shuffle}
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-colors ${
                    shuffle ? 'text-[var(--accent)] bg-white/10' : 'text-white/65 hover:text-white'
                  }`}
                >
                  <Shuffle className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSlideDirection(-1);
                    void prevTrack();
                  }}
                  aria-label="Previous track"
                  className="min-w-[52px] min-h-[52px] flex items-center justify-center rounded-full text-white hover:bg-white/10 active:scale-95 transition-all"
                >
                  <SkipBack className="w-7 h-7 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={() => void togglePlayPause()}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className="w-[68px] h-[68px] flex items-center justify-center rounded-full bg-white text-[#0A0B0E] shadow-xl hover:scale-[1.03] active:scale-95 transition-transform"
                >
                  {isPlaying ? (
                    <Pause className="w-7 h-7 fill-current" />
                  ) : (
                    <Play className="w-7 h-7 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSlideDirection(1);
                    void nextTrack();
                  }}
                  aria-label="Next track"
                  className="min-w-[52px] min-h-[52px] flex items-center justify-center rounded-full text-white hover:bg-white/10 active:scale-95 transition-all"
                >
                  <SkipForward className="w-7 h-7 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={cycleRepeat}
                  aria-label={`Repeat mode: ${repeatMode}`}
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-colors ${
                    repeatMode !== 'off'
                      ? 'text-[var(--accent)] bg-white/10'
                      : 'text-white/65 hover:text-white'
                  }`}
                >
                  {repeatMode === 'one' ? (
                    <Repeat1 className="w-5 h-5" />
                  ) : (
                    <Repeat className="w-5 h-5" />
                  )}
                </button>
              </div>

              {/* Volume Control */}
              <div className="flex items-center gap-3 px-1">
                {settings.volume === 0 && !isVolumeReadOnly ? (
                  <VolumeX className="w-4 h-4 text-white/55 shrink-0" />
                ) : (
                  <Volume2 className="w-4 h-4 text-white/55 shrink-0" />
                )}
                {isVolumeReadOnly ? (
                  <p className="text-xs text-white/55">
                    Use your iPhone side volume buttons to adjust volume
                  </p>
                ) : (
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={settings.volume}
                    aria-label="Volume"
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="echo-slider flex-1 h-6"
                    style={{
                      backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.85) ${
                        settings.volume * 100
                      }%, rgba(255,255,255,0.2) ${settings.volume * 100}%)`,
                      backgroundSize: '100% 4px',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                    }}
                  />
                )}
              </div>

              {/* Bottom Utility Bar: Lyrics, Speed, Queue */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap');
                    setShowLyrics((v) => !v);
                  }}
                  className={`min-h-[44px] px-3.5 rounded-xl flex items-center gap-2 text-xs font-semibold transition-colors ${
                    showLyrics
                      ? 'bg-white/18 text-white'
                      : 'bg-white/6 text-white/75 hover:bg-white/12 hover:text-white'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Lyrics
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap');
                    const idx = rates.indexOf(settings.playbackRate);
                    const nextRate = rates[(idx + 1) % rates.length];
                    setPlaybackRate(nextRate);
                  }}
                  aria-label="Change playback speed"
                  className="min-h-[44px] px-3.5 rounded-xl bg-white/6 hover:bg-white/12 text-xs font-semibold text-white/75 hover:text-white tabular-nums transition-colors"
                >
                  {settings.playbackRate}x Speed
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap');
                    setQueueOpen(true);
                  }}
                  className="min-h-[44px] px-3.5 rounded-xl bg-white/6 hover:bg-white/12 text-xs font-semibold text-white/75 hover:text-white flex items-center gap-2 transition-colors"
                >
                  <ListMusic className="w-4 h-4" />
                  Queue
                </button>
              </div>
            </div>
          </motion.div>

          {/* More Options Sheet inside Full Player */}
          {showMoreMenu && (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
              onClick={() => setShowMoreMenu(false)}
            >
              <div
                className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#181B24] border-t sm:border border-white/10 p-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] text-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4 sm:hidden" />
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap');
                    setPlaylistTargetForSong(currentSong);
                    setShowMoreMenu(false);
                  }}
                  className="w-full min-h-[48px] px-3 flex items-center gap-3 rounded-xl text-sm font-medium hover:bg-white/8 transition-colors text-left"
                >
                  <ListPlus className="w-4 h-4 text-white/70" />
                  Add to Playlist
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap');
                    setInfoTargetSong(currentSong);
                    setShowMoreMenu(false);
                  }}
                  className="w-full min-h-[48px] px-3 flex items-center gap-3 rounded-xl text-sm font-medium hover:bg-white/8 transition-colors text-left"
                >
                  <Info className="w-4 h-4 text-white/70" />
                  Track Info
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap');
                    setShowLyrics((v) => !v);
                    setShowMoreMenu(false);
                  }}
                  className="w-full min-h-[48px] px-3 flex items-center gap-3 rounded-xl text-sm font-medium hover:bg-white/8 transition-colors text-left"
                >
                  <FileText className="w-4 h-4 text-white/70" />
                  {showLyrics ? 'Show Album Art' : 'View Lyrics'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap');
                    setShowMoreMenu(false);
                  }}
                  className="mt-2 w-full min-h-[44px] rounded-xl bg-white/10 text-sm font-semibold hover:bg-white/15 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
