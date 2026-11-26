import React, { useRef, useState } from 'react';
import { CheckCircle2, FolderOpen, Music2, ShieldCheck, Upload, X } from 'lucide-react';
import { useEchoPlay } from '../context/EchoPlayContext';

export const ImportModal: React.FC = () => {
  const {
    isImportModalOpen,
    setImportModalOpen,
    importFiles,
    importProgress,
    clearImportProgress,
  } = useEchoPlay();

  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  if (!isImportModalOpen) return null;

  const isImporting =
    importProgress !== null && importProgress.processed < importProgress.total;
  const isFinished =
    importProgress !== null && importProgress.processed >= importProgress.total;

  const handleClose = () => {
    if (isImporting) return;
    clearImportProgress();
    setImportModalOpen(false);
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void importFiles(files);
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
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#171920] border-t sm:border border-black/10 dark:border-white/10 p-6 pb-[calc(24px+env(safe-area-inset-bottom,0px))] shadow-2xl max-h-[88dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="import-modal-title" className="text-xl font-bold text-zinc-900 dark:text-white">
              Import Music
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Select audio files from On My iPhone, iCloud Drive, or this device
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting}
            aria-label="Close import dialog"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/flac,audio/ogg,audio/*"
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />

        {!importProgress ? (
          <>
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
              onClick={() => inputRef.current?.click()}
              className={`mt-5 rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-zinc-300 dark:border-white/15 hover:border-[var(--accent)] hover:bg-black/[0.02] dark:hover:bg-white/[0.03]'
              }`}
            >
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mb-4">
                <FolderOpen className="w-7 h-7" />
              </div>
              <p className="text-base font-semibold text-zinc-900 dark:text-white">
                Choose Audio Files
              </p>
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto leading-relaxed">
                Tap to open the iPhone Files picker or drop MP3, M4A, AAC, WAV, FLAC, and OGG files here.
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
                className="mt-5 min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Browse Files
              </button>
            </div>

            <div className="mt-5 space-y-2.5 text-xs text-zinc-600 dark:text-zinc-400">
              <div className="flex items-start gap-2.5">
                <Music2 className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                <p>
                  <strong className="text-zinc-900 dark:text-zinc-200">Automatic metadata & artwork:</strong>{' '}
                  Track titles, artists, albums, durations, and embedded cover art are extracted locally. Duplicate files are skipped automatically.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-zinc-900 dark:text-zinc-200">100% private & offline:</strong>{' '}
                  Audio files are saved directly inside your browser’s IndexedDB storage on this device and are never uploaded anywhere.
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04]">
              <div className="flex items-center justify-between text-sm font-medium text-zinc-900 dark:text-white">
                <span>
                  {isImporting ? 'Importing audio files...' : 'Import complete'}
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
                      Unsupported or unreadable files:
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
                      inputRef.current?.click();
                    }}
                    className="flex-1 min-h-[44px] px-4 rounded-xl bg-black/5 dark:bg-white/8 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-black/10 dark:hover:bg-white/12 transition-colors"
                  >
                    Import More
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
