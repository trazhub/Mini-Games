import { AVATAR_IDS, sanitizeNickname, type AvatarId } from '@minigamehub/shared';

/** localStorage/sessionStorage can throw (private mode, blocked): never let that break the app. */
function read<T>(store: Storage | undefined, key: string): T | null {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(store: Storage | undefined, key: string, value: unknown): void {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
function remove(store: Storage | undefined, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    /* ignore */
  }
}

const ls = typeof localStorage === 'undefined' ? undefined : localStorage;
const ss = typeof sessionStorage === 'undefined' ? undefined : sessionStorage;

// ---- profile (per browser; nickname + avatar) ----------------------------------------------
export interface Profile {
  nickname: string;
  avatar: AvatarId;
}

export function getProfile(): Profile {
  const p = read<Partial<Profile>>(ls, 'mgh.profile');
  const nickname = sanitizeNickname(p?.nickname) ?? '';
  const avatar = AVATAR_IDS.includes(p?.avatar as AvatarId) ? (p!.avatar as AvatarId) : AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)]!;
  return { nickname, avatar };
}
export function saveProfile(p: Profile): void {
  write(ls, 'mgh.profile', p);
}

// ---- guest session: see ./identity.ts (primary tab -> localStorage, other tabs -> sessionStorage) ----

// ---- session statistics (this tab, this visit) -----------------------------------------------
export interface SessionStats {
  matches: number;
  wins: number;
  partyPoints: number;
  history: { gameName: string; rank: number; score: number; at: number }[];
}
const emptyStats: SessionStats = { matches: 0, wins: 0, partyPoints: 0, history: [] };
export const getSessionStats = (): SessionStats => read<SessionStats>(ss, 'mgh.stats') ?? { ...emptyStats, history: [] };
export function recordMatch(entry: { gameName: string; rank: number; score: number; partyPoints: number }): void {
  const s = getSessionStats();
  s.matches++;
  if (entry.rank === 1) s.wins++;
  s.partyPoints += entry.partyPoints;
  s.history = [{ gameName: entry.gameName, rank: entry.rank, score: entry.score, at: Date.now() }, ...s.history].slice(0, 10);
  write(ss, 'mgh.stats', s);
}

// ---- last room (auto-resume after a reload) --------------------------------------------------
export const getLastRoom = () => read<string>(ss, 'mgh.room');
export const setLastRoom = (code: string) => write(ss, 'mgh.room', code);
export const clearLastRoom = () => remove(ss, 'mgh.room');

// ---- settings --------------------------------------------------------------------------------
export interface Settings {
  sound: boolean;
  music: boolean;
  reducedMotion: boolean;
}
export const defaultSettings: Settings = { sound: true, music: false, reducedMotion: false };
export const loadSettings = (): Settings => ({ ...defaultSettings, ...(read<Partial<Settings>>(ls, 'mgh.settings') ?? {}) });
export const saveSettings = (s: Settings) => write(ls, 'mgh.settings', s);
