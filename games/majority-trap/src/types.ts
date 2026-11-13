import type { Choice, RoundRow } from './scoring';

export type MajorityPhase = 'intro' | 'question' | 'reveal' | 'done';

/** Per-viewer state pushed as `game:state`. Never contains other players' secret picks before reveal. */
export interface MajorityState {
  phase: MajorityPhase;
  round: number;
  totalRounds: number;
  /** Server epoch ms when the current phase ends (UI countdown). */
  endsAt: number;
  question: { id: string; text: string; a: string; b: string } | null;
  /** Players who have submitted this round (public so the UI can show progress). */
  submitted: string[];
  /** The viewer's own submission (private). */
  mine: { answer: Choice; predict: Choice } | null;
  reveal: {
    counts: { A: number; B: number };
    minority: Choice | null;
    tie: boolean;
    rows: RoundRow[];
  } | null;
  scores: Record<string, number>;
}

export type MajorityAction = { type: 'answer'; answer: Choice; predict: Choice };
