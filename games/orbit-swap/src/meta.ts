import type { GameMeta } from '@minigamehub/shared';

export const orbitSwapMeta: GameMeta = {
  id: 'orbit-swap',
  name: 'Orbit Swap',
  tagline: 'Hop between orbits. Grab stars. Dodge the rocks.',
  description:
    'Everyone circles the same planet on three orbital lanes. Swap lanes to collect stars, flip direction to dodge drifting asteroid arcs, and out-score your friends before the clock runs out.',
  category: 'arcade',
  tags: ['arcade', 'reaction'],
  minPlayers: 2,
  maxPlayers: 8,
  durationMinutes: [1, 2],
  controls: {
    keyboard: ['Up / W: outer lane', 'Down / S: inner lane', 'Space / Left / Right / A / D: reverse direction'],
    touch: ['Tap the outer / inner buttons', 'Tap the reverse button'],
  },
  rules: [
    'Stars give +10 (golden stars +30).',
    'Hitting an asteroid costs 10 points and gives you a moment of invulnerability.',
    'Inner lanes are faster, outer lanes are slower.',
    'Highest score after 75 seconds wins. All movement and scoring is decided by the server.',
  ],
  mobileFriendly: true,
  accent: '#ffb547',
};
