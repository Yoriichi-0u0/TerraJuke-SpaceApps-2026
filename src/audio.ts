// Web Audio synthesis. One voice manager: a new event replaces the one still sounding,
// and stop() silences everything. All sound is generated live; there are no samples.
import type { NotePlan } from './sonify.ts';

const MASTER_LEVEL = 0.22;
const SAWTOOTH_CUTOFF_HZ = 1800;

type Ctx = AudioContext;

export class AudioEngine {
  private ctx: Ctx | null = null;
  private voices: { osc: OscillatorNode; gain: GainNode }[] = [];
  private master: GainNode | null = null;
  muted = false;

  /** Called whenever the context's state changes ('running', 'suspended', 'interrupted', …). */
  onStateChange: ((state: string) => void) | null = null;

  /** Create or resume the context. Call from a user gesture (click or key). */
  unlock(): Ctx | null {
    const Ctor: typeof AudioContext | undefined =
      globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!this.ctx) {
      // iOS mutes Web Audio when the ring/silent switch is on unless the page asks for
      // "playback" (Safari 17+). TerraJuke is a listening experience, so it asks.
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) {
        try {
          session.type = 'playback';
        } catch {
          /* not allowed here: keep the default */
        }
      }
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_LEVEL;
      this.master.connect(this.ctx.destination);
      this.ctx.onstatechange = () => this.onStateChange?.(this.state);
    }
    this.resume();
    return this.ctx;
  }

  /** Resume a context that was suspended or interrupted (iOS calls, other apps, background tabs). */
  resume(): void {
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume().catch(() => undefined);
  }

  /** 'not-started' until the first gesture; then the context's own state. */
  get state(): string {
    if (!this.available) return 'unavailable';
    return this.ctx ? this.ctx.state : 'not-started';
  }

  /** For diagnostics and tests only. */
  suspendForTest(): Promise<void> {
    return this.ctx ? this.ctx.suspend() : Promise.resolve();
  }

  get available(): boolean {
    return Boolean(globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
  }

  play(plan: NotePlan): void {
    this.stop();
    if (this.muted) return;
    const ctx = this.unlock();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + 0.01;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = plan.pan;
      panner.connect(this.master);
    }
    const out: AudioNode = panner ?? this.master;
    for (const note of plan.notes) {
      const osc = ctx.createOscillator();
      osc.type = plan.waveform;
      osc.frequency.value = note.hz;
      const gain = ctx.createGain();
      const start = t0 + note.at;
      const end = start + note.duration;
      const peak = plan.gain * (plan.waveform === 'sawtooth' ? 0.6 : 1);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      if (plan.waveform === 'sawtooth') {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = SAWTOOTH_CUTOFF_HZ;
        osc.connect(filter).connect(gain);
      } else {
        osc.connect(gain);
      }
      gain.connect(out);
      osc.start(start);
      osc.stop(end + 0.02);
      const voice = { osc, gain };
      this.voices.push(voice);
      osc.onended = () => {
        gain.disconnect();
        this.voices = this.voices.filter((v) => v !== voice);
      };
    }
  }

  stop(): void {
    for (const { osc, gain } of this.voices) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
      gain.disconnect();
    }
    this.voices = [];
  }

  get activeVoices(): number {
    return this.voices.length;
  }
}
