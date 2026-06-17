'use client';

import React, { useState, useEffect, useRef } from 'react';
import { socketService } from '../services/socket';
import { audioSynth } from '../services/audio';

interface TypingGameProps {
  matchData: any;
  currentUser: any;
  onComplete: (score: number, winnerId?: string) => void;
}

interface OpponentStats {
  userId: string;
  username: string;
  avatar: string;
  progress: number;
  wpm: number;
  accuracy: number;
}

const SENTENCES = [
  "quantum computing modules interface seamlessly with grid vectors to establish full real-time telemetry pipelines across cybernetic node matrices.",
  "stellar exploration probes transmit high-frequency telemetry streams back to central processing vaults through deep-space wormhole relays.",
  "artificial intelligence networks distribute neural weights across decentralized blockchain ledgers to secure multi-agent consensus algorithms.",
  "cybernetic hackers bypass terminal firewalls by injectively tunneling encrypted script packages into main database cores.",
  "neon grids illuminate virtual landscapes where security cores defend computational modules from autonomous trojan drones."
];

export default function TypingWarriors({ matchData, currentUser, onComplete }: TypingGameProps) {
  const [textToType, setTextToType] = useState<string>('');
  const [inputVal, setInputVal] = useState<string>('');
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  
  const [startTime, setStartTime] = useState<number | null>(null);
  const [wpm, setWpm] = useState<number>(0);
  const [accuracy, setAccuracy] = useState<number>(100);
  const [typosCount, setTyposCount] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [finished, setFinished] = useState<boolean>(false);
  const [laserEffect, setLaserEffect] = useState<boolean>(false);

  const [opponents, setOpponents] = useState<OpponentStats[]>([]);
  const botCharactersTypedRef = useRef<number>(0);

  useEffect(() => {
    // Select a random sentence
    const randomSentence = SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
    setTextToType(randomSentence);

    const otherPlayers = matchData.players
      .filter((p: any) => p.userId !== currentUser.id)
      .map((p: any) => ({
        userId: p.userId,
        username: p.username,
        avatar: p.avatar,
        progress: 0,
        wpm: 0,
        accuracy: 100
      }));
    setOpponents(otherPlayers);

    socketService.on('typing_stats_sync', (data: { userId: string; progress: number; wpm: number; accuracy: number }) => {
      setOpponents(prev =>
        prev.map(opp => opp.userId === data.userId ? { ...opp, ...data } : opp)
      );
    });

    return () => {
      socketService.off('typing_stats_sync');
    };
  }, [matchData, currentUser]);

  // Bot Typing Simulation Effect
  useEffect(() => {
    const isOpponentBot = matchData.players.some((p: any) => p.userId === 'bot-id' || p.isBot);
    if (isOpponentBot && textToType && !finished) {
      const botWpm = 50 + Math.floor(Math.random() * 15); // Bot WPM speed
      
      const botTimer = setInterval(() => {
        // Characters typed per second = WPM * 5 / 60
        const charsPerSecond = botWpm * 5 / 60;
        botCharactersTypedRef.current += charsPerSecond;

        setOpponents(prev =>
          prev.map(opp => {
            if (opp.userId === 'bot-id') {
              const nextProgress = Math.min(100, Math.round((botCharactersTypedRef.current / textToType.length) * 100));
              
              if (nextProgress >= 100 && !finished) {
                setFinished(true);
                audioSynth.playGameOver(false);
                socketService.emit('game_completed', {
                  roomId: matchData.roomId,
                  winnerId: 'bot-id',
                  scores: matchData.players.map((p: any) => ({
                    userId: p.userId,
                    score: p.userId === 'bot-id' ? botWpm : 20
                  }))
                });
                
                setTimeout(() => {
                  onComplete(20, 'bot-id'); // Defeat score
                }, 2000);
              }
              return { ...opp, progress: nextProgress, wpm: botWpm };
            }
            return opp;
          })
        );
      }, 1000);
      return () => clearInterval(botTimer);
    }
  }, [finished, textToType]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (finished) return;
    
    const val = e.target.value;
    
    if (!startTime) {
      setStartTime(Date.now());
    }

    const nextChar = textToType[currentIndex];
    const typedChar = val[val.length - 1];

    if (val.length < inputVal.length) {
      setInputVal(val);
      setCurrentIndex(val.length);
      return;
    }

    if (typedChar === nextChar) {
      // Correct character: fire lasers sfx
      audioSynth.playType();
      setCurrentIndex(val.length);
      setInputVal(val);
      
      setLaserEffect(true);
      setTimeout(() => setLaserEffect(false), 80);

      const newProgress = Math.round((val.length / textToType.length) * 100);
      setProgress(newProgress);

      const elapsedMinutes = (Date.now() - startTime!) / 60000;
      const currentWpm = elapsedMinutes > 0 ? Math.round((val.length / 5) / elapsedMinutes) : 0;
      setWpm(currentWpm);

      socketService.emit('typing_progress_update', {
        roomId: matchData.roomId,
        progress: newProgress,
        wpm: currentWpm,
        accuracy
      });

      if (val.length === textToType.length) {
        setFinished(true);
        audioSynth.playGameOver(true);
        socketService.emit('game_completed', {
          roomId: matchData.roomId,
          winnerId: currentUser.id,
          scores: matchData.players.map((p: any) => ({
            userId: p.userId,
            score: p.userId === currentUser.id ? currentWpm : 20
          }))
        });

        setTimeout(() => {
          onComplete(currentWpm, currentUser.id);
        }, 2000);
      }
    } else {
      audioSynth.playError();
      setTyposCount(prev => prev + 1);

      const totalKeys = currentIndex + typosCount + 1;
      const currentAcc = Math.round(((totalKeys - (typosCount + 1)) / totalKeys) * 100);
      setAccuracy(currentAcc);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 w-full h-full min-h-0 justify-between max-w-2xl bg-slate-950/80 rounded-xl relative overflow-hidden">
      
      {/* Outer Space Starfield background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(18,9,48,0.4)_0%,rgba(0,0,0,1)_100%)] pointer-events-none -z-10" />
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-25 pointer-events-none -z-10" />

      {/* Cockpit Laser beam flash overlay */}
      {laserEffect && (
        <div className="absolute inset-0 bg-cyan-500/10 border-2 border-cyan-400 pointer-events-none z-10 transition-all duration-75" />
      )}

      {/* Competitors Space Telemetry */}
      <div className="space-y-3 bg-black/60 border border-cyan-500/20 p-4 rounded-lg">
        <span className="text-[9px] font-orbitron text-cyan-400 uppercase tracking-widest block mb-1">
          // FLEET DOGFIGHT PROGRESS TRACKS
        </span>

        {/* Player Space Fighter */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-cyan-400 font-semibold">PILOT ({currentUser.username})</span>
            <span>{wpm} WPM | {accuracy}% ACC</span>
          </div>
          <div className="w-full bg-cyber-dark h-2 rounded-full overflow-hidden border border-white/5 relative">
            <div
              className="bg-gradient-to-r from-cyan-400 to-blue-600 h-full transition-all duration-200 shadow-[0_0_8px_#00f0ff]"
              style={{ width: `${progress}%` }}
            />
            <span
              className="absolute text-xs top-[-4px] transition-all duration-200"
              style={{ left: `calc(${progress}% - 8px)` }}
            >
              🚀
            </span>
          </div>
        </div>

        {/* Opponent Space Fighters */}
        {opponents.map((opp) => (
          <div key={opp.userId} className="space-y-1 border-t border-white/5 pt-2">
            <div className="flex justify-between text-xs font-mono text-gray-400">
              <span className="font-semibold text-purple-400">{opp.username}</span>
              <span>{opp.wpm} WPM | {opp.accuracy}% ACC</span>
            </div>
            <div className="w-full bg-cyber-dark h-2 rounded-full overflow-hidden border border-white/5 relative">
              <div
                className="bg-gradient-to-r from-purple-500 to-fuchsia-600 h-full transition-all duration-200 shadow-[0_0_8px_#d800ff]"
                style={{ width: `${opp.progress}%` }}
              />
              <span
                className="absolute text-xs top-[-4px] transition-all duration-200"
                style={{ left: `calc(${opp.progress}% - 8px)` }}
              >
                🛸
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Cockpit HUD Text Panel */}
      <div className="my-6 glass-panel rounded-lg p-6 font-mono text-base tracking-wide leading-relaxed border border-cyan-500/25 relative overflow-hidden bg-black/60 select-none">
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-400" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-cyan-400" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cyan-400" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-400" />

        <p className="text-slate-500 font-sans">
          <span className="text-cyan-400 font-bold bg-cyan-400/5 border-b-2 border-cyan-400 glow-text-cyan font-mono">
            {textToType.substring(0, currentIndex)}
          </span>
          <span className="text-white bg-white/10 font-bold border-b border-white animate-pulse font-mono">
            {textToType[currentIndex]}
          </span>
          <span className="text-slate-500 font-mono">
            {textToType.substring(currentIndex + 1)}
          </span>
        </p>
      </div>

      {/* Input box form */}
      <div className="space-y-4">
        <input
          type="text"
          value={inputVal}
          onChange={handleInputChange}
          disabled={finished}
          placeholder={finished ? 'SECURE COCKPIT: THREAT ELIMINATED' : 'TYPE TO DISCHARGE LASER SYSTEMS...'}
          className={`w-full text-center bg-black/80 border ${
            finished 
              ? 'border-green-500/30 text-green-400' 
              : 'border-cyan-500/30 focus:border-cyan-400 text-white'
          } rounded-lg py-3 px-4 focus:outline-none font-sans text-sm`}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />

        {/* Live typing stats summary */}
        <div className="grid grid-cols-3 gap-4 font-orbitron text-xs text-center border-t border-white/5 pt-4">
          <div>
            <p className="text-gray-500 text-[9px]">// FIRING_RATE</p>
            <p className="text-cyan-400 font-extrabold text-lg">{wpm} <span className="text-[10px] font-normal">WPM</span></p>
          </div>
          <div>
            <p className="text-gray-500 text-[9px]">// TARGET_LOCK</p>
            <p className="text-amber-400 font-extrabold text-lg">{accuracy}%</p>
          </div>
          <div>
            <p className="text-gray-500 text-[9px]">// SHIELD_DECAY</p>
            <p className="text-purple-400 font-extrabold text-lg">{progress}%</p>
          </div>
        </div>
      </div>

    </div>
  );
}
