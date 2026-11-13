import type { GameMeta } from '@minigamehub/shared';

export const laneRunnerMeta: GameMeta = {
  id: 'lane-runner',
  name: 'Lane Runner',
  tagline: 'Three lanes. One run. How far can you go?',
  description:
    'Sprint down a three-lane track, swerve around obstacles and grab coins while the pace keeps climbing. Every run is the same course for everyone in the room, and your score is verified by the server.',
  category: 'arcade',
  kind: 'arcade',
  solo: true,
  tags: ['arcade', 'reaction'],
  minPlayers: 1,
  maxPlayers: 8,
  durationMinutes: [1, 2],
  controls: {
    keyboard: ['Left / A: move one lane left', 'Right / D: move one lane right'],
    touch: ['Tap the left or right side of the screen'],
  },
  rules: [
    'Everyone runs the same course, generated from one shared seed.',
    'Your score is the distance you cover plus 25 for every coin.',
    'Hit an obstacle and your run is over; a run lasts at most 90 seconds.',
    'The server replays your recorded inputs to verify your score.',
  ],
  mobileFriendly: true,
  accent: '#3ee0a0',
};
