import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownCircle, Clock, FileText, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { formatDuration } from '../utils/formatters';
import { triggerHaptic } from '../utils/haptics';
import { formatLrcTimestamp, getActiveLyricIndex, parseLyrics } from '../utils/lyrics';

interface SpotifyLyricsPanelProps {
  songId: string;
  lyrics?: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  palette: { bg1: string; bg2: string; accent: string };
  onSeek: (seconds: number) => void;
  onSaveLyrics: (lyrics: string) => Promise<void>;
  onClose: () => void;
}

export const SpotifyLyricsPanel: React.FC<SpotifyLyricsPanelProps> = ({
  songId,
  lyrics,
  currentTime,
  duration,
  isPlaying,
  palette,
  onSeek,
  onSaveLyrics,
  onClose,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [isManualScroll, setIsManualScroll] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLElement | null>>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const manualTimeoutRef = useRef<number | null>(null);
  const isProgrammaticScrollRef = useRef(false);

  const parsed = useMemo(() => parseLyrics(lyrics), [lyrics]);
  const activeIndex = useMemo(
    () => getActiveLyricIndex(parsed, currentTime, duration),
    [parsed, currentTime, duration]
  );

  // Reset edit/scroll state when song changes
  useEffect(() => {
    setIsEditing(false);
    setIsManualScroll(false);
    lineRefs.current = [];
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [songId]);

  useEffect(() => {
    return () => {
      if (manualTimeoutRef.current !== null) {
        window.clearTimeout(manualTimeoutRef.current);
      }
    };
  }, []);

  const scrollToActiveLine = (behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const targetIdx = activeIndex >= 0 ? activeIndex : 0;
    const el = lineRefs.current[targetIdx];
    if (!el) return;

    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const currentScroll = container.scrollTop;
    const offsetInsideContainer = elRect.top - containerRect.top + currentScroll;
    const desiredTop = Math.max(
      0,
      offsetInsideContainer - container.clientHeight * 0.36 + elRect.height * 0.5
    );

    isProgrammaticScrollRef.current = true;
    container.scrollTo({ top: desiredTop, behavior });
    window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 380);
  };

  // Auto-center active lyric line smoothly like Spotify
  useEffect(() => {
    if (isEditing || isManualScroll || parsed.lines.length === 0) return;
    scrollToActiveLine('smooth');
  }, [activeIndex, isEditing, isManualScroll, parsed.lines.length]);

  const handleUserScroll = () => {
    if (isProgrammaticScrollRef.current || isEditing) return;
    setIsManualScroll(true);
    if (manualTimeoutRef.current !== null) {
      window.clearTimeout(manualTimeoutRef.current);
    }
    manualTimeoutRef.current = window.setTimeout(() => {
      setIsManualScroll(false);
    }, 5000);
  };

  const handleStampTimestamp = () => {
    triggerHaptic('selection');
    const tag = `${formatLrcTimestamp(currentTime)} `;
    const ta = textareaRef.current;
    if (!ta) {
      setEditText((prev) => (prev ? `${prev}\n${tag}` : tag));
      return;
    }
    const start = ta.selectionStart ?? editText.length;
    const end = ta.selectionEnd ?? editText.length;
    const before = editText.slice(0, start);
    const after = editText.slice(end);
    const next = `${before}${tag}${after}`;
    setEditText(next);
    window.requestAnimationFrame(() => {
      ta.focus();
      const pos = start + tag.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const statusLabel = !lyrics
    ? 'No Lyrics'
    : parsed.isSynced
      ? 'Synced Lyrics'
      : 'Embedded Lyrics';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 10 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: `linear-gradient(155deg, ${palette.bg2}F0 0%, ${palette.bg1}F5 62%, #0B0C11 100%)`,
      }}
      className="relative w-full h-full min-h-[320px] max-h-[430px] sm:max-h-[470px] rounded-3xl border border-white/15 p-4 sm:p-6 flex flex-col shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/12 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-tight text-white">Lyrics</span>
            {parsed.isSynced && isPlaying && (
              <span className="inline-flex items-end gap-[2px] h-3" aria-hidden="true">
                <span className="w-[2.5px] bg-white/85 rounded-full animate-[pulse_0.85s_ease-in-out_infinite] h-2" />
                <span className="w-[2.5px] bg-white/85 rounded-full animate-[pulse_0.65s_ease-in-out_infinite_0.15s] h-3" />
                <span className="w-[2.5px] bg-white/85 rounded-full animate-[pulse_0.95s_ease-in-out_infinite_0.3s] h-1.5" />
              </span>
            )}
          </div>
          <p className="text-[11px] font-medium text-white/60 mt-0.5">{statusLabel}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isEditing && (
            <button
              type="button"
              onClick={handleStampTimestamp}
              title="Insert current playback timestamp at cursor"
              className="min-h-[44px] px-3 rounded-xl bg-white/12 hover:bg-white/20 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors tabular-nums"
            >
              <Clock className="w-3.5 h-3.5" />
              +{formatDuration(currentTime)}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap');
              if (!isEditing) {
                setEditText(lyrics || '');
                setIsEditing(true);
              } else {
                void onSaveLyrics(editText.trim());
                setIsEditing(false);
                setIsManualScroll(false);
              }
            }}
            className="min-h-[44px] px-3.5 rounded-xl bg-white/14 hover:bg-white/22 text-xs font-semibold text-white transition-colors"
          >
            {isEditing ? 'Save' : 'Edit'}
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap');
              setIsEditing(false);
              onClose();
            }}
            aria-label="Show album artwork"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-white/75 hover:text-white hover:bg-white/12 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      {isEditing ? (
        <div className="flex-1 flex flex-col gap-2 pt-3 min-h-0">
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="Paste lyrics or [00:12.34] LRC synced lines here..."
            className="w-full flex-1 p-3.5 rounded-2xl bg-black/35 border border-white/12 text-white text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-white/60 resize-none"
          />
          <p className="text-[11px] text-white/55">
            Tap +{formatDuration(currentTime)} to stamp the live timestamp at your cursor.
          </p>
        </div>
      ) : parsed.lines.length > 0 ? (
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollContainerRef}
            onScroll={handleUserScroll}
            onTouchStart={handleUserScroll}
            onWheel={handleUserScroll}
            style={{
              maskImage:
                'linear-gradient(to bottom, transparent 0%, black 10%, black 86%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to bottom, transparent 0%, black 10%, black 86%, transparent 100%)',
            }}
            className="h-full overflow-y-auto overscroll-contain pt-8 pb-24 px-1 space-y-4 no-scrollbar"
          >
            {/* Spotify-style intro instrumental indicator before first lyric */}
            {parsed.isSynced && activeIndex === -1 && (
              <motion.div
                initial={{ opacity: 0.4, scale: 0.95 }}
                animate={{
                  opacity: isPlaying ? [0.45, 1, 0.45] : 0.55,
                  scale: isPlaying ? [0.96, 1.04, 0.96] : 1,
                }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                className="flex items-center gap-2 py-2 pl-1"
                aria-label="Instrumental intro"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-white" />
                <span className="w-2.5 h-2.5 rounded-full bg-white/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-white/60" />
              </motion.div>
            )}

            {parsed.lines.map((line, i) => {
              if (!line.text) {
                return <div key={line.id} className="h-3" aria-hidden="true" />;
              }

              const isActive = i === activeIndex;
              const isPast = activeIndex >= 0 && i < activeIndex;
              const isNext = i === activeIndex + 1;
              const canSeek = line.time !== null;

              const targetOpacity = isActive
                ? 1
                : isPast
                  ? 0.3
                  : isNext
                    ? 0.65
                    : 0.44;
              const targetScale = isActive ? 1.03 : 0.98;

              return (
                <motion.button
                  key={`${songId}-${line.id}`}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  type="button"
                  disabled={!canSeek}
                  onClick={() => {
                    if (line.time === null) return;
                    triggerHaptic('selection');
                    setIsManualScroll(false);
                    onSeek(line.time);
                  }}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{
                    opacity: targetOpacity,
                    scale: targetScale,
                    y: 0,
                  }}
                  transition={{
                    opacity: { duration: 0.32, ease: 'easeOut' },
                    scale: { type: 'spring', stiffness: 280, damping: 24 },
                    y: { duration: 0.28, delay: Math.min(i * 0.015, 0.22) },
                  }}
                  style={{
                    transformOrigin: 'left center',
                    textShadow: isActive ? '0 2px 24px rgba(255, 255, 255, 0.26)' : 'none',
                  }}
                  className={`block w-full text-left font-bold tracking-tight leading-[1.28] transition-colors focus:outline-none ${
                    isActive
                      ? 'text-[21px] sm:text-2xl text-white'
                      : 'text-[18px] sm:text-[21px] text-white'
                  } ${canSeek ? 'cursor-pointer hover:!opacity-90 active:scale-[0.99]' : 'cursor-default'}`}
                >
                  {line.text}
                </motion.button>
              );
            })}
          </div>

          <AnimatePresence>
            {isManualScroll && parsed.lines.length > 4 && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setIsManualScroll(false);
                  scrollToActiveLine('smooth');
                }}
                className="absolute bottom-2 right-1 min-h-[40px] px-3.5 rounded-full bg-white text-[#0A0B0E] text-xs font-bold shadow-xl inline-flex items-center gap-1.5 hover:scale-[1.02] active:scale-95 transition-transform"
              >
                <ArrowDownCircle className="w-3.5 h-3.5" />
                Sync
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-white/65">
          <FileText className="w-8 h-8 mb-3 opacity-60" />
          <p className="font-semibold text-white/90">No embedded or saved lyrics found</p>
          <p className="text-xs mt-1.5 max-w-xs text-white/65">
            Tap Edit above to paste static or [00:12.34] time-synced lyrics for this track.
          </p>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap');
              setEditText('');
              setIsEditing(true);
            }}
            className="mt-4 min-h-[44px] px-5 rounded-xl bg-white text-[#0A0B0E] text-xs font-bold shadow-lg"
          >
            Add Lyrics
          </button>
        </div>
      )}
    </motion.div>
  );
};
