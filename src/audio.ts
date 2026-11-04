// Small Web Audio mixer: decoded buffers, per-sound voice limits and pitch variation so 200 guns don't deafen you (SPEC §7.3).
import { ASSET_BASE } from './render/common';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer | 'loading'>();
  private voices = new Map<string, number>();
  private lastPlay = new Map<string, number>();
  volume = 0.7;
  muted = false;

  /** Must be called from a user gesture (browsers block audio until the first click). */
  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyVolume();
    } catch {
      this.ctx = null;
    }
  }

  applyVolume() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  preload(ids: string[]) {
    for (const id of ids) void this.load(id);
  }

  private async load(id: string) {
    if (!this.ctx || this.buffers.has(id)) return;
    this.buffers.set(id, 'loading');
    try {
      const res = await fetch(`${ASSET_BASE}audio/sfx/${id}.ogg`);
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(id, buf);
    } catch {
      this.buffers.delete(id);
    }
  }

  play(id: string, vol = 1, maxVoices = 4) {
    if (!this.ctx || !this.master || this.muted) return;
    const buf = this.buffers.get(id);
    if (!buf) {
      void this.load(id);
      return;
    }
    if (buf === 'loading') return;
    const now = this.ctx.currentTime;
    if ((this.voices.get(id) ?? 0) >= maxVoices) return;
    if (now - (this.lastPlay.get(id) ?? -1) < 0.03) return;
    this.lastPlay.set(id, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    this.voices.set(id, (this.voices.get(id) ?? 0) + 1);
    src.onended = () => this.voices.set(id, (this.voices.get(id) ?? 1) - 1);
    src.start();
  }
}
