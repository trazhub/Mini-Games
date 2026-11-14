import type { SfxName } from '@minigamehub/game-core';

/**
 * Sound effects are recorded samples from Kenney's "Interface Sounds" pack (CC0, see
 * src/assets/sfx/LICENSE.txt). Each game cue plays one sample, optionally re-pitched with
 * `rate` (the four Echo Steps pads are one pluck at four musical intervals).
 */
export const SAMPLE_FILES = {
  click: 'click_001.wav',
  confirm: 'confirmation_001.wav',
  error: 'error_004.wav',
  win: 'confirmation_004.wav',
  tick: 'tick_001.wav',
  go: 'open_001.wav',
  pluck: 'pluck_001.wav',
} as const;

export type SampleKey = keyof typeof SAMPLE_FILES;

export interface SfxPlan {
  sample: SampleKey;
  /** Playback rate (1 = original pitch). */
  rate?: number;
  /** 0..1 loudness relative to the master volume. */
  gain?: number;
}

export const SFX_PLAN: Record<SfxName, SfxPlan> = {
  tap: { sample: 'click', gain: 0.7 },
  good: { sample: 'confirm', gain: 0.8 },
  bad: { sample: 'error', gain: 0.8 },
  win: { sample: 'win', gain: 0.9 },
  tick: { sample: 'tick', gain: 0.6 },
  go: { sample: 'go', gain: 0.8 },
  pad0: { sample: 'pluck', rate: 0.84, gain: 0.9 },
  pad1: { sample: 'pluck', rate: 1, gain: 0.9 },
  pad2: { sample: 'pluck', rate: 1.26, gain: 0.9 },
  pad3: { sample: 'pluck', rate: 1.5, gain: 0.9 },
};
