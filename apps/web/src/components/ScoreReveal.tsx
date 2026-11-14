import type { MatchRanking } from '@minigamehub/shared';
import type { CSSProperties } from 'react';
import { Avatar } from './Avatar';

export function ScoreReveal({ ranking, isMe, index }: { ranking: MatchRanking; isMe: boolean; index: number }) {
  return <li className={`score-reveal ${isMe ? 'is-you' : ''}`} style={{ '--rank': index } as CSSProperties}><span className="score-rank">{ranking.rank}</span><Avatar id={ranking.avatar} size={40} /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{ranking.name}{isMe && <span className="ml-1 text-xs font-normal text-mist">(you)</span>}</span><span className="score-party text-xs text-mint">+{ranking.partyPoints} party</span><span className="score-value">{ranking.score}</span></li>;
}
