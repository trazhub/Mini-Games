export type EchoPhase = 'intro' | 'watch' | 'input' | 'result' | 'done';

export interface EchoPlayerState {
  /** active = still in the game; out = eliminated. */
  status: 'active' | 'out';
  /** Pads entered correctly this round. */
  progress: number;
  /** Completed this round's pattern. */
  done: boolean;
}

export interface EchoRoundResult {
  playerId: string;
  completed: boolean;
  points: number;
}

export interface EchoState {
  phase: EchoPhase;
  round: number;
  maxRounds: number;
  length: number;
  pads: number;
  /** Full pattern - only present while it is being shown (watch) and in the result phase. */
  sequence: number[] | null;
  /** Server epoch ms when the first step lights up. */
  showStartsAt: number;
  stepMs: number;
  /** Server epoch ms when the current phase ends (input: the deadline). */
  endsAt: number;
  players: Record<string, EchoPlayerState>;
  scores: Record<string, number>;
  roundResults: EchoRoundResult[] | null;
}

export type EchoAction = { type: 'pad'; pad: number };
