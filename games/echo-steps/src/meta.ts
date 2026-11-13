import type { GameMeta } from '@minigamehub/shared';

export const echoStepsMeta: GameMeta = {
  id: 'echo-steps',
  name: 'Echo Steps',
  tagline: 'Watch the pattern. Echo it back. Don’t blink.',
  description:
    'A glowing pattern plays for everyone at once. Repeat it perfectly before time runs out - each round adds one more step. One wrong pad and you’re out; the last echo standing wins.',
  category: 'reaction',
  kind: 'together',
  solo: false,
  tags: ['reaction', 'memory'],
  minPlayers: 2,
  maxPlayers: 10,
  durationMinutes: [2, 5],
  controls: {
    keyboard: ['Arrow keys or WASD: pads (up, right, down, left)', '1 2 3 4: pads in order'],
    touch: ['Tap the glowing pads'],
  },
  rules: [
    'The server plays the same pattern to everyone, then says GO.',
    'Repeat the pattern in order. Every round adds a step.',
    'A wrong pad or running out of time eliminates you.',
    'Completing a round scores more for longer patterns, plus a small speed bonus.',
    'Last player standing earns a survivor bonus.',
  ],
  mobileFriendly: true,
  accent: '#3ddbb0',
};
