import type { PlayerPublic } from '@minigamehub/shared';
import { Avatar } from './Avatar';

export function GameHUD({ players, me }: { players: (PlayerPublic & { score: number })[]; me: string }) {
  return <aside className="panel game-hud p-4" aria-labelledby="live-scores"><div className="flex items-baseline justify-between"><h2 id="live-scores" className="text-lg font-bold">Live scores</h2><span className="text-[10px] text-mist">This round</span></div><ol className="mt-4 space-y-2" data-testid="live-scores">{players.map((pl, i) => <li key={pl.id} className={`flex items-center gap-2.5 bg-midnight px-2.5 py-3 ring-1 ${pl.id === me ? 'ring-pulse' : 'ring-edge'} ${pl.connected ? '' : 'opacity-50'}`}><span className="w-4 text-center text-xs text-mist">{i + 1}</span><Avatar id={pl.avatar} size={30} /><span className="min-w-0 flex-1 truncate text-sm font-medium">{pl.name}{!pl.connected && <span className="block text-[10px] text-coral">Offline</span>}</span><span className="font-display text-xl font-bold tabular-nums">{pl.score}</span></li>)}</ol><p className="mt-4 border-t border-edge pt-3 text-[10px] text-mist">{players.length} players in the match</p></aside>;
}
