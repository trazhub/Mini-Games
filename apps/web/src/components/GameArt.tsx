/**
 * Poster art. Games with an illustrated poster in `src/assets/art/<id>.jpg` show that image (bundled and
 * hashed by Vite, lazy-decoded); games without one fall back to the original SVG illustrations below.
 */
const posters = import.meta.glob('../assets/art/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const posterFor = (id: string): string | undefined => posters[`../assets/art/${id}.jpg`];

export function GameArt({ id, className = '' }: { id: string; className?: string }) {
  const names: Record<string, string> = { 'majority-trap': 'Majority Trap: a conspiring crowd and one odd vote', 'echo-steps': 'Echo Steps: four rhythm pads in a repeating sequence', 'orbit-swap': 'Orbit Swap: a pilot, three orbital lanes and collectible stars', 'lane-runner': 'Lane Runner: a runner on a three-lane track dodging blocks and grabbing coins' };
  const poster = posterFor(id);
  if (poster) return <img src={poster} alt={names[id] ?? 'Game artwork'} width={960} height={720} loading="lazy" decoding="async" className={`game-art art-${id} art-poster ${className}`} />;
  return <svg viewBox="0 0 480 350" className={`game-art art-${id} ${className}`} role="img" aria-label={names[id] ?? 'Game artwork'} preserveAspectRatio="xMidYMid slice">
    {id === 'majority-trap' && <Majority />}{id === 'echo-steps' && <Echo />}{id === 'orbit-swap' && <Orbit />}{id === 'lane-runner' && <Lanes />}
  </svg>;
}

function Face({ x, y, fill, rotate = 0, square = false }: { x: number; y: number; fill: string; rotate?: number; square?: boolean }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
    {square ? <rect x="-35" y="-36" width="70" height="72" rx="13" fill={fill} stroke="#202724" strokeWidth="3" /> : <path d="M-37 24v-35a37 37 0 0 1 74 0v35L25 17 12 29 0 18-12 29-24 18Z" fill={fill} stroke="#202724" strokeWidth="3" />}
    <ellipse cx="-11" cy="-7" rx="7" ry="10" fill="#fffaf2" /><ellipse cx="11" cy="-7" rx="7" ry="10" fill="#fffaf2" /><circle cx="-8" cy="-5" r="3.5" fill="#202724" /><circle cx="14" cy="-5" r="3.5" fill="#202724" /><path d="M-8 12q9 9 18-1" fill="none" stroke="#202724" strokeWidth="3" strokeLinecap="round" />
  </g>;
}

function Majority() {
  return <><path fill="#ff6858" d="M0 0h480v350H0z" /><path d="M0 50h480M0 300h480" stroke="#202724" strokeWidth="1.5" opacity=".18" />
    <text x="28" y="149" fill="#202724" fontSize="170" fontWeight="800" fontFamily="Bricolage Grotesque Variable, sans-serif" transform="rotate(-10 90 90)">A</text>
    <text x="320" y="301" fill="#fff0d5" fontSize="185" fontWeight="800" fontFamily="Bricolage Grotesque Variable, sans-serif" transform="rotate(10 380 230)">B</text>
    <path d="m195 0-25 62 43 25-34 58 51 31-21 61 44 29-13 84" fill="none" stroke="#202724" strokeWidth="2.5" strokeDasharray="7 7" />
    <g className="preview-crowd"><Face x={99} y={244} fill="#f8cf46" rotate={-12} /><Face x={172} y={262} fill="#fffaf2" rotate={8} /><Face x={161} y={186} fill="#f8cf46" rotate={14} /></g>
    <g className="preview-outsider"><Face x={325} y={124} fill="#68ddb1" rotate={-12} square /><path d="m366 71 12-19m-1 36 22-3" fill="none" stroke="#202724" strokeWidth="3" strokeLinecap="round" /></g><path d="m254 196 29 5-14 24" fill="none" stroke="#202724" strokeWidth="4" />
  </>;
}

function Echo() {
  return <><path fill="#68ddb1" d="M0 0h480v350H0z" />
    <g stroke="#202724" fill="none" opacity=".13"><path d="M0 70h480M0 140h480M0 210h480M0 280h480M80 0v350M160 0v350M240 0v350M320 0v350M400 0v350" /></g>
    <g transform="translate(240 165) rotate(-12)">
      <g className="preview-pad pad-one"><path d="m0-124 62 62L0 0l-62-62Z" fill="#202724" /><path d="m-8-79 9-10v42" fill="none" stroke="#f8cf46" strokeWidth="6" /></g>
      <g className="preview-pad pad-two"><path d="m71-53 62 62-62 62L9 9Z" fill="#fffaf2" stroke="#202724" strokeWidth="2.5" /><text x="71" y="22" textAnchor="middle" fontSize="39" fontWeight="800" fill="#202724">2</text></g>
      <g className="preview-pad pad-three"><path d="m0 18 62 62L0 142l-62-62Z" fill="#f8cf46" stroke="#202724" strokeWidth="2.5" /><text x="0" y="94" textAnchor="middle" fontSize="39" fontWeight="800" fill="#202724">3</text></g>
      <g className="preview-pad pad-four"><path d="m-71-53 62 62-62 62-62-62Z" fill="#32856a" stroke="#202724" strokeWidth="2.5" /><text x="-71" y="22" textAnchor="middle" fontSize="39" fontWeight="800" fill="#fffaf2">4</text></g>
    </g><path d="M49 127v49m-12-38v27m24-41v53M425 151v49m-12-38v27m24-41v53" stroke="#202724" strokeWidth="4" strokeLinecap="round" />
    <g fill="#202724"><circle cx="201" cy="327" r="4" /><circle cx="226" cy="327" r="4" /><circle cx="251" cy="327" r="4" /><circle cx="276" cy="327" r="4" /></g>
  </>;
}

function Lanes() {
  return <><path fill="#3ee0a0" d="M0 0h480v350H0z" /><path fill="#16302a" d="M205 0h70l140 350H65Z" stroke="#202724" strokeWidth="3" />
    <g stroke="#fffaf2" strokeWidth="3" strokeDasharray="16 14" opacity=".7"><path d="M228 0 150 350M252 0l78 350" /></g>
    <g className="preview-stars"><circle cx="262" cy="92" r="9" fill="#f8cf46" stroke="#202724" strokeWidth="2.5" /><circle cx="305" cy="198" r="15" fill="#f8cf46" stroke="#202724" strokeWidth="3" /></g>
    <rect x="172" y="132" width="46" height="34" rx="4" fill="#ff6858" stroke="#202724" strokeWidth="3" /><rect x="140" y="226" width="70" height="52" rx="6" fill="#ff6858" stroke="#202724" strokeWidth="3" />
    <g className="preview-pilot"><ellipse cx="240" cy="326" rx="36" ry="9" fill="#202724" opacity=".3" /><rect x="212" y="262" width="56" height="62" rx="16" fill="#fffaf2" stroke="#202724" strokeWidth="3.5" /><rect x="224" y="278" width="32" height="12" rx="3" fill="#202724" /></g>
    <path d="m396 40 8 18 20 3-15 13 4 20-17-10-17 10 4-20-15-13 20-3Z" fill="#f8cf46" stroke="#202724" strokeWidth="3" />
  </>;
}

function Orbit() {
  return <><path fill="#4b8eff" d="M0 0h480v350H0z" />
    <g transform="translate(247 181) rotate(-25)"><g fill="none" stroke="#202724" strokeWidth="2" opacity=".55"><ellipse rx="193" ry="89" /><ellipse rx="145" ry="67" /><ellipse rx="97" ry="45" /></g><path d="M-173-39A193 89 0 0 1-82-81" stroke="#ff6858" strokeWidth="15" fill="none" strokeLinecap="round" />
      <g className="preview-pilot"><circle cx="146" cy="0" r="20" fill="#fffaf2" stroke="#202724" strokeWidth="3" /><path d="m139-6 15 6-15 6Z" fill="#202724" /><path d="M113-6h-18m17 12H92" stroke="#fffaf2" strokeWidth="3" /></g></g>
    <path d="m246 104 21 48 52 5-39 34 12 51-46-27-45 27 11-51-39-34 52-5Z" fill="#f8cf46" stroke="#202724" strokeWidth="3" /><ellipse cx="234" cy="173" rx="5" ry="8" fill="#202724" /><ellipse cx="257" cy="173" rx="5" ry="8" fill="#202724" /><path d="M235 192q10 8 20-1" stroke="#202724" strokeWidth="3" fill="none" />
    <g className="preview-stars" fill="#fffaf2"><path d="m86 65 5 12 13 2-10 9 3 13-11-7-12 7 3-13-10-9 14-2Z" /><path d="m393 257 5 12 13 2-10 9 3 13-11-7-12 7 3-13-10-9 14-2Z" /></g><g stroke="#202724" strokeWidth="2"><path d="M384 47v19m-9-9h19M85 278v19m-9-9h19" /></g>
  </>;
}
