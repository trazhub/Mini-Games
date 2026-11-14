import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../lib/settings';
import { ArcadeButton, Spark } from './ArcadeButton';

/** Tiny standalone timing toy. No game engine, network, or JS animation loop. */
export function OrbitHero({ code = '', mode = 'create' }: { code?: string; mode?: 'create' | 'join' }) {
  const settings = useSettings();
  const [osReduced, setOsReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reduced = settings.reducedMotion || osReduced;
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [message, setMessage] = useState('A tiny warm-up before the main event.');
  const [round, setRound] = useState(0);
  const runner = useRef<SVGGElement>(null);
  const lastLap = useRef(-1);
  const won = score === 5;

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setOsReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  function play() {
    if (won) {
      setScore(0); setRunning(false); setMessage('Fresh orbit. Fresh start.');
      return;
    }
    if (!running && !reduced) {
      lastLap.current = -1; setRound(n => n + 1); setRunning(true);
      setMessage('Catch when the yellow spark enters the top gate.');
      return;
    }
    const time = Number(runner.current?.getAnimations()[0]?.currentTime ?? 0);
    const lap = Math.floor((time + 450) / 4000);
    const phase = time % 4000;
    if (!reduced && lastLap.current === lap) { setMessage('One spark per orbit. Wait for the next pass!'); return; }
    if (reduced || phase < 450 || phase > 3550) {
      lastLap.current = lap;
      const next = score + 1;
      setScore(next);
      setMessage(next === 5 ? 'Five sparks. You’ve got the touch!' : `Nice catch! ${next} of 5 sparks.`);
      if (next === 5) setRunning(false);
    } else setMessage('Just missed. Catch at the top gate. Try again!');
  }

  return <div className={`orbit-toy ${running && !reduced ? 'toy-running' : ''} ${won ? 'toy-won' : ''}`}>
    <div className="toy-topline"><span><span className="tiny-cross">+</span> A pocket-sized playground</span><span aria-label={`${score} of 5 sparks`}>{String(score).padStart(2, '0')} / 05</span></div>
    <svg className="toy-board" viewBox="0 0 520 365" aria-hidden="true">
      <path d="M17 266 90 310h350l64-44" fill="none" stroke="#202724" strokeWidth="2" />
      <path d="m21 275 70 45h350l63-45v22l-63 45H91l-70-45Z" fill="#202724" />
      <path d="M17 65 89 22h351l64 43v201l-64 44H90l-73-44Z" fill="#dce8d1" stroke="#202724" strokeWidth="2" />
      <path d="M34 75 96 39h337l54 36v180l-54 37H96l-62-37Z" fill="#acc7a8" stroke="#202724" strokeWidth="1.5" />
      <g fill="none" stroke="#202724"><ellipse cx="260" cy="164" rx="180" ry="107" opacity=".35" /><ellipse cx="260" cy="164" rx="145" ry="86" strokeWidth="2" /><ellipse cx="260" cy="164" rx="110" ry="65" opacity=".35" /></g>
      <path d="M205 84q55-20 110 0" fill="none" stroke="#f8cf46" strokeWidth="17" /><path d="m205 74-5 20m120-20 5 20" stroke="#202724" strokeWidth="2" />
      <g className="toy-mascot"><path d="m260 100 19 35 40 6-28 28 7 39-38-18-37 18 7-39-29-28 41-6Z" fill="#f8cf46" stroke="#202724" strokeWidth="2.5" /><ellipse cx="249" cy="153" rx="5" ry="9" fill="#202724" /><ellipse cx="271" cy="153" rx="5" ry="9" fill="#202724" /><path d="M248 174q12 12 24 0" fill="none" stroke="#202724" strokeWidth="3" strokeLinecap="round" /></g>
      <g transform="translate(260 164) scale(1 .593)"><g ref={runner} key={round} className="toy-runner"><g transform="translate(0 -145) scale(1 1.686)"><circle r="13" fill="#fffaf2" stroke="#202724" strokeWidth="3" /><circle r="5" fill="#202724" /></g></g></g>
      <g fill="#ff6858" stroke="#202724" strokeWidth="2"><path d="m88 116 15-9 15 9v24l-15 9-15-9Z" /><path d="m395 220 15-9 15 9v24l-15 9-15-9Z" /></g>
      <path d="M53 213v19m-9-9h18M443 111v19m-9-9h18" stroke="#202724" strokeWidth="2" />
      <g transform="translate(360 34) rotate(8)"><path d="M0 0h109v40H0z" fill="#fffaf2" stroke="#202724" strokeWidth="2" /><text x="54" y="25" textAnchor="middle" fontSize="14" fontWeight="700" fill="#202724">{mode === 'join' && code ? code : 'Try me!'}</text></g>
      <path d="m109 280 42 17h54l-32-17Z" fill="#4b8eff" stroke="#202724" strokeWidth="2" /><path d="m309 280 32 17h54l-42-17Z" fill="#4b8eff" stroke="#202724" strokeWidth="2" />
    </svg>
    <div className="toy-console"><div className="toy-sparks" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <Spark key={i} className={i < score ? 'spark-collected' : ''} />)}</div>
      <ArcadeButton variant="ink" onClick={play}>{won ? 'Play again' : reduced ? 'Collect a spark' : running ? 'Catch the spark' : 'Give it a spin'}<span aria-hidden="true">↗</span></ArcadeButton>
    </div>
    <p className="toy-status" role="status">{message}</p>
    <p className="toy-hint">{reduced ? 'Untimed play · collect five sparks at your own pace' : 'Tap or press Enter on the button · catch five sparks'}</p>
    {running && !reduced && <button className="toy-stop" type="button" onClick={() => { setRunning(false); setMessage('Orbit paused. Spin again whenever you like.'); }}>Stop orbit</button>}
  </div>;
}
