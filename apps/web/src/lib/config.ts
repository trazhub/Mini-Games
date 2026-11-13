/** Public, build-time configuration. Never put secrets here: it ships to every browser. */
function resolveApiUrl(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, '');
  // Dev convenience: reach the dev server from phones on the LAN too.
  return `${window.location.protocol}//${window.location.hostname}:2567`;
}

export const API_URL = resolveApiUrl();
export const APP_NAME = (import.meta.env.VITE_APP_NAME as string | undefined) || 'MiniGameHub';

/** Invite link for a room, correct under any base path (hash routing). */
export function inviteUrl(code: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/join/${code}`;
}
