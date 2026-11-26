import React, { useState } from 'react';
import { WifiOff } from 'lucide-react';
import { AddToPlaylistModal } from './components/AddToPlaylistModal';
import { BottomNav } from './components/BottomNav';
import { FullScreenPlayer } from './components/FullScreenPlayer';
import { HomeView } from './components/HomeView';
import { ImportModal } from './components/ImportModal';
import { LibraryView } from './components/LibraryView';
import { LoadingScreen } from './components/LoadingScreen';
import { MiniPlayer } from './components/MiniPlayer';
import { PlaylistsView } from './components/PlaylistsView';
import { QueuePanel } from './components/QueuePanel';
import { SettingsView } from './components/SettingsView';
import { SongActionSheet } from './components/SongActionSheet';
import { SongInfoModal } from './components/SongInfoModal';
import { ToastContainer } from './components/ToastContainer';
import { EchoPlayProvider, useEchoPlay } from './context/EchoPlayContext';
import { useOnlineStatus } from './hooks/useOnlineStatus';

const EchoPlayShell: React.FC = () => {
  const { isHydrated, activeTab, setActiveTab, currentSong } = useEchoPlay();
  const isOnline = useOnlineStatus();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-dvh bg-[#F7F7F5] dark:bg-[#0A0B0E] text-[#121318] dark:text-[#F4F5F7] transition-colors">
      <BottomNav />

      <main
        className={`lg:pl-64 pt-[calc(16px+env(safe-area-inset-top,0px))] transition-all ${
          currentSong
            ? 'pb-[calc(152px+env(safe-area-inset-bottom,0px))] lg:pb-28'
            : 'pb-[calc(88px+env(safe-area-inset-bottom,0px))] lg:pb-12'
        }`}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-2">
          {!isOnline && (
            <div className="mb-4 px-3.5 py-2 rounded-2xl bg-amber-500/12 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs font-medium flex items-center gap-2">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <span>Offline mode — Playing directly from local device storage.</span>
            </div>
          )}

          {activeTab === 'home' && (
            <HomeView
              onOpenPlaylist={(pl) => {
                setSelectedPlaylistId(pl.id);
                setActiveTab('playlists');
              }}
            />
          )}

          {activeTab === 'library' && <LibraryView />}

          {activeTab === 'playlists' && (
            <PlaylistsView
              selectedPlaylistId={selectedPlaylistId}
              onSelectPlaylistId={setSelectedPlaylistId}
            />
          )}

          {activeTab === 'settings' && <SettingsView />}
        </div>
      </main>

      <MiniPlayer />
      <FullScreenPlayer />
      <QueuePanel />
      <ImportModal />
      <AddToPlaylistModal />
      <SongInfoModal />
      <SongActionSheet />
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <EchoPlayProvider>
      <EchoPlayShell />
    </EchoPlayProvider>
  );
}
