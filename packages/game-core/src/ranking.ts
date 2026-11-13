import type { GameScore } from './plugin';

export interface Ranked {
  playerId: string;
  score: number;
  rank: number;
}

/**
 * Standard competition ranking ("1224"): equal score (and tiebreak) share a rank.
 * Sort is stable w.r.t. the input order for fully tied entries.
 */
export function rankScores(scores: readonly GameScore[]): Ranked[] {
  const sorted = scores
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => b.score - a.score || (b.tiebreak ?? 0) - (a.tiebreak ?? 0) || a.i - b.i);
  const out: Ranked[] = [];
  let rank = 0;
  let prev: { score: number; tiebreak: number } | null = null;
  sorted.forEach((s, idx) => {
    const tb = s.tiebreak ?? 0;
    if (!prev || prev.score !== s.score || prev.tiebreak !== tb) rank = idx + 1;
    prev = { score: s.score, tiebreak: tb };
    out.push({ playerId: s.playerId, score: s.score, rank });
  });
  return out;
}

/**
 * Party points for a finishing rank among `n` players: last place gets 1... capped so a big
 * party doesn't inflate numbers. 1st = min(n, 5), then descending, never below 1.
 * Deterministic and documented in docs/GAME_ENGINE.md.
 */
export function partyPointsForRank(rank: number, n: number): number {
  const top = Math.min(n, 5);
  return Math.max(1, top - (rank - 1));
}
