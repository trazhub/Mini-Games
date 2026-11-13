import { CATEGORY_LABELS } from '@minigamehub/shared';
import { Link } from 'react-router-dom';
import { playerRange, type ClientGame } from '../games/registry';
import { GameArt } from './GameArt';

export function GameCard({ game, detailed = false }: { game: ClientGame; detailed?: boolean }) {
  const { meta } = game;
  return (
    <article className="group flex flex-col overflow-hidden rounded-[1.75rem] bg-slate ring-1 ring-edge/70 transition hover:-translate-y-0.5 hover:ring-2" style={{ ['--accent' as string]: meta.accent }} data-testid={`game-${meta.id}`}>
      <div className="relative">
        <GameArt id={meta.id} className="aspect-[16/10] w-full" />
        <span className="absolute left-3 top-3 rounded-full bg-midnight/80 px-3 py-1 text-xs font-semibold backdrop-blur" style={{ color: meta.accent }}>
          {CATEGORY_LABELS[meta.category]}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="text-2xl font-extrabold">{meta.name}</h3>
          <p className="mt-1 text-[0.95rem] text-mist">{meta.tagline}</p>
        </div>
        <ul className="flex flex-wrap gap-2 text-xs text-chalk/90">
          <li className="rounded-full bg-hull px-2.5 py-1 ring-1 ring-edge">{playerRange(meta)}</li>
          <li className="rounded-full bg-hull px-2.5 py-1 ring-1 ring-edge">{meta.durationMinutes[0]}-{meta.durationMinutes[1]} min</li>
          <li className="rounded-full bg-hull px-2.5 py-1 ring-1 ring-edge">{meta.mobileFriendly ? 'Works on phones' : 'Desktop only'}</li>
        </ul>
        {detailed && (
          <div className="space-y-4 text-sm text-mist">
            <p>{meta.description}</p>
            <div>
              <h4 className="mb-1 font-semibold text-chalk">How it works</h4>
              <ul className="list-disc space-y-1 pl-5">
                {meta.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <h4 className="mb-1 font-semibold text-chalk">Keyboard</h4>
                <ul className="space-y-1">{meta.controls.keyboard.map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
              <div>
                <h4 className="mb-1 font-semibold text-chalk">Touch</h4>
                <ul className="space-y-1">{meta.controls.touch.map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
            </div>
          </div>
        )}
        <div className="mt-auto pt-1">
          <Link to={`/play?game=${meta.id}`} className="btn btn-soft w-full group-hover:bg-[var(--accent)] group-hover:text-midnight group-hover:ring-transparent">
            Play {meta.name}
          </Link>
        </div>
      </div>
    </article>
  );
}
