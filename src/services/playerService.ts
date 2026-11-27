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
  private decks: [HTMLAudioElement, HTMLAudioElement];
  private activeDeckIndex: 0 | 1 = 0;
  private deckObjectUrls: [string | null, string | null] = [null, null];
  private retiredObjectUrls = new Set<string>();

  private mode: 'html' | 'webaudio' = 'html';
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
  private pendingResumeTime: number | null = null;
  private recoveryState: {
    token: number;
    promise: Promise<'recovered' | 'needs-gesture' | 'failed'>;
  } | null = null;
  private callbacks: PlayerEventCallbacks | null = null;

  // Shared Web Audio graph (Dual-Deck Crossfade + 5-Band EQ + ReplayGain + Limiter)
  private audioCtx: AudioContext | null = null;
  private deckMediaSources: [MediaElementAudioSourceNode | null, MediaElementAudioSourceNode | null] = [
    null,
    null,
  ];
  private deckGains: [GainNode | null, GainNode | null] = [null, null];
  private eqFilters: BiquadFilterNode[] = [];
  private gainNode: GainNode | null = null;
  private masterVolumeNode: GainNode | null = null;
  private limiterNode: DynamicsCompressorNode | null = null;
  private normalizationEnabled = false;
  private crossfadeEnabled = false;
  private currentGainDb = 0;
  private pendingEqBands: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  // Active crossfade cleanup tracking
  private crossfadeTimerId: number | null = null;
  private crossfadeRafId: number | null = null;
  private fadingOutDeckIndex: 0 | 1 | null = null;

  // Web Audio buffer fallback state
  private wbBuffer: AudioBuffer | null = null;
  private wbSource: AudioBufferSourceNode | null = null;
  private wbStartOffset = 0;
  private wbStartCtxTime = 0;
  private wbPlaying = false;
  private wbManualStop = false;
  private wbProgressTimer: number | null = null;

  constructor() {
    const win =
      typeof window !== 'undefined'
        ? (window as unknown as {
            __echoPlayAudioEngine?: HTMLAudioElement;
            __echoPlayAudioEngineB?: HTMLAudioElement;
          })
        : null;

    const createOrReuseDeck = (id: string, existing?: HTMLAudioElement | null): HTMLAudioElement => {
      const fromDom =
        existing ||
        (typeof document !== 'undefined'
          ? (document.getElementById(id) as HTMLAudioElement | null)
          : null);
      const el = fromDom ?? document.createElement('audio');
      el.id = id;
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', '');
      el.style.display = 'none';
      return el;
    };

    const deckA = createOrReuseDeck('echoplay-audio-engine', win?.__echoPlayAudioEngine);
    const deckB = createOrReuseDeck('echoplay-audio-engine-b', win?.__echoPlayAudioEngineB);
    this.decks = [deckA, deckB];

    if (win) {
      win.__echoPlayAudioEngine = deckA;
      win.__echoPlayAudioEngineB = deckB;
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

    this.decks.forEach((el, idx) => this.attachDeckListeners(el, idx as 0 | 1));
  }

  private get audio(): HTMLAudioElement {
    return this.decks[this.activeDeckIndex];
  }

  private get standbyAudio(): HTMLAudioElement {
    return this.decks[this.activeDeckIndex === 0 ? 1 : 0];
  }

  private get standbyDeckIndex(): 0 | 1 {
    return this.activeDeckIndex === 0 ? 1 : 0;
  }

  private get currentObjectUrl(): string | null {
    return this.deckObjectUrls[this.activeDeckIndex];
  }

  private set currentObjectUrl(url: string | null) {
    this.deckObjectUrls[this.activeDeckIndex] = url;
  }

  private attachDeckListeners(el: HTMLAudioElement, deckIdx: 0 | 1): void {
    const isActiveDeck = () => this.activeDeckIndex === deckIdx;

    el.addEventListener('loadedmetadata', () => {
      try {
        el.playbackRate = this.targetPlaybackRate;
      } catch {
        // Ignore
      }
      if (!isActiveDeck()) return;

      if (this.pendingResumeTime !== null && this.pendingResumeTime > 0.25) {
        const dur = Number.isFinite(el.duration) ? el.duration : 0;
        const target =
          dur > 0 ? Math.min(this.pendingResumeTime, Math.max(0, dur - 0.5)) : this.pendingResumeTime;
        if (target > 0.25 && Math.abs((el.currentTime || 0) - target) > 0.75) {
          try {
            el.currentTime = target;
            this.lastValidTime = target;
          } catch {
            // Will retry on play()
          }
        }
      }

      if (this.mode === 'html' && !this.isPriming) {
        this.callbacks?.onLoadedMetadata();
      }
    });

    el.addEventListener('loadeddata', () => {
      if (!isActiveDeck()) return;
      if (this.mode === 'html' && !this.isPriming) {
        this.flushRetiredObjectUrls();
      }
    });

    el.addEventListener('timeupdate', () => {
      if (!isActiveDeck()) return;
      // Do not overwrite restored timestamp with 0 during startup silent preload
      if (this.mode === 'html' && !this.isPriming && !this.isSilentPreload) {
        if (Number.isFinite(el.currentTime) && el.currentTime > 0) {
          this.lastValidTime = el.currentTime;
          if (
            this.pendingResumeTime !== null &&
            Math.abs(el.currentTime - this.pendingResumeTime) < 2.5
          ) {
            this.pendingResumeTime = null;
          }
        }
        this.callbacks?.onTimeUpdate();
      }
    });

    el.addEventListener('play', () => {
      if (!isActiveDeck()) return;
      if (this.mode === 'html' && !this.isPriming) {
        this.callbacks?.onPlay();
      }
    });

    el.addEventListener('pause', () => {
      if (!isActiveDeck()) return;
      if (this.mode === 'html' && !this.isPriming) {
        this.callbacks?.onPause();
      }
    });

    el.addEventListener('ended', () => {
      if (!isActiveDeck()) return;
      if (this.mode === 'html' && !this.isPriming) {
        this.callbacks?.onEnded();
      }
    });

    el.addEventListener('error', () => {
      if (!isActiveDeck()) return;
      if (this.mode !== 'html' || this.isPriming) return;
      if (!el.getAttribute('src')) return;

      const token = this.loadToken;
      const diagnostics = this.getAudioErrorDiagnostics();
      const mediaErr = el.error;
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
          Number.isFinite(el.currentTime) ? el.currentTime : 0
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
      if (!document.body) return;
      for (const deck of this.decks) {
        if (!document.body.contains(deck)) {
          document.body.appendChild(deck);
        }
      }
    };
    if (document.body) {
      mount();
    } else {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    }
  }

  private retireObjectUrl(url: string | null): void {
    if (!url || this.deckObjectUrls.includes(url)) return;
    this.retiredObjectUrls.add(url);
  }

  private flushRetiredObjectUrls(): void {
    for (const url of this.retiredObjectUrls) {
      if (!this.deckObjectUrls.includes(url)) {
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
    if (this.isSilentPreload && this.pendingResumeTime !== null) {
      return this.pendingResumeTime;
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
    if (this.normalizationEnabled || this.crossfadeEnabled || this.hasActiveEq()) {
      this.ensureAudioContextGraph(this.mode === 'html');
    }
    if (this.audioCtx && this.audioCtx.state !== 'running') {
      this.audioCtx.resume().catch(() => {});
    }

    if (this.isAudioUnlocked || this.primingPromise) {
      return;
    }

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

  private hasActiveEq(): boolean {
    return this.pendingEqBands.some((b) => Math.abs(b) > 0.01);
  }

  private ensureAudioContextGraph(attachActiveDeck: boolean, attachStandbyDeck = false): boolean {
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
        const deckGainA = ctx.createGain();
        const deckGainB = ctx.createGain();

        limiter.threshold.value = -1.0;
        limiter.knee.value = 3.0;
        limiter.ratio.value = 12.0;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.12;

        const frequencies = [60, 230, 910, 4000, 14000];
        const eqFilters = frequencies.map((freq, idx) => {
          const f = ctx.createBiquadFilter();
          f.type = 'peaking';
          f.frequency.value = freq;
          f.Q.value = 1.4;
          f.gain.value = this.pendingEqBands[idx] ?? 0;
          return f;
        });

        deckGainA.connect(eqFilters[0]);
        deckGainB.connect(eqFilters[0]);
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
        this.deckGains = [deckGainA, deckGainB];
        this.eqFilters = eqFilters;
        this.gainNode = gain;
        this.masterVolumeNode = masterVol;
        this.limiterNode = limiter;
      }

      const attachDeck = (idx: 0 | 1) => {
        if (!this.audioCtx || !this.deckGains[idx] || this.deckMediaSources[idx]) return;
        const source = this.audioCtx.createMediaElementSource(this.decks[idx]);
        source.connect(this.deckGains[idx]!);
        this.deckMediaSources[idx] = source;
      };

      if (attachActiveDeck) {
        attachDeck(this.activeDeckIndex);
      }
      if (attachStandbyDeck) {
        attachDeck(this.standbyDeckIndex);
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

  setCrossfadeEnabled(enabled: boolean): void {
    this.crossfadeEnabled = enabled;
    if (enabled && (this.isAudioUnlocked || !this.paused)) {
      this.ensureAudioContextGraph(this.mode === 'html', true);
    }
  }

  setEqBands(bands: [number, number, number, number, number]): void {
    this.pendingEqBands = bands;
    if (!this.audioCtx && bands.some((b) => Math.abs(b) > 0.01)) {
      if (this.isAudioUnlocked || !this.paused) {
        this.ensureAudioContextGraph(this.mode === 'html');
      }
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

  private cancelActiveCrossfade(snapActiveDeckFull = true): void {
    if (this.crossfadeTimerId !== null) {
      window.clearTimeout(this.crossfadeTimerId);
      this.crossfadeTimerId = null;
    }
    if (this.crossfadeRafId !== null) {
      window.cancelAnimationFrame(this.crossfadeRafId);
      this.crossfadeRafId = null;
    }

    if (this.fadingOutDeckIndex !== null) {
      const idx = this.fadingOutDeckIndex;
      this.fadingOutDeckIndex = null;
      const outEl = this.decks[idx];
      try {
        outEl.pause();
        outEl.removeAttribute('src');
        outEl.load();
      } catch {
        // Ignore cleanup errors
      }
      const oldUrl = this.deckObjectUrls[idx];
      this.deckObjectUrls[idx] = null;
      this.retireObjectUrl(oldUrl);
      this.flushRetiredObjectUrls();

      const outGain = this.deckGains[idx];
      if (outGain && this.audioCtx) {
        try {
          outGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
          outGain.gain.setValueAtTime(1, this.audioCtx.currentTime);
        } catch {
          outGain.gain.value = 1;
        }
      }
      try {
        outEl.volume = this.targetVolume;
      } catch {
        // Ignore iOS read-only volume
      }
    }

    if (snapActiveDeckFull) {
      const activeGain = this.deckGains[this.activeDeckIndex];
      if (activeGain && this.audioCtx) {
        try {
          activeGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
          activeGain.gain.setValueAtTime(1, this.audioCtx.currentTime);
        } catch {
          activeGain.gain.value = 1;
        }
      }
      try {
        this.audio.volume = this.targetVolume;
      } catch {
        // Ignore iOS read-only volume
      }
    }
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
    if (!this.audioCtx || !this.wbBuffer || !this.eqFilters[0]) return;
    this.stopWebAudioEngine(false);

    const source = this.audioCtx.createBufferSource();
    source.buffer = this.wbBuffer;
    source.playbackRate.value = this.targetPlaybackRate;
    source.connect(this.eqFilters[0]);

    const offset = Math.max(
      0,
      Math.min(this.wbStartOffset, Math.max(0, this.wbBuffer.duration - 0.01))
    );
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

    this.cancelActiveCrossfade();
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
    this.pendingResumeTime = null;
    if (this.masterVolumeNode) {
      this.masterVolumeNode.gain.value = this.targetVolume;
    }
    this.applyGainDb(this.currentGainDb);
    this.callbacks?.onLoadedMetadata();
    return true;
  }

  private waitForCanPlay(token: number, timeoutMs = 4000, el = this.audio): Promise<void> {
    if (el.error) {
      return Promise.reject(new Error(formatMediaError(el.error)));
    }
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        el.removeEventListener('canplay', onReady);
        el.removeEventListener('loadeddata', onReady);
        el.removeEventListener('error', onError);
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
        reject(new Error(formatMediaError(el.error)));
      };

      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        if (token !== this.loadToken) {
          resolve();
        } else if (el.error) {
          reject(new Error(formatMediaError(el.error)));
        } else {
          resolve();
        }
      }, timeoutMs);

      el.addEventListener('canplay', onReady, { once: true });
      el.addEventListener('loadeddata', onReady, { once: true });
      el.addEventListener('error', onError, { once: true });
    });
  }

  private async preparePlayableBlob(song: Song): Promise<{ blob: Blob; mimeType: string }> {
    const materializedBlob = await getAudioFileBlob(song.id);
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
    return { blob: playableBlob, mimeType: resolvedMime };
  }

  async loadSong(song: Song, autoPlay: boolean, startTime = 0): Promise<boolean> {
    const token = ++this.loadToken;
    this.cancelActiveCrossfade(true);
    this.isSilentPreload = !autoPlay;
    this.ensureAudioElementMounted();

    if (autoPlay && this.primingPromise) {
      try {
        await this.primingPromise;
      } catch {
        // Ignore priming errors
      }
      if (token !== this.loadToken) return false;
    }

    const { blob: playableBlob, mimeType: resolvedMime } = await this.preparePlayableBlob(song);
    if (token !== this.loadToken) return false;

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

    this.primingToken++;
    this.isPriming = false;
    this.audio.muted = false;

    const prevUrl = this.currentObjectUrl;
    const url = URL.createObjectURL(playableBlob);
    if (!url || !url.startsWith('blob:')) {
      throw new Error('Failed to create valid blob URL for audio playback');
    }

    const safeStart = Math.max(0, startTime);
    this.currentObjectUrl = url;
    this.currentLoadedSongId = song.id;
    this.lastValidTime = safeStart;
    this.pendingResumeTime = safeStart > 0.25 ? safeStart : null;
    this.untypedFallbackTriedForToken = -1;

    if (this.audio.error) {
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.audio.src = url;
    try {
      this.audio.volume = this.targetVolume;
    } catch {
      // iOS read-only volume
    }
    this.audio.defaultPlaybackRate = this.targetPlaybackRate;
    this.audio.playbackRate = this.targetPlaybackRate;

    this.retireObjectUrl(prevUrl);
    this.applyGainDb(song.replayGainDb ?? 0);

    if (safeStart > 0) {
      const applyStartTime = () => {
        if (token !== this.loadToken) return;
        try {
          if (Number.isFinite(this.audio.duration) && safeStart < this.audio.duration) {
            this.audio.currentTime = safeStart;
          }
        } catch {
          // Will reapply in play()
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

  async crossfadeToSong(song: Song, fadeSeconds: number, startTime = 0): Promise<boolean> {
    if (this.mode !== 'html' || !this.hasActiveSource() || this.paused) {
      return this.loadSong(song, true, startTime);
    }

    const token = ++this.loadToken;
    this.cancelActiveCrossfade(true);
    this.isSilentPreload = false;
    this.ensureAudioElementMounted();

    const { blob: playableBlob, mimeType: resolvedMime } = await this.preparePlayableBlob(song);
    if (token !== this.loadToken) return false;

    const url = URL.createObjectURL(playableBlob);
    if (!url || !url.startsWith('blob:')) {
      return this.loadSong(song, true, startTime);
    }

    const outgoingIdx = this.activeDeckIndex;
    const incomingIdx = this.standbyDeckIndex;
    const outgoingEl = this.decks[outgoingIdx];
    const incomingEl = this.decks[incomingIdx];

    // Attach Web Audio graph to both decks if possible (essential for iOS volume crossfade)
    const graphReady = this.ensureAudioContextGraph(true, true);
    if (this.audioCtx && this.audioCtx.state !== 'running') {
      try {
        await this.audioCtx.resume();
      } catch {
        // Fallback to HTML volume animation
      }
    }

    const outgoingGain = this.deckGains[outgoingIdx];
    const incomingGain = this.deckGains[incomingIdx];
    const useWebAudioFade =
      graphReady &&
      Boolean(this.audioCtx) &&
      Boolean(outgoingGain) &&
      Boolean(incomingGain) &&
      Boolean(this.deckMediaSources[outgoingIdx]) &&
      Boolean(this.deckMediaSources[incomingIdx]);

    const safeFadeSec = Math.max(0.5, Math.min(12, fadeSeconds));
    const safeStart = Math.max(0, startTime);

    // Prepare incoming deck at silent gain before starting
    if (useWebAudioFade && this.audioCtx && incomingGain) {
      const now = this.audioCtx.currentTime;
      incomingGain.gain.cancelScheduledValues(now);
      incomingGain.gain.setValueAtTime(0.0001, now);
    }
    try {
      incomingEl.volume = useWebAudioFade ? this.targetVolume : 0;
    } catch {
      // iOS read-only volume
    }

    if (incomingEl.error) {
      incomingEl.removeAttribute('src');
      incomingEl.load();
    }
    const oldStandbyUrl = this.deckObjectUrls[incomingIdx];
    this.deckObjectUrls[incomingIdx] = url;
    this.retireObjectUrl(oldStandbyUrl);

    incomingEl.muted = false;
    incomingEl.src = url;
    incomingEl.defaultPlaybackRate = this.targetPlaybackRate;
    incomingEl.playbackRate = this.targetPlaybackRate;

    // Wait briefly for incoming deck metadata/audio buffers
    try {
      await this.waitForCanPlay(token, 2500, incomingEl);
    } catch {
      if (token === this.loadToken) {
        return this.loadSong(song, true, startTime);
      }
      return false;
    }
    if (token !== this.loadToken) return false;

    if (safeStart > 0.25 && Number.isFinite(incomingEl.duration) && safeStart < incomingEl.duration) {
      try {
        incomingEl.currentTime = safeStart;
      } catch {
        // Reapply after play
      }
    }

    // Swap active deck pointer BEFORE play() so UI listeners attach to the new track immediately
    this.activeDeckIndex = incomingIdx;
    this.fadingOutDeckIndex = outgoingIdx;
    this.activePlayableBlob = playableBlob;
    this.activeTrackMeta = {
      songId: song.id,
      fileName: song.fileName,
      mimeType: resolvedMime,
      blobSize: playableBlob.size,
    };
    this.currentLoadedSongId = song.id;
    this.lastValidTime = safeStart;
    this.pendingResumeTime = safeStart > 0.25 ? safeStart : null;
    this.untypedFallbackTriedForToken = -1;
    this.applyGainDb(song.replayGainDb ?? 0);
    void this.updateMediaSessionMetadata(song);

    try {
      await incomingEl.play();
      this.isAudioUnlocked = true;
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    } catch {
      // If crossfade simultaneous play fails (e.g. strict single-stream policy), fallback cleanly
      this.cancelActiveCrossfade(true);
      return this.loadSong(song, true, startTime);
    }

    if (safeStart > 0.25 && Math.abs((incomingEl.currentTime || 0) - safeStart) > 1.2) {
      try {
        if (Number.isFinite(incomingEl.duration) && safeStart < incomingEl.duration) {
          incomingEl.currentTime = safeStart;
        }
      } catch {
        // Ignore
      }
    }

    // Run smooth equal-power/linear crossfade ramp on both decks simultaneously
    if (useWebAudioFade && this.audioCtx && outgoingGain && incomingGain) {
      const now = this.audioCtx.currentTime;
      const currentOutGain = Math.max(0.0001, outgoingGain.gain.value || 1);
      outgoingGain.gain.cancelScheduledValues(now);
      outgoingGain.gain.setValueAtTime(currentOutGain, now);
      outgoingGain.gain.linearRampToValueAtTime(0.0001, now + safeFadeSec);

      incomingGain.gain.cancelScheduledValues(now);
      incomingGain.gain.setValueAtTime(0.0001, now);
      incomingGain.gain.linearRampToValueAtTime(1.0, now + safeFadeSec);
    }

    // Smooth HTML5 volume ramp (handles browsers without WebAudio graph attachment)
    const startMs = performance.now();
    const fadeMs = safeFadeSec * 1000;
    const startOutVol = (() => {
      try {
        return outgoingEl.volume;
      } catch {
        return this.targetVolume;
      }
    })();

    const stepFade = (nowMs: number) => {
      if (this.fadingOutDeckIndex !== outgoingIdx) return;
      const t = Math.min(1, (nowMs - startMs) / fadeMs);

      if (!useWebAudioFade) {
        try {
          outgoingEl.volume = Math.max(0, startOutVol * (1 - t));
          incomingEl.volume = Math.min(this.targetVolume, this.targetVolume * t);
        } catch {
          // Ignore iOS read-only volume
        }
      }

      if (t < 1) {
        this.crossfadeRafId = window.requestAnimationFrame(stepFade);
      } else {
        this.crossfadeRafId = null;
      }
    };
    this.crossfadeRafId = window.requestAnimationFrame(stepFade);

    this.crossfadeTimerId = window.setTimeout(() => {
      this.crossfadeTimerId = null;
      if (this.fadingOutDeckIndex === outgoingIdx) {
        this.cancelActiveCrossfade(true);
      }
    }, fadeMs + 80);

    this.callbacks?.onLoadedMetadata();
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
        // Keep existing in-memory blob
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
        // Ignore seek failure
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
          // Both failed
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

    if (this.normalizationEnabled || this.crossfadeEnabled || this.hasActiveEq()) {
      this.ensureAudioContextGraph(true, this.crossfadeEnabled);
    }

    if (this.audioCtx && this.audioCtx.state !== 'running') {
      try {
        await this.audioCtx.resume();
      } catch {
        // Continue playback attempt
      }
    }

    const resumeAt = Math.max(
      this.pendingResumeTime ?? 0,
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

    const enforceResumeTimestamp = () => {
      const target = this.pendingResumeTime;
      if (target !== null && target > 0.25) {
        const dur = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
        const clamped = dur > 0 ? Math.min(target, Math.max(0, dur - 0.5)) : target;
        if (Math.abs((this.audio.currentTime || 0) - clamped) > 1.2) {
          try {
            this.audio.currentTime = clamped;
            this.lastValidTime = clamped;
          } catch {
            // Will retry after play()
          }
        }
      }
    };

    const attemptPlay = async () => {
      enforceResumeTimestamp();
      await this.audio.play();
      enforceResumeTimestamp();
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
    this.cancelActiveCrossfade(true);
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
    this.cancelActiveCrossfade(true);
    this.isPriming = false;
    this.isSilentPreload = false;
    this.activePlayableBlob = null;
    this.activeTrackMeta = null;
    this.currentLoadedSongId = null;
    this.lastValidTime = 0;
    this.pendingResumeTime = null;
    this.recoveryState = null;
    this.stopWebAudioEngine(true);
    this.mode = 'html';

    this.decks.forEach((deck, idx) => {
      try {
        deck.pause();
        deck.removeAttribute('src');
        deck.load();
      } catch {
        // Ignore
      }
      const u = this.deckObjectUrls[idx];
      if (u) {
        try {
          URL.revokeObjectURL(u);
        } catch {
          // Ignore
        }
        this.deckObjectUrls[idx] = null;
      }
    });

    this.flushRetiredObjectUrls();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
    }
  }

  seekTo(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    this.cancelActiveCrossfade(true);
    const dur = this.duration;
    const clamped = Math.max(0, dur > 0 ? Math.min(seconds, dur) : seconds);
    this.lastValidTime = clamped;
    this.pendingResumeTime = null;

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
    for (const deck of this.decks) {
      try {
        deck.volume = clamped;
      } catch {
        // iOS Safari hardware volume
      }
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
        // Ignore
      }
    }
    for (const deck of this.decks) {
      try {
        deck.defaultPlaybackRate = rate;
        deck.playbackRate = rate;
      } catch {
        // Ignore
      }
    }
    this.syncMediaSessionPosition();
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
        // Unsupported action type
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
      // Ignore transitional position errors
    }
  }
}

export const playerService = new AudioPlayerService();
