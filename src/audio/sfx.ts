/**
 * 16-bit retro synthesized audio using Web Audio API.
 * Uses pure square and noise waveforms.
 * Safely initialized only after first user gesture.
 */

// Melody (MIDI notes, 0 = rest) for the four bars Am - F - C - G, one entry per 16th step
const LEAD: number[][] = [
  [69, 0, 72, 0, 76, 0, 72, 0, 69, 0, 72, 74, 76, 0, 0, 0],
  [77, 0, 72, 0, 69, 0, 72, 0, 77, 0, 76, 72, 69, 0, 0, 0],
  [72, 0, 76, 0, 79, 0, 76, 0, 72, 0, 76, 79, 84, 0, 79, 0],
  [74, 0, 79, 0, 83, 0, 79, 0, 74, 0, 79, 83, 81, 0, 79, 0],
];

class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /** Browsers only allow audio after a user gesture; call this from the first tap/key. */
  public unlock(): void {
    this.initCtx();
  }

  private lastPlayed: Record<string, number> = {};

  public play(sound: 'bomb_place' | 'explosion' | 'quiz_correct' | 'quiz_wrong' | 'powerup'): void {
    // With many players the same sound can arrive very often: keep it pleasant
    const now = performance.now();
    if (now - (this.lastPlayed[sound] ?? 0) < 120) return;
    this.lastPlayed[sound] = now;

    switch (sound) {
      case 'bomb_place':
        this.playBombPlace();
        break;
      case 'explosion':
        this.playExplosion();
        break;
      case 'quiz_correct':
      case 'powerup':
        this.playQuizCorrect();
        break;
      case 'quiz_wrong':
        this.playQuizWrong();
        break;
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    this.applyMusicVolume();
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    this.applyMusicVolume();
  }

  // ---- Background music: a small chiptune loop (Am - F - C - G), played with the same synth voices ----
  private musicOn = true; // the player's choice (separate from the sound effects)
  private musicPlaying = false;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private nextStepTime = 0;
  private musicStep = 0;
  private tempo = 132;

  public getMusicOn(): boolean {
    return this.musicOn;
  }

  public toggleMusic(): boolean {
    this.musicOn = !this.musicOn;
    this.applyMusicVolume();
    return this.musicOn;
  }

  private applyMusicVolume(): void {
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.isMuted || !this.musicOn ? 0 : 0.6, this.ctx.currentTime, 0.05);
    }
  }

  /** 0 = relaxed, 1 = the arena is almost gone: the music speeds up a little. */
  public setMusicIntensity(intensity: number): void {
    this.tempo = 132 + 36 * Math.max(0, Math.min(1, intensity));
  }

  public startMusic(): void {
    if (this.musicPlaying) return;
    this.initCtx();
    if (!this.ctx) return;
    if (!this.musicGain) {
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.ctx.destination);
    }
    this.applyMusicVolume();
    if (!this.noiseBuffer) {
      this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.1, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    this.musicPlaying = true;
    this.musicStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.scheduleMusic();
  }

  public stopMusic(): void {
    this.musicPlaying = false;
    if (this.musicTimer !== null) window.clearTimeout(this.musicTimer);
    this.musicTimer = null;
  }

  /** Looks 0.25 s ahead and queues the notes of the 16th steps that fall into that window. */
  private scheduleMusic(): void {
    if (!this.musicPlaying || !this.ctx) return;
    while (this.nextStepTime < this.ctx.currentTime + 0.25) {
      this.playMusicStep(this.musicStep, this.nextStepTime);
      this.nextStepTime += 60 / this.tempo / 4;
      this.musicStep = (this.musicStep + 1) % 64;
    }
    this.musicTimer = window.setTimeout(() => this.scheduleMusic(), 60);
  }

  private tone(type: OscillatorType, midi: number, when: number, length: number, volume: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), when);
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(when);
    osc.stop(when + length + 0.02);
  }

  private playMusicStep(step: number, when: number): void {
    const bar = Math.floor(step / 16) % 4;
    const i = step % 16;
    const root = [45, 41, 48, 43][bar]; // A2, F2, C3, G2
    const third = bar === 0 ? 3 : 4; // minor chord first, then major ones
    const beat = 60 / this.tempo;

    if (i % 2 === 0) this.tone('triangle', root + (i === 6 || i === 14 ? 12 : 0), when, beat * 0.45, 0.16);
    this.tone('square', root + 24 + [0, third, 7, third][i % 4], when, beat * 0.2, 0.035);
    const lead = LEAD[bar][i];
    if (lead > 0) this.tone('square', lead, when, beat * 0.42, 0.06);
    if (i % 2 === 1 && this.noiseBuffer && this.ctx && this.musicGain) {
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      src.buffer = this.noiseBuffer;
      gain.gain.setValueAtTime(0.05, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
      src.connect(gain);
      gain.connect(this.musicGain);
      src.start(when);
      src.stop(when + 0.05);
    }
  }

  /**
   * Short square-wave beep for placing a bomb
   */
  public playBombPlace() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(320, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(160, this.ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  /**
   * Retro white noise explosion with decaying lowpass filter
   */
  public playExplosion() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const duration = 0.35;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start();
    noise.stop(this.ctx.currentTime + duration);
  }

  /**
   * Ascending bright arpeggio for correct quiz answer
   */
  public playQuizCorrect() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [440, 554, 659, 880]; // A major arpeggio

    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);

      gain.gain.setValueAtTime(0.12, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.07 + 0.06);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.06);
    });
  }

  /**
   * Low descending harsh buzz for wrong quiz answer
   */
  public playQuizWrong() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(90, now + 0.25);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  }


}

export const sfx = new SoundManager();
