import { useId, type ReactNode } from 'react';
import { GAMES } from '../games/registry';
import { sfx, setMusic, unlockAudio } from '../lib/audio';
import { updateSettings, useSettings } from '../lib/settings';

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div>
        <label htmlFor={id} className="font-semibold">{label}</label>
        <p id={`${id}-d`} className="text-sm text-mist">{hint}</p>
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} aria-describedby={`${id}-d`} onClick={() => onChange(!checked)} className={`relative h-8 w-14 shrink-0 rounded-full transition ${checked ? 'bg-pulse' : 'bg-hull ring-1 ring-edge'}`}>
        <span className={`absolute top-1 size-6 rounded-full bg-white transition-all ${checked ? 'left-7' : 'left-1'}`} />
      </button>
    </div>
  );
}

export function Settings() {
  const s = useSettings();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-4xl font-extrabold sm:text-5xl">Settings</h1>
      <section className="panel mt-6 divide-y divide-edge/60 px-6" aria-labelledby="audio">
        <h2 id="audio" className="py-4 text-xl font-bold">Sound and motion</h2>
        <Toggle label="Sound effects" hint="Short sounds for taps, results and countdowns." checked={s.sound} onChange={(v) => { updateSettings({ sound: v }); unlockAudio(); if (v) setTimeout(() => sfx('good'), 30); }} />
        <Toggle label="Background music" hint="A quiet generated loop while you play. Off by default." checked={s.music} onChange={(v) => { updateSettings({ music: v }); unlockAudio(); setMusic(v); }} />
        <Toggle label="Reduce motion" hint="Stops decorative animation and screen shake. Your system setting is respected too." checked={s.reducedMotion} onChange={(v) => updateSettings({ reducedMotion: v })} />
      </section>

      <section className="mt-8" aria-labelledby="controls">
        <h2 id="controls" className="text-2xl font-bold">Controls</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {GAMES.map((g) => (
            <div key={g.meta.id} className="panel p-5">
              <h3 className="text-lg font-bold" style={{ color: g.meta.accent }}>{g.meta.name}</h3>
              <h4 className="mt-3 text-sm font-semibold">Keyboard</h4>
              <ul className="mt-1 space-y-1 text-sm text-mist">{g.meta.controls.keyboard.map((c) => <li key={c}>{c}</li>)}</ul>
              <h4 className="mt-3 text-sm font-semibold">Touch</h4>
              <ul className="mt-1 space-y-1 text-sm text-mist">{g.meta.controls.touch.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="help">
        <h2 id="help" className="text-2xl font-bold">Help</h2>
        <div className="mt-4 space-y-3">
          <Faq q="How do I invite friends?">Create a room, then copy the invite link or share the 5-letter code. They open the link or type the code on the Join tab.</Faq>
          <Faq q="Do I need an account?">No. You get a temporary guest session. Closing the tab ends it; reloading the page keeps it.</Faq>
          <Faq q="I lost connection during a game.">The game keeps running for everyone. Your tab reconnects automatically for up to a minute and puts you back in the same match.</Faq>
          <Faq q="Why can't I start the game?">The host needs enough connected players for that game and everyone else must be ready. The Start button says what is missing.</Faq>
          <Faq q="Can I play on my phone?">Yes. All three launch games have touch controls. Landscape works best for Orbit Swap.</Faq>
        </div>
      </section>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="panel group px-5 py-4">
      <summary className="cursor-pointer list-none font-semibold marker:hidden">{q}</summary>
      <p className="mt-2 text-[0.95rem] text-mist">{children}</p>
    </details>
  );
}
