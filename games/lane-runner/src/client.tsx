import type { ArcadeState, GameClientProps } from '@minigamehub/game-core';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createRunController, keyToDirection, type Direction, type RunController } from './controller';
import { COIN_VALUE, LANES, LOOKAHEAD, ROW_SPACING, TICK_HZ } from './sim';
import backdropUrl from './assets/backdrop.jpg';
import coinUrl from './assets/coin.png';
import obstacleUrl from './assets/obstacle.png';
import runnerUrl from './assets/runner.png';
import type { LaneConfig } from './types';

/** Short "get ready" beat before the course starts moving. */
const READY_MS = 900;
/** Stop the local run this long before the server's submission deadline so the log always arrives. */
const DEADLINE_MARGIN_MS = 1500;
/** Resend the log this often until the server confirms it (covers a dropped socket). */
const RESEND_MS = 3000;
/** Never simulate more than this many ticks in one frame (a stalled tab must not fast-forward). */
const MAX_CATCH_UP = 6;
/** A drag of at least this many CSS pixels is a swipe; anything shorter is a tap. */
const SWIPE_PX = 28;

type Phase = 'waiting' | 'ready' | 'running' | 'over';

interface Hud {
  score: number;
  coins: number;
  alive: boolean;
  /** Current lane 0..2 (also exposed as data-lane so tests and assistive tooling can read it). */
  lane: number;
}

const ACCENT = '#3ee0a0';

/** Perspective: a point `z` world units ahead of the runner sits at this fraction of full size. */
const depthScale = (z: number) => 1 / (1 + z * 0.05);

/**
 * Illustrated sprites (AI-generated art, exported as small PNG/JPG). They load once, lazily; until an image
 * is decoded `draw` falls back to simple shapes so the game is playable immediately.
 */
interface Sprites {
  runner: HTMLImageElement;
  obstacle: HTMLImageElement;
  coin: HTMLImageElement;
  backdrop: HTMLImageElement;
}
let sprites: Sprites | null = null;
function getSprites(): Sprites | null {
  if (sprites) return sprites;
  if (typeof Image === 'undefined') return null;
  const make = (src: string) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    return img;
  };
  sprites = { runner: make(runnerUrl), obstacle: make(obstacleUrl), coin: make(coinUrl), backdrop: make(backdropUrl) };
  return sprites;
}
const ready = (img: HTMLImageElement | undefined): img is HTMLImageElement => !!img && img.complete && img.naturalWidth > 0;

function draw(canvas: HTMLCanvasElement, c: RunController | null, shownLane: number, flash: number, reduced: boolean): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const art = getSprites();
  const dpr = canvas.width / Math.max(1, canvas.clientWidth);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  const horizon = H * 0.2;
  const runnerY = H * 0.84;
  const laneW = W * 0.27;
  const xAt = (lane: number, s: number) => W / 2 + (lane - (LANES - 1) / 2) * laneW * s;
  const yAt = (s: number) => horizon + (runnerY - horizon) * s;

  // Sky and grass, then the illustrated backdrop with its horizon on ours.
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#2a1458');
  sky.addColorStop(1, '#ff8a4d');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon + 1);
  ctx.fillStyle = '#1a1030';
  ctx.fillRect(0, horizon, W, H - horizon);
  if (ready(art?.backdrop)) {
    const bw = W;
    const bh = (art.backdrop.naturalHeight / art.backdrop.naturalWidth) * bw;
    ctx.drawImage(art.backdrop, 0, horizon - bh * 0.5, bw, bh);
  }

  // The road: a trapezoid from the horizon to the bottom edge.
  const sFar = depthScale(LOOKAHEAD);
  const roadFarHalf = (LANES * laneW * sFar) / 2;
  const sBottom = (H - horizon) / (runnerY - horizon); // scale at the bottom edge of the canvas
  const roadNearHalf = (LANES * laneW * sBottom) / 2;
  const road = (grow: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(W / 2 - roadFarHalf * grow, yAt(sFar));
    ctx.lineTo(W / 2 + roadFarHalf * grow, yAt(sFar));
    ctx.lineTo(W / 2 + roadNearHalf * grow, H);
    ctx.lineTo(W / 2 - roadNearHalf * grow, H);
    ctx.closePath();
    ctx.fill();
  };
  road(1.06, '#ff4fa0'); // neon edge
  road(1, '#120d24'); // track

  // Lane dividers, scrolling with the distance so the speed is visible.
  const distance = c?.run.distance ?? 0;
  ctx.strokeStyle = 'rgba(255,177,46,0.9)';
  for (let div = 1; div < LANES; div++) {
    const lane = div - 0.5;
    const phase = reduced ? 0 : distance % (ROW_SPACING * 2);
    for (let z = -6 - phase; z < LOOKAHEAD; z += ROW_SPACING * 2) {
      const z0 = Math.max(-6, z);
      const z1 = Math.min(LOOKAHEAD, z + ROW_SPACING);
      if (z1 <= z0) continue;
      const s0 = depthScale(z0);
      const s1 = depthScale(z1);
      ctx.lineWidth = Math.max(1, 4 * s0);
      ctx.beginPath();
      ctx.moveTo(xAt(lane, s0), yAt(s0));
      ctx.lineTo(xAt(lane, s1), yAt(s1));
      ctx.stroke();
    }
  }

  // Obstacles and coins, farthest first so near ones overlap far ones.
  if (c) {
    const rows = c.run.rows;
    const spin = reduced ? 1 : 0.55 + 0.45 * Math.abs(Math.cos(distance * 0.35));
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i]!;
      const z = row.d - distance;
      if (z < 0 || z > LOOKAHEAD) continue;
      const s = depthScale(z);
      const y = yAt(s);
      for (let lane = 0; lane < LANES; lane++) {
        const x = xAt(lane, s);
        if ((row.mask & (1 << lane)) !== 0) {
          if (ready(art?.obstacle)) {
            const size = laneW * 1.05 * s;
            ctx.drawImage(art.obstacle, x - size / 2, y - size * 0.82, size, size);
          } else {
            const w = laneW * 0.72 * s;
            const h = laneW * 0.55 * s;
            ctx.fillStyle = '#ff6b5e';
            ctx.fillRect(x - w / 2, y - h, w, h);
          }
        } else if (row.coin === lane) {
          const size = laneW * 0.5 * s;
          const cy = y - laneW * 0.28 * s;
          if (ready(art?.coin)) ctx.drawImage(art.coin, x - (size * spin) / 2, cy - size / 2, size * spin, size);
          else {
            ctx.fillStyle = '#ffd34d';
            ctx.beginPath();
            ctx.arc(x, cy, Math.max(2, size / 2), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }

  // The runner: feet on runnerY; faded when the run is over.
  const rx = xAt(shownLane, 1);
  const rh = laneW * 1.15;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(rx, runnerY + 2, laneW * 0.3, laneW * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  const dead = !!c && !c.run.alive;
  if (dead) ctx.globalAlpha = 0.55;
  const bob = reduced || dead ? 0 : Math.sin(distance * 0.9) * laneW * 0.03;
  if (ready(art?.runner)) ctx.drawImage(art.runner, rx - rh / 2, runnerY - rh * 0.93 + bob, rh, rh);
  else {
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.roundRect(rx - laneW * 0.2, runnerY - laneW * 0.55, laneW * 0.4, laneW * 0.55, laneW * 0.1);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (flash > 0 && !reduced) {
    ctx.fillStyle = `rgba(255,107,94,${Math.min(0.45, flash)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

export default function LaneRunnerClient(props: GameClientProps<ArcadeState<LaneConfig>>) {
  const { state, me, spectator, participantIds, sendArcade, serverNow, reportScores, sfx, reducedMotion } = props;
  const [phase, setPhase] = useState<Phase>('waiting');
  const [hud, setHud] = useState<Hud>({ score: 0, coins: 0, alive: true, lane: 1 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<RunController | null>(null);
  const phaseRef = useRef<Phase>('waiting');
  const chunksRef = useRef<ReturnType<RunController['finish']>>([]);
  const shownLaneRef = useRef(1);
  const flashRef = useRef(0);
  /** Latest props for the long-lived loop/timers, which must not capture stale values. */
  const live = useRef({ state, serverNow, sendArcade, sfx, reducedMotion, reportScores, me });
  live.current = { state, serverNow, sendArcade, sfx, reducedMotion, reportScores, me };

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const finishRun = useCallback(() => {
    const c = controllerRef.current;
    if (!c || phaseRef.current === 'over') return;
    chunksRef.current = c.finish();
    setPhaseBoth('over');
    setHud({ score: c.score(), coins: c.run.coins, alive: c.run.alive, lane: c.run.lane });
    live.current.reportScores({ [live.current.me]: c.score() });
    if (!c.run.alive) {
      flashRef.current = 0.5;
      live.current.sfx('bad');
    }
    for (const chunk of chunksRef.current) live.current.sendArcade(chunk);
  }, [setPhaseBoth]);

  const steer = useCallback((dir: Direction) => {
    const c = controllerRef.current;
    if (!c || phaseRef.current !== 'running') return;
    if (c.input(dir)) setHud((h) => (h.lane === c.run.lane ? h : { ...h, lane: c.run.lane }));
  }, []);

  // Create the run as soon as the server's seed is known. The state carries the seed, so a client
  // that joined late (or reconnected) still gets it; `arcade:start` is not needed.
  const seed = state?.seed;
  const config = state?.config;
  useEffect(() => {
    if (spectator || seed === undefined || controllerRef.current) return;
    controllerRef.current = createRunController(seed, config);
    setPhaseBoth('ready');
  }, [seed, config, spectator, setPhaseBoth]);

  // The short get-ready beat. Its own effect so a StrictMode re-run of the one above cannot strand it.
  useEffect(() => {
    if (phase !== 'ready') return;
    const t = setTimeout(() => setPhaseBoth('running'), READY_MS);
    return () => clearTimeout(t);
  }, [phase, setPhaseBoth]);

  // Fixed-step loop + drawing.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudTick = 0;
    let lastCoins = 0;
    const stepMs = 1000 / TICK_HZ;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(now - last, 250);
      last = now;
      const c = controllerRef.current;
      if (c && phaseRef.current === 'running') {
        acc += dt;
        let steps = 0;
        while (acc >= stepMs && steps < MAX_CATCH_UP && !c.done) {
          c.advance();
          acc -= stepMs;
          steps++;
        }
        if (acc > stepMs * MAX_CATCH_UP) acc = 0; // a long stall: drop the backlog instead of fast-forwarding
        if (c.run.coins !== lastCoins) {
          if (c.run.coins > lastCoins) live.current.sfx('good');
          lastCoins = c.run.coins;
        }
        if (++hudTick % 4 === 0 || c.done) {
          setHud({ score: c.score(), coins: c.run.coins, alive: c.run.alive, lane: c.run.lane });
          live.current.reportScores({ [live.current.me]: c.score() });
        }
        const deadline = live.current.state?.deadline;
        const cutOff = deadline !== undefined && deadline > 0 && live.current.serverNow() >= deadline - DEADLINE_MARGIN_MS;
        if (c.done || cutOff) finishRun();
      }
      // Ease the drawn lane toward the real one (snap when reduced motion is on).
      const target = c?.run.lane ?? 1;
      shownLaneRef.current = live.current.reducedMotion ? target : shownLaneRef.current + (target - shownLaneRef.current) * Math.min(1, dt / 70);
      flashRef.current = Math.max(0, flashRef.current - dt / 400);
      const canvas = canvasRef.current;
      if (canvas) draw(canvas, c, shownLaneRef.current, flashRef.current, live.current.reducedMotion);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [finishRun]);

  // Keep the canvas backing store sharp at any size.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(220, Math.floor(wrap.clientWidth));
      const h = Math.floor(w * 1.25);
      canvas.style.height = `${h}px`;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    };
    fit();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    ro?.observe(wrap);
    window.addEventListener('resize', fit);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const dir = keyToDirection(e.key);
      if (!dir) return;
      e.preventDefault();
      steer(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steer]);

  // Touch / mouse: a tap on the left or right half steers that way; a horizontal swipe does too.
  const gesture = useRef<{ id: number; x: number; handled: boolean } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    gesture.current = { id: e.pointerId, x: e.clientX, handled: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId || g.handled) return;
    const dx = e.clientX - g.x;
    if (Math.abs(dx) >= SWIPE_PX) {
      g.handled = true;
      steer(dx < 0 ? 'left' : 'right');
    }
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== e.pointerId || g.handled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    steer(e.clientX < rect.left + rect.width / 2 ? 'left' : 'right');
  };

  // After the run: resend the whole log until the server confirms it (a dropped socket loses chunks).
  const submitted = !!state?.submitted.includes(me);
  useEffect(() => {
    if (phase !== 'over' || submitted) return;
    const id = setInterval(() => {
      const deadline = live.current.state?.deadline ?? 0;
      if (deadline > 0 && live.current.serverNow() >= deadline) return;
      for (const chunk of chunksRef.current) live.current.sendArcade(chunk);
    }, RESEND_MS);
    return () => clearInterval(id);
  }, [phase, submitted]);

  const total = participantIds.length;
  const done = state?.submitted.length ?? 0;
  const style = { '--lane-accent': ACCENT } as CSSProperties;

  return (
    <div className="mx-auto w-full max-w-[520px]" style={style} data-testid="lane-runner" data-lane={hud.lane} data-phase={phase}>
      <div className="mb-2 flex items-end justify-between px-1" aria-hidden={phase === 'waiting'}>
        <div>
          <p className="text-xs uppercase tracking-wide text-mist">Score</p>
          <p className="font-display text-3xl font-extrabold tabular-nums" data-testid="lane-score">{hud.score}</p>
        </div>
        <p className="text-sm text-mist"><span aria-hidden="true">● </span>{hud.coins} coin{hud.coins === 1 ? '' : 's'} <span className="opacity-70">(+{COIN_VALUE} each)</span></p>
      </div>

      <div
        ref={wrapRef}
        className="relative select-none overflow-hidden rounded-2xl ring-1 ring-edge"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (gesture.current = null)}
      >
        <canvas ref={canvasRef} className="block w-full" role="img" aria-label="Lane Runner track: three lanes with obstacles and coins" data-testid="lane-canvas" />
        {phase !== 'running' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 p-4 text-center" role="status">
            {spectator && <p className="text-lg font-bold">Watching: {done} of {total} runs in</p>}
            {!spectator && phase === 'waiting' && <p className="text-lg font-bold">Getting the course…</p>}
            {!spectator && phase === 'ready' && <p className="font-display text-4xl font-extrabold">Get ready</p>}
            {!spectator && phase === 'over' && (
              <>
                <p className="text-sm uppercase tracking-wide text-mist">{hud.alive ? 'Time!' : 'Run over'}</p>
                <p className="font-display text-5xl font-extrabold tabular-nums">{hud.score}</p>
                <p className="text-sm text-mist">{submitted ? `Verified. Waiting for the others (${done}/${total})…` : 'Sending your run to the server…'}</p>
              </>
            )}
          </div>
        )}
      </div>

      {!spectator && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(['left', 'right'] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              className="btn btn-soft min-h-14 text-lg"
              aria-label={`Move ${dir}`}
              disabled={phase !== 'running'}
              onPointerDown={() => steer(dir)}
              // Keyboard activation (Enter/Space) has no pointer-down: its click has detail 0.
              onClick={(e) => {
                if (e.detail === 0) steer(dir);
              }}
            >
              {dir === 'left' ? '◀ Left' : 'Right ▶'}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-center text-xs text-mist">Arrow keys or A/D on a keyboard. Tap or swipe on a phone.</p>
    </div>
  );
}
