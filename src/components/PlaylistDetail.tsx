import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Check,
  Edit3,
  ImagePlus,
  ListMusic,
  Play,
  Plus,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import { useEchoPlay } from '../context/EchoPlayContext';
import type { Playlist, Song } from '../types/music';
import { compressImageFileToDataUrl } from '../utils/artwork';
import { formatDuration } from '../utils/formatters';
import { AlbumArtwork } from './AlbumArtwork';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';
import { SearchBar } from './SearchBar';
import { SongRow } from './SongRow';

interface PlaylistDetailProps {
  playlist: Playlist;
  onBack: () => void;
}

export const PlaylistDetail: React.FC<PlaylistDetailProps> = ({ playlist, onBack }) => {
  const {
    songs,
    playList,
    renamePlaylist,
    deletePlaylist,
    addSongsToPlaylist,
    removeSongFromPlaylist,
    reorderPlaylistSongs,
    showToast,
  } = useEchoPlay();

  const [showAddSongs, setShowAddSongs] = useState(false);
  const [songQuery, setSongQuery] = useState('');
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());

  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(playlist.name);
  const [editDesc, setEditDesc] = useState(playlist.description);
  const [editArt, setEditArt] = useState<string | undefined>(playlist.artworkDataUrl);
  const artInputRef = useRef<HTMLInputElement>(null);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  const songMap = useMemo(() => {
    const map = new Map<string, Song>();
    for (const s of songs) map.set(s.id, s);
    return map;
  }, [songs]);

  const playlistSongs = useMemo(
    () =>
      playlist.songIds
        .map((id) => songMap.get(id))
        .filter((s): s is Song => Boolean(s)),
    [playlist.songIds, songMap]
  );

  const totalDuration = useMemo(
    () => playlistSongs.reduce((acc, s) => acc + (s.duration || 0), 0),
    [playlistSongs]
  );

  const availableSongs = useMemo(() => {
    const q = songQuery.trim().toLowerCase();
    return songs.filter((s) => {
      if (playlist.songIds.includes(s.id)) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q)
      );
    });
  }, [songs, playlist.songIds, songQuery]);

  const handleArtChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 512);
      setEditArt(dataUrl);
    } catch {
      showToast('Could not read selected image', 'error');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    await renamePlaylist(playlist.id, editName, editDesc, editArt);
    setShowEditModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-3 -ml-2 rounded-xl inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Playlists
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setEditName(playlist.name);
              setEditDesc(playlist.description);
              setEditArt(playlist.artworkDataUrl);
              setShowEditModal(true);
            }}
            aria-label="Edit playlist"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/8 transition-colors"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            aria-label="Delete playlist"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6">
        <div className="w-48 h-48 sm:w-52 sm:h-52 rounded-3xl overflow-hidden shadow-2xl shrink-0 bg-zinc-200 dark:bg-zinc-800 border border-black/10 dark:border-white/10">
          {playlist.artworkDataUrl ? (
            <img
              src={playlist.artworkDataUrl}
              alt={playlist.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : playlistSongs.length >= 4 ? (
            <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
              {playlistSongs.slice(0, 4).map((s) => (
                <AlbumArtwork
                  key={s.id}
                  artworkId={s.artworkId}
                  fallbackKey={`${s.album}-${s.artist}`}
                  alt={s.title}
                  sizeClass="w-full h-full"
                  radiusClass="rounded-none"
                />
              ))}
            </div>
          ) : playlistSongs.length > 0 ? (
            <AlbumArtwork
              artworkId={playlistSongs[0].artworkId}
              fallbackKey={`${playlistSongs[0].album}-${playlistSongs[0].artist}`}
              alt={playlist.name}
              sizeClass="w-full h-full"
              radiusClass="rounded-none"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[var(--accent-soft)] text-[var(--accent)]">
              <ListMusic className="w-16 h-16" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 text-center sm:text-left">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white text-balance">
            {playlist.name}
          </h1>
          {playlist.description && (
            <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400 max-w-xl">
              {playlist.description}
            </p>
          )}
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
            {playlistSongs.length} {playlistSongs.length === 1 ? 'song' : 'songs'}
            {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
            <button
              type="button"
              disabled={playlistSongs.length === 0}
              onClick={() => void playList(playlistSongs, 0, false)}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current" />
              Play
            </button>
            <button
              type="button"
              disabled={playlistSongs.length === 0}
              onClick={() => void playList(playlistSongs, 0, true)}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-black/6 dark:bg-white/9 hover:bg-black/10 dark:hover:bg-white/14 disabled:opacity-40 text-zinc-900 dark:text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Shuffle className="w-4 h-4" />
              Shuffle
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedToAdd(new Set());
                setSongQuery('');
                setShowAddSongs(true);
              }}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/12 text-zinc-800 dark:text-zinc-200 hover:bg-black/4 dark:hover:bg-white/6 text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Add Songs
            </button>
            {playlistSongs.length > 1 && (
              <button
                type="button"
                onClick={() => setIsReordering((v) => !v)}
                className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  isReordering
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-black/10 dark:border-white/12 text-zinc-800 dark:text-zinc-200 hover:bg-black/4 dark:hover:bg-white/6'
                }`}
              >
                <ArrowUpDown className="w-4 h-4" />
                {isReordering ? 'Done' : 'Reorder'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Song List */}
      {playlistSongs.length === 0 ? (
        <EmptyState
          icon={ListMusic}
          title="This playlist is empty"
          description="Add tracks from your local library to start listening."
          actionLabel="Add Songs"
          onAction={() => {
            setSelectedToAdd(new Set());
            setSongQuery('');
            setShowAddSongs(true);
          }}
        />
      ) : (
        <div className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
          {playlistSongs.map((song, idx) => (
            <SongRow
              key={`${song.id}-${idx}`}
              song={song}
              contextQueue={playlistSongs}
              indexLabel={idx + 1}
              onRemoveFromContext={() => void removeSongFromPlaylist(playlist.id, idx)}
              removeContextLabel="Remove from this playlist"
              trailingExtra={
                isReordering ? (
                  <div className="flex items-center">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => void reorderPlaylistSongs(playlist.id, idx, idx - 1)}
                      aria-label={`Move ${song.title} up`}
                      className="min-w-[40px] min-h-[44px] flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white disabled:opacity-25"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === playlistSongs.length - 1}
                      onClick={() => void reorderPlaylistSongs(playlist.id, idx, idx + 1)}
                      aria-label={`Move ${song.title} down`}
                      className="min-w-[40px] min-h-[44px] flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white disabled:opacity-25"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Add Songs Picker Modal */}
      {typeof document !== 'undefined' &&
        showAddSongs &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm"
            onClick={() => setShowAddSongs(false)}
            role="dialog"
            aria-modal="true"
          >
          <div
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#171920] border-t sm:border border-black/10 dark:border-white/10 p-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] shadow-2xl h-[80dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto mb-3 sm:hidden" />

            <div className="flex items-center justify-between pb-3">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Add Songs</h3>
              <button
                type="button"
                onClick={() => setShowAddSongs(false)}
                aria-label="Close"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <SearchBar value={songQuery} onChange={setSongQuery} />

            <div className="mt-3 flex-1 overflow-y-auto space-y-1">
              {availableSongs.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-10">
                  {songs.length === 0
                    ? 'Import music files into your library first.'
                    : 'No matching songs left to add.'}
                </p>
              ) : (
                availableSongs.map((s) => {
                  const checked = selectedToAdd.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedToAdd((prev) => {
                          const next = new Set(prev);
                          if (next.has(s.id)) next.delete(s.id);
                          else next.add(s.id);
                          return next;
                        });
                      }}
                      className={`w-full min-h-[54px] px-2.5 py-2 rounded-2xl flex items-center justify-between gap-3 text-left transition-colors ${
                        checked
                          ? 'bg-[var(--accent-soft)]'
                          : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <AlbumArtwork
                          artworkId={s.artworkId}
                          fallbackKey={`${s.album}-${s.artist}`}
                          alt={s.title}
                          sizeClass="w-10 h-10"
                          radiusClass="rounded-lg"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                            {s.title}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                            {s.artist}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${
                          checked
                            ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                            : 'border-zinc-300 dark:border-zinc-600'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-black/8 dark:border-white/8">
              <button
                type="button"
                disabled={selectedToAdd.size === 0}
                onClick={async () => {
                  await addSongsToPlaylist(playlist.id, Array.from(selectedToAdd));
                  setShowAddSongs(false);
                }}
                className="w-full min-h-[48px] rounded-2xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-sm font-semibold transition-colors"
              >
                Add {selectedToAdd.size > 0 ? `${selectedToAdd.size} ` : ''}
                {selectedToAdd.size === 1 ? 'Song' : 'Songs'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Playlist Modal */}
      {typeof document !== 'undefined' &&
        showEditModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm"
            onClick={() => setShowEditModal(false)}
            role="dialog"
            aria-modal="true"
          >
          <form
            onSubmit={handleSaveEdit}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#171920] border-t sm:border border-black/10 dark:border-white/10 p-6 pb-[calc(24px+env(safe-area-inset-bottom,0px))] shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Edit Playlist</h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                aria-label="Close"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <input
              ref={artInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleArtChange}
            />

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => artInputRef.current?.click()}
                className="relative w-20 h-20 rounded-2xl overflow-hidden bg-black/5 dark:bg-white/8 flex items-center justify-center shrink-0 border border-black/10 dark:border-white/10"
              >
                {editArt ? (
                  <img
                    src={editArt}
                    alt="Playlist cover"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImagePlus className="w-6 h-6 text-zinc-500" />
                )}
              </button>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => artInputRef.current?.click()}
                  className="text-sm font-semibold text-[var(--accent)]"
                >
                  Choose Cover Image
                </button>
                {editArt && (
                  <button
                    type="button"
                    onClick={() => setEditArt(undefined)}
                    className="block text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  >
                    Reset to automatic artwork
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">
                Name
              </label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-black/5 dark:bg-white/7 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">
                Description
              </label>
              <textarea
                rows={2}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Optional notes..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/7 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[48px] rounded-2xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors"
            >
              Save Changes
            </button>
          </form>
        </div>,
        document.body
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete playlist?"
        description={`"${playlist.name}" will be deleted. Your audio files in the Library will remain intact.`}
        confirmLabel="Delete Playlist"
        destructive
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          setConfirmDeleteOpen(false);
          await deletePlaylist(playlist.id);
          onBack();
        }}
      />
    </div>
  );
};
