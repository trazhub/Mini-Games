import { useEffect, useRef, useState } from 'react';
import { inviteUrl } from '../lib/config';
import { ArcadeButton } from './ArcadeButton';
import { ConnectionBadge } from './ConnectionBadge';

export function RoomCodeDisplay({ code, onLeave }: { code: string; onLeave: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy(key: string, value: string) {
    let success = false;
    try { await navigator.clipboard.writeText(value); success = true; }
    catch {
      const previous = document.activeElement;
      const area = document.createElement('textarea');
      area.value = value; area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.appendChild(area); area.select();
      try { success = document.execCommand('copy'); } catch { success = false; }
      finally { area.remove(); if (previous instanceof HTMLElement) previous.focus(); }
    }
    setError(!success); setCopied(success ? key : null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setCopied(null); setError(false); }, 2500);
  }
  return <section className="room-ticket" aria-label="Your private room">
    <div className="room-ticket-code"><p>Room code · invite your people</p><p data-testid="room-code" aria-label={`Room code ${code.split('').join(' ')}`}>{code}</p></div>
    <div><div className="room-ticket-actions"><ArcadeButton onClick={() => copy('link', inviteUrl(code))} data-testid="copy-invite">{copied === 'link' ? 'Link copied ✓' : 'Copy invite link'}</ArcadeButton><ArcadeButton variant="soft" onClick={() => copy('code', code)}>{copied === 'code' ? 'Code copied ✓' : 'Copy code'}</ArcadeButton><ArcadeButton variant="ghost" onClick={onLeave}>Leave party</ArcadeButton></div>
      <p className="sr-only" role="status">{copied ? `${copied === 'link' ? 'Invite link' : 'Room code'} copied.` : ''}</p>{error && <p role="alert" className="mt-2 text-xs">Copy unavailable. Share the room code above.</p>}
    </div><ConnectionBadge />
  </section>;
}
