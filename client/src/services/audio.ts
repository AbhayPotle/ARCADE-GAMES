// Cyberpunk Web Audio API Synthesizer
// Generates game sound effects dynamically with zero network overhead.

class AudioSynth {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  private playTone(
    freqs: number[],
    durations: number[],
    type: OscillatorType = 'sine',
    gainStart: number = 0.1,
    gainEnd: number = 0.0001
  ) {
    this.init();
    if (!this.ctx || this.isMuted) return;

    // Resume context if suspended by browser autoplay policy
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = type;
    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    
    // Setup pitch sweeps
    if (freqs.length === 1) {
      osc.frequency.setValueAtTime(freqs[0], now);
    } else {
      let timeOffset = 0;
      freqs.forEach((freq, idx) => {
        if (idx === 0) {
          osc.frequency.setValueAtTime(freq, now);
        } else {
          timeOffset += durations[idx - 1];
          osc.frequency.exponentialRampToValueAtTime(freq, now + timeOffset);
        }
      });
    }

    // Setup volume envelope
    const totalDuration = durations.reduce((a, b) => a + b, 0);
    gainNode.gain.setValueAtTime(gainStart, now);
    gainNode.gain.exponentialRampToValueAtTime(gainEnd, now + totalDuration);

    osc.start(now);
    osc.stop(now + totalDuration);
  }

  // Neon interface click
  public playClick() {
    this.playTone([800, 400], [0.05], 'triangle', 0.1);
  }

  // Hover tick
  public playHover() {
    this.playTone([1200], [0.02], 'sine', 0.03);
  }

  // Achievement unlock fanfare
  public playAchievement() {
    const now = 0.08;
    this.playTone([261.6, 329.6, 392.0, 523.3, 659.3, 784.0, 1047], [now, now, now, now, now, now, 0.4], 'triangle', 0.15);
  }

  // Menu slide / transition
  public playSlide() {
    this.playTone([200, 600], [0.25], 'sine', 0.08);
  }

  // Game starting countdown tick
  public playCountDown() {
    this.playTone([440], [0.1], 'square', 0.18);
  }

  // High pitch countdown end / start game
  public playStart() {
    this.playTone([880], [0.3], 'square', 0.22);
  }

  // Chess move tick
  public playChessMove() {
    this.playTone([350, 300], [0.06], 'sine', 0.1);
  }

  // Carrom striker strike
  public playCarromStrike(power: number) {
    const vol = Math.min(0.2, (power / 100) * 0.2);
    this.playTone([150, 50], [0.1], 'triangle', vol);
  }

  // Carrom pocket sink
  public playPocket() {
    this.playTone([300, 600, 150], [0.1, 0.15], 'sine', 0.12);
  }

  // Typing character click (mechanical keyboard click sound)
  public playType() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;

    // 1. High-frequency click transient (tactile switch tick)
    const oscClick = this.ctx.createOscillator();
    const gainClick = this.ctx.createGain();
    oscClick.type = 'sine';
    oscClick.frequency.setValueAtTime(6000 + Math.random() * 1500, now);
    oscClick.frequency.exponentialRampToValueAtTime(1200, now + 0.015);
    gainClick.gain.setValueAtTime(0.58, now); // Increased from 0.24 for 8K audio depth
    gainClick.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);
    oscClick.connect(gainClick);
    gainClick.connect(this.ctx.destination);
    oscClick.start(now);
    oscClick.stop(now + 0.015);

    // 2. Lower frequency body (keycap bottom-out resonance)
    const oscBody = this.ctx.createOscillator();
    const gainBody = this.ctx.createGain();
    oscBody.type = 'triangle';
    oscBody.frequency.setValueAtTime(280 + Math.random() * 50, now);
    gainBody.gain.setValueAtTime(0.68, now); // Increased from 0.38 for deep room presence
    gainBody.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    oscBody.connect(gainBody);
    gainBody.connect(this.ctx.destination);
    oscBody.start(now);
    oscBody.stop(now + 0.045);

    // 3. Metallic tactile snap/spring click sweep (Cherry MX Blue sound)
    const oscSnap = this.ctx.createOscillator();
    const gainSnap = this.ctx.createGain();
    oscSnap.type = 'triangle';
    oscSnap.frequency.setValueAtTime(4800 + Math.random() * 400, now);
    oscSnap.frequency.exponentialRampToValueAtTime(3200, now + 0.008);
    gainSnap.gain.setValueAtTime(0.45, now);
    gainSnap.gain.exponentialRampToValueAtTime(0.0001, now + 0.008);
    oscSnap.connect(gainSnap);
    gainSnap.connect(this.ctx.destination);
    oscSnap.start(now);
    oscSnap.stop(now + 0.008);
  }

  // Typing typo error
  public playError() {
    this.playTone([150, 100], [0.15], 'sawtooth', 0.22); // Increased from 0.08
  }

  // Car Engine sound (based on speed/acceleration)
  public playEngine(speed: number) {
    const pitch = 80 + (speed * 120); // mapping speed to pitch
    this.playTone([pitch], [0.05], 'sawtooth', 0.03);
  }

  // Car drift screech
  public playDrift() {
    this.playTone([600, 500, 650], [0.08, 0.08], 'sawtooth', 0.04);
  }

  // Gear shift pop and clutch sound
  public playGearShift() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    
    // 1. Mechanical clunk
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);

    // 2. Exhaust Pop (white noise burst)
    try {
      const bufferSize = this.ctx.sampleRate * 0.06;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 350;
      
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.24, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + 0.06);
    } catch (e) {
      // Fallback tone if buffer creation fails
      this.playTone([240, 100], [0.06], 'sawtooth', 0.15);
    }
  }

  // Nitro NOS engine sound sweep
  public playNitro() {
    this.playTone([500, 1500], [0.2], 'triangle', 0.07);
  }

  // Runner jumps
  public playJump() {
    this.playTone([200, 600], [0.15], 'sine', 0.06);
  }

  // Coin collect chirp
  public playCoin() {
    this.playTone([987.8, 1319], [0.08, 0.12], 'sine', 0.08);
  }

  // Chess check alarm
  public playCheck() {
    this.playTone([400, 300, 400], [0.1, 0.1], 'sawtooth', 0.12);
  }

  // GameOver failure/success
  public playGameOver(success: boolean) {
    if (success) {
      this.playTone([523.3, 659.3, 784.0, 1047], [0.1, 0.1, 0.1, 0.5], 'triangle', 0.25);
    } else {
      this.playTone([300, 200, 120], [0.15, 0.15, 0.3], 'sawtooth', 0.25);
    }
  }
}

export const audioSynth = new AudioSynth();
