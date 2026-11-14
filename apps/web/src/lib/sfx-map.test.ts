import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SAMPLE_FILES, SFX_PLAN } from './sfx-map';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/sfx');
const NAMES = ['tap', 'good', 'bad', 'win', 'tick', 'go', 'pad0', 'pad1', 'pad2', 'pad3'] as const;

describe('sound effect plan', () => {
  it('has a plan for every cue a game can play', () => {
    for (const n of NAMES) expect(SFX_PLAN[n], n).toBeDefined();
    expect(Object.keys(SFX_PLAN).sort()).toEqual([...NAMES].sort());
  });

  it('only points at samples that exist on disk and are not empty', () => {
    for (const plan of Object.values(SFX_PLAN)) expect(SAMPLE_FILES[plan.sample]).toBeDefined();
    for (const file of Object.values(SAMPLE_FILES)) {
      const p = path.join(dir, file);
      expect(fs.existsSync(p), file).toBe(true);
      expect(fs.statSync(p).size).toBeGreaterThan(1000);
    }
  });

  it('ships the CC0 license next to the samples', () => {
    expect(fs.readFileSync(path.join(dir, 'LICENSE.txt'), 'utf8')).toMatch(/CC0|Creative Commons Zero/);
  });

  it('keeps pad pitches distinct and ascending', () => {
    const rates = ['pad0', 'pad1', 'pad2', 'pad3'].map((n) => SFX_PLAN[n as (typeof NAMES)[number]].rate ?? 1);
    expect(new Set(rates).size).toBe(4);
    expect([...rates].sort((a, b) => a - b)).toEqual(rates);
  });
});
