import { Client, type Room } from '@colyseus/sdk';
import type { ClientAction, GameEventMessage } from '@minigamehub/game-core';
import {
  C2S,
  CLOSE_CODES,
  PARTY_ROOM_NAME,
  type GameStartPayload,
  type MatchResults,
  type NoticePayload,
  type PartyState,
} from '@minigamehub/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, ensureSession } from './api';
import { API_URL } from './config';
import { clearLastRoom, getProfile, recordMatch, setLastRoom } from './storage';

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface Toast {
  id: number;
  level: NoticePayload['level'];
  message: string;
}

interface PartyApi {
  status: ConnStatus;
  /** Why the connection ended (kicked, party closed, failed to join...). */
  closedReason: string | null;
  party: PartyState | null;
  me: string;
  isHost: boolean;
  gameStart: GameStartPayload | null;
  gameState: unknown;
  scores: Record<string, number>;
  latencyMs: number | null;
  toasts: Toast[];
  create(): Promise<string>;
  join(code: string): Promise<void>;
  leave(): void;
  dismissToast(id: number): void;
  setReady(ready: boolean): void;
  selectGame(gameId: string): void;
  vote(gameId: string): void;
  start(): void;
  rematch(): void;
  backToLobby(): void;
  kick(playerId: string): void;
  updateProfile(nickname: string, avatar: string): void;
  gameAction(action: ClientAction): void;
  subscribeGame(listener: (e: GameEventMessage) => void): () => void;
  serverNow(): number;
  reportScores(scores: Record<string, number>): void;
}

const Ctx = createContext<PartyApi | null>(null);

export function useParty(): PartyApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useParty outside PartyProvider');
  return v;
}

export function friendlyError(e: unknown): string {
  const err = e as { code?: number; message?: string };
  const msg = err?.message ?? '';
  if (e instanceof ApiError) return e.message;
  switch (err?.code) {
    case 4409:
      return 'That party is full.';
    case 4403:
      return 'The host removed you from that party.';
    case 429:
      return 'Too many attempts. Wait a few seconds and try again.';
    case 4400:
      return msg || 'Check your nickname and try again.';
    case 503:
      return 'The server is busy right now. Try again in a moment.';
    case 522:
      return 'No party found with that code. Check it and try again.';
  }
  if (/not found|invalid.*room|no.*room/i.test(msg)) return 'No party found with that code. Check it and try again.';
  if (/fetch|network|econn|websocket|connect/i.test(msg)) return 'Cannot reach the game server. Check your connection and try again.';
  return msg || 'Could not connect. Try again.';
}

const NON_RETRIABLE = new Set([4403, 4409, 4400, 522]);

export function PartyProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const [party, setParty] = useState<PartyState | null>(null);
  const [me, setMe] = useState('');
  const [gameStart, setGameStart] = useState<GameStartPayload | null>(null);
  const [gameState, setGameState] = useState<unknown>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const roomRef = useRef<Room | null>(null);
  const codeRef = useRef<string | null>(null);
  const intentionalRef = useRef(false);
  const kickedRef = useRef<string | null>(null);
  const listenersRef = useRef(new Set<(e: GameEventMessage) => void>());
  const offsetRef = useRef(0);
  const bestRttRef = useRef(Infinity);
  const toastId = useRef(0);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meRef = useRef('');
  const lastResultsId = useRef<string | null>(null);

  const pushToast = useCallback((level: NoticePayload['level'], message: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, level, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const stopTimers = () => {
    if (pingTimer.current) clearInterval(pingTimer.current);
    pingTimer.current = null;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
  };

  const resetState = useCallback(() => {
    setParty(null);
    setGameStart(null);
    setGameState(null);
    setScores({});
    setLatencyMs(null);
    setMe('');
    meRef.current = '';
    lastResultsId.current = null;
  }, []);

  const wire = useCallback(
    (room: Room) => {
      roomRef.current = room;
      // We resume by guest identity ourselves (see reconnectLoop); the SDK's token-based
      // auto-reconnection would only race with it.
      room.reconnection.enabled = false;
      codeRef.current = room.roomId;
      setLastRoom(room.roomId);
      kickedRef.current = null;
      bestRttRef.current = Infinity;

      room.onMessage('party', (p: PartyState) => {
        setParty(p);
        const r: MatchResults | null = p.lastResults;
        if (r && r.matchId !== lastResultsId.current) {
          lastResultsId.current = r.matchId;
          const mine = r.rankings.find((x) => x.playerId === meRef.current);
          if (mine) recordMatch({ gameName: r.gameName, rank: mine.rank, score: mine.score, partyPoints: mine.partyPoints });
        }
      });
      room.onMessage('you', (m: { playerId: string }) => {
        meRef.current = m.playerId;
        setMe(m.playerId);
      });
      room.onMessage('game:start', (g: GameStartPayload) => {
        setGameStart(g);
        setGameState(null);
        setScores({});
      });
      room.onMessage('game:state', (s: unknown) => setGameState(s));
      room.onMessage('game:event', (e: GameEventMessage) => listenersRef.current.forEach((l) => l(e)));
      room.onMessage('game:end', () => setGameStart(null));
      room.onMessage('notice', (n: NoticePayload) => pushToast(n.level, n.message));
      room.onMessage('kicked', (k: { reason: string }) => {
        kickedRef.current = k.reason;
      });
      room.onMessage('pong', (m: { t: number; serverTime: number }) => {
        const now = Date.now();
        const rtt = now - m.t;
        setLatencyMs(Math.round(rtt));
        // Keep the offset from the lowest-RTT sample: least affected by queueing delay.
        if (rtt <= bestRttRef.current + 15) {
          bestRttRef.current = Math.min(bestRttRef.current, rtt);
          offsetRef.current = m.serverTime + rtt / 2 - now;
        }
      });

      const ping = () => {
        try {
          room.send(C2S.ping, { t: Date.now() });
        } catch {
          /* closing */
        }
      };
      ping();
      pingTimer.current = setInterval(ping, 2500);

      room.onLeave((code: number) => {
        stopTimers();
        roomRef.current = null;
        if (intentionalRef.current) return;
        if (code === CLOSE_CODES.KICKED) {
          clearLastRoom();
          setClosedReason(kickedRef.current ?? 'The host removed you from the party.');
          setStatus('closed');
        } else if (code === CLOSE_CODES.DUPLICATE_SESSION) {
          clearLastRoom();
          setClosedReason('This party was opened in another tab or device, so this one was disconnected.');
          setStatus('closed');
        } else if (code === CLOSE_CODES.PARTY_CLOSED) {
          clearLastRoom();
          setClosedReason('This party was closed because everyone left.');
          setStatus('closed');
        } else {
          void reconnectLoop();
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pushToast],
  );

  const open = useCallback(
    async (mode: { create: true } | { code: string }): Promise<Room> => {
      const profile = getProfile();
      const tryOnce = async (forceSession: boolean) => {
        const session = await ensureSession(forceSession);
        const client = new Client(API_URL);
        const options = { token: session.token, nickname: profile.nickname, avatar: profile.avatar };
        return 'create' in mode ? client.create(PARTY_ROOM_NAME, options) : client.joinById(mode.code, options);
      };
      try {
        return await tryOnce(false);
      } catch (e) {
        if ((e as { code?: number }).code === 4401) return await tryOnce(true); // token expired / server restarted
        throw e;
      }
    },
    [],
  );

  const reconnectLoop = useCallback(async () => {
    const code = codeRef.current;
    if (!code) return;
    setStatus('reconnecting');
    const started = Date.now();
    let attempt = 0;
    const tick = async (): Promise<void> => {
      if (intentionalRef.current) return;
      attempt++;
      try {
        const room = await open({ code });
        wire(room);
        setStatus('connected');
        return;
      } catch (e) {
        const c = (e as { code?: number }).code;
        const giveUp = (c !== undefined && NON_RETRIABLE.has(c)) || /not found|invalid.*room/i.test((e as Error).message ?? '') || Date.now() - started > 70_000;
        if (giveUp) {
          clearLastRoom();
          setClosedReason(c === 4403 ? 'The host removed you from the party.' : 'The connection was lost and the party could not be rejoined.');
          setStatus('closed');
          return;
        }
        reconnectTimer.current = setTimeout(() => void tick(), Math.min(4000, 800 + attempt * 600));
      }
    };
    await tick();
  }, [open, wire]);

  const connect = useCallback(
    async (mode: { create: true } | { code: string }): Promise<string> => {
      intentionalRef.current = false;
      stopTimers();
      if (roomRef.current) {
        intentionalRef.current = true;
        try {
          await roomRef.current.leave(true);
        } catch {
          /* ignore */
        }
        intentionalRef.current = false;
      }
      resetState();
      setClosedReason(null);
      setStatus('connecting');
      try {
        const room = await open(mode);
        wire(room);
        setStatus('connected');
        return room.roomId;
      } catch (e) {
        console.warn('[party] connect failed', e);
        setStatus('idle');
        throw new Error(friendlyError(e));
      }
    },
    [open, resetState, wire],
  );

  const create = useCallback(() => connect({ create: true }), [connect]);
  const join = useCallback(async (code: string) => void (await connect({ code })), [connect]);

  const leave = useCallback(() => {
    intentionalRef.current = true;
    stopTimers();
    const room = roomRef.current;
    roomRef.current = null;
    codeRef.current = null;
    clearLastRoom();
    if (room) void room.leave(true).catch(() => {});
    resetState();
    setClosedReason(null);
    setStatus('idle');
  }, [resetState]);

  useEffect(() => {
    intentionalRef.current = false; // React StrictMode re-runs effects: undo the previous cleanup
    return () => {
      intentionalRef.current = true;
      stopTimers();
      void roomRef.current?.leave(true).catch(() => {});
    };
  }, []);

  const send = useCallback((type: string, payload?: unknown) => {
    try {
      roomRef.current?.send(type, payload);
    } catch {
      /* disconnected: UI shows the connection badge */
    }
  }, []);

  const api = useMemo<PartyApi>(
    () => ({
      status,
      closedReason,
      party,
      me,
      isHost: !!party && party.hostId === me,
      gameStart,
      gameState,
      scores,
      latencyMs,
      toasts,
      create,
      join,
      leave,
      dismissToast: (id) => setToasts((t) => t.filter((x) => x.id !== id)),
      setReady: (ready) => send(C2S.ready, { ready }),
      selectGame: (gameId) => send(C2S.selectGame, { gameId }),
      vote: (gameId) => send(C2S.vote, { gameId }),
      start: () => send(C2S.start),
      rematch: () => send(C2S.rematch),
      backToLobby: () => send(C2S.backToLobby),
      kick: (playerId) => send(C2S.kick, { playerId }),
      updateProfile: (nickname, avatar) => send(C2S.profile, { nickname, avatar }),
      gameAction: (action) => send(C2S.action, action),
      subscribeGame: (l) => {
        listenersRef.current.add(l);
        return () => listenersRef.current.delete(l);
      },
      serverNow: () => Date.now() + offsetRef.current,
      reportScores: (s) => setScores((prev) => (shallowEqual(prev, s) ? prev : s)),
    }),
    [status, closedReason, party, me, gameStart, gameState, scores, latencyMs, toasts, create, join, leave, send],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

function shallowEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}
