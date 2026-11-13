import { useCallback, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { OrbitHero } from '../components/OrbitHero';
import { StartForm } from '../components/StartForm';
import { GAME_BY_ID } from '../games/registry';

/** /play (create or join) and /join/:code (invite links open straight on the join tab). */
export function Play() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const game = params.get('game');
  const [hero, setHero] = useState({ code: code?.toUpperCase() ?? '', mode: (code ? 'join' : 'create') as 'create' | 'join' });
  const onCode = useCallback((c: string, m: 'create' | 'join') => setHero((p) => (p.code === c && p.mode === m ? p : { code: c, mode: m })), []);
  const g = game ? GAME_BY_ID[game] : undefined;
  return (
    <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-[minmax(0,28rem)_1fr]">
      <div>
        <h1 className="text-4xl font-extrabold sm:text-5xl">{code ? "You're invited" : g ? `Play ${g.meta.name}` : 'Create or join a room'}</h1>
        <p className="mt-3 text-mist">
          {code
            ? 'Choose a nickname and avatar, then jump into the party. No account needed.'
            : 'Rooms are private: only people with the code or invite link can enter. You get both after you create one.'}
        </p>
        <div className="mt-6">
          <StartForm initialMode={code ? 'join' : 'create'} initialCode={code ?? ''} game={game} onCodeChange={onCode} />
        </div>
      </div>
      <div className="hidden lg:block">
        <OrbitHero code={hero.code} mode={hero.mode} />
      </div>
    </div>
  );
}
