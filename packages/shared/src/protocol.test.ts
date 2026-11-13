import { describe, expect, it } from 'vitest';
import { ARCADE, C2S, GAME_KINDS, KIND_LABELS, arcadeChunkSchema, guestRequestSchema } from './index';

describe('arcade chunk protocol', () => {
  it('accepts a valid chunk', () => {
    expect(arcadeChunkSchema.safeParse({ i: 0, n: 1, d: 'abc' }).success).toBe(true);
    expect(arcadeChunkSchema.safeParse({ i: 15, n: 16, d: 'x'.repeat(1400) }).success).toBe(true);
  });

  it('rejects i >= n', () => {
    expect(arcadeChunkSchema.safeParse({ i: 2, n: 2, d: 'abc' }).success).toBe(false);
    expect(arcadeChunkSchema.safeParse({ i: 3, n: 2, d: 'abc' }).success).toBe(false);
  });

  it('rejects n = 17', () => {
    expect(arcadeChunkSchema.safeParse({ i: 0, n: 17, d: 'abc' }).success).toBe(false);
  });

  it('rejects data over 1400 chars', () => {
    expect(arcadeChunkSchema.safeParse({ i: 0, n: 1, d: 'x'.repeat(1401) }).success).toBe(false);
  });

  it('rejects non-integer i', () => {
    expect(arcadeChunkSchema.safeParse({ i: 0.5, n: 2, d: 'abc' }).success).toBe(false);
  });

  it('chunk capacity covers a max-size log in base64url', () => {
    expect(ARCADE.MAX_CHUNKS * ARCADE.CHUNK_CHARS).toBeGreaterThanOrEqual(
      Math.ceil((ARCADE.MAX_LOG_BYTES * 4) / 3),
    );
  });

  it('exposes the arcade message name and kinds', () => {
    expect(C2S.arcade).toBe('arcade:chunk');
    expect(GAME_KINDS).toEqual(['together', 'arcade', 'action']);
    expect(KIND_LABELS).toEqual({ together: 'Together', arcade: 'Arcade', action: 'Action' });
  });
});

describe('guest request', () => {
  it('accepts an optional resumeToken alongside nickname', () => {
    expect(guestRequestSchema.safeParse({}).success).toBe(true);
    expect(guestRequestSchema.safeParse({ nickname: 'Ada', resumeToken: 'tok' }).success).toBe(true);
    expect(guestRequestSchema.safeParse({ resumeToken: 'x'.repeat(2049) }).success).toBe(false);
  });
});
