import React, { RefObject } from 'react';

interface HUDProps {
  hudPosition: number;
  hudProgress: number;
  hudTimer: number;
  hudScore: number;
  hudSpeed: number;
  hudGear: string | number;
  hudRpm: number;
  hudNos: number;
  hudStuntTimer: number;
  hudStuntMsg: string;
  minimapCanvasRef: RefObject<HTMLCanvasElement | null>;
}

export const HUD: React.FC<HUDProps> = ({
  hudPosition,
  hudProgress,
  hudTimer,
  hudScore,
  hudSpeed,
  hudGear,
  hudRpm,
  hudNos,
  hudStuntTimer,
  hudStuntMsg,
  minimapCanvasRef
}) => {
  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-4 font-mono text-xs select-none">
      {/* Top Panel stats */}
      <div className="flex justify-between items-start w-full">
        <div className="glass-panel p-3 border-neon-cyan/35 shadow-[0_0_15px_rgba(0,240,255,0.15)] backdrop-blur-md rounded-lg flex flex-col space-y-1">
          <span className="text-neon-cyan font-bold tracking-widest text-[9px] uppercase">{"// telemetry"}</span>
          <span className="text-[15px] text-white font-orbitron font-extrabold">POS: {hudPosition} / 4</span>
          <span className="text-[10px] text-gray-300 font-mono">Progress: {hudProgress}%</span>
          <canvas 
            ref={minimapCanvasRef} 
            width="120" 
            height="120" 
            className="w-[120px] h-[120px] bg-slate-950/60 border border-neon-cyan/25 rounded mt-2 shadow-[inset_0_0_8px_rgba(0,240,255,0.1)]" 
          />
        </div>
 
        {/* Stunt popups notifier */}
        {hudStuntTimer > 0 && (
          <div className="glass-panel border-neon-yellow/50 bg-neon-yellow/10 text-neon-yellow text-xs font-orbitron font-extrabold uppercase px-5 py-3 rounded-lg shadow-[0_0_20px_rgba(255,223,0,0.25)] animate-bounce self-center tracking-wider">
            ⚡ {hudStuntMsg} ⚡
          </div>
        )}
 
        <div className="glass-panel p-3 border-neon-magenta/35 shadow-[0_0_15px_rgba(255,0,119,0.15)] backdrop-blur-md rounded-lg flex flex-col items-end space-y-1">
          <span className="text-neon-magenta font-bold tracking-widest text-[9px] uppercase">{"// sector logs"}</span>
          <span className="text-[15px] text-white font-extrabold font-orbitron">{hudTimer}s</span>
          <span className="text-gray-300 font-mono">Score: {hudScore} pts</span>
        </div>
      </div>
 
      {/* Controls helper panel */}
      <div className="self-center glass-panel px-4 py-2 border-white/10 rounded-full text-[9px] text-gray-300 bg-slate-950/80 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
        [WASD/Arrows]: Steer | [Space/Shift]: Nitro NOS | [C]: Swap Camera modes
      </div>
 
      {/* Bottom Panel cockpit dials */}
      <div className="flex justify-between items-end w-full">
        {/* Speed Dial */}
        <div className="glass-panel p-3 border-neon-cyan/35 shadow-[0_0_15px_rgba(0,240,255,0.15)] backdrop-blur-md rounded-lg flex flex-col space-y-1">
          <span className="text-neon-cyan font-bold uppercase tracking-wider text-[8px]">{"// velocity"}</span>
          <div className="flex items-baseline space-x-1">
            <span className={`text-3xl font-orbitron font-black ${hudSpeed > 180 ? 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'text-white'}`}>{hudSpeed}</span>
            <span className="text-[8px] text-gray-400">KM/H</span>
          </div>
          <div className="w-24 bg-slate-900 h-1.5 rounded overflow-hidden">
            <div 
              className={`h-full transition-all duration-100 ${hudSpeed > 180 ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-neon-cyan shadow-[0_0_10px_#00f0ff]'}`} 
              style={{ width: `${Math.min(100, (hudSpeed / 300) * 100)}%` }} 
            />
          </div>
        </div>
 
        {/* Gear & RPM Dial */}
        <div className="flex flex-col items-center space-y-1 glass-panel px-4 py-2 border-neon-yellow/35 shadow-[0_0_15px_rgba(255,223,0,0.15)] backdrop-blur-md rounded-lg">
          <span className="text-neon-yellow text-[8px] font-bold uppercase tracking-wider">{"// engine status"}</span>
          <div className="text-2xl font-orbitron font-black text-neon-yellow">
            GEAR {hudGear}
          </div>
          <div className="text-[10px] text-gray-300 font-mono">
            {hudRpm} RPM
          </div>
          <div className="w-28 bg-slate-900 h-1.5 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-100 ${hudRpm > 7200 ? 'bg-red-500 animate-pulse' : 'bg-neon-yellow'}`}
              style={{ width: `${(hudRpm / 8000) * 100}%` }}
            />
          </div>
        </div>
 
        {/* NOS Tank Dial */}
        <div className="glass-panel p-3 border-neon-cyan/35 shadow-[0_0_15px_rgba(0,240,255,0.15)] backdrop-blur-md rounded-lg flex flex-col space-y-1 items-end">
          <span className="text-neon-cyan font-bold uppercase tracking-wider text-[8px]">{"// nos boost"}</span>
          <div className="flex items-baseline space-x-1">
            <span className="text-3xl font-orbitron font-black text-neon-cyan">{hudNos}%</span>
          </div>
          <div className="w-24 bg-slate-900 h-1.5 rounded overflow-hidden">
            <div 
              className="bg-neon-cyan h-full shadow-[0_0_10px_#00f0ff] transition-all duration-150" 
              style={{ width: `${hudNos}%` }} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};
export default HUD;
