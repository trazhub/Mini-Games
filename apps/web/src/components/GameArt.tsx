/** Original cover illustrations for the launch games (SVG, no external assets). */
export function GameArt({ id, className = '' }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 320 200" className={className} role="img" aria-label={`${id} illustration`} preserveAspectRatio="xMidYMid slice">
      {id === 'orbit-swap' && <Orbit />}
      {id === 'echo-steps' && <Echo />}
      {id === 'majority-trap' && <Majority />}
      {!['orbit-swap', 'echo-steps', 'majority-trap'].includes(id) && <rect width="320" height="200" fill="#1e2640" />}
    </svg>
  );
}

function Orbit() {
  return (
    <>
      <rect width="320" height="200" fill="#241b3d" />
      <circle cx="160" cy="100" r="150" fill="#2e2150" opacity=".5" />
      <g fill="none" stroke="#5a4a93" strokeWidth="2">
        <circle cx="160" cy="100" r="34" />
        <circle cx="160" cy="100" r="62" />
        <circle cx="160" cy="100" r="90" />
      </g>
      <circle cx="160" cy="100" r="16" fill="#ffb547" />
      <circle cx="160" cy="100" r="16" fill="url(#og)" />
      <defs>
        <radialGradient id="og" cx="35%" cy="30%">
          <stop offset="0" stopColor="#fff" stopOpacity=".5" />
          <stop offset="1" stopColor="#ff8a3d" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M222 100 A62 62 0 0 0 196 49" stroke="#ff6b5e" strokeWidth="10" strokeLinecap="round" fill="none" opacity=".9" />
      <circle cx="160" cy="38" r="8" fill="#3ddbb0" />
      <circle cx="94" cy="132" r="7" fill="#8b7cff" />
      <circle cx="250" cy="100" r="7" fill="#ff9ed2" />
      <path d="M126 100 l4-9 4 9 9 4-9 4-4 9-4-9-9-4z" fill="#ffe7a3" transform="translate(-8 -10) scale(.9)" />
      <path d="M200 160 l3-7 3 7 7 3-7 3-3 7-3-7-7-3z" fill="#ffe7a3" />
    </>
  );
}

function Echo() {
  const pad = (x: number, y: number, c: string, lit: boolean) => (
    <rect x={x} y={y} width="62" height="62" rx="16" fill={c} opacity={lit ? 1 : 0.28} stroke={c} strokeWidth="3" />
  );
  return (
    <>
      <rect width="320" height="200" fill="#0f2a2c" />
      <circle cx="160" cy="100" r="96" fill="none" stroke="#3ddbb0" strokeWidth="1.5" opacity=".18" />
      <circle cx="160" cy="100" r="70" fill="none" stroke="#3ddbb0" strokeWidth="1.5" opacity=".28" />
      {pad(96, 36, '#3ddbb0', true)}
      {pad(162, 36, '#8b7cff', false)}
      {pad(96, 102, '#ffb547', false)}
      {pad(162, 102, '#ff6b5e', true)}
      <path d="M127 67 L193 133" stroke="#fff" strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" opacity=".8" />
      <circle cx="127" cy="67" r="5" fill="#fff" />
      <path d="M232 52 q14 18 0 36 M246 42 q22 28 0 56" stroke="#3ddbb0" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".6" />
    </>
  );
}

function Majority() {
  const dots = [
    [58, 120],
    [82, 138],
    [108, 118],
    [70, 90],
    [100, 92],
    [130, 136],
    [124, 108],
    [48, 150],
  ];
  return (
    <>
      <rect width="320" height="200" fill="#34171b" />
      <rect x="28" y="26" width="116" height="148" rx="22" fill="#ff6b5e" opacity=".18" />
      <rect x="176" y="26" width="116" height="148" rx="22" fill="#8b7cff" opacity=".18" />
      <text x="86" y="62" textAnchor="middle" fontSize="30" fontWeight="800" fill="#ff6b5e" fontFamily="Bricolage Grotesque Variable, sans-serif">A</text>
      <text x="234" y="62" textAnchor="middle" fontSize="30" fontWeight="800" fill="#a99dff" fontFamily="Bricolage Grotesque Variable, sans-serif">B</text>
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="9" fill="#ff9b91" />
      ))}
      <circle cx="236" cy="124" r="11" fill="#ffe27a" stroke="#ffb547" strokeWidth="3" />
      <path d="M160 104 h16 m-6 -6 l6 6 -6 6" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".7" />
    </>
  );
}
