import { useParty } from '../lib/party';

export function ConnectionBadge({ className = '' }: { className?: string }) {
  const { status, latencyMs } = useParty();
  const map = {
    connected: { dot: 'bg-mint', text: latencyMs !== null ? `Connected · ${latencyMs} ms` : 'Connected' },
    connecting: { dot: 'bg-amber animate-pulse', text: 'Connecting…' },
    reconnecting: { dot: 'bg-coral animate-pulse', text: 'Connection lost - reconnecting…' },
    closed: { dot: 'bg-coral', text: 'Disconnected' },
    idle: { dot: 'bg-mist', text: 'Not connected' },
  } as const;
  const s = map[status];
  return (
    <span className={`connection-badge ${className}`} role="status" data-testid="connection-status" data-status={status}>
      <span className={`size-2 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.text}
    </span>
  );
}
