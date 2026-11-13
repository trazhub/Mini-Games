import type { AvatarId } from '@minigamehub/shared';
import type { ReactNode } from 'react';

/** Original avatar set: each is a flat character on a coloured disc (48x48 viewBox). */
const ART: Record<AvatarId, { bg: string; node: ReactNode }> = {
  comet: {
    bg: '#2a2f6b',
    node: (
      <>
        <path d="M6 38 Q22 30 30 20" stroke="#8b7cff" strokeWidth="5" strokeLinecap="round" fill="none" opacity=".55" />
        <path d="M10 40 Q24 34 31 24" stroke="#c7bfff" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".7" />
        <circle cx="32" cy="18" r="9" fill="#ffb547" />
        <circle cx="29.5" cy="16.5" r="1.6" fill="#0b1226" />
        <circle cx="35" cy="16.5" r="1.6" fill="#0b1226" />
        <path d="M29 21 Q32 23.5 35 21" stroke="#0b1226" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  sprout: {
    bg: '#14574a',
    node: (
      <>
        <path d="M24 40 V24" stroke="#c9ffe9" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M24 26 Q12 24 11 13 Q23 13 24 26Z" fill="#3ddbb0" />
        <path d="M24 28 Q36 26 37 15 Q25 15 24 28Z" fill="#7af0cf" />
        <circle cx="21" cy="36" r="1.5" fill="#0b1226" />
        <circle cx="27" cy="36" r="1.5" fill="#0b1226" />
      </>
    ),
  },
  pixel: {
    bg: '#5a2d6e',
    node: (
      <>
        {[
          [14, 14],
          [26, 14],
          [14, 26],
          [20, 32],
          [26, 26],
        ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="8" height="8" fill={i < 2 ? '#fff' : '#ff9ed2'} />
        ))}
        <rect x="14" y="14" width="8" height="8" fill="#fff" />
        <rect x="14" y="14" width="4" height="4" fill="#0b1226" />
        <rect x="26" y="14" width="4" height="4" fill="#0b1226" />
      </>
    ),
  },
  moon: {
    bg: '#233a73',
    node: (
      <>
        <path d="M30 10 A15 15 0 1 0 38 30 A12 12 0 1 1 30 10Z" fill="#ffe7a3" />
        <circle cx="18" cy="24" r="1.5" fill="#0b1226" />
        <circle cx="22" cy="31" r="1.5" fill="#0b1226" />
        <circle cx="37" cy="12" r="1.3" fill="#fff" />
        <circle cx="12" cy="12" r="1" fill="#fff" />
      </>
    ),
  },
  bolt: {
    bg: '#6b3a0e',
    node: (
      <>
        <path d="M27 7 L13 27 H23 L20 41 L35 19 H25 Z" fill="#ffd166" stroke="#ffb547" strokeWidth="1.5" strokeLinejoin="round" />
      </>
    ),
  },
  blob: {
    bg: '#0d5c63',
    node: (
      <>
        <path d="M24 9 C35 8 41 17 38 27 C36 37 28 41 20 39 C11 37 7 28 10 20 C12 13 17 9 24 9Z" fill="#5ee6e0" />
        <circle cx="19" cy="23" r="3.6" fill="#fff" />
        <circle cx="29" cy="23" r="3.6" fill="#fff" />
        <circle cx="20" cy="24" r="1.7" fill="#0b1226" />
        <circle cx="30" cy="24" r="1.7" fill="#0b1226" />
        <path d="M19 31 Q24 35 29 31" stroke="#0b1226" strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  ghost: {
    bg: '#3b3f6e',
    node: (
      <>
        <path d="M12 40 V22 A12 12 0 0 1 36 22 V40 L31 36 L26.5 40 L22 36 L17 40Z" fill="#f0f2ff" />
        <circle cx="19" cy="23" r="2.2" fill="#0b1226" />
        <circle cx="29" cy="23" r="2.2" fill="#0b1226" />
        <ellipse cx="24" cy="29" rx="2.5" ry="3" fill="#0b1226" />
      </>
    ),
  },
  star: {
    bg: '#7a2f4e',
    node: (
      <>
        <path d="M24 6 L29 18 L42 19 L32 27.5 L35.5 40 L24 33 L12.5 40 L16 27.5 L6 19 L19 18Z" fill="#ffb3c9" stroke="#ff6b9a" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="20.5" cy="23" r="1.6" fill="#0b1226" />
        <circle cx="27.5" cy="23" r="1.6" fill="#0b1226" />
      </>
    ),
  },
  crown: {
    bg: '#5d4b0f',
    node: (
      <>
        <path d="M9 34 L11 16 L19 25 L24 12 L29 25 L37 16 L39 34Z" fill="#ffd34d" stroke="#ffb547" strokeWidth="1.5" strokeLinejoin="round" />
        <rect x="9" y="34" width="30" height="5" rx="2" fill="#ffb547" />
        <circle cx="24" cy="29" r="2" fill="#ff6b5e" />
      </>
    ),
  },
  fox: {
    bg: '#7a3414',
    node: (
      <>
        <path d="M8 10 L19 17 H29 L40 10 L39 28 C37 37 30 41 24 41 C18 41 11 37 9 28Z" fill="#ff8a3d" />
        <path d="M16 30 Q24 41 32 30 Q24 34 16 30Z" fill="#fff4e6" />
        <circle cx="18" cy="25" r="1.8" fill="#0b1226" />
        <circle cx="30" cy="25" r="1.8" fill="#0b1226" />
        <circle cx="24" cy="32" r="1.8" fill="#0b1226" />
      </>
    ),
  },
  robot: {
    bg: '#2f4a6b',
    node: (
      <>
        <line x1="24" y1="8" x2="24" y2="14" stroke="#9fd0ff" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="24" cy="8" r="2.5" fill="#ff6b5e" />
        <rect x="11" y="14" width="26" height="22" rx="6" fill="#bfe0ff" />
        <rect x="15" y="20" width="7" height="6" rx="2" fill="#0b1226" />
        <rect x="26" y="20" width="7" height="6" rx="2" fill="#0b1226" />
        <rect x="18" y="30" width="12" height="2.5" rx="1.2" fill="#0b1226" />
      </>
    ),
  },
  gem: {
    bg: '#4a2a7a',
    node: (
      <>
        <path d="M13 17 L19 10 H29 L35 17 L24 39Z" fill="#b69cff" stroke="#8b7cff" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M13 17 H35 M19 10 L24 17 L29 10 M24 17 L24 39" stroke="#e5dcff" strokeWidth="1.3" fill="none" />
      </>
    ),
  },
};

export function Avatar({ id, size = 44, className = '', title }: { id: AvatarId; size?: number; className?: string; title?: string }) {
  const art = ART[id] ?? ART.comet;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={`shrink-0 rounded-full ${className}`}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <circle cx="24" cy="24" r="24" fill={art.bg} />
      {art.node}
    </svg>
  );
}
