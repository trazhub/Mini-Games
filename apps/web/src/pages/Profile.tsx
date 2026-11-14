import { LIMITS, sanitizeNickname, type AvatarId } from '@minigamehub/shared';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { RecoveryCard } from '../components/RecoveryCard';
import { AvatarPicker } from '../components/AvatarPicker';
import { ensureSession, fetchMyStats } from '../lib/api';
import { useParty } from '../lib/party';
import { getProfile, getSessionStats, saveProfile } from '../lib/storage';

export function Profile() {
  const { party, me, updateProfile, leave } = useParty();
  const [initial] = useState(getProfile);
  const [nickname, setNickname] = useState(initial.nickname);
  const [avatar, setAvatar] = useState<AvatarId>(initial.avatar);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remote, setRemote] = useState<{ gamesPlayed: number; wins: number; totalScore: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const stats = getSessionStats();
  const id = useId();

  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await ensureSession();
        const r = await fetchMyStats(s.token);
        if (cancelled || !r) return;
        setPersisted(r.persisted);
        setRemote(r.stats);
      } catch {
        /* offline: local stats still shown */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionKey]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const clean = sanitizeNickname(nickname);
    if (!clean) return setError(`Nickname must be ${LIMITS.NICK_MIN}-${LIMITS.NICK_MAX} characters.`);
    setError(null);
    saveProfile({ nickname: clean, avatar });
    setNickname(clean);
    if (party && me) updateProfile(clean, avatar);
    setSaved('Saved.' + (party ? ' Your party sees the change now.' : ''));
    setTimeout(() => setSaved(null), 3000);
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-[1.1fr_1fr]">
      <div>
        <h1 className="text-4xl font-extrabold sm:text-5xl">Guest profile</h1>
        <form onSubmit={submit} className="panel mt-6 space-y-5 p-6" noValidate>
          <div className="flex items-center gap-4">
            <Avatar id={avatar} size={72} title="Current avatar" />
            <div className="min-w-0 flex-1">
              <label htmlFor={id} className="mb-1.5 block text-sm font-medium">Nickname</label>
              <input id={id} className="field" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={LIMITS.NICK_MAX + 8} placeholder="Your nickname" />
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium">Avatar</span>
            <AvatarPicker value={avatar} onChange={setAvatar} />
          </div>
          {error && <p role="alert" className="text-sm text-coral">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" className="btn btn-primary">Save profile</button>
            <span role="status" className="text-sm text-mint">{saved}</span>
          </div>
        </form>
        <p className="mt-3 text-sm text-mist">You are a guest. Your nickname and avatar live in this browser. The first tab you open keeps your player between visits; extra tabs are separate players that end when closed. Nicknames are never used to identify you to the server.</p>
      </div>

      <div className="space-y-6">
        <RecoveryCard
          onRestored={() => {
            if (party) leave(); // the open party belongs to the old guest
            setRemote(null);
            setSessionKey((k) => k + 1);
          }}
        />
        <section className="panel p-6" aria-labelledby="sess">
          <h2 id="sess" className="text-xl font-bold">This session</h2>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              ['Matches', stats.matches],
              ['Wins', stats.wins],
              ['Party points', stats.partyPoints],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-2xl bg-midnight p-3 ring-1 ring-edge">
                <dd className="font-display text-3xl font-extrabold">{v}</dd>
                <dt className="text-xs text-mist">{k}</dt>
              </div>
            ))}
          </dl>
          {stats.history.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm">
              {stats.history.map((h) => (
                <li key={h.at} className="flex justify-between rounded-xl bg-midnight px-3 py-2 ring-1 ring-edge">
                  <span>{h.gameName}</span>
                  <span className="text-mist">#{h.rank} · {h.score} pts</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-mist">No matches yet. <Link className="font-semibold text-chalk underline" to="/play">Create a room</Link> to play one.</p>
          )}
        </section>
        {persisted && remote && (
          <section className="panel p-6" aria-labelledby="all">
            <h2 id="all" className="text-xl font-bold">All matches on this guest id</h2>
            <p className="mt-2 text-sm text-mist">{remote.gamesPlayed} played, {remote.wins} won, {remote.totalScore} total points.</p>
          </section>
        )}
      </div>
    </div>
  );
}
