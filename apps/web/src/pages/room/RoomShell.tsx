import { normalizeRoomCode } from '@minigamehub/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useParty } from '../../lib/party';
import { getProfile } from '../../lib/storage';
import { GameView } from './GameView';
import { Lobby } from './Lobby';
import { Results } from './Results';

/**
 * /room/:code - one component, three views driven by the party phase. The URL follows the phase
 * (#/room/ABCDE -> /play -> /results) so reload/back behave sensibly.
 */
export function RoomShell() {
  const { code: rawCode } = useParams();
  const code = normalizeRoomCode(rawCode) ?? '';
  const nav = useNavigate();
  const loc = useLocation();
  const p = useParty();
  const [joinError, setJoinError] = useState<string | null>(null);
  const attempted = useRef<string | null>(null);
  const preselected = useRef(false);

  // Connect when arriving by URL (invite link, reload) without an active connection.
  useEffect(() => {
    if (!code) return;
    const needsJoin = p.status === 'idle' || (p.party && p.party.code !== code && p.status === 'connected');
    if (!needsJoin || attempted.current === code + p.status) return;
    attempted.current = code + p.status;
    if (!getProfile().nickname) {
      nav(`/join/${code}`, { replace: true });
      return;
    }
    setJoinError(null);
    p.join(code).catch((e: Error) => setJoinError(e.message));
  }, [code, p, nav]);

  // Quick-start: the creator arrives with a game preselected.
  useEffect(() => {
    const game = (loc.state as { game?: string | null } | null)?.game;
    if (game && p.isHost && p.party && p.party.phase === 'lobby' && !p.party.selectedGameId && !preselected.current) {
      preselected.current = true;
      p.selectGame(game);
    }
  }, [loc.state, p]);

  const phase = p.party?.phase;
  const wanted = phase === 'playing' ? 'play' : phase === 'results' ? 'results' : '';
  useEffect(() => {
    if (!code || !phase) return;
    const target = `/room/${code}${wanted ? `/${wanted}` : ''}`;
    if (loc.pathname !== target) nav(target, { replace: true, state: loc.state });
  }, [code, phase, wanted, loc.pathname, loc.state, nav]);

  if (!code) return <Notice title="That invite link looks wrong" body="Room codes have 5 letters and numbers. Ask your host to send it again." />;
  if (p.status === 'closed') {
    return (
      <Notice title="You left this party" body={p.closedReason ?? 'The connection ended.'}>
        <Link to={`/join/${code}`} className="btn btn-soft">Try joining again</Link>
        <Link to="/" className="btn btn-primary">Back home</Link>
      </Notice>
    );
  }
  if (joinError && !p.party) {
    return (
      <Notice title="Could not join this party" body={joinError}>
        <button
          type="button"
          className="btn btn-soft"
          onClick={() => {
            attempted.current = null;
            setJoinError(null);
            p.join(code).catch((e: Error) => setJoinError(e.message));
          }}
        >
          Try again
        </button>
        <Link to="/play" className="btn btn-primary">Create your own room</Link>
      </Notice>
    );
  }
  if (!p.party) return <div className="px-4 py-24 text-center text-mist" role="status" aria-live="polite">Joining party {code}…</div>;

  if (p.party.phase === 'playing') return <GameView />;
  if (p.party.phase === 'results') return <Results />;
  return <Lobby />;
}

function Notice({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-4xl font-extrabold">{title}</h1>
      <p className="mt-3 text-mist" role="alert">{body}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">{children ?? <Link to="/" className="btn btn-primary">Back home</Link>}</div>
    </div>
  );
}
