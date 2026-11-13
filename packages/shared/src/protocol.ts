import { z } from 'zod';
import { AVATAR_IDS } from './constants';

/** Client -> server message names. */
export const C2S = {
  profile: 'profile',
  ready: 'ready',
  selectGame: 'selectGame',
  vote: 'vote',
  start: 'start',
  kick: 'kick',
  rematch: 'rematch',
  backToLobby: 'backToLobby',
  action: 'g:action',
  ping: 'ping',
} as const;

const id = z.string().min(1).max(64);

export const profileSchema = z.object({
  nickname: z.string().max(64),
  avatar: z.enum(AVATAR_IDS),
});
export const readySchema = z.object({ ready: z.boolean() });
export const gameIdSchema = z.object({ gameId: id });
export const kickSchema = z.object({ playerId: id });
export const emptySchema = z.union([z.object({}), z.undefined(), z.null()]);
export const pingSchema = z.object({ t: z.number().finite() });

/**
 * Game actions are validated twice: here for shape/size (cheap, generic) and then by the game
 * plugin itself, which knows the action vocabulary.
 */
export const actionSchema = z
  .object({ type: z.string().min(1).max(32) })
  .catchall(z.union([z.string().max(64), z.number().finite(), z.boolean(), z.null()]))
  .refine((o) => Object.keys(o).length <= 8, 'too many fields');

export const joinOptionsSchema = z.object({
  token: z.string().min(10).max(512),
  nickname: z.string().max(64),
  avatar: z.enum(AVATAR_IDS),
  /** Only used when creating a room: shown in monitoring, never trusted for auth. */
  create: z.boolean().optional(),
});
export type JoinOptions = z.infer<typeof joinOptionsSchema>;

export const guestRequestSchema = z.object({
  nickname: z.string().max(64).optional(),
});

export interface GuestResponse {
  guestId: string;
  token: string;
  /** Epoch ms at which the token expires. */
  expiresAt: number;
}

export interface RoomInfoResponse {
  code: string;
  exists: boolean;
  players?: number;
  capacity?: number;
  phase?: string;
  joinable?: boolean;
}

export const PROTOCOL_VERSION = 1;
