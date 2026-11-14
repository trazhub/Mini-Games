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
    <div className="toy-topline"><span><span className="tiny-cross">▶</span> Warm-up round</span><span aria-label={`${score} of 5 sparks`}>{String(score).padStart(2, '0')} / 05</span></div>
    <svg className="toy-board" viewBox="0 0 520 365" aria-hidden="true">
      <defs>
        <radialGradient id="toy-glow" cx="50%" cy="45%" r="60%"><stop offset="0" stopColor="#1b2a3a" /><stop offset="1" stopColor="#07060b" /></radialGradient>
        <pattern id="toy-scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000" opacity=".28" /></pattern>
      </defs>
      <rect x="8" y="8" width="504" height="349" fill="url(#toy-glow)" stroke="#463e5e" strokeWidth="2" />
      <g stroke="#3fe0d0" strokeOpacity=".08"><path d="M8 62h504M8 116h504M8 170h504M8 224h504M8 278h504M8 332h504" /><path d="M62 8v349M116 8v349M170 8v349M224 8v349M278 8v349M332 8v349M386 8v349M440 8v349" /></g>
      <g fill="none" stroke="#3fe0d0"><ellipse cx="260" cy="164" rx="180" ry="107" opacity=".28" /><ellipse cx="260" cy="164" rx="145" ry="86" strokeWidth="2.5" opacity=".9" /><ellipse cx="260" cy="164" rx="110" ry="65" opacity=".28" /></g>
      <path d="M205 84q55-20 110 0" fill="none" stroke="#ffb12e" strokeWidth="10" strokeLinecap="square" opacity=".9" /><path d="m205 72-5 22m120-22 5 22" stroke="#ffb12e" strokeWidth="2" />
      <g className="toy-mascot"><path d="M252 130h16v26h26v16h-26v26h-16v-26h-26v-16h26Z" fill="#ffb12e" /><path d="M256 146h8v8h8v8h-8v8h-8v-8h-8v-8h8Z" fill="#fff1c9" /></g>
      <g transform="translate(260 164) scale(1 .593)"><g ref={runner} key={round} className="toy-runner"><g transform="translate(0 -145) scale(1 1.686)"><circle r="14" fill="#3fe0d0" opacity=".25" /><circle r="9" fill="#e9fffb" stroke="#3fe0d0" strokeWidth="3" /></g></g></g>
      <g fill="#ff5470"><path d="M94 112h22v22H94Z" /><path d="M402 218h22v22h-22Z" /></g>
      <text x="260" y="334" textAnchor="middle" fontSize="20" fill="#ffb12e" style={{ fontFamily: 'Pixelify Sans Variable, monospace' }}>{mode === 'join' && code ? code : 'FREE PLAY'}</text>
      <rect x="8" y="8" width="504" height="349" fill="url(#toy-scan)" />
    </svg>
    <div className="toy-console"><div className="toy-sparks" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <Spark key={i} className={i < score ? 'spark-collected' : ''} />)}</div>
      <ArcadeButton variant="ink" onClick={play}>{won ? 'Play again' : reduced ? 'Collect a spark' : running ? 'Catch the spark' : 'Give it a spin'}<span aria-hidden="true">↗</span></ArcadeButton>
    </div>
    <p className="toy-status" role="status">{message}</p>
    <p className="toy-hint">{reduced ? 'Untimed play · collect five sparks at your own pace' : 'Tap or press Enter on the button · catch five sparks'}</p>
    {running && !reduced && <button className="toy-stop" type="button" onClick={() => { setRunning(false); setMessage('Orbit paused. Spin again whenever you like.'); }}>Stop orbit</button>}
  </div>;
}
