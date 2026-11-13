import { CATEGORY_LABELS, GAME_CATEGORIES } from '@minigamehub/shared';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { GameCard } from '../components/GameCard';
import { OrbitHero } from '../components/OrbitHero';
import { StartForm } from '../components/StartForm';
import { GAMES } from '../games/registry';
import { APP_NAME } from '../lib/config';

export function Home() {
  const [heroCode, setHeroCode] = useState({ code: '', mode: 'create' as 'create' | 'join' });
  const onCode = useCallback((code: string, mode: 'create' | 'join') => setHeroCode((p) => (p.code === code && p.mode === mode ? p : { code, mode })), []);
  const cats = GAME_CATEGORIES.map((c) => ({ c, n: GAMES.filter((g) => g.meta.tags.includes(c)).length })).filter((x) => x.n > 0);

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-6 pt-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16 lg:pt-16">
        <div className="order-2 lg:order-1">
          <h1 className="text-[2.6rem] font-extrabold sm:text-5xl lg:text-[3.4rem]">Pick a game, share a code, play together.</h1>
          <p className="mt-4 max-w-md text-lg text-mist">
            {APP_NAME} is a free arcade of short multiplayer games for 2 to 12 friends. Nothing to install and no account to make.
          </p>
          <div className="mt-7">
            <StartForm compact onCodeChange={onCode} />
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <OrbitHero code={heroCode.code} mode={heroCode.mode} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-14" aria-labelledby="featured">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="featured" className="text-3xl font-extrabold sm:text-4xl">Start with a game</h2>
            <p className="mt-2 max-w-xl text-mist">Choose one and we open a private room with it already selected. Each game takes one to five minutes.</p>
          </div>
          <Link to="/games" className="btn btn-ghost">See rules and controls</Link>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {GAMES.map((g) => (
            <GameCard key={g.meta.id} game={g} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="cats">
        <h2 id="cats" className="text-3xl font-extrabold">Browse by mood</h2>
        <ul className="mt-5 flex flex-wrap gap-3">
          {cats.map(({ c, n }) => (
            <li key={c}>
              <Link to={`/games?cat=${c}`} className="btn btn-soft">
                {CATEGORY_LABELS[c]}
                <span className="rounded-full bg-midnight px-2 py-0.5 text-xs text-mist">{n}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-mist">Puzzle and co-op games are on the roadmap, so they are not listed yet.</p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="how">
        <h2 id="how" className="text-3xl font-extrabold">How a party works</h2>
        <ol className="mt-6 grid gap-5 md:grid-cols-3">
          {[
            { t: 'Make your guest profile', d: 'Type a nickname and pick an avatar. A temporary guest session is created for you automatically.' },
            { t: 'Invite your friends', d: 'Send the 5-letter room code or the invite link. Friends join from any phone or computer.' },
            { t: 'Ready up and play', d: 'Everyone taps ready, the host starts. When a game ends your party stays together for the next one.' },
          ].map((s, i) => (
            <li key={s.t} className="panel flex gap-4 p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-pulse font-display text-lg font-extrabold text-midnight">{i + 1}</span>
              <div>
                <h3 className="text-lg font-bold">{s.t}</h3>
                <p className="mt-1 text-[0.95rem] text-mist">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
