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
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-3 font-mono text-xs select-none">
      {/* Top Panel stats */}
      <div className="flex justify-between items-start w-full">
        <div className="glass-panel p-2 border-neon-cyan/20 rounded flex flex-col space-y-1">
          <span className="text-neon-cyan font-bold tracking-widest text-[8px] uppercase">{"// telemetry"}</span>
          <span className="text-[14px] text-white font-orbitron font-bold">POS: {hudPosition} / 4</span>
          <span className="text-[9px] text-gray-400 font-mono">Progress: {hudProgress}%</span>
          <canvas 
            ref={minimapCanvasRef} 
            width="120" 
            height="120" 
            className="w-[120px] h-[120px] bg-black/40 border border-neon-cyan/20 rounded mt-1" 
          />
        </div>
 
        {/* Stunt popups notifier */}
        {hudStuntTimer > 0 && (
          <div className="glass-panel border-neon-yellow/30 bg-neon-yellow/10 text-neon-yellow text-xs font-orbitron font-bold uppercase px-4 py-2 rounded animate-bounce self-center">
            {hudStuntMsg}
          </div>
        )}
 
        <div className="glass-panel p-2 border-neon-cyan/20 rounded flex flex-col items-end space-y-1">
          <span className="text-neon-magenta font-bold tracking-widest text-[8px] uppercase">{"// sector logs"}</span>
          <span className="text-[14px] text-white font-bold font-orbitron">{hudTimer}s</span>
          <span className="text-gray-400 font-mono">Score: {hudScore} pts</span>
        </div>
      </div>
 
      {/* Controls helper panel */}
      <div className="self-center glass-panel px-4 py-1.5 border-white/5 rounded text-[9px] text-gray-400 bg-black/60">
        [WASD/Arrows]: Steer | [Space/Shift]: Nitro NOS | [C]: Swap Camera modes
      </div>
 
      {/* Bottom Panel cockpit dials */}
      <div className="flex justify-between items-end w-full">
        {/* Speed Dial */}
        <div className="glass-panel p-2 border-neon-cyan/20 rounded flex flex-col space-y-1">
          <span className="text-neon-cyan font-bold uppercase tracking-wider text-[8px]">{"// kph"}</span>
          <div className="flex items-baseline space-x-1">
            <span className="text-2xl font-orbitron font-black text-white">{hudSpeed}</span>
            <span className="text-[8px] text-gray-400">KM/H</span>
          </div>
          <div className="w-20 bg-black/60 h-1 rounded overflow-hidden">
            <div 
              className="bg-neon-cyan h-full shadow-[0_0_8px_#00f0ff]" 
              style={{ width: `${Math.min(100, (hudSpeed / 300) * 100)}%` }} 
            />
          </div>
        </div>
 
        {/* Gear & RPM Dial */}
        <div className="flex flex-col items-center space-y-1 glass-panel px-3 py-1.5 border-neon-yellow/20 rounded">
          <span className="text-neon-yellow text-[8px] font-bold uppercase tracking-wider">{"// engine status"}</span>
          <div className="text-xl font-orbitron font-black text-neon-yellow">
            GEAR {hudGear}
          </div>
          <div className="text-[9px] text-gray-400 font-mono">
            {hudRpm} RPM
          </div>
          <div className="w-24 bg-black/60 h-1 rounded-full overflow-hidden">
            <div 
              className={`h-full ${hudRpm > 7200 ? 'bg-red-500 animate-pulse' : 'bg-neon-yellow'}`}
              style={{ width: `${(hudRpm / 8000) * 100}%` }}
            />
          </div>
        </div>
 
        {/* NOS Tank Dial */}
        <div className="glass-panel p-2 border-neon-cyan/20 rounded flex flex-col space-y-1 items-end">
          <span className="text-neon-cyan font-bold uppercase tracking-wider text-[8px]">{"// nos boost"}</span>
          <div className="flex items-baseline space-x-1">
            <span className="text-2xl font-orbitron font-black text-neon-cyan">{hudNos}%</span>
          </div>
          <div className="w-20 bg-black/60 h-1 rounded overflow-hidden">
            <div 
              className="bg-neon-cyan h-full shadow-[0_0_8px_#00f0ff]" 
              style={{ width: `${hudNos}%` }} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};
export default HUD;
