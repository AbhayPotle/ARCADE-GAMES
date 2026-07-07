'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { audioSynth } from '../services/audio';

const AVATARS = [
  { id: 'avatar_1', emoji: '🥷', label: 'Netrunner' },
  { id: 'avatar_2', emoji: '🧑‍🎤', label: 'Synth-Wave' },
  { id: 'avatar_3', emoji: '🤖', label: 'Cyber-Mech' },
  { id: 'avatar_4', emoji: '👽', label: 'Glitch-Entity' },
  { id: 'avatar_5', emoji: '👩‍💻', label: 'Grid-Hacker' },
  { id: 'avatar_6', emoji: '🏍️', label: 'Neon-Rider' },
  { id: 'avatar_7', emoji: '👹', label: 'Oni-Daemon' },
  { id: 'avatar_8', emoji: '🐱', label: 'Byte-Cat' },
];

interface AuthGateProps {
  onAuthSuccess: (user: any) => void;
}

export default function AuthGate({ onAuthSuccess }: AuthGateProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0].id);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);
  const [lockoutCountdown, setLockoutCountdown] = useState(0);

  useEffect(() => {
    if (!lockoutTime) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockoutTime - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutTime(null);
        setFailedAttempts(0);
        setLockoutCountdown(0);
      } else {
        setLockoutCountdown(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Check security lockout
    if (lockoutTime && Date.now() < lockoutTime) {
      const remaining = Math.ceil((lockoutTime - Date.now()) / 1000);
      setError(`Security Lockout: Try again in ${remaining}s`);
      audioSynth.playError();
      return;
    }

    // Input validations
    if (username.length < 3) {
      setError('Username must be at least 3 characters.');
      audioSynth.playError();
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      audioSynth.playError();
      return;
    }

    setLoading(true);
    audioSynth.playClick();

    try {
      let user;
      if (isLogin) {
        user = await api.login(username, password);
      } else {
        user = await api.register(username, password, selectedAvatar);
      }
      setFailedAttempts(0);
      setLockoutTime(null);
      onAuthSuccess(user);
    } catch (err: any) {
      const nextFailed = failedAttempts + 1;
      setFailedAttempts(nextFailed);
      
      if (nextFailed >= 5) {
        const lockDuration = 30 * 1000;
        setLockoutTime(Date.now() + lockDuration);
        setLockoutCountdown(30);
        setError('Too many failed attempts. Security lockout active for 30s.');
      } else {
        setError(err.message || 'Authentication failed');
      }
      audioSynth.playError();
    } finally {
      setLoading(false);
    }
  };

  const handleGuestMode = async () => {
    setError('');
    setLoading(true);
    audioSynth.playClick();
    
    // Generate random guest credentials
    const guestNum = Math.floor(Math.random() * 9000) + 1000;
    const guestUser = `Guest_${guestNum}`;
    const guestPass = `pass_${guestNum}`;
    const randomAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)].id;

    try {
      // Register guest
      const user = await api.register(guestUser, guestPass, randomAvatar);
      onAuthSuccess(user);
    } catch (err: any) {
      try {
        // If somehow already exists, try logging in
        const user = await api.login(guestUser, guestPass);
        onAuthSuccess(user);
      } catch (loginErr: any) {
        setError('Failed to enter Guest Mode. Please try again.');
        audioSynth.playError();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-10 w-full h-full min-h-screen">
      {/* Immersive 8K Login Background Overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-65 z-0 filter brightness-35 contrast-125"
        style={{ backgroundImage: "url('/cyber_lobby_bg.png')" }}
      />
      {/* Neon glowing radial gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-cyber-black via-cyber-dark/40 to-transparent opacity-95 z-0" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-neon-cyan/10 via-transparent to-transparent opacity-60 z-0 pointer-events-none" />

      <div className="w-full max-w-md glass-panel p-8 rounded-xl border border-neon-cyan/30 shadow-[0_0_60px_rgba(0,240,255,0.15)] relative overflow-hidden z-10 backdrop-blur-md">
        {/* Hologram top stripe */}
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-neon-cyan to-transparent animate-pulse" />
        
        {/* Platform Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold font-orbitron tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan via-white to-neon-magenta glow-text-cyan">
            ARCADEVERSE
          </h1>
          <p className="text-xs text-neon-cyan/60 tracking-widest mt-2 uppercase font-orbitron">
            // NEXT-GEN MULTIPLAYER NET
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-950/50 border border-red-500/40 text-red-400 text-sm rounded text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-orbitron">
              Username
            </label>
            <input
              type="text"
              required
              maxLength={15}
              value={username}
              onChange={(e) => {
                const val = e.target.value;
                if (/^[a-zA-Z0-9_]*$/.test(val)) {
                  setUsername(val);
                }
              }}
              className="w-full bg-cyber-dark/80 border border-neon-cyan/20 focus:border-neon-cyan rounded px-3 py-2 text-sm text-white focus:outline-none transition-colors"
              placeholder="NET_RUNNER_99"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-orbitron">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                maxLength={32}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-cyber-dark/80 border border-neon-cyan/20 focus:border-neon-cyan rounded pl-3 pr-12 py-2 text-sm text-white focus:outline-none transition-colors"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => {
                  audioSynth.playClick();
                  setShowPassword(!showPassword);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-orbitron font-bold text-neon-cyan/60 hover:text-neon-cyan transition-colors focus:outline-none cursor-pointer"
              >
                {showPassword ? 'HIDE' : 'SHOW'}
              </button>
            </div>
          </div>

          {/* Avatar Selector for Registration */}
          {!isLogin && (
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2 font-orbitron">
                Select Character Node
              </label>
              <div className="grid grid-cols-4 gap-2">
                {AVATARS.map((avatar) => (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => {
                      setSelectedAvatar(avatar.id);
                      audioSynth.playHover();
                    }}
                    className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${
                      selectedAvatar === avatar.id
                        ? 'border-neon-cyan bg-neon-cyan/10 scale-105 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
                        : 'border-white/10 bg-cyber-dark hover:border-neon-cyan/40'
                    }`}
                  >
                    <span className="text-2xl mb-1">{avatar.emoji}</span>
                    <span className="text-[9px] text-gray-400 tracking-tight text-center leading-none">
                      {avatar.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || lockoutCountdown > 0}
            className="w-full mt-6 py-2 px-4 bg-transparent border border-neon-cyan text-neon-cyan hover:bg-neon-cyan hover:text-black font-orbitron uppercase text-sm tracking-wider font-semibold rounded cursor-pointer transition-all duration-300 shadow-[0_0_15px_rgba(0,240,255,0.1)] hover:shadow-[0_0_25px_rgba(0,240,255,0.3)] disabled:opacity-50"
          >
            {lockoutCountdown > 0 
              ? `LOCKOUT ACTIVE (${lockoutCountdown}s)`
              : (loading ? 'SYNCHRONIZING...' : isLogin ? 'LOG IN' : 'CREATE ACCOUNT')}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center space-y-3">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              audioSynth.playClick();
            }}
            className="text-xs text-gray-400 hover:text-neon-cyan transition-colors"
          >
            {isLogin ? "Need a neural identity? Sign Up" : "Already registered? Log In"}
          </button>
          
          <div className="flex items-center w-full my-2">
            <hr className="flex-1 border-white/5" />
            <span className="text-[10px] text-gray-500 mx-3 font-orbitron">OR</span>
            <hr className="flex-1 border-white/5" />
          </div>

          <button
            type="button"
            onClick={handleGuestMode}
            disabled={loading}
            className="w-full py-2 px-4 bg-transparent border border-neon-magenta text-neon-magenta hover:bg-neon-magenta hover:text-black font-orbitron uppercase text-sm tracking-wider font-semibold rounded cursor-pointer transition-all duration-300 shadow-[0_0_15px_rgba(255,0,127,0.1)] hover:shadow-[0_0_25px_rgba(255,0,127,0.3)] disabled:opacity-50"
          >
            {loading ? 'BOOTING...' : 'ENTER AS GUEST'}
          </button>
        </div>
      </div>
    </div>
  );
}
