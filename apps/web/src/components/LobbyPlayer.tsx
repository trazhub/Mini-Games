import type { PlayerPublic } from '@minigamehub/shared';
import { useState } from 'react';
import { Avatar } from './Avatar';

export function LobbyPlayer({ player, isMe, canRemove, confirm, onRemove }: { player: PlayerPublic; isMe: boolean; canRemove: boolean; confirm: boolean; onRemove: () => void }) {
  const [reaction, setReaction] = useState(0);
  const status = !player.connected ? 'Offline · reconnecting' : player.isHost ? 'Host · ready to roll' : player.ready ? 'Ready to play ✓' : 'Getting ready';
  return <li className={`lobby-player ${player.isHost ? 'is-host' : ''} ${player.ready ? 'is-ready' : ''} ${!player.connected ? 'is-offline' : ''}`}>
    {player.isHost && <svg className="host-crown" width="22" height="18" viewBox="0 0 24 20" aria-label="Host" role="img"><path d="m2 5 5 5 5-8 5 8 5-5-2 12H4Z" fill="#f8cf46" stroke="#202724" strokeWidth="1.5" /></svg>}
    <button type="button" className={`avatar-reaction ${reaction ? 'avatar-reacting' : ''}`} aria-label={`Make ${player.name} wave`} onClick={() => setReaction(n => n + 1)}><Avatar key={reaction} id={player.avatar} size={60} /></button>
    <p className="lobby-player-name">{player.name}{isMe && <span className="font-normal text-mist"> (you)</span>}</p>
    <p className="lobby-player-points">{player.points} points · {player.wins} {player.wins === 1 ? 'win' : 'wins'}</p>
    <span className="player-state">{status}</span>
    {canRemove && <button type="button" className="player-remove" aria-label={confirm ? undefined : `Remove ${player.name} from the party`} onClick={onRemove}>{confirm ? 'Confirm remove' : 'Remove'}</button>}
  </li>;
}
