import { detectAudioFormat } from './audioMetadata';

/**
 * Detects if the current device is running Android.
 */
export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * Checks if the browser supports the File System Access API directory picker.
 */
export function supportsNativeDirectoryPicker(): boolean {
  if (typeof window === 'undefined') return false;
  return 'showDirectoryPicker' in window && typeof (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker === 'function';
}

/**
 * Recursively scans a FileSystemDirectoryHandle for audio files.
 */
export async function scanDirectoryHandleForAudio(
  dirHandle: FileSystemDirectoryHandle,
  onProgress?: (foundCount: number, currentDirOrFile: string) => void
): Promise<File[]> {
  const audioFiles: File[] = [];

  async function walk(handle: FileSystemDirectoryHandle, path: string): Promise<void> {
    onProgress?.(audioFiles.length, handle.name);
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        try {
          const file = await (entry as FileSystemFileHandle).getFile();
          if (detectAudioFormat(file) !== null) {
            audioFiles.push(file);
            onProgress?.(audioFiles.length, entry.name);
          }
        } catch {
          // Skip inaccessible or permission-restricted individual files
        }
      } else if (entry.kind === 'directory') {
        // Skip hidden folders (e.g. .thumbnails, .nomedia, .cache)
        if (!entry.name.startsWith('.')) {
          try {
            await walk(entry as FileSystemDirectoryHandle, `${path}/${entry.name}`);
          } catch {
            // Skip folders with restricted access
          }
        }
      }
    }
  }

  await walk(dirHandle, dirHandle.name);
  return audioFiles;
}

/**
 * Filters a FileList or File[] down to only supported audio files,
 * eliminating non-audio files (cover images, playlists, text files, .nomedia, etc.)
 * so directory scans don't report false errors.
 */
export function filterAudioFiles(files: FileList | File[]): File[] {
  const list = Array.from(files);
  return list.filter((f) => {
    // Ignore hidden or system files
    if (f.name.startsWith('.')) return false;
    return detectAudioFormat(f) !== null;
  });
}
