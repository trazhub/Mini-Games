import type { SfxName } from '@minigamehub/game-core';
import { getSettings } from './settings';

/**
 * All audio is synthesised with the Web Audio API: zero asset downloads, instant start.
 * The context is created lazily on the first user gesture (browser autoplay policy).
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ensure(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, slideTo?: number): void {
  const c = ensure();
  if (!c || !master) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const PAD_FREQS = [329.63, 392, 493.88, 587.33];

export function sfx(name: SfxName): void {
  if (!getSettings().sound) return;
  switch (name) {
    case 'tap':
      tone(520, 0, 0.07, 'triangle', 0.12);
      break;
    case 'good':
      tone(660, 0, 0.1, 'triangle', 0.16);
      tone(880, 0.08, 0.14, 'triangle', 0.16);
      break;
    case 'bad':
      tone(220, 0, 0.22, 'sawtooth', 0.12, 110);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.22, 'triangle', 0.18));
      break;
    case 'tick':
      tone(900, 0, 0.04, 'square', 0.05);
      break;
    case 'go':
      tone(784, 0, 0.18, 'square', 0.1);
      tone(1175, 0.1, 0.24, 'square', 0.1);
      break;
    case 'pad0':
    case 'pad1':
    case 'pad2':
    case 'pad3':
      tone(PAD_FREQS[Number(name.slice(3))]!, 0, 0.22, 'sine', 0.22);
      break;
  }
}

// ---- ambient music: a slow generative pentatonic arpeggio ----------------------------------
let musicTimer: ReturnType<typeof setInterval> | null = null;
const SCALE = [196, 246.94, 293.66, 392, 440, 587.33];
let step = 0;

export function setMusic(on: boolean): void {
  if (on && getSettings().music) {
    if (musicTimer || !ensure()) return;
    musicTimer = setInterval(() => {
      const f = SCALE[(step * 2 + (step % 3)) % SCALE.length]!;
      tone(f, 0, 1.4, 'sine', 0.045);
      if (step % 4 === 0) tone(f / 2, 0, 2.2, 'triangle', 0.035);
      step++;
    }, 520);
  } else if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

/** Call from a click handler so the audio context is allowed to start. */
export function unlockAudio(): void {
  ensure();
}
