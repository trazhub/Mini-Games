import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { APP_NAME } from '../lib/config';
import { useParty } from '../lib/party';
import { Toasts } from './Toasts';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="26" fill="none" stroke="#2b3558" strokeWidth="4" />
        <circle cx="32" cy="32" r="15" fill="none" stroke="#3a4670" strokeWidth="4" />
        <circle cx="32" cy="32" r="6" fill="#8b7cff" />
        <circle cx="58" cy="32" r="6" fill="#ffb547" />
        <circle cx="17" cy="32" r="4.5" fill="#3ddbb0" />
        <circle cx="32" cy="6" r="4.5" fill="#ff6b5e" />
      </svg>
      <span className="font-display text-xl font-bold tracking-tight">{APP_NAME}</span>
    </span>
  );
}

const links = [
  { to: '/games', label: 'Games' },
  { to: '/play', label: 'Create or join' },
  { to: '/profile', label: 'Profile' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  const [open, setOpen] = useState(false);
  const { party, status } = useParty();
  const loc = useLocation();
  const inRoom = loc.pathname.startsWith('/room/');
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-xl px-3.5 py-2 text-[0.95rem] font-medium transition ${isActive ? 'bg-hull text-chalk' : 'text-mist hover:bg-hull/70 hover:text-chalk'}`;
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-amber focus:px-3 focus:py-2 focus:text-midnight">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-edge/50 bg-midnight/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" aria-label={`${APP_NAME} home`} className="rounded-xl">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={linkCls}>
                {l.label}
              </NavLink>
            ))}
            {party && status !== 'idle' && !inRoom && (
              <Link to={`/room/${party.code}`} className="btn btn-primary ml-2 min-h-10 py-1.5">
                Back to party {party.code}
              </Link>
            )}
          </nav>
          <button
            type="button"
            className="btn btn-soft min-h-10 px-3 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">Menu</span>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M4 4l12 12M16 4L4 16" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>
        {open && (
          <nav id="mobile-nav" aria-label="Mobile" className="border-t border-edge/50 px-4 pb-4 md:hidden">
            <ul className="mt-2 grid gap-1">
              {links.map((l) => (
                <li key={l.to}>
                  <NavLink to={l.to} className={linkCls} onClick={() => setOpen(false)} style={{ display: 'block' }}>
                    {l.label}
                  </NavLink>
                </li>
              ))}
              {party && status !== 'idle' && !inRoom && (
                <li>
                  <Link to={`/room/${party.code}`} onClick={() => setOpen(false)} className="btn btn-primary mt-1 w-full">
                    Back to party {party.code}
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        )}
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <Toasts />
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-edge/50 bg-slate/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm text-mist">Free party games for friends. No downloads, no account: share a room code and play.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
          <Link className="text-mist hover:text-chalk" to="/games">All games</Link>
          <Link className="text-mist hover:text-chalk" to="/play">Create a room</Link>
          <Link className="text-mist hover:text-chalk" to="/settings">Settings and help</Link>
          <Link className="text-mist hover:text-chalk" to="/profile">Your profile</Link>
        </nav>
      </div>
      <div className="border-t border-edge/40 px-4 py-4 text-center text-xs text-mist/80">
        Guest sessions are temporary. Nicknames are shown to the people in your party and stored only with match results.
      </div>
    </footer>
  );
}
