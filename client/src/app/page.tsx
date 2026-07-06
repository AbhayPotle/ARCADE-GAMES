'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { socketService } from '../services/socket';
import { audioSynth } from '../services/audio';
import AuthGate from '../components/AuthGate';
import MainDashboard from '../components/MainDashboard';
import GameArea from '../components/GameArea';

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const [activeInvite, setActiveInvite] = useState<any>(null);

  useEffect(() => {
    // Check local storage session token
    const savedToken = api.getToken();
    if (savedToken) {
      api.getMe()
        .then(async (me) => {
          setUser(me);
          // Connect real-time socket (gracefully handle offline mode)
          try {
            await socketService.connect(savedToken);
          } catch (e) {
            console.warn('Real-time socket connect failed:', e);
          }
        })
        .catch(() => {
          api.logout();
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const handleInvite = (invite: any) => {
      audioSynth.playAchievement();
      setActiveInvite(invite);
    };

    socketService.on('receive_invite', handleInvite);

    return () => {
      socketService.off('receive_invite', handleInvite);
    };
  }, [user]);

  const handleAuthSuccess = async (authUser: any) => {
    setUser(authUser);
    const token = api.getToken();
    if (token) {
      try {
        await socketService.connect(token);
      } catch (e) {
        console.warn('Real-time socket connect failed:', e);
      }
    }
  };

  const handleLogout = () => {
    socketService.disconnect();
    api.logout();
    setUser(null);
    setSelectedGame(null);
  };

  const handleMuteToggle = () => {
    const isMuted = audioSynth.toggleMute();
    setAudioMuted(isMuted);
  };

  const handleAcceptInvite = (invite: any) => {
    setSelectedGame(invite.gameName === 'Chess Multiplayer' ? 'chess' : 'carrom');
    setActiveInvite(null);
    // Emit joining custom room
    socketService.emit('join_room', { roomId: invite.roomId });
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="text-center font-orbitron space-y-4">
          <div className="w-12 h-12 rounded-full border-t-2 border-neon-cyan animate-spin mx-auto" />
          <h2 className="text-neon-cyan uppercase tracking-widest text-sm animate-pulse">Establishing secure grid handshake...</h2>
        </div>
      </div>
    );
  }

  // Not logged in: Show auth gate
  if (!user) {
    return (
      <div className="flex-1 flex flex-col relative min-h-0">
        <AuthGate onAuthSuccess={handleAuthSuccess} />
        
        {/* Mute button on Login view */}
        <button
          onClick={handleMuteToggle}
          className="fixed bottom-4 left-4 p-2 rounded-full bg-cyber-dark border border-white/10 text-gray-400 hover:text-neon-cyan transition-colors z-50 text-xs font-mono"
        >
          {audioMuted ? '🔇 MUTED' : '🔊 SOUND_ON'}
        </button>
      </div>
    );
  }

  // Logged in: Show main dashboard layout
  return (
    <div className="flex-1 flex flex-col md:flex-row relative min-h-0 overflow-hidden w-full h-full">
      
      {/* Central Screen Arena */}
      <main className={`flex-1 flex flex-col min-h-0 ${selectedGame ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {selectedGame ? (
          <GameArea
            gameId={selectedGame}
            currentUser={user}
            onBackToDashboard={() => setSelectedGame(null)}
          />
        ) : (
          <MainDashboard
            currentUser={user}
            onSelectGame={setSelectedGame}
            onLogout={handleLogout}
          />
        )}
      </main>

      {/* Interactive Floating invites notification card */}
      {activeInvite && (
        <div className="fixed bottom-6 right-6 p-4 glass-panel border-neon-magenta/40 rounded-lg max-w-xs w-full shadow-[0_0_20px_rgba(255,0,127,0.25)] z-50 animate-bounce flex flex-col space-y-3 font-mono text-xs text-white">
          <div className="flex justify-between">
            <span className="text-neon-magenta font-bold font-orbitron">// DECRYPTED INVITE</span>
            <button onClick={() => setActiveInvite(null)} className="text-gray-500 hover:text-white">✕</button>
          </div>
          <p className="text-gray-300">
            Node pilot <span className="text-neon-cyan font-bold">{activeInvite.senderUsername}</span> has requested you join a lobby in <span className="text-neon-yellow font-bold">{activeInvite.gameName}</span>.
          </p>
          <button
            onClick={() => handleAcceptInvite(activeInvite)}
            className="w-full py-1.5 bg-neon-magenta hover:bg-neon-magenta/80 text-black font-orbitron font-bold rounded transition-colors"
          >
            ACCEPT DATA TUNNEL
          </button>
        </div>
      )}

      {/* Floating Audio Controls */}
      <button
        onClick={handleMuteToggle}
        className="fixed bottom-4 left-4 p-2 rounded bg-cyber-dark border border-neon-cyan/20 hover:border-neon-cyan text-gray-400 hover:text-neon-cyan transition-colors z-50 text-[10px] font-orbitron uppercase tracking-wider"
      >
        {audioMuted ? '🔇 SFX_OFF' : '🔊 SFX_ON'}
      </button>

    </div>
  );
}
