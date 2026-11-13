import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { CloseCode, Room, ServerError, type AuthContext, type Client } from '@colyseus/core';
import {
  createRng,
  partyPointsForRank,
  randomSeed,
  rankScores,
  type GameContext,
  type GameInstance,
  type GamePlayer,
  type GamePlugin,
  type GameResult,
  type RawAction,
} from '@minigamehub/game-core';
import {
  C2S,
  CLOSE_CODES,
  LIMITS,
  actionSchema,
  arcadeChunkSchema,
  emptySchema,
  gameIdSchema,
  generateRoomCode,
  joinOptionsSchema,
  kickSchema,
  pingSchema,
  profileSchema,
  readySchema,
  sanitizeNickname,
  type AvatarId,
  type MatchResults,
  type NoticePayload,
  type PartyPhase,
  type PartyState,
  type PlayerPublic,
} from '@minigamehub/shared';
import type { z } from 'zod';
import { TokenBucket } from '../ratelimit';
import { getRuntime, type RoomHandle, type RoomStats, type Runtime } from '../runtime';
import { verifySession } from '../session';

interface Member {
  id: string;
  name: string;
  avatar: AvatarId;
  ready: boolean;
  joinedAt: number;
  client: Client | null;
  disconnectedAt: number | null;
  points: number;
  wins: number;
  bucket: TokenBucket;
  strikes: number[];
}

interface AuthData {
  guestId: string;
  name: string;
  avatar: AvatarId;
}

const TICK_MS = 33;
const MAX_STRIKES = 8;
const STRIKE_WINDOW_MS = 10_000;

/**
 * The persistent party. One PartyRoom == one party: membership, host, ready states, votes, party
 * points. Mini-games are *sessions* hosted inside this room as plugins: when a match starts the
 * party keeps every connection and identity and only a GameInstance is attached; when the match
 * ends the instance is disposed and the same party returns to the lobby. That is the explicit
 * "handoff": there is no second room to migrate players into, so memberships cannot be lost.
 */
export class PartyRoom extends Room implements RoomHandle {
  override maxClients = LIMITS.PARTY_MAX_PLAYERS + 4; // headroom so a duplicate tab can take over a seat
  override autoDispose = false;
  override maxMessagesPerSecond = 120;

  private rt!: Runtime;
  private code = '';
  private createdAt = Date.now();
  private members = new Map<string, Member>();
  private banned = new Set<string>();
  private hostId = '';
  private phase: PartyPhase = 'lobby';
  private selectedGameId: string | null = null;
  private hostPicked = false;
  private votes = new Map<string, string>();
  private startsAt: number | null = null;
  private current: { gameId: string; matchId: string } | null = null;
  private participantIds: string[] = [];
  private participantSnapshot = new Map<string, GamePlayer>();
  private matchStartedAt = 0;
  private lastResults: MatchResults | null = null;
  private matchesPlayed = 0;
  private resultsDeadline = 0;
  private instance: GameInstance | null = null;
  private plugin: GamePlugin | null = null;
  private pendingResult: GameResult | null = null;
  private gameDirty = false;
  private lastStatePush = 0;
  private partyDirty = true;
  private lastTick = Date.now();
  private lastSweep = 0;
  private idleSince: number | null = null;

  // ---- lifecycle -------------------------------------------------------------------------

  override onCreate(): void {
    this.rt = getRuntime();
    if (this.rt.rooms.size >= this.rt.config.MAX_ROOMS) {
      throw new ServerError(503, 'Server is at capacity, try again shortly');
    }
    let code = generateRoomCode();
    for (let i = 0; i < 50 && this.rt.codes.has(code); i++) code = generateRoomCode();
    if (this.rt.codes.has(code)) throw new ServerError(503, 'Could not allocate a room code');
    this.rt.codes.add(code);
    this.code = code;
    this.roomId = code;
    this.rt.rooms.add(this);
    this.rt.metrics.counters.roomsCreated++;
    // Rooms are unlisted: reachable only by code/invite link.
    void this.setPrivate(true);

    this.registerMessages();
    this.setSimulationInterval(() => this.tick(), TICK_MS);
  }

  override onAuth(_client: Client, options: unknown, context: AuthContext): AuthData {
    const rt = this.rt;
    const ip = context.ip ?? 'unknown';
    if (!rt.joinLimiter.allow(ip)) {
      rt.metrics.counters.rateLimited++;
      throw new ServerError(429, 'Too many join attempts, slow down');
    }
    const parsed = joinOptionsSchema.safeParse(options);
    if (!parsed.success) throw new ServerError(4400, 'Invalid join request');
    const claims = verifySession(rt.config.sessionSecret, parsed.data.token);
    if (!claims) throw new ServerError(4401, 'Session expired - please refresh');
    const name = sanitizeNickname(parsed.data.nickname);
    if (!name) throw new ServerError(4400, `Nickname must be ${LIMITS.NICK_MIN}-${LIMITS.NICK_MAX} characters`);
    const guestId = claims.sub;
    if (this.banned.has(guestId)) {
      rt.metrics.counters.joinRejected++;
      throw new ServerError(4403, 'You were removed from this party');
    }
    if (!this.members.has(guestId) && this.members.size >= LIMITS.PARTY_MAX_PLAYERS) {
      rt.metrics.counters.joinRejected++;
      throw new ServerError(4409, 'This party is full');
    }
    return { guestId, name, avatar: parsed.data.avatar };
  }

  override onJoin(client: Client): void {
    const auth = client.auth as AuthData;
    client.userData = { guestId: auth.guestId };
    this.rt.metrics.counters.joins++;
    const existing = this.members.get(auth.guestId);
    if (existing) {
      // Resume (reconnect) or duplicate connection: the newest connection wins.
      const old = existing.client;
      existing.client = client;
      existing.disconnectedAt = null;
      if (old && old !== client) {
        this.safeSend(old, 'kicked', { reason: 'Signed in from another tab or device' });
        old.leave(CLOSE_CODES.DUPLICATE_SESSION);
      }
      this.notifyConnection(existing, true);
    } else {
      const m: Member = {
        id: auth.guestId,
        name: this.uniqueName(auth.name),
        avatar: auth.avatar,
        ready: false,
        joinedAt: Date.now(),
        client,
        disconnectedAt: null,
        points: 0,
        wins: 0,
        bucket: new TokenBucket(60, 30),
        strikes: [],
      };
      this.members.set(m.id, m);
      if (!this.hostId || !this.members.has(this.hostId)) this.hostId = m.id;
    }
    const m = this.members.get(auth.guestId)!;
    this.safeSend(client, 'you', { playerId: m.id });
    this.resyncGame(m);
    this.partyDirty = true;
  }

  override onLeave(client: Client, code?: number): void {
    const m = this.memberOf(client);
    if (!m || m.client !== client) return; // replaced by a newer connection or already removed
    m.client = null;
    if (code === CloseCode.CONSENTED) {
      this.removeMember(m.id, 'left');
    } else {
      m.disconnectedAt = Date.now();
      this.notifyConnection(m, false);
      this.partyDirty = true;
    }
  }

  override onDispose(): void {
    this.disposeInstance();
    this.rt.rooms.delete(this);
    this.rt.codes.delete(this.code);
    this.rt.metrics.counters.roomsDisposed++;
  }

  // ---- RoomHandle ------------------------------------------------------------------------

  stats(): RoomStats {
    let connected = 0;
    for (const m of this.members.values()) if (m.client) connected++;
    return { code: this.code, phase: this.phase, members: this.members.size, connected, gameId: this.current?.gameId ?? null };
  }

  // ---- messages --------------------------------------------------------------------------

  private registerMessages(): void {
    const on = <S extends z.ZodType>(type: string, schema: S, fn: (m: Member, data: z.infer<S>) => void) => {
      this.onMessage(type, (client: Client, raw: unknown) => {
        const m = this.memberOf(client);
        if (!m || m.client !== client) return;
        this.rt.metrics.counters.messagesIn++;
        if (!m.bucket.take()) {
          this.rt.metrics.counters.rateLimited++;
          this.strike(m, 'rate-limited');
          return;
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          this.rt.metrics.counters.malformed++;
          this.strike(m, 'malformed');
          return;
        }
        fn(m, parsed.data);
      });
    };

    on(C2S.ping, pingSchema, (m, d) => this.safeSend(m.client, 'pong', { t: d.t, serverTime: Date.now() }));
    on(C2S.profile, profileSchema, (m, d) => this.onProfile(m, d.nickname, d.avatar));
    on(C2S.ready, readySchema, (m, d) => {
      if (this.phase !== 'lobby') return;
      m.ready = d.ready;
      this.partyDirty = true;
    });
    on(C2S.selectGame, gameIdSchema, (m, d) => this.onSelectGame(m, d.gameId));
    on(C2S.vote, gameIdSchema, (m, d) => this.onVote(m, d.gameId));
    on(C2S.start, emptySchema, (m) => this.onStart(m, false));
    on(C2S.rematch, emptySchema, (m) => this.onStart(m, true));
    on(C2S.backToLobby, emptySchema, (m) => this.onBackToLobby(m));
    on(C2S.kick, kickSchema, (m, d) => this.onKick(m, d.playerId));
    on(C2S.action, actionSchema, (m, d) => this.onAction(m, d as RawAction));
    // Arcade input-log chunks: shape-checked here (bad shape = strike), then only {i, n, d} reach the
    // game (any extra field such as a claimed score is dropped). Same participant/phase gate as actions.
    on(C2S.arcade, arcadeChunkSchema, (m, d) => this.onAction(m, { type: C2S.arcade, i: d.i, n: d.n, d: d.d }));

    // Anything else is a protocol violation, but never fatal by itself.
    this.onMessage('*', (client: Client) => {
      const m = this.memberOf(client);
      if (m) {
        this.rt.metrics.counters.malformed++;
        this.strike(m, 'unknown-message');
      }
    });
  }

  private onProfile(m: Member, nickname: string, avatar: AvatarId): void {
    const name = sanitizeNickname(nickname);
    if (!name) return this.notice(m, 'warn', `Nickname must be ${LIMITS.NICK_MIN}-${LIMITS.NICK_MAX} characters`);
    m.name = this.uniqueName(name, m.id);
    m.avatar = avatar;
    this.partyDirty = true;
  }

  private requireHost(m: Member): boolean {
    if (m.id !== this.hostId) {
      this.notice(m, 'warn', 'Only the host can do that');
      return false;
    }
    return true;
  }

  private onSelectGame(m: Member, gameId: string): void {
    if (!this.requireHost(m)) return;
    if (this.phase !== 'lobby' && this.phase !== 'results') return;
    if (!this.rt.games.has(gameId)) return this.notice(m, 'warn', 'Unknown game');
    this.selectedGameId = gameId;
    this.hostPicked = true;
    this.partyDirty = true;
  }

  private onVote(m: Member, gameId: string): void {
    if (this.phase !== 'lobby' && this.phase !== 'results') return;
    if (!this.rt.games.has(gameId)) return this.notice(m, 'warn', 'Unknown game');
    if (this.votes.get(m.id) === gameId) this.votes.delete(m.id);
    else this.votes.set(m.id, gameId);
    if (!this.hostPicked) this.selectedGameId = this.leadingVote() ?? this.selectedGameId;
    this.partyDirty = true;
  }

  private leadingVote(): string | null {
    const tally = new Map<string, number>();
    for (const g of this.votes.values()) tally.set(g, (tally.get(g) ?? 0) + 1);
    let best: string | null = null;
    let bestN = 0;
    for (const [g, n] of tally) {
      if (n > bestN || (n === bestN && best !== null && g < best)) {
        best = g;
        bestN = n;
      }
    }
    return best;
  }

  private onStart(m: Member, rematch: boolean): void {
    if (!this.requireHost(m)) return;
    if (rematch ? this.phase !== 'results' : this.phase !== 'lobby' && this.phase !== 'results') return;
    const gameId = rematch ? (this.lastResults?.gameId ?? this.selectedGameId) : this.selectedGameId;
    const plugin = gameId ? this.rt.games.get(gameId) : undefined;
    if (!gameId || !plugin) return this.notice(m, 'warn', 'Pick a game first');
    const players = [...this.members.values()].filter((p) => p.client);
    const { minPlayers, maxPlayers } = plugin.meta;
    if (players.length < minPlayers) {
      return this.notice(m, 'warn', `${plugin.meta.name} needs at least ${minPlayers} connected players`);
    }
    if (players.length > maxPlayers) {
      return this.notice(m, 'warn', `${plugin.meta.name} supports at most ${maxPlayers} players - pick another game or have someone sit out`);
    }
    if (this.phase === 'lobby') {
      const notReady = players.filter((p) => p.id !== this.hostId && !p.ready);
      if (notReady.length > 0) return this.notice(m, 'warn', `Waiting for ${notReady.map((p) => p.name).join(', ')} to ready up`);
    }
    this.selectedGameId = gameId;
    this.participantIds = players.map((p) => p.id);
    this.participantSnapshot = new Map(players.map((p) => [p.id, toPlayer(p)]));
    this.current = { gameId, matchId: randomUUID() };
    this.lastResults = null;
    this.phase = 'starting';
    this.startsAt = Date.now() + this.rt.timing.startDelayMs;
    this.partyDirty = true;
  }

  private onBackToLobby(m: Member): void {
    if (!this.requireHost(m)) return;
    if (this.phase === 'lobby') return;
    this.toLobby();
  }

  private onKick(m: Member, targetId: string): void {
    if (!this.requireHost(m)) return;
    if (targetId === m.id) return this.notice(m, 'warn', 'You cannot remove yourself');
    const target = this.members.get(targetId);
    if (!target) return;
    this.banned.add(targetId);
    this.rt.metrics.counters.kicks++;
    const client = target.client;
    this.removeMember(targetId, 'kicked');
    if (client) {
      this.safeSend(client, 'kicked', { reason: 'The host removed you from the party' });
      client.leave(CLOSE_CODES.KICKED);
    }
  }

  private onAction(m: Member, action: RawAction): void {
    if (this.phase !== 'playing' || !this.instance) return;
    if (!this.participantSnapshot.has(m.id)) return; // spectators cannot act
    try {
      this.instance.handleAction(m.id, action);
    } catch (err) {
      this.rt.metrics.counters.gameErrors++;
      console.error('[game] handleAction error', this.current?.gameId, err);
    }
  }

  private strike(m: Member, reason: string): void {
    const now = Date.now();
    m.strikes = m.strikes.filter((t) => now - t < STRIKE_WINDOW_MS);
    m.strikes.push(now);
    if (m.strikes.length >= MAX_STRIKES && m.client) {
      const c = m.client;
      this.safeSend(c, 'notice', { level: 'error', message: `Disconnected: too many invalid or rapid messages (${reason})` });
      c.leave(CLOSE_CODES.RATE_LIMITED);
    }
  }

  // ---- membership ------------------------------------------------------------------------

  private memberOf(client: Client): Member | undefined {
    const id = (client.userData as { guestId?: string } | undefined)?.guestId;
    return id ? this.members.get(id) : undefined;
  }

  private uniqueName(base: string, selfId?: string): string {
    const taken = new Set([...this.members.values()].filter((p) => p.id !== selfId).map((p) => p.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; i < 100; i++) {
      const suffix = ` ${i}`;
      const candidate = base.slice(0, LIMITS.NICK_MAX - suffix.length) + suffix;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${base.slice(0, 10)} ${randomUUID().slice(0, 4)}`;
  }

  private removeMember(id: string, _reason: 'left' | 'kicked' | 'timeout'): void {
    const m = this.members.get(id);
    if (!m) return;
    this.members.delete(id);
    this.votes.delete(id);
    if (this.participantSnapshot.has(id) && this.instance) {
      try {
        this.instance.onPlayerRemoved?.(id);
      } catch (err) {
        console.error('[game] onPlayerRemoved error', err);
      }
    }
    if (this.hostId === id) this.migrateHost();
    if (!this.hostPicked) this.selectedGameId = this.leadingVote() ?? this.selectedGameId;
    this.partyDirty = true;
  }

  private migrateHost(): void {
    const candidates = [...this.members.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const next = candidates.find((p) => p.client) ?? candidates[0];
    this.hostId = next ? next.id : '';
    if (next) this.notice(next, 'info', 'You are now the host');
    this.partyDirty = true;
  }

  private notifyConnection(m: Member, connected: boolean): void {
    if (this.instance && this.participantSnapshot.has(m.id)) {
      try {
        this.instance.onPlayerConnectionChange?.(m.id, connected);
      } catch (err) {
        console.error('[game] onPlayerConnectionChange error', err);
      }
    }
  }

  // ---- game lifecycle --------------------------------------------------------------------

  private beginGame(): void {
    const cur = this.current;
    const plugin = cur ? this.rt.games.get(cur.gameId) : undefined;
    if (!cur || !plugin) return this.toLobby();
    // Anyone removed during the countdown simply isn't a participant any more.
    const players = this.participantIds
      .map((id) => this.members.get(id))
      .filter((p): p is Member => !!p)
      .map(toPlayer);
    const connectedCount = players.filter((p) => this.members.get(p.id)?.client).length;
    if (players.length < plugin.meta.minPlayers || connectedCount < Math.min(plugin.meta.minPlayers, 2)) {
      this.broadcastNotice('warn', 'Not enough players connected - back to the lobby');
      return this.toLobby();
    }
    this.participantIds = players.map((p) => p.id);
    this.participantSnapshot = new Map(players.map((p) => [p.id, p]));
    this.plugin = plugin;
    const config = { ...plugin.defaultConfig, ...(this.rt.gameConfig[plugin.meta.id] ?? {}) };
    const ctx = this.makeContext(cur.matchId, players, config);
    try {
      this.instance = plugin.createInstance(ctx);
    } catch (err) {
      console.error('[game] createInstance failed', plugin.meta.id, err);
      this.rt.metrics.counters.gameErrors++;
      this.broadcastNotice('error', 'The game failed to start');
      return this.toLobby();
    }
    this.phase = 'playing';
    this.startsAt = null;
    this.matchStartedAt = Date.now();
    this.broadcast('game:start', { gameId: plugin.meta.id, matchId: cur.matchId, config, participantIds: this.participantIds });
    try {
      this.instance.start();
    } catch (err) {
      this.rt.metrics.counters.gameErrors++;
      console.error('[game] start error', err);
    }
    this.gameDirty = true;
    this.flushGameState(true);
    this.partyDirty = true;
  }

  private makeContext(matchId: string, players: GamePlayer[], config: Record<string, unknown>): GameContext {
    return {
      matchId,
      players,
      config,
      rng: createRng(randomSeed()),
      now: () => Date.now(),
      isConnected: (id) => !!this.members.get(id)?.client,
      broadcast: (type, payload) => this.broadcast('game:event', { type, ...payload }),
      sendTo: (id, type, payload) => this.safeSend(this.members.get(id)?.client ?? null, 'game:event', { type, ...payload }),
      markDirty: () => {
        this.gameDirty = true;
      },
      finish: (result) => {
        this.pendingResult ??= result;
      },
    };
  }

  private resyncGame(m: Member): void {
    if (this.phase !== 'playing' || !this.instance || !this.current) return;
    this.safeSend(m.client, 'game:start', {
      gameId: this.current.gameId,
      matchId: this.current.matchId,
      config: { ...this.plugin?.defaultConfig, ...(this.rt.gameConfig[this.current.gameId] ?? {}) },
      participantIds: this.participantIds,
    });
    this.safeSend(m.client, 'game:state', this.stateFor(m.id));
  }

  private stateFor(playerId: string): unknown {
    return this.instance?.getState(this.participantSnapshot.has(playerId) ? playerId : null);
  }

  private flushGameState(force = false): void {
    if (!this.instance || !this.gameDirty) return;
    const now = Date.now();
    if (!force && now - this.lastStatePush < (this.plugin?.stateIntervalMs ?? 100)) return;
    this.gameDirty = false;
    this.lastStatePush = now;
    for (const m of this.members.values()) {
      if (!m.client) continue;
      try {
        this.safeSend(m.client, 'game:state', this.stateFor(m.id));
      } catch (err) {
        console.error('[game] getState error', err);
      }
    }
  }

  private completeMatch(result: GameResult): void {
    const cur = this.current;
    const plugin = this.plugin;
    if (!cur || !plugin) return;
    // Defensive: only known participants, each exactly once.
    const byId = new Map<string, { playerId: string; score: number; tiebreak?: number }>();
    for (const s of result.scores) {
      if (this.participantSnapshot.has(s.playerId) && Number.isFinite(s.score)) byId.set(s.playerId, s);
    }
    for (const id of this.participantSnapshot.keys()) if (!byId.has(id)) byId.set(id, { playerId: id, score: 0 });
    const ranked = rankScores([...byId.values()]);
    const n = ranked.length;
    const rankings = ranked.map((r) => {
      const p = this.participantSnapshot.get(r.playerId)!;
      const live = this.members.get(r.playerId);
      const partyPoints = partyPointsForRank(r.rank, n);
      if (live) {
        live.points += partyPoints;
        // A win needs an opponent: a solo finish (n === 1) is rank 1 but never a win.
        // The same rule is enforced for persisted stats in db/repository.ts (recordMatch).
        if (n > 1 && r.rank === 1) live.wins++;
      }
      return { playerId: r.playerId, name: live?.name ?? p.name, avatar: live?.avatar ?? p.avatar, score: r.score, rank: r.rank, partyPoints };
    });
    const results: MatchResults = {
      matchId: cur.matchId,
      gameId: plugin.meta.id,
      gameName: plugin.meta.name,
      rankings,
      winnerIds: rankings.filter((r) => r.rank === 1).map((r) => r.playerId),
      summary: result.summary,
      endedAt: Date.now(),
    };
    this.flushGameState(true);
    this.disposeInstance();
    this.lastResults = results;
    this.matchesPlayed++;
    this.phase = 'results';
    this.resultsDeadline = Date.now() + this.rt.timing.resultsAutoReturnMs;
    for (const m of this.members.values()) m.ready = false;
    this.votes.clear();
    this.hostPicked = false;
    this.selectedGameId = plugin.meta.id; // default for "rematch"
    this.broadcast('game:end', results);
    this.partyDirty = true;
    this.rt.metrics.counters.matchesFinished++;
    void this.rt.repo
      .recordMatch({
        matchId: results.matchId,
        partyCode: this.code,
        gameId: results.gameId,
        startedAt: this.matchStartedAt,
        endedAt: results.endedAt,
        summary: results.summary,
        participants: rankings.map((r) => ({ guestId: r.playerId, nickname: r.name, avatar: r.avatar, score: r.score, rank: r.rank, partyPoints: r.partyPoints })),
      })
      .catch((err) => console.error('[db] recordMatch failed', err instanceof Error ? err.message : err));
    // Personal bests: same snapshot-based participant count `n` as the win rule. Task 10 overrides
    // the mode for daily challenges. Non-persistent players are skipped inside the repository.
    const mode = n === 1 ? 'solo' : 'party';
    void this.rt.repo
      .recordScores(rankings.map((r) => ({ guestId: r.playerId, gameId: results.gameId, mode, score: r.score })))
      .catch((err) => console.error('[db] recordScores failed', err instanceof Error ? err.message : err));
  }

  private toLobby(): void {
    this.disposeInstance();
    this.phase = 'lobby';
    this.current = null;
    this.startsAt = null;
    this.lastResults = null;
    this.participantIds = [];
    this.participantSnapshot = new Map();
    this.votes.clear();
    this.hostPicked = false;
    for (const m of this.members.values()) m.ready = false;
    this.partyDirty = true;
  }

  private disposeInstance(): void {
    const inst = this.instance;
    this.instance = null;
    this.pendingResult = null;
    this.gameDirty = false;
    if (inst) {
      try {
        inst.dispose();
      } catch (err) {
        console.error('[game] dispose error', err);
      }
    }
  }

  // ---- tick / sweep ----------------------------------------------------------------------

  private tick(): void {
    const t0 = performance.now();
    const now = Date.now();
    const dt = Math.min(100, now - this.lastTick);
    this.lastTick = now;

    if (this.phase === 'starting' && this.startsAt !== null && now >= this.startsAt) {
      this.beginGame();
    } else if (this.phase === 'playing' && this.instance) {
      try {
        this.instance.update(dt);
      } catch (err) {
        this.rt.metrics.counters.gameErrors++;
        console.error('[game] update error', this.current?.gameId, err);
        this.broadcastNotice('error', 'The game hit an error and was ended');
        this.toLobby();
      }
      if (this.pendingResult && this.phase === 'playing') {
        const result = this.pendingResult;
        this.pendingResult = null;
        this.completeMatch(result);
      } else {
        this.flushGameState();
      }
    } else if (this.phase === 'results' && now >= this.resultsDeadline) {
      this.toLobby();
    }

    if (now - this.lastSweep >= 1000) {
      this.lastSweep = now;
      this.sweep(now);
    }
    this.flushParty();
    this.rt.metrics.recordTick(performance.now() - t0);
  }

  private sweep(now: number): void {
    const { timing } = this.rt;
    for (const m of [...this.members.values()]) {
      if (!m.client && m.disconnectedAt !== null && now - m.disconnectedAt >= timing.graceMs) {
        this.removeMember(m.id, 'timeout');
      }
    }
    const host = this.members.get(this.hostId);
    if (host && !host.client && host.disconnectedAt !== null && now - host.disconnectedAt >= timing.hostMigrationMs) {
      this.migrateHost();
    }
    const connected = [...this.members.values()].some((m) => m.client);
    if (connected) this.idleSince = null;
    else {
      this.idleSince ??= now;
      const ttl = this.members.size === 0 ? Math.min(timing.unclaimedTtlMs, timing.idleTtlMs) : timing.idleTtlMs;
      if (now - this.idleSince >= ttl) return void this.closeParty();
    }
    if (now - this.createdAt >= timing.maxLifetimeMs) this.closeParty();
  }

  private closeParty(): void {
    this.disposeInstance();
    void this.disconnect(CLOSE_CODES.PARTY_CLOSED);
  }

  // ---- outbound --------------------------------------------------------------------------

  private snapshot(): PartyState {
    const inMatch = this.phase === 'playing' || this.phase === 'starting';
    const players: PlayerPublic[] = [...this.members.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((m) => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        ready: m.id === this.hostId ? true : m.ready,
        connected: !!m.client,
        isHost: m.id === this.hostId,
        inGame: inMatch ? this.participantSnapshot.has(m.id) : true,
        points: m.points,
        wins: m.wins,
      }));
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      players,
      capacity: LIMITS.PARTY_MAX_PLAYERS,
      selectedGameId: this.selectedGameId,
      votes: Object.fromEntries(this.votes),
      startsAt: this.startsAt,
      current: this.current,
      lastResults: this.lastResults,
      matchesPlayed: this.matchesPlayed,
      serverTime: Date.now(),
    };
  }

  private flushParty(): void {
    if (!this.partyDirty) return;
    this.partyDirty = false;
    this.broadcast('party', this.snapshot());
  }

  private safeSend(client: Client | null | undefined, type: string, payload: unknown): void {
    if (!client) return;
    try {
      client.send(type, payload);
    } catch {
      /* socket already closing */
    }
  }

  private notice(m: Member, level: NoticePayload['level'], message: string): void {
    this.safeSend(m.client, 'notice', { level, message });
  }

  private broadcastNotice(level: NoticePayload['level'], message: string): void {
    this.broadcast('notice', { level, message });
  }
}

function toPlayer(m: Member): GamePlayer {
  return { id: m.id, name: m.name, avatar: m.avatar };
}
