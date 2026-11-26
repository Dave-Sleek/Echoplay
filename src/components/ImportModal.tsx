import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  FolderOpen,
  FolderSearch,
  Loader2,
  Music,
  Music2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useEchoPlay } from '../context/EchoPlayContext';
import {
  filterAudioFiles,
  isAndroidDevice,
  scanDirectoryHandleForAudio,
  supportsNativeDirectoryPicker,
} from '../utils/deviceScanner';
import { triggerHaptic } from '../utils/haptics';

export const ImportModal: React.FC = () => {
  const {
    isImportModalOpen,
    setImportModalOpen,
    importFiles,
    importProgress,
    clearImportProgress,
    showToast,
  } = useEchoPlay();

  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const androidAudioInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isScanningFolder, setIsScanningFolder] = useState(false);
  const [scanStatus, setScanStatus] = useState('');

  if (!isImportModalOpen) return null;

  const isAndroid = isAndroidDevice();

  const isImporting =
    importProgress !== null && importProgress.processed < importProgress.total;
  const isFinished =
    importProgress !== null && importProgress.processed >= importProgress.total;

  const handleClose = () => {
    if (isImporting || isScanningFolder) return;
    clearImportProgress();
    setImportModalOpen(false);
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const audioFiles = filterAudioFiles(files);
    if (audioFiles.length === 0) {
      showToast('No supported audio files (MP3, M4A, FLAC, WAV, AAC, OGG) found in selection', 'error');
      return;
    }
    void importFiles(audioFiles);
  };

  const handleScanDeviceAudio = () => {
    triggerHaptic('tap');
    androidAudioInputRef.current?.click();
  };

  const handleScanFolder = async () => {
    triggerHaptic('tap');
    if (supportsNativeDirectoryPicker()) {
      try {
        setIsScanningFolder(true);
        setScanStatus('Opening folder picker...');
        // @ts-expect-error window.showDirectoryPicker is available in modern Chromium / Android
        const dirHandle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
          id: 'echoplay-music-folder',
          mode: 'read',
        });
        setScanStatus('Scanning folder and subdirectories for songs...');
        const audioFiles = await scanDirectoryHandleForAudio(dirHandle, (count, name) => {
          setScanStatus(`Scanning: found ${count} ${count === 1 ? 'song' : 'songs'} (${name})...`);
        });
        setIsScanningFolder(false);
        setScanStatus('');
        if (audioFiles.length === 0) {
          showToast('No audio files found in selected folder', 'error');
          return;
        }
        void importFiles(audioFiles);
        return;
      } catch (err: unknown) {
        setIsScanningFolder(false);
        setScanStatus('');
        if (err instanceof Error && err.name === 'AbortError') return;
        // Fallback to webkitdirectory input
        folderInputRef.current?.click();
        return;
      }
    }
    folderInputRef.current?.click();
  };

  const handleFolderInputSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const audioFiles = filterAudioFiles(files);
    e.target.value = '';
    if (audioFiles.length === 0) {
      showToast('No audio files found in selected folder', 'error');
      return;
    }
    void importFiles(audioFiles);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div
        className="w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#171920] border-t sm:border border-black/10 dark:border-white/10 p-5 sm:p-6 pb-[calc(24px+env(safe-area-inset-bottom,0px))] shadow-2xl max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto mb-3 sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="import-modal-title" className="text-xl font-bold text-zinc-900 dark:text-white">
                {isAndroid ? 'Scan & Import Music' : 'Import Music'}
              </h2>
              {isAndroid && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold">
                  <Smartphone className="w-3 h-3" />
                  Android
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {isAndroid
                ? 'Scan your Android phone storage or pick folders to upload songs locally'
                : 'Select audio files or scan folders from your device into your offline library'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting || isScanningFolder}
            aria-label="Close import dialog"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden File Inputs */}
        {/* 1. Android Native Audio Scanner (MediaStore) */}
        <input
          ref={androidAudioInputRef}
          type="file"
          multiple
          accept="audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus,.webm"
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />

        {/* 2. Folder / Directory Scanner */}
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFolderInputSelected}
          {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
        />

        {/* 3. Individual File Picker */}
        <input
          ref={filesInputRef}
          type="file"
          multiple
          accept=".mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.webm,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/flac,audio/ogg,audio/*"
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />

        {/* Folder Scanning Active State */}
        {isScanningFolder && (
          <div className="mt-5 p-5 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 flex items-center gap-3.5">
            <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                Scanning Phone Directory...
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 truncate mt-0.5">
                {scanStatus || 'Searching for audio files...'}
              </p>
            </div>
          </div>
        )}

        {/* Main Selection Actions (when not importing and not scanning) */}
        {!importProgress && !isScanningFolder && (
          <div className="mt-5 space-y-3">
            {/* Action 1: Android System Audio Scanner (or Device Audio Scanner) */}
            <div
              onClick={handleScanDeviceAudio}
              className="p-4 rounded-2xl border border-black/10 dark:border-white/10 hover:border-[var(--accent)] bg-black/[0.02] dark:bg-white/[0.03] hover:bg-[var(--accent-soft)]/20 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-[var(--accent)] transition-colors">
                      {isAndroid ? 'Scan All Songs on Phone' : 'Scan Device Audio Library'}
                    </p>
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)]">
                      Recommended
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                    {isAndroid
                      ? 'Opens Android’s audio picker with all music indexed on your phone.'
                      : 'Opens your device audio manager to choose tracks.'}
                  </p>
                  {isAndroid && (
                    <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5 font-medium">
                      <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" />
                      <span>
                        <strong>Android Tip:</strong> In the picker, tap the top menu (<strong>⋮</strong>) and choose <strong>Select all</strong> to add all songs at once!
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleScanDeviceAudio();
                }}
                className="min-h-[40px] px-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold whitespace-nowrap self-end sm:self-center transition-colors shadow-sm"
              >
                Scan Audio
              </button>
            </div>

            {/* Action 2: Scan Music Folder / SD Card */}
            <div
              onClick={handleScanFolder}
              className="p-4 rounded-2xl border border-black/10 dark:border-white/10 hover:border-[var(--accent)] bg-black/[0.02] dark:bg-white/[0.03] hover:bg-[var(--accent-soft)]/20 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <FolderSearch className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-[var(--accent)] transition-colors">
                    Scan Music Folder / SD Card
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                    Pick your <code className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10 text-zinc-700 dark:text-zinc-300">Music</code>, <code className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10 text-zinc-700 dark:text-zinc-300">Download</code>, or SD Card folder. EchoPlay will recursively scan all artist & album subfolders.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleScanFolder();
                }}
                className="min-h-[40px] px-4 rounded-xl bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 text-zinc-900 dark:text-white text-xs font-semibold whitespace-nowrap self-end sm:self-center transition-colors"
              >
                Choose Folder
              </button>
            </div>

            {/* Action 3: Choose Individual Files / Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleFilesSelected(e.dataTransfer.files);
              }}
              onClick={() => filesInputRef.current?.click()}
              className={`rounded-2xl border-2 border-dashed p-4 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-zinc-300 dark:border-white/15 hover:border-[var(--accent)] hover:bg-black/[0.01] dark:hover:bg-white/[0.02]'
              }`}
            >
              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <Upload className="w-4 h-4 text-[var(--accent)]" />
                <span>Or pick individual files (or drag & drop here)</span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Supports MP3, M4A, FLAC, WAV, AAC, OGG, and OPUS audio tracks.
              </p>
            </div>

            {/* Privacy & Feature Notes */}
            <div className="pt-2 space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
              <div className="flex items-start gap-2">
                <Music2 className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                <p>
                  <strong className="text-zinc-900 dark:text-zinc-200">Auto-extracted metadata:</strong>{' '}
                  Titles, artists, albums, and embedded high-res cover art are parsed locally. Duplicate songs are detected and skipped automatically.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-zinc-900 dark:text-zinc-200">100% private & offline:</strong>{' '}
                  Songs are stored directly in your browser’s IndexedDB database on this phone and are never uploaded to any external server.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Import Progress & Results */}
        {importProgress && (
          <div className="mt-5 space-y-4">
            <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04]">
              <div className="flex items-center justify-between text-sm font-medium text-zinc-900 dark:text-white">
                <span>
                  {isImporting ? 'Importing songs to offline library...' : 'Import complete'}
                </span>
                <span className="tabular-nums text-xs text-zinc-500 dark:text-zinc-400">
                  {importProgress.processed} / {importProgress.total}
                </span>
              </div>
              <div className="mt-2.5 h-2 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] transition-all duration-200"
                  style={{
                    width: `${
                      importProgress.total > 0
                        ? Math.round((importProgress.processed / importProgress.total) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
              {isImporting && importProgress.currentFile && (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  Processing: {importProgress.currentFile}
                </p>
              )}
            </div>

            {isFinished && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <p className="text-xl font-bold tabular-nums">{importProgress.imported}</p>
                    <p className="text-xs font-medium mt-0.5">Imported</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-zinc-500/10 text-zinc-600 dark:text-zinc-300">
                    <p className="text-xl font-bold tabular-nums">{importProgress.duplicates}</p>
                    <p className="text-xs font-medium mt-0.5">Duplicates</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400">
                    <p className="text-xl font-bold tabular-nums">{importProgress.failed}</p>
                    <p className="text-xs font-medium mt-0.5">Skipped</p>
                  </div>
                </div>

                {importProgress.errors.length > 0 && (
                  <div className="p-3 rounded-2xl bg-red-500/8 border border-red-500/20 max-h-32 overflow-y-auto">
                    <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">
                      Unsupported or unreadable tracks:
                    </p>
                    <ul className="text-xs text-red-500/90 space-y-1">
                      {importProgress.errors.map((err, i) => (
                        <li key={i} className="truncate">
                          {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      clearImportProgress();
                    }}
                    className="flex-1 min-h-[44px] px-4 rounded-xl bg-black/5 dark:bg-white/8 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-black/10 dark:hover:bg-white/12 transition-colors"
                  >
                    Scan More
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 min-h-[44px] px-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm font-semibold text-white inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
