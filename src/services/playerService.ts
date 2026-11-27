import { getArtworkRecord, getAudioFileBlob } from '../db/indexedDb';
import type { Song } from '../types/music';
import { getMediaSessionArtworkDataUrl } from '../utils/artwork';
import { resolveAudioMimeType } from '../utils/audioMetadata';

export interface MediaSessionCallbacks {
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeekTo: (time: number) => void;
}

export interface PlayerEventCallbacks {
  onTimeUpdate: () => void;
  onLoadedMetadata: () => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onError: (message: string) => void;
}

const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRtwBAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YbgBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function formatMediaError(err: MediaError | null): string {
  if (!err) return 'Unknown media playback error';
  const detail = err.message ? `: ${err.message}` : '';
  switch (err.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return `Audio loading aborted${detail}`;
    case MediaError.MEDIA_ERR_NETWORK:
      return `Audio stream interrupted${detail}`;
    case MediaError.MEDIA_ERR_DECODE:
      return `Unable to decode audio data${detail}`;
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return `Audio format not supported by this browser${detail}`;
    default:
      return `Audio playback error (${err.code})${detail}`;
  }
}

const NETWORK_STATE_LABELS = [
  'NETWORK_EMPTY',
  'NETWORK_IDLE',
  'NETWORK_LOADING',
  'NETWORK_NO_SOURCE',
] as const;

const READY_STATE_LABELS = [
  'HAVE_NOTHING',
  'HAVE_METADATA',
  'HAVE_CURRENT_DATA',
  'HAVE_FUTURE_DATA',
  'HAVE_ENOUGH_DATA',
] as const;

const MEDIA_ERROR_LABELS: Record<number, string> = {
  1: 'MEDIA_ERR_ABORTED',
  2: 'MEDIA_ERR_NETWORK',
  3: 'MEDIA_ERR_DECODE',
  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
};

interface ActiveTrackMeta {
  songId: string;
  fileName: string;
  mimeType: string;
  blobSize: number;
}

class AudioPlayerService {
  private audio: HTMLAudioElement;
  private mode: 'html' | 'webaudio' = 'html';
  private currentObjectUrl: string | null = null;
  private retiredObjectUrls = new Set<string>();
  private currentLoadedSongId: string | null = null;
  private activeTrackMeta: ActiveTrackMeta | null = null;
  private isIOSVolumeReadOnly: boolean | null = null;
  private loadToken = 0;
  private primingToken = 0;
  private primingPromise: Promise<void> | null = null;
  private targetPlaybackRate = 1;
  private targetVolume = 1;
  private isAudioUnlocked = false;
  public isPriming = false;
  public isSilentPreload = false;
  private activePlayableBlob: Blob | null = null;
  private untypedFallbackTriedForToken = -1;
  private lastValidTime = 0;
  private recoveryState: {
    token: number;
    promise: Promise<'recovered' | 'needs-gesture' | 'failed'>;
  } | null = null;
  private callbacks: PlayerEventCallbacks | null = null;

  // Shared Web Audio graph (ReplayGain + Fallback AudioBufferSourceNode playback)
  private audioCtx: AudioContext | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private masterVolumeNode: GainNode | null = null;
  private limiterNode: DynamicsCompressorNode | null = null;
  private normalizationEnabled = false;
  private currentGainDb = 0;
  private eqFilters: BiquadFilterNode[] = [];

  // Web Audio buffer fallback state
  private wbBuffer: AudioBuffer | null = null;
  private wbSource: AudioBufferSourceNode | null = null;
  private wbStartOffset = 0;
  private wbStartCtxTime = 0;
  private wbPlaying = false;
  private wbManualStop = false;
  private wbProgressTimer: number | null = null;

  constructor() {
    // Reuse or pin a single persistent audio element in global scope + DOM so it is never GC'd
    const win =
      typeof window !== 'undefined'
        ? (window as unknown as { __echoPlayAudioEngine?: HTMLAudioElement })
        : null;
    const existing =
      win?.__echoPlayAudioEngine ||
      (typeof document !== 'undefined'
        ? (document.getElementById('echoplay-audio-engine') as HTMLAudioElement | null)
        : null);

    this.audio = existing ?? document.createElement('audio');
    this.audio.id = 'echoplay-audio-engine';
    this.audio.preload = 'auto';
    // Critical for iPhone Safari & PWA inline/background continuity
    this.audio.setAttribute('playsinline', '');
    this.audio.setAttribute('webkit-playsinline', '');
    this.audio.style.display = 'none';

    if (win) {
      win.__echoPlayAudioEngine = this.audio;
    }

    this.ensureAudioElementMounted();

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (
          document.visibilityState === 'visible' &&
          !this.paused &&
          this.audioCtx &&
          this.audioCtx.state !== 'running'
        ) {
          this.audioCtx.resume().catch(() => {});
        }
      });
    }

    this.audio.addEventListener('loadedmetadata', () => {
      try {
        this.audio.playbackRate = this.targetPlaybackRate;
      } catch {
        // Ignore
      }
      if (this.mode === 'html' && !this.isPriming) {
        this.callbacks?.onLoadedMetadata();
      }
    });

    this.audio.addEventListener('loadeddata', () => {
      if (this.mode === 'html' && !this.isPriming) {
        this.flushRetiredObjectUrls();
      }
    });

    this.audio.addEventListener('timeupdate', () => {
      if (this.mode === 'html' && !this.isPriming) {
        if (Number.isFinite(this.audio.currentTime) && this.audio.currentTime > 0) {
          this.lastValidTime = this.audio.currentTime;
        }
        this.callbacks?.onTimeUpdate();
      }
    });

    this.audio.addEventListener('play', () => {
      if (this.mode === 'html' && !this.isPriming) {
        this.callbacks?.onPlay();
      }
    });

    this.audio.addEventListener('pause', () => {
      if (this.mode === 'html' && !this.isPriming) {
        this.callbacks?.onPause();
      }
    });

    this.audio.addEventListener('ended', () => {
      if (this.mode === 'html' && !this.isPriming) {
        this.callbacks?.onEnded();
      }
    });

    this.audio.addEventListener('error', () => {
      if (this.mode !== 'html' || this.isPriming) return;
      if (!this.audio.getAttribute('src')) return;

      const token = this.loadToken;
      const diagnostics = this.getAudioErrorDiagnostics();
      const mediaErr = this.audio.error;
      const errMsg = formatMediaError(mediaErr);

      if (this.isSilentPreload) {
        console.warn('[EchoPlay] Silent preload media error:', diagnostics);
        return;
      }

      if (this.recoveryState?.token === token) {
        console.warn('[EchoPlay] Intermediate audio element error during recovery:', diagnostics);
        return;
      }

      if (
        mediaErr &&
        (this.activePlayableBlob || this.activeTrackMeta?.songId) &&
        this.untypedFallbackTriedForToken !== token
      ) {
        const resumeAt = Math.max(
          this.lastValidTime,
          Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0
        );
        console.warn('[EchoPlay] HTMLAudioElement media error — attempting recovery:', {
          ...diagnostics,
          resumeAt,
        });
        void this.recoverHtmlDecodeFailure(token, resumeAt).then((outcome) => {
          if (outcome === 'failed' && token === this.loadToken) {
            console.error('[EchoPlay] Audio playback failed after recovery attempts:', diagnostics);
            this.callbacks?.onError(errMsg);
          }
        });
        return;
      }

      console.error('[EchoPlay] HTMLAudioElement error event:', diagnostics);
      this.callbacks?.onError(errMsg);
    });
  }

  private ensureAudioElementMounted(): void {
    if (typeof document === 'undefined') return;
    const mount = () => {
      if (document.body && !document.body.contains(this.audio)) {
        document.body.appendChild(this.audio);
      }
    };
    if (document.body) {
      mount();
    } else {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    }
  }

  private retireObjectUrl(url: string | null): void {
    if (!url || url === this.currentObjectUrl) return;
    this.retiredObjectUrls.add(url);
  }

  private flushRetiredObjectUrls(): void {
    for (const url of this.retiredObjectUrls) {
      if (url !== this.currentObjectUrl) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore revocation error
        }
        this.retiredObjectUrls.delete(url);
      }
    }
  }

  private getAudioErrorDiagnostics() {
    const err = this.audio.error;
    const mime = this.activeTrackMeta?.mimeType || '';
    return {
      errorCode: err?.code ?? null,
      errorName: err ? MEDIA_ERROR_LABELS[err.code] ?? 'UNKNOWN_MEDIA_ERROR' : 'NONE',
      errorMessage: err?.message || '',
      networkState: NETWORK_STATE_LABELS[this.audio.networkState] ?? this.audio.networkState,
      readyState: READY_STATE_LABELS[this.audio.readyState] ?? this.audio.readyState,
      src: this.audio.currentSrc || this.audio.getAttribute('src') || '',
      songId: this.activeTrackMeta?.songId ?? null,
      fileName: this.activeTrackMeta?.fileName ?? null,
      mimeType: mime || null,
      blobSize: this.activeTrackMeta?.blobSize ?? null,
      canPlayType: mime ? this.audio.canPlayType(mime) : '',
    };
  }

  setEventCallbacks(callbacks: PlayerEventCallbacks | null): void {
    this.callbacks = callbacks;
  }

  get element(): HTMLAudioElement {
    return this.audio;
  }

  get activeSongId(): string | null {
    return this.currentLoadedSongId;
  }

  get currentTime(): number {
    if (this.mode === 'webaudio') {
      if (!this.wbBuffer) return 0;
      if (this.wbPlaying && this.audioCtx) {
        const elapsed = (this.audioCtx.currentTime - this.wbStartCtxTime) * this.targetPlaybackRate;
        return Math.max(0, Math.min(this.wbBuffer.duration, this.wbStartOffset + elapsed));
      }
      return Math.max(0, Math.min(this.wbBuffer.duration, this.wbStartOffset));
    }
    return this.audio.currentTime || 0;
  }

  get duration(): number {
    if (this.mode === 'webaudio') {
      return this.wbBuffer?.duration ?? 0;
    }
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
  }

  get paused(): boolean {
    if (this.mode === 'webaudio') {
      return !this.wbPlaying;
    }
    return this.audio.paused;
  }

  hasActiveSource(): boolean {
    if (this.mode === 'webaudio') {
      return this.wbBuffer !== null;
    }
    return Boolean(this.audio.getAttribute('src'));
  }

  getLastMediaErrorMessage(): string | null {
    return this.audio.error ? formatMediaError(this.audio.error) : null;
  }

  primeAudioOnGesture(willReplaceSource = false): void {
    this.ensureAudioElementMounted();
    if (this.normalizationEnabled) {
      this.ensureAudioContextGraph(this.mode === 'html');
    }
    if (this.audioCtx && this.audioCtx.state !== 'running') {
      this.audioCtx.resume().catch(() => {});
    }

    if (this.isAudioUnlocked || this.primingPromise) {
      return;
    }

    // Only iOS/iPadOS Safari drops gesture activation across async IndexedDB reads;
    // avoid mutating audio.src with a dummy WAV on desktop/Android browsers.
    if (!isAppleTouchDevice()) {
      return;
    }

    if (willReplaceSource || !this.audio.src) {
      const token = ++this.primingToken;
      this.isPriming = true;
      try {
        this.audio.muted = true;
        this.audio.src = SILENT_WAV_DATA_URI;
        const p = this.audio.play();
        if (p && typeof p.then === 'function') {
          this.primingPromise = p
            .then(() => {
              this.isAudioUnlocked = true;
              if (this.primingToken === token && this.isPriming) {
                this.audio.pause();
                this.audio.muted = false;
                this.isPriming = false;
              }
            })
            .catch(() => {
              if (this.primingToken === token && this.isPriming) {
                this.audio.muted = false;
                this.isPriming = false;
              }
            })
            .finally(() => {
              if (this.primingToken === token) {
                this.primingPromise = null;
              }
            });
        } else {
          this.isAudioUnlocked = true;
          this.audio.muted = false;
          this.isPriming = false;
        }
      } catch {
        this.audio.muted = false;
        this.isPriming = false;
        this.primingPromise = null;
      }
    }
  }

  private ensureAudioContextGraph(attachMediaElement: boolean): boolean {
    if (typeof window === 'undefined') return false;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return false;

    try {
      if (!this.audioCtx) {
        const ctx = new AudioCtx();
        const gain = ctx.createGain();
        const masterVol = ctx.createGain();
        const limiter = ctx.createDynamicsCompressor();

        // Gentle brickwall safety limiter to prevent digital clipping on +dB boost
        limiter.threshold.value = -1.0;
        limiter.knee.value = 3.0;
        limiter.ratio.value = 12.0;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.12;

        const frequencies = [60, 230, 910, 4000, 14000];
        const eqFilters = frequencies.map((freq) => {
          const f = ctx.createBiquadFilter();
          f.type = 'peaking';
          f.frequency.value = freq;
          f.Q.value = 1.4;
          f.gain.value = 0;
          return f;
        });

        // Connect EQ filters in series: eq[0] -> eq[1] -> eq[2] -> eq[3] -> eq[4] -> gain
        let prev: AudioNode = eqFilters[0];
        for (let i = 0; i < eqFilters.length - 1; i++) {
          eqFilters[i].connect(eqFilters[i + 1]);
        }
        eqFilters[eqFilters.length - 1].connect(gain);

        gain.connect(masterVol);
        masterVol.connect(limiter);
        limiter.connect(ctx.destination);

        ctx.onstatechange = () => {
          if (
            typeof document !== 'undefined' &&
            document.visibilityState === 'visible' &&
            !this.paused &&
            ctx.state === 'suspended'
          ) {
            ctx.resume().catch(() => {});
          }
        };

        this.audioCtx = ctx;
        this.gainNode = gain;
        this.masterVolumeNode = masterVol;
        this.limiterNode = limiter;
        this.eqFilters = eqFilters;
      }

      if (attachMediaElement && !this.mediaSource && this.audioCtx && this.eqFilters.length > 0) {
        const source = this.audioCtx.createMediaElementSource(this.audio);
        source.connect(this.eqFilters[0]);
        this.mediaSource = source;
      }

      if (this.masterVolumeNode) {
        this.masterVolumeNode.gain.value =
          this.mode === 'webaudio' ? this.targetVolume : 1;
      }

      if (this.audioCtx.state !== 'running') {
        this.audioCtx.resume().catch(() => {});
      }
      return true;
    } catch {
      return false;
    }
  }

  setEqBands(bands: [number, number, number, number, number]): void {
    if (!this.audioCtx) {
      this.ensureAudioContextGraph(this.mode === 'html');
    }
    const now = this.audioCtx ? this.audioCtx.currentTime : 0;
    bands.forEach((gainVal, i) => {
      if (this.eqFilters[i]) {
        try {
          this.eqFilters[i].gain.setTargetAtTime(gainVal, now, 0.05);
        } catch {
          this.eqFilters[i].gain.value = gainVal;
        }
      }
    });
  }

  setNormalizationEnabled(enabled: boolean, currentSongGainDb?: number): void {
    this.normalizationEnabled = enabled;
    if (enabled && (this.isAudioUnlocked || !this.paused)) {
      this.ensureAudioContextGraph(this.mode === 'html');
    }
    this.applyGainDb(enabled ? (currentSongGainDb ?? this.currentGainDb) : 0);
  }

  applyGainDb(gainDb: number): void {
    this.currentGainDb = gainDb;
    const effectiveDb = this.normalizationEnabled ? gainDb : 0;
    const linear = Math.max(0.15, Math.min(2.6, Math.pow(10, effectiveDb / 20)));

    if (this.audioCtx && this.gainNode) {
      try {
        this.gainNode.gain.setTargetAtTime(linear, this.audioCtx.currentTime, 0.06);
      } catch {
        this.gainNode.gain.value = linear;
      }
    }
  }

  detectReadOnlyVolume(): boolean {
    if (this.isIOSVolumeReadOnly !== null) return this.isIOSVolumeReadOnly;
    const prev = this.audio.volume;
    const testVal = prev === 1 ? 0.9 : 1;
    try {
      this.audio.volume = testVal;
      const changed = Math.abs(this.audio.volume - testVal) < 0.05;
      this.audio.volume = prev;
      this.isIOSVolumeReadOnly = !changed;
    } catch {
      this.isIOSVolumeReadOnly = true;
    }
    return this.isIOSVolumeReadOnly;
  }

  private stopWebAudioEngine(clearBuffer = false): void {
    if (this.wbProgressTimer !== null) {
      window.clearInterval(this.wbProgressTimer);
      this.wbProgressTimer = null;
    }
    if (this.wbSource) {
      this.wbManualStop = true;
      try {
        this.wbSource.onended = null;
        this.wbSource.stop();
        this.wbSource.disconnect();
      } catch {
        // Ignore already stopped source
      }
      this.wbSource = null;
    }
    this.wbPlaying = false;
    if (clearBuffer) {
      this.wbBuffer = null;
      this.wbStartOffset = 0;
      this.wbStartCtxTime = 0;
    }
  }

  private startWebAudioProgressTimer(): void {
    if (this.wbProgressTimer !== null) {
      window.clearInterval(this.wbProgressTimer);
    }
    this.wbProgressTimer = window.setInterval(() => {
      if (this.mode === 'webaudio' && this.wbPlaying) {
        this.callbacks?.onTimeUpdate();
      }
    }, 250);
  }

  private startWebAudioSource(): void {
    if (!this.audioCtx || !this.wbBuffer || !this.gainNode) return;
    this.stopWebAudioEngine(false);

    const source = this.audioCtx.createBufferSource();
    source.buffer = this.wbBuffer;
    source.playbackRate.value = this.targetPlaybackRate;
    source.connect(this.gainNode);

    const offset = Math.max(0, Math.min(this.wbStartOffset, Math.max(0, this.wbBuffer.duration - 0.01)));
    this.wbManualStop = false;
    source.onended = () => {
      if (this.wbManualStop || this.mode !== 'webaudio') return;
      this.wbPlaying = false;
      this.wbStartOffset = 0;
      if (this.wbProgressTimer !== null) {
        window.clearInterval(this.wbProgressTimer);
        this.wbProgressTimer = null;
      }
      this.callbacks?.onEnded();
    };

    this.wbSource = source;
    this.wbStartOffset = offset;
    this.wbStartCtxTime = this.audioCtx.currentTime;
    this.wbPlaying = true;
    source.start(0, offset);
    this.startWebAudioProgressTimer();
  }

  private async fallbackToWebAudioDecode(token: number, startTime = 0): Promise<boolean> {
    if (token !== this.loadToken) return false;
    let blob = this.activePlayableBlob;
    if ((!blob || blob.size === 0) && this.activeTrackMeta?.songId) {
      blob = (await getAudioFileBlob(this.activeTrackMeta.songId)) ?? null;
    }
    if (!blob || token !== this.loadToken) return false;
    if (!this.ensureAudioContextGraph(false) || !this.audioCtx) return false;

    if (this.audioCtx.state !== 'running') {
      await Promise.race([
        this.audioCtx.resume().catch(() => {}),
        new Promise<void>((resolve) => window.setTimeout(resolve, 500)),
      ]);
    }
    if (token !== this.loadToken) return false;

    const arrayBuf = await blob.arrayBuffer();
    if (token !== this.loadToken) return false;

    const decoded = await this.audioCtx.decodeAudioData(arrayBuf.slice(0));
    if (token !== this.loadToken) return false;

    // Tear down HTMLAudioElement source cleanly so it stops emitting errors
    this.isPriming = true;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.isPriming = false;
    const prevUrl = this.currentObjectUrl;
    this.currentObjectUrl = null;
    this.retireObjectUrl(prevUrl);
    this.flushRetiredObjectUrls();

    this.mode = 'webaudio';
    this.wbBuffer = decoded;
    const clampedStart = Math.max(0, Math.min(startTime, Math.max(0, decoded.duration - 0.1)));
    this.wbStartOffset = clampedStart;
    this.lastValidTime = clampedStart;
    if (this.masterVolumeNode) {
      this.masterVolumeNode.gain.value = this.targetVolume;
    }
    this.applyGainDb(this.currentGainDb);
    this.callbacks?.onLoadedMetadata();
    return true;
  }

  private waitForCanPlay(token: number, timeoutMs = 4000): Promise<void> {
    if (this.audio.error) {
      return Promise.reject(new Error(formatMediaError(this.audio.error)));
    }
    if (this.audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        this.audio.removeEventListener('canplay', onReady);
        this.audio.removeEventListener('loadeddata', onReady);
        this.audio.removeEventListener('error', onError);
        window.clearTimeout(timer);
      };

      const onReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(formatMediaError(this.audio.error)));
      };

      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        if (token !== this.loadToken) {
          resolve();
        } else if (this.audio.error) {
          reject(new Error(formatMediaError(this.audio.error)));
        } else {
          resolve();
        }
      }, timeoutMs);

      this.audio.addEventListener('canplay', onReady, { once: true });
      this.audio.addEventListener('loadeddata', onReady, { once: true });
      this.audio.addEventListener('error', onError, { once: true });
    });
  }

  async loadSong(song: Song, autoPlay: boolean, startTime = 0): Promise<boolean> {
    const token = ++this.loadToken;
    this.isSilentPreload = !autoPlay;
    this.ensureAudioElementMounted();

    if (autoPlay && this.primingPromise) {
      try {
        await this.primingPromise;
      } catch {
        // Ignore priming errors and proceed with real media load
      }
      if (token !== this.loadToken) return false;
    }

    const materializedBlob = await getAudioFileBlob(song.id);
    if (token !== this.loadToken) return false;
    if (!(materializedBlob instanceof Blob) || materializedBlob.size === 0) {
      throw new Error('Audio file missing or empty in IndexedDB storage');
    }

    const resolvedMime = resolveAudioMimeType(
      song.format,
      song.fileName,
      materializedBlob.type || song.mimeType
    );
    const playableBlob =
      materializedBlob.type === resolvedMime
        ? materializedBlob
        : new Blob([materializedBlob], { type: resolvedMime });

    this.activePlayableBlob = playableBlob;
    this.activeTrackMeta = {
      songId: song.id,
      fileName: song.fileName,
      mimeType: resolvedMime,
      blobSize: playableBlob.size,
    };
    this.stopWebAudioEngine(true);
    this.mode = 'html';
    if (this.masterVolumeNode) {
      this.masterVolumeNode.gain.value = 1;
    }

    // Invalidate any pending priming state cleanly before assigning the real track URL
    this.primingToken++;
    this.isPriming = false;
    this.audio.muted = false;

    const prevUrl = this.currentObjectUrl;
    const url = URL.createObjectURL(playableBlob);
    if (!url || !url.startsWith('blob:')) {
      throw new Error('Failed to create valid blob URL for audio playback');
    }

    this.currentObjectUrl = url;
    this.currentLoadedSongId = song.id;
    this.lastValidTime = Math.max(0, startTime);
    this.untypedFallbackTriedForToken = -1;

    if (this.audio.error) {
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.audio.src = url;
    this.audio.defaultPlaybackRate = this.targetPlaybackRate;
    this.audio.playbackRate = this.targetPlaybackRate;

    this.retireObjectUrl(prevUrl);

    this.applyGainDb(song.replayGainDb ?? 0);

    if (startTime > 0) {
      const applyStartTime = () => {
        if (token !== this.loadToken) return;
        try {
          if (Number.isFinite(this.audio.duration) && startTime < this.audio.duration) {
            this.audio.currentTime = startTime;
          }
        } catch {
          // Ignore seek errors before metadata
        }
      };
      if (this.audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        applyStartTime();
      } else {
        this.audio.addEventListener('loadedmetadata', applyStartTime, { once: true });
      }
    }

    void this.updateMediaSessionMetadata(song);

    if (autoPlay) {
      await this.play(token);
    }
    return true;
  }

  private async retryWithUntypedBlob(token: number, resumeAt = 0): Promise<boolean> {
    if (this.untypedFallbackTriedForToken === token || token !== this.loadToken) {
      return false;
    }
    this.untypedFallbackTriedForToken = token;

    let sourceBlob = this.activePlayableBlob;
    if (this.activeTrackMeta?.songId) {
      try {
        const fresh = await getAudioFileBlob(this.activeTrackMeta.songId);
        if (fresh && fresh.size > 0) {
          sourceBlob = fresh;
          this.activePlayableBlob = fresh;
        }
      } catch {
        // Keep existing in-memory blob if IndexedDB lookup fails
      }
    }
    if (!sourceBlob || token !== this.loadToken) return false;

    const rawUntyped = new Blob([sourceBlob]);
    const prevUrl = this.currentObjectUrl;
    const fallbackUrl = URL.createObjectURL(rawUntyped);
    this.currentObjectUrl = fallbackUrl;
    if (this.audio.error) {
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.audio.src = fallbackUrl;
    this.audio.defaultPlaybackRate = this.targetPlaybackRate;
    this.audio.playbackRate = this.targetPlaybackRate;
    this.retireObjectUrl(prevUrl);

    await this.waitForCanPlay(token, 2500);
    if (token !== this.loadToken) return false;

    if (resumeAt > 0 && Number.isFinite(this.audio.duration) && resumeAt < this.audio.duration) {
      try {
        this.audio.currentTime = resumeAt;
      } catch {
        // Ignore seek failure before playback starts
      }
    }

    await this.audio.play();
    this.isAudioUnlocked = true;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
    return true;
  }

  private recoverHtmlDecodeFailure(
    token: number,
    resumeAt = Math.max(
      this.lastValidTime,
      Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0
    )
  ): Promise<'recovered' | 'needs-gesture' | 'failed'> {
    if (token !== this.loadToken) {
      return Promise.resolve('failed');
    }
    if (this.recoveryState?.token === token) {
      return this.recoveryState.promise;
    }

    const promise = (async (): Promise<'recovered' | 'needs-gesture' | 'failed'> => {
      try {
        try {
          if (await this.retryWithUntypedBlob(token, resumeAt)) {
            return 'recovered';
          }
        } catch (retryErr) {
          if (retryErr instanceof DOMException && retryErr.name === 'NotAllowedError') {
            return 'needs-gesture';
          }
          // Untyped HTMLAudioElement retry also failed; try Web Audio decode fallback
        }

        try {
          const ready = await this.fallbackToWebAudioDecode(token, resumeAt);
          if (ready && token === this.loadToken) {
            if (this.audioCtx?.state === 'running') {
              this.startWebAudioSource();
              this.isAudioUnlocked = true;
              this.callbacks?.onPlay();
              if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
              }
              return 'recovered';
            }
            this.callbacks?.onPause();
            if ('mediaSession' in navigator) {
              navigator.mediaSession.playbackState = 'paused';
            }
            return 'needs-gesture';
          }
        } catch {
          // Both HTMLAudioElement and Web Audio decoding failed
        }
        return 'failed';
      } finally {
        if (this.recoveryState?.token === token) {
          this.recoveryState = null;
        }
      }
    })();

    this.recoveryState = { token, promise };
    return promise;
  }

  async play(expectedToken?: number): Promise<void> {
    const token = expectedToken ?? this.loadToken;
    if (token !== this.loadToken) return;
    this.isSilentPreload = false;
    this.ensureAudioElementMounted();

    if (this.mode === 'webaudio') {
      if (!this.wbBuffer) throw new Error('Audio buffer unavailable');
      this.ensureAudioContextGraph(false);
      if (this.audioCtx && this.audioCtx.state !== 'running') {
        await this.audioCtx.resume();
      }
      if (!this.wbPlaying) {
        this.startWebAudioSource();
        this.callbacks?.onPlay();
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      return;
    }

    if (this.normalizationEnabled) {
      this.ensureAudioContextGraph(true);
    }

    if (this.audioCtx && this.audioCtx.state !== 'running') {
      try {
        await this.audioCtx.resume();
      } catch {
        // Continue playback attempt
      }
    }

    const resumeAt = Math.max(
      this.lastValidTime,
      Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0
    );

    const initialError = this.audio.error;
    if (initialError) {
      const outcome = await this.recoverHtmlDecodeFailure(token, resumeAt);
      if (outcome === 'recovered') return;
      if (outcome === 'needs-gesture') {
        throw new DOMException('Tap Play to resume audio playback', 'NotAllowedError');
      }
      throw new Error(formatMediaError(initialError));
    }

    const attemptPlay = async () => {
      await this.audio.play();
      this.isAudioUnlocked = true;
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    };

    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await attemptPlay();
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError' && attempt === 0) {
            if (token !== this.loadToken) return;
            await this.waitForCanPlay(this.loadToken, 2500);
            if (token !== this.loadToken) return;
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }

      const postPlayError = this.audio.error as MediaError | null;
      if (
        postPlayError ||
        (err instanceof DOMException && err.name === 'NotSupportedError')
      ) {
        const outcome = await this.recoverHtmlDecodeFailure(token, resumeAt);
        if (outcome === 'recovered') return;
        if (outcome === 'needs-gesture') {
          throw new DOMException('Tap Play to resume audio playback', 'NotAllowedError');
        }
      }

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }

      const finalError = this.audio.error as MediaError | null;
      if (finalError) {
        throw new Error(formatMediaError(finalError));
      }
      throw err;
    }
  }

  pause(): void {
    if (this.mode === 'webaudio') {
      if (this.wbPlaying) {
        this.wbStartOffset = this.currentTime;
        this.stopWebAudioEngine(false);
        this.callbacks?.onPause();
      }
    } else {
      this.audio.pause();
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }

  stopAndClear(): void {
    this.loadToken++;
    this.primingToken++;
    this.isPriming = false;
    this.isSilentPreload = false;
    this.activePlayableBlob = null;
    this.activeTrackMeta = null;
    this.currentLoadedSongId = null;
    this.lastValidTime = 0;
    this.recoveryState = null;
    this.stopWebAudioEngine(true);
    this.mode = 'html';
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
    this.flushRetiredObjectUrls();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
    }
  }

  seekTo(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    const dur = this.duration;
    const clamped = Math.max(0, dur > 0 ? Math.min(seconds, dur) : seconds);
    this.lastValidTime = clamped;

    if (this.mode === 'webaudio') {
      const wasPlaying = this.wbPlaying;
      this.wbStartOffset = clamped;
      if (wasPlaying) {
        this.startWebAudioSource();
      }
      this.callbacks?.onTimeUpdate();
    } else {
      this.audio.currentTime = clamped;
    }
    this.syncMediaSessionPosition();
  }

  setVolume(val: number): void {
    const clamped = Math.max(0, Math.min(1, val));
    this.targetVolume = clamped;
    if (this.masterVolumeNode) {
      this.masterVolumeNode.gain.value = this.mode === 'webaudio' ? clamped : 1;
    }
    try {
      this.audio.volume = clamped;
    } catch {
      // iOS Safari hardware volume
    }
  }

  setPlaybackRate(rate: number): void {
    this.targetPlaybackRate = rate;
    if (this.mode === 'webaudio' && this.wbSource && this.audioCtx) {
      if (this.wbPlaying) {
        this.wbStartOffset = this.currentTime;
        this.wbStartCtxTime = this.audioCtx.currentTime;
      }
      try {
        this.wbSource.playbackRate.value = rate;
      } catch {
        // Ignore invalid rate
      }
    }
    try {
      this.audio.defaultPlaybackRate = rate;
      this.audio.playbackRate = rate;
      this.syncMediaSessionPosition();
    } catch {
      // Ignore invalid rate
    }
  }

  registerMediaSessionHandlers(callbacks: MediaSessionCallbacks): void {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;

    const safeSet = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null
    ) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Some older Safari versions do not support all action types
      }
    };

    safeSet('play', () => callbacks.onPlay());
    safeSet('pause', () => callbacks.onPause());
    safeSet('nexttrack', () => callbacks.onNext());
    safeSet('previoustrack', () => callbacks.onPrev());
    safeSet('seekto', (details) => {
      if (details.seekTime !== undefined) {
        callbacks.onSeekTo(details.seekTime);
      }
    });
    safeSet('seekbackward', (details) => {
      const offset = details.seekOffset ?? 10;
      callbacks.onSeekTo(Math.max(0, this.currentTime - offset));
    });
    safeSet('seekforward', (details) => {
      const offset = details.seekOffset ?? 10;
      const dur = this.duration;
      callbacks.onSeekTo(
        dur > 0 ? Math.min(dur, this.currentTime + offset) : this.currentTime + offset
      );
    });
  }

  async updateMediaSessionMetadata(song: Song): Promise<void> {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;

    let artworkBlob: Blob | undefined;
    if (song.artworkId) {
      try {
        const rec = await getArtworkRecord(song.artworkId);
        artworkBlob = rec?.blob;
      } catch {
        // Fallback art
      }
    }

    const artUrl = await getMediaSessionArtworkDataUrl(
      song.artworkId,
      artworkBlob,
      `${song.album}-${song.artist}`
    );

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: song.album,
        artwork: [
          { src: artUrl, sizes: '512x512', type: artworkBlob?.type || 'image/svg+xml' },
        ],
      });
    } catch {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.title,
          artist: song.artist,
          album: song.album,
        });
      } catch {
        // Ignore
      }
    }
  }

  syncMediaSessionPosition(): void {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const duration = this.duration;
    const position = this.currentTime;
    const playbackRate = this.targetPlaybackRate || 1;
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate,
        position: Math.min(position, duration),
      });
    } catch {
      // Ignore invalid position state on transitional loads
    }
  }
}

export const playerService = new AudioPlayerService();
