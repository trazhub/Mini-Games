import type { AvatarId } from '@minigamehub/shared';

/**
 * Pixel-art avatars: each is a 9x9 sprite on a square tile. Letters index the sprite's own palette and
 * '.' is transparent. The ids are fixed by the shared protocol; only the artwork changes.
 */
interface Sprite {
  bg: string;
  pal: Record<string, string>;
  rows: string[];
}

const ART: Record<AvatarId, Sprite> = {
  comet: {
    bg: '#1e2a55',
    pal: { a: '#ffb12e', w: '#fff1c9', t: '#ff7a3d', u: '#a8432a' },
    rows: ['......aaa', '.....awaa', 'u...aaaaa', '.t..aaaa.', '..t.aaa..', '...t.a...', '..u.t....', '.u.......', '.........'],
  },
  sprout: {
    bg: '#12463b',
    pal: { g: '#6ee06a', d: '#2f9a45', s: '#8a5a2b' },
    rows: ['.ggg.ggg.', 'ggggdgggg', '.gggdggg.', '....d....', '....d....', '....d....', '..sssss..', '.sssssss.', '.........'],
  },
  pixel: {
    bg: '#3d2358',
    pal: { a: '#7dffb0' },
    rows: ['.........', '..a...a..', '...a.a...', '..aaaaa..', '.aa.a.aa.', 'aaaaaaaaa', 'a.aaaaa.a', 'a.a...a.a', '...a.a...'],
  },
  moon: {
    bg: '#1c2a52',
    pal: { a: '#f0e6cf', y: '#ffb12e' },
    rows: ['..aaaaa..', '.aaaa....', 'aaaa...y.', 'aaaa.....', 'aaaa.....', 'aaaa.y...', '.aaaa....', '..aaaaa..', '.........'],
  },
  bolt: {
    bg: '#4a2d0c',
    pal: { a: '#ffd23f' },
    rows: ['....aaaaa', '...aaaaa.', '..aaaaa..', '.aaaaaaaa', '....aaa..', '...aaa...', '..aaa....', '.aa......', '.a.......'],
  },
  blob: {
    bg: '#0b4a50',
    pal: { a: '#3fe0d0', w: '#ffffff', k: '#0b2a30' },
    rows: ['.........', '...aaa...', '..aaaaa..', '.aaaaaaa.', '.awkawka.', 'aaaaaaaaa', 'aaaaaaaaa', 'aaaaaaaaa', '.aaaaaaa.'],
  },
  ghost: {
    bg: '#2d2f63',
    pal: { a: '#ff79c6', w: '#ffffff', k: '#2a3bb0' },
    rows: ['..aaaaa..', '.aaaaaaa.', 'aaaaaaaaa', 'awwaaawwa', 'awkaaawka', 'aaaaaaaaa', 'aaaaaaaaa', 'aaaaaaaaa', 'aa.aaa.aa'],
  },
  star: {
    bg: '#5a2340',
    pal: { a: '#ffd23f', w: '#fff7d6' },
    rows: ['....a....', '....a....', '...awa...', 'aaaaaaaaa', '.aaaaaaa.', '..aaaaa..', '..aaaaa..', '.aaa.aaa.', '.aa...aa.'],
  },
  crown: {
    bg: '#40380d',
    pal: { a: '#ffb12e', b: '#c77d00', r: '#ff5470' },
    rows: ['.........', 'a...a...a', 'aa..a..aa', 'aaa.a.aaa', 'aaaaaaaaa', 'aaaaraaaa', 'aaaaaaaaa', 'bbbbbbbbb', '.........'],
  },
  fox: {
    bg: '#5a2a10',
    pal: { o: '#ff8a3d', w: '#fff1e0', k: '#2a1408' },
    rows: ['oo.....oo', 'ooo...ooo', 'ooooooooo', 'okoooooko', 'ooooooooo', '.owwkwwo.', '..wwwww..', '...www...', '.........'],
  },
  robot: {
    bg: '#26405c',
    pal: { a: '#b7c7d9', b: '#4a5a70', r: '#ff5470', y: '#ffd23f' },
    rows: ['....r....', '....b....', '.aaaaaaa.', '.ayyayya.', '.aaaaaaa.', '.abbbbba.', '.aaaaaaa.', '..a...a..', '.bb...bb.'],
  },
  gem: {
    bg: '#3a2160',
    pal: { a: '#b48cff', c: '#e6d6ff', b: '#6b3fd1' },
    rows: ['.........', '..aaaaa..', '.caaaaab.', 'caaaaaaab', '.aaaaaab.', '..aaaab..', '...aab...', '....b....', '.........'],
  },
};

export function Avatar({ id, size = 44, className = '', title }: { id: AvatarId; size?: number; className?: string; title?: string }) {
  const art = ART[id] ?? ART.comet;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 11 11"
      shapeRendering="crispEdges"
      className={`shrink-0 ${className}`}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect width="11" height="11" fill={art.bg} />
      {art.rows.flatMap((row, y) =>
        [...row].map((ch, x) => (ch === '.' ? null : <rect key={`${x}-${y}`} x={x + 1} y={y + 1} width="1" height="1" fill={art.pal[ch] ?? '#fff'} />)),
      )}
    </svg>
  );
}
