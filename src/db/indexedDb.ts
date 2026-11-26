import type {
  ArtworkRecord,
  AudioFileRecord,
  PlaybackSnapshot,
  Playlist,
  Song,
  UserSettings,
} from '../types/music';
import { canonicalizeAudioMimeType, sniffAudioMimeFromBytes } from '../utils/audioMetadata';

const DB_NAME = 'EchoPlayDB';
const DB_VERSION = 1;

const STORES = {
  SONGS: 'songs',
  AUDIO_FILES: 'audioFiles',
  ARTWORKS: 'artworks',
  PLAYLISTS: 'playlists',
  SETTINGS: 'settings',
} as const;

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  accent: 'coral',
  shuffleDefault: false,
  repeatDefault: 'off',
  playbackRate: 1,
  volume: 1,
  hapticsEnabled: true,
  audioNormalization: false,
};

let dbPromise: Promise<IDBDatabase> | null = null;

function ensureStoresExist(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORES.SONGS)) {
    const songStore = db.createObjectStore(STORES.SONGS, { keyPath: 'id' });
    songStore.createIndex('addedAt', 'addedAt', { unique: false });
    songStore.createIndex('fingerprint', 'fingerprint', { unique: false });
    songStore.createIndex('isFavorite', 'isFavorite', { unique: false });
    songStore.createIndex('lastPlayedAt', 'lastPlayedAt', { unique: false });
  }
  if (!db.objectStoreNames.contains(STORES.AUDIO_FILES)) {
    db.createObjectStore(STORES.AUDIO_FILES, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORES.ARTWORKS)) {
    db.createObjectStore(STORES.ARTWORKS, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORES.PLAYLISTS)) {
    db.createObjectStore(STORES.PLAYLISTS, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
    db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
  }
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      dbPromise = null;
      reject(new Error('IndexedDB is not available in this browser context'));
      return;
    }

    const openWithVersion = (version?: number) => {
      const request =
        version !== undefined
          ? indexedDB.open(DB_NAME, version)
          : indexedDB.open(DB_NAME);

      request.onupgradeneeded = () => {
        ensureStoresExist(request.result);
      };

      request.onsuccess = () => {
        const db = request.result;
        const missingStore = Object.values(STORES).some(
          (name) => !db.objectStoreNames.contains(name)
        );
        if (missingStore) {
          const nextVersion = Math.max(DB_VERSION, db.version) + 1;
          try {
            db.close();
          } catch {
            // Ignore close errors
          }
          openWithVersion(nextVersion);
          return;
        }

        db.onversionchange = () => {
          try {
            db.close();
          } catch {
            // Ignore close errors
          }
          dbPromise = null;
        };
        // Critical on iOS Safari / WebKit: background suspension closes IDB connections silently
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null;
        reject(request.error ?? new Error('Failed to open IndexedDB'));
      };

      request.onblocked = () => {
        dbPromise = null;
      };
    };

    openWithVersion();
  });
  return dbPromise;
}

async function openTransaction(
  storeNames: string | string[],
  mode: IDBTransactionMode
): Promise<IDBTransaction> {
  let db = await openDB();
  try {
    return db.transaction(storeNames, mode);
  } catch {
    // Re-open if WebKit/Safari closed or invalidated the cached IDBDatabase handle
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
    dbPromise = null;
    db = await openDB();
    return db.transaction(storeNames, mode);
  }
}

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

// Songs CRUD
export async function getAllSongs(): Promise<Song[]> {
  const tx = await openTransaction(STORES.SONGS, 'readonly');
  const songs = await reqToPromise(tx.objectStore(STORES.SONGS).getAll());
  return (songs as Song[]).sort((a, b) => b.addedAt - a.addedAt);
}

export async function saveImportedSong(
  song: Song,
  audioBlob: Blob,
  artworkBlob?: Blob,
  artworkMimeType?: string
): Promise<void> {
  const storeNames: string[] = [STORES.SONGS, STORES.AUDIO_FILES];
  if (artworkBlob && song.artworkId) storeNames.push(STORES.ARTWORKS);

  const tx = await openTransaction(storeNames, 'readwrite');
  tx.objectStore(STORES.SONGS).put(song);
  const audioRecord: AudioFileRecord = {
    id: song.id,
    blob: audioBlob,
    mimeType: song.mimeType,
    size: song.fileSize,
  };
  tx.objectStore(STORES.AUDIO_FILES).put(audioRecord);

  if (artworkBlob && song.artworkId) {
    const artRecord: ArtworkRecord = {
      id: song.artworkId,
      blob: artworkBlob,
      mimeType: artworkMimeType || 'image/jpeg',
    };
    tx.objectStore(STORES.ARTWORKS).put(artRecord);
  }
  await txDone(tx);
}

export async function updateSong(song: Song): Promise<void> {
  const tx = await openTransaction(STORES.SONGS, 'readwrite');
  tx.objectStore(STORES.SONGS).put(song);
  await txDone(tx);
}

export async function deleteSongById(songId: string): Promise<void> {
  const tx = await openTransaction(
    [STORES.SONGS, STORES.AUDIO_FILES, STORES.PLAYLISTS],
    'readwrite'
  );
  tx.objectStore(STORES.SONGS).delete(songId);
  tx.objectStore(STORES.AUDIO_FILES).delete(songId);

  // Also strip songId from any playlists referencing it
  const plStore = tx.objectStore(STORES.PLAYLISTS);
  const playlists = (await reqToPromise(plStore.getAll())) as Playlist[];
  for (const pl of playlists) {
    if (pl.songIds.includes(songId)) {
      plStore.put({
        ...pl,
        songIds: pl.songIds.filter((id) => id !== songId),
        updatedAt: Date.now(),
      });
    }
  }
  await txDone(tx);
}

export async function getAudioFileBlob(songId: string): Promise<Blob | undefined> {
  const tx = await openTransaction(STORES.AUDIO_FILES, 'readonly');
  const record = (await reqToPromise(
    tx.objectStore(STORES.AUDIO_FILES).get(songId)
  )) as (AudioFileRecord & { data?: ArrayBuffer }) | undefined;

  if (!record) return undefined;

  const raw: unknown = record.blob ?? record.data;
  if (!raw) return undefined;

  let buffer: ArrayBuffer;
  let storedMime: string | undefined = record.mimeType;

  if (raw instanceof Blob) {
    storedMime = raw.type || storedMime;
    buffer = await raw.arrayBuffer();
  } else if (raw instanceof ArrayBuffer) {
    buffer = raw.slice(0);
  } else if (ArrayBuffer.isView(raw)) {
    buffer = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength).slice().buffer;
  } else {
    return undefined;
  }

  if (buffer.byteLength === 0) return undefined;

  const headerBytes = new Uint8Array(buffer, 0, Math.min(262144, buffer.byteLength));
  const resolvedMime =
    sniffAudioMimeFromBytes(headerBytes) ||
    canonicalizeAudioMimeType(storedMime) ||
    'audio/mpeg';

  return new Blob([buffer], { type: resolvedMime });
}

export async function getArtworkRecord(artworkId: string): Promise<ArtworkRecord | undefined> {
  const tx = await openTransaction(STORES.ARTWORKS, 'readonly');
  return (await reqToPromise(
    tx.objectStore(STORES.ARTWORKS).get(artworkId)
  )) as ArtworkRecord | undefined;
}

export async function getAllArtworks(): Promise<ArtworkRecord[]> {
  const tx = await openTransaction(STORES.ARTWORKS, 'readonly');
  return (await reqToPromise(tx.objectStore(STORES.ARTWORKS).getAll())) as ArtworkRecord[];
}

// Playlists CRUD
export async function getAllPlaylists(): Promise<Playlist[]> {
  const tx = await openTransaction(STORES.PLAYLISTS, 'readonly');
  const list = (await reqToPromise(tx.objectStore(STORES.PLAYLISTS).getAll())) as Playlist[];
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function savePlaylist(playlist: Playlist): Promise<void> {
  const tx = await openTransaction(STORES.PLAYLISTS, 'readwrite');
  tx.objectStore(STORES.PLAYLISTS).put(playlist);
  await txDone(tx);
}

export async function deletePlaylistById(playlistId: string): Promise<void> {
  const tx = await openTransaction(STORES.PLAYLISTS, 'readwrite');
  tx.objectStore(STORES.PLAYLISTS).delete(playlistId);
  await txDone(tx);
}

// Settings & Playback Snapshot
export async function getUserSettings(): Promise<UserSettings> {
  const tx = await openTransaction(STORES.SETTINGS, 'readonly');
  const row = (await reqToPromise(tx.objectStore(STORES.SETTINGS).get('userSettings'))) as
    | { key: string; value: UserSettings }
    | undefined;
  return { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) };
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  try {
    localStorage.setItem('echoplay_theme', settings.theme);
  } catch {
    // Ignore localStorage restrictions
  }
  const tx = await openTransaction(STORES.SETTINGS, 'readwrite');
  tx.objectStore(STORES.SETTINGS).put({ key: 'userSettings', value: settings });
  await txDone(tx);
}

export async function getPlaybackSnapshot(): Promise<PlaybackSnapshot | null> {
  const tx = await openTransaction(STORES.SETTINGS, 'readonly');
  const row = (await reqToPromise(tx.objectStore(STORES.SETTINGS).get('playbackSnapshot'))) as
    | { key: string; value: PlaybackSnapshot }
    | undefined;
  return row?.value ?? null;
}

export async function savePlaybackSnapshot(snapshot: PlaybackSnapshot): Promise<void> {
  const tx = await openTransaction(STORES.SETTINGS, 'readwrite');
  tx.objectStore(STORES.SETTINGS).put({ key: 'playbackSnapshot', value: snapshot });
  await txDone(tx);
}

// Maintenance & Storage Metrics
export async function clearRecentlyPlayedInDB(): Promise<void> {
  const tx = await openTransaction(STORES.SONGS, 'readwrite');
  const store = tx.objectStore(STORES.SONGS);
  const songs = (await reqToPromise(store.getAll())) as Song[];
  for (const s of songs) {
    if (s.lastPlayedAt !== undefined || s.playCount > 0) {
      store.put({ ...s, lastPlayedAt: undefined, playCount: 0 });
    }
  }
  await txDone(tx);
}

export async function clearMusicLibraryInDB(): Promise<void> {
  const tx = await openTransaction(
    [STORES.SONGS, STORES.AUDIO_FILES, STORES.ARTWORKS, STORES.PLAYLISTS],
    'readwrite'
  );
  tx.objectStore(STORES.SONGS).clear();
  tx.objectStore(STORES.AUDIO_FILES).clear();
  tx.objectStore(STORES.ARTWORKS).clear();
  const plStore = tx.objectStore(STORES.PLAYLISTS);
  const playlists = (await reqToPromise(plStore.getAll())) as Playlist[];
  for (const pl of playlists) {
    plStore.put({ ...pl, songIds: [], updatedAt: Date.now() });
  }
  await txDone(tx);
}

export async function deleteAllLocalDataInDB(): Promise<void> {
  const tx = await openTransaction(
    [STORES.SONGS, STORES.AUDIO_FILES, STORES.ARTWORKS, STORES.PLAYLISTS, STORES.SETTINGS],
    'readwrite'
  );
  tx.objectStore(STORES.SONGS).clear();
  tx.objectStore(STORES.AUDIO_FILES).clear();
  tx.objectStore(STORES.ARTWORKS).clear();
  tx.objectStore(STORES.PLAYLISTS).clear();
  tx.objectStore(STORES.SETTINGS).clear();
  await txDone(tx);
}

export interface StorageStats {
  audioBytes: number;
  artworkBytes: number;
  songCount: number;
  playlistCount: number;
  quotaBytes?: number;
  usageBytes?: number;
}

export async function getStorageStats(): Promise<StorageStats> {
  const tx = await openTransaction([STORES.SONGS, STORES.ARTWORKS, STORES.PLAYLISTS], 'readonly');
  const songs = (await reqToPromise(tx.objectStore(STORES.SONGS).getAll())) as Song[];
  const artworks = (await reqToPromise(tx.objectStore(STORES.ARTWORKS).getAll())) as ArtworkRecord[];
  const playlists = (await reqToPromise(tx.objectStore(STORES.PLAYLISTS).getAll())) as Playlist[];

  const audioBytes = songs.reduce((acc, s) => acc + (s.fileSize || 0), 0);
  const artworkBytes = artworks.reduce((acc, a) => acc + (a.blob?.size || 0), 0);

  let quotaBytes: number | undefined;
  let usageBytes: number | undefined;
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      quotaBytes = est.quota;
      usageBytes = est.usage;
    }
  } catch {
    // Safari private mode or unsupported
  }

  return {
    audioBytes,
    artworkBytes,
    songCount: songs.length,
    playlistCount: playlists.length,
    quotaBytes,
    usageBytes,
  };
}
