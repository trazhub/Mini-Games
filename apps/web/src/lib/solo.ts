import { sanitizeNickname } from '@minigamehub/shared';
import { getProfile, saveProfile } from './storage';

/** The slice of the party API a solo start needs (a narrow type keeps this easy to test). */
export interface SoloParty {
  create(): Promise<string>;
  selectGame(gameId: string): void;
  start(): void;
  notify(level: 'info' | 'warn' | 'error', message: string): void;
}

/** A first-time player has no nickname yet; give them a friendly one instead of blocking the solo start. */
export function ensureNickname(): void {
  const p = getProfile();
  if (sanitizeNickname(p.nickname)) return;
  saveProfile({ ...p, nickname: `Player${100 + Math.floor(Math.random() * 900)}` });
}

/**
 * Start a one-player game: create a private party, pick the game, start it. Resolves to the room code
 * (so the caller can navigate there) or `null` after showing a toast when something failed.
 * The server applies the messages in order, so no waiting between them is needed.
 */
export async function startSolo(party: SoloParty, gameId: string): Promise<string | null> {
  try {
    ensureNickname();
    const code = await party.create();
    party.selectGame(gameId);
    party.start();
    return code;
  } catch (e) {
    // `create()` already turns connection failures into a friendly message.
    party.notify('error', (e as Error).message || 'Could not start the game. Try again.');
    return null;
  }
}
