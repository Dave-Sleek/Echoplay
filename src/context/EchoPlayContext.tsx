import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  clearMusicLibraryInDB,
  clearRecentlyPlayedInDB,
  DEFAULT_SETTINGS,
  deleteAllLocalDataInDB,
  deletePlaylistById,
  deleteSongById,
  getAllArtworks,
  getAllPlaylists,
  getAllSongs,
  getAudioFileBlob,
  getPlaybackSnapshot,
  getUserSettings,
  saveImportedSong,
  savePlaybackSnapshot,
  savePlaylist,
  saveUserSettings,
  updateSong,
} from '../db/indexedDb';
import { playerService } from '../services/playerService';
import type {
  AppTab,
  ImportProgress,
  Playlist,
  RepeatMode,
  Song,
  ToastMessage,
  UserSettings,
} from '../types/music';
import { registerArtworkUrl, revokeAllArtworkUrls } from '../utils/artwork';
import {
  analyzeTrackReplayGainDb,
  computeFileFingerprint,
  detectAudioFormat,
  extractAudioMetadata,
  resolveAudioMimeType,
} from '../utils/audioMetadata';
import { formatDuration } from '../utils/formatters';
import { setHapticsEnabled, triggerHaptic } from '../utils/haptics';

interface EchoPlayContextValue {
  isHydrated: boolean;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  songs: Song[];
  playlists: Playlist[];
  settings: UserSettings;
  updateSettings: (partial: Partial<UserSettings>) => Promise<void>;

  // Player state
  currentSong: Song | null;
  queue: Song[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  isVolumeReadOnly: boolean;
  sleepTimer: number | 'track' | null;
  setSleepTimer: (timer: number | 'track' | null) => void;

  // Player actions
  playSong: (song: Song, contextQueue?: Song[]) => Promise<void>;
  playList: (list: Song[], startIndex?: number, forceShuffle?: boolean) => Promise<void>;
  startSongRadio: (song: Song) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  nextTrack: () => Promise<void>;
  prevTrack: () => Promise<void>;
  seekTo: (seconds: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setVolume: (val: number) => void;
  setPlaybackRate: (rate: number) => void;

  // Queue actions
  addToQueue: (song: Song) => void;
  playNext: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  dismissMiniPlayer: () => void;

  // Library actions
  toggleFavorite: (songId: string) => Promise<void>;
  updateSongLyrics: (songId: string, lyrics: string) => Promise<void>;
  removeSong: (songId: string) => Promise<void>;
  importFiles: (files: FileList | File[]) => Promise<void>;
  importProgress: ImportProgress | null;
  clearImportProgress: () => void;

  // Playlist actions
  createPlaylist: (name: string, description: string, artworkDataUrl?: string) => Promise<Playlist>;
  renamePlaylist: (id: string, name: string, description: string, artworkDataUrl?: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  addSongsToPlaylist: (playlistId: string, songIds: string[]) => Promise<void>;
  removeSongFromPlaylist: (playlistId: string, index: number) => Promise<void>;
  reorderPlaylistSongs: (playlistId: string, fromIndex: number, toIndex: number) => Promise<void>;

  // Maintenance
  clearRecentlyPlayed: () => Promise<void>;
  clearMusicLibrary: () => Promise<void>;
  resetAllData: () => Promise<void>;

  // UI Overlays
  isFullPlayerOpen: boolean;
  setFullPlayerOpen: (open: boolean) => void;
  isQueueOpen: boolean;
  setQueueOpen: (open: boolean) => void;
  isImportModalOpen: boolean;
  setImportModalOpen: (open: boolean) => void;
  playlistTargetForSong: Song | null;
  setPlaylistTargetForSong: (song: Song | null) => void;
  infoTargetSong: Song | null;
  setInfoTargetSong: (song: Song | null) => void;
  actionSheetTarget: {
    song: Song;
    onRemoveFromContext?: () => void;
    removeContextLabel?: string;
  } | null;
  setActionSheetTarget: (
    target: {
      song: Song;
      onRemoveFromContext?: () => void;
      removeContextLabel?: string;
    } | null
  ) => void;

  // Toasts
  toasts: ToastMessage[];
  showToast: (message: string, type?: ToastMessage['type']) => void;
  dismissToast: (id: string) => void;
}

const EchoPlayContext = createContext<EchoPlayContextValue | null>(null);

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const EchoPlayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  // Playback state
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [originalQueueIds, setOriginalQueueIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [sleepTimer, setSleepTimer] = useState<number | 'track' | null>(null);
  const [isVolumeReadOnly] = useState(() => playerService.detectReadOnlyVolume());

  // Sync 5-band EQ & Crossfade state
  useEffect(() => {
    if (settings.eqBands) {
      playerService.setEqBands(settings.eqBands);
    }
  }, [settings.eqBands]);

  useEffect(() => {
    playerService.setCrossfadeEnabled(settings.crossfadeEnabled ?? false);
  }, [settings.crossfadeEnabled]);



  // UI Overlays
  const [isFullPlayerOpen, setFullPlayerOpen] = useState(false);
  const [isQueueOpen, setQueueOpen] = useState(false);
  const [isImportModalOpen, setImportModalOpen] = useState(false);
  const [playlistTargetForSong, setPlaylistTargetForSong] = useState<Song | null>(null);
  const [infoTargetSong, setInfoTargetSong] = useState<Song | null>(null);
  const [actionSheetTarget, setActionSheetTarget] = useState<{
    song: Song;
    onRemoveFromContext?: () => void;
    removeContextLabel?: string;
  } | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const songMap = useMemo(() => {
    const map = new Map<string, Song>();
    for (const s of songs) map.set(s.id, s);
    return map;
  }, [songs]);

  const queue = useMemo(
    () => queueIds.map((id) => songMap.get(id)).filter((s): s is Song => Boolean(s)),
    [queueIds, songMap]
  );

  const currentSong = useMemo(() => {
    if (currentIndex < 0 || currentIndex >= queueIds.length) return null;
    return songMap.get(queueIds[currentIndex]) ?? null;
  }, [queueIds, currentIndex, songMap]);

  const showToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Sleep timer countdown
  useEffect(() => {
    if (typeof sleepTimer !== 'number' || sleepTimer <= 0 || !isPlaying) return;
    const interval = window.setInterval(() => {
      setSleepTimer((prev) => {
        if (typeof prev !== 'number') return null;
        if (prev <= 1) {
          playerService.pause();
          setIsPlaying(false);
          showToast('Sleep timer ended playback', 'info');
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [sleepTimer, isPlaying, showToast]);

  // Apply theme & accent attributes to documentElement
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('data-accent', settings.accent);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', settings.theme === 'dark' ? '#0A0B0E' : '#F7F7F5');
    }
    try {
      localStorage.setItem('echoplay_theme', settings.theme);
    } catch {
      // Ignore
    }
    setHapticsEnabled(settings.hapticsEnabled ?? true);
  }, [settings.theme, settings.accent, settings.hapticsEnabled]);

  const handleGainAnalyzed = useCallback((songId: string, gainDb: number) => {
    setSongs((prev) =>
      prev.map((s) => {
        if (s.id !== songId) return s;
        const updated = { ...s, replayGainDb: gainDb };
        void updateSong(updated);
        return updated;
      })
    );
  }, []);

  const gainAnalysisInFlightRef = useRef<Set<string>>(new Set());

  // Sync Audio Normalization (ReplayGain) setting and analyze active track if needed
  useEffect(() => {
    const enabled = settings.audioNormalization ?? false;
    playerService.setNormalizationEnabled(enabled, currentSong?.replayGainDb);
    if (
      enabled &&
      currentSong &&
      currentSong.replayGainDb === undefined &&
      !gainAnalysisInFlightRef.current.has(currentSong.id)
    ) {
      const targetId = currentSong.id;
      gainAnalysisInFlightRef.current.add(targetId);
      void getAudioFileBlob(targetId)
        .then(async (blob) => {
          if (!blob) return;
          const computedDb = await analyzeTrackReplayGainDb(blob);
          if (computedDb !== undefined) {
            handleGainAnalyzed(targetId, computedDb);
            if (stateRef.current.currentSong?.id === targetId) {
              playerService.applyGainDb(computedDb);
            }
          }
        })
        .finally(() => {
          gainAnalysisInFlightRef.current.delete(targetId);
        });
    }
  }, [settings.audioNormalization, currentSong?.id, currentSong?.replayGainDb, handleGainAnalyzed]);

  // Refs for stable event callbacks
  const stateRef = useRef({
    queueIds,
    originalQueueIds,
    currentIndex,
    repeatMode,
    shuffle,
    currentSong,
    songMap,
    settings,
    sleepTimer,
    currentTime,
    duration,
  });
  stateRef.current = {
    queueIds,
    originalQueueIds,
    currentIndex,
    repeatMode,
    shuffle,
    currentSong,
    songMap,
    settings,
    sleepTimer,
    currentTime,
    duration,
  };

  const autoCrossfadeKeyRef = useRef<string | null>(null);

  const persistSongPosition = useCallback(
    (songId: string, positionSec: number, durationSec: number) => {
      if (!(stateRef.current.settings.autoResumeEnabled ?? true)) return;
      const target = stateRef.current.songMap.get(songId);
      if (!target) return;
      const effectiveDur = durationSec > 0 ? durationSec : target.duration || 0;
      const clamped =
        positionSec >= 3 && (effectiveDur === 0 || positionSec < effectiveDur - 5)
          ? Math.round(positionSec * 10) / 10
          : 0;
      if ((target.lastPosition ?? 0) === clamped) return;

      const updated: Song = { ...target, lastPosition: clamped };
      stateRef.current.songMap.set(songId, updated);
      setSongs((prev) => prev.map((s) => (s.id === songId ? updated : s)));
      void updateSong(updated).catch(() => {});
    },
    []
  );

  const flushPlaybackSnapshot = useCallback((timeOverride?: number) => {
    const st = stateRef.current;
    const autoResume = st.settings.autoResumeEnabled ?? true;
    const activeTime = autoResume ? (timeOverride ?? st.currentTime) : 0;
    void savePlaybackSnapshot({
      currentSongId: st.currentSong?.id ?? null,
      queueIds: st.queueIds,
      originalQueueIds: st.originalQueueIds,
      currentIndex: st.currentIndex,
      currentTime: activeTime,
      shuffle: st.shuffle,
      repeatMode: st.repeatMode,
      updatedAt: Date.now(),
    }).catch(() => {});
  }, []);

  const markSongPlayed = useCallback(async (song: Song) => {
    const updated: Song = {
      ...song,
      lastPlayedAt: Date.now(),
      playCount: (song.playCount || 0) + 1,
    };
    setSongs((prev) => prev.map((s) => (s.id === song.id ? updated : s)));
    await updateSong(updated);
  }, []);

  const handlingLoadErrorRef = useRef(false);

  const loadAndPlayByIndex = useCallback(
    async (ids: string[], index: number, autoPlay: boolean, startTime = 0) => {
      const prevSong = stateRef.current.currentSong;
      const prevTime = playerService.currentTime;
      const prevDur = playerService.duration || stateRef.current.duration;
      if (prevSong && prevSong.id !== ids[index] && prevTime > 0) {
        persistSongPosition(prevSong.id, prevTime, prevDur);
      }

      const id = ids[index];
      const song = id ? stateRef.current.songMap.get(id) : undefined;
      if (!song) return;

      autoCrossfadeKeyRef.current = null;
      setCurrentIndex(index);
      setCurrentTime(startTime);
      setDuration(song.duration || 0);
      handlingLoadErrorRef.current = autoPlay;

      try {
        const loaded = await playerService.loadSong(song, autoPlay, startTime);
        if (!loaded) return; // Superseded by a newer loadSong call
        setIsPlaying(autoPlay && !playerService.paused);
        if (autoPlay && !playerService.paused) {
          void markSongPlayed(song);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setIsPlaying(false);
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          showToast(`Tap Play to start "${song.title}"`, 'info');
        } else {
          const detail = err instanceof Error && err.message ? err.message : '';
          showToast(
            detail
              ? `Could not play "${song.title}": ${detail}`
              : `Could not play "${song.title}". File may be unsupported or missing.`,
            'error'
          );
        }
      } finally {
        handlingLoadErrorRef.current = false;
      }
    },
    [markSongPlayed, showToast]
  );

  // Hydrate from IndexedDB on startup
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [loadedSongs, loadedPlaylists, loadedSettings, artworks, snapshot] =
          await Promise.all([
            getAllSongs(),
            getAllPlaylists(),
            getUserSettings(),
            getAllArtworks(),
            getPlaybackSnapshot(),
          ]);

        if (!active) return;

        for (const art of artworks) {
          registerArtworkUrl(art.id, art.blob);
        }

        setSongs(loadedSongs);
        setPlaylists(loadedPlaylists);
        setSettings(loadedSettings);
        playerService.setVolume(loadedSettings.volume);
        playerService.setPlaybackRate(loadedSettings.playbackRate);
        playerService.setCrossfadeEnabled(loadedSettings.crossfadeEnabled ?? false);
        if (loadedSettings.eqBands) {
          playerService.setEqBands(loadedSettings.eqBands);
        }

        const loadedMap = new Map(loadedSongs.map((s) => [s.id, s]));

        if (snapshot && snapshot.queueIds.length > 0) {
          const validQueue = snapshot.queueIds.filter((id) => loadedMap.has(id));
          const validOrig = snapshot.originalQueueIds.filter((id) => loadedMap.has(id));
          if (validQueue.length > 0) {
            const idx = Math.max(
              0,
              Math.min(snapshot.currentIndex, validQueue.length - 1)
            );
            setQueueIds(validQueue);
            setOriginalQueueIds(validOrig.length > 0 ? validOrig : validQueue);
            setShuffle(snapshot.shuffle);
            setRepeatMode(snapshot.repeatMode);
            setCurrentIndex(idx);
            const restoredSong = loadedMap.get(validQueue[idx]);
            if (restoredSong) {
              const autoResume = loadedSettings.autoResumeEnabled ?? true;
              const resumePos = autoResume
                ? snapshot.currentTime || restoredSong.lastPosition || 0
                : 0;
              setCurrentTime(resumePos);
              setDuration(restoredSong.duration || 0);
              // Preload silently without auto-playing (iOS requires user gesture for play)
              playerService
                .loadSong(restoredSong, false, resumePos)
                .catch(() => {});
            }
          }
        } else {
          setShuffle(loadedSettings.shuffleDefault);
          setRepeatMode(loadedSettings.repeatDefault);
        }
      } catch (err) {
        console.error('Failed to hydrate EchoPlay DB:', err);
      } finally {
        if (active) setIsHydrated(true);
      }
    })();

    return () => {
      active = false;
      revokeAllArtworkUrls();
    };
  }, []);

  // Persist Playback Snapshot (throttled while playing, immediate on pause/background/unload)
  const lastSnapshotTimeRef = useRef(0);
  useEffect(() => {
    if (!isHydrated) return;
    const autoResume = settings.autoResumeEnabled ?? true;
    if (!autoResume && isPlaying) return;
    const now = Date.now();
    if (now - lastSnapshotTimeRef.current < 1000 && isPlaying) return;
    lastSnapshotTimeRef.current = now;
    flushPlaybackSnapshot();
  }, [
    isHydrated,
    currentSong?.id,
    queueIds,
    originalQueueIds,
    currentIndex,
    currentTime,
    shuffle,
    repeatMode,
    isPlaying,
    settings.autoResumeEnabled,
    flushPlaybackSnapshot,
  ]);

  useEffect(() => {
    const handleFlush = () => {
      if (!isHydrated) return;
      const st = stateRef.current;
      const autoResume = st.settings.autoResumeEnabled ?? true;
      const curTime = playerService.currentTime || st.currentTime;
      const curSong = st.currentSong;
      const curDur = playerService.duration || st.duration;
      flushPlaybackSnapshot(autoResume ? curTime : 0);
      if (autoResume && curSong && curTime > 0) {
        persistSongPosition(curSong.id, curTime, curDur);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') handleFlush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', handleFlush);
    window.addEventListener('beforeunload', handleFlush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', handleFlush);
      window.removeEventListener('beforeunload', handleFlush);
    };
  }, [isHydrated, flushPlaybackSnapshot, persistSongPosition]);

  const crossfadeAndPlay = useCallback(
    async (ids: string[], index: number, fadeDurationOverride?: number) => {
      const cfg = stateRef.current.settings;
      const fadeSec = fadeDurationOverride ?? (cfg.crossfadeEnabled ? cfg.crossfadeDuration || 4 : 0);

      if (!cfg.crossfadeEnabled || fadeSec <= 0 || playerService.paused || !playerService.hasActiveSource()) {
        await loadAndPlayByIndex(ids, index, true, 0);
        return;
      }

      const prevSong = stateRef.current.currentSong;
      const id = ids[index];
      const song = id ? stateRef.current.songMap.get(id) : undefined;
      if (!song) return;

      if (prevSong) {
        persistSongPosition(prevSong.id, 0, prevSong.duration || 0);
      }

      autoCrossfadeKeyRef.current = null;
      setCurrentIndex(index);
      setCurrentTime(0);
      setDuration(song.duration || 0);
      handlingLoadErrorRef.current = true;

      try {
        const ok = await playerService.crossfadeToSong(song, fadeSec, 0);
        if (!ok) return;
        setIsPlaying(!playerService.paused);
        if (!playerService.paused) {
          void markSongPlayed(song);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        await loadAndPlayByIndex(ids, index, true, 0);
      } finally {
        handlingLoadErrorRef.current = false;
      }
    },
    [loadAndPlayByIndex, markSongPlayed, persistSongPosition]
  );

  const nextTrack = useCallback(async () => {
    triggerHaptic('skip');
    playerService.primeAudioOnGesture(true);
    const { queueIds: ids, currentIndex: idx, repeatMode: rep } = stateRef.current;
    if (ids.length === 0) return;

    if (rep === 'one') {
      if (!playerService.hasActiveSource()) {
        await loadAndPlayByIndex(ids, idx, true, 0);
        return;
      }
      playerService.seekTo(0);
      try {
        await playerService.play();
        setIsPlaying(!playerService.paused);
      } catch {
        await loadAndPlayByIndex(ids, idx, true, 0);
      }
      return;
    }

    let nextIdx = idx + 1;
    if (nextIdx >= ids.length) {
      if (rep === 'all') {
        nextIdx = 0;
      } else {
        setIsPlaying(false);
        playerService.pause();
        return;
      }
    }
    const skipFadeSec = stateRef.current.settings.crossfadeEnabled
      ? Math.min(stateRef.current.settings.crossfadeDuration || 3, 2.5)
      : 0;
    await crossfadeAndPlay(ids, nextIdx, skipFadeSec);
  }, [loadAndPlayByIndex, crossfadeAndPlay]);

  const prevTrack = useCallback(async () => {
    triggerHaptic('skip');
    playerService.primeAudioOnGesture(true);
    const { queueIds: ids, currentIndex: idx, repeatMode: rep } = stateRef.current;
    if (ids.length === 0) return;

    if (playerService.currentTime > 3) {
      playerService.seekTo(0);
      setCurrentTime(0);
      return;
    }

    let prevIdx = idx - 1;
    if (prevIdx < 0) {
      prevIdx = rep === 'all' ? ids.length - 1 : 0;
    }
    const skipFadeSec = stateRef.current.settings.crossfadeEnabled
      ? Math.min(stateRef.current.settings.crossfadeDuration || 3, 2.5)
      : 0;
    await crossfadeAndPlay(ids, prevIdx, skipFadeSec);
  }, [crossfadeAndPlay]);

  const togglePlayPause = useCallback(async () => {
    triggerHaptic('playPause');
    playerService.primeAudioOnGesture();
    const { currentSong: song, queueIds: ids } = stateRef.current;
    if (!song) {
      if (songs.length > 0) {
        const list = songs.map((s) => s.id);
        for (const s of songs) stateRef.current.songMap.set(s.id, s);
        setQueueIds(list);
        setOriginalQueueIds(list);
        const firstSong = songs[0];
        const resumeAt =
          (stateRef.current.settings.autoResumeEnabled ?? true) && firstSong?.lastPosition
            ? firstSong.lastPosition
            : 0;
        await loadAndPlayByIndex(list, 0, true, resumeAt);
      }
      return;
    }

    if (!playerService.hasActiveSource() && ids.length > 0 && stateRef.current.currentIndex >= 0) {
      await loadAndPlayByIndex(ids, stateRef.current.currentIndex, true, stateRef.current.currentTime);
      return;
    }

    if (playerService.paused) {
      try {
        await playerService.play();
        setIsPlaying(!playerService.paused);
      } catch {
        // Retry loading blob if ObjectURL became stale after iOS background suspension
        await loadAndPlayByIndex(
          ids,
          stateRef.current.currentIndex,
          true,
          playerService.currentTime || stateRef.current.currentTime || 0
        );
      }
    } else {
      const pauseAt = playerService.currentTime;
      playerService.pause();
      setIsPlaying(false);
      setCurrentTime(pauseAt);
      persistSongPosition(song.id, pauseAt, playerService.duration || stateRef.current.duration);
      flushPlaybackSnapshot(pauseAt);
    }
  }, [songs, loadAndPlayByIndex, persistSongPosition, flushPlaybackSnapshot]);

  const seekTo = useCallback(
    (seconds: number) => {
      playerService.seekTo(seconds);
      setCurrentTime(seconds);
      const cur = stateRef.current.currentSong;
      if (cur) {
        persistSongPosition(cur.id, seconds, playerService.duration || stateRef.current.duration);
      }
      flushPlaybackSnapshot(seconds);
    },
    [persistSongPosition, flushPlaybackSnapshot]
  );

  // Wire unified Audio Player events & Media Session API
  useEffect(() => {
    playerService.setEventCallbacks({
      onTimeUpdate: () => {
        const curTime = playerService.currentTime;
        const dur = playerService.duration || stateRef.current.duration;
        setCurrentTime(curTime);
        playerService.syncMediaSessionPosition();

        // Proactive Crossfade: begin overlapping transition BEFORE current track ends
        const st = stateRef.current;
        const cfg = st.settings;
        if (
          cfg.crossfadeEnabled &&
          cfg.crossfadeDuration > 0 &&
          st.repeatMode !== 'one' &&
          st.sleepTimer !== 'track' &&
          st.currentSong &&
          !playerService.paused &&
          dur > cfg.crossfadeDuration + 1.5 &&
          (typeof document === 'undefined' || document.visibilityState !== 'hidden')
        ) {
          const remaining = dur - curTime;
          const fadeWindow = Math.min(cfg.crossfadeDuration, dur * 0.4);
          if (remaining > 0.15 && remaining <= fadeWindow) {
            const nextIdx =
              st.currentIndex + 1 < st.queueIds.length
                ? st.currentIndex + 1
                : st.repeatMode === 'all' && st.queueIds.length > 0
                  ? 0
                  : -1;
            const triggerKey = `${st.currentSong.id}:${st.currentIndex}`;
            if (nextIdx >= 0 && autoCrossfadeKeyRef.current !== triggerKey) {
              autoCrossfadeKeyRef.current = triggerKey;
              void crossfadeAndPlay(st.queueIds, nextIdx, fadeWindow);
            }
          }
        }
      },
      onLoadedMetadata: () => {
        const dur = playerService.duration;
        if (Number.isFinite(dur) && dur > 0) {
          setDuration(dur);
          playerService.syncMediaSessionPosition();
          const cur = stateRef.current.currentSong;
          if (cur && (!cur.duration || cur.duration === 0)) {
            const updated = { ...cur, duration: dur };
            setSongs((prev) => prev.map((s) => (s.id === cur.id ? updated : s)));
            void updateSong(updated);
          }
        }
      },
      onPlay: () => {
        setIsPlaying(true);
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      },
      onPause: () => {
        setIsPlaying(false);
        const curSong = stateRef.current.currentSong;
        const curTime = playerService.currentTime;
        if (curSong && curTime > 0 && !playerService.isSilentPreload) {
          persistSongPosition(curSong.id, curTime, playerService.duration || stateRef.current.duration);
          flushPlaybackSnapshot(curTime);
        }
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
      },
      onEnded: () => {
        const st = stateRef.current;
        if (st.currentSong) {
          persistSongPosition(st.currentSong.id, 0, st.currentSong.duration || 0);
        }
        if (st.sleepTimer === 'track') {
          playerService.pause();
          setIsPlaying(false);
          setSleepTimer(null);
          showToast('Sleep timer ended playback at end of track', 'info');
          return;
        }
        const { queueIds: ids, currentIndex: idx, repeatMode: rep } = st;
        if (rep === 'one') {
          playerService.seekTo(0);
          playerService.play().catch(() => {});
          return;
        }
        if (idx + 1 < ids.length) {
          void crossfadeAndPlay(ids, idx + 1);
        } else if (rep === 'all' && ids.length > 0) {
          void crossfadeAndPlay(ids, 0);
        } else {
          setIsPlaying(false);
        }
      },
      onError: (errMsg: string) => {
        setIsPlaying(false);
        if (handlingLoadErrorRef.current) return;
        const song = stateRef.current.currentSong;
        if (song) {
          showToast(
            errMsg
              ? `Playback error for "${song.title}": ${errMsg}`
              : `Unable to decode "${song.title}" on this browser.`,
            'error'
          );
        }
      },
    });

    playerService.registerMediaSessionHandlers({
      onPlay: () => {
        void playerService.play().catch(() => {});
      },
      onPause: () => {
        playerService.pause();
      },
      onNext: () => {
        void nextTrack();
      },
      onPrev: () => {
        void prevTrack();
      },
      onSeekTo: (time) => {
        seekTo(time);
      },
    });

    return () => {
      playerService.setEventCallbacks(null);
    };
  }, [
    loadAndPlayByIndex,
    crossfadeAndPlay,
    nextTrack,
    prevTrack,
    seekTo,
    showToast,
    persistSongPosition,
    flushPlaybackSnapshot,
  ]);

  const playSong = useCallback(
    async (song: Song, contextQueue?: Song[]) => {
      triggerHaptic('tap');
      playerService.primeAudioOnGesture(true);
      const sourceList = contextQueue && contextQueue.length > 0 ? contextQueue : songs;
      const origIds = sourceList.map((s) => s.id);
      if (!origIds.includes(song.id)) {
        origIds.unshift(song.id);
      }

      let activeIds = origIds;
      let targetIdx = origIds.indexOf(song.id);

      if (shuffle && origIds.length > 1) {
        const rest = origIds.filter((id) => id !== song.id);
        activeIds = [song.id, ...shuffleArray(rest)];
        targetIdx = 0;
      }

      for (const s of sourceList) {
        stateRef.current.songMap.set(s.id, s);
      }
      stateRef.current.songMap.set(song.id, song);
      setOriginalQueueIds(origIds);
      setQueueIds(activeIds);

      const autoResume = stateRef.current.settings.autoResumeEnabled ?? true;
      const savedPos = song.lastPosition ?? 0;
      const shouldResume =
        autoResume &&
        savedPos >= 3 &&
        (song.duration === 0 || savedPos < song.duration - 5);

      const startAt = shouldResume ? savedPos : 0;
      await loadAndPlayByIndex(activeIds, targetIdx, true, startAt);
      if (shouldResume) {
        showToast(`Resumed "${song.title}" at ${formatDuration(savedPos)}`, 'info');
      }
    },
    [songs, shuffle, loadAndPlayByIndex, showToast]
  );

  const startSongRadio = useCallback(
    async (seedSong: Song) => {
      triggerHaptic('playPause');
      playerService.primeAudioOnGesture(true);

      const scored = songs.map((s) => {
        let score = 0;
        if (s.id === seedSong.id) score += 100;
        if (s.artist && seedSong.artist && s.artist.toLowerCase() === seedSong.artist.toLowerCase()) {
          score += 20;
        } else if (s.artist && seedSong.artist && (s.artist.toLowerCase().includes(seedSong.artist.toLowerCase()) || seedSong.artist.toLowerCase().includes(s.artist.toLowerCase()))) {
          score += 12;
        }
        if (s.album && seedSong.album && s.album.toLowerCase() === seedSong.album.toLowerCase()) {
          score += 8;
        }
        if (s.format === seedSong.format) {
          score += 2;
        }
        score += Math.random() * 4;
        return { song: s, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const sortedSongs = scored.map((item) => item.song);
      const seedIndex = sortedSongs.findIndex((s) => s.id === seedSong.id);
      if (seedIndex > 0) {
        const [removed] = sortedSongs.splice(seedIndex, 1);
        sortedSongs.unshift(removed);
      }

      let radioQueue = sortedSongs;
      if (radioQueue.length < 10 && radioQueue.length > 0) {
        radioQueue = [...radioQueue, ...shuffleArray(radioQueue)];
      }

      const origIds = radioQueue.map((s) => s.id);
      for (const s of radioQueue) {
        stateRef.current.songMap.set(s.id, s);
      }
      setOriginalQueueIds(origIds);
      setQueueIds(origIds);
      await loadAndPlayByIndex(origIds, 0, true, 0);
      showToast(`Started Song Radio for "${seedSong.title}"`, 'success');
    },
    [songs, loadAndPlayByIndex, showToast]
  );

  const playList = useCallback(
    async (list: Song[], startIndex = 0, forceShuffle?: boolean) => {
      if (list.length === 0) return;
      triggerHaptic('playPause');
      playerService.primeAudioOnGesture(true);
      const origIds = list.map((s) => s.id);
      const shouldShuffle = forceShuffle !== undefined ? forceShuffle : shuffle;
      if (forceShuffle !== undefined) setShuffle(forceShuffle);

      let activeIds = origIds;
      let targetIdx = Math.max(0, Math.min(startIndex, origIds.length - 1));

      if (shouldShuffle) {
        if (forceShuffle) {
          activeIds = shuffleArray(origIds);
          targetIdx = 0;
        } else {
          const picked = origIds[targetIdx];
          activeIds = [picked, ...shuffleArray(origIds.filter((id) => id !== picked))];
          targetIdx = 0;
        }
      }

      for (const s of list) {
        stateRef.current.songMap.set(s.id, s);
      }
      setOriginalQueueIds(origIds);
      setQueueIds(activeIds);
      await loadAndPlayByIndex(activeIds, targetIdx, true, 0);
    },
    [shuffle, loadAndPlayByIndex]
  );

  const toggleShuffle = useCallback(() => {
    triggerHaptic('tap');
    setShuffle((prev) => {
      const next = !prev;
      const curId = stateRef.current.currentSong?.id;
      if (next) {
        if (queueIds.length > 1 && curId) {
          const others = queueIds.filter((id) => id !== curId);
          setQueueIds([curId, ...shuffleArray(others)]);
          setCurrentIndex(0);
        }
      } else if (originalQueueIds.length > 0) {
        setQueueIds(originalQueueIds);
        if (curId) {
          const idx = originalQueueIds.indexOf(curId);
          setCurrentIndex(idx >= 0 ? idx : 0);
        }
      }
      return next;
    });
  }, [queueIds, originalQueueIds]);

  const cycleRepeat = useCallback(() => {
    triggerHaptic('tap');
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  }, []);

  const updateSettings = useCallback(async (partial: Partial<UserSettings>) => {
    if (partial.autoResumeEnabled === false) {
      playerService.clearPendingResumeTime();
      if (playerService.paused && playerService.isSilentPreload) {
        playerService.seekTo(0);
        setCurrentTime(0);
      }
    }
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      void saveUserSettings(next);
      return next;
    });
  }, []);

  const setVolume = useCallback(
    (val: number) => {
      playerService.setVolume(val);
      void updateSettings({ volume: val });
    },
    [updateSettings]
  );

  const setPlaybackRate = useCallback(
    (rate: number) => {
      playerService.setPlaybackRate(rate);
      void updateSettings({ playbackRate: rate });
    },
    [updateSettings]
  );

  // Queue Management
  const addToQueue = useCallback(
    (song: Song) => {
      if (queueIds.length === 0) {
        void playSong(song, [song]);
        return;
      }
      setQueueIds((prev) => [...prev, song.id]);
      setOriginalQueueIds((prev) => [...prev, song.id]);
      showToast(`Added "${song.title}" to queue`, 'success');
    },
    [queueIds.length, playSong, showToast]
  );

  const playNext = useCallback(
    (song: Song) => {
      if (queueIds.length === 0 || currentIndex < 0) {
        void playSong(song, [song]);
        return;
      }
      const insertAt = currentIndex + 1;
      setQueueIds((prev) => {
        const next = [...prev];
        next.splice(insertAt, 0, song.id);
        return next;
      });
      setOriginalQueueIds((prev) => [...prev, song.id]);
      showToast(`"${song.title}" will play next`, 'success');
    },
    [queueIds.length, currentIndex, playSong, showToast]
  );

  const removeFromQueue = useCallback(
    (index: number) => {
      if (index < 0 || index >= queueIds.length) return;
      triggerHaptic('dismiss');
      if (index === currentIndex) {
        if (queueIds.length === 1) {
          playerService.stopAndClear();
          setQueueIds([]);
          setOriginalQueueIds([]);
          setCurrentIndex(-1);
          setIsPlaying(false);
          setCurrentTime(0);
          setDuration(0);
          return;
        }
        const nextQueue = queueIds.filter((_, i) => i !== index);
        const nextIdx = Math.min(index, nextQueue.length - 1);
        setQueueIds(nextQueue);
        void loadAndPlayByIndex(nextQueue, nextIdx, isPlaying, 0);
        return;
      }

      setQueueIds((prev) => prev.filter((_, i) => i !== index));
      if (index < currentIndex) {
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      }
    },
    [queueIds, currentIndex, isPlaying, loadAndPlayByIndex]
  );

  const reorderQueue = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= queueIds.length ||
        toIndex >= queueIds.length
      ) {
        return;
      }
      triggerHaptic('selection');
      const curId = queueIds[currentIndex];
      const next = [...queueIds];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      setQueueIds(next);
      if (curId) {
        const newCurIdx = next.indexOf(curId);
        if (newCurIdx >= 0) setCurrentIndex(newCurIdx);
      }
    },
    [queueIds, currentIndex]
  );

  const clearQueue = useCallback(() => {
    triggerHaptic('dismiss');
    if (currentSong) {
      setQueueIds([currentSong.id]);
      setOriginalQueueIds([currentSong.id]);
      setCurrentIndex(0);
    } else {
      setQueueIds([]);
      setOriginalQueueIds([]);
      setCurrentIndex(-1);
    }
    showToast('Upcoming queue cleared');
  }, [currentSong, showToast]);

  const dismissMiniPlayer = useCallback(() => {
    triggerHaptic('dismiss');
    playerService.stopAndClear();
    setQueueIds([]);
    setOriginalQueueIds([]);
    setCurrentIndex(-1);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setFullPlayerOpen(false);
  }, []);

  // Favorites & Songs
  const updateSongLyrics = useCallback(async (songId: string, lyrics: string) => {
    setSongs((prev) => {
      const target = prev.find((s) => s.id === songId);
      if (!target) return prev;
      const updated = { ...target, lyrics };
      void updateSong(updated);
      return prev.map((s) => (s.id === songId ? updated : s));
    });
    showToast('Lyrics updated and saved locally', 'success');
  }, [showToast]);

  const toggleFavorite = useCallback(async (songId: string) => {
    triggerHaptic('favorite');
    setSongs((prev) => {
      const target = prev.find((s) => s.id === songId);
      if (!target) return prev;
      const updated = { ...target, isFavorite: !target.isFavorite };
      void updateSong(updated);
      return prev.map((s) => (s.id === songId ? updated : s));
    });
  }, []);

  const removeSong = useCallback(
    async (songId: string) => {
      await deleteSongById(songId);
      setSongs((prev) => prev.filter((s) => s.id !== songId));
      setPlaylists((prev) =>
        prev.map((pl) => ({
          ...pl,
          songIds: pl.songIds.filter((id) => id !== songId),
        }))
      );

      if (currentSong?.id === songId) {
        playerService.stopAndClear();
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
      }
      setQueueIds((prev) => {
        const filtered = prev.filter((id) => id !== songId);
        if (filtered.length === 0) setCurrentIndex(-1);
        else if (currentIndex >= filtered.length) setCurrentIndex(filtered.length - 1);
        return filtered;
      });
      setOriginalQueueIds((prev) => prev.filter((id) => id !== songId));
      showToast('Removed song from device library');
    },
    [currentSong?.id, currentIndex, showToast]
  );

  // Import Audio Files
  const importFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const allFiles = Array.from(fileList);
      if (allFiles.length === 0) return;

      // Filter out non-audio files (like album art .jpg, lyrics .lrc, .nomedia, .cache)
      // When multiple files or a directory is scanned, pre-filter to audio formats.
      const files =
        allFiles.length > 2
          ? allFiles.filter((f) => !f.name.startsWith('.') && detectAudioFormat(f) !== null)
          : allFiles;

      if (files.length === 0) {
        showToast('No supported audio files (MP3, M4A, FLAC, WAV, AAC, OGG) found.', 'error');
        setImportProgress(null);
        return;
      }

      const existingFingerprints = new Set(songs.map((s) => s.fingerprint));
      const progress: ImportProgress = {
        total: files.length,
        processed: 0,
        imported: 0,
        duplicates: 0,
        failed: 0,
        currentFile: '',
        errors: [],
      };
      setImportProgress({ ...progress });

      const newlyImported: Song[] = [];

      for (const file of files) {
        progress.currentFile = file.name;
        setImportProgress({ ...progress });

        try {
          const format = detectAudioFormat(file);
          if (!format) {
            progress.failed++;
            progress.errors.push(`${file.name}: Unsupported audio format`);
            progress.processed++;
            setImportProgress({ ...progress });
            continue;
          }

          const fingerprint = await computeFileFingerprint(file);
          if (existingFingerprints.has(fingerprint)) {
            progress.duplicates++;
            progress.processed++;
            setImportProgress({ ...progress });
            continue;
          }

          const { metadata, playable } = await extractAudioMetadata(file);
          if (!playable && metadata.duration === 0 && format !== 'FLAC' && format !== 'OGG') {
            progress.failed++;
            progress.errors.push(`${file.name}: Browser cannot decode this audio file`);
            progress.processed++;
            setImportProgress({ ...progress });
            continue;
          }

          const id =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

          let artworkId: string | undefined;
          if (metadata.artworkBlob) {
            artworkId = `art-${id}`;
            registerArtworkUrl(artworkId, metadata.artworkBlob);
          }

          const audioBuffer = await file.arrayBuffer();
          const headerBytes = new Uint8Array(
            audioBuffer,
            0,
            Math.min(262144, audioBuffer.byteLength)
          );
          const resolvedMime = resolveAudioMimeType(
            metadata.format,
            file.name,
            file.type,
            headerBytes
          );
          const ownedBlob = new Blob([audioBuffer], { type: resolvedMime });

          const song: Song = {
            id,
            fingerprint,
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            duration: metadata.duration,
            trackNumber: metadata.trackNumber,
            year: metadata.year,
            lyrics: metadata.lyrics,
            replayGainDb: metadata.replayGainDb,
            format: metadata.format,
            fileName: file.name,
            fileSize: file.size,
            mimeType: resolvedMime,
            artworkId,
            addedAt: Date.now(),
            playCount: 0,
            isFavorite: false,
          };

          await saveImportedSong(
            song,
            ownedBlob,
            metadata.artworkBlob,
            metadata.artworkMimeType
          );

          existingFingerprints.add(fingerprint);
          newlyImported.push(song);
          progress.imported++;
        } catch (err) {
          progress.failed++;
          progress.errors.push(
            `${file.name}: ${err instanceof Error ? err.message : 'Import error'}`
          );
        }

        progress.processed++;
        setImportProgress({ ...progress });
      }

      if (newlyImported.length > 0) {
        setSongs((prev) => [...newlyImported.reverse(), ...prev]);
        showToast(
          `Imported ${newlyImported.length} ${newlyImported.length === 1 ? 'song' : 'songs'} locally`,
          'success'
        );
      } else if (progress.duplicates > 0 && progress.failed === 0) {
        showToast('Selected tracks are already in your library', 'info');
      }
    },
    [songs, showToast]
  );

  const clearImportProgress = useCallback(() => {
    setImportProgress(null);
  }, []);

  // Playlists
  const createPlaylist = useCallback(
    async (name: string, description: string, artworkDataUrl?: string) => {
      const now = Date.now();
      const pl: Playlist = {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `pl-${now}-${Math.random().toString(36).slice(2, 7)}`,
        name: name.trim() || 'Untitled Playlist',
        description: description.trim(),
        artworkDataUrl,
        songIds: [],
        createdAt: now,
        updatedAt: now,
      };
      await savePlaylist(pl);
      setPlaylists((prev) => [pl, ...prev]);
      showToast(`Created playlist "${pl.name}"`, 'success');
      return pl;
    },
    [showToast]
  );

  const renamePlaylist = useCallback(
    async (id: string, name: string, description: string, artworkDataUrl?: string) => {
      setPlaylists((prev) =>
        prev.map((pl) => {
          if (pl.id !== id) return pl;
          const updated: Playlist = {
            ...pl,
            name: name.trim() || pl.name,
            description: description.trim(),
            artworkDataUrl: artworkDataUrl !== undefined ? artworkDataUrl : pl.artworkDataUrl,
            updatedAt: Date.now(),
          };
          void savePlaylist(updated);
          return updated;
        })
      );
      showToast('Playlist updated', 'success');
    },
    [showToast]
  );

  const deletePlaylist = useCallback(
    async (id: string) => {
      await deletePlaylistById(id);
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
      showToast('Playlist deleted');
    },
    [showToast]
  );

  const addSongsToPlaylist = useCallback(
    async (playlistId: string, newSongIds: string[]) => {
      setPlaylists((prev) =>
        prev.map((pl) => {
          if (pl.id !== playlistId) return pl;
          const merged = [...pl.songIds];
          for (const sid of newSongIds) {
            if (!merged.includes(sid)) merged.push(sid);
          }
          const updated: Playlist = { ...pl, songIds: merged, updatedAt: Date.now() };
          void savePlaylist(updated);
          return updated;
        })
      );
      showToast(
        `Added ${newSongIds.length} ${newSongIds.length === 1 ? 'song' : 'songs'} to playlist`,
        'success'
      );
    },
    [showToast]
  );

  const removeSongFromPlaylist = useCallback(async (playlistId: string, index: number) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const nextIds = pl.songIds.filter((_, i) => i !== index);
        const updated: Playlist = { ...pl, songIds: nextIds, updatedAt: Date.now() };
        void savePlaylist(updated);
        return updated;
      })
    );
  }, []);

  const reorderPlaylistSongs = useCallback(
    async (playlistId: string, fromIndex: number, toIndex: number) => {
      setPlaylists((prev) =>
        prev.map((pl) => {
          if (pl.id !== playlistId) return pl;
          if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= pl.songIds.length ||
            toIndex >= pl.songIds.length
          ) {
            return pl;
          }
          const nextIds = [...pl.songIds];
          const [moved] = nextIds.splice(fromIndex, 1);
          nextIds.splice(toIndex, 0, moved);
          const updated: Playlist = { ...pl, songIds: nextIds, updatedAt: Date.now() };
          void savePlaylist(updated);
          return updated;
        })
      );
    },
    []
  );

  // Maintenance
  const clearRecentlyPlayed = useCallback(async () => {
    await clearRecentlyPlayedInDB();
    setSongs((prev) =>
      prev.map((s) => ({ ...s, lastPlayedAt: undefined, playCount: 0 }))
    );
    showToast('Cleared recently played history');
  }, [showToast]);

  const clearMusicLibrary = useCallback(async () => {
    playerService.stopAndClear();
    revokeAllArtworkUrls();
    await clearMusicLibraryInDB();
    setSongs([]);
    setPlaylists((prev) => prev.map((pl) => ({ ...pl, songIds: [] })));
    setQueueIds([]);
    setOriginalQueueIds([]);
    setCurrentIndex(-1);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setFullPlayerOpen(false);
    showToast('All locally stored music deleted');
  }, [showToast]);

  const resetAllData = useCallback(async () => {
    playerService.stopAndClear();
    revokeAllArtworkUrls();
    await deleteAllLocalDataInDB();
    setSongs([]);
    setPlaylists([]);
    setSettings(DEFAULT_SETTINGS);
    setQueueIds([]);
    setOriginalQueueIds([]);
    setCurrentIndex(-1);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setFullPlayerOpen(false);
    showToast('EchoPlay local data reset');
  }, [showToast]);

  const value: EchoPlayContextValue = {
    isHydrated,
    activeTab,
    setActiveTab,
    songs,
    playlists,
    settings,
    updateSettings,
    currentSong,
    queue,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    shuffle,
    repeatMode,
    isVolumeReadOnly,
    sleepTimer,
    setSleepTimer,
    playSong,
    playList,
    startSongRadio,
    togglePlayPause,
    nextTrack,
    prevTrack,
    seekTo,
    toggleShuffle,
    cycleRepeat,
    setVolume,
    setPlaybackRate,
    addToQueue,
    playNext,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    dismissMiniPlayer,
    toggleFavorite,
    updateSongLyrics,
    removeSong,
    importFiles,
    importProgress,
    clearImportProgress,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addSongsToPlaylist,
    removeSongFromPlaylist,
    reorderPlaylistSongs,
    clearRecentlyPlayed,
    clearMusicLibrary,
    resetAllData,
    isFullPlayerOpen,
    setFullPlayerOpen,
    isQueueOpen,
    setQueueOpen,
    isImportModalOpen,
    setImportModalOpen,
    playlistTargetForSong,
    setPlaylistTargetForSong,
    infoTargetSong,
    setInfoTargetSong,
    actionSheetTarget,
    setActionSheetTarget,
    toasts,
    showToast,
    dismissToast,
  };

  return <EchoPlayContext.Provider value={value}>{children}</EchoPlayContext.Provider>;
};

export function useEchoPlay() {
  const ctx = useContext(EchoPlayContext);
  if (!ctx) throw new Error('useEchoPlay must be used inside EchoPlayProvider');
  return ctx;
}
