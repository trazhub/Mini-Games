import { describe, expect, it, vi } from 'vitest';
import { startSolo } from './solo';

function stubParty(create: () => Promise<string>) {
  const calls: string[] = [];
  return {
    calls,
    party: {
      create: vi.fn(async () => {
        calls.push('create');
        return create();
      }),
      selectGame: vi.fn((id: string) => void calls.push(`select:${id}`)),
      start: vi.fn(() => void calls.push('start')),
      notify: vi.fn((level: string, msg: string) => void calls.push(`notify:${level}:${msg}`)),
    },
  };
}

describe('startSolo', () => {
  it('calls create, select, start in order and returns the room code', async () => {
    const { party, calls } = stubParty(async () => 'ABCDE');
    await expect(startSolo(party, 'lane-runner')).resolves.toBe('ABCDE');
    expect(calls).toEqual(['create', 'select:lane-runner', 'start']);
  });

  it('shows a toast and starts nothing when the party cannot be created', async () => {
    const { party, calls } = stubParty(async () => {
      throw new Error('Cannot reach the game server. Check your connection and try again.');
    });
    await expect(startSolo(party, 'lane-runner')).resolves.toBeNull();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe('create');
    expect(calls[1]).toMatch(/^notify:error:Cannot reach the game server/);
    expect(party.selectGame).not.toHaveBeenCalled();
    expect(party.start).not.toHaveBeenCalled();
  });
});
