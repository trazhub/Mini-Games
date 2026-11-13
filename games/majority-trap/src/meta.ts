import type { GameMeta } from '@minigamehub/shared';

export const majorityTrapMeta: GameMeta = {
  id: 'majority-trap',
  name: 'Majority Trap',
  tagline: 'Pick a side. Then outguess the crowd.',
  description:
    'Every round asks a two-way question. Secretly choose your answer and predict which answer the group will pick LESS. Be right about the crowd - or be the lone wolf - to score.',
  category: 'party',
  tags: ['party', 'social'],
  minPlayers: 3,
  maxPlayers: 12,
  durationMinutes: [3, 5],
  controls: {
    keyboard: ['A / B: choose your answer', 'Shift + A / B: choose your prediction', 'Enter: lock in'],
    touch: ['Tap an answer card', 'Tap the prediction toggle', 'Tap Lock In'],
  },
  rules: [
    'Each round has a question with two answers (A and B).',
    'Pick the answer you prefer AND predict which answer will be less popular.',
    'Correct prediction: +100. Your own answer ended up in the minority: +50.',
    'Tied vote: nobody is the minority, every prediction scores +50.',
    'Answers stay secret until the reveal. Answers are locked once submitted.',
  ],
  mobileFriendly: true,
  accent: '#ff6b5e',
};
