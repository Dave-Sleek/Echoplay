export type AudioFormat = 'MP3' | 'M4A' | 'AAC' | 'WAV' | 'FLAC' | 'OGG' | 'AUDIO';

export interface Song {
  id: string;
  fingerprint: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  trackNumber?: number;
  year?: string;
  format: AudioFormat;
  fileName: string;
  fileSize: number;
  mimeType: string;
  artworkId?: string;
  lyrics?: string;
  replayGainDb?: number;
  addedAt: number;
  playCount: number;
  lastPlayedAt?: number;
  lastPosition?: number;
  isFavorite: boolean;
}

export interface AudioFileRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  size: number;
}

export interface ArtworkRecord {
  id: string;
  blob: Blob;
  mimeType: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  artworkDataUrl?: string;
  songIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type ThemeMode = 'dark' | 'light';
export type AccentTheme = 'coral' | 'amber' | 'emerald' | 'indigo';
export type RepeatMode = 'off' | 'all' | 'one';

export interface UserSettings {
  theme: ThemeMode;
  accent: AccentTheme;
  shuffleDefault: boolean;
  repeatDefault: RepeatMode;
  playbackRate: number;
  volume: number;
  hapticsEnabled: boolean;
  audioNormalization: boolean;
  autoResumeEnabled?: boolean;
  eqBands: [number, number, number, number, number]; // 60Hz, 230Hz, 910Hz, 4kHz, 14kHz (-12dB to +12dB)
  crossfadeEnabled: boolean;
  crossfadeDuration: number; // seconds (1 to 12)
  sleepTimerUntil?: number; // timestamp
}

export interface PlaybackSnapshot {
  currentSongId: string | null;
  queueIds: string[];
  originalQueueIds: string[];
  currentIndex: number;
  currentTime: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  updatedAt: number;
}

export type AppTab = 'home' | 'library' | 'playlists' | 'settings';
export type LibrarySubTab = 'songs' | 'albums' | 'artists' | 'recent' | 'favorites';
export type SortField = 'title' | 'artist' | 'album' | 'addedAt';
export type SortDirection = 'asc' | 'desc';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface ImportProgress {
  total: number;
  processed: number;
  imported: number;
  duplicates: number;
  failed: number;
  currentFile: string;
  errors: string[];
}
