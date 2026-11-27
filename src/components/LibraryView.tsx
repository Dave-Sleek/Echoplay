import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  Disc3,
  Heart,
  Music,
  Play,
  Plus,
  Radio,
  Shuffle,
  User,
} from 'lucide-react';
import { useEchoPlay } from '../context/EchoPlayContext';
import type { LibrarySubTab, Song, SortDirection, SortField } from '../types/music';
import { formatDuration } from '../utils/formatters';
import { triggerHaptic } from '../utils/haptics';
import { AlbumArtwork } from './AlbumArtwork';
import { EmptyState } from './EmptyState';
import { SearchBar } from './SearchBar';
import { SongList } from './SongList';

interface AlbumGroup {
  name: string;
  artist: string;
  artworkId?: string;
  songs: Song[];
}

interface ArtistGroup {
  name: string;
  artworkId?: string;
  songs: Song[];
  albumCount: number;
}

const SUB_TABS: Array<{ id: LibrarySubTab; label: string }> = [
  { id: 'songs', label: 'All Songs' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
  { id: 'recent', label: 'Recently Added' },
  { id: 'favorites', label: 'Favorites' },
];

export const LibraryView: React.FC = () => {
  const { songs, playList, startSongRadio, setImportModalOpen } = useEchoPlay();

  const [subTab, setSubTab] = useState<LibrarySubTab>('songs');
  const [query, setQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('addedAt');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [selectedAlbumName, setSelectedAlbumName] = useState<string | null>(null);
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);

  const filteredAndSortedSongs = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = songs;

    if (subTab === 'favorites') {
      base = base.filter((s) => s.isFavorite);
    }

    if (q) {
      base = base.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.album.toLowerCase().includes(q)
      );
    }

    const effectiveField = subTab === 'recent' ? 'addedAt' : sortField;
    const effectiveDir = subTab === 'recent' ? 'desc' : sortDir;

    return [...base].sort((a, b) => {
      let cmp = 0;
      if (effectiveField === 'addedAt') {
        cmp = a.addedAt - b.addedAt;
      } else {
        cmp = a[effectiveField].localeCompare(b[effectiveField], undefined, {
          sensitivity: 'base',
        });
      }
      return effectiveDir === 'asc' ? cmp : -cmp;
    });
  }, [songs, subTab, query, sortField, sortDir]);

  const albums = useMemo<AlbumGroup[]>(() => {
    const map = new Map<string, AlbumGroup>();
    const q = query.trim().toLowerCase();
    for (const s of songs) {
      if (
        q &&
        !s.album.toLowerCase().includes(q) &&
        !s.artist.toLowerCase().includes(q) &&
        !s.title.toLowerCase().includes(q)
      ) {
        continue;
      }
      const key = s.album || 'Single / Unknown Album';
      const existing = map.get(key);
      if (existing) {
        existing.songs.push(s);
        if (!existing.artworkId && s.artworkId) existing.artworkId = s.artworkId;
      } else {
        map.set(key, {
          name: key,
          artist: s.artist,
          artworkId: s.artworkId,
          songs: [s],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }, [songs, query]);

  const artists = useMemo<ArtistGroup[]>(() => {
    const map = new Map<string, { songs: Song[]; albums: Set<string>; artworkId?: string }>();
    const q = query.trim().toLowerCase();
    for (const s of songs) {
      if (
        q &&
        !s.artist.toLowerCase().includes(q) &&
        !s.album.toLowerCase().includes(q) &&
        !s.title.toLowerCase().includes(q)
      ) {
        continue;
      }
      const key = s.artist || 'Unknown Artist';
      const existing = map.get(key);
      if (existing) {
        existing.songs.push(s);
        existing.albums.add(s.album);
        if (!existing.artworkId && s.artworkId) existing.artworkId = s.artworkId;
      } else {
        map.set(key, {
          songs: [s],
          albums: new Set([s.album]),
          artworkId: s.artworkId,
        });
      }
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        songs: data.songs,
        albumCount: data.albums.size,
        artworkId: data.artworkId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [songs, query]);

  const activeAlbum = useMemo(
    () => (selectedAlbumName ? albums.find((a) => a.name === selectedAlbumName) : undefined),
    [selectedAlbumName, albums]
  );

  const activeArtist = useMemo(
    () => (selectedArtistName ? artists.find((a) => a.name === selectedArtistName) : undefined),
    [selectedArtistName, artists]
  );

  const activeArtistAlbums = useMemo<AlbumGroup[]>(() => {
    if (!activeArtist) return [];
    const map = new Map<string, AlbumGroup>();
    for (const s of activeArtist.songs) {
      const albumName = s.album || 'Single / Unknown Album';
      const existing = map.get(albumName);
      if (existing) {
        existing.songs.push(s);
        if (!existing.artworkId && s.artworkId) existing.artworkId = s.artworkId;
      } else {
        map.set(albumName, {
          name: albumName,
          artist: activeArtist.name,
          artworkId: s.artworkId,
          songs: [s],
        });
      }
    }
    return Array.from(map.values())
      .map((grp) => ({
        ...grp,
        songs: [...grp.songs].sort(
          (a, b) =>
            (a.trackNumber ?? 999) - (b.trackNumber ?? 999) ||
            a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
        ),
      }))
      .sort((a, b) => {
        const yearA = a.songs[0]?.year ? parseInt(a.songs[0].year, 10) : 0;
        const yearB = b.songs[0]?.year ? parseInt(b.songs[0].year, 10) : 0;
        if (yearA !== yearB && !Number.isNaN(yearA) && !Number.isNaN(yearB)) {
          return yearB - yearA;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
  }, [activeArtist]);

  const handleSortFieldChange = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'addedAt' ? 'desc' : 'asc');
    }
  };

  if (songs.length === 0) {
    return (
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Library
          </h1>
        </header>
        <EmptyState
          icon={Music}
          title="No music in your library"
          description="Scan your Android phone, select a Music folder, or import audio files to browse by songs, albums, and artists."
          actionLabel="Scan & Import Music"
          onAction={() => setImportModalOpen(true)}
        />
      </div>
    );
  }

  // Album Drill-Down View
  if (activeAlbum) {
    const ordered = [...activeAlbum.songs].sort(
      (a, b) => (a.trackNumber ?? 999) - (b.trackNumber ?? 999)
    );
    const totalDur = ordered.reduce((acc, s) => acc + (s.duration || 0), 0);
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setSelectedAlbumName(null)}
          className="min-h-[44px] px-3 -ml-2 rounded-xl inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Albums
        </button>

        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5">
          <AlbumArtwork
            artworkId={activeAlbum.artworkId}
            fallbackKey={`${activeAlbum.name}-${activeAlbum.artist}`}
            alt={activeAlbum.name}
            sizeClass="w-44 h-44"
            radiusClass="rounded-3xl"
            className="shadow-xl"
          />
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white text-balance">
              {activeAlbum.name}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 tabular-nums">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setSelectedArtistName(activeAlbum.artist);
                  setSelectedAlbumName(null);
                  setSubTab('artists');
                }}
                className="font-semibold text-[var(--accent)] hover:underline"
              >
                {activeAlbum.artist}
              </button>{' '}
              · {ordered.length} {ordered.length === 1 ? 'track' : 'tracks'} · {formatDuration(totalDur)}
            </p>
            <div className="mt-4 flex items-center justify-center sm:justify-start gap-2.5">
              <button
                type="button"
                onClick={() => void playList(ordered, 0, false)}
                className="min-h-[44px] px-5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold inline-flex items-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                Play
              </button>
              <button
                type="button"
                onClick={() => void playList(ordered, 0, true)}
                className="min-h-[44px] px-5 rounded-xl bg-black/6 dark:bg-white/10 text-zinc-900 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
              >
                <Shuffle className="w-4 h-4" />
                Shuffle
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white/75 dark:bg-[#13151B]/85 border border-black/[0.05] dark:border-white/[0.06] p-2 sm:p-3">
          <SongList songs={ordered} showAlbum={false} numbered />
        </div>
      </div>
    );
  }

  // Dedicated Artist View (songs grouped by album + total track count)
  if (activeArtist) {
    const totalDur = activeArtist.songs.reduce((acc, s) => acc + (s.duration || 0), 0);
    const orderedArtistSongs = activeArtistAlbums.flatMap((alb) => alb.songs);

    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap');
            setSelectedArtistName(null);
          }}
          className="min-h-[44px] px-3 -ml-2 rounded-xl inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Artists
        </button>

        {/* Artist Hero Header */}
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 p-5 rounded-3xl bg-white/80 dark:bg-[#13151B]/90 border border-black/[0.06] dark:border-white/[0.07]">
          <AlbumArtwork
            artworkId={activeArtist.artworkId}
            fallbackKey={activeArtist.name}
            alt={activeArtist.name}
            sizeClass="w-32 h-32 sm:w-36 sm:h-36"
            radiusClass="rounded-full"
            className="shadow-xl shrink-0"
          />
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <p className="text-xs font-semibold text-[var(--accent)] tracking-wide">
              Artist
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-white mt-0.5 text-balance">
              {activeArtist.name}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1.5 tabular-nums">
              <strong className="font-semibold text-zinc-900 dark:text-white">
                {activeArtist.songs.length}
              </strong>{' '}
              {activeArtist.songs.length === 1 ? 'track' : 'tracks'} ·{' '}
              {activeArtistAlbums.length}{' '}
              {activeArtistAlbums.length === 1 ? 'album' : 'albums'} ·{' '}
              {formatDuration(totalDur)}
            </p>
            <div className="mt-4 flex items-center justify-center sm:justify-start gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => void playList(orderedArtistSongs, 0, false)}
                className="min-h-[44px] px-5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current" />
                Play All
              </button>
              <button
                type="button"
                onClick={() => void playList(orderedArtistSongs, 0, true)}
                className="min-h-[44px] px-5 rounded-xl bg-black/6 dark:bg-white/10 text-zinc-900 dark:text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Shuffle className="w-4 h-4" />
                Shuffle
              </button>
              {orderedArtistSongs[0] && (
                <button
                  type="button"
                  onClick={() => void startSongRadio(orderedArtistSongs[0])}
                  className="min-h-[44px] px-4 rounded-xl bg-black/6 dark:bg-white/10 text-zinc-900 dark:text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <Radio className="w-4 h-4 text-[var(--accent)]" />
                  Radio
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Albums Grouped Sections */}
        <div className="space-y-5">
          {activeArtistAlbums.map((album) => {
            const albDur = album.songs.reduce((acc, s) => acc + (s.duration || 0), 0);
            const albumYear = album.songs.find((s) => s.year)?.year;
            return (
              <section
                key={album.name}
                aria-label={`Album ${album.name}`}
                className="rounded-3xl bg-white/75 dark:bg-[#13151B]/85 border border-black/[0.05] dark:border-white/[0.06] overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-black/[0.05] dark:border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap');
                      setSelectedArtistName(null);
                      setSelectedAlbumName(album.name);
                      setSubTab('albums');
                    }}
                    className="flex items-center gap-3.5 min-w-0 text-left group"
                  >
                    <AlbumArtwork
                      artworkId={album.artworkId}
                      fallbackKey={`${album.name}-${activeArtist.name}`}
                      alt={album.name}
                      sizeClass="w-16 h-16"
                      radiusClass="rounded-2xl"
                      className="shadow-md shrink-0"
                    />
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-zinc-900 dark:text-white truncate group-hover:text-[var(--accent)] transition-colors">
                        {album.name}
                      </h2>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 tabular-nums">
                        {albumYear ? `${albumYear} · ` : ''}
                        {album.songs.length} {album.songs.length === 1 ? 'track' : 'tracks'} ·{' '}
                        {formatDuration(albDur)}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void playList(album.songs, 0, false)}
                      className="min-h-[40px] px-3.5 rounded-xl bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.09] dark:hover:bg-white/[0.12] text-xs font-semibold text-zinc-900 dark:text-white inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Play
                    </button>
                    <button
                      type="button"
                      onClick={() => void playList(album.songs, 0, true)}
                      aria-label={`Shuffle ${album.name}`}
                      className="min-h-[40px] min-w-[40px] px-3 rounded-xl bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.09] dark:hover:bg-white/[0.12] text-xs font-semibold text-zinc-900 dark:text-white inline-flex items-center justify-center"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="p-2 sm:p-3">
                  <SongList songs={album.songs} showAlbum={false} numbered />
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Library
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 tabular-nums">
            {songs.length} {songs.length === 1 ? 'song' : 'songs'} · {albums.length}{' '}
            {albums.length === 1 ? 'album' : 'albums'} · {artists.length}{' '}
            {artists.length === 1 ? 'artist' : 'artists'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setImportModalOpen(true)}
          className="min-h-[44px] px-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Import
        </button>
      </header>

      <SearchBar value={query} onChange={setQuery} />

      {/* Segmented Category Tabs */}
      <div
        role="tablist"
        aria-label="Library categories"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar"
      >
        {SUB_TABS.map((tab) => {
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setSubTab(tab.id);
                setSelectedAlbumName(null);
                setSelectedArtistName(null);
              }}
              className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                  : 'bg-black/[0.05] dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 hover:bg-black/[0.08] dark:hover:bg-white/[0.1]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Song views: All Songs, Recently Added, Favorites */}
      {(subTab === 'songs' || subTab === 'recent' || subTab === 'favorites') && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={filteredAndSortedSongs.length === 0}
                onClick={() => void playList(filteredAndSortedSongs, 0, false)}
                className="min-h-[40px] px-3.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Play All
              </button>
              <button
                type="button"
                disabled={filteredAndSortedSongs.length === 0}
                onClick={() => void playList(filteredAndSortedSongs, 0, true)}
                className="min-h-[40px] px-3.5 rounded-xl bg-black/[0.05] dark:bg-white/[0.08] disabled:opacity-40 text-zinc-900 dark:text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Shuffle className="w-3.5 h-3.5" />
                Shuffle
              </button>
            </div>

            {subTab !== 'recent' && (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {(
                  [
                    { field: 'title', label: 'Title' },
                    { field: 'artist', label: 'Artist' },
                    { field: 'album', label: 'Album' },
                    { field: 'addedAt', label: 'Date' },
                  ] as const
                ).map((opt) => {
                  const active = sortField === opt.field;
                  return (
                    <button
                      key={opt.field}
                      type="button"
                      onClick={() => handleSortFieldChange(opt.field)}
                      className={`min-h-[36px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
                        active
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                      }`}
                    >
                      {opt.label}
                      {active && (
                        <ArrowUpDown className="w-3 h-3" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {filteredAndSortedSongs.length === 0 ? (
            <EmptyState
              icon={subTab === 'favorites' ? Heart : Music}
              title={
                query
                  ? 'No matching songs'
                  : subTab === 'favorites'
                    ? 'No favorite songs yet'
                    : 'No songs found'
              }
              description={
                query
                  ? `No tracks match "${query}".`
                  : 'Tap the heart button on any song to save it to Favorites.'
              }
            />
          ) : (
            <div className="rounded-3xl bg-white/75 dark:bg-[#13151B]/85 border border-black/[0.05] dark:border-white/[0.06] p-2 sm:p-3">
              <SongList songs={filteredAndSortedSongs} />
            </div>
          )}
        </div>
      )}

      {/* Albums Grid */}
      {subTab === 'albums' && (
        <>
          {albums.length === 0 ? (
            <EmptyState
              icon={Disc3}
              title="No matching albums"
              description={`No albums match "${query}".`}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {albums.map((album) => (
                <button
                  key={album.name}
                  type="button"
                  onClick={() => setSelectedAlbumName(album.name)}
                  className="text-left rounded-2xl p-2.5 bg-white/75 dark:bg-[#14161E]/90 border border-black/[0.06] dark:border-white/[0.07] hover:bg-white dark:hover:bg-[#1A1D27] transition-colors"
                >
                  <AlbumArtwork
                    artworkId={album.artworkId}
                    fallbackKey={`${album.name}-${album.artist}`}
                    alt={album.name}
                    sizeClass="w-full aspect-square"
                    radiusClass="rounded-xl"
                  />
                  <p className="mt-2.5 text-sm font-semibold text-zinc-900 dark:text-white truncate">
                    {album.name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5 tabular-nums">
                    {album.artist} · {album.songs.length}{' '}
                    {album.songs.length === 1 ? 'song' : 'songs'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Artists List */}
      {subTab === 'artists' && (
        <>
          {artists.length === 0 ? (
            <EmptyState
              icon={User}
              title="No matching artists"
              description={`No artists match "${query}".`}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {artists.map((artist) => (
                <button
                  key={artist.name}
                  type="button"
                  onClick={() => setSelectedArtistName(artist.name)}
                  className="flex items-center gap-3.5 p-3 rounded-2xl bg-white/75 dark:bg-[#14161E]/90 border border-black/[0.06] dark:border-white/[0.07] hover:bg-white dark:hover:bg-[#1A1D27] text-left transition-colors min-h-[68px]"
                >
                  <AlbumArtwork
                    artworkId={artist.artworkId}
                    fallbackKey={artist.name}
                    alt={artist.name}
                    sizeClass="w-12 h-12"
                    radiusClass="rounded-full"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                      {artist.name}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5 tabular-nums">
                      {artist.songs.length}{' '}
                      {artist.songs.length === 1 ? 'song' : 'songs'} ·{' '}
                      {artist.albumCount}{' '}
                      {artist.albumCount === 1 ? 'album' : 'albums'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
