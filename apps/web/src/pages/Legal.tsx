/**
 * Legal notes page. The text is copied from docs/LEGAL.md as constants (no runtime fetch, so it works
 * offline and on GitHub Pages); keep the two in step. Not legal advice.
 */
const REPO_ISSUES = 'https://github.com/trazhub/Mini-Games/issues';

export const LEGAL_RULES: readonly string[] = [
  'Mechanics are free, expression is not: every game here uses original art, synthesised sound and original level layouts.',
  'Games use original names. We never use the names or characters of existing commercial games or franchises.',
  'Traditional games (Ludo, Chess, Checkers, Snakes & Ladders and similar) are free to implement; only their branded editions are protected.',
  'Games in the style of well-known franchises, or anything using licensed characters, are held back until reviewed.',
];

export const LEGAL_NOTICE =
  'Mini-Games contains original implementations of game ideas. It is not affiliated with, endorsed by, or sponsored by the makers of any commercial game. All trademarks and product names mentioned anywhere belong to their respective owners and are used only to describe what a game is similar to, if at all.';

export const LEGAL_CREDITS =
  "Sound effects are samples from Kenney's Interface Sounds pack (CC0). Game art was generated with Canva's image generator for this project; avatars are pixel sprites drawn in code.";

export function Legal() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10" data-testid="legal-page">
      <h1 className="text-4xl font-extrabold sm:text-5xl">Legal notes</h1>
      <p className="mt-3 text-mist">These are the project's design rules, not legal advice.</p>

      <section className="panel mt-6 p-6" aria-labelledby="rules">
        <h2 id="rules" className="text-xl font-bold">How games are made</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-mist">
          {LEGAL_RULES.map((r) => <li key={r}>{r}</li>)}
        </ol>
      </section>

      <section className="panel mt-6 p-6" aria-labelledby="notice">
        <h2 id="notice" className="text-xl font-bold">Notice</h2>
        <p className="mt-3 text-mist">{LEGAL_NOTICE}</p>
      </section>

      <section className="panel mt-6 p-6" aria-labelledby="credits">
        <h2 id="credits" className="text-xl font-bold">Credits</h2>
        <p className="mt-3 text-mist">{LEGAL_CREDITS}</p>
      </section>

      <section className="panel mt-6 p-6" aria-labelledby="takedown">
        <h2 id="takedown" className="text-xl font-bold">Something wrong? Tell us</h2>
        <p className="mt-3 text-mist">
          If you believe something here infringes your rights, <a className="font-semibold text-chalk underline" href={REPO_ISSUES} target="_blank" rel="noreferrer noopener">open an issue on GitHub</a> and say what should change. It will be reviewed and dealt with promptly.
        </p>
      </section>
    </div>
  );
}
