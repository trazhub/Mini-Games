import { AVATAR_IDS, type AvatarId } from '@minigamehub/shared';
import { Avatar } from './Avatar';

const RINGS: { inset: string; seconds: number; reverse: boolean; avatars: { id: AvatarId; angle: number; size: number }[] }[] = [
  { inset: '30%', seconds: 22, reverse: false, avatars: [{ id: 'comet', angle: 20, size: 44 }, { id: 'fox', angle: 200, size: 44 }] },
  { inset: '16%', seconds: 34, reverse: true, avatars: [{ id: 'robot', angle: 80, size: 50 }, { id: 'ghost', angle: 190, size: 50 }, { id: 'sprout', angle: 300, size: 50 }] },
  { inset: '2%', seconds: 52, reverse: false, avatars: [{ id: 'crown', angle: 40, size: 56 }, { id: 'blob', angle: 150, size: 56 }, { id: 'gem', angle: 255, size: 56 }, { id: 'moon', angle: 330, size: 56 }] },
];

void AVATAR_IDS;

/**
 * The page's one memorable moment: three orbits of avatars around the room code. The centre
 * echoes whatever code is being typed in the join form, so the art doubles as feedback.
 */
export function OrbitHero({ code, mode }: { code: string; mode: 'create' | 'join' }) {
  const slots = Array.from({ length: 5 }, (_, i) => code[i] ?? '');
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[34rem]" aria-hidden="true">
      {RINGS.map((ring, ri) => (
        <div
          key={ri}
          className="absolute rounded-full border border-edge/80"
          style={{ inset: ring.inset, animation: `${ring.reverse ? 'orbit-rev' : 'orbit'} ${ring.seconds}s linear infinite` }}
        >
          {ring.avatars.map((a) => (
            <div key={a.id} className="absolute inset-0" style={{ transform: `rotate(${a.angle}deg)` }}>
              <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                <div style={{ rotate: `${-a.angle}deg`, animation: `${ring.reverse ? 'orbit' : 'orbit-rev'} ${ring.seconds}s linear infinite` }}>
                  <Avatar id={a.id} size={a.size} className="shadow-lift ring-4 ring-midnight" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
      <div className="absolute inset-[38%] flex flex-col items-center justify-center rounded-full bg-slate ring-2 ring-pulse/60" style={{ animation: 'pulse-ring 3.2s ease-out infinite' }}>
        {mode === 'join' ? (
          <div className="flex gap-1">
            {slots.map((c, i) => (
              <span key={i} className={`flex h-8 w-6 items-center justify-center rounded-md font-display text-lg font-extrabold sm:h-9 sm:w-7 ${c ? 'bg-pulse text-midnight' : 'bg-midnight text-mist/60'}`}>
                {c || '·'}
              </span>
            ))}
          </div>
        ) : (
          <span className="font-display text-xl font-extrabold text-chalk sm:text-2xl">Your party</span>
        )}
      </div>
    </div>
  );
}
