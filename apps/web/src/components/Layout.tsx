import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { APP_NAME } from '../lib/config';
import { useParty } from '../lib/party';
import { Arrow } from './ArcadeButton';
import { Toasts } from './Toasts';

export function Logo({ className = '' }: { className?: string }) {
  return <span className={`wordmark ${className}`}>
    <svg width="42" height="42" viewBox="0 0 48 48" aria-hidden="true"><path d="M6 4h36v32L30 44H6Z" fill="#f8cf46" stroke="#202724" strokeWidth="2.5" /><path d="M12 25h18m-8-8 8 8-8 8" fill="none" stroke="#202724" strokeWidth="5" /></svg>
    <span>mini<span className="wordmark-dash">—</span><br />games<span className="wordmark-dot">.</span></span>
  </span>;
}

const links = [{ to: '/games', label: 'Games' }, { to: '/play', label: 'Create or join' }, { to: '/profile', label: 'Profile' }, { to: '/settings', label: 'Settings' }];

export function Layout() {
  const [open, setOpen] = useState(false);
  const { party, status } = useParty();
  const loc = useLocation();
  const inRoom = loc.pathname.startsWith('/room/');
  const linkCls = ({ isActive }: { isActive: boolean }) => `nav-link ${isActive ? 'nav-link-active' : ''}`;
  return <div className={`site-shell ${inRoom ? 'in-room' : ''}`}>
    <a href="#main" className="skip-link" onClick={e => { e.preventDefault(); const main = document.getElementById('main'); main?.focus({ preventScroll: true }); main?.scrollIntoView(); }}>Skip to content</a>
    <header className="arcade-header">
      <div className="arcade-nav page-width">
        <Link to="/" aria-label={`${APP_NAME} home`}><Logo /></Link>
        <nav aria-label="Main" className="desktop-nav">{links.map(l => <NavLink key={l.to} to={l.to} className={linkCls}>{l.label}</NavLink>)}</nav>
        <Link to={party && status !== 'idle' ? `/room/${party.code}` : '/play'} className="btn btn-ink nav-party">{party && status !== 'idle' ? `Back to ${party.code}` : 'Let’s play'}<Arrow /></Link>
        <button type="button" className="btn btn-soft mobile-menu" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(v => !v)}>
          <span className="sr-only">Menu</span><svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">{open ? <path d="m5 5 12 12M17 5 5 17" /> : <path d="M3 6h16M3 11h16M3 16h16" />}</svg>
        </button>
      </div>
      {open && <nav id="mobile-nav" aria-label="Mobile" className="mobile-navigation page-width">
        {links.map(l => <NavLink key={l.to} to={l.to} className={linkCls} onClick={() => setOpen(false)}>{l.label}<Arrow /></NavLink>)}
        {party && status !== 'idle' && !inRoom && <Link to={`/room/${party.code}`} onClick={() => setOpen(false)} className="btn btn-primary">Back to party {party.code}</Link>}
      </nav>}
    </header>
    <main id="main" tabIndex={-1} className="site-main"><Outlet /></main>
    <footer className="arcade-footer"><div className="page-width footer-top"><div><Logo /><p>Good friends. Questionable strategies.<br />One more round.</p></div>
      <nav aria-label="Footer"><Link to="/games">Find your next game <Arrow /></Link><Link to="/play">Make a little room <Arrow /></Link><Link to="/settings">Settings and help <Arrow /></Link><Link to="/profile">Your player profile <Arrow /></Link><Link to="/legal">Legal notes <Arrow /></Link></nav>
    </div><div className="page-width footer-bottom"><span>Free to play. Better together.</span><span>Guest sessions are temporary. Your nickname is visible to your party.</span></div></footer>
    <Toasts />
  </div>;
}
