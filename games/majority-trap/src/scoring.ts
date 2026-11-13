export type Choice = 'A' | 'B';

export interface Submission {
  answer: Choice;
  /** Which answer the player thinks will be LESS popular. */
  predict: Choice;
}

export const POINTS = {
  /** Predicted the minority answer correctly. */
  correctPrediction: 100,
  /** Your own answer ended up in the (strict) minority. */
  loneWolf: 50,
  /** Votes were tied: everybody who predicted gets this consolation. */
  tiePrediction: 50,
} as const;

export interface RoundRow {
  playerId: string;
  answer: Choice;
  predict: Choice;
  points: number;
  predictionCorrect: boolean;
  inMinority: boolean;
}

export interface RoundOutcome {
  counts: { A: number; B: number };
  /** null when the vote is tied (including nobody answering). */
  minority: Choice | null;
  tie: boolean;
  rows: RoundRow[];
}

/**
 * Pure, deterministic scoring for one round. Only players who submitted are counted in the
 * popularity statistics; players who did not submit simply score 0 and aren't in `rows`.
 */
export function scoreRound(submissions: ReadonlyMap<string, Submission>): RoundOutcome {
  const counts = { A: 0, B: 0 };
  for (const s of submissions.values()) counts[s.answer]++;
  const tie = counts.A === counts.B;
  const minority: Choice | null = tie ? null : counts.A < counts.B ? 'A' : 'B';
  const rows: RoundRow[] = [];
  for (const [playerId, s] of submissions) {
    let points = 0;
    let predictionCorrect = false;
    let inMinority = false;
    if (tie) {
      points += POINTS.tiePrediction;
    } else {
      if (s.predict === minority) {
        points += POINTS.correctPrediction;
        predictionCorrect = true;
      }
      if (s.answer === minority) {
        points += POINTS.loneWolf;
        inMinority = true;
      }
    }
    rows.push({ playerId, answer: s.answer, predict: s.predict, points, predictionCorrect, inMinority });
  }
  return { counts, minority, tie, rows };
}
