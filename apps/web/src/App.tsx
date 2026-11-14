import { useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PartyProvider } from './lib/party';
import { setMusic } from './lib/audio';
import { useSettings } from './lib/settings';
import { Home } from './pages/Home';
import { Legal } from './pages/Legal';
import { Library } from './pages/Library';
import { NotFound } from './pages/NotFound';
import { Play } from './pages/Play';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { RoomShell } from './pages/room/RoomShell';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!pathname.startsWith('/room/')) window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function MusicController() {
  const s = useSettings();
  useEffect(() => {
    setMusic(s.music);
  }, [s.music]);
  return null;
}

/** Hash routing: works on GitHub Pages project sites without server rewrites. */
export default function App() {
  return (
    <HashRouter>
      <PartyProvider>
        <ScrollToTop />
        <MusicController />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="games" element={<Library />} />
            <Route path="play" element={<Play />} />
            <Route path="join/:code" element={<Play />} />
            <Route path="room/:code/*" element={<RoomShell />} />
            <Route path="profile" element={<Profile />} />
            <Route path="settings" element={<Settings />} />
            <Route path="legal" element={<Legal />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </PartyProvider>
    </HashRouter>
  );
}
